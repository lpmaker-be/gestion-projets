using System.IO.Compression;
using System.Text.Json;

namespace GP;

public class DataManager(string baseDir)
{
    public string BaseDir    { get; } = baseDir;
    public string DataDir    { get; } = Path.Combine(baseDir, "data");
    public string ArchiveDir { get; } = Path.Combine(baseDir, "archives");
    public string HistFile   { get; } = Path.Combine(baseDir, "historique.json");
    public string SettingsFile { get; } = Path.Combine(baseDir, "settings.json");
    public string TutoFile   { get; } = Path.Combine(baseDir, "tuto.txt");
    private const int MaxVersions = 5;

    // ── Helpers ──────────────────────────────────────────────────────────────

    public static string ProjDirName(JsonElement proj)
    {
        var name = proj.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
        if (string.IsNullOrEmpty(name) && proj.TryGetProperty("id", out var id))
            name = id.GetString() ?? "proj";
        var invalid = Path.GetInvalidFileNameChars();
        var clean = new string(name.Select(c => invalid.Contains(c) ? '_' : c).ToArray());
        return clean.Trim('.', ' ')[..Math.Min(clean.Length, 60)];
    }

    public string? FindProjDir(string projId)
    {
        if (!Directory.Exists(DataDir)) return null;
        foreach (var dir in Directory.EnumerateDirectories(DataDir))
        {
            var pf = Path.Combine(dir, "projet.json");
            if (!File.Exists(pf)) continue;
            var doc = JsonDocument.Parse(File.ReadAllText(pf, System.Text.Encoding.UTF8));
            if (doc.RootElement.TryGetProperty("id", out var idEl) && idEl.GetString() == projId)
                return dir;
        }
        return null;
    }

    // ── Load / Save ───────────────────────────────────────────────────────────

    public AppData LoadData()
    {
        Directory.CreateDirectory(DataDir);
        var result = new AppData();
        foreach (var dir in Directory.EnumerateDirectories(DataDir).OrderBy(d => d))
        {
            var pf = Path.Combine(dir, "projet.json");
            var tf = Path.Combine(dir, "taches.json");
            if (!File.Exists(pf)) continue;
            var proj = JsonDocument.Parse(File.ReadAllText(pf, System.Text.Encoding.UTF8)).RootElement.Clone();
            result.Projects.Add(proj);
            var tasks = File.Exists(tf)
                ? JsonDocument.Parse(File.ReadAllText(tf, System.Text.Encoding.UTF8)).RootElement
                    .EnumerateArray().Select(e => e.Clone()).ToList()
                : [];
            var id = proj.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
            if (!string.IsNullOrEmpty(id)) result.Tasks[id] = tasks;
        }
        // Projets archives depuis les ZIPs
        Directory.CreateDirectory(ArchiveDir);
        foreach (var zip in Directory.EnumerateFiles(ArchiveDir, "*.zip").OrderBy(f => f))
        {
            try
            {
                using var za = ZipFile.OpenRead(zip);
                var pEntry = za.Entries.FirstOrDefault(e => e.Name == "projet.json");
                var tEntry = za.Entries.FirstOrDefault(e => e.Name == "taches.json");
                if (pEntry == null) continue;
                using var ps = new StreamReader(pEntry.Open());
                var doc = JsonDocument.Parse(ps.ReadToEnd());
                var proj = doc.RootElement.Clone();
                // Forcer archived=true
                var dict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(proj.GetRawText())!;
                dict["archived"] = JsonDocument.Parse("true").RootElement;
                var patched = JsonDocument.Parse(JsonSerializer.Serialize(dict)).RootElement.Clone();
                result.Projects.Add(patched);
                var id = proj.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
                if (tEntry != null && !string.IsNullOrEmpty(id))
                {
                    using var ts = new StreamReader(tEntry.Open());
                    result.Tasks[id] = JsonDocument.Parse(ts.ReadToEnd()).RootElement
                        .EnumerateArray().Select(e => e.Clone()).ToList();
                }
            }
            catch (Exception ex) { Console.WriteLine($"Erreur archive {zip}: {ex.Message}"); }
        }
        return result;
    }

    public void SaveData(AppData data)
    {
        Directory.CreateDirectory(DataDir);
        var existingIds = data.Projects
            .Where(p => !p.TryGetProperty("archived", out var a) || !a.GetBoolean())
            .Select(p => p.TryGetProperty("id", out var id) ? id.GetString() : null)
            .Where(id => id != null).ToHashSet();

        // Supprimer les dossiers orphelins
        foreach (var dir in Directory.EnumerateDirectories(DataDir))
        {
            var pf = Path.Combine(dir, "projet.json");
            if (!File.Exists(pf)) continue;
            var doc = JsonDocument.Parse(File.ReadAllText(pf, System.Text.Encoding.UTF8));
            if (doc.RootElement.TryGetProperty("id", out var id) && !existingIds.Contains(id.GetString()))
                Directory.Delete(dir, true);
        }

        foreach (var proj in data.Projects)
        {
            var isArchived = proj.TryGetProperty("archived", out var a) && a.GetBoolean();
            if (isArchived) continue;

            var id = proj.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
            if (string.IsNullOrEmpty(id)) continue;

            var newName = ProjDirName(proj);
            var existing = FindProjDir(id);
            string pdir;

            if (existing != null && Path.GetFileName(existing) != newName)
            {
                var newPath = Path.Combine(DataDir, newName);
                Directory.Move(existing, newPath);
                pdir = newPath;
            }
            else pdir = existing ?? Path.Combine(DataDir, newName);

            Directory.CreateDirectory(pdir);
            foreach (var sub in new[] { "images", "stl", "cura", "docs" })
                Directory.CreateDirectory(Path.Combine(pdir, sub));

            File.WriteAllText(Path.Combine(pdir, "projet.json"),
                JsonSerializer.Serialize(proj, JsonOptions.Default),
                System.Text.Encoding.UTF8);

            var tasks = data.Tasks.TryGetValue(id, out var t) ? t : [];
            File.WriteAllText(Path.Combine(pdir, "taches.json"),
                JsonSerializer.Serialize(tasks, JsonOptions.Default),
                System.Text.Encoding.UTF8);
        }
        SaveSnapshot();
    }

    // ── Historique ────────────────────────────────────────────────────────────

    private void SaveSnapshot()
    {
        try
        {
            var data = LoadData();
            var history = LoadHistory();
            var snapshot = new Dictionary<string, object>
            {
                ["date"] = DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss"),
                ["action"] = "modification",
                ["data"] = data
            };
            history.Insert(0, JsonDocument.Parse(JsonSerializer.Serialize(snapshot)).RootElement.Clone());
            if (history.Count > MaxVersions) history = history[..MaxVersions];
            File.WriteAllText(HistFile, JsonSerializer.Serialize(history, JsonOptions.Default),
                System.Text.Encoding.UTF8);
        }
        catch (Exception ex) { Console.WriteLine($"Erreur snapshot: {ex.Message}"); }
    }

    public List<JsonElement> LoadHistory()
    {
        if (!File.Exists(HistFile)) return [];
        return JsonDocument.Parse(File.ReadAllText(HistFile, System.Text.Encoding.UTF8))
            .RootElement.EnumerateArray().Select(e => e.Clone()).ToList();
    }

    // ── Tuto / Settings ───────────────────────────────────────────────────────

    public bool GetTutoDone() =>
        File.Exists(TutoFile) && File.ReadAllText(TutoFile).Trim() == "1";

    public void SetTutoDone() => File.WriteAllText(TutoFile, "1");
    public void ResetTuto()   => File.WriteAllText(TutoFile, "0");

    public Dictionary<string, string> LoadSettings()
    {
        if (!File.Exists(SettingsFile)) return [];
        return JsonSerializer.Deserialize<Dictionary<string, string>>(
            File.ReadAllText(SettingsFile, System.Text.Encoding.UTF8)) ?? [];
    }

    public void SaveSettings(Dictionary<string, string> s) =>
        File.WriteAllText(SettingsFile,
            JsonSerializer.Serialize(s, JsonOptions.Default), System.Text.Encoding.UTF8);
}
