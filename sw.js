
/**
 * Service Worker - Gestionnaire de Projets
 * Gere les notifications push pour les rappels de taches
 * meme quand la page est fermee (navigateur ouvert en arriere-plan)
 */

const SW_VERSION = '1.0.0';
const API_BASE   = 'http://localhost:8742';
const CHECK_INTERVAL = 60000; // Verifier toutes les 60 secondes

// ── Installation du Service Worker ───────────────────────────────────────
self.addEventListener('install', function(e) {
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    e.waitUntil(self.clients.claim());
    // Demarrer la verification des rappels
    scheduleCheck();
});

// ── Verification periodique des rappels ──────────────────────────────────
var checkTimer = null;

function scheduleCheck() {
    checkTimer = setInterval(checkReminders, CHECK_INTERVAL);
    checkReminders(); // Verifier immediatement
}

async function checkReminders() {
    try {
        var resp = await fetch(API_BASE + '/api/data');
        if (!resp.ok) return;
        var data = await resp.json();
        var now  = new Date();

        // Parcourir tous les projets et taches
        (data.projects || []).forEach(function(p) {
            var pt = (data.tasks || {})[p.id] || [];
            pt.forEach(function(t) { checkTaskReminder(t, p.name, now); });
        });
    } catch(e) {
        // Serveur indisponible - silencieux
    }
}

function checkTaskReminder(t, projName, now) {
    if (!t.reminder || t.done || t.reminderFired) return;

    var remDate = new Date(t.reminder);
    var diff    = remDate - now;

    // Declencher si le rappel est dans la prochaine minute (60s)
    if (diff >= -60000 && diff <= 60000) {
        fireNotification(t, projName);
        // Marquer comme declenche via l'API
        markReminderFired(t);
    }

    // Verifier les sous-taches recursivement
    (t.subtasks || []).forEach(function(st) {
        checkTaskReminder(st, projName, now);
    });
}

async function fireNotification(task, projName) {
    var options = {
        body:    projName + ' — ' + task.name,
        icon:    API_BASE + '/favicon.ico',
        badge:   API_BASE + '/favicon.ico',
        tag:     'reminder-' + task.id,
        data:    { taskId: task.id, url: API_BASE },
        actions: [
            { action: 'open',    title: 'Ouvrir' },
            { action: 'dismiss', title: 'Ignorer' }
        ],
        requireInteraction: true,
        vibrate: [200, 100, 200]
    };

    await self.registration.showNotification(
        'Rappel - Gestionnaire de Projets',
        options
    );
}

async function markReminderFired(task) {
    // On ne peut pas modifier directement le JSON depuis le SW
    // On envoie un message a la page si elle est ouverte
    var clients = await self.clients.matchAll();
    clients.forEach(function(client) {
        client.postMessage({ type: 'REMINDER_FIRED', taskId: task.id });
    });
}

// ── Gestion du clic sur la notification ──────────────────────────────────
self.addEventListener('notificationclick', function(e) {
    e.notification.close();

    if (e.action === 'dismiss') return;

    var url     = (e.notification.data || {}).url || API_BASE;
    var taskId  = (e.notification.data || {}).taskId;

    e.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(function(clients) {
            // Si la page est deja ouverte, la focus
            for (var i = 0; i < clients.length; i++) {
                if (clients[i].url.includes('localhost:8742')) {
                    clients[i].focus();
                    if (taskId) clients[i].postMessage({ type: 'OPEN_TASK', taskId: taskId });
                    return;
                }
            }
            // Sinon ouvrir une nouvelle fenetre
            return self.clients.openWindow(url);
        })
    );
});
