# Gestionnaire de Projets

Application web locale inspirée de Monday.com pour gérer des projets Arduino, Raspberry Pi et logiciels.

## Fonctionnalités

- **5 vues** : Tableau, Kanban, Calendrier, Timeline/Gantt, Dashboard
- **Dashboard** avec statistiques, graphique donut, tâches en retard, suivi du temps
- **Kanban** avec drag & drop
- **Calendrier** mensuel avec deadlines et dates de début
- **Timeline/Gantt** avec barres de durée
- **Suivi du temps** par tâche (chronomètre intégré)
- **Estimations** en heures
- **Dépendances** entre tâches
- **Composants/matériel** par projet (idéal Arduino/RPI)
- **Filtres avancés** : priorité, statut, type, tri
- **Sauvegarde locale** dans `projets.json`

## Installation

1. Cloner le repo
2. Copier les fichiers dans `D:\claude\gestion_projets\`
3. Double-cliquer sur `start.bat`
4. Le navigateur s'ouvre sur `http://localhost:8742`

## Prérequis

- Python 3.x

## Structure

```
gestion_projets/
├── index.html      # Interface web
├── server.py       # Serveur Python local
├── start.bat       # Lanceur Windows
└── projets.json    # Données (créé automatiquement)
```

> ⚠️ Le fichier `projets.json` est ignoré par git (données personnelles).
