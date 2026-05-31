# Gestionnaire de Projets

Application web locale de gestion de projets inspirée de Monday.com, spécialisée pour les projets **Arduino**, **Raspberry Pi** et **logiciels**.

![Version](https://img.shields.io/badge/version-2026--05--30-blue)

## Démarrage

1. Double-cliquer sur **`start.bat`**
2. Le navigateur s'ouvre sur **http://localhost:8742**
3. Ne pas fermer la fenêtre du serveur tant que l'appli est utilisée

## Fonctionnalités

### Vues
- **Tableau** — projets et tâches en lignes avec en-tête collant
- **Kanban** — colonnes glissables par statut
- **Calendrier** — deadlines sur une vue mensuelle
- **Timeline/Gantt** — barres de durée des projets
- **Dashboard** — statistiques globales + 5 graphiques avancés

### Gestion des projets
- Statut, priorité, type, dates, description
- Tags/étiquettes colorées
- Liste de composants (nom, quantité, fournisseur, prix, URL)
- Schéma de câblage (image avec lightbox)
- Budget estimé/réel avec suivi
- Liens entre projets (dépendance/référence + tri topologique)
- Dupliquer, archiver, exporter PDF/Excel

### Gestion des tâches
- Sous-tâches sur 2 niveaux avec cascade de statuts
- Chronomètre avec sauvegarde automatique
- Commentaires horodatés
- Pièces jointes images
- Rappels avec notifications Windows
- Tags

### Outils
- Recherche globale en temps réel (popup)
- Mode sombre/clair
- Raccourcis clavier (N/T/D/B/K/?)
- Historique des versions avec restauration
- Export PDF et Excel

## Structure

| Fichier | Rôle |
|---------|------|
| `index.html` | Structure HTML |
| `styles.css` | Styles (clair + sombre) |
| `app.js` | Logique applicative (118 fonctions) |
| `server.py` | Serveur HTTP + API REST + export Excel |
| `start.bat` | Lanceur Windows |
| `aide.html` | Documentation utilisateur |
| `DOCUMENTATION.md` | Documentation technique complète |

## Prérequis

- Python 3.x
- `openpyxl` (pour l'export Excel) : `pip install openpyxl`

## Documentation

- **Utilisateur** : bouton 📖 Aide dans l'application
- **Technique** : voir [DOCUMENTATION.md](DOCUMENTATION.md)

---

*Développé avec Claude — Philippe (lpmaker-be)*
