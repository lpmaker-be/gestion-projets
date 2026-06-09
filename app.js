/**
 * =============================================================================
 * GESTIONNAIRE DE PROJETS - app.js
 * Inspire de Monday.com, specialise pour projets Arduino/RPi/logiciels
 * Auteur : Philippe (lpmaker-be)
 *
 * ARCHITECTURE :
 *   Frontend vanilla JS (aucun framework) <-> Serveur Python (server.py)
 *   Donnees persistees dans projets.json via API REST
 *   Voir DOCUMENTATION.md pour le detail complet
 *
 * STRUCTURE DU FICHIER :
 *   1.  Utilitaires        : genId, escHtml, fmtTime, dlInfo, labels/couleurs
 *   2.  Chargement donnees : loadData, migrateTask (migration recursive)
 *   3.  API REST           : apiPost, apiDel
 *   4.  Navigation/Filtres : setView, getFilteredProjects (+ tri topologique),
 *                            filterTasks, filtres sidebar/priorite
 *   5.  Rendu principal    : renderAll, renderBoard, updateSummary
 *   6.  Sous-taches        : addSubtask, toggleSubtask (cascade + blocage),
 *                            findTask, findSubtask, totalEstimate/TimeSpent
 *   7.  Export PDF         : exportPDF (window.print)
 *   8.  Commentaires       : addComment, editComment, deleteComment
 *   9.  Tags               : renderTags, addTag, gestion projet et tache
 *   10. Mode sombre        : toggleDark (localStorage)
 *   11. Composants         : openComponents, saveComponents (+ total auto)
 *   12. Schema cablage     : pickSchemaFile (base64), lightbox
 *   13. Dupliquer/Archiver : duplicateProject, archiveProject
 *   14. Notifications      : checkReminders, fireReminder (API navigateur)
 *   15. Pieces jointes     : addAttachment, buildAttachmentsSection (base64)
 *   16. Liens projets      : addProjectLink (dependance/reference)
 *   17. Recherche globale  : onGlobalSearch (popup temps reel)
 *   18. Export Excel       : exportExcel (via serveur openpyxl)
 *   19. Stats avancees     : buildAdvancedStats (5 graphiques)
 *   20. Historique         : openHistory, restoreSnapshot (5 versions)
 *   21. Vues               : Kanban (drag&drop), Calendrier, Gantt, Dashboard
 *   22. Chronometre        : toggleTimer (sauvegarde auto 60s)
 *   23. Modales            : openTaskModal, saveTask, openProjectModal, etc.
 *   24. CRUD               : saveProject, deleteProject, deleteTask
 *   25. Raccourcis clavier : N/T/D/B/K/? + Echap
 *   26. Initialisation     : loadData() au demarrage
 *
 * RACCOURCIS CLAVIER :
 *   N = nouveau projet | T = nouvelle tache | D/B/K = vues
 *   ? = aide | Echap = fermer modale
 *
 * MODELE DE DONNEES : voir DOCUMENTATION.md
 * =============================================================================
 */

'use strict';

/* =============================================================================
   1. CONFIGURATION & ÉTAT GLOBAL
   ============================================================================= */

/** URL de base du serveur Python local */
const API = 'http://localhost:8742';

/** Données principales chargées depuis projets.json */
let data = {
    projects: [],
    tasks: {}       // { projectId: [ ...tasks ] }
};

/** Vue courante : 'board' | 'kanban' | 'calendar' | 'gantt' | 'dashboard' */
let currentView = 'board';

/** Filtre sidebar par statut projet */
let sideFilter = 'all';

/** Afficher les projets archives */
let showArchived = false;

/** Filtre sidebar par type de projet */
let sideType = '';

/** Set des IDs de projets réduits (collapsed) dans la vue tableau */
const APP_VERSION = "1.0.0";
let collapsed     = new Set();
let mainCollapsed = new Set(JSON.parse(localStorage.getItem('gp_main_collapsed') || '[]'));

/** Filtre de priorité des tâches : 'all' | 'high' | 'med' | 'low' */
let prioFilter = 'all';

/** Afficher ou masquer les tâches terminées */
let showDone = true;

/** ID du projet en cours d'édition dans la modale (null = nouveau) */
let editingProjId = null;
let editingProjTags = [];

/** ID du dernier projet actif (pour le raccourci T) */
let currentProjId = null;

/** ID de la tâche en cours d'édition dans la modale (null = nouvelle) */
let editingTaskId = null;

/** ID du projet auquel appartient la tâche en cours de création/édition */
let taskProjId = null;

/**
 * Chronomètres actifs par tâche
 * Format : { taskId: { running: bool, start: timestamp, elapsed: secondes } }
 */
let timers = {};

/** Journal d'activité récente (max 20 entrées) */
let activity = [];

/** Mois et année affichés dans la vue calendrier */
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();

/** Palette de couleurs pour identifier les projets visuellement */
const PROJECT_COLORS = [
    '#0073ea', '#00c875', '#e2445c', '#fdab3d',
    '#a25ddc', '#579bfc', '#ff7575', '#00d0f0', '#7e5af1'
];


/* =============================================================================
   2. UTILITAIRES
   ============================================================================= */

/**
 * Retourne la couleur associée à un projet selon son index dans la liste.
 * @param {string} id - ID du projet
 * @returns {string} Couleur hexadécimale
 */
function pcol(id) {
    const i = data.projects.findIndex(p => p.id === id);
    return PROJECT_COLORS[i % PROJECT_COLORS.length] || '#0073ea';
}

/**
 * Génère un ID unique basé sur le timestamp + aléatoire.
 * @returns {string}
 */
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Échappe les caractères HTML pour éviter les injections XSS.
 * @param {string} s - Chaîne à échapper
 * @returns {string}
 */
function escHtml(s) {
    return (s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Formate une durée en secondes sous forme lisible "Xh YY" ou "Ymin".
 * @param {number} sec - Durée en secondes
 * @returns {string}
 */
function fmtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`;
}

/**
 * Calcule les informations d'affichage d'une deadline.
 * @param {string} d - Date au format YYYY-MM-DD
 * @returns {{ str: string, cls: string } | null}
 */
function dlInfo(d) {
    if (!d) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dd   = new Date(d);
    const diff = Math.round((dd - today) / 86400000);
    const fmt  = dd.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

    if (diff < 0)  return { str: `⚠ ${fmt} (${-diff}j)`,  cls: 'overdue' };
    if (diff === 0) return { str: `⚡ Aujourd'hui`,         cls: 'overdue' };
    if (diff <= 3)  return { str: `⏰ ${fmt}`,              cls: 'soon'    };

    return { str: fmt, cls: '' };
}

/** Retourne le libellé français d'un statut */
function statusLabel(s) {
    return { todo: 'À faire', prog: 'En cours', done: 'Terminé', block: 'Bloqué' }[s] || s;
}

/** Retourne la classe CSS d'un statut */
function statusCls(s) {
    return { todo: 's-todo', prog: 's-prog', done: 's-done', block: 's-block' }[s] || 's-todo';
}

/** Retourne le libellé français d'une priorité (avec emoji) */
function prioLabel(p) {
    return { high: '🔴 Haute', med: '🟡 Moyenne', low: '🟢 Basse' }[p] || p;
}

/** Retourne la classe CSS d'une priorité */
function prioCls(p) {
    return { high: 'p-high', med: 'p-med', low: 'p-low' }[p] || 'p-med';
}

/** Retourne le libellé du type de projet (avec emoji) */
function typeLabel(t) {
    return { arduino: '🔌 Arduino/RPI', software: '💻 Logiciel', mixed: '⚙️ Mixte', divers: '📦 Divers' }[t] || t;
}

/**
 * Ajoute une entrée au journal d'activité.
 * @param {string} msg - Message à enregistrer
 */
function addActivity(msg) {
    activity.unshift({
        msg,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    });
    if (activity.length > 20) activity.pop();
}

/**
 * Affiche un toast de notification temporaire.
 * @param {string}  msg - Message à afficher
 * @param {boolean} err - true = toast rouge (erreur), false = toast gris (info)
 */
function toast(msg, err = false) {
    const t = document.getElementById('toast');
    t.textContent     = msg;
    t.style.background = err ? '#e2445c' : '#323338';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}


/* =============================================================================
   3. API — communication avec le serveur Python local
   ============================================================================= */

/**
 * Charge toutes les données depuis le serveur et lance le rendu.
 * Effectue également une migration des anciens objets (ajout des champs manquants).
 */
async function loadData() {
    try {
        const r = await fetch(`${API}/api/data`);
        data = await r.json();
        try { localStorage.setItem('gp_cache', JSON.stringify(data)); } catch(e) {}
        setOnlineStatus(true);

        // Migration : s'assurer que tous les projets ont les champs requis
        data.projects.forEach(p => {
            if (!p.start)       p.start       = '';
            if (!p.components)  p.components  = '';
            if (p.order === undefined) p.order = 999;
            if (!p.tags)        p.tags        = [];
            if (!p.links)       p.links       = [];
            if (!p.components2) p.components2 = [];
            if (!p.schema)      p.schema      = '';
            if (!p.budgetEst)   p.budgetEst   = 0;
            if (!p.budgetReal)  p.budgetReal  = 0;
            if (p.archived === undefined) p.archived = false;
        });

        // Migration : s'assurer que toutes les tâches ont les champs requis
        // Migration recursive (taches + sous-taches)
        function migrateTask(t) {
            if (t.order === undefined) t.order = 999;
            if (!t.estimate)    t.estimate    = 0;
            if (!t.timeSpent)   t.timeSpent   = 0;
            if (!t.depends)     t.depends     = '';
            if (!t.start)       t.start       = '';
            if (!t.subtasks)    t.subtasks    = [];
            if (!t.comments)    t.comments    = [];
            if (!t.tags)        t.tags        = [];
            if (!t.reminder)    t.reminder    = '';
            if (!t.attachments) t.attachments = [];
            if (!t.status)      t.status      = t.done ? 'done' : 'todo';
            (t.subtasks || []).forEach(migrateTask);
        }
        Object.values(data.tasks).flat().forEach(migrateTask);

        renderAll();

    } catch (e) {
        console.error("ERREUR loadData:", e);
        toast('⚠️ Lance start.bat pour démarrer le serveur', true);
    }
}

/**
 * Envoie une requête POST JSON au serveur.
 * @param {string} url  - Chemin API (ex: '/api/projects')
 * @param {object} body - Corps de la requête
 * @returns {Promise<object>}
 */
async function apiPost(url, body) {
    try {
        const r = await fetch(`${API}${url}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body)
        });
        setOnlineStatus(true);
        try { localStorage.setItem('gp_cache', JSON.stringify(data)); } catch(e) {}
        return r.json();
    } catch(e) {
        setOnlineStatus(false);
        try { localStorage.setItem('gp_cache', JSON.stringify(data)); } catch(e2) {}
    }
}

/**
 * Envoie une requête DELETE au serveur.
 * @param {string} url - Chemin API avec paramètres (ex: '/api/projects?id=xxx')
 * @returns {Promise<object>}
 */
async function apiDel(url) {
    try {
        const r = await fetch(`${API}${url}`, { method: 'DELETE' });
        setOnlineStatus(true);
        try { localStorage.setItem('gp_cache', JSON.stringify(data)); } catch(e) {}
        return r.json();
    } catch(e) {
        setOnlineStatus(false);
        try { localStorage.setItem('gp_cache', JSON.stringify(data)); } catch(e2) {}
    }
}


/* =============================================================================
   4. NAVIGATION & FILTRES
   ============================================================================= */

/**
 * Change la vue depuis la sidebar (met aussi à jour l'item actif sidebar).
 * @param {string}      v  - Identifiant de la vue
 * @param {HTMLElement} el - Élément sidebar cliqué
 */
function goView(v, el) {
    setView(v, null);
    document.querySelectorAll('.sb-item').forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
}

/**
 * Change la vue courante et met à jour les onglets + titre topbar.
 * @param {string}      v  - Identifiant de la vue
 * @param {HTMLElement} el - Onglet cliqué (peut être null)
 */
function setView(v, el) {
    currentView = v;

    // Mise à jour des onglets de vue
    document.querySelectorAll('.view-tab').forEach(x => x.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    } else {
        // Activation de l'onglet correspondant si appelé sans élément
        const tabs = ['dashboard', 'board', 'kanban', 'calendar', 'gantt'];
        const i    = tabs.indexOf(v);
        const all  = document.querySelectorAll('.view-tab');
        if (all[i]) all[i].classList.add('active');
    }

    // Mise à jour du titre en haut
    const titles = {
        dashboard: 'Tableau de bord',
        board:     'Tableau',
        kanban:    'Kanban',
        calendar:  'Calendrier',
        gantt:     'Timeline'
    };
    document.getElementById('topbar-title').textContent = titles[v] || v;

    renderAll();
}

/**
 * Filtre les projets par statut depuis la sidebar.
 * @param {string}      f  - Statut ('all' | 'todo' | 'prog' | 'done' | 'block')
 * @param {HTMLElement} el - Élément cliqué
 */
function setSideFilter(f, el) {
    sideFilter = f;
    sideType   = '';
    document.querySelectorAll('.sb-item').forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
    renderAll();
}

/**
 * Filtre les projets par type depuis la sidebar.
 * @param {string}      t  - Type ('arduino' | 'software' | 'mixed')
 * @param {HTMLElement} el - Élément cliqué
 */
function setSideType(t, el) {
    sideType   = t;
    sideFilter = 'all';
    document.querySelectorAll('.sb-item').forEach(x => x.classList.remove('active'));
    if (el) el.classList.add('active');
    document.getElementById('filter-type').value = t;
    renderAll();
}

/**
 * Active/désactive le filtre de priorité dans la barre de filtre.
 * @param {string} p - Priorité ('all' | 'high' | 'med' | 'low')
 */
function togglePrioFilter(p) {
    prioFilter = p;
    document.querySelectorAll('[id^="fp-"]').forEach(x => x.classList.remove('active'));
    document.getElementById('fp-' + p).classList.add('active');
    renderAll();
}

/**
 * Bascule l'affichage des tâches terminées.
 */
function toggleShowDone() {
    showDone = !showDone;
    document.getElementById('show-done').classList.toggle('active', showDone);
    renderAll();
}

/**
 * Retourne les projets filtrés et triés selon l'état courant des filtres.
 * @returns {Array} Tableau de projets
 */
function getFilteredProjects() {
    const search = (document.getElementById('search').value || '').toLowerCase();
    const typeF  = document.getElementById('filter-type').value || sideType;
    const sortBy = document.getElementById('sort-by').value;

    let projs = data.projects.filter(p => {
        // Toujours exclure les archives de la liste normale
        if (p.archived) return false;
        // Filtre statut
        if (sideFilter !== 'all' && p.status !== sideFilter) return false;
        // Filtre type
        if (typeF && p.type !== typeF) return false;
        // Filtre recherche textuelle (nom, description, composants)
        // Recherche sur nom/desc/composants du projet ET sur les taches
        const taskMatch = (data.tasks[p.id] || []).some(t =>
            t.name.toLowerCase().includes(search) ||
            (t.note || '').toLowerCase().includes(search) ||
            (t.subtasks || []).some(st => st.name.toLowerCase().includes(search))
        );
        if (search &&
            !p.name.toLowerCase().includes(search) &&
            !(p.desc       || '').toLowerCase().includes(search) &&
            !(p.components || '').toLowerCase().includes(search) &&
            !taskMatch
        ) return false;
        return true;
    });

    // Tri
    projs.sort((a, b) => {
        if (sortBy === 'deadline')  return (a.deadline || '9999') > (b.deadline || '9999') ? 1 : -1;
        if (sortBy === 'priority')  { const po = { high: 0, med: 1, low: 2 }; return po[a.priority] - po[b.priority]; }
        if (sortBy === 'name')      return a.name.localeCompare(b.name);
        if (sortBy === 'created' || sortBy === 'creation') return b.createdAt - a.createdAt;
        // 'manual' ou vide = ordre du tableau (drag & drop)
    });

    // Tri topologique : les projets dependants apres leurs dependances
    var sorted = [];
    var remaining = projs.slice();
    var maxIter = projs.length * 2;
    var iter = 0;
    while (remaining.length > 0 && iter < maxIter) {
        iter++;
        var added = false;
        for (var i = 0; i < remaining.length; i++) {
            var p = remaining[i];
            var deps = (p.links || []).filter(function(l) { return l.type === 'dep'; });
            // Verifier que toutes les dependances sont deja dans sorted ou pas dans projs
            var depsOk = deps.every(function(l) {
                var inSorted = sorted.some(function(s) { return s.id === l.targetId; });
                var inProjs  = projs.some(function(x) { return x.id === l.targetId; });
                return inSorted || !inProjs;
            });
            if (depsOk) {
                sorted.push(p);
                remaining.splice(i, 1);
                added = true;
                break;
            }
        }
        // Eviter boucle infinie si dependances circulaires
        if (!added) {
            sorted = sorted.concat(remaining);
            break;
        }
    }
    return sorted;
}

/**
 * Filtre les tâches selon la priorité et l'état "montrer terminées".
 * @param {Array} tasks - Tableau de tâches brut
 * @returns {Array}
 */
function filterTasks(tasks) {
    let t = [...tasks];
    if (prioFilter !== 'all') t = t.filter(x => x.priority === prioFilter);
    if (!showDone)            t = t.filter(x => !x.done);

    // Tri selon le selecteur sort-by
    const sortBy = document.getElementById('sort-by') ? document.getElementById('sort-by').value : 'created';
    t.sort((a, b) => {
        if (sortBy === 'deadline') {
            // Taches sans deadline en dernier
            if (!a.deadline && !b.deadline) return 0;
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return a.deadline > b.deadline ? 1 : -1;
        }
        if (sortBy === 'priority') {
            const po = { high: 0, med: 1, low: 2 };
            return (po[a.priority] || 1) - (po[b.priority] || 1);
        }
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return 0; // creation : garder l'ordre original
    });
    // Mettre les taches terminees en bas (si showDone est actif)
    if (showDone) {
        t.sort(function(a, b) {
            if (a.done && !b.done) return 1;
            if (!a.done && b.done) return -1;
            return 0;
        });
    }
    return t;
}


/* =============================================================================
   5. RENDU GLOBAL
   ============================================================================= */

/**
 * Met à jour les compteurs dans la sidebar.
 */
function updateSideCounts() {
    const active   = data.projects.filter(p => !p.archived);
    const archived = data.projects.filter(p => p.archived);
    const c = { all: active.length, todo: 0, prog: 0, done: 0, block: 0 };
    active.forEach(p => { c[p.status] = (c[p.status] || 0) + 1; });
    ['all', 'todo', 'prog', 'done', 'block'].forEach(k => {
        const el = document.getElementById('sc-' + k);
        if (el) el.textContent = c[k] || 0;
    });
    const elArc = document.getElementById('sc-archived');
    if (elArc) elArc.textContent = archived.length;
}

/**
 * Met à jour la barre de résumé en bas d'écran.
 */
function updateSummary() {
    const allT     = Object.values(data.tasks).flat();
    const doneT    = allT.filter(t => t.done).length;
    const pct      = allT.length ? Math.round(doneT / allT.length * 100) : 0;
    const overdue  = allT.filter(t => !t.done && t.deadline && new Date(t.deadline) < new Date()).length;
    const totalEst   = allT.reduce((s, t) => s + totalEstimate(t), 0);
    const totalSpent = allT.reduce((s, t) => s + totalTimeSpent(t), 0);

    document.getElementById('summary-bar').innerHTML = `
        <div class="sum-item">
            <span class="sum-dot" style="background:#0073ea"></span>
            <span class="sum-lbl">Projets</span>
            <span class="sum-val">${data.projects.filter(function(p){return !p.archived;}).length}</span>
        </div>
        <div class="sum-item">
            <span class="sum-dot" style="background:#fdab3d"></span>
            <span class="sum-lbl">En cours</span>
            <span class="sum-val">${data.projects.filter(p => p.status === 'prog').length}</span>
        </div>
        <div class="sum-item">
            <span class="sum-dot" style="background:#00c875"></span>
            <span class="sum-lbl">Terminés</span>
            <span class="sum-val">${data.projects.filter(p => p.status === 'done').length}</span>
        </div>
        <div class="sum-item">
            <span class="sum-dot" style="background:#e2445c"></span>
            <span class="sum-lbl">Bloqués</span>
            <span class="sum-val">${data.projects.filter(p => p.status === 'block').length}</span>
        </div>
        <div class="sum-item">
            <span class="sum-dot" style="background:#a25ddc"></span>
            <span class="sum-lbl">Tâches</span>
            <span class="sum-val">${doneT}/${allT.length} (${pct}%)</span>
        </div>
        ${overdue ? `
        <div class="sum-item">
            <span class="sum-dot" style="background:#e2445c"></span>
            <span class="sum-lbl">En retard</span>
            <span class="sum-val" style="color:var(--red)">${overdue}</span>
        </div>` : ''}
        ${data.projects.filter(function(p){return p.archived;}).length > 0 ? `
        <div class="sum-item">
            <span class="sum-dot" style="background:#888"></span>
            <span class="sum-lbl">Archives</span>
            <span class="sum-val">${data.projects.filter(function(p){return p.archived;}).length}</span>
        </div>` : ''}
        ${totalEst > 0 ? `
        <div class="sum-item">
            <span class="sum-dot" style="background:#579bfc"></span>
            <span class="sum-lbl">Estimé</span>
            <span class="sum-val">${fmtEstimate(totalEst)}</span>
        </div>` : ''}
        ${totalSpent > 0 ? `
        <div class="sum-item">
            <span class="sum-dot" style="background:#00c875"></span>
            <span class="sum-lbl">Passé</span>
            <span class="sum-val">${fmtTime(totalSpent)}</span>
        </div>` : ''}
    `;
}

/**
 * Point d'entrée principal du rendu — dispatch vers la vue active.
 */
function renderAll() {
    const el = document.getElementById('content');
    if (el) el.classList.add('rendering');
    updateSideCounts();
    updateSummary();

    if      (currentView === 'board')     { renderBoard(); setTimeout(initProjDrag, 50); }
    else if (currentView === 'kanban')    renderKanban();
    else if (currentView === 'calendar')  renderCalendar();
    else if (currentView === 'gantt')     renderGantt();
    else if (currentView === 'dashboard') renderDashboard();
}


/* =============================================================================
   6. VUE TABLEAU (BOARD)
   ============================================================================= */

/**
 * Génère et affiche la vue tableau :
 * - Un bloc par projet avec en-tête sticky
 * - Un tableau HTML de tâches par projet
 * - Barre de progression, chronomètre, deadlines
 */
function renderBoard() {
    const projs = getFilteredProjects();

    // État vide
    if (!projs.length) {
        document.getElementById('content').innerHTML = `
            <div style="text-align:center;padding:80px;color:var(--text3)">
                <div style="font-size:48px">📭</div>
                <p style="margin-top:12px">Aucun projet — clique sur "+ Nouveau projet"</p>
            </div>`;
        return;
    }

    let html = '<div>';

    projs.forEach(p => {
        const allTasks = data.tasks[p.id] || [];
        const tasks    = filterTasks(allTasks);
        const doneCnt  = allTasks.filter(t => t.done).length;
        const pct      = allTasks.length ? Math.round(doneCnt / allTasks.length * 100) : 0;
        const color    = pcol(p.id);
        const isCol    = collapsed.has(p.id);

        // ── En-tête du projet ──────────────────────────────────────────
        html += `
        <div class="project-block" data-proj-id="${p.id}">
            <div class="proj-hdr" onmouseenter="currentProjId='${p.id}'">
                <span class="proj-drag-handle" title="Glisser pour reordonner">⠿</span><button class="collapse-btn ${isCol ? '' : 'open'}" onclick="toggleCollapse('${p.id}')">▶</button>
                <span class="proj-color" style="background:${color}"></span>
                <input class="proj-name-inp"
                    value="${escHtml(p.name)}"
                    onblur="renameProj('${p.id}', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()">
                <span class="proj-tc">${allTasks.length} tâche${allTasks.length !== 1 ? 's' : ''}</span>
                ${(p.components2||[]).length ? `<span style="font-size:11px;color:var(--text3);margin-left:8px" onclick="event.stopPropagation();openComponents('${p.id}')" title="Voir les composants">🔧 ${(p.components2||[]).length} composant${(p.components2||[]).length>1?'s':''}</span>` : (p.components ? `<span style="font-size:11px;color:var(--text3);margin-left:8px">🔧 ${escHtml(p.components)}</span>` : '')}
                <span style="margin-left:6px">${renderTags(p.tags||[], p.id, 'project', '')}</span>
                ${(p.links||[]).map(function(lk){ var tp=data.projects.find(function(x){return x.id===lk.targetId;}); if(!tp) return ''; return '<span class="proj-link '+( lk.type==="dep"?"dep":"ref")+'" onclick="event.stopPropagation();openProjectModal(\''+ tp.id +'\')">'+(lk.type==="dep"?"Depend de: ":"Ref: ")+escHtml(tp.name)+'</span>'; }).join('')}
                ${(p.budgetEst || p.budgetReal) ? `<span style="font-size:11px;color:var(--text3);margin-left:8px" title="Budget">
                    &#128176; ${p.budgetReal ? p.budgetReal.toFixed(2) : '0'}/${p.budgetEst ? p.budgetEst.toFixed(2) : '?'} EUR
                    ${p.budgetEst && p.budgetReal > p.budgetEst ? '<span style="color:var(--red)">&#x26A0;</span>' : ''}
                </span>` : ''}
                ${p.schema ? `${schemaLink(p.id, p.schema)}` : ''}
                <div class="proj-prog">
                    <div class="mini-pb">
                        <div class="mini-pb-fill" style="width:${pct}%;background:${color}"></div>
                    </div>
                    <span class="mini-pb-txt">${pct}%</span>
                </div>
                <div class="proj-actions">
                    <button class="btn btn-primary btn-sm" onclick="openTaskModal('${p.id}')" title="Ajouter une tache" style="padding:3px 10px;font-size:12px">+ Tache</button>
                    <button class="btn btn-secondary btn-sm" onclick="openComponents('${p.id}')" title="Composants" style="padding:3px 8px;font-size:11px">&#128295;</button>
                    <button class="ic-btn" onclick="duplicateProject('${p.id}')" title="Dupliquer" style="font-size:11px">&#128260;</button>
                    <button class="ic-btn" onclick="archiveProject('${p.id}')" title="${p.archived ? 'Restaurer' : 'Archiver'}" style="font-size:11px">${p.archived ? '&#128268;' : '&#128451;'}</button>
                    <button class="ic-btn" onclick="openProjectModal('${p.id}')" title="Modifier">✏️</button>
                    <button class="ic-btn" style="color:#555;font-size:11px"
                            onclick="printView('${p.id}')" title="Imprimer ce projet">&#128424;</button>
                    <button class="ic-btn" style="color:#0073ea;font-size:11px"
                            onclick="openFiles('${p.id}')" title="Fichiers du projet">&#128193;</button>
                    <button class="ic-btn" style="color:#e2445c;font-size:11px;font-weight:600"
                            onclick="exportPDF('${p.id}')" title="Exporter PDF">PDF</button>
                    <button class="btn btn-secondary btn-sm" onclick="exportExcel('${p.id}')" title="Exporter Excel" style="padding:3px 8px;font-size:11px;color:#1d6f42;border-color:#1d6f42">XLS</button>
                    <button class="ic-btn" style="color:var(--red)"
                            onclick="deleteProject('${p.id}')" title="Supprimer">🗑</button>
                </div>
            </div>`;

        // ── Tableau des tâches (affiché si pas collapsed) ──────────────
        if (!isCol) {
            const pdl = p.deadline ? dlInfo(p.deadline) : null;

            html += `
            <div class="tbl-wrap">
                <table class="btbl">
                    <thead>
                        <tr>
                            <th style="width:36px"></th>
                            <th style="min-width:260px">Tâche</th>
                            <th style="width:120px">Statut</th>
                            <th style="width:100px">Priorité</th>
                            <th style="width:120px">Deadline</th>
                            <th style="width:90px">Temps</th>
                            <th style="width:80px">Estimé</th>
                        <th style="width:80px">Passé</th>
                            <th style="width:50px"></th>
                        </tr>
                    </thead>
                    <tbody class="task-tbody">

                    <!-- Ligne résumé projet -->
                    <tr style="background:#f0f4ff;border-left:4px solid ${color}" data-proj-main="${p.id}" onclick="openProjectModal('${p.id}')">
                        <td onclick="event.stopPropagation()">
                            <button class="main-row-collapse-btn ${mainCollapsed.has(p.id) ? '' : 'open'}"
                                    onclick="event.stopPropagation();toggleMainRow('${p.id}',this)"
                                    title="Reduire/Developper les taches">&#9658;</button>
                        </td>
                        <td>
                            <div class="tname-cell">
                                <span style="font-weight:700;color:${color}">${escHtml(p.name)}</span>
                                <span style="font-size:10px;background:#eee;color:#666;padding:1px 5px;border-radius:3px;font-weight:600">
                                    ${typeLabel(p.type)}
                                </span>
                                ${p.desc ? `<span class="note-ic" title="${escHtml(p.desc)}">📝</span>` : ''}
                            </div>
                        </td>
                        <td class="cell-rel">
                            <button class="pill ${statusCls(p.status)}"
                                    onclick="event.stopPropagation(); openStatusPicker('${p.id}', this)">
                                ${statusLabel(p.status)}
                            </button>
                        </td>
                        <td><span class="pill ${prioCls(p.priority)}">${prioLabel(p.priority)}</span></td>
                        <td class="dl-cell ${pdl ? pdl.cls : ''}">${pdl ? pdl.str : '—'}</td>
                        <td></td>
                        <td style="font-size:12px;color:var(--text2)">
                            ${fmtEstimate(allTasks.reduce((s, t) => s + totalEstimate(t), 0))}
                        </td>
                        <td style="font-size:12px;color:var(--green);font-weight:500">
                            ${fmtTime(allTasks.reduce((s, t) => s + totalTimeSpent(t), 0)) || '—'}
                        </td>
                    </tr>`;

            // Lignes de tâches
            if (!mainCollapsed.has(p.id)) tasks.forEach(t => {
                const tdl       = t.deadline ? dlInfo(t.deadline) : null;
                const isRunning = timers[t.id] && timers[t.id].running;
                const spent     = (t.timeSpent || 0) + (isRunning
                    ? Math.floor((Date.now() - timers[t.id].start) / 1000)
                    : 0);

                // Rendu de la tache et de ses sous-taches
                const renderSubtasks = (subtasks, level) => {
                    if (!subtasks || !subtasks.length) return '';
                    const indent = 32 + (level * 20);
                    return subtasks.map(st => `
                    <tr class="task-row subtask-row-${level}" data-sub-of="${t.id}" onclick="openSubtaskDetail('${p.id}', '${t.id}', '${st.id}', ${level})">
                        <td onclick="event.stopPropagation()">
                            <input class="row-chk" type="checkbox" ${st.done ? 'checked' : ''}
                                   onclick="event.preventDefault(); toggleSubtask('${p.id}', '${t.id}', '${st.id}')">
                        </td>
                        <td>
                            <div class="tname-cell" style="padding-left:${indent}px">
                                <span style="color:var(--text3);margin-right:4px">${level === 1 ? '└' : '  └'}</span>
                                <span class="tname-txt ${st.done ? 'done' : ''}">${escHtml(st.name)}</span>
                                ${st.note ? `<span class="note-ic" title="${escHtml(st.note)}">&#128221;</span>` : ''}
                                ${st.subtasks && st.subtasks.length ? '<span style="font-size:10px;color:var(--text3);margin-left:4px">('+st.subtasks.length+' etape'+(st.subtasks.length>1?'s':'')+')</span>' : ''}
                                <button class="open-btn" style="border-color:#00c875;color:#00c875"
                                        onclick="event.stopPropagation(); addSubtask('${p.id}', '${t.id}', '${st.id}')">
                                    + Etape
                                </button>
                            </div>
                        </td>
                        <td class="cell-rel"><button class="pill ${statusCls(st.status||'todo')}" onclick="event.stopPropagation();openSubtaskStatusPicker('${p.id}','${t.id}','${st.id}',this)">${statusLabel(st.status||'todo')}</button></td>
                        <td><span class="pill ${prioCls(st.priority||'low')}" style="height:18px;font-size:10px">${prioLabel(st.priority||'low')}</span></td>
                        <td class="dl-cell">${st.deadline ? dlInfo(st.deadline)?.str || '' : '—'}</td>
                        <td></td>
                        <td style="font-size:12px;color:var(--text2)">${fmtEstimate(st.estimate)}</td>
                        <td onclick="event.stopPropagation()">
                            <button class="ic-btn" style="color:var(--red);font-size:12px"
                                    onclick="deleteSubtask('${p.id}','${t.id}','${st.id}')">x</button>
                        </td>
                    </tr>
                    ${level < 2 ? renderSubtasks(st.subtasks || [], level + 1) : ''}
                    `).join('');
                };

                html += `
                    <tr class="task-row ${t.done ? 'row-done' : ''}" data-task-row="${t.id}" data-proj-id="${p.id}" onclick="openTaskDetail('${p.id}', '${t.id}')">
                        <td onclick="event.stopPropagation()">
                            <input class="row-chk" type="checkbox" ${t.done ? 'checked' : ''}
                                   data-task-chk="${t.id}" onclick="event.preventDefault(); toggleTask('${p.id}', '${t.id}')">
                        </td>
                        <td>
                            <div style="display:flex;flex-direction:column;min-width:0;max-width:400px">
                                <div class="tname-cell">
     
                                    ${(t.subtasks && t.subtasks.length) ? `<button class="task-collapse-btn open" onclick="event.stopPropagation();toggleTaskCollapse('${t.id}',this)" title="Reduire/Developper">&#9658;</button>` : '<span style="width:16px;display:inline-block"></span>'}                               ${t.depends ? `<span style="font-size:10px;color:var(--text3)">&#128279;</span>` : ''}
                                    <span class="tname-txt ${t.done ? 'done' : ''}">${escHtml(t.name)}</span>
                                    ${t.note ? `<span class="note-ic" title="${escHtml(t.note)}">&#128221;</span>` : ''}
                                    ${t.reminder && !t.done ? `<span class="note-ic" title="Rappel : ${t.reminder.replace('T',' ')}">&#128276;</span>` : ''}
                                    <button class="open-btn" onclick="event.stopPropagation(); openTaskDetail('${p.id}', '${t.id}')">Ouvrir</button>
                                    <button class="open-btn" style="border-color:#00c875;color:#00c875" onclick="event.stopPropagation(); addSubtask('${p.id}', '${t.id}', null)">+ Etape</button>
                                </div>
                                ${t.tags && t.tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:3px">${renderTags(t.tags, t.id, 'task', p.id)}</div>` : ''}
                            </div>
                        </td>
                        <td class="cell-rel"><button class="pill ${statusCls(t.status||'todo')}" onclick="event.stopPropagation();openTaskStatusPicker('${p.id}','${t.id}',this)">${statusLabel(t.status||'todo')}</button></td>
                        <td><span class="pill ${prioCls(t.priority)}">${prioLabel(t.priority)}</span></td>
                        <td class="dl-cell ${tdl ? tdl.cls : ''}">${tdl ? tdl.str : '—'}</td>
                        <td onclick="event.stopPropagation()">
                            <button class="tt-btn ${isRunning ? 'running' : ''}"
                                    onclick="toggleTimer('${p.id}', '${t.id}')">
                                ${isRunning ? '⏹' : '▶'} ${spent > 0 ? fmtTime(spent) : ''}
                            </button>
                        </td>
                        <td style="font-size:12px;color:var(--text2)">
                            ${fmtEstimate(totalEstimate(t))}
                        </td>
                        <td style="font-size:12px;color:var(--text2)">
                            ${totalTimeSpent(t) > 0 ? fmtTime(totalTimeSpent(t)) : (t.done ? '—' : '')}
                        </td>
                        <td onclick="event.stopPropagation()">
                            <button class="ic-btn" style="color:var(--red);font-size:12px"
                                    onclick="deleteTask('${p.id}', '${t.id}')">✕</button>
                        </td>
                    </tr>`;
                html += renderSubtasks(t.subtasks || [], 1);
            });

            html += `
                    </tbody>
                </table>

                <!-- Bouton ajout rapide de tâche -->
                <table class="btbl">
                    <tbody class="task-tbody">
                        <tr class="add-row">
                            <td colspan="8">
                                <button class="add-task-btn" onclick="openTaskModal('${p.id}')">
                                    ＋ Ajouter une tâche
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>`;
        }

        html += '</div>';    // fin .project-block
    });

    // Bouton d'ajout d'un nouveau projet
    html += `
        <div class="add-proj-row">
            <button class="add-proj-btn" onclick="openProjectModal()">＋ Ajouter un projet</button>
        </div>
    </div>`;

    // Stats avancees en bas du dashboard
    const dashEl = document.getElementById('content');
    // Ajouter les projets archives en bas si showArchived
    if (showArchived) {
        var archived = data.projects.filter(function(p) { return p.archived; });
        if (archived.length) {
            // Barre d'actions archives
            html += '<div id="archives-section" style="margin:24px 0 8px">';
            html += '<div style="font-size:13px;font-weight:700;color:var(--text2);display:flex;align-items:center;gap:8px;margin-bottom:10px">'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span>'
                  + '<span>&#128451; Archives (' + archived.length + ')</span>'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span></div>';
            // Bouton supprimer selection
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">'
                  + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer">'
                  + '<input type="checkbox" id="arc-select-all" onchange="toggleAllArchives(this.checked)" style="cursor:pointer"> Tout selectionner</label>'
                  + '<div style="flex:1"></div>'
                  + '<button class="btn btn-sm" id="arc-del-sel-btn" onclick="deleteSelectedArchives()" '
                  + 'style="color:var(--red);font-size:12px;display:none">&#128465; Supprimer la selection</button>'
                  + '</div>';
            // Lignes archives
            archived.forEach(function(p) {
                html += '<div class="project-block" style="opacity:0.65;border:1px dashed var(--border);border-radius:8px;margin-bottom:6px">'
                      + '<div class="proj-hdr" style="background:var(--bg);gap:10px">'
                      + '<input type="checkbox" class="arc-chk" data-arcid="' + p.id + '" data-arcname="' + escHtml(p.name) + '" onchange="updateArcDelBtn()" style="cursor:pointer;flex-shrink:0">'
                      + '<span class="proj-name" style="color:var(--text2)">&#128451; ' + escHtml(p.name) + '</span>'
                      + '<div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0">'
                      + '<button class="btn btn-secondary btn-sm" onclick="archiveProject(\'' + p.id + '\')" style="font-size:11px">&#8635; Restaurer</button>'
                      + '</div></div></div>';
            });
            html += '</div>';
        }
    }
    dashEl.innerHTML = html + buildAdvancedStats(projs);
}

/**
 * Collapse/expand un projet dans la vue tableau.
 * @param {string} id - ID du projet
 */

function openTaskStatusPicker(projId, taskId, btn) {
    document.querySelectorAll('.spopup').forEach(x => x.remove());
    const popup = document.createElement('div');
    popup.className = 'spopup open';
    [
        ['todo',  's-todo',  'A faire'],
        ['prog',  's-prog',  'En cours'],
        ['done',  's-done',  'Termine'],
        ['block', 's-block', 'Bloque']
    ].forEach(([s, cls, l]) => {
        const opt = document.createElement('div');
        opt.className = 'spopup-opt pill ' + cls;
        opt.style.display = 'block';
        opt.style.textAlign = 'center';
        opt.textContent = l;
        opt.onclick = async () => {
            const t = (data.tasks[projId] || []).find(x => x.id === taskId);
            if (t) {
                t.status = s;
                if (s === 'done') t.done = true;
                else if (s === 'todo') t.done = false;
                await apiPost('/api/tasks', { projectId: projId, task: t });
                renderAll();
            }
            popup.remove();
        };
        popup.appendChild(opt);
    });
    document.body.appendChild(popup);
    const rect = btn.getBoundingClientRect();
    popup.style.display = 'block';
    const ph = popup.offsetHeight;
    const pw = popup.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < ph + 10) {
        popup.style.top = (rect.top - ph - 4) + 'px';
    } else {
        popup.style.top = (rect.bottom + 4) + 'px';
    }
    popup.style.left = Math.min(rect.left, window.innerWidth - pw - 8) + 'px';
    setTimeout(() => document.addEventListener('click', () => popup.remove(), { once: true }), 50);
}


/* =============================================================================
   SOUS-TACHES
   ============================================================================= */

/** Genere un ID unique */
function genSubId() { return 'st' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

/** Trouve une tache par ID (recherche recursive) */
function findTask(projId, taskId) {
    return (data.tasks[projId] || []).find(x => x.id === taskId);
}

/** Trouve une sous-tache dans l'arbre */
function findSubtask(subtasks, subId) {
    for (const st of subtasks) {
        if (st.id === subId) return st;
        if (st.subtasks) {
            const found = findSubtask(st.subtasks, subId);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Ouvre une modale pour ajouter une sous-tache.
 * @param {string} projId  - ID projet
 * @param {string} taskId  - ID tache parente
 * @param {string|null} parentSubId - ID sous-tache parente (null = niveau 1)
 */
// Variables pour la modale sous-tache
let _subProjId = null, _subTaskId = null, _subParentId = null;

function addSubtask(projId, taskId, parentSubId) {
    _subProjId   = projId;
    _subTaskId   = taskId;
    _subParentId = parentSubId;

    // Titre de la modale
    const t = findTask(projId, taskId);
    document.getElementById('modal-sub-title').textContent =
        parentSubId ? 'Nouvelle sous-etape' : 'Nouvelle etape';
    document.getElementById('sub-name').value     = '';
    document.getElementById('sub-priority').value = 'med';
    document.getElementById('sub-deadline').value = '';
    document.getElementById('sub-estimate').value = '';
    document.getElementById('sub-note').value     = '';
    document.getElementById('modal-subtask').classList.add('open');
    setTimeout(() => document.getElementById('sub-name').focus(), 100);
}

async function saveSubtask() {
    const name = document.getElementById('sub-name').value.trim();
    if (!name) { toast('Nom requis !', true); return; }

    const t = findTask(_subProjId, _subTaskId);
    if (!t) return;

    const newSub = {
        id:       genSubId(),
        name,
        done:     false,
        status:   'todo',
        priority: document.getElementById('sub-priority').value,
        deadline: document.getElementById('sub-deadline').value,
        estimate: parseFloat(document.getElementById('sub-estimate').value) || 0,
        note:     document.getElementById('sub-note').value.trim(),
        subtasks: []
    };

    if (!_subParentId) {
        if (!t.subtasks) t.subtasks = [];
        t.subtasks.push(newSub);
    } else {
        if (!t.subtasks) t.subtasks = [];
        const parent = findSubtask(t.subtasks, _subParentId);
        if (parent) {
            if (!parent.subtasks) parent.subtasks = [];
            parent.subtasks.push(newSub);
        }
    }

    // Si la tache etait terminee, elle repasse en cours
    if (t.status === 'done' || t.done) {
        t.status = 'prog';
        t.done   = false;
        toast('Tache repassee en cours car une etape a ete ajoutee');
    }

    await apiPost('/api/tasks', { projectId: _subProjId, task: t });
    addActivity('Etape ajoutee : ' + newSub.name);
    closeModal('modal-subtask');
    toast('Etape ajoutee !');
    renderAll();
}

/**
 * Bascule l'etat done d'une sous-tache.
 */
function toggleSubtask(projId, taskId, subId) {
    const t = findTask(projId, taskId);
    if (!t) return;
    const st = findSubtask(t.subtasks || [], subId);
    if (st) {
        // Bloquer si on veut cocher mais les enfants ne sont pas tous termines
        if (!st.done && st.subtasks && st.subtasks.length > 0) {
            function allChildDone(subs) {
                return (subs || []).every(function(s) { return s.done && allChildDone(s.subtasks); });
            }
            if (!allChildDone(st.subtasks)) {
                toast('Terminer d abord toutes les sous-etapes !', true);
                return;
            }
        }

        st.done   = !st.done;
        st.status = st.done ? 'done' : 'todo';

        // Verifier recursivement si TOUTES les sous-taches a tous les niveaux sont terminees
        function allDoneRecursive(subtasks) {
            if (!subtasks || !subtasks.length) return true;
            return subtasks.every(function(s) {
                return s.done && allDoneRecursive(s.subtasks);
            });
        }

        const allDone = (t.subtasks || []).length > 0 && allDoneRecursive(t.subtasks);

        if (allDone) {
            t.done   = true;
            t.status = 'done';
            toast('Toutes les etapes terminees !');
        } else if (t.done || t.status === 'done') {
            // Au moins une etape non terminee -> repasser en cours
            t.done   = false;
            t.status = 'prog';
        }

        apiPost('/api/tasks', { projectId: projId, task: t });
        renderAll();
    }
}


function deleteSubtask(projId, taskId, subId) {
    const t = findTask(projId, taskId);
    if (!t) return;
    const _stObj = findSubtask(t.subtasks || [], subId);
    const _stName = _stObj ? _stObj.name : 'cette etape';
    if (!window.__delSubConfirmed) {
        showConfirm('Supprimer cette etape ?', '"' + _stName + '"', function() {
            window.__delSubConfirmed = true;
            deleteSubtask(projId, taskId, subId);
        });
        return;
    }
    window.__delSubConfirmed = false;

    const removeFromList = (list) => {
        const idx = list.findIndex(x => x.id === subId);
        if (idx >= 0) { list.splice(idx, 1); return true; }
        for (const st of list) {
            if (st.subtasks && removeFromList(st.subtasks)) return true;
        }
        return false;
    };

    removeFromList(t.subtasks || []);
    apiPost('/api/tasks', { projectId: projId, task: t });
    addActivity('Etape supprimee');
    renderAll();
}

/**
 * Popup statut pour une sous-tache.
 */
function openSubtaskStatusPicker(projId, taskId, subId, btn) {
    document.querySelectorAll('.spopup').forEach(x => x.remove());
    const popup = document.createElement('div');
    popup.className = 'spopup open';
    [
        ['todo',  's-todo',  'A faire'],
        ['prog',  's-prog',  'En cours'],
        ['done',  's-done',  'Termine'],
        ['block', 's-block', 'Bloque']
    ].forEach(([s, cls, l]) => {
        const opt = document.createElement('div');
        opt.className = 'spopup-opt pill ' + cls;
        opt.style.display = 'block';
        opt.style.textAlign = 'center';
        opt.textContent = l;
        opt.onclick = async () => {
            const t = findTask(projId, taskId);
            if (t) {
                const st = findSubtask(t.subtasks || [], subId);
                if (st) {
                    st.status = s;
                    st.done = (s === 'done');
                    await apiPost('/api/tasks', { projectId: projId, task: t });
                    renderAll();
                }
            }
            popup.remove();
        };
        popup.appendChild(opt);
    });
    document.body.appendChild(popup);
    const rect = btn.getBoundingClientRect();
    popup.style.display = 'block';
    const ph = popup.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    popup.style.top = (spaceBelow < ph + 10 ? rect.top - ph - 4 : rect.bottom + 4) + 'px';
    popup.style.left = Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8) + 'px';
    setTimeout(() => document.addEventListener('click', () => popup.remove(), { once: true }), 50);
}

/**
 * Ouvre le detail d'une sous-tache (dans la modale detail).
 */
function openSubtaskDetail(projId, taskId, subId, level) {
    const t = findTask(projId, taskId);
    if (!t) return;
    const st = findSubtask(t.subtasks || [], subId);
    if (!st) return;

    document.getElementById('det-title').textContent = st.name;
    const dl = st.deadline ? dlInfo(st.deadline) : null;
    document.getElementById('det-body').innerHTML = `
        <div style="font-size:11px;color:var(--text2);margin-bottom:12px">
            Sous-etape de : <strong>${escHtml(t.name)}</strong>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;margin-bottom:5px">Statut</div>
                <span class="pill ${statusCls(st.status||'todo')}">${statusLabel(st.status||'todo')}</span>
            </div>
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;margin-bottom:5px">Priorite</div>
                <span class="pill ${prioCls(st.priority||'med')}">${prioLabel(st.priority||'med')}</span>
            </div>
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;margin-bottom:5px">Deadline</div>
                <div class="dl-cell ${dl?dl.cls:''}">${dl?dl.str:'Non definie'}</div>
            </div>
        </div>
        ${st.note ? `<div><div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;margin-bottom:5px">Notes</div>
        <div style="background:var(--bg);border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.6">${escHtml(st.note)}</div></div>` : ''}
        ${st.subtasks && st.subtasks.length ? `
        <div style="margin-top:12px">
            <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;margin-bottom:8px">Sous-etapes (${st.subtasks.length})</div>
            ${st.subtasks.map(ss => `
            <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
                <input type="checkbox" ${ss.done?'checked':''} onchange="toggleSubtask('${projId}','${taskId}','${ss.id}')" style="accent-color:var(--accent)">
                <span style="font-size:13px;${ss.done?'text-decoration:line-through;color:var(--text3)':''}">${escHtml(ss.name)}</span>
            </div>`).join('')}
        </div>` : ''}
    `;
    document.getElementById('det-del').onclick = () => { closeModal('modal-detail'); deleteSubtask(projId, taskId, subId); };
    document.getElementById('det-edit').onclick = () => { closeModal('modal-detail'); };
    document.getElementById('modal-detail').classList.add('open');
}



/**
 * Calcule le temps estime total d'une tache + toutes ses sous-taches recursif.
 * @param {object} task
 * @returns {number} heures
 */

/**
 * Formate une estimation en heures vers "Xh YYmin"
 * Ex: 1.72 -> "1h 43min", 0.5 -> "30min", 2 -> "2h"
 */
function fmtEstimate(hours) {
    if (!hours || hours <= 0) return '—';
    var h   = Math.floor(hours);
    var min = Math.round((hours - h) * 60);
    if (min === 60) { h++; min = 0; }
    if (h > 0 && min > 0) return h + 'h ' + min + 'min';
    if (h > 0)            return h + 'h';
    return min + 'min';
}
function totalEstimate(task) {
    const own = parseFloat(task.estimate) || 0;
    const subs = (task.subtasks || []).reduce((s, st) => s + totalEstimate(st), 0);
    return Math.round((own + subs) * 10) / 10;
}

/**
 * Calcule le temps passe total d'une tache + sous-taches.
 */
function totalTimeSpent(task) {
    const own = task.timeSpent || 0;
    const subs = (task.subtasks || []).reduce((s, st) => s + totalTimeSpent(st), 0);
    return own + subs;
}


/* =============================================================================
   EXPORT PDF
   ============================================================================= */

/**
 * Exporte un ou plusieurs projets en PDF via window.print().
 * @param {string|null} projId - null = tous les projets
 */
function exportPDF(projId) {
    const projs = projId
        ? data.projects.filter(p => p.id === projId)
        : getFilteredProjects();

    if (!projs.length) { toast('Aucun projet a exporter', true); return; }

    // Construire le contenu HTML du PDF
    const rows = projs.map(p => {
        const tasks = data.tasks[p.id] || [];
        const totalEst = tasks.reduce((s, t) => s + totalEstimate(t), 0);
        const totalSpent = tasks.reduce((s, t) => s + totalTimeSpent(t), 0);
        const doneCnt = tasks.filter(t => t.done).length;
        const pct = tasks.length ? Math.round(doneCnt / tasks.length * 100) : 0;
        const dl = p.deadline ? dlInfo(p.deadline) : null;

        // Rendu recursif des sous-taches
        const renderSubHTML = (subtasks, level) => {
            if (!subtasks || !subtasks.length) return '';
            return subtasks.map(st => `
                <tr class="pdf-subtask pdf-level-${level}">
                    <td style="padding-left:${20 + level * 16}px">
                        ${'&nbsp;&nbsp;'.repeat(level)}&#x2514; ${escHtml(st.name)}
                        ${st.note ? `<div class="pdf-note">${escHtml(st.note)}</div>` : ''}
                    </td>
                    <td>${statusLabel(st.status || 'todo')}</td>
                    <td>${prioLabel(st.priority || 'med').replace(/🔴|🟡|🟢/g,'').trim()}</td>
                    <td>${st.deadline ? dlInfo(st.deadline)?.str || '' : '-'}</td>
                    <td>${st.estimate ? st.estimate + 'h' : '-'}</td>
                    <td>${st.timeSpent ? fmtTime(st.timeSpent) : '-'}</td>
                </tr>
                ${level < 2 ? renderSubHTML(st.subtasks || [], level + 1) : ''}
            `).join('');
        };

        const taskRows = tasks.map(t => {
            const tdl = t.deadline ? dlInfo(t.deadline) : null;
            const est = totalEstimate(t);
            const spent = totalTimeSpent(t);
            return `
                <tr class="pdf-task ${t.done ? 'pdf-done' : ''}">
                    <td style="padding-left:16px">
                        ${t.done ? '&#x2713; ' : '&#x25A1; '} ${escHtml(t.name)}
                        ${t.note ? `<div class="pdf-note">${escHtml(t.note)}</div>` : ''}
                    </td>
                    <td>${statusLabel(t.status || 'todo')}</td>
                    <td>${prioLabel(t.priority).replace(/🔴|🟡|🟢/g,'').trim()}</td>
                    <td class="${tdl ? tdl.cls : ''}">${tdl ? tdl.str : '-'}</td>
                    <td>${est > 0 ? fmtEstimate(est) : '-'}</td>
                    <td>${spent > 0 ? fmtTime(spent) : '-'}</td>
                </tr>
                ${renderSubHTML(t.subtasks || [], 1)}
            `;
        }).join('');

        return `
        <div class="pdf-project">
            <div class="pdf-project-header">
                <div class="pdf-project-title">${escHtml(p.name)}</div>
                <div class="pdf-project-meta">
                    <span class="pdf-badge pdf-${p.status}">${statusLabel(p.status)}</span>
                    <span class="pdf-badge pdf-prio-${p.priority}">${prioLabel(p.priority).replace(/🔴|🟡|🟢/g,'').trim()}</span>
                    <span>${typeLabel(p.type).replace(/🔌|💻|⚙️/g,'').trim()}</span>
                    ${dl ? `<span class="${dl.cls}">${dl.str}</span>` : ''}
                    <span>Avancement : ${pct}% (${doneCnt}/${tasks.length} taches)</span>
                    ${data.projects.filter(function(p){return p.archived;}).length > 0 ? `
        <div class="sum-item">
            <span class="sum-dot" style="background:#888"></span>
            <span class="sum-lbl">Archives</span>
            <span class="sum-val">${data.projects.filter(function(p){return p.archived;}).length}</span>
        </div>` : ''}
        ${totalEst > 0 ? `<span>Estime : ${fmtEstimate(totalEst)}</span>` : ''}
                    ${totalSpent > 0 ? `<span>Passe : ${fmtTime(totalSpent)}</span>` : ''}
                </div>
                ${p.desc ? `<div class="pdf-desc">${escHtml(p.desc)}</div>` : ''}
                ${p.components ? `<div class="pdf-components">Composants : ${escHtml(p.components)}</div>` : ''}
            </div>

            ${tasks.length ? `
            <table class="pdf-table">
                <thead>
                    <tr>
                        <th>Tache / Etape</th>
                        <th>Statut</th>
                        <th>Priorite</th>
                        <th>Deadline</th>
                        <th>Estime</th>
                        <th>Passe</th>
                    </tr>
                </thead>
                <tbody>${taskRows}</tbody>
            </table>` : '<p class="pdf-no-tasks">Aucune tache</p>'}
        </div>`;
    }).join('');

    const printContent = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>Export Projets - ${new Date().toLocaleDateString('fr-FR')}</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
                body { color: #323338; font-size: 11pt; padding: 20px; }
                h1 { font-size: 18pt; color: #0073ea; margin-bottom: 6px; }
                .pdf-date { font-size: 9pt; color: #676879; margin-bottom: 20px; }
                .pdf-project { margin-bottom: 30px; page-break-inside: avoid; }
                .pdf-project-header { background: #f6f7fb; border-left: 4px solid #0073ea; padding: 10px 14px; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
                .pdf-project-title { font-size: 14pt; font-weight: 700; color: #0073ea; margin-bottom: 6px; }
                .pdf-project-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 9pt; color: #676879; margin-bottom: 4px; }
                .pdf-desc { font-size: 9pt; color: #676879; margin-top: 6px; font-style: italic; }
                .pdf-components { font-size: 9pt; color: #676879; margin-top: 4px; }
                .pdf-badge { padding: 1px 6px; border-radius: 3px; font-size: 8pt; font-weight: 600; }
                .pdf-todo  { background: #e2e2e2; color: #555; }
                .pdf-prog  { background: #fdab3d; color: #fff; }
                .pdf-done  { background: #00c875; color: #fff; }
                .pdf-block { background: #e2445c; color: #fff; }
                .pdf-prio-high { background: #e2445c; color: #fff; }
                .pdf-prio-med  { background: #fdab3d; color: #fff; }
                .pdf-prio-low  { background: #00c875; color: #fff; }
                .pdf-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                .pdf-table thead tr { background: #e6e9ef; }
                .pdf-table th { padding: 6px 8px; text-align: left; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #c3c6d4; }
                .pdf-table td { padding: 5px 8px; border-bottom: 1px solid #e6e9ef; vertical-align: top; }
                .pdf-task td:first-child { font-weight: 500; }
                .pdf-done td { color: #888; text-decoration: line-through; }
                .pdf-subtask td { color: #555; font-size: 8.5pt; background: #fafbff; }
                .pdf-level-2 td { color: #777; background: #f5f6fa; }
                .pdf-note { font-size: 8pt; color: #676879; font-style: italic; margin-top: 2px; text-decoration: none; }
                .pdf-no-tasks { font-size: 9pt; color: #c3c6d4; font-style: italic; padding: 8px; }
                .overdue { color: #e2445c; font-weight: 600; }
                .soon { color: #fdab3d; font-weight: 600; }
                @media print {
                    body { padding: 10px; }
                    .pdf-project { page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <h1>Rapport de Projets</h1>
            <div class="pdf-date">Exporte le ${new Date().toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}</div>
            ${rows}
        </body>
        </html>`;

    // Ouvrir dans un nouvel onglet et imprimer
    const win = window.open('', '_blank');
    win.document.write(printContent);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
}



/**
 * Marque recursivement toutes les sous-taches comme done/undone.
 */
function setAllSubtasksDone(subtasks, done) {
    if (!subtasks) return;
    subtasks.forEach(st => {
        st.done   = done;
        st.status = done ? 'done' : 'todo';
        setAllSubtasksDone(st.subtasks, done);
    });
}


/* =============================================================================
   COMMENTAIRES SUR LES TACHES
   ============================================================================= */

/**
 * Ajoute un commentaire a une tache.
 */
async function addComment(projId, taskId) {
    const textarea = document.getElementById('comment-input-' + taskId);
    const text = textarea ? textarea.value.trim() : '';
    if (!text) { toast('Ecris un commentaire !', true); return; }

    const t = findTask(projId, taskId);
    if (!t) return;

    if (!t.comments) t.comments = [];
    t.comments.push({
        id:   genId(),
        text,
        date: new Date().toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
    });

    await apiPost('/api/tasks', { projectId: projId, task: t });
    textarea.value = '';
    toast('Commentaire ajoute !');
    // Rerendre uniquement la section commentaires
    openTaskDetail(projId, taskId);
}

/**
 * Supprime un commentaire.
 */
async function deleteComment(projId, taskId, commentId) {
    const t = findTask(projId, taskId);
    if (!t || !t.comments) return;
    t.comments = t.comments.filter(c => c.id !== commentId);
    await apiPost('/api/tasks', { projectId: projId, task: t });
    toast('Commentaire supprime');
    openTaskDetail(projId, taskId);
}

/**
 * Edite un commentaire existant.
 */
async function editComment(projId, taskId, commentId) {
    const t = findTask(projId, taskId);
    if (!t || !t.comments) return;
    const comment = t.comments.find(c => c.id === commentId);
    if (!comment) return;

    const newText = prompt('Modifier le commentaire :', comment.text);
    if (!newText || !newText.trim()) return;

    comment.text = newText.trim();
    comment.date += ' (modifie)';
    await apiPost('/api/tasks', { projectId: projId, task: t });
    toast('Commentaire modifie !');
    openTaskDetail(projId, taskId);
}


/* === TAGS === */
const PRESET_TAGS = ['impression3D','electronique','mecanique','firmware','urgent','en-attente','test','debug','achat','documentation','prototype','v1.0'];
const TAG_COLORS  = [
    {bg:'#e8f0fe',fg:'#0073ea'},
    {bg:'#fff0e0',fg:'#e07000'},
    {bg:'#e8ffe8',fg:'#008800'},
    {bg:'#ffe8e8',fg:'#cc0000'},
    {bg:'#f0e8ff',fg:'#7700cc'},
    {bg:'#e8fff8',fg:'#007755'}
];

function tagColor(tag) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
    return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

function renderTags(tags, entityId, entityType, projId) {
    if (!tags || !tags.length) return '';
    return tags.map(t => {
        const c = tagColor(t);
        return `<span class="tag" style="background:${c.bg};color:${c.fg}">#${escHtml(t)}`
             + `<button class="tag-del" onclick="event.stopPropagation();removeTag('${entityType}','${entityId}','${t}','${projId||''}')">x</button></span>`;
    }).join('');
}

function buildTagWidget(taskId, projId, tags) {
    const tTags = tags || [];
    const suggestions = PRESET_TAGS.filter(x => !tTags.includes(x)).slice(0, 8);
    const inputId = 'tag-inp-' + taskId;
    const dlId    = 'tag-dl-'  + taskId;

    let html = '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">';
    html += '<div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Tags</div>';
    html += '<div class="tags-wrap" style="margin-bottom:8px">' + renderTags(tTags, taskId, 'task', projId) + '</div>';

    // Champ input + bouton ajouter
    html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';
    html += `<input id="${inputId}" type="text" placeholder="Nouveau tag..." list="${dlId}" `;
    html += `style="border:1.5px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px;outline:none;width:140px">`;
    html += `<datalist id="${dlId}">` + PRESET_TAGS.map(t => `<option value="${t}">`).join('') + '</datalist>';

    // Bouton utilise data-attrs pour eviter les quotes imbriquees
    html += `<button class="btn btn-secondary btn-sm" data-tid="${taskId}" data-pid="${projId}" onclick="addTagFromInput(this)">+ Tag</button>`;
    html += '</div>';

    // Suggestions
    if (suggestions.length) {
        html += '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">';
        suggestions.forEach(s => {
            const c = tagColor(s);
            html += `<span class="tag-suggestion" style="background:${c.bg};color:${c.fg};border-color:${c.fg}" `
                  + `data-tid="${taskId}" data-pid="${projId}" data-tag="${s}" onclick="addTagFromSuggestion(this)">#${s}</span>`;
        });
        html += '</div>';
    }
    html += '</div>';
    return html;
}

// Helpers qui lisent les data-attrs pour eviter les quotes imbriquees
function addTagFromInput(btn) {
    const tid = btn.dataset.tid;
    const pid = btn.dataset.pid;
    const val = document.getElementById('tag-inp-' + tid).value;
    addTag('task', tid, val, pid);
}

function addTagFromSuggestion(el) {
    addTag('task', el.dataset.tid, el.dataset.tag, el.dataset.pid);
}

async function addTag(entityType, entityId, tagVal, projId) {
    const tag = (tagVal || '').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '');
    if (!tag) { toast('Tag invalide !', true); return; }

    if (entityType === 'project') {
        const p = data.projects.find(x => x.id === entityId);
        if (!p) return;
        if (!p.tags) p.tags = [];
        if (p.tags.includes(tag)) { toast('Tag deja present', true); return; }
        p.tags.push(tag);
        await apiPost('/api/projects', p);
    } else {
        const t = findTask(projId, entityId);
        if (!t) return;
        if (!t.tags) t.tags = [];
        if (t.tags.includes(tag)) { toast('Tag deja present', true); return; }
        t.tags.push(tag);
        await apiPost('/api/tasks', { projectId: projId, task: t });
    }
    toast('#' + tag + ' ajoute !');
    renderAll();
    if (entityType === 'task' && document.getElementById('modal-detail').classList.contains('open')) {
        setTimeout(() => openTaskDetail(projId, entityId), 100);
    }
}

async function removeTag(entityType, entityId, tag, projId) {
    if (entityType === 'project') {
        const p = data.projects.find(x => x.id === entityId);
        if (!p || !p.tags) return;
        p.tags = p.tags.filter(t => t !== tag);
        await apiPost('/api/projects', p);
    } else {
        const t = findTask(projId, entityId);
        if (!t || !t.tags) return;
        t.tags = t.tags.filter(x => x !== tag);
        await apiPost('/api/tasks', { projectId: projId, task: t });
    }
    toast('#' + tag + ' supprime');
    renderAll();
    if (entityType === 'task' && document.getElementById('modal-detail').classList.contains('open')) {
        setTimeout(() => openTaskDetail(projId, entityId), 100);
    }
}


function refreshProjectTagsUI() {
    const wrap = document.getElementById('f-tags-wrap');
    const sugWrap = document.getElementById('f-tag-suggestions');
    const dl = document.getElementById('f-tag-dl');
    if (!wrap) return;

    // Tags actuels
    wrap.innerHTML = '';
    editingProjTags.forEach(function(t) {
        const c = tagColor(t);
        const span = document.createElement('span');
        span.className = 'tag';
        span.style.cssText = 'background:' + c.bg + ';color:' + c.fg;
        span.textContent = '#' + t;
        const btn = document.createElement('button');
        btn.className = 'tag-del';
        btn.textContent = 'x';
        btn.dataset.tag = t;
        btn.onclick = function() { removeProjTag(this.dataset.tag); };
        span.appendChild(btn);
        wrap.appendChild(span);
    });

    // Suggestions
    if (sugWrap) {
        sugWrap.innerHTML = '';
        PRESET_TAGS.filter(function(t) { return !editingProjTags.includes(t); }).slice(0, 8).forEach(function(s) {
            const c = tagColor(s);
            const el = document.createElement('span');
            el.className = 'tag-suggestion';
            el.style.cssText = 'background:' + c.bg + ';color:' + c.fg + ';border-color:' + c.fg;
            el.textContent = '#' + s;
            el.dataset.tag = s;
            el.onclick = function() { addProjTag(this.dataset.tag); };
            sugWrap.appendChild(el);
        });
    }

    // Datalist
    if (dl) dl.innerHTML = PRESET_TAGS.map(function(t) { return '<option value="' + t + '">'; }).join('');
}

function addProjTag(tag) {
    const val = tag || (document.getElementById('f-tag-input').value || '').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '');
    if (!val) return;
    if (!editingProjTags.includes(val)) editingProjTags.push(val);
    const inp = document.getElementById('f-tag-input');
    if (inp) inp.value = '';
    refreshProjectTagsUI();
}

function addTagFromProjectModal() {
    const val = (document.getElementById('f-tag-input').value || '').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '');
    if (val) addProjTag(val);
}

function removeProjTag(tag) {
    editingProjTags = editingProjTags.filter(function(t) { return t !== tag; });
    refreshProjectTagsUI();
}

function toggleDark() {
    document.body.classList.toggle('dark');
    localStorage.setItem('darkMode', document.body.classList.contains('dark') ? '1' : '0');
}

// Appliquer le mode sombre au chargement si preference sauvegardee
if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark');
}


/* === COMPOSANTS === */
let _compProjId = null;

function openComponents(projId) {
    _compProjId = projId;
    const p = data.projects.find(x => x.id === projId);
    if (!p) return;
    document.getElementById('comp-title').textContent = 'Composants : ' + p.name;
    renderComponentRows(p.components2 || []);
    document.getElementById('modal-components').classList.add('open');
}

function renderComponentRows(comps) {
    const tbody = document.getElementById('comp-tbody');
    tbody.innerHTML = '';
    comps.forEach(function(c, i) {
        tbody.appendChild(makeCompRow(c, i));
    });
    updateCompTotal();
}

function makeCompRow(c, idx) {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    tr.innerHTML =
        '<td><input type="text" placeholder="Ex: Arduino Mega" value="' + escHtml(c.name||'') + '" data-field="name" oninput="updateCompTotal()"></td>' +
        '<td><input type="number" min="1" value="' + (c.qty||1) + '" data-field="qty" style="width:60px" oninput="updateCompTotal()"></td>' +
        '<td><input type="text" placeholder="Ex: AliExpress" value="' + escHtml(c.supplier||'') + '" data-field="supplier"></td>' +
        '<td><input type="number" min="0" step="0.01" value="' + (c.price||'') + '" placeholder="0.00" data-field="price" oninput="updateCompTotal()"> EUR</td>' +
        '<td><input type="url" placeholder="https://..." value="' + escHtml(c.url||'') + '" data-field="url"></td>' +
        '<td><button class="ic-btn" style="color:var(--red)" onclick="removeCompRow(this)">x</button></td>';
    return tr;
}

function addComponentRow() {
    const tbody = document.getElementById('comp-tbody');
    const idx = tbody.children.length;
    tbody.appendChild(makeCompRow({name:'',qty:1,supplier:'',price:'',url:''}, idx));
}

function removeCompRow(btn) {
    btn.closest('tr').remove();
    updateCompTotal();
}

function updateCompTotal() {
    let total = 0;
    document.querySelectorAll('#comp-tbody tr').forEach(function(tr) {
        const qty   = parseFloat(tr.querySelector('[data-field="qty"]').value)   || 0;
        const price = parseFloat(tr.querySelector('[data-field="price"]').value) || 0;
        total += qty * price;
    });
    const el = document.getElementById('comp-total');
    if (el) el.textContent = total > 0 ? 'Total : ' + total.toFixed(2) + ' EUR' : '';
}

async function saveComponents() {
    const rows = [];
    document.querySelectorAll('#comp-tbody tr').forEach(function(tr) {
        const name = tr.querySelector('[data-field="name"]').value.trim();
        if (!name) return;
        rows.push({
            name,
            qty:      parseFloat(tr.querySelector('[data-field="qty"]').value)   || 1,
            supplier: tr.querySelector('[data-field="supplier"]').value.trim(),
            price:    parseFloat(tr.querySelector('[data-field="price"]').value) || 0,
            url:      tr.querySelector('[data-field="url"]').value.trim()
        });
    });

    const p = data.projects.find(x => x.id === _compProjId);
    if (!p) return;
    p.components2 = rows;
    await apiPost('/api/projects', p);
    toast('Composants sauvegardes !');
    closeModal('modal-components');
    renderAll();
}

function pickSchemaFile(input) {
    const file = input.files[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
        // Convertir en base64 pour persistance
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            document.getElementById('f-schema').value = base64;
            updateSchemaPreview(base64);
        };
        reader.readAsDataURL(file);
    } else {
        // Fichier non-image : stocker le nom
        document.getElementById('f-schema').value = file.name;
        const preview = document.getElementById('f-schema-preview');
        if (preview) {
            preview.style.cssText = 'font-size:12px;color:var(--text2);margin-top:4px';
            preview.textContent = file.name + ' (' + (file.size/1024).toFixed(1) + ' Ko)';
        }
    }
}

function updateSchemaPreview(url) {
    const preview = document.getElementById('f-schema-preview');
    if (!preview) return;
    preview.innerHTML = '';
    if (!url) return;
    if (url.startsWith('data:image') || url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i) || url.startsWith('blob:')) {
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = 'max-width:100%;max-height:200px;border-radius:6px;border:1px solid var(--border);margin-top:4px;cursor:zoom-in';
        img.onerror = function() { this.style.display = 'none'; };
        img.title = 'Cliquer pour agrandir';
        img.onclick = function() { openLightbox(this.src); };
        preview.appendChild(img);
    } else {
        preview.style.cssText = 'font-size:12px;color:var(--text2);margin-top:4px';
        preview.textContent = url;
    }
}



/**
 * Retourne le HTML du bouton schema de cablage.
 */
function schemaLink(projId, schema) {
    if (!schema) return '';
    return '<button class="btn btn-secondary btn-sm schema-btn" style="padding:2px 8px;font-size:11px" '
        + 'onclick="event.stopPropagation();openLightbox(data.projects.find(function(p){return p.id===\''+projId+'\';}).schema)" '
        + 'title="Voir le schema">&#128200; Schema</button>';
}
function openLightbox(src) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('modal-lightbox').classList.add('open');
}

function closeLightbox() {
    document.getElementById('modal-lightbox').classList.remove('open');
}

/**
 * Duplique un projet avec toutes ses taches et sous-taches.
 */
async function duplicateProject(id) {
    const p = data.projects.find(x => x.id === id);
    if (!p) return;

    // Fonction recursive pour dupliquer les sous-taches avec nouveaux IDs
    function dupSubtasks(subtasks) {
        return (subtasks || []).map(st => ({
            ...st,
            id: genId(),
            done: false,
            status: 'todo',
            subtasks: dupSubtasks(st.subtasks)
        }));
    }

    // Nouveau projet
    const newId = genId();
    const newProj = {
        ...p,
        id:        newId,
        name:      p.name + ' (copie)',
        status:    'todo',
        createdAt: Date.now()
    };

    // Dupliquer les taches
    const oldTasks = data.tasks[id] || [];
    const newTasks = oldTasks.map(t => ({
        ...t,
        id:        genId(),
        done:      false,
        status:    'todo',
        timeSpent: 0,
        comments:  [],
        subtasks:  dupSubtasks(t.subtasks)
    }));

    // Sauvegarder
    await apiPost('/api/projects', newProj);
    data.projects.push(newProj);
    data.tasks[newId] = newTasks;

    // Sauvegarder chaque tache
    for (const t of newTasks) {
        await apiPost('/api/tasks', { projectId: newId, task: t });
    }

    addActivity('Projet duplique : ' + newProj.name);
    toast('Projet duplique !');
    renderAll();
}

function showConfirm(msg, sub, onOk) {
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-sub').textContent = sub || '';
    document.getElementById('confirm-ok-btn').onclick  = function() {
        closeModal('modal-confirm');
        onOk();
    };
    document.getElementById('modal-confirm').classList.add('open');
}

/**
 * Archive ou desarchive un projet.
 */
async function archiveProject(id) {
    const p = data.projects.find(x => x.id === id);
    if (!p) return;
    const isArchived = !p.archived;

    if (isArchived) {
        // Archiver : zip + marquer archived
        toast('Archivage en cours...');
        const resp   = await fetch('/api/archive?projId=' + id, { method: 'POST' });
        const result = await resp.json();
        if (!result.ok) { toast('Erreur : ' + result.error, true); return; }
        await loadData();
        const size = result.size < 1048576
            ? Math.round(result.size/1024) + ' Ko'
            : (result.size/1048576).toFixed(1) + ' Mo';
        toast('Projet archive (' + size + ') dans archives/' + result.zip);
        addActivity('Projet archive : ' + p.name);
        showArchived = false;
        var arcBtn = document.getElementById('sb-archived');
        if (arcBtn) arcBtn.classList.remove('active');
    } else {
        // Desarchiver : supprimer zip + marquer archived=false
        const resp   = await fetch('/api/unarchive?projId=' + id, { method: 'POST' });
        const result = await resp.json();
        if (!result.ok) { toast('Erreur : ' + result.error, true); return; }
        await loadData();
        toast('Projet restaure et archive zip supprime !');
        addActivity('Projet restaure : ' + p.name);
        showArchived = false;
        var arcBtn2 = document.getElementById('sb-archived');
        if (arcBtn2) arcBtn2.classList.remove('active');
        // Scroll vers le haut pour voir le projet restaure
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    renderAll();
}


async function requestNotifPermission() {
    if (!('Notification' in window)) {
        toast('Notifications non supportees par ce navigateur', true);
        return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
        toast('Notifications bloquees - autorise-les dans les parametres du navigateur', true);
        return false;
    }
    const perm = await Notification.requestPermission();
    return perm === 'granted';
}

/** Verifie les rappels toutes les minutes */
function checkReminders() {
    const now = new Date();
    const allTasks = Object.values(data.tasks).flat();
    allTasks.forEach(function(t) {
        if (!t.reminder || t.done || t.reminderFired) return;
        const remDate = new Date(t.reminder);
        // Declencher si le rappel est dans la prochaine minute
        if (remDate <= now && remDate > new Date(now - 60000)) {
            fireReminder(t);
        }
    });
}

/** Declenche une notification pour une tache */
async function fireReminder(task) {
    task.reminderFired = true;

    // Trouver le projet
    var projId = null;
    for (var pid in data.tasks) {
        if (data.tasks[pid].some(function(t) { return t.id === task.id; })) {
            projId = pid;
            break;
        }
    }

    // Toast dans l'appli
    toast('Rappel : ' + task.name);

    // Notification Windows via API
    if (Notification.permission === 'granted') {
        var proj = projId ? data.projects.find(function(p) { return p.id === projId; }) : null;
        var notif = new Notification('Rappel - Gestionnaire de Projets', {
            body: task.name + (proj ? ' (' + proj.name + ')' : ''),
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%230073ea"/><text x="16" y="22" text-anchor="middle" font-size="18" fill="white">GP</text></svg>'
        });
        notif.onclick = function() {
            window.focus();
            if (projId) openTaskDetail(projId, task.id);
        };
        setTimeout(function() { notif.close(); }, 10000);
    }
}

/** Activer les notifications */
async function enableNotifications() {
    const ok = await requestNotifPermission();
    if (ok) toast('Notifications activees !');
}

// Verifier les rappels toutes les 30 secondes
setInterval(checkReminders, 30000);

/* === PIECES JOINTES === */

function addAttachment(projId, taskId) {
    var input = document.createElement('input');
    input.type     = 'file';
    input.accept   = 'image/*';
    input.multiple = true;
    input.onchange = async function() {
        var files = Array.from(input.files);
        if (!files.length) return;
        var t = findTask(projId, taskId);
        if (!t) return;
        if (!t.attachments) t.attachments = [];
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var base64 = await new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload = function(e) { resolve(e.target.result); };
                reader.readAsDataURL(file);
            });
            t.attachments.push({ id: genId(), name: file.name, data: base64, size: file.size });
        }
        await apiPost('/api/tasks', { projectId: projId, task: t });
        toast(files.length + ' image(s) ajoutee(s) !');
        openTaskDetail(projId, taskId);
    };
    input.click();
}

async function deleteAttachment(projId, taskId, attId) {
    var t = findTask(projId, taskId);
    if (!t || !t.attachments) return;
    t.attachments = t.attachments.filter(function(a) { return a.id !== attId; });
    await apiPost('/api/tasks', { projectId: projId, task: t });
    toast('Image supprimee');
    openTaskDetail(projId, taskId);
}

// Handlers globaux pour PJ (evite les quotes imbriquees)
document.addEventListener('click', function(e) {
    var btn = e.target.closest('.att-del-btn');
    if (btn) {
        e.stopPropagation();
        deleteAttachment(btn.dataset.proj, btn.dataset.task, btn.dataset.att);
        return;
    }
    var addBtn = e.target.closest('.att-add-btn');
    if (addBtn) {
        addAttachment(addBtn.dataset.proj, addBtn.dataset.task);
        return;
    }
    var img = e.target.closest('.att-thumb-img');
    if (img) {
        openLightbox(img.src);
    }
});

function buildAttachmentsSection(projId, taskId, attachments) {
    var atts = attachments || [];
    var html = '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">';
    html += '<div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Images (' + atts.length + ')</div>';
    html += '<div class="attachments-wrap">';
    atts.forEach(function(a) {
        html += '<div class="attachment-thumb">';
        html += '<img class="att-thumb-img" src="' + a.data + '" alt="' + escHtml(a.name) + '" title="' + escHtml(a.name) + '">';
        html += '<button class="att-del att-del-btn" data-proj="' + projId + '" data-task="' + taskId + '" data-att="' + a.id + '">x</button>';
        html += '</div>';
    });
    // Bouton ajouter via data-attributes
    html += '<button class="att-add-btn" data-proj="' + projId + '" data-task="' + taskId + '">';
    html += '<span style="font-size:22px">+</span><span>Image</span></button>';
    html += '</div></div>';
    return html;
}

/* === LIENS ENTRE PROJETS === */
var editingProjLinks = [];

function refreshProjectLinksUI() {
    var wrap = document.getElementById('f-links-wrap');
    var sel  = document.getElementById('f-link-proj');
    if (!wrap) return;
    wrap.innerHTML = '';
    editingProjLinks.forEach(function(lk) {
        var target = data.projects.find(function(p) { return p.id === lk.targetId; });
        if (!target) return;
        var span = document.createElement('span');
        span.className = 'proj-link ' + (lk.type === 'dep' ? 'dep' : 'ref');
        span.textContent = (lk.type === 'dep' ? 'Depend de : ' : 'Ref : ') + target.name;
        var del = document.createElement('span');
        del.className = 'link-del';
        del.textContent = ' x';
        del.dataset.id = lk.id;
        del.onclick = function() { removeProjLink(this.dataset.id); };
        span.appendChild(del);
        wrap.appendChild(span);
    });
    if (sel) {
        var currentId = editingProjId;
        var linked = editingProjLinks.map(function(l) { return l.targetId; });
        sel.innerHTML = '<option value="">-- Choisir un projet --</option>';
        data.projects.forEach(function(p) {
            if (p.id === currentId || linked.includes(p.id)) return;
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });
    }
}

function addProjectLink() {
    var targetId = document.getElementById('f-link-proj').value;
    var type     = document.getElementById('f-link-type').value;
    if (!targetId) { toast('Choisir un projet !', true); return; }
    editingProjLinks.push({ id: genId(), targetId: targetId, type: type });
    refreshProjectLinksUI();
}

function removeProjLink(linkId) {
    editingProjLinks = editingProjLinks.filter(function(l) { return l.id !== linkId; });
    refreshProjectLinksUI();
}


/* === RECHERCHE GLOBALE === */

// Handler global pour les resultats de recherche
document.addEventListener('click', function(e) {
    var result = e.target.closest('.search-result');
    if (result) {
        var projId = result.dataset.projid;
        var taskId = result.dataset.taskid;
        closeSearchPopup();
        setView('board', null);
        if (projId && taskId) {
            setTimeout(function() { openTaskDetail(projId, taskId); }, 200);
        } else if (projId) {
            setTimeout(function() {
                var el = document.querySelector('[data-proj-id="' + projId + '"]');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 200);
        }
        return;
    }
    if (!e.target.closest('.search-wrap')) {
        var popup = document.getElementById('search-popup');
        if (popup) popup.style.display = 'none';
    }
});

function hlText(text, q) {
    if (!q || !text) return escHtml(text || '');
    var safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escHtml(text).replace(new RegExp('(' + safe + ')', 'gi'), '<mark style="background:#fff3b0;border-radius:2px">$1</mark>');
}

function onGlobalSearch(query) {
    var popup = document.getElementById('search-popup');
    if (!popup) return;
    var q = (query || '').trim().toLowerCase();

    // renderAll lit la valeur directement depuis getElementById('search')
    renderAll();

    if (!q || q.length < 2) { popup.style.display = 'none'; return; }

    var out = '';
    var total = 0;

    // Projets
    var projs = data.projects.filter(function(p) {
        var prioMatch   = prioLabel(p.priority).toLowerCase().includes(q);
        var statusMatch = statusLabel(p.status).toLowerCase().includes(q);
        var tagMatch    = (p.tags || []).some(function(t) { return t.toLowerCase().includes(q); });
        return p.name.toLowerCase().includes(q)
            || (p.desc || '').toLowerCase().includes(q)
            || prioMatch || statusMatch || tagMatch;
    });
    if (projs.length) {
        out += '<div class="search-popup-section">Projets (' + projs.length + ')</div>';
        projs.slice(0, 5).forEach(function(p) {
            out += '<div class="search-result" data-projid="' + p.id + '">';
            out += '<span class="sr-icon">&#128193;</span>';
            out += '<div class="sr-main"><div class="sr-name">' + hlText(p.name, query) + '</div>';
            if (p.desc) out += '<div class="sr-sub">' + hlText(p.desc.substring(0, 60), query) + '</div>';
            out += '</div>';
            out += '<span class="sr-badge pill ' + statusCls(p.status) + '" onclick="event.stopPropagation()">' + statusLabel(p.status) + '</span>';
            out += '</div>';
            total++;
        });
    }

    // Taches et sous-taches
    var tasks = [];
    Object.keys(data.tasks).forEach(function(pid) {
        var proj = data.projects.find(function(p) { return p.id === pid; });
        if (!proj) return;
        (data.tasks[pid] || []).forEach(function(t) {
            var tTagMatch    = (t.tags || []).some(function(tg) { return tg.toLowerCase().includes(q); });
            var tPrioMatch   = prioLabel(t.priority).toLowerCase().includes(q);
            var tStatusMatch = statusLabel(t.status || 'todo').toLowerCase().includes(q);
            if (t.name.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q) || tTagMatch || tPrioMatch || tStatusMatch) {
                tasks.push({ t: t, proj: proj, parent: null });
            }
            (t.subtasks || []).forEach(function(st) {
                if (st.name.toLowerCase().includes(q)) tasks.push({ t: st, proj: proj, parent: t });
            });
        });
    });
    if (tasks.length) {
        out += '<div class="search-popup-section">Taches (' + tasks.length + ')</div>';
        tasks.slice(0, 8).forEach(function(r) {
            out += '<div class="search-result" data-projid="' + r.proj.id + '" data-taskid="' + r.t.id + '">';
            out += '<span class="sr-icon">' + (r.t.done ? '&#9989;' : '&#9744;') + '</span>';
            out += '<div class="sr-main"><div class="sr-name">' + hlText(r.t.name, query) + '</div>';
            out += '<div class="sr-sub">' + escHtml(r.proj.name) + (r.parent ? ' > ' + escHtml(r.parent.name) : '') + '</div>';
            if (r.t.tags && r.t.tags.length) out += '<div style="margin-top:2px">' + r.t.tags.map(function(tg) { var c=tagColor(tg); return '<span style="background:'+c.bg+';color:'+c.fg+';padding:0 5px;border-radius:8px;font-size:10px">#'+tg+'</span>'; }).join(' ') + '</div>';
            out += '</div>';
            if (r.t.priority) out += '<span class="sr-badge pill ' + prioCls(r.t.priority) + '" onclick="event.stopPropagation()">' + prioLabel(r.t.priority) + '</span>';
            out += '</div>';
            total++;
        });
    }

    if (!total) out = '<div class="search-empty">Aucun resultat pour "' + escHtml(query) + '"</div>';
    popup.innerHTML = out;
    popup.style.display = 'block';
}

function closeSearchPopup() {
    var popup = document.getElementById('search-popup');
    if (popup) popup.style.display = 'none';
    var inp = document.getElementById('search-input');
    if (inp) inp.value = '';
    renderAll();
}

/* === EXPORT EXCEL === */
function exportExcel(projId) {
    var url = projId ? '/api/export-excel?projId=' + projId : '/api/export-excel';
    var a = document.createElement('a');
    a.href = url;
    a.download = projId ? 'projet.xlsx' : 'projets.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Export Excel en cours...');
}

/* === STATISTIQUES AVANCEES === */

/**
 * Construit le HTML des statistiques avancees pour le Dashboard.
 */
function buildAdvancedStats(projs) {
    if (!projs || !projs.length) return '';

    var allTasks = [];
    projs.forEach(function(p) {
        (data.tasks[p.id] || []).forEach(function(t) { allTasks.push({ t: t, p: p }); });
    });

    var html = '<div style="margin-top:20px"><div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:14px">Statistiques avancees</div>';
    html += '<div class="stat-grid">';

    // ── 1. Temps passe par projet ─────────────────────────────────────
    html += '<div class="stat-chart"><h3>Temps passe par projet (h)</h3>';
    var timeByProj = projs.map(function(p) {
        var pt = data.tasks[p.id] || [];
        function sumTime(tasks) {
            return tasks.reduce(function(s, t) {
                return s + (t.timeSpent || 0) + sumTime(t.subtasks || []);
            }, 0);
        }
        return { name: p.name, secs: sumTime(pt) };
    }).filter(function(x) { return x.secs > 0; })
      .sort(function(a, b) { return b.secs - a.secs; });

    if (timeByProj.length === 0) {
        html += '<div style="font-size:12px;color:var(--text3);font-style:italic">Aucun temps enregistre</div>';
    } else {
        var maxSecs = timeByProj[0].secs;
        timeByProj.forEach(function(x) {
            var h = (x.secs / 3600).toFixed(1);
            var pct = Math.round(x.secs / maxSecs * 100);
            html += '<div class="stat-bar-row">';
            html += '<span class="stat-bar-label" title="' + escHtml(x.name) + '">' + escHtml(x.name.substring(0, 18)) + '</span>';
            html += '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:' + pct + '%;background:var(--accent)"></div></div>';
            html += '<span class="stat-bar-val">' + h + 'h</span>';
            html += '</div>';
        });
    }
    html += '</div>';

    // ── 2. Repartition taches par statut ──────────────────────────────
    html += '<div class="stat-chart"><h3>Repartition des taches par statut</h3>';
    var statusCount = { todo: 0, prog: 0, done: 0, block: 0 };
    allTasks.forEach(function(x) { var s = x.t.status || (x.t.done ? 'done' : 'todo'); if (statusCount[s] !== undefined) statusCount[s]++; });
    var totalT = allTasks.length || 1;
    var statusColors = { todo: '#c4c4c4', prog: '#fdab3d', done: '#00c875', block: '#e2445c' };
    var statusNames  = { todo: 'A faire', prog: 'En cours', done: 'Termine', block: 'Bloque' };
    Object.keys(statusCount).forEach(function(s) {
        var cnt = statusCount[s];
        var pct = Math.round(cnt / totalT * 100);
        html += '<div class="stat-bar-row">';
        html += '<span class="stat-bar-label">' + statusNames[s] + '</span>';
        html += '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:' + pct + '%;background:' + statusColors[s] + '"></div></div>';
        html += '<span class="stat-bar-val">' + cnt + ' (' + pct + '%)</span>';
        html += '</div>';
    });
    html += '</div>';

    // ── 3. Repartition par type de projet ─────────────────────────────
    html += '<div class="stat-chart"><h3>Projets par type</h3>';
    var typeCount = {};
    projs.forEach(function(p) { typeCount[p.type] = (typeCount[p.type] || 0) + 1; });
    var typeColors = { arduino: '#0073ea', software: '#00c875', mixed: '#fdab3d', divers: '#9b59b6' };
    var maxType = Math.max.apply(null, Object.values(typeCount)) || 1;
    Object.keys(typeCount).forEach(function(type) {
        var cnt = typeCount[type];
        var pct = Math.round(cnt / maxType * 100);
        var col = typeColors[type] || '#c4c4c4';
        html += '<div class="stat-bar-row">';
        html += '<span class="stat-bar-label">' + typeLabel(type).replace(/[^\w\s\/]/g, '').trim() + '</span>';
        html += '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:' + pct + '%;background:' + col + '"></div></div>';
        html += '<span class="stat-bar-val">' + cnt + '</span>';
        html += '</div>';
    });
    html += '</div>';

    // ── 4. Top taches en retard ───────────────────────────────────────
    html += '<div class="stat-chart"><h3>Taches en retard</h3>';
    var today = new Date(); today.setHours(0,0,0,0);
    var late = allTasks.filter(function(x) {
        return !x.t.done && x.t.deadline && new Date(x.t.deadline) < today;
    }).sort(function(a, b) { return new Date(a.t.deadline) - new Date(b.t.deadline); }).slice(0, 6);

    if (!late.length) {
        html += '<div style="font-size:12px;color:var(--green);font-style:italic">Aucune tache en retard !</div>';
    } else {
        late.forEach(function(x) {
            var days = Math.floor((today - new Date(x.t.deadline)) / 86400000);
            html += '<div class="stat-bar-row">';
            html += '<span class="stat-bar-label" title="' + escHtml(x.t.name) + '">' + escHtml(x.t.name.substring(0,18)) + '</span>';
            html += '<div class="stat-bar-track"><div class="stat-bar-fill" style="width:100%;background:var(--red);opacity:0.6"></div></div>';
            html += '<span class="stat-bar-val" style="color:var(--red)">-' + days + 'j</span>';
            html += '</div>';
        });
    }
    html += '</div>';

    // ── 5. Avancement global SVG ──────────────────────────────────────
    html += '<div class="stat-chart" style="grid-column:1/-1"><h3>Avancement global par projet</h3>';
    html += '<div style="overflow-x:auto"><svg width="100%" height="' + (projs.length * 36 + 30) + '" viewBox="0 0 600 ' + (projs.length * 36 + 30) + '">';
    projs.forEach(function(p, i) {
        var pt = data.tasks[p.id] || [];
        var done = pt.filter(function(t) { return t.done; }).length;
        var total = pt.length;
        var pct = total > 0 ? Math.round(done / total * 100) : 0;
        var y = i * 36 + 10;
        var barW = Math.round(pct * 4.2);
        var col = pct === 100 ? '#00c875' : pct > 50 ? '#fdab3d' : '#0073ea';
        html += '<text x="0" y="' + (y+13) + '" font-size="11" fill="var(--text2)" font-family="Figtree,sans-serif">' + escHtml(p.name.substring(0, 22)) + '</text>';
        html += '<rect x="170" y="' + y + '" width="420" height="18" rx="4" fill="var(--bg)"/>';
        if (barW > 0) html += '<rect x="170" y="' + y + '" width="' + barW + '" height="18" rx="4" fill="' + col + '"/>';
        html += '<text x="598" y="' + (y+13) + '" font-size="11" fill="var(--text2)" text-anchor="end" font-family="Figtree,sans-serif">' + pct + '%</text>';
    });
    html += '</svg></div></div>';

    html += '</div></div>';
    return html;
}

/* === HISTORIQUE DES MODIFICATIONS === */

async function openHistory() {
    var resp = await fetch('/api/history');
    var history = await resp.json();

    var html = '';
    if (!history.length) {
        html = '<div style="text-align:center;padding:30px;color:var(--text3);font-style:italic">Aucune version sauvegardee</div>';
    } else {
        html = '<div style="font-size:12px;color:var(--text2);margin-bottom:12px">Les 5 dernieres versions sont conservees. Cliquer sur "Restaurer" pour revenir a une version anterieure.</div>';
        history.forEach(function(snap, i) {
            var isLast = i === 0;
            var projCount = (snap.data.projects || []).length;
            var taskCount = Object.values(snap.data.tasks || {}).flat().length;
            html += '<div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;background:var(--' + (isLast ? 'white' : 'bg') + ')">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between">';
            html += '<div>';
            html += '<div style="font-size:13px;font-weight:600;color:var(--text)">' + (isLast ? 'Version actuelle' : 'Version ' + (i+1)) + '</div>';
            html += '<div style="font-size:11px;color:var(--text2);margin-top:2px">&#128197; ' + snap.date + ' &nbsp; &#128193; ' + projCount + ' projet(s) &nbsp; &#9989; ' + taskCount + ' tache(s)</div>';
            html += '</div>';
            if (!isLast) {
                html += '<button class="btn btn-secondary btn-sm" onclick="restoreSnapshot(' + i + ')" style="flex-shrink:0">&#8635; Restaurer</button>';
            } else {
                html += '<span style="font-size:11px;color:var(--green);font-weight:600">&#9679; Actuelle</span>';
            }
            html += '</div></div>';
        });
    }

    document.getElementById('hist-body').innerHTML = html;
    document.getElementById('modal-history').classList.add('open');
}

async function restoreSnapshot(idx) {
    if (!confirm('Restaurer cette version ? Les modifications actuelles seront perdues.')) return;
    var resp = await fetch('/api/restore?idx=' + idx);
    var result = await resp.json();
    if (result.ok) {
        closeModal('modal-history');
        await loadData();
unregisterOldServiceWorkers().then(function() { registerServiceWorker(); });
        toast('Version du ' + result.date + ' restauree !');
    } else {
        toast('Erreur : ' + result.error, true);
    }
}

/**
 * Prepare la vue pour l'impression et lance window.print().
 * Expand tous les projets et affiche toutes les taches.
 */
function printView(projId) {
    if (projId) {
        // Imprimer un seul projet - masquer les autres
        setView('board', null);
        setTimeout(function() {
            // Ajouter une classe pour masquer les autres projets
            document.querySelectorAll('.project-block').forEach(function(el) {
                if (el.dataset.projId === projId) {
                    el.classList.remove('collapsed');
                    el.classList.add('print-only');
                } else {
                    el.classList.add('print-hide');
                }
            });
            window.print();
            // Restaurer apres impression
            setTimeout(function() {
                document.querySelectorAll('.project-block').forEach(function(el) {
                    el.classList.remove('print-only', 'print-hide');
                });
            }, 1000);
        }, 300);
    } else {
        // Imprimer tous les projets
        document.querySelectorAll('.project-block.collapsed').forEach(function(el) {
            el.classList.remove('collapsed');
        });
        setView('board', null);
        setTimeout(function() { window.print(); }, 300);
    }
}

/* === MODE HORS-LIGNE === */

var _isOnline = true;

/**
 * Met a jour l'indicateur de connexion dans la topbar.
 */
function setOnlineStatus(online) {
    if (_isOnline === online) return;
    _isOnline = online;
    var ind = document.getElementById('online-indicator');
    if (!ind) return;
    if (online) {
        ind.title   = 'Serveur connecte';
        ind.style.background = '#00c875';
        // Synchroniser le cache avec le serveur
        syncOfflineData();
    } else {
        ind.title   = 'Mode hors-ligne - modifications sauvegardees localement';
        ind.style.background = '#e2445c';
    }
}

/**
 * Synchronise les donnees du cache vers le serveur quand il revient.
 */
async function syncOfflineData() {
    try {
        const cached = localStorage.getItem('gp_cache');
        if (!cached) return;
        const cachedData = JSON.parse(cached);

        // Synchroniser tous les projets
        for (const p of cachedData.projects || []) {
            await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p)
            });
        }
        // Synchroniser toutes les taches
        for (const [projId, tasks] of Object.entries(cachedData.tasks || {})) {
            for (const t of tasks) {
                await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId: projId, task: t })
                });
            }
        }
        toast('Synchronisation avec le serveur effectuee !');
        localStorage.removeItem('gp_cache');
    } catch(e) {
        console.warn('Sync echouee:', e);
    }
}

// Verifier la connexion toutes les 10 secondes
setInterval(async function() {
    try {
        await fetch(`${API}/api/data`);
        if (!_isOnline) {
            _isOnline = false; // Forcer le changement
            setOnlineStatus(true);
            await loadData();
            renderAll();
        }
    } catch(e) {
        if (_isOnline) setOnlineStatus(false);
    }
}, 10000);


/* === THEMES DE COULEURS === */

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('gp_theme', theme);
    document.querySelectorAll('.theme-swatch').forEach(function(s) {
        s.classList.toggle('active', s.dataset.theme === theme);
    });
    toast('Theme ' + theme + ' applique !');
}


function openThemePicker() {
    var current = localStorage.getItem('gp_theme') || 'blue';
    document.querySelectorAll('.theme-swatch').forEach(function(s) {
        s.classList.toggle('active', s.dataset.theme === current);
    });
    document.getElementById('modal-theme').classList.add('open');
}

// Appliquer le theme sauvegarde au demarrage
(function() {
    var saved = localStorage.getItem('gp_theme') || 'blue';
    document.documentElement.setAttribute('data-theme', saved);
    document.body.setAttribute('data-theme', saved);
})();

/* === SERVICE WORKER - NOTIFICATIONS PUSH === */

/**
 * Enregistre le Service Worker pour les notifications hors page.
 */
async function unregisterOldServiceWorkers() {
    if (!('serviceWorker' in navigator)) return;
    var regs = await navigator.serviceWorker.getRegistrations();
    for (var reg of regs) {
        await reg.unregister();
        console.log('Service Worker ancien desinstalle');
    }
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Worker non supporte');
        return;
    }
    try {
        var reg = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker enregistre:', reg.scope);

        // Ecouter les messages du Service Worker
        navigator.serviceWorker.addEventListener('message', function(e) {
            if (e.data.type === 'REMINDER_FIRED') {
                // Marquer le rappel comme declenche
                var taskId = e.data.taskId;
                Object.values(data.tasks).flat().forEach(function(t) {
                    if (t.id === taskId) {
                        t.reminderFired = true;
                        // Trouver le projet et sauvegarder
                        for (var pid in data.tasks) {
                            var found = data.tasks[pid].find(function(x) { return x.id === taskId; });
                            if (found) {
                                apiPost('/api/tasks', { projectId: pid, task: found });
                                break;
                            }
                        }
                    }
                });
            }
            if (e.data.type === 'OPEN_TASK') {
                // Ouvrir la modale de la tache concernee
                var taskId = e.data.taskId;
                for (var pid in data.tasks) {
                    var t = data.tasks[pid].find(function(x) { return x.id === taskId; });
                    if (t) {
                        setView('board', null);
                        setTimeout(function() { openTaskDetail(pid, taskId); }, 300);
                        break;
                    }
                }
            }
        });
    } catch(e) {
        console.warn('Erreur enregistrement SW:', e);
    }
}


/**
 * Convertit une teinte HSL en couleur hex pour l'accent.
 */




/**
 * Applique une teinte personnalisee en preview.
 */


/**
 * Confirme et applique la couleur personnalisee.
 */





/* === GESTION DES FICHIERS PAR PROJET === */

var currentFilesProj = null;
var currentFilesDir  = 'images';

/**
 * Ouvre le gestionnaire de fichiers d'un projet.
 */
async function openFiles(projId) {
    currentFilesProj = projId;
    currentFilesDir  = 'images';
    var proj = data.projects.find(function(p) { return p.id === projId; });
    document.getElementById('files-proj-name').textContent = proj ? proj.name : '';
    await loadFilesList();
    document.getElementById('modal-files').classList.add('open');
}

async function loadFilesList() {
    var list = document.getElementById('files-list');
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)">Chargement...</div>';
    try {
        var resp = await fetch('/api/files/list?projId=' + currentFilesProj + '&dir=' + currentFilesDir);
        var result = await resp.json();
        var files = result.files || [];
        if (!files.length) {
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-style:italic">Aucun fichier</div>';
            return;
        }
        var html = '';
        files.forEach(function(f) {
            var isImg = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f.name);
            var isStl = /\.stl$/i.test(f.name);
            var icon  = isImg ? '&#128247;' : isStl ? '&#128684;' : '&#128196;';
            var size  = f.size < 1024 ? f.size + ' o' : f.size < 1048576 ? Math.round(f.size/1024) + ' Ko' : (f.size/1048576).toFixed(1) + ' Mo';
            html += '<div class="file-row">';
            if (isImg) {
                html += '<img src="' + f.url + '" class="file-thumb" onclick="openLightbox(\'' + f.url + '\')">';
            } else {
                html += '<span class="file-icon">' + icon + '</span>';
            }
            html += '<div class="file-info"><div class="file-name">' + escHtml(f.name) + '</div>';
            html += '<div class="file-size">' + size + '</div></div>';
            html += '<div class="file-actions">';
            html += '<a href="' + f.url + '" download="' + escHtml(f.name) + '" class="btn btn-secondary btn-sm" style="font-size:11px">&#8595;</a>';
            html += '<button class="btn btn-sm" style="color:var(--red);font-size:11px" onclick="deleteFile(\'' + escHtml(f.name) + '\')">&#128465;</button>';
            html += '</div></div>';
        });
        list.innerHTML = html;
    } catch(e) {
        list.innerHTML = '<div style="color:var(--red);padding:20px">Erreur : ' + e.message + '</div>';
    }
}

async function uploadFiles(input) {
    if (!input.files.length) return;
    var formData = new FormData();
    for (var i = 0; i < input.files.length; i++) {
        formData.append('file', input.files[i]);
    }
    try {
        var resp = await fetch('/api/files/upload?projId=' + currentFilesProj + '&dir=' + currentFilesDir, {
            method: 'POST',
            body: formData
        });
        var result = await resp.json();
        toast(result.files.length + ' fichier(s) uploade(s) !');
        await loadFilesList();
    } catch(e) {
        toast('Erreur upload : ' + e.message, true);
    }
    input.value = '';
}

async function deleteFile(fname) {
    if (!confirm('Supprimer "' + fname + '" ?')) return;
    var resp = await fetch('/api/files/delete?projId=' + currentFilesProj + '&dir=' + currentFilesDir + '&file=' + encodeURIComponent(fname), { method: 'POST' });
    var result = await resp.json();
    if (result.ok) {
        toast('Fichier supprime');
        await loadFilesList();
    }
}

async function switchFilesDir(dir) {
    currentFilesDir = dir;
    document.querySelectorAll('.files-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.dir === dir);
    });
    await loadFilesList();
}

/**
 * Met a jour le DOM en utilisant morphdom pour eviter le clignotement.
 * Seuls les noeuds reellement modifies sont touches.
 */
function morphUpdate(elementId, newHtml) {
    var el = document.getElementById(elementId);
    if (!el) return;
    if (typeof morphdom === 'undefined') {
        // Fallback si morphdom non charge
        el.innerHTML = newHtml;
        return;
    }
    var tmp = document.createElement('div');
    tmp.innerHTML = '<div id="' + elementId + '">' + newHtml + '</div>';
    morphdom(el, tmp.firstChild, {
        onBeforeElUpdated: function(fromEl, toEl) {
            // Ne pas toucher les elements avec focus (inputs, textareas)
            if (fromEl === document.activeElement) return false;
            // Ne pas toucher les checkboxes en cours d'interaction
            if (fromEl.tagName === 'INPUT' && fromEl.type === 'checkbox') return false;
            return true;
        }
    });
}

/**
 * Bascule l'affichage des projets archives dans le tableau.
 */
function toggleShowArchived(btn) {
    showArchived = !showArchived;
    if (btn) btn.classList.toggle('active', showArchived);
    setView('board', null);
    renderAll();
    if (showArchived) {
        setTimeout(function() {
            var el = document.getElementById('archives-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    }
}

/**
 * Supprime definitivement une archive (zip) sans restaurer.
 */
async function deleteArchive(projId, projName) {
    showConfirm(
        'Supprimer l archive ?',
        '"' + projName + '" sera supprime definitivement. Cette action est irreversible !',
        async function() {
            var resp   = await fetch('/api/delete-archive?projId=' + projId, { method: 'POST' });
            var result = await resp.json();
            if (result.ok) {
                await loadData();
                toast('Archive supprimee definitivement');
                // Si plus d'archives, revenir au mode normal
                var remaining = data.projects.filter(function(p) { return p.archived; });
                if (!remaining.length) {
                    showArchived = false;
                    var arcBtn = document.getElementById('sb-archived');
                    if (arcBtn) arcBtn.classList.remove('active');
                }
                renderAll();
            } else {
                toast('Erreur : ' + (result.error || 'inconnue'), true);
            }
        }
    );
}

/**
 * Coche/decoche toutes les archives.
 */
function toggleAllArchives(checked) {
    document.querySelectorAll('.arc-chk').forEach(function(chk) { chk.checked = checked; });
    updateArcDelBtn();
}

/**
 * Met a jour la visibilite du bouton Supprimer la selection.
 */
function updateArcDelBtn() {
    var checked = document.querySelectorAll('.arc-chk:checked');
    var btn = document.getElementById('arc-del-sel-btn');
    var all = document.getElementById('arc-select-all');
    var total = document.querySelectorAll('.arc-chk');
    if (btn) btn.style.display = checked.length ? 'inline-flex' : 'none';
    if (all) all.indeterminate = checked.length > 0 && checked.length < total.length;
    if (all) all.checked = total.length > 0 && checked.length === total.length;
}

/**
 * Supprime toutes les archives cochees.
 */
function deleteSelectedArchives() {
    var checked = Array.from(document.querySelectorAll('.arc-chk:checked'));
    if (!checked.length) return;
    var names = checked.map(function(c) { return c.dataset.arcname; }).join(', ');
    showConfirm(
        'Supprimer ' + checked.length + ' archive(s) ?',
        names,
        async function() {
            for (var chk of checked) {
                var resp = await fetch('/api/delete-archive?projId=' + chk.dataset.arcid, { method: 'POST' });
                await resp.json();
            }
            await loadData();
            var remaining = data.projects.filter(function(p) { return p.archived; });
            if (!remaining.length) {
                showArchived = false;
                var arcBtn = document.getElementById('sb-archived');
                if (arcBtn) arcBtn.classList.remove('active');
            }
            toast(checked.length + ' archive(s) supprimee(s)');
            renderAll();
        }
    );
}



/* === REORDONNEMENT MANUEL === */

/**
 * Initialise les ordres si pas encore definis (0,1,2,3...)
 */









function toggleCollapse(id) {
    if (collapsed.has(id)) collapsed.delete(id);
    else                   collapsed.add(id);
    renderAll();
}


/* =============================================================================
   7. VUE KANBAN
   ============================================================================= */

/**
 * Génère et affiche la vue Kanban :
 * 4 colonnes (À faire, En cours, Terminé, Bloqué) avec drag & drop.
 */
function renderKanban() {
    const statuses = ['todo', 'prog', 'done', 'block'];
    const labels   = { todo: 'À faire', prog: 'En cours', done: 'Terminé', block: 'Bloqué' };
    const colors   = { todo: '#c4c4c4', prog: '#fdab3d', done: '#00c875', block: '#e2445c' };
    const projs    = getFilteredProjects();

    let html = '<div class="kanban-wrap">';

    statuses.forEach(st => {
        let cards = [];

        // Cartes de projets (sauf colonne "Terminé" qui affiche les tâches)
        projs.forEach(p => {
            if (p.status === st) {
                const dl   = p.deadline ? dlInfo(p.deadline) : null;
                const allT = data.tasks[p.id] || [];
                const pct  = allT.length
                    ? Math.round(allT.filter(t => t.done).length / allT.length * 100)
                    : 0;

                cards.push(`
                <div class="k-card" draggable="true"
                     ondragstart="dragStart(event, 'proj', '${p.id}')"
                     onclick="openProjectModal('${p.id}')">
                    <div class="k-card-proj">📁 PROJET</div>
                    <div class="k-card-name" style="color:${pcol(p.id)}">${escHtml(p.name)}</div>
                    <!-- Mini barre de progression -->
                    <div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:7px;overflow:hidden">
                        <div style="height:100%;width:${pct}%;background:${pcol(p.id)};border-radius:2px"></div>
                    </div>
                    <div class="k-card-footer">
                        <span class="pill ${prioCls(p.priority)}" style="height:18px;font-size:10px">
                            ${prioLabel(p.priority)}
                        </span>
                        ${dl ? `<span class="k-card-dl ${dl.cls}">${dl.str}</span>` : ''}
                    </div>
                </div>`);
            }
        });
























        // Colonne Kanban avec zone de dépôt
        html += `
        <div class="kanban-col"
             ondragover="event.preventDefault(); this.querySelector('.kanban-cards').classList.add('drag-over')"
             ondragleave="this.querySelector('.kanban-cards').classList.remove('drag-over')"
             ondrop="dropKanban(event, '${st}', this)">
            <div class="kanban-col-hdr" style="color:${colors[st]}">
                ${labels[st]}
                <span class="kcnt">${cards.length}</span>
            </div>
            <div class="kanban-cards">${cards.join('')}</div>
            <button class="k-add-btn" onclick="openProjectModal()">＋ Ajouter</button>
        </div>`;
    });

    html += '</div>';
    // Stats avancees en bas du dashboard
    const dashEl = document.getElementById('content');
    // Ajouter les projets archives en bas si showArchived
    if (showArchived) {
        var archived = data.projects.filter(function(p) { return p.archived; });
        if (archived.length) {
            // Barre d'actions archives
            html += '<div id="archives-section" style="margin:24px 0 8px">';
            html += '<div style="font-size:13px;font-weight:700;color:var(--text2);display:flex;align-items:center;gap:8px;margin-bottom:10px">'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span>'
                  + '<span>&#128451; Archives (' + archived.length + ')</span>'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span></div>';
            // Bouton supprimer selection
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">'
                  + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer">'
                  + '<input type="checkbox" id="arc-select-all" onchange="toggleAllArchives(this.checked)" style="cursor:pointer"> Tout selectionner</label>'
                  + '<div style="flex:1"></div>'
                  + '<button class="btn btn-sm" id="arc-del-sel-btn" onclick="deleteSelectedArchives()" '
                  + 'style="color:var(--red);font-size:12px;display:none">&#128465; Supprimer la selection</button>'
                  + '</div>';
            // Lignes archives
            archived.forEach(function(p) {
                html += '<div class="project-block" style="opacity:0.65;border:1px dashed var(--border);border-radius:8px;margin-bottom:6px">'
                      + '<div class="proj-hdr" style="background:var(--bg);gap:10px">'
                      + '<input type="checkbox" class="arc-chk" data-arcid="' + p.id + '" data-arcname="' + escHtml(p.name) + '" onchange="updateArcDelBtn()" style="cursor:pointer;flex-shrink:0">'
                      + '<span class="proj-name" style="color:var(--text2)">&#128451; ' + escHtml(p.name) + '</span>'
                      + '<div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0">'
                      + '<button class="btn btn-secondary btn-sm" onclick="archiveProject(\'' + p.id + '\')" style="font-size:11px">&#8635; Restaurer</button>'
                      + '</div></div></div>';
            });
            html += '</div>';
        }
    }
    dashEl.innerHTML = html + buildAdvancedStats(projs);
}

/** Données du drag en cours */
let dragData = null;

/**
 * Démarre un drag sur une carte Kanban.
 * @param {DragEvent} e    - Événement drag
 * @param {string}    type - 'proj' | 'task'
 * @param {string}    id   - ID de l'élément
 */
function dragStart(e, type, id) {
    dragData = { type, id };
}

/**
 * Gère le drop d'une carte dans une colonne Kanban.
 * Met à jour le statut du projet côté serveur.
 * @param {DragEvent}   e      - Événement drop
 * @param {string}      status - Nouveau statut
 * @param {HTMLElement} colEl  - Colonne cible
 */
async function dropKanban(e, status, colEl) {
    e.preventDefault();
    colEl.querySelector('.kanban-cards').classList.remove('drag-over');

    if (!dragData) return;

    if (dragData.type === 'proj') {
        const p = data.projects.find(x => x.id === dragData.id);
        if (p) {
            p.status = status;
            await apiPost('/api/projects', p);
            addActivity(`"${p.name}" → ${statusLabel(status)}`);
            renderAll();
        }
    }

    dragData = null;
}


/* =============================================================================
   8. VUE CALENDRIER
   ============================================================================= */

/**
 * Génère et affiche la vue calendrier mensuelle.
 * Affiche les deadlines et dates de début des projets et tâches.
 */
function renderCalendar() {
    const projs = getFilteredProjects();
    const today    = new Date();
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay  = new Date(calYear, calMonth + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7;   // Lundi = 0
    const monthName = firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    // ── Collecte des événements du mois ───────────────────────────────
    const events = {};

    const addEv = (dateStr, label, color, clickFn) => {
        if (!events[dateStr]) events[dateStr] = [];
        events[dateStr].push({ label, color, click: clickFn });
    };

    data.projects.forEach(p => {
        // Deadline projet
        if (p.deadline) addEv(p.deadline, `📁 ${p.name}`, pcol(p.id), `openProjectModal('${p.id}')`);
        // Date de début projet
        if (p.start)    addEv(p.start,    `▶ ${p.name}`,  pcol(p.id), `openProjectModal('${p.id}')`);

        // Deadlines des tâches
        (data.tasks[p.id] || []).forEach(t => {
            if (t.deadline) {
                addEv(
                    t.deadline,
                    `• ${t.name}`,
                    t.done ? '#c4c4c4' : pcol(p.id),
                    `openTaskDetail('${p.id}', '${t.id}')`
                );
            }
        });
    });

    // ── Construction HTML ─────────────────────────────────────────────
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    let html = `
    <div class="cal-wrap">
        <div class="cal-nav">
            <div class="cal-nav-btns">
                <button class="btn btn-secondary btn-sm" onclick="calNav(-1)">◀</button>
                <button class="btn btn-secondary btn-sm" onclick="calNav(1)">▶</button>
                <button class="btn btn-secondary btn-sm" onclick="calToday()">Aujourd'hui</button>
            </div>
            <h2>${monthName.charAt(0).toUpperCase() + monthName.slice(1)}</h2>
            <div></div>
        </div>
        <div class="cal-grid">
            ${days.map(d => `<div class="cal-day-hdr">${d}</div>`).join('')}`;

    // Jours vides avant le 1er du mois
    for (let i = 0; i < startDow; i++) {
        html += `<div class="cal-day other-month"></div>`;
    }

    // Jours du mois
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const isToday  = (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear());
        const dateStr  = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const evs      = events[dateStr] || [];

        html += `
        <div class="cal-day ${isToday ? 'today' : ''}">
            <div class="cal-day-num">${d}</div>
            ${evs.slice(0, 3).map(e => `
                <div class="cal-event"
                     style="background:${e.color}"
                     onclick="${e.click}"
                     title="${escHtml(e.label)}">
                    ${escHtml(e.label)}
                </div>`).join('')}
            ${evs.length > 3 ? `<div style="font-size:10px;color:var(--text3)">+${evs.length - 3} autres</div>` : ''}
        </div>`;
    }

    // Jours vides après le dernier jour du mois (compléter la grille)
    const endDow = (lastDay.getDay() + 6) % 7;
    for (let i = endDow; i < 6; i++) {
        html += `<div class="cal-day other-month"></div>`;
    }

    html += `</div></div>`;
    // Stats avancees en bas du dashboard
    const dashEl = document.getElementById('content');
    // Ajouter les projets archives en bas si showArchived
    if (showArchived) {
        var archived = data.projects.filter(function(p) { return p.archived; });
        if (archived.length) {
            // Barre d'actions archives
            html += '<div id="archives-section" style="margin:24px 0 8px">';
            html += '<div style="font-size:13px;font-weight:700;color:var(--text2);display:flex;align-items:center;gap:8px;margin-bottom:10px">'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span>'
                  + '<span>&#128451; Archives (' + archived.length + ')</span>'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span></div>';
            // Bouton supprimer selection
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">'
                  + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer">'
                  + '<input type="checkbox" id="arc-select-all" onchange="toggleAllArchives(this.checked)" style="cursor:pointer"> Tout selectionner</label>'
                  + '<div style="flex:1"></div>'
                  + '<button class="btn btn-sm" id="arc-del-sel-btn" onclick="deleteSelectedArchives()" '
                  + 'style="color:var(--red);font-size:12px;display:none">&#128465; Supprimer la selection</button>'
                  + '</div>';
            // Lignes archives
            archived.forEach(function(p) {
                html += '<div class="project-block" style="opacity:0.65;border:1px dashed var(--border);border-radius:8px;margin-bottom:6px">'
                      + '<div class="proj-hdr" style="background:var(--bg);gap:10px">'
                      + '<input type="checkbox" class="arc-chk" data-arcid="' + p.id + '" data-arcname="' + escHtml(p.name) + '" onchange="updateArcDelBtn()" style="cursor:pointer;flex-shrink:0">'
                      + '<span class="proj-name" style="color:var(--text2)">&#128451; ' + escHtml(p.name) + '</span>'
                      + '<div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0">'
                      + '<button class="btn btn-secondary btn-sm" onclick="archiveProject(\'' + p.id + '\')" style="font-size:11px">&#8635; Restaurer</button>'
                      + '</div></div></div>';
            });
            html += '</div>';
        }
    }
    dashEl.innerHTML = html + buildAdvancedStats(projs);
}

/** Navigue au mois suivant (+1) ou précédent (-1). */
function calNav(dir) {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0;  calYear++; }
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    renderCalendar();
}

/** Revient au mois courant. */
function calToday() {
    calYear  = new Date().getFullYear();
    calMonth = new Date().getMonth();
    renderCalendar();
}


/* =============================================================================
   9. VUE GANTT / TIMELINE
   ============================================================================= */

/**
 * Génère et affiche la vue Timeline (Gantt) :
 * - Une ligne par projet et par tâche
 * - Barres proportionnelles à la durée (start → deadline)
 * - Ligne rouge "aujourd'hui"
 */
function renderGantt() {
    const projs = getFilteredProjects();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Calcul de la plage de dates ───────────────────────────────────
    let minD = new Date(today); minD.setDate(minD.getDate() - 7);
    let maxD = new Date(today); maxD.setDate(maxD.getDate() + 60);

    // Étendre la plage selon les deadlines/starts existants
    [...projs, ...Object.values(data.tasks).flat()].forEach(x => {
        if (x.deadline) { const d = new Date(x.deadline); if (d < minD) minD = new Date(d); if (d > maxD) maxD = new Date(d); }
        if (x.start)    { const d = new Date(x.start);    if (d < minD) minD = new Date(d); }
    });

    // Marges de confort
    minD.setDate(minD.getDate() - 3);
    maxD.setDate(maxD.getDate() + 5);

    const totalDays = Math.round((maxD - minD) / 86400000);

    /**
     * Convertit une date en pourcentage horizontal (0–100%).
     * @param {Date|string} d
     * @returns {number}
     */
    const pct = d => Math.max(0, Math.min(100, Math.round((new Date(d) - minD) / 86400000 / totalDays * 100)));

    const todayPct = pct(today);

    // ── Génération des ticks de mois ──────────────────────────────────
    const months = [];
    let cur = new Date(minD); cur.setDate(1);
    while (cur <= maxD) {
        const s  = Math.max(0, pct(cur));
        const nx = new Date(cur); nx.setMonth(nx.getMonth() + 1);
        const e  = Math.min(100, pct(nx));
        months.push({
            label: cur.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
            start: s,
            width: e - s
        });
        cur = nx;
    }

    // ── Construction HTML ─────────────────────────────────────────────
    let html = `
    <div class="gantt-outer">
        <div class="gantt-hdr">
            <div class="gantt-lbl-hdr">Projet / Tâche</div>
            <div class="gantt-months">
                ${months.map(m => `
                    <div class="gantt-month-tick" style="left:${m.start}%;width:${m.width}%">
                        ${m.label}
                    </div>`).join('')}
                <div class="gantt-today" style="left:${todayPct}%"></div>
            </div>
        </div>
        <div class="gantt-body">`;

    projs.forEach(p => {
        const color    = pcol(p.id);
        const tasks    = filterTasks(data.tasks[p.id] || []);
        const hasStart = p.start && p.deadline;
        const barLeft  = hasStart ? pct(p.start) : (p.deadline ? pct(p.deadline) - 5 : null);
        const barWidth = hasStart ? Math.max(1, pct(p.deadline) - pct(p.start)) : 8;

        // Ligne projet
        html += `
        <div class="gantt-row" style="background:#f5f7ff">
            <div class="gantt-label" style="font-weight:700;color:${color}">
                <span>${escHtml(p.name)}</span>
                <span class="pill ${statusCls(p.status)}" style="height:18px;font-size:10px;margin-left:auto">
                    ${statusLabel(p.status)}
                </span>
            </div>
            <div class="gantt-timeline" style="position:relative">
                <div class="gantt-today" style="left:${todayPct}%"></div>
                ${barLeft !== null ? `
                    <div class="gantt-bar"
                         style="background:${color};left:${barLeft}%;width:${barWidth}%;min-width:30px"
                         onclick="openProjectModal('${p.id}')">
                        ${statusLabel(p.status)}
                    </div>` : ''}
            </div>
        </div>`;

        // Lignes de tâches
        tasks.forEach(t => {
            const tStart    = t.start || t.deadline;
            const tBarLeft  = tStart ? pct(tStart) - 3 : null;
            const tBarWidth = (t.start && t.deadline) ? Math.max(1, pct(t.deadline) - pct(t.start)) : 5;
            const tdl       = t.deadline ? dlInfo(t.deadline) : null;

            html += `
            <div class="gantt-row">
                <div class="gantt-label"
                     style="padding-left:28px;font-size:12px;
                            color:${t.done ? 'var(--text3)' : 'var(--text)'};
                            text-decoration:${t.done ? 'line-through' : 'none'}">
                    <span>${escHtml(t.name)}</span>
                    ${tdl ? `<span class="dl-cell ${tdl.cls}" style="margin-left:4px;font-size:10px">${tdl.str}</span>` : ''}
                </div>
                <div class="gantt-timeline" style="position:relative">
                    <div class="gantt-today" style="left:${todayPct}%"></div>
                    ${tBarLeft !== null ? `
                        <div class="gantt-bar"
                             style="background:${t.done ? 'var(--grey)' : color};
                                    left:${tBarLeft}%;width:${tBarWidth}%;
                                    min-width:16px;opacity:${t.done ? .5 : 1}"
                             onclick="openTaskDetail('${p.id}', '${t.id}')">
                            ${t.done ? '✓' : ''}
                        </div>` : ''}
                </div>
            </div>`;
        });
    });

    html += `</div></div>`;
    // Stats avancees en bas du dashboard
    const dashEl = document.getElementById('content');
    // Ajouter les projets archives en bas si showArchived
    if (showArchived) {
        var archived = data.projects.filter(function(p) { return p.archived; });
        if (archived.length) {
            // Barre d'actions archives
            html += '<div id="archives-section" style="margin:24px 0 8px">';
            html += '<div style="font-size:13px;font-weight:700;color:var(--text2);display:flex;align-items:center;gap:8px;margin-bottom:10px">'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span>'
                  + '<span>&#128451; Archives (' + archived.length + ')</span>'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span></div>';
            // Bouton supprimer selection
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">'
                  + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer">'
                  + '<input type="checkbox" id="arc-select-all" onchange="toggleAllArchives(this.checked)" style="cursor:pointer"> Tout selectionner</label>'
                  + '<div style="flex:1"></div>'
                  + '<button class="btn btn-sm" id="arc-del-sel-btn" onclick="deleteSelectedArchives()" '
                  + 'style="color:var(--red);font-size:12px;display:none">&#128465; Supprimer la selection</button>'
                  + '</div>';
            // Lignes archives
            archived.forEach(function(p) {
                html += '<div class="project-block" style="opacity:0.65;border:1px dashed var(--border);border-radius:8px;margin-bottom:6px">'
                      + '<div class="proj-hdr" style="background:var(--bg);gap:10px">'
                      + '<input type="checkbox" class="arc-chk" data-arcid="' + p.id + '" data-arcname="' + escHtml(p.name) + '" onchange="updateArcDelBtn()" style="cursor:pointer;flex-shrink:0">'
                      + '<span class="proj-name" style="color:var(--text2)">&#128451; ' + escHtml(p.name) + '</span>'
                      + '<div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0">'
                      + '<button class="btn btn-secondary btn-sm" onclick="archiveProject(\'' + p.id + '\')" style="font-size:11px">&#8635; Restaurer</button>'
                      + '</div></div></div>';
            });
            html += '</div>';
        }
    }
    dashEl.innerHTML = html + buildAdvancedStats(projs);
}


/* =============================================================================
   10. VUE DASHBOARD
   ============================================================================= */

/**
 * Génère et affiche le tableau de bord avec :
 * - Statistiques globales (projets, tâches, retards)
 * - Graphique donut des statuts
 * - Répartition des priorités
 * - Avancement par projet
 * - Tâches en retard
 * - Suivi du temps
 * - Journal d'activité
 */
function renderDashboard() {
    const projs      = getFilteredProjects();
    const allT       = Object.values(data.tasks).flat();
    const doneT      = allT.filter(t => t.done).length;
    const overdueT   = allT.filter(t => !t.done && t.deadline && new Date(t.deadline) < new Date());
    const totalEst   = allT.reduce((s, t) => s + totalEstimate(t), 0);
    const totalSpent = allT.reduce((s, t) => s + totalTimeSpent(t), 0);

    // Comptages priorités (tâches actives seulement)
    const pHigh  = allT.filter(t => t.priority === 'high' && !t.done).length;
    const pMed   = allT.filter(t => t.priority === 'med'  && !t.done).length;
    const pLow   = allT.filter(t => t.priority === 'low'  && !t.done).length;
    const pTotal = pHigh + pMed + pLow || 1;

    // Avancement par projet (trié par % décroissant)
    const projProg = projs.map(p => {
        const t = data.tasks[p.id] || [];
        const d = t.filter(x => x.done).length;
        return { id: p.id, name: p.name, pct: t.length ? Math.round(d / t.length * 100) : 0, color: pcol(p.id) };
    }).sort((a, b) => b.pct - a.pct);

    let html = `<div class="dash-wrap">

        <!-- ── Statistiques globales ── -->
        <div class="dash-widget" style="grid-column:span 2">
            <h3>📊 Vue d'ensemble</h3>
            <div class="stat-grid">
                <div class="stat-box">
                    <div class="stat-val blue">${projs.length}</div>
                    <div class="stat-lbl">Projets</div>
                </div>
                <div class="stat-box">
                    <div class="stat-val green">${doneT}/${allT.length}</div>
                    <div class="stat-lbl">Tâches terminées</div>
                </div>
                <div class="stat-box">
                    <div class="stat-val ${overdueT.length ? 'red' : 'green'}">${overdueT.length}</div>
                    <div class="stat-lbl">En retard</div>
                </div>
                <div class="stat-box">
                    <div class="stat-val orange">${projs.filter(p => p.status === 'prog').length}</div>
                    <div class="stat-lbl">En cours</div>
                </div>
            </div>
        </div>

        <!-- ── Donut des statuts ── -->
        <div class="dash-widget">
            <h3>🗂 Statuts projets</h3>
            <div class="donut-wrap">
                <svg width="80" height="80" viewBox="0 0 80 80">${donutSvg(projs)}</svg>
                <div class="donut-legend">
                    ${[
                        ['todo',  '#c4c4c4', 'À faire'],
                        ['prog',  '#fdab3d', 'En cours'],
                        ['done',  '#00c875', 'Terminés'],
                        ['block', '#e2445c', 'Bloqués']
                    ].map(([s, c, l]) => `
                    <div class="legend-item">
                        <span class="legend-dot" style="background:${c}"></span>
                        ${l} <strong>${projs.filter(p => p.status === s).length}</strong>
                    </div>`).join('')}
                </div>
            </div>
        </div>

        <!-- ── Répartition priorités ── -->
        <div class="dash-widget">
            <h3>🎯 Priorités tâches actives</h3>
            <div class="legend-item"><span class="legend-dot" style="background:var(--red)"></span>Haute <strong>${pHigh}</strong></div>
            <div class="legend-item" style="margin:6px 0"><span class="legend-dot" style="background:var(--orange)"></span>Moyenne <strong>${pMed}</strong></div>
            <div class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>Basse <strong>${pLow}</strong></div>
            <div class="priority-bar">
                <div class="priority-seg" style="width:${Math.round(pHigh / pTotal * 100)}%;background:var(--red)"></div>
                <div class="priority-seg" style="width:${Math.round(pMed  / pTotal * 100)}%;background:var(--orange)"></div>
                <div class="priority-seg" style="width:${Math.round(pLow  / pTotal * 100)}%;background:var(--green)"></div>
            </div>
        </div>

        <!-- ── Avancement par projet ── -->
        <div class="dash-widget">
            <h3>📈 Avancement par projet</h3>
            <div class="progress-list">
                ${projProg.map(p => `
                <div class="pl-row">
                    <div class="pl-label" style="align-items:center">
                        <span style="flex:1;cursor:pointer" onclick="openProjectModal('${p.id}')">${escHtml(p.name)}</span>
                        <span style="color:var(--text2);margin-right:8px">${p.pct}%</span>
                        <button onclick="deleteProject('${p.id}')"
                                title="Supprimer"
                                style="background:none;border:none;cursor:pointer;color:#e2445c;font-size:14px;padding:0 4px">
                            🗑
                        </button>
                    </div>
                    <div class="pl-bar">
                        <div class="pl-fill" style="width:${p.pct}%;background:${p.color}"></div>
                    </div>
                </div>`).join('')}
            </div>
        </div>

        <!-- ── Budget projets (widget conditionnel) ── -->
        ${data.projects.some(p => p.budgetEst || p.budgetReal) ? `
        <div class="dash-widget">
            <h3>&#128176; Budget projets</h3>
            ${data.projects.filter(p => p.budgetEst || p.budgetReal).map(p => {
                const compTotal = (p.components2||[]).reduce((s,c) => s + (c.qty||1)*(c.price||0), 0);
                const real = p.budgetReal || compTotal;
                const est  = p.budgetEst || 0;
                const pct  = est > 0 ? Math.min(100, Math.round(real/est*100)) : 0;
                const over = est > 0 && real > est;
                return '<div style="margin-bottom:12px">'
                    + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">'
                    + '<span>' + escHtml(p.name) + '</span>'
                    + '<span style="color:' + (over?'var(--red)':'var(--text2)') + ';font-weight:600">'
                    + real.toFixed(2) + ' / ' + (est||'?') + ' EUR'
                    + (over ? ' &#x26A0;' : '') + '</span></div>'
                    + '<div class="budget-bar"><div class="budget-fill ' + (over?'budget-over':'') + '" style="width:' + pct + '%;background:' + (over?'var(--red)':pcol(p.id)) + '"></div></div>'
                    + (compTotal > 0 ? '<div style="font-size:10px;color:var(--text3);margin-top:3px">Composants : ' + compTotal.toFixed(2) + ' EUR</div>' : '')
                    + '</div>';
            }).join('')}
        </div>` : ''}

        <!-- ── Tâches en retard (widget conditionnel) ── -->
        ${overdueT.length ? `
        <div class="dash-widget">
            <h3 style="color:var(--red)">⚠️ Tâches en retard (${overdueT.length})</h3>
            <div class="overdue-list">
                ${overdueT.map(t => {
                    const p  = data.projects.find(x => data.tasks[x.id] && data.tasks[x.id].some(tt => tt.id === t.id));
                    const dl = dlInfo(t.deadline);
                    return `
                    <div class="od-row">
                        <div>
                            <div style="font-weight:500">${escHtml(t.name)}</div>
                            <div style="font-size:11px;color:var(--text3)">${p ? escHtml(p.name) : ''}</div>
                        </div>
                        <span class="dl-cell overdue">${dl ? dl.str : ''}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>` : ''}

        <!-- ── Suivi du temps (widget conditionnel) ── -->
        ${data.projects.filter(function(p){return p.archived;}).length > 0 ? `
        <div class="sum-item">
            <span class="sum-dot" style="background:#888"></span>
            <span class="sum-lbl">Archives</span>
            <span class="sum-val">${data.projects.filter(function(p){return p.archived;}).length}</span>
        </div>` : ''}
        ${totalEst > 0 ? `
        <div class="dash-widget">
            <h3>⏱ Suivi du temps</h3>
            <div class="stat-grid">
                <div class="stat-box">
                    <div class="stat-val blue">${fmtEstimate(totalEst)}</div>
                    <div class="stat-lbl">Estimé total</div>
                </div>
                <div class="stat-box">
                    <div class="stat-val orange">${totalSpent > 0 ? fmtTime(totalSpent) : '0'}</div>
                    <div class="stat-lbl">Temps passé</div>
                </div>
            </div>
        </div>` : ''}

        <!-- ── Journal d'activité (widget conditionnel) ── -->
        ${activity.length ? `
        <div class="dash-widget">
            <h3>🕒 Activité récente</h3>
            <div class="activity-list">
                ${activity.slice(0, 8).map(a => `
                <div class="al-row">
                    ${a.msg}
                    <div class="al-time">${a.time}</div>
                </div>`).join('')}
            </div>
        </div>` : ''}

    </div>`;

    // Stats avancees en bas du dashboard
    const dashEl = document.getElementById('content');
    // Ajouter les projets archives en bas si showArchived
    if (showArchived) {
        var archived = data.projects.filter(function(p) { return p.archived; });
        if (archived.length) {
            // Barre d'actions archives
            html += '<div id="archives-section" style="margin:24px 0 8px">';
            html += '<div style="font-size:13px;font-weight:700;color:var(--text2);display:flex;align-items:center;gap:8px;margin-bottom:10px">'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span>'
                  + '<span>&#128451; Archives (' + archived.length + ')</span>'
                  + '<span style="flex:1;height:1px;background:var(--border)"></span></div>';
            // Bouton supprimer selection
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">'
                  + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer">'
                  + '<input type="checkbox" id="arc-select-all" onchange="toggleAllArchives(this.checked)" style="cursor:pointer"> Tout selectionner</label>'
                  + '<div style="flex:1"></div>'
                  + '<button class="btn btn-sm" id="arc-del-sel-btn" onclick="deleteSelectedArchives()" '
                  + 'style="color:var(--red);font-size:12px;display:none">&#128465; Supprimer la selection</button>'
                  + '</div>';
            // Lignes archives
            archived.forEach(function(p) {
                html += '<div class="project-block" style="opacity:0.65;border:1px dashed var(--border);border-radius:8px;margin-bottom:6px">'
                      + '<div class="proj-hdr" style="background:var(--bg);gap:10px">'
                      + '<input type="checkbox" class="arc-chk" data-arcid="' + p.id + '" data-arcname="' + escHtml(p.name) + '" onchange="updateArcDelBtn()" style="cursor:pointer;flex-shrink:0">'
                      + '<span class="proj-name" style="color:var(--text2)">&#128451; ' + escHtml(p.name) + '</span>'
                      + '<div style="margin-left:auto;display:flex;gap:6px;flex-shrink:0">'
                      + '<button class="btn btn-secondary btn-sm" onclick="archiveProject(\'' + p.id + '\')" style="font-size:11px">&#8635; Restaurer</button>'
                      + '</div></div></div>';
            });
            html += '</div>';
        }
    }
    dashEl.innerHTML = html + buildAdvancedStats(projs);
}

/**
 * Génère le SVG du graphique donut pour les statuts de projets.
 * @param {Array} projs - Liste des projets
 * @returns {string} Balises SVG internes (paths + cercle central)
 */
function donutSvg(projs) {
    const vals  = [
        projs.filter(p => p.status === 'todo').length,
        projs.filter(p => p.status === 'prog').length,
        projs.filter(p => p.status === 'done').length,
        projs.filter(p => p.status === 'block').length
    ];
    const cols  = ['#c4c4c4', '#fdab3d', '#00c875', '#e2445c'];
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const r = 28, cx = 40, cy = 40;

    // Si un seul segment = cercle plein
    const nonZero = vals.filter(v => v > 0).length;
    if (nonZero <= 1) {
        const colIdx = vals.findIndex(v => v > 0);
        const col = colIdx >= 0 ? cols[colIdx] : '#c4c4c4';
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>` +
               `<circle cx="${cx}" cy="${cy}" r="16" fill="white"/>` +
               `<text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="11" font-weight="700" fill="#323338">${total}</text>`;
    }

    let angle = -90;
    let segs  = '';

    vals.forEach((v, i) => {
        const fraction = v / total;
        const sweep    = fraction * 360;
        if (fraction === 0) return;
        const a1 = angle * Math.PI / 180;
        const a2 = (angle + sweep) * Math.PI / 180;
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);
        const la = sweep > 180 ? 1 : 0;
        segs += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${la},1 ${x2},${y2} Z" fill="${cols[i]}"/>`;
        angle += sweep;
    });

    return segs +
        `<circle cx="${cx}" cy="${cy}" r="16" fill="white"/>` +
        `<text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="11" font-weight="700" fill="#323338">${total}</text>`;
}


/* =============================================================================
   11. CHRONOMÈTRE (TIME TRACKER)
   ============================================================================= */

/**
 * Démarre ou arrête le chronomètre d'une tâche.
 * Quand on arrête, le temps écoulé est ajouté à task.timeSpent et sauvegardé.
 * @param {string} projId  - ID du projet
 * @param {string} taskId  - ID de la tâche
 */
function toggleTimer(projId, taskId) {
    // Initialiser le timer si inexistant
    if (!timers[taskId]) {
        timers[taskId] = { running: false, start: 0, elapsed: 0 };
    }

    const tm = timers[taskId];

    if (tm.running) {
        // ── Arrêt du chrono ────────────────────────────────────────────
        tm.elapsed += Math.floor((Date.now() - tm.start) / 1000);
        tm.running  = false;

        const t = (data.tasks[projId] || []).find(x => x.id === taskId);
        if (t) {
            t.timeSpent = (t.timeSpent || 0) + tm.elapsed;
            tm.elapsed  = 0;
            apiPost('/api/tasks', { projectId: projId, task: t });
            addActivity(`Temps enregistré sur "${t.name}" : ${fmtTime(t.timeSpent)}`);
        }
    } else {
        // ── Démarrage du chrono ────────────────────────────────────────
        tm.start   = Date.now();
        tm.running = true;
        toast('⏱ Chrono démarré');
    }

    renderAll();
}

/** Rafraîchit le rendu toutes les 5s si un chrono est actif (pour mettre à jour l'affichage) */
setInterval(() => {
    if (Object.values(timers).some(t => t.running)) renderAll();
}, 5000);

/** Sauvegarde automatique du chrono toutes les 60s si le navigateur se ferme */
setInterval(async () => {
    for (const [taskId, tm] of Object.entries(timers)) {
        if (!tm.running) continue;
        for (const [projId, tasks] of Object.entries(data.tasks)) {
            const t = tasks.find(x => x.id === taskId);
            if (t) {
                const elapsed = Math.floor((Date.now() - tm.start) / 1000);
                t.timeSpent = (t.timeSpent || 0) + elapsed;
                tm.start = Date.now();
                await apiPost('/api/tasks', { projectId: projId, task: t });
                break;
            }
        }
    }
}, 60000);


/* =============================================================================
   12. MODALES
   ============================================================================= */

/**
 * Ferme une modale par son ID.
 * @param {string} id - ID de l'overlay
 */
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

/**
 * Ouvre la modale de création ou d'édition d'un projet.
 * @param {string|null} id - ID du projet à éditer (null = nouveau)
 */
function openProjectModal(id = null) {
    editingProjId = id;
    if (id) currentProjId = id;
    document.getElementById('modal-proj-title').textContent = id ? 'Modifier le projet' : 'Nouveau projet';

    if (id) {
        // Pré-remplissage avec les données existantes
        const p = data.projects.find(x => x.id === id);
        document.getElementById('f-name').value       = p.name;
        document.getElementById('f-type').value       = p.type;
        document.getElementById('f-status').value     = p.status;
        document.getElementById('f-priority').value   = p.priority;
        document.getElementById('f-deadline').value   = p.deadline   || '';
        document.getElementById('f-start').value      = p.start      || '';
        document.getElementById('f-components').value = p.components || '';
        document.getElementById('f-schema').value = p.schema || '';
        setTimeout(function() { updateSchemaPreview(p.schema || ''); }, 50);
        document.getElementById('f-budget-est').value  = p.budgetEst  || '';
        document.getElementById('f-budget-real').value = p.budgetReal || '';
        document.getElementById('f-desc').value       = p.desc       || '';
    } else {
        // Remise à zéro du formulaire
        ['f-name', 'f-desc', 'f-components', 'f-schema', 'f-budget-est', 'f-budget-real'].forEach(i => document.getElementById(i).value = '');
        updateSchemaPreview('');
        document.getElementById('f-type').value     = 'arduino';
        document.getElementById('f-status').value   = 'todo';
        document.getElementById('f-priority').value = 'med';
        document.getElementById('f-deadline').value = '';
        document.getElementById('f-start').value    = '';
    }

    editingProjTags  = id ? [...((data.projects.find(x => x.id === id) || {}).tags  || [])] : [];
    editingProjLinks = id ? [...((data.projects.find(x => x.id === id) || {}).links || [])] : [];
    refreshProjectTagsUI();
    refreshProjectLinksUI();
    document.getElementById('modal-project').classList.add('open');
    setTimeout(() => document.getElementById('f-name').focus(), 100);
}

/**
 * Ouvre la modale de création ou d'édition d'une tâche.
 * @param {string}      projId - ID du projet parent
 * @param {string|null} taskId - ID de la tâche à éditer (null = nouvelle)
 */
function openTaskModal(projId, taskId = null) {
    taskProjId    = projId;
    currentProjId = projId;

    // Remplir la liste des taches parentes possibles
    const sel = document.getElementById('t-depends');
    sel.innerHTML = '<option value="">-- Aucune (tache independante) --</option>';
    if (taskId === null) {
        // Seulement pour une nouvelle tache
        (data.tasks[projId] || []).forEach(t => {
            const opt = document.createElement('option');
            opt.value       = t.id;
            opt.textContent = t.name;
            sel.appendChild(opt);
        });
    }
    editingTaskId = taskId;
    document.getElementById('modal-task-title').textContent = taskId ? 'Modifier la tâche' : 'Nouvelle tâche';

    if (taskId) {
        // Pré-remplissage
        const t = (data.tasks[projId] || []).find(x => x.id === taskId);
        document.getElementById('t-name').value     = t.name;
        document.getElementById('t-priority').value = t.priority;
        document.getElementById('t-deadline').value = t.deadline  || '';
        document.getElementById('t-start').value    = t.start     || '';
        document.getElementById('t-estimate').value = t.estimate  || '';
        document.getElementById('t-depends').value  = t.depends   || '';
        document.getElementById('t-note').value     = t.note      || '';
        document.getElementById('t-reminder').value  = t.reminder  || '';
    } else {
        // Remise à zéro
        ['t-name', 't-note', 't-depends', 't-reminder'].forEach(i => document.getElementById(i).value = '');
        document.getElementById('t-priority').value = 'med';
        document.getElementById('t-deadline').value = '';
        document.getElementById('t-start').value    = '';
        document.getElementById('t-estimate').value = '';
    }

    closeModal('modal-detail');
    document.getElementById('modal-task').classList.add('open');
    setTimeout(() => document.getElementById('t-name').focus(), 100);
}

/**
 * Affiche la modale de détail d'une tâche (lecture + actions).
 * @param {string} projId - ID du projet parent
 * @param {string} taskId - ID de la tâche
 */
function openTaskDetail(projId, taskId) {
    const t = (data.tasks[projId] || []).find(x => x.id === taskId);
    const p = data.projects.find(x => x.id === projId);
    if (!t) return;

    document.getElementById('det-title').textContent = t.name;

    const dl    = t.deadline ? dlInfo(t.deadline) : null;
    const spent = t.timeSpent || 0;

    document.getElementById('det-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Projet</div>
                <div style="font-size:13px;font-weight:600;color:${p ? pcol(p.id) : 'inherit'}">${p ? escHtml(p.name) : '—'}</div>
            </div>
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Priorité</div>
                <span class="pill ${prioCls(t.priority)}">${prioLabel(t.priority)}</span>
            </div>
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Statut</div>
                <span class="pill ${t.done ? 's-done' : 's-todo'}">${t.done ? 'Terminée' : 'En attente'}</span>
            </div>
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Deadline</div>
                <div class="dl-cell ${dl ? dl.cls : ''}" style="font-size:13px">${dl ? dl.str : 'Non définie'}</div>
            </div>
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Estimation</div>
                <div style="font-size:13px">${fmtEstimate(totalEstimate(t))}</div>
            </div>
            <div>
                <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Temps passé</div>
                <div style="font-size:13px">${spent ? fmtTime(spent) : '0'}</div>
            </div>
        </div>
        ${t.depends ? `
        <div style="margin-bottom:12px">
            <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">🔗 Dépendance</div>
            <div style="font-size:12px;background:var(--bg);padding:7px 10px;border-radius:5px">${escHtml(t.depends)}</div>
        </div>` : ''}
        ${t.note ? `
        <div>
            <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">📝 Notes</div>
            <div style="background:var(--bg);border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.6;white-space:pre-wrap">${escHtml(t.note)}</div>
        </div>` : ''}
    `;

    // Boutons d'action de la modale détail
    // Section commentaires
    const comments = t.comments || [];
    const commentsHtml = `
        <div style="margin-top:16px">
            <div style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">
                Commentaires (${comments.length})
            </div>
            <div class="comment-list">
                ${comments.length ? comments.map(c => `
                <div class="comment-item">
                    <div class="comment-header">
                        <span class="comment-date">${c.date}</span>
                        <div class="comment-actions">
                            <button onclick="editComment('${projId}','${taskId}','${c.id}')">✏️</button>
                            <button onclick="deleteComment('${projId}','${taskId}','${c.id}')">🗑</button>
                        </div>
                    </div>
                    <div class="comment-text">${escHtml(c.text)}</div>
                </div>`).join('') : '<p style="font-size:12px;color:var(--text3);font-style:italic">Aucun commentaire</p>'}
            </div>
            <div class="comment-input-wrap">
                <textarea id="comment-input-${taskId}"
                          placeholder="Ajouter un commentaire, une note d'avancement..."
                          onkeydown="if(event.ctrlKey && event.key==='Enter') addComment('${projId}','${taskId}')"></textarea>
                <button class="btn btn-primary btn-sm" onclick="addComment('${projId}','${taskId}')">
                    Envoyer
                </button>
            </div>
        </div>`;

    document.getElementById('det-body').innerHTML += commentsHtml;

    document.getElementById('det-body').innerHTML += buildTagWidget(taskId, projId, t.tags || []);
    // Section pieces jointes
    document.getElementById('det-body').innerHTML += buildAttachmentsSection(projId, taskId, t.attachments || []);

    document.getElementById('det-del').onclick  = () => { closeModal('modal-detail'); deleteTask(projId, taskId); };
    document.getElementById('det-edit').onclick = () => openTaskModal(projId, taskId);

    document.getElementById('modal-detail').classList.add('open');
}

/**
 * Affiche le popup de sélection de statut au clic sur la pill statut d'un projet.
 * @param {string}      projId - ID du projet
 * @param {HTMLElement} btn    - Bouton déclencheur (pour positionnement)
 */
function openStatusPicker(projId, btn) {
    // Supprimer tout popup déjà ouvert
    document.querySelectorAll('.spopup').forEach(x => x.remove());

    const popup = document.createElement('div');
    popup.className = 'spopup open';

    [
        ['todo',  's-todo',  'À faire'],
        ['prog',  's-prog',  'En cours'],
        ['done',  's-done',  'Terminé'],
        ['block', 's-block', 'Bloqué']
    ].forEach(([s, cls, l]) => {
        const opt = document.createElement('div');
        opt.className   = `spopup-opt pill ${cls}`;
        opt.style.display    = 'block';
        opt.style.textAlign  = 'center';
        opt.textContent = l;

        opt.onclick = async () => {
            const p = data.projects.find(x => x.id === projId);
            if (p) {
                p.status = s;
                await apiPost('/api/projects', p);
                addActivity(`"${p.name}" → ${l}`);
                renderAll();
            }
            popup.remove();
        };

        popup.appendChild(opt);
    });

    btn.parentNode.appendChild(popup);

    // Fermer au prochain clic ailleurs
    setTimeout(() => document.addEventListener('click', () => popup.remove(), { once: true }), 50);
}


/* =============================================================================
   13. ACTIONS CRUD — PROJETS
   ============================================================================= */

/**
 * Sauvegarde un projet (création ou modification) via l'API.
 */
async function saveProject() {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { toast('Nom requis !', true); return; }

    const proj = {
        id:         editingProjId || genId(),
        name,
        type:       document.getElementById('f-type').value,
        status:     document.getElementById('f-status').value,
        priority:   document.getElementById('f-priority').value,
        deadline:   document.getElementById('f-deadline').value,
        start:      document.getElementById('f-start').value,
        components: document.getElementById('f-components').value.trim(),
        schema:     document.getElementById('f-schema').value.trim(),
        budgetEst:  parseFloat(document.getElementById('f-budget-est').value)  || 0,
        budgetReal: parseFloat(document.getElementById('f-budget-real').value) || 0,
        desc:       document.getElementById('f-desc').value.trim(),
        tags:       [...editingProjTags],
        links:      [...editingProjLinks],
        createdAt:  editingProjId
            ? (data.projects.find(x => x.id === editingProjId) || {}).createdAt
            : Date.now()
    };

    await apiPost('/api/projects', proj);

    if (editingProjId) {
        // Mise à jour locale
        const i = data.projects.findIndex(x => x.id === editingProjId);
        if (i >= 0) data.projects[i] = proj;
    } else {
        // Ajout local
        data.projects.push(proj);
        data.tasks[proj.id] = [];
    }

    closeModal('modal-project');
    addActivity(editingProjId ? `Projet modifié : ${proj.name}` : `Projet créé : ${proj.name}`);
    toast(editingProjId ? 'Projet modifié ✓' : 'Projet créé ✓');
    renderAll();
}

/**
 * Renomme un projet directement depuis le champ inline du tableau.
 * @param {string} id   - ID du projet
 * @param {string} name - Nouveau nom
 */
async function renameProj(id, name) {
    name = name.trim();
    if (!name) return;

    const p = data.projects.find(x => x.id === id);
    if (!p || p.name === name) return;

    p.name = name;
    await apiPost('/api/projects', p);
    renderAll();
}

/**
 * Supprime un projet et toutes ses tâches après confirmation.
 * @param {string} id - ID du projet
 */
async function deleteProject(id) {
    if (!window.__delProjConfirmed) {
        const _pObj = data.projects.find(function(x) { return x.id === id; });
        const _tc   = (data.tasks[id] || []).length;
        showConfirm(
            'Supprimer ce projet ?',
            (_pObj ? '"' + _pObj.name + '"' : '') + (_tc ? ' et ' + _tc + ' tache(s)' : ''),
            function() { window.__delProjConfirmed = true; deleteProject(id); }
        );
        return;
    }
    window.__delProjConfirmed = false;

    const p = data.projects.find(x => x.id === id);
    await apiDel(`/api/projects?id=${id}`);

    data.projects = data.projects.filter(x => x.id !== id);
    delete data.tasks[id];

    addActivity(`Projet supprimé : ${p ? p.name : id}`);
    toast('Projet supprimé');
    renderAll();
}


/* =============================================================================
   14. ACTIONS CRUD — TÂCHES
   ============================================================================= */

/**
 * Sauvegarde une tâche (création ou modification) via l'API.
 */
async function saveTask() {
    const name = document.getElementById('t-name').value.trim();
    if (!name) { toast('Titre requis !', true); return; }

    const existing = editingTaskId
        ? (data.tasks[taskProjId] || []).find(x => x.id === editingTaskId) || {}
        : {};

    const parentId = document.getElementById('t-depends').value || '';

    const task = {
        id:        editingTaskId || genId(),
        name,
        priority:  document.getElementById('t-priority').value,
        deadline:  document.getElementById('t-deadline').value,
        start:     document.getElementById('t-start').value,
        estimate:  parseFloat(document.getElementById('t-estimate').value) || 0,
        depends:   parentId,
        note:      document.getElementById('t-note').value.trim(),
        reminder:  document.getElementById('t-reminder').value || '',
        status:    existing.status    || 'todo',
        done:      existing.done      || false,
        subtasks:  existing.subtasks  || [],
        timeSpent: existing.timeSpent || 0
    };

    if (!data.tasks[taskProjId]) data.tasks[taskProjId] = [];

    if (parentId && !editingTaskId) {
        // Ajouter comme sous-tache de la tache parente
        const parent = data.tasks[taskProjId].find(x => x.id === parentId);
        if (parent) {
            if (!parent.subtasks) parent.subtasks = [];
            parent.subtasks.push(task);
            await apiPost('/api/tasks', { projectId: taskProjId, task: parent });
            closeModal('modal-task');
            addActivity('Etape ajoutee : ' + task.name);
            toast('Etape ajoutee dans "' + parent.name + '" !');
            renderAll();
            return;
        }
    }

    // Tache independante (ou modification)
    await apiPost('/api/tasks', { projectId: taskProjId, task });

    if (editingTaskId) {
        const i = data.tasks[taskProjId].findIndex(x => x.id === editingTaskId);
        if (i >= 0) data.tasks[taskProjId][i] = task;
    } else {
        data.tasks[taskProjId].push(task);
    }

    closeModal('modal-task');
    addActivity(editingTaskId ? 'Tache modifiee : ' + task.name : 'Tache creee : ' + task.name);
    toast(editingTaskId ? 'Tache modifiee !' : 'Tache ajoutee !');
    renderAll();
}


async function toggleTask(projId, taskId) {
    const t = (data.tasks[projId] || []).find(x => x.id === taskId);
    if (!t) return;

    // Si on veut cocher, verifier que toutes les sous-taches sont terminees
    if (!t.done && t.subtasks && t.subtasks.length > 0) {
        function allDoneRecursive(subs) {
            return (subs || []).every(function(s) { return s.done && allDoneRecursive(s.subtasks); });
        }
        if (!allDoneRecursive(t.subtasks)) {
            toast('Terminez d abord toutes les sous-etapes !', true);
            return;
        }
    }

    t.done   = !t.done;
    t.status = t.done ? 'done' : 'todo';

    // Si on coche, propager aux sous-taches
    if (t.done) setAllSubtasksDone(t.subtasks || [], true);

    await apiPost('/api/tasks', { projectId: projId, task: t });
    addActivity('Tache ' + (t.done ? 'terminee' : 'reouverte') + ' : ' + t.name);
    renderAll();

    if (t.done) {
        setTimeout(function() {
            document.querySelectorAll('.btbl tbody tr.task-row').forEach(function(row) {
                row.classList.add('just-done');
                setTimeout(function() { row.classList.remove('just-done'); }, 600);
            });
        }, 50);
    }
}


async function deleteTask(projId, taskId) {
    const t = (data.tasks[projId] || []).find(x => x.id === taskId);
    await apiDel(`/api/tasks?projectId=${projId}&taskId=${taskId}`);
    data.tasks[projId] = (data.tasks[projId] || []).filter(x => x.id !== taskId);
    addActivity(`Tâche supprimée : ${t ? t.name : taskId}`);
    toast('Tâche supprimée');
    renderAll();
}


/* =============================================================================
   15. INITIALISATION
   ============================================================================= */

/** Ferme toutes les modales avec la touche Échap */
document.addEventListener('keydown', e => {
    // Ignorer si on est dans un champ de saisie
    const tag = document.activeElement.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Echap : ferme toutes les modales
    if (e.key === 'Escape') {
        ['modal-project', 'modal-task', 'modal-detail', 'modal-subtask'].forEach(closeModal);
        document.querySelectorAll('.spopup').forEach(x => x.remove());
    }

    // Raccourcis uniquement hors champ de saisie
    if (!inInput) {
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openProjectModal(); }
        if (e.key === 't' || e.key === 'T') {
            e.preventDefault();
            const projs = getFilteredProjects();
            const target = currentProjId && projs.find(p => p.id === currentProjId)
                ? currentProjId
                : (projs.length > 0 ? projs[0].id : null);
            if (target) openTaskModal(target);
            else toast('Cree un projet d abord (N)', true);
        }
        if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setView('dashboard', null); }
        if (e.key === 'b' || e.key === 'B') { e.preventDefault(); setView('board', null); }
        if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setView('kanban', null); }
        if (e.key === '?') { e.preventDefault(); toggleHelp(); }
    }
});

/** Affiche/masque le panneau d'aide des raccourcis */
function toggleHelp() {
    const el = document.getElementById('modal-help');
    // Mettre a jour le label T avec le nom du projet courant
    const lbl = document.getElementById('help-t-label');
    if (lbl) {
        const projs = getFilteredProjects();
        const proj = currentProjId
            ? projs.find(p => p.id === currentProjId)
            : projs[0];
        lbl.textContent = proj
            ? 'Nouvelle tache dans "' + proj.name + '"'
            : 'Nouvelle tache (aucun projet)';
    }
    if (el.classList.contains('open')) closeModal('modal-help');
    else el.classList.add('open');
}

/** Démarrage : chargement des données depuis le serveur */
loadData();
unregisterOldServiceWorkers().then(function() { registerServiceWorker(); });

/* === DRAG & DROP PROJETS === */
var _dragProjId = null;
var _dragOverId = null;

function initProjDrag() {
    document.querySelectorAll('.project-block').forEach(function(block) {
        if (block._dragInit) return;
        block._dragInit = true;

        var handle = block.querySelector('.proj-drag-handle');
        if (!handle) return;

        // Activer draggable SEULEMENT au mousedown sur la poignee
        handle.addEventListener('mousedown', function(e) {
            block.setAttribute('draggable', 'true');
        });

        // Desactiver draggable des que la souris est relachee
        handle.addEventListener('mouseup', function() {
            block.setAttribute('draggable', 'false');
        });

        block.addEventListener('dragstart', function(e) {
            if (block.getAttribute('draggable') !== 'true') {
                e.preventDefault(); return;
            }
            _dragProjId = block.dataset.projId;
            block.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        block.addEventListener('dragend', function() {
            block.setAttribute('draggable', 'false');
            block.classList.remove('dragging');
            document.querySelectorAll('.project-block').forEach(function(b) {
                b.classList.remove('drag-over');
            });
        });

        block.addEventListener('dragover', function(e) {
            if (!_dragProjId) return;
            e.preventDefault();
            if (block.dataset.projId === _dragProjId) return;
            document.querySelectorAll('.project-block').forEach(function(b) {
                b.classList.remove('drag-over');
            });
            block.classList.add('drag-over');
            _dragOverId = block.dataset.projId;
        });

        block.addEventListener('drop', function(e) {
            e.preventDefault();
            document.querySelectorAll('.project-block').forEach(function(b) {
                b.classList.remove('drag-over');
            });
            if (!_dragProjId || _dragProjId === block.dataset.projId) return;
            var fromIdx = data.projects.findIndex(function(p) { return p.id === _dragProjId; });
            var toIdx   = data.projects.findIndex(function(p) { return p.id === block.dataset.projId; });
            if (fromIdx < 0 || toIdx < 0) return;
            var moved = data.projects.splice(fromIdx, 1)[0];
            data.projects.splice(toIdx, 0, moved);
            _dragProjId = null;
            saveProjOrder();
        });
    });

    // Securite : desactiver draggable sur mouseup global
    document.addEventListener('mouseup', function() {
        document.querySelectorAll('.project-block[draggable="true"]').forEach(function(b) {
            b.setAttribute('draggable', 'false');
        });
    }, { once: false });
}

async function saveProjOrder() {
    try {
        var ids = data.projects.map(function(p) { return p.id; });
        await fetch('/api/projects/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids })
        });
        var sortEl = document.getElementById('sort-by');
        if (sortEl) sortEl.value = 'manual';
    } catch(e) { toast('Erreur sauvegarde ordre', true); }
    renderAll();
    setTimeout(initProjDrag, 60);
}

/* === COLLAPSE LIGNE PRINCIPALE PROJET === */
function toggleMainRow(projId, btn) {
    if (mainCollapsed.has(projId)) mainCollapsed.delete(projId);
    else mainCollapsed.add(projId);
    localStorage.setItem('gp_main_collapsed', JSON.stringify([...mainCollapsed]));
    if (btn) btn.classList.toggle('open', !mainCollapsed.has(projId));
    renderAll();
}

/* === COLLAPSE SOUS-TACHES D'UNE TACHE === */
function toggleTaskCollapse(taskId, btn) {
    var rows = document.querySelectorAll('[data-sub-of="' + taskId + '"]');
    var isOpen = btn.classList.contains('open');
    rows.forEach(function(row) { row.style.display = isOpen ? 'none' : ''; });
    if (isOpen) btn.classList.remove('open');
    else btn.classList.add('open');
}

/* === SAUVEGARDE NAS === */

async function checkNasStatus() {
    try {
        var r = await fetch('/api/backup/status');
        var s = await r.json();
        var icon = document.getElementById('nas-backup-icon');
        var text = document.getElementById('nas-backup-text');
        var btn  = document.getElementById('nas-backup-btn');
        if (!icon) return;
        if (s.state === 'ok') {
            icon.textContent = '✅';
            text.textContent = 'NAS';
            btn.title = 'Derniere sauvegarde : ' + (s.last || '?');
            btn.style.color = 'var(--green)';
        } else if (s.state === 'running') {
            icon.textContent = '🔄';
            text.textContent = 'NAS...';
            btn.style.color = 'var(--orange)';
        } else if (s.state === 'error') {
            icon.textContent = '❌';
            text.textContent = 'NAS';
            btn.title = 'Erreur : ' + (s.error || '?');
            btn.style.color = 'var(--red)';
        } else {
            icon.textContent = '💾';
            text.textContent = 'NAS';
            btn.style.color = '';
        }
    } catch(e) {}
}

async function triggerNasBackup() {
    var icon = document.getElementById('nas-backup-icon');
    if (icon) icon.textContent = '🔄';
    try {
        await fetch('/api/backup', { method: 'POST' });
        setTimeout(checkNasStatus, 3000);
    } catch(e) { toast('Erreur sauvegarde NAS', true); }
}

// Verifier le statut au demarrage et toutes les 60 secondes
setTimeout(checkNasStatus, 2000);
setInterval(checkNasStatus, 60000);

/* === PANNEAU NOTES FLOTTANT === */
var _npProjId = null;

function openNotesPanel(projId) {
    _npProjId = projId;
    var p = data.projects.find(function(x){return x.id===projId;});
    if(!p) return;
    document.getElementById('np-proj-name').textContent = p.name;
    document.getElementById('np-input').value = '';
    var _panel=document.getElementById('notes-panel');
    _panel.style.left=''; _panel.style.top='';
    _panel.classList.add('open');
    renderNotesPanel(p);
    setTimeout(function(){document.getElementById('np-input').focus();},100);
}

function closeNotesPanel() {
    var p = document.getElementById('notes-panel');
    p.classList.remove('open');
    p.style.left=''; p.style.top='';
    _npProjId = null;
}

function renderNotesPanel(p) {
    var notes = p.notes || [];
    var list  = document.getElementById('np-list');
    if(!notes.length){list.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px">Aucune note</div>';return;}
    list.innerHTML = notes.slice().reverse().map(function(n,i){
        var idx = notes.length-1-i;
        return '<div class="notes-panel-item"><div class="note-date">'+n.date+'</div><div style="white-space:pre-wrap;font-size:12px">'+escHtml(n.text)+'</div><button class="note-del" onclick="deleteNote('+idx+')">&#x2715;</button></div>';
    }).join('');
}

function deleteNote(idx) {
    var p = data.projects.find(function(x){return x.id===_npProjId;});
    if(!p||!p.notes) return;
    p.notes.splice(idx,1);
    apiPost('/api/projects',p).then(function(){renderNotesPanel(p);});
}

async function addNotePanel() {
    var text = document.getElementById('np-input').value.trim();
    if(!text||!_npProjId) return;
    var note = {date:new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),text:text};
    document.getElementById('np-input').value = '';
    if(_npProjId==='__global__'){
        var notes=getGlobalNotes(); notes.push(note); saveGlobalNotes(notes); renderGlobalNotesList(); return;
    }
    var p = data.projects.find(function(x){return x.id===_npProjId;});
    if(!p) return;
    if(!p.notes) p.notes=[];
    p.notes.push(note);
    await apiPost('/api/projects',p);
    renderNotesPanel(p);
}

function openGlobalNotes() {
    _npProjId = '__global__';
    document.getElementById('np-proj-name').textContent = 'Notes generales';
    document.getElementById('np-input').value = '';
    var _panel=document.getElementById('notes-panel');
    _panel.style.left=''; _panel.style.top='';
    _panel.classList.add('open');
    renderGlobalNotesList();
    setTimeout(function(){document.getElementById('np-input').focus();},100);
}
function getGlobalNotes(){try{return JSON.parse(localStorage.getItem('gp_global_notes')||'[]');}catch(e){return[];}}
function saveGlobalNotes(n){localStorage.setItem('gp_global_notes',JSON.stringify(n));}
function renderGlobalNotesList(){
    var notes=getGlobalNotes();
    var list=document.getElementById('np-list');
    if(!notes.length){list.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px">Aucune note</div>';return;}
    list.innerHTML=notes.slice().reverse().map(function(n,i){var idx=notes.length-1-i;return '<div class="notes-panel-item"><div class="note-date">'+n.date+'</div><div style="white-space:pre-wrap;font-size:12px">'+escHtml(n.text)+'</div><button class="note-del" onclick="deleteGlobalNote('+idx+')">&#x2715;</button></div>';}).join('');
}
function deleteGlobalNote(idx){var n=getGlobalNotes();n.splice(idx,1);saveGlobalNotes(n);renderGlobalNotesList();}

/* Ctrl+Entree pour ajouter */
document.addEventListener('DOMContentLoaded',function(){
    var inp=document.getElementById('np-input');
    if(inp) inp.addEventListener('keydown',function(e){if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();addNotePanel();}});
});

/* Drag du panneau */
(function(){
    var panel,hdr,dragging=false,ox,oy;
    document.addEventListener('DOMContentLoaded',function(){
        panel=document.getElementById('notes-panel');
        hdr=document.getElementById('np-header');
        if(!panel||!hdr) return;
        hdr.addEventListener('mousedown',function(e){
            if(e.target.closest('button')) return;
            dragging=true;
            var rect=panel.getBoundingClientRect();
            ox=e.clientX-rect.left; oy=e.clientY-rect.top;
            panel.style.left=rect.left+'px';
            panel.style.top=rect.top+'px';
            panel.style.right='auto'; panel.style.bottom='auto';
            e.preventDefault();
        });
        document.addEventListener('mousemove',function(e){if(!dragging)return;panel.style.left=(e.clientX-ox)+'px';panel.style.top=(e.clientY-oy)+'px';});
        document.addEventListener('mouseup',function(){dragging=false;});
    });
})();
