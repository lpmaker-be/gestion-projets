# Documentation Technique — Gestionnaire de Projets

> Application web locale de gestion de projets inspirée de Monday.com, spécialisée pour les projets Arduino, Raspberry Pi et logiciels.

## Table des matières

1. [Architecture générale](#architecture-générale)
2. [Structure des fichiers](#structure-des-fichiers)
3. [Modèle de données](#modèle-de-données)
4. [Serveur Python (server.py)](#serveur-python)
5. [Application JavaScript (app.js)](#application-javascript)
6. [API REST](#api-rest)
7. [Référence des fonctions](#référence-des-fonctions)

---

## Architecture générale

L'application suit une architecture **client-serveur locale** :

```
┌─────────────────┐         HTTP          ┌──────────────────┐
│   Navigateur    │  ◄─────────────────►  │  Serveur Python  │
│  (index.html    │   GET/POST/DELETE     │   (server.py)    │
│   app.js        │                       │   port 8742      │
│   styles.css)   │                       │                  │
└─────────────────┘                       └────────┬─────────┘
                                                    │
                                          ┌─────────▼─────────┐
                                          │   projets.json    │
                                          │  historique.json  │
                                          └───────────────────┘
```

- **Frontend** : HTML/CSS/JS vanilla (aucun framework)
- **Backend** : serveur HTTP Python natif (`http.server`)
- **Stockage** : fichiers JSON locaux (synchronisés via OneDrive)
- **Persistance** : sauvegarde automatique à chaque modification

---

## Structure des fichiers

| Fichier | Rôle | Lignes |
|---------|------|--------|
| `index.html` | Structure HTML : topbar, sidebar, vues, modales | ~250 |
| `styles.css` | Tous les styles CSS (mode clair + sombre) | ~800 |
| `app.js` | Logique applicative complète (118 fonctions) | ~3485 |
| `server.py` | Serveur HTTP + API REST + export Excel | ~370 |
| `start.bat` | Lanceur Windows | ~15 |
| `aide.html` | Documentation utilisateur (nouvel onglet) | ~470 |
| `projets.json` | Données (créé automatiquement) | variable |
| `historique.json` | 5 derniers snapshots (créé automatiquement) | variable |

---

## Modèle de données

### Projet

```javascript
{
  id:          "mpra2ketpcyw",      // ID unique généré
  name:        "Mon projet",         // Nom du projet
  type:        "arduino",            // arduino | software | mixed | divers
  status:      "prog",               // todo | prog | done | block
  priority:    "med",                // high | med | low
  deadline:    "2026-07-12",         // Date limite (ISO)
  start:       "2026-05-29",         // Date de début (ISO)
  desc:        "Description...",     // Notes du projet
  components:  "",                   // (legacy) texte libre composants
  components2: [                     // Liste structurée de composants
    { name, qty, supplier, price, url }
  ],
  schema:      "data:image/...",     // Schéma câblage (base64 ou URL)
  tags:        ["impression3d"],     // Étiquettes
  links:       [                     // Liens vers d'autres projets
    { id, targetId, type }           // type: dep | ref
  ],
  budgetEst:   100.0,                // Budget estimé (EUR)
  budgetReal:  65.0,                 // Budget réel (EUR)
  archived:    false,                // Projet archivé ?
  createdAt:   1780080671189         // Timestamp création
}
```

### Tâche (et sous-tâche, structure identique récursive)

```javascript
{
  id:          "mprbzvxvpomk",       // ID unique
  name:        "Imprimer la base",   // Nom de la tâche
  status:      "prog",               // todo | prog | done | block
  done:        false,                // Terminée ? (synchro avec status)
  priority:    "med",                // high | med | low
  deadline:    "2026-05-30",         // Date limite
  start:       "2026-05-29",         // Date de début
  estimate:    17,                   // Estimation en heures
  timeSpent:   61200,                // Temps passé en secondes (chrono)
  depends:     "",                   // ID tâche parente (legacy)
  reminder:    "2026-05-30T10:00",   // Rappel datetime-local
  note:        "Détails...",         // Notes
  tags:        ["impression3d"],     // Étiquettes
  comments:    [                     // Commentaires
    { id, text, date }
  ],
  attachments: [                     // Images jointes
    { id, name, data, size }         // data = base64
  ],
  subtasks:    [ /* récursif */ ]    // Sous-tâches (2 niveaux max)
}
```

### Structure globale

```javascript
{
  projects: [ /* tableau de projets */ ],
  tasks: {
    "projId1": [ /* tâches du projet 1 */ ],
    "projId2": [ /* tâches du projet 2 */ ]
  }
}
```

---

## Serveur Python

### Routes HTTP

| Méthode | Route | Action |
|---------|-------|--------|
| GET | `/` | Sert index.html |
| GET | `/app.js`, `/styles.css`, `/aide.html` | Fichiers statiques |
| GET | `/api/data` | Retourne toutes les données JSON |
| GET | `/api/export-excel?projId=X` | Génère et télécharge un fichier Excel |
| GET | `/api/history` | Retourne les 5 derniers snapshots |
| GET | `/api/restore?idx=N` | Restaure le snapshot N |
| POST | `/api/projects` | Crée/modifie un projet |
| POST | `/api/tasks` | Crée/modifie une tâche |
| DELETE | `/api/projects?id=X` | Supprime un projet |
| DELETE | `/api/tasks?projectId=X&taskId=Y` | Supprime une tâche |

### Fonctions clés

- **`load_data()`** — Lit `projets.json`
- **`save_data(data)`** — Sauvegarde + crée un snapshot automatiquement
- **`save_snapshot(action)`** — Insère une version dans `historique.json` (max 5)
- **`load_history()`** — Lit les snapshots
- **`_export_excel()`** — Génère un classeur Excel avec openpyxl (1 onglet global + 1 par projet)
- **`_restore_snapshot()`** — Restaure une version antérieure

---

## Application JavaScript

### Organisation par sections

| Section | Lignes | Contenu |
|---------|--------|---------|
| Utilitaires | 104-220 | `genId`, `escHtml`, `fmtTime`, `dlInfo`, labels/couleurs |
| Chargement données | 222-300 | `loadData`, `migrateTask`, `apiPost`, `apiDel` |
| Navigation/Filtres | 300-495 | `setView`, `getFilteredProjects`, `filterTasks` |
| Rendu principal | 495-810 | `renderAll`, `renderBoard`, `updateSummary` |
| Sous-tâches | 860-1130 | `addSubtask`, `toggleSubtask`, cascade statuts |
| Export PDF | 1148-1300 | `exportPDF` |
| Commentaires | 1317-1385 | `addComment`, `deleteComment`, `editComment` |
| Tags | 1385-1550 | `renderTags`, `addTag`, gestion projet |
| Mode sombre | 1553 | `toggleDark` |
| Composants | 1567-1640 | `openComponents`, `saveComponents` |
| Schéma câblage | 1643-1700 | `pickSchemaFile`, `openLightbox` |
| Dupliquer/Archiver | 1699-1800 | `duplicateProject`, `archiveProject` |
| Notifications | 1816-1886 | `checkReminders`, `fireReminder` |
| Pièces jointes | 1886-1962 | `addAttachment`, `buildAttachmentsSection` |
| Liens projets | 1962-2030 | `addProjectLink`, tri topologique |
| Recherche globale | 2035-2123 | `onGlobalSearch`, popup résultats |
| Export Excel | 2123 | `exportExcel` |
| Stats avancées | 2139-2260 | `buildAdvancedStats` |
| Historique | 2260-2304 | `openHistory`, `restoreSnapshot` |
| Vues | 2319-2900 | Kanban, Calendrier, Gantt, Dashboard |
| Modales | 3004-3500 | `openTaskModal`, `saveTask`, `openProjectModal` |

### Variables globales importantes

```javascript
let data = { projects: [], tasks: {} };  // Données chargées
let currentView = 'board';                // Vue active
let editingProjId = null;                 // Projet en édition
let editingTaskId = null;                 // Tâche en édition
let currentProjId = null;                 // Projet courant (raccourci T)
let sideFilter = 'all';                   // Filtre statut sidebar
let showArchived = false;                 // Afficher archives ?
let timers = {};                          // Chronomètres actifs
let editingProjTags = [];                 // Tags en édition
let editingProjLinks = [];                // Liens en édition
```

---

## API REST

### Exemple : créer/modifier une tâche

```javascript
await apiPost('/api/tasks', {
  projectId: 'mpra2ketpcyw',
  task: {
    id: 'newid',
    name: 'Ma tâche',
    status: 'todo',
    // ... autres champs
  }
});
```

### Exemple : supprimer un projet

```javascript
await apiDel('/api/projects?id=mpra2ketpcyw');
```

---

## Référence des fonctions

### Utilitaires

| Fonction | Description |
|----------|-------------|
| `genId()` | Génère un ID unique (timestamp + random base36) |
| `escHtml(str)` | Échappe les caractères HTML dangereux |
| `fmtTime(secs)` | Formate des secondes en "XhYY" |
| `dlInfo(date)` | Retourne {str, cls} pour une deadline (retard/proche) |
| `pcol(projId)` | Couleur déterministe d'un projet |
| `tagColor(tag)` | Couleur déterministe d'un tag |

### Gestion des tâches

| Fonction | Description |
|----------|-------------|
| `saveTask()` | Crée/modifie une tâche depuis la modale |
| `toggleTask(p, t)` | Coche/décoche une tâche (cascade sous-tâches) |
| `deleteTask(p, t)` | Supprime une tâche (avec confirmation) |
| `addSubtask(p, t, parent)` | Ajoute une sous-tâche |
| `toggleSubtask(p, t, sub)` | Coche une sous-tâche (vérifie enfants) |
| `findTask(p, t)` | Trouve une tâche par ID |
| `findSubtask(subs, id)` | Trouve une sous-tâche récursivement |
| `totalEstimate(task)` | Somme estimations récursive |
| `totalTimeSpent(task)` | Somme temps passé récursif |

### Rendu des vues

| Fonction | Description |
|----------|-------------|
| `renderAll()` | Rafraîchit toute l'interface |
| `renderBoard()` | Vue Tableau |
| `renderKanban()` | Vue Kanban (drag & drop) |
| `renderCalendar()` | Vue Calendrier mensuel |
| `renderGantt()` | Vue Timeline/Gantt |
| `renderDashboard()` | Tableau de bord + stats avancées |

### Fonctionnalités avancées

| Fonction | Description |
|----------|-------------|
| `exportPDF(projId)` | Export PDF via window.print() |
| `exportExcel(projId)` | Export Excel via serveur |
| `duplicateProject(id)` | Duplique un projet complet |
| `archiveProject(id)` | Archive/restaure un projet |
| `onGlobalSearch(q)` | Recherche temps réel (popup) |
| `buildAdvancedStats(projs)` | Génère les 5 graphiques de stats |
| `openHistory()` | Affiche l'historique des versions |
| `restoreSnapshot(idx)` | Restaure une version antérieure |
| `checkReminders()` | Vérifie les rappels (toutes les 30s) |

---

## Notes de maintenance

### Workflow de modification sûr

Pour modifier `app.js` sans casser le code :

```python
with open(path, "r", encoding="utf-8") as f:
    c = f.read()
# Faire le remplacement ciblé
c = c.replace(old, new)
# TOUJOURS vérifier avant de sauvegarder
import subprocess
result = subprocess.run(["node", "--check", path], capture_output=True)
assert result.returncode == 0, "Erreur de syntaxe !"
assert "async function saveTask" in c, "saveTask disparu !"
with open(path, "w", encoding="utf-8") as f:
    f.write(c)
```

### Pièges connus

- **Quotes imbriquées** : éviter les `onclick="fn('${var}')"` dans les template literals. Préférer les `data-attributes` + handler global.
- **Encodage** : toujours lire/écrire en UTF-8. PowerShell a des problèmes avec les emojis.
- **Détaché HEAD git** : faire les commits sur `main`, pas en détaché.
- **Images base64** : grossissent `projets.json`. Limiter la taille des images.

---

*Documentation générée le 30 mai 2026 — Gestionnaire de Projets v2026-05-30*
