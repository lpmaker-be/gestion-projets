#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Serveur local - Gestionnaire de Projets
Sert index.html, styles.css, app.js et l'API REST
"""

import http.server
import json
import io
import webbrowser
try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    EXCEL_OK = True
except ImportError:
    EXCEL_OK = False
from pathlib import Path
from urllib.parse import urlparse, parse_qs

DATA_DIR  = Path(r"D:\Onedrive\Documents\Claude\gestion_projets")
DATA_FILE = DATA_DIR / "projets.json"
PORT      = 8742

STATIC_FILES = {
    "/":           ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js":     ("app.js",     "application/javascript; charset=utf-8"),
    "/aide.html":  ("aide.html",   "text/html; charset=utf-8"),
}


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(
            json.dumps({"projects": [], "tasks": {}}, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

def load_data():
    ensure_data_dir()
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))

def save_data(data):
    ensure_data_dir()
    DATA_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, filename, content_type):
        filepath = DATA_DIR / filename
        if not filepath.exists():
            self.send_response(404)
            self.end_headers()
            return
        content = filepath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in STATIC_FILES:
            filename, content_type = STATIC_FILES[path]
            self._send_file(filename, content_type)
        elif path == "/api/data":
            self._send_json(load_data())
        elif path.startswith("/api/export-excel"):
            self._export_excel()

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        body   = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        data   = load_data()

        if parsed.path == "/api/projects":
            proj     = body
            existing = next((i for i, p in enumerate(data["projects"]) if p["id"] == proj["id"]), None)
            if existing is not None:
                data["projects"][existing] = proj
            else:
                data["projects"].append(proj)
                if proj["id"] not in data["tasks"]:
                    data["tasks"][proj["id"]] = []
            save_data(data)
            self._send_json({"ok": True})

        elif parsed.path == "/api/tasks":
            pid  = body.get("projectId")
            task = body.get("task")
            if pid and task:
                if pid not in data["tasks"]:
                    data["tasks"][pid] = []
                existing = next((i for i, t in enumerate(data["tasks"][pid]) if t["id"] == task["id"]), None)
                if existing is not None:
                    data["tasks"][pid][existing] = task
                else:
                    data["tasks"][pid].append(task)
                save_data(data)
                self._send_json({"ok": True})
            else:
                self._send_json({"error": "missing data"}, 400)
        else:
            self._send_json({"error": "not found"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)
        data   = load_data()

        if parsed.path == "/api/projects":
            pid = qs.get("id", [None])[0]
            if pid:
                data["projects"] = [p for p in data["projects"] if p["id"] != pid]
                data["tasks"].pop(pid, None)
                save_data(data)
                self._send_json({"ok": True})

        elif parsed.path == "/api/tasks":
            pid = qs.get("projectId", [None])[0]
            tid = qs.get("taskId",    [None])[0]
            if pid and tid:
                data["tasks"][pid] = [t for t in data["tasks"].get(pid, []) if t["id"] != tid]
                save_data(data)
                self._send_json({"ok": True})
        else:
            self._send_json({"error": "not found"}, 404)


if __name__ == "__main__":
    ensure_data_dir()
    print("")
    print("  ========================================")
    print("   Gestionnaire de Projets - Demarrage")
    print("  ========================================")
    print("")
    print(f"  Adresse : http://localhost:{PORT}")
    print(f"  Donnees : {DATA_FILE}")
    print("")
    print("  Ferme cette fenetre pour arreter le serveur")
    print("")
    server = http.server.HTTPServer(("localhost", PORT), Handler)
    webbrowser.open(f"http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Serveur arrete.")
