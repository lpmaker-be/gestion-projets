using GP;
using System.Diagnostics;

Console.OutputEncoding = System.Text.Encoding.UTF8;

const int PORT = 8742;

// BASE_DIR : dossier de l'exe ou racine du projet en dev
var baseDir = AppContext.BaseDirectory;
for (int i = 1; i <= 6; i++)
{
    var parts = Enumerable.Repeat("..", i).ToArray();
    var candidate = Path.GetFullPath(Path.Combine(new[] { baseDir }.Concat(parts).ToArray()));
    if (File.Exists(Path.Combine(candidate, "index.html")))
    {
        baseDir = candidate;
        break;
    }
}

Console.WriteLine("");
Console.WriteLine("  ========================================");
Console.WriteLine("   GP - Gestionnaire de Projets (C#)");
Console.WriteLine("  ========================================");
Console.WriteLine($"  Adresse : http://localhost:{PORT}");
Console.WriteLine($"  Donnees : {Path.Combine(baseDir, "data")}");
Console.WriteLine("  Ferme cette fenetre pour arreter le serveur");
Console.WriteLine("");

var server = new HttpServer(baseDir, PORT);
server.Start();

try { Process.Start(new ProcessStartInfo($"http://localhost:{PORT}") { UseShellExecute = true }); }
catch { }

Console.CancelKeyPress += (_, e) => { e.Cancel = true; server.Stop(); };
await server.RunAsync();
