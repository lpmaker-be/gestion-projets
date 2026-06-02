# Audit Bugs - Phase 1 Commercialisation

> Suivi des bugs et tests pour préparer la commercialisation du Gestionnaire de Projets.
> Mettre à jour au fur et à mesure des tests.

## Légende
- ✅ Testé et OK
- 🐛 Bug confirmé
- ⏳ À tester
- ❌ Bloquant

---

## 1. Projets

| Test | Statut | Notes |
|------|--------|-------|
| Créer un projet | ⏳ | |
| Modifier un projet | ⏳ | |
| Supprimer un projet | ⏳ | |
| Dupliquer un projet | ⏳ | |
| Archiver un projet | ⏳ | |
| Restaurer une archive | ⏳ | |
| Supprimer une archive | ⏳ | |
| Ajouter un schéma de câblage | ⏳ | |
| Ajouter des composants | ⏳ | |
| Ajouter des tags | ⏳ | |
| Liens entre projets | ⏳ | |
| Budget estimé / réel | ⏳ | |

---

## 2. Tâches

| Test | Statut | Notes |
|------|--------|-------|
| Créer une tâche | ⏳ | |
| Modifier une tâche | ⏳ | |
| Supprimer une tâche | ⏳ | |
| Cocher une tâche sans sous-tâches | ⏳ | |
| Cocher une tâche avec sous-tâches non finies | ⏳ | Doit être bloqué |
| Cocher une tâche avec sous-tâches toutes finies | ⏳ | |
| Tâches terminées descendent en bas | ⏳ | |
| Chronomètre démarrer/arrêter | ⏳ | |
| Chronomètre persistance après rechargement | ⏳ | |
| Rappel / notification | ⏳ | |
| Pièces jointes images | ⏳ | |
| Commentaires | ⏳ | |
| Tags sur tâche | ⏳ | |

---

## 3. Sous-tâches

| Test | Statut | Notes |
|------|--------|-------|
| Créer une sous-tâche | ⏳ | |
| Modifier une sous-tâche | ⏳ | |
| Supprimer une sous-tâche | ⏳ | |
| Cocher une sous-tâche | ⏳ | |
| Cascade : toutes cochées → parente cochée | ⏳ | |
| Indicateur note visible | ⏳ | |

---

## 4. Fichiers par projet

| Test | Statut | Notes |
|------|--------|-------|
| Ouvrir le gestionnaire de fichiers | ⏳ | |
| Upload image | ⏳ | |
| Upload STL | ⏳ | |
| Upload fichier Cura | ⏳ | |
| Upload document | ⏳ | |
| Télécharger un fichier | ⏳ | |
| Supprimer un fichier | ⏳ | |
| Lightbox image | ⏳ | |

---

## 5. Vues

| Test | Statut | Notes |
|------|--------|-------|
| Vue Tableau | ⏳ | |
| Vue Kanban | ⏳ | |
| Vue Calendrier | ⏳ | |
| Vue Timeline / Gantt | ⏳ | |
| Vue Dashboard | ⏳ | |
| Statistiques avancées en bas du Dashboard | ⏳ | |
| Filtres sidebar (statut, type) | ⏳ | |
| Recherche globale | ⏳ | |
| Filtre priorité | ⏳ | |
| Afficher/masquer tâches terminées | ⏳ | |

---

## 6. Exports

| Test | Statut | Notes |
|------|--------|-------|
| Export Excel global | ⏳ | |
| Export Excel par projet | ⏳ | |
| Export PDF global | ⏳ | |
| Export PDF par projet | ⏳ | |
| Impression globale | ⏳ | |
| Impression par projet | ⏳ | |

---

## 7. Fonctionnalités système

| Test | Statut | Notes |
|------|--------|-------|
| Historique versions (5 snapshots) | ⏳ | |
| Restaurer une version | ⏳ | |
| Mode hors-ligne (indicateur vert/rouge) | ⏳ | |
| Thèmes de couleurs (7 pastilles) | ⏳ | |
| Mode sombre / clair | ⏳ | |
| Raccourcis clavier (N, T, D, B, K, ?) | ⏳ | |
| Service Worker (notifications) | ⏳ | |

---

## 8. Bugs connus à corriger

| Bug | Priorité | Statut |
|-----|----------|--------|
| Message démarrage affiche encore projets.json | Mineur | ⏳ |
| | | |

---

## 9. Améliorations pour commercialisation

- [ ] Écran de bienvenue au premier lancement
- [ ] Tutoriel interactif
- [ ] Packaging PyInstaller (.exe autonome)
- [ ] Installeur Windows (Inno Setup)
- [ ] Système de licence / activation
- [ ] Page web de présentation
- [ ] FAQ / documentation utilisateur
- [ ] Gestion des erreurs visible (pas de silences)
- [ ] Validation des formulaires (champs obligatoires)

---

*Dernière mise à jour : 2026-06-01*
