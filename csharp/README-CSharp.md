# GP - Gestionnaire de Projets (C#)

Réimplémentation complète du serveur Python en **C# .NET 8**.

## Prérequis

- [.NET 8 SDK](https://dotnet.microsoft.com/download)

## Lancement en développement

```bash
cd csharp
dotnet run
```

## Build autonome (Windows)

```bash
cd csharp
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
# Résultat : bin\Release\net8.0\win-x64\publish\GP-serveur.exe
```

## Build Linux

```bash
dotnet publish -c Release -r linux-x64 --self-contained true /p:PublishSingleFile=true
```

## Structure

| Fichier | Rôle |
|---|---|
| `Program.cs` | Point d'entrée, BASE_DIR, lancement serveur |
| `HttpServer.cs` | Serveur HTTP (HttpListener), toutes les routes |
| `DataManager.cs` | Chargement/sauvegarde JSON, historique, tuto, settings |
| `Models.cs` | Modèles de données et options JSON |
| `GP.csproj` | Projet .NET 8, dépendances |

## Compatibilité données

✅ **100% compatible** avec la version Python — même format de fichiers `data/`, `archives/`, `historique.json`.

## Routes API implémentées

- `GET /api/data` — charger tous les projets et tâches
- `POST /api/projects` — créer/modifier un projet
- `DELETE /api/projects` — supprimer un projet
- `POST /api/tasks` — créer/modifier une tâche
- `DELETE /api/tasks` — supprimer une tâche
- `POST /api/tasks/reorder` — réordonner les tâches
- `POST /api/projects/reorder` — réordonner les projets
- `POST /api/archive` — archiver un projet (ZIP)
- `POST /api/unarchive` — restaurer depuis ZIP
- `GET /api/archives` — liste des archives
- `POST /api/delete-archive` — supprimer une archive
- `GET /api/history` — historique des versions
- `GET /api/restore` — restaurer une version
- `GET /api/files/list` — liste des fichiers d'un projet
- `GET /api/files/get` — télécharger un fichier
- `POST /api/files/upload` — uploader (multipart)
- `POST /api/files/delete` — supprimer un fichier
- `GET /api/tuto` — état du tutoriel
- `POST /api/tuto` — marquer tutoriel fait/reset
- `GET /api/settings` — paramètres
- `POST /api/settings` — sauvegarder paramètres
