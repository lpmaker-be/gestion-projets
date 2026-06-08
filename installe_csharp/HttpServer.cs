using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;

namespace GP;

public class HttpServer(string baseDir, int port)
{
    private readonly HttpListener _listener = new();
    private readonly DataManager  _data = new(baseDir);
    private bool _running;

    private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"]="text/html; charset=utf-8",[".css"]="text/css; charset=utf-8",
        [".js"]="application/javascript; charset=utf-8",[".json"]="application/json; charset=utf-8",
        [".svg"]="image/svg+xml",[".png"]="image/png",[".jpg"]="image/jpeg",[".jpeg"]="image/jpeg",
        [".gif"]="image/gif",[".webp"]="image/webp",[".pdf"]="application/pdf",
        [".stl"]="application/octet-stream",[".gcode"]="text/plain",
    };

    private static readonly Dictionary<string, string> StaticFiles = new()
    {
        ["/"]="index.html",["/index.html"]="index.html",["/styles.css"]="styles.css",
        ["/app.js"]="app.js",["/aide.html"]="aide.html",["/presentation"]="presentation.html",
        ["/presentation.html"]="presentation.html",["/sw.js"]="sw.js",
        ["/favicon.svg"]="favicon.svg",["/morphdom.min.js"]="morphdom.min.js",
    };

    public void Start()
    {
        _listener.Prefixes.Add($"http://localhost:{port}/");
        _listener.Start();
        _running = true;
    }

    public void Stop() { _running = false; _listener.Stop(); }

    public async Task RunAsync()
    {
        while (_running)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener.GetContextAsync(); }
            catch { break; }
            _ = Task.Run(() => HandleRequest(ctx));
        }
    }

    private void HandleRequest(HttpListenerContext ctx)
    {
        var req = ctx.Request; var resp = ctx.Response;
        try
        {
            resp.AddHeader("Access-Control-Allow-Origin",  "*");
            resp.AddHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
            resp.AddHeader("Access-Control-Allow-Headers", "Content-Type");
            if (req.HttpMethod == "OPTIONS") { resp.StatusCode = 200; resp.Close(); return; }
            var path = req.Url!.AbsolutePath;
            if      (req.HttpMethod == "GET"  || req.HttpMethod == "HEAD") HandleGet(ctx, path);
            else if (req.HttpMethod == "POST")   HandlePost(ctx, path);
            else if (req.HttpMethod == "DELETE") HandleDelete(ctx, path);
            else { resp.StatusCode = 405; resp.Close(); }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Erreur {req.Url}: {ex.Message}");
            try { ctx.Response.StatusCode = 500; ctx.Response.Close(); } catch { }
        }
    }

    private void HandleGet(HttpListenerContext ctx, string path)
    {
        var resp  = ctx.Response;
        var query = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url!.Query);
        if (StaticFiles.TryGetValue(path, out var fileName)) { ServeFile(resp, Path.Combine(baseDir, fileName)); return; }
        switch (path)
        {
            case "/api/data": SendJson(resp, _data.LoadData()); break;
            case "/api/archives":
                var archives = Directory.EnumerateFiles(_data.ArchiveDir, "*.zip").OrderBy(f => f)
                    .Select(f => new { name = Path.GetFileNameWithoutExtension(f), file = Path.GetFileName(f),
                        size = new FileInfo(f).Length, date = new FileInfo(f).LastWriteTime.ToString("dd/MM/yyyy HH:mm") });
                SendJson(resp, new { archives }); break;
            case "/api/history": SendJson(resp, _data.LoadHistory()); break;
            case "/api/tuto":    SendJson(resp, new { done = _data.GetTutoDone() }); break;
            case "/api/settings":
                var key = query["key"]; var settings = _data.LoadSettings();
                if (key != null) SendJson(resp, new { value = settings.TryGetValue(key, out var v) ? v : "" });
                else SendJson(resp, settings); break;
            case string p when p.StartsWith("/api/files/list"): ServeFilesList(ctx, query); break;
            case string p when p.StartsWith("/api/files/get"):  ServeFileContent(ctx, query); break;
            case string p when p.StartsWith("/api/restore"):
                var idx = int.TryParse(query["idx"], out var i) ? i : 0;
                var history = _data.LoadHistory();
                if (idx >= 0 && idx < history.Count) { var snap = history[idx]; _data.SaveData(JsonSerializer.Deserialize<AppData>(snap.GetProperty("data").GetRawText(), JsonOptions.Default)!); SendJson(resp, new { ok = true }); }
                else SendJson(resp, new { ok = false }, 404); break;
            default: resp.StatusCode = 404; resp.Close(); break;
        }
    }

    private void HandlePost(HttpListenerContext ctx, string path)
    {
        var resp = ctx.Response;
        switch (path)
        {
            case "/api/projects":
                var proj = ReadJson(ctx.Request); var data = _data.LoadData();
                var projId = proj.TryGetProperty("id", out var pid) ? pid.GetString() : null;
                var ei = data.Projects.FindIndex(p => p.TryGetProperty("id", out var id) && id.GetString() == projId);
                if (ei >= 0) data.Projects[ei] = proj; else { data.Projects.Add(proj); if (projId != null && !data.Tasks.ContainsKey(projId)) data.Tasks[projId] = []; }
                _data.SaveData(data); SendJson(resp, new { ok = true }); break;
            case "/api/tasks":
                var body = ReadJson(ctx.Request);
                var tpid = body.TryGetProperty("projectId", out var tp) ? tp.GetString() : null;
                var task = body.TryGetProperty("task", out var t) ? t : default;
                if (tpid != null && task.ValueKind != JsonValueKind.Undefined) {
                    var d2 = _data.LoadData(); if (!d2.Tasks.ContainsKey(tpid)) d2.Tasks[tpid] = [];
                    var tid = task.TryGetProperty("id", out var tidEl) ? tidEl.GetString() : null;
                    var ti = d2.Tasks[tpid].FindIndex(x => x.TryGetProperty("id", out var xi) && xi.GetString() == tid);
                    if (ti >= 0) d2.Tasks[tpid][ti] = task; else d2.Tasks[tpid].Add(task);
                    _data.SaveData(d2); SendJson(resp, new { ok = true });
                } else SendJson(resp, new { error = "missing" }, 400); break;
            case "/api/tasks/reorder":
                var rb = ReadJson(ctx.Request); var rpid = rb.TryGetProperty("projectId", out var rp) ? rp.GetString() : null;
                if (rpid != null && rb.TryGetProperty("tasks", out var rt)) {
                    var pdir = _data.FindProjDir(rpid);
                    if (pdir != null) File.WriteAllText(Path.Combine(pdir, "taches.json"), JsonSerializer.Serialize(rt.EnumerateArray().Select(e => e.Clone()).ToList(), JsonOptions.Default), Encoding.UTF8);
                    SendJson(resp, new { ok = true });
                } else SendJson(resp, new { error = "missing" }, 400); break;
            case "/api/projects/reorder":
                var rrb = ReadJson(ctx.Request); var ids = rrb.TryGetProperty("ids", out var idsEl) ? idsEl.EnumerateArray().Select(e => e.GetString()).ToList() : [];
                var d4 = _data.LoadData(); var pmap = d4.Projects.ToDictionary(p => p.TryGetProperty("id", out var id) ? id.GetString() ?? "" : "", p => p);
                d4.Projects = ids.Where(id => id != null && pmap.ContainsKey(id!)).Select(id => pmap[id!]).ToList();
                _data.SaveData(d4); SendJson(resp, new { ok = true }); break;
            case "/api/archive": ArchiveProject(ctx); break;
            case "/api/unarchive": UnarchiveProject(ctx); break;
            case "/api/delete-archive": DeleteArchive(ctx); break;
            case "/api/files/upload": UploadFile(ctx); break;
            case "/api/files/delete": DeleteFile(ctx); break;
            case "/api/tuto":
                var tb = ReadJson(ctx.Request); var action = tb.TryGetProperty("action", out var ta) ? ta.GetString() : null;
                if (action == "done") _data.SetTutoDone(); else if (action == "reset") _data.ResetTuto();
                SendJson(resp, new { ok = true }); break;
            case "/api/settings":
                var sb = ReadJson(ctx.Request); var sKey = sb.TryGetProperty("key", out var sk) ? sk.GetString() : null; var sVal = sb.TryGetProperty("value", out var sv) ? sv.GetString() : null;
                if (sKey != null) { var s = _data.LoadSettings(); if (!string.IsNullOrEmpty(sVal)) s[sKey] = sVal; else s.Remove(sKey); _data.SaveSettings(s); }
                SendJson(resp, new { ok = true }); break;
            default: SendJson(resp, new { error = "not found" }, 404); break;
        }
    }

    private void HandleDelete(HttpListenerContext ctx, string path)
    {
        var resp  = ctx.Response;
        var query = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url!.Query);
        switch (path)
        {
            case "/api/projects":
                var pid = query["id"];
                if (pid != null) { var pdir = _data.FindProjDir(pid); if (pdir != null && Directory.Exists(pdir)) Directory.Delete(pdir, true); var d = _data.LoadData(); d.Projects.RemoveAll(p => p.TryGetProperty("id", out var id) && id.GetString() == pid); d.Tasks.Remove(pid); _data.SaveData(d); SendJson(resp, new { ok = true }); }
                else SendJson(resp, new { error = "missing id" }, 400); break;
            case "/api/tasks":
                var tpid = query["projectId"]; var tid = query["taskId"];
                if (tpid != null && tid != null) { var d2 = _data.LoadData(); if (d2.Tasks.TryGetValue(tpid, out var tasks)) d2.Tasks[tpid] = tasks.Where(t => !(t.TryGetProperty("id", out var ti) && ti.GetString() == tid)).ToList(); _data.SaveData(d2); SendJson(resp, new { ok = true }); }
                else SendJson(resp, new { error = "missing" }, 400); break;
            default: SendJson(resp, new { error = "not found" }, 404); break;
        }
    }

    private void ServeFilesList(HttpListenerContext ctx, System.Collections.Specialized.NameValueCollection q)
    {
        var projId = q["projId"]; var subdir = q["dir"] ?? "images";
        if (projId == null) { SendJson(ctx.Response, new { error = "projId manquant" }, 400); return; }
        var pdir = _data.FindProjDir(projId);
        if (pdir == null) { SendJson(ctx.Response, new { files = Array.Empty<object>() }); return; }
        var target = Path.Combine(pdir, subdir); Directory.CreateDirectory(target);
        var files = Directory.EnumerateFiles(target).OrderBy(f => f).Select(f => new { name = Path.GetFileName(f), size = new FileInfo(f).Length, url = $"/api/files/get?projId={projId}&dir={subdir}&file={Path.GetFileName(f)}" });
        SendJson(ctx.Response, new { files });
    }

    private void ServeFileContent(HttpListenerContext ctx, System.Collections.Specialized.NameValueCollection q)
    {
        var projId = q["projId"]; var subdir = q["dir"]; var fname = q["file"];
        var pdir = _data.FindProjDir(projId ?? "");
        if (pdir == null || subdir == null || fname == null) { ctx.Response.StatusCode = 404; ctx.Response.Close(); return; }
        var fpath = Path.Combine(pdir, subdir, fname);
        if (!File.Exists(fpath)) { ctx.Response.StatusCode = 404; ctx.Response.Close(); return; }
        var bytes = File.ReadAllBytes(fpath);
        ctx.Response.ContentType = MimeTypes.TryGetValue(Path.GetExtension(fname).ToLower(), out var m) ? m : "application/octet-stream";
        ctx.Response.ContentLength64 = bytes.Length;
        ctx.Response.AddHeader("Content-Disposition", $"inline; filename=\"{fname}\"");
        ctx.Response.OutputStream.Write(bytes); ctx.Response.Close();
    }

    private void UploadFile(HttpListenerContext ctx)
    {
        var query  = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url!.Query);
        var projId = query["projId"];
        if (projId == null) { SendJson(ctx.Response, new { error = "projId manquant" }, 400); return; }
        var pdir = _data.FindProjDir(projId);
        if (pdir == null) { SendJson(ctx.Response, new { error = "Projet introuvable" }, 404); return; }
        var extMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
            [".stl"]="stl",[".obj"]="stl",[".3mf"]="stl",[".step"]="stl",[".stp"]="stl",
            [".gcode"]="cura",[".curaproject"]="cura",[".cura"]="cura",
            [".pdf"]="docs",[".txt"]="docs",[".doc"]="docs",[".docx"]="docs",[".xlsx"]="docs",[".ino"]="docs",[".py"]="docs",
            [".jpg"]="images",[".jpeg"]="images",[".png"]="images",[".gif"]="images",[".webp"]="images",[".svg"]="images",
        };
        var ct = ctx.Request.ContentType ?? "";
        var boundary = ct.Split(';').Select(p => p.Trim()).FirstOrDefault(p => p.StartsWith("boundary="))?.Substring(9)?.Trim('"');
        if (boundary == null) { SendJson(ctx.Response, new { error = "Pas de boundary" }, 400); return; }
        using var ms = new MemoryStream(); ctx.Request.InputStream.CopyTo(ms);
        var body = ms.ToArray(); var bnd = Encoding.ASCII.GetBytes("--" + boundary); var saved = new List<object>();
        foreach (var part in SplitBytes(body, bnd).Skip(1))
        {
            var sep = IndexOf(part, new byte[]{13,10,13,10}); if (sep < 0) continue;
            var hdr = Encoding.UTF8.GetString(part, 0, sep); var content = part[(sep+4)..];
            if (content.Length >= 2 && content[^2]==13 && content[^1]==10) content = content[..^2];
            var fn = System.Text.RegularExpressions.Regex.Match(hdr, @"filename=""([^""]+)""");
            if (!fn.Success) continue;
            var fname = fn.Groups[1].Value; var ext = Path.GetExtension(fname).ToLower();
            var autoDir = extMap.TryGetValue(ext, out var d) ? d : "docs";
            var target = Path.Combine(pdir, autoDir); Directory.CreateDirectory(target);
            File.WriteAllBytes(Path.Combine(target, fname), content);
            saved.Add(new { name = fname, size = content.Length, url = $"/api/files/get?projId={projId}&dir={autoDir}&file={fname}" });
        }
        SendJson(ctx.Response, new { ok = true, files = saved });
    }

    private void DeleteFile(HttpListenerContext ctx)
    {
        var q = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url!.Query);
        var pdir = _data.FindProjDir(q["projId"] ?? "");
        var fpath = pdir != null && q["dir"] != null && q["file"] != null ? Path.Combine(pdir, q["dir"]!, q["file"]!) : null;
        if (fpath != null && File.Exists(fpath)) { File.Delete(fpath); SendJson(ctx.Response, new { ok = true }); }
        else SendJson(ctx.Response, new { error = "Fichier introuvable" }, 404);
    }

    private void ArchiveProject(HttpListenerContext ctx)
    {
        var projId = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url!.Query)["projId"];
        if (projId == null) { SendJson(ctx.Response, new { error = "projId manquant" }, 400); return; }
        var pdir = _data.FindProjDir(projId);
        if (pdir == null) { SendJson(ctx.Response, new { error = "Projet introuvable" }, 404); return; }
        Directory.CreateDirectory(_data.ArchiveDir);
        var zipPath = Path.Combine(_data.ArchiveDir, Path.GetFileName(pdir) + ".zip");
        ZipFile.CreateFromDirectory(pdir, zipPath);
        var data = _data.LoadData();
        for (var i = 0; i < data.Projects.Count; i++) { if (data.Projects[i].TryGetProperty("id", out var id) && id.GetString() == projId) { var dict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(data.Projects[i].GetRawText())!; dict["archived"] = JsonDocument.Parse("true").RootElement; data.Projects[i] = JsonDocument.Parse(JsonSerializer.Serialize(dict)).RootElement.Clone(); break; } }
        _data.SaveData(data); Directory.Delete(pdir, true);
        SendJson(ctx.Response, new { ok = true, zip = Path.GetFileName(zipPath), size = new FileInfo(zipPath).Length });
    }

    private void UnarchiveProject(HttpListenerContext ctx)
    {
        var projId = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url!.Query)["projId"];
        if (projId == null) { SendJson(ctx.Response, new { error = "projId manquant" }, 400); return; }
        var data = _data.LoadData();
        var proj = data.Projects.FirstOrDefault(p => p.TryGetProperty("id", out var id) && id.GetString() == projId);
        if (proj.ValueKind == JsonValueKind.Undefined) { SendJson(ctx.Response, new { error = "Projet introuvable" }, 404); return; }
        var zipPath = Path.Combine(_data.ArchiveDir, DataManager.ProjDirName(proj) + ".zip");
        if (File.Exists(zipPath)) { ZipFile.ExtractToDirectory(zipPath, _data.DataDir, true); File.Delete(zipPath); }
        for (var i = 0; i < data.Projects.Count; i++) { if (data.Projects[i].TryGetProperty("id", out var id) && id.GetString() == projId) { var dict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(data.Projects[i].GetRawText())!; dict["archived"] = JsonDocument.Parse("false").RootElement; data.Projects[i] = JsonDocument.Parse(JsonSerializer.Serialize(dict)).RootElement.Clone(); break; } }
        _data.SaveData(data); SendJson(ctx.Response, new { ok = true });
    }

    private void DeleteArchive(HttpListenerContext ctx)
    {
        var projId = System.Web.HttpUtility.ParseQueryString(ctx.Request.Url!.Query)["projId"];
        if (projId == null) { SendJson(ctx.Response, new { error = "projId manquant" }, 400); return; }
        var data = _data.LoadData();
        var proj = data.Projects.FirstOrDefault(p => p.TryGetProperty("id", out var id) && id.GetString() == projId);
        if (proj.ValueKind != JsonValueKind.Undefined) { var zipPath = Path.Combine(_data.ArchiveDir, DataManager.ProjDirName(proj) + ".zip"); if (File.Exists(zipPath)) File.Delete(zipPath); }
        data.Projects.RemoveAll(p => p.TryGetProperty("id", out var id) && id.GetString() == projId);
        data.Tasks.Remove(projId); _data.SaveData(data); SendJson(ctx.Response, new { ok = true });
    }

    private static void SendJson(HttpListenerResponse resp, object data, int code = 200)
    {
        var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data, JsonOptions.Default));
        resp.StatusCode = code; resp.ContentType = "application/json; charset=utf-8";
        resp.ContentLength64 = bytes.Length; resp.OutputStream.Write(bytes); resp.Close();
    }

    private static JsonElement ReadJson(HttpListenerRequest req)
    {
        using var r = new StreamReader(req.InputStream, Encoding.UTF8);
        return JsonDocument.Parse(r.ReadToEnd()).RootElement.Clone();
    }

    private static void ServeFile(HttpListenerResponse resp, string filePath)
    {
        if (!File.Exists(filePath)) { resp.StatusCode = 404; resp.Close(); return; }
        var bytes = File.ReadAllBytes(filePath);
        resp.ContentType = MimeTypes.TryGetValue(Path.GetExtension(filePath).ToLower(), out var m) ? m : "application/octet-stream";
        resp.ContentLength64 = bytes.Length; resp.AddHeader("Cache-Control", "no-cache");
        resp.OutputStream.Write(bytes); resp.Close();
    }

    private static List<byte[]> SplitBytes(byte[] data, byte[] delimiter)
    {
        var result = new List<byte[]>(); var start = 0;
        for (var i = 0; i <= data.Length - delimiter.Length; i++) {
            if (!data.Skip(i).Take(delimiter.Length).SequenceEqual(delimiter)) continue;
            result.Add(data[start..i]); start = i + delimiter.Length;
            if (start < data.Length && data[start] == 13) start += 2;
        }
        result.Add(data[start..]); return result;
    }

    private static int IndexOf(byte[] data, byte[] pattern)
    {
        for (var i = 0; i <= data.Length - pattern.Length; i++)
            if (data.Skip(i).Take(pattern.Length).SequenceEqual(pattern)) return i;
        return -1;
    }
}
