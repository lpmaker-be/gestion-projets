#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Serveur local - Gestionnaire de Projets
Sauvegarde dans D:\claude\gestion_projets\projets.json
"""

import http.server
import json
import webbrowser
from pathlib import Path
from urllib.parse import urlparse, parse_qs

DATA_DIR = Path(r"D:\claude\gestion_projets")
DATA_FILE = DATA_DIR / "projets.json"
PORT = 8742


def ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        default = {"projects": [], "tasks": {}}
        DATA_FILE.write_text(json.dumps(default, ensure_ascii=False, indent=2), encoding="utf-8")


def load_data():
    ensure_data_dir()
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def save_data(data):
    ensure_data_dir()
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class Handler(http.server.SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/data":
            self._json(load_data())
        elif parsed.path == "/":
            self._serve_index()
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        data = load_data()

        if parsed.path == "/api/projects":
            proj = body
            existing = next((i for i, p in enumerate(data["projects"]) if p["id"] == proj["id"]), None)
            if existing is not None:
                data["projects"][existing] = proj
            else:
                data["projects"].append(proj)
                if proj["id"] not in data["tasks"]:
                    data["tasks"][proj["id"]] = []
            save_data(data)
            self._json({"ok": True})

        elif parsed.path == "/api/tasks":
            pid = body.get("projectId")
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
                self._json({"ok": True})
            else:
                self._json({"error": "missing data"}, 400)

        else:
            self._json({"error": "not found"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        data = load_data()

        if parsed.path == "/api/projects":
            pid = qs.get("id", [None])[0]
            if pid:
                data["projects"] = [p for p in data["projects"] if p["id"] != pid]
                data["tasks"].pop(pid, None)
                save_data(data)
                self._json({"ok": True})

        elif parsed.path == "/api/tasks":
            pid = qs.get("projectId", [None])[0]
            tid = qs.get("taskId", [None])[0]
            if pid and tid:
                data["tasks"][pid] = [t for t in data["tasks"].get(pid, []) if t["id"] != tid]
                save_data(data)
                self._json({"ok": True})

        else:
            self._json({"error": "not found"}, 404)

    def _serve_index(self):
        index_path = Path(__file__).parent / "index.html"
        content = index_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self._cors()
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    ensure_data_dir()
    print("")
    print("  Gestionnaire de Projets")
    print(f"  http://localhost:{PORT}")
    print("  Ctrl+C pour arreter")
    print("")
    server = http.server.HTTPServer(("localhost", PORT), Handler)
    webbrowser.open(f"http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Serveur arrete.")
