using GP;
using System.Diagnostics;
using System.Net;

Console.OutputEncoding = System.Text.Encoding.UTF8;

const int PORT = 8742;

// BASE_DIR = dossier de l'exe en production, dossier parent du projet en dev
var baseDir = AppContext.BaseDirectory;

// En dev (dotnet run), remonter au dossier parent du projet (ou le repo)
// bin/Debug/net8.0 -> remonter 3 fois -> dossier csharp -> remonter 1 fois -> racine projet
var devCandidate = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
if (File.Exists(Path.Combine(devCandidate, "index.html")))
    baseDir = devCandidate;

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
