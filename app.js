/**
 * =============================================================================
 * GESTIONNAIRE DE PROJETS — app.js
 * Inspiré de Monday.com
 * Auteur : Philippe (lpmaker-be)
 *
 * Structure :
 *   1. Configuration & état global
 *   2. Utilitaires (génération ID, formatage, couleurs)
 *   3. API — communication avec le serveur Python
 *   4. Navigation & filtres
 *   5. Rendu global (renderAll)
 *   6. Vue Tableau (board)
 *   7. Vue Kanban
 *   8. Vue Calendrier
 *   9. Vue Gantt / Timeline
 *  10. Vue Dashboard
 *  11. Chronomètre (time tracker)
 *  12. Modales — projets, tâches, détail
 *  13. Actions CRUD — projets
 *  14. Actions CRUD — tâches
 *  15. Initialisation
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

/** Filtre sidebar par type de projet */
let sideType = '';

/** Set des IDs de projets réduits (collapsed) dans la vue tableau */
let collapsed = new Set();

/** Filtre de priorité des tâches : 'all' | 'high' | 'med' | 'low' */
let prioFilter = 'all';

/** Afficher ou masquer les tâches terminées */
let showDone = true;

/** ID du projet en cours d'édition dans la modale (null = nouveau) */
let editingProjId = null;

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
    return { arduino: '🔌 Arduino/RPI', software: '💻 Logiciel', mixed: '⚙️ Mixte' }[t] || t;
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

        // Migration : s'assurer que tous les projets ont les champs requis
        data.projects.forEach(p => {
            if (!p.start)      p.start      = '';
            if (!p.components) p.components = '';
        });

        // Migration : s'assurer que toutes les tâches ont les champs requis
        Object.values(data.tasks).flat().forEach(t => {
            if (!t.estimate)  t.estimate  = 0;
            if (!t.timeSpent) t.timeSpent = 0;
            if (!t.depends)   t.depends   = '';
            if (!t.start)     t.start     = '';
        });

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
    const r = await fetch(`${API}${url}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
    });
    return r.json();
}

/**
 * Envoie une requête DELETE au serveur.
 * @param {string} url - Chemin API avec paramètres (ex: '/api/projects?id=xxx')
 * @returns {Promise<object>}
 */
async function apiDel(url) {
    const r = await fetch(`${API}${url}`, { method: 'DELETE' });
    return r.json();
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
        // Filtre statut
        if (sideFilter !== 'all' && p.status !== sideFilter) return false;
        // Filtre type
        if (typeF && p.type !== typeF) return false;
        // Filtre recherche textuelle (nom, description, composants)
        if (search &&
            !p.name.toLowerCase().includes(search) &&
            !(p.desc       || '').toLowerCase().includes(search) &&
            !(p.components || '').toLowerCase().includes(search)
        ) return false;
        return true;
    });

    // Tri
    projs.sort((a, b) => {
        if (sortBy === 'deadline')  return (a.deadline || '9999') > (b.deadline || '9999') ? 1 : -1;
        if (sortBy === 'priority')  { const po = { high: 0, med: 1, low: 2 }; return po[a.priority] - po[b.priority]; }
        if (sortBy === 'name')      return a.name.localeCompare(b.name);
        return b.createdAt - a.createdAt;    // Par défaut : ordre de création décroissant
    });

    return projs;
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
    return t;
}


/* =============================================================================
   5. RENDU GLOBAL
   ============================================================================= */

/**
 * Met à jour les compteurs dans la sidebar.
 */
function updateSideCounts() {
    const c = { all: data.projects.length, todo: 0, prog: 0, done: 0, block: 0 };
    data.projects.forEach(p => { c[p.status] = (c[p.status] || 0) + 1; });
    ['all', 'todo', 'prog', 'done', 'block'].forEach(k => {
        const el = document.getElementById('sc-' + k);
        if (el) el.textContent = c[k] || 0;
    });
}

/**
 * Met à jour la barre de résumé en bas d'écran.
 */
function updateSummary() {
    const allT     = Object.values(data.tasks).flat();
    const doneT    = allT.filter(t => t.done).length;
    const pct      = allT.length ? Math.round(doneT / allT.length * 100) : 0;
    const overdue  = allT.filter(t => !t.done && t.deadline && new Date(t.deadline) < new Date()).length;
    const totalEst = allT.reduce((s, t) => s + (t.estimate || 0), 0);

    document.getElementById('summary-bar').innerHTML = `
        <div class="sum-item">
            <span class="sum-dot" style="background:#0073ea"></span>
            <span class="sum-lbl">Projets</span>
            <span class="sum-val">${data.projects.length}</span>
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
        ${totalEst > 0 ? `
        <div class="sum-item">
            <span class="sum-dot" style="background:#579bfc"></span>
            <span class="sum-lbl">Estimé</span>
            <span class="sum-val">${totalEst}h</span>
        </div>` : ''}
    `;
}

/**
 * Point d'entrée principal du rendu — dispatch vers la vue active.
 */
function renderAll() {
    updateSideCounts();
    updateSummary();

    if      (currentView === 'board')     renderBoard();
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
        <div class="project-block">
            <div class="proj-hdr">
                <button class="collapse-btn ${isCol ? '' : 'open'}" onclick="toggleCollapse('${p.id}')">▶</button>
                <span class="proj-color" style="background:${color}"></span>
                <input class="proj-name-inp"
                    value="${escHtml(p.name)}"
                    onblur="renameProj('${p.id}', this.value)"
                    onkeydown="if(event.key==='Enter') this.blur()">
                <span class="proj-tc">${allTasks.length} tâche${allTasks.length !== 1 ? 's' : ''}</span>
                ${p.components ? `<span style="font-size:11px;color:var(--text3);margin-left:8px">🔧 ${escHtml(p.components)}</span>` : ''}
                <div class="proj-prog">
                    <div class="mini-pb">
                        <div class="mini-pb-fill" style="width:${pct}%;background:${color}"></div>
                    </div>
                    <span class="mini-pb-txt">${pct}%</span>
                </div>
                <div class="proj-actions">
                    <button class="ic-btn" onclick="openTaskModal('${p.id}')"    title="Ajouter tâche">＋</button>
                    <button class="ic-btn" onclick="openProjectModal('${p.id}')" title="Modifier">✏️</button>
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
                            <th style="width:50px"></th>
                        </tr>
                    </thead>
                    <tbody>

                    <!-- Ligne résumé projet -->
                    <tr style="background:#f0f4ff;border-left:4px solid ${color}" onclick="openProjectModal('${p.id}')">
                        <td></td>
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
                            ${allTasks.reduce((s, t) => s + (t.estimate || 0), 0)}h
                        </td>
                        <td></td>
                    </tr>`;

            // Lignes de tâches
            tasks.forEach(t => {
                const tdl       = t.deadline ? dlInfo(t.deadline) : null;
                const isRunning = timers[t.id] && timers[t.id].running;
                const spent     = (t.timeSpent || 0) + (isRunning
                    ? Math.floor((Date.now() - timers[t.id].start) / 1000)
                    : 0);

                html += `
                    <tr class="task-row ${t.done ? 'row-done' : ''}" onclick="openTaskDetail('${p.id}', '${t.id}')">
                        <td onclick="event.stopPropagation()">
                            <input class="row-chk" type="checkbox" ${t.done ? 'checked' : ''}
                                   onchange="toggleTask('${p.id}', '${t.id}')">
                        </td>
                        <td>
                            <div class="tname-cell">
                                ${t.depends ? `<span style="font-size:10px;color:var(--text3)" title="Dépend de ${t.depends}">🔗</span>` : ''}
                                <span class="tname-txt ${t.done ? 'done' : ''}">${escHtml(t.name)}</span>
                                ${t.note ? `<span class="note-ic" title="${escHtml(t.note)}">📝</span>` : ''}
                                <button class="open-btn"
                                        onclick="event.stopPropagation(); openTaskDetail('${p.id}', '${t.id}')">
                                    Ouvrir
                                </button>
                            </div>
                        </td>
                        <td></td>
                        <td><span class="pill ${prioCls(t.priority)}">${prioLabel(t.priority)}</span></td>
                        <td class="dl-cell ${tdl ? tdl.cls : ''}">${tdl ? tdl.str : '—'}</td>
                        <td onclick="event.stopPropagation()">
                            <button class="tt-btn ${isRunning ? 'running' : ''}"
                                    onclick="toggleTimer('${p.id}', '${t.id}')">
                                ${isRunning ? '⏹' : '▶'} ${spent > 0 ? fmtTime(spent) : ''}
                            </button>
                        </td>
                        <td style="font-size:12px;color:var(--text2)">
                            ${t.estimate ? t.estimate + 'h' : '—'}
                        </td>
                        <td onclick="event.stopPropagation()">
                            <button class="ic-btn" style="color:var(--red);font-size:12px"
                                    onclick="deleteTask('${p.id}', '${t.id}')">✕</button>
                        </td>
                    </tr>`;
            });

            html += `
                    </tbody>
                </table>

                <!-- Bouton ajout rapide de tâche -->
                <table class="btbl">
                    <tbody>
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

    document.getElementById('content').innerHTML = html;
}

/**
 * Collapse/expand un projet dans la vue tableau.
 * @param {string} id - ID du projet
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
    document.getElementById('content').innerHTML = html;
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
    document.getElementById('content').innerHTML = html;
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
    document.getElementById('content').innerHTML = html;
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
    const projs      = data.projects;
    const allT       = Object.values(data.tasks).flat();
    const doneT      = allT.filter(t => t.done).length;
    const overdueT   = allT.filter(t => !t.done && t.deadline && new Date(t.deadline) < new Date());
    const totalEst   = allT.reduce((s, t) => s + (parseFloat(t.estimate) || 0), 0);
    const totalSpent = allT.reduce((s, t) => s + (t.timeSpent || 0), 0);

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
        ${totalEst > 0 ? `
        <div class="dash-widget">
            <h3>⏱ Suivi du temps</h3>
            <div class="stat-grid">
                <div class="stat-box">
                    <div class="stat-val blue">${totalEst}h</div>
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

    document.getElementById('content').innerHTML = html;
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

    let angle = -90;
    let segs  = '';

    vals.forEach((v, i) => {
        const fraction = v / total;
        const sweep    = fraction * 360;
        if (fraction === 0) return;

        const r  = 28, cx = 40, cy = 40;
        const a1 = angle        * Math.PI / 180;
        const a2 = (angle + sweep) * Math.PI / 180;
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);
        const la = sweep > 180 ? 1 : 0;    // large-arc-flag

        segs += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${la},1 ${x2},${y2} Z" fill="${cols[i]}"/>`;
        angle += sweep;
    });

    // Cercle central blanc + total
    return segs + `
        <circle cx="40" cy="40" r="16" fill="white"/>
        <text x="40" y="44" text-anchor="middle" font-size="11" font-weight="700" fill="#323338">${total}</text>`;
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
        document.getElementById('f-desc').value       = p.desc       || '';
    } else {
        // Remise à zéro du formulaire
        ['f-name', 'f-desc', 'f-components'].forEach(i => document.getElementById(i).value = '');
        document.getElementById('f-type').value     = 'arduino';
        document.getElementById('f-status').value   = 'todo';
        document.getElementById('f-priority').value = 'med';
        document.getElementById('f-deadline').value = '';
        document.getElementById('f-start').value    = '';
    }

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
    } else {
        // Remise à zéro
        ['t-name', 't-note', 't-depends'].forEach(i => document.getElementById(i).value = '');
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
                <div style="font-size:13px">${t.estimate ? t.estimate + 'h' : '—'}</div>
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
        desc:       document.getElementById('f-desc').value.trim(),
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
    if (!confirm('Supprimer ce projet et toutes ses tâches ?')) return;

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

    // Récupérer les données existantes si modification
    const existing = editingTaskId
        ? (data.tasks[taskProjId] || []).find(x => x.id === editingTaskId) || {}
        : {};

    const task = {
        id:        editingTaskId || genId(),
        name,
        priority:  document.getElementById('t-priority').value,
        deadline:  document.getElementById('t-deadline').value,
        start:     document.getElementById('t-start').value,
        estimate:  parseFloat(document.getElementById('t-estimate').value) || 0,
        depends:   document.getElementById('t-depends').value.trim(),
        note:      document.getElementById('t-note').value.trim(),
        done:      existing.done      || false,
        timeSpent: existing.timeSpent || 0
    };

    await apiPost('/api/tasks', { projectId: taskProjId, task });

    if (!data.tasks[taskProjId]) data.tasks[taskProjId] = [];

    if (editingTaskId) {
        const i = data.tasks[taskProjId].findIndex(x => x.id === editingTaskId);
        if (i >= 0) data.tasks[taskProjId][i] = task;
    } else {
        data.tasks[taskProjId].push(task);
    }

    closeModal('modal-task');
    addActivity(editingTaskId ? `Tâche modifiée : ${task.name}` : `Tâche créée : ${task.name}`);
    toast(editingTaskId ? 'Tâche modifiée ✓' : 'Tâche ajoutée ✓');
    renderAll();
}

/**
 * Bascule l'état terminé/non-terminé d'une tâche.
 * @param {string} projId - ID du projet
 * @param {string} taskId - ID de la tâche
 */
async function toggleTask(projId, taskId) {
    const t = (data.tasks[projId] || []).find(x => x.id === taskId);
    if (!t) return;

    t.done = !t.done;
    await apiPost('/api/tasks', { projectId: projId, task: t });
    addActivity(`Tâche ${t.done ? 'terminée' : 'réouverte'} : ${t.name}`);
    renderAll();
}

/**
 * Supprime une tâche.
 * @param {string} projId - ID du projet
 * @param {string} taskId - ID de la tâche
 */
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
    if (e.key === 'Escape') {
        ['modal-project', 'modal-task', 'modal-detail'].forEach(closeModal);
    }
});

/** Démarrage : chargement des données depuis le serveur */
loadData();
