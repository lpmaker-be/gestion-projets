using GP;
using System.Diagnostics;

Console.OutputEncoding = System.Text.Encoding.UTF8;

const int PORT = 8742;

// BASE_DIR = dossier de l'exe en production, racine du projet en dev
var baseDir = AppContext.BaseDirectory;

// En dev (dotnet run) : bin/Debug/net8.0/win-x64/ -> remonter 5x -> racine projet
// En prod (exe publie) : dossier de l'exe -> c'est la racine du projet
for (int i = 0; i < 6; i++)
{
    var candidate = Path.GetFullPath(Path.Combine(baseDir, new string('.', 1) + "/" + string.Join("/", Enumerable.Repeat("..", i))));
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

// Ouvrir le navigateur
try { Process.Start(new ProcessStartInfo($"http://localhost:{PORT}") { UseShellExecute = true }); }
catch { }

Console.CancelKeyPress += (_, e) => { e.Cancel = true; server.Stop(); };
await server.RunAsync();
