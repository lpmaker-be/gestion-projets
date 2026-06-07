using GP;
using System.Diagnostics;
using System.Net;

console.OutputEncoding = System.Text.Encoding.UTF8;

const int PORT = 8742;

// BASE_DIR = dossier de l'exe (ou dossier du projet en dev)
var baseDir = AppContext.BaseDirectory;
// En dev (dotnet run), remonter jusqu'au dossier du projet parent
if (File.Exists(Path.Combine(baseDir, "GP.csproj")))
    baseDir = Directory.GetParent(baseDir)!.Parent!.Parent!.Parent!.FullName;

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
