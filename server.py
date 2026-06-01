#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Serveur local - Gestionnaire de Projets
Sert index.html, styles.css, app.js et l'API REST
"""

import http.server
import json
import io
import datetime
import copy
import webbrowser
try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    EXCEL_OK = True
except ImportError:
    EXCEL_OK = False
from pathlib import Path
from urllib.parse import urlparse, parse_qs

BASE_DIR    = Path(r"D:\Onedrive\Documents\Claude\gestion_projets")
DATA_DIR    = BASE_DIR / "data"
LEGACY_FILE = BASE_DIR / "projets.json"
PORT      = 8742

STATIC_FILES = {
    "/":           ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js":     ("app.js",     "application/javascript; charset=utf-8"),
    "/aide.html":  ("aide.html",   "text/html; charset=utf-8"),
    "/sw.js":       ("sw.js",       "application/javascript; charset=utf-8"),
    "/favicon.svg": ("favicon.svg", "image/svg+xml"),
}


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_history():
    if os.path.exists(HIST_FILE):
        with open(HIST_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_snapshot(action='modification'):
    """Sauvegarde un snapshot du JSON actuel dans l'historique."""
    try:
        data = load_data()
        history = load_history()
        snapshot = {
            'date':   datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
            'action': action,
            'data':   data
        }
        history.insert(0, snapshot)
        history = history[:MAX_VERSIONS]  # Garder seulement les N derniers
        with open(HIST_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Erreur snapshot: {e}")

def load_data():
    """Charge les donnees depuis les dossiers par projet."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Si dossier data vide mais ancien fichier existe -> charger legacy
    entries = list(DATA_DIR.iterdir()) if DATA_DIR.exists() else []
    if not any(e.is_dir() for e in entries) and LEGACY_FILE.exists():
        with open(LEGACY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)

    projects = []
    tasks    = {}

    for proj_dir in sorted(DATA_DIR.iterdir(), key=lambda e: e.name):
        if not proj_dir.is_dir(): continue
        proj_file  = proj_dir / 'projet.json'
        tasks_file = proj_dir / 'taches.json'
        if not proj_file.exists(): continue
        with open(proj_file, 'r', encoding='utf-8') as f:
            p = json.load(f)
        projects.append(p)
        if tasks_file.exists():
            with open(tasks_file, 'r', encoding='utf-8') as f:
                tasks[p['id']] = json.load(f)
        else:
            tasks[p['id']] = []

    return {"projects": projects, "tasks": tasks}


def save_data(data):
    """Sauvegarde les donnees dans les dossiers par projet."""
    save_snapshot()
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    projects = data.get('projects', [])
    tasks    = data.get('tasks', {})

    # Supprimer les dossiers des projets supprimes
    existing_ids = {p['id'] for p in projects}
    for entry in DATA_DIR.iterdir():
        if entry.is_dir() and entry.name not in existing_ids:
            import shutil
            shutil.rmtree(entry)

    for p in projects:
        pid  = p['id']
        pdir = DATA_DIR / pid
        pdir.mkdir(exist_ok=True)
        with open(pdir / 'projet.json', 'w', encoding='utf-8') as f:
            json.dump(p, f, ensure_ascii=False, indent=2)
        pt = tasks.get(pid, [])
        with open(pdir / 'taches.json', 'w', encoding='utf-8') as f:
            json.dump(pt, f, ensure_ascii=False, indent=2)


