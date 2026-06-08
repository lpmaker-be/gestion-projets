# GP - Installation C# .NET 8

Version C# du serveur, alternative à la version Python.

## Prérequis

- [.NET 8 SDK](https://dotnet.microsoft.com/download) ou supérieur

## Lancement en développement

```bash
cd installe_csharp
dotnet run
```

## Build exe autonome Windows

```
cd installe_csharp
BUILD.bat
```

Résultat : `installe_csharp\dist\GP\GP-serveur.exe`

## Build Linux

```bash
cd installe_csharp
dotnet publish GP.csproj -c Release -r linux-x64 --self-contained true /p:PublishSingleFile=true -o dist/GP
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `Program.cs` | Point d'entrée, détection BASE_DIR |
| `HttpServer.cs` | Serveur HTTP, toutes les routes API |
| `DataManager.cs` | Lecture/écriture JSON, historique |
| `Models.cs` | AppData + JsonOptions |
| `GP.csproj` | Projet .NET 8 |
| `BUILD.bat` | Script de build Windows |

## Compatibilité

✅ **100% compatible** avec les données de la version Python (même format `data/`).
