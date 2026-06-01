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
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    entries = [e for e in DATA_DIR.iterdir() if e.is_dir()] if DATA_DIR.exists() else []
    if not entries and LEGACY_FILE.exists():
        with open(LEGACY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    projects, tasks = [], {}
    for proj_dir in sorted(DATA_DIR.iterdir(), key=lambda e: e.name):
        if not proj_dir.is_dir(): continue
        pf = proj_dir / 'projet.json'
        tf = proj_dir / 'taches.json'
        if not pf.exists(): continue
        with open(pf, 'r', encoding='utf-8') as f:
            p = json.load(f)
        projects.append(p)
        with open(tf, 'r', encoding='utf-8') as f2:
            tasks[p['id']] = json.load(f2) if tf.exists() else []
    return {"projects": projects, "tasks": tasks}

def save_data(data):
    save_snapshot()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    projects, tasks = data.get('projects',[]), data.get('tasks',{})
    existing_ids = {p['id'] for p in projects}
    for entry in DATA_DIR.iterdir():
        if entry.is_dir() and entry.name not in existing_ids:
            import shutil; shutil.rmtree(entry)
    for p in projects:
        pdir = DATA_DIR / p['id']
        pdir.mkdir(exist_ok=True)
        with open(pdir/'projet.json','w',encoding='utf-8') as f:
            json.dump(p, f, ensure_ascii=False, indent=2)
        with open(pdir/'taches.json','w',encoding='utf-8') as f:
            json.dump(tasks.get(p['id'],[]), f, ensure_ascii=False, indent=2)


class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


    def _export_excel(self):
        from urllib.parse import urlparse, parse_qs
        import io
        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        except ImportError:
            self.send_response(500); self.end_headers()
            self.wfile.write(b"openpyxl non installe"); return

        qs      = parse_qs(urlparse(self.path).query)
        proj_id = qs.get('projId', [None])[0]
        data    = load_data()
        projects = data.get('projects', [])
        tasks    = data.get('tasks', {})
        if proj_id:
            projects = [p for p in projects if p['id'] == proj_id]

        STATUS = {'todo':'A faire','prog':'En cours','done':'Termine','block':'Bloque'}
        PRIO   = {'high':'Haute','med':'Moyenne','low':'Basse'}
        hf = Font(bold=True,color='FFFFFF',size=11)
        hfill = PatternFill('solid',fgColor='0073EA')
        ha = Alignment(horizontal='center',vertical='center')
        bd = Side(style='thin',color='E6E9EF')
        bdr = Border(left=bd,right=bd,top=bd,bottom=bd)

        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        ws_all = wb.create_sheet("Tous les projets")
        for c, h in enumerate(['Projet','Type','Statut','Priorite','Debut','Deadline','Avancement','Taches','Estime (h)','Budget est.','Budget reel'], 1):
            cell = ws_all.cell(row=1,column=c,value=h)
            cell.font=hf; cell.fill=hfill; cell.alignment=ha; cell.border=bdr
        for ri, p in enumerate(projects, 2):
            pt = tasks.get(p['id'],[])
            done = sum(1 for t in pt if t.get('done'))
            total = len(pt)
            pct = int(done/total*100) if total else 0
            est = sum(float(t.get('estimate',0) or 0) for t in pt)
            for ci, val in enumerate([p.get('name',''),p.get('type',''),STATUS.get(p.get('status',''),''),PRIO.get(p.get('priority',''),''),p.get('start',''),p.get('deadline',''),f"{pct}% ({done}/{total})",total,est,p.get('budgetEst',0) or 0,p.get('budgetReal',0) or 0], 1):
                cell = ws_all.cell(row=ri,column=ci,value=val)
                cell.border=bdr
                if ri%2==0: cell.fill=PatternFill('solid',fgColor='F6F7FB')
        for i,w in enumerate([35,15,12,10,12,12,15,8,12,15,15],1):
            ws_all.column_dimensions[openpyxl.utils.get_column_letter(i)].width=w
        ws_all.freeze_panes='A2'

        for p in projects:
            name = p.get('name','')[:31].replace('/','').replace('?','').replace('*','').replace('[','').replace(']','') or 'Projet'
            ws = wb.create_sheet(name)
            ws.merge_cells('A1:H1')
            ws['A1'].value=p.get('name',''); ws['A1'].font=Font(bold=True,size=13,color='FFFFFF'); ws['A1'].fill=hfill
            ws.row_dimensions[1].height=28
            for ci,h in enumerate(['Tache','Statut','Priorite','Deadline','Estime (h)','Temps passe','Notes','Tags'],1):
                cell=ws.cell(row=3,column=ci,value=h)
                cell.font=Font(bold=True,color='FFFFFF',size=10); cell.fill=PatternFill('solid',fgColor='323338'); cell.alignment=ha; cell.border=bdr
            ws.row_dimensions[3].height=22
            pt = tasks.get(p['id'],[])
            row_idx=[4]
            def write_t(t,indent=0):
                ri=row_idx[0]; prefix='  '*indent+('L ' if indent else '')
                sp=t.get('timeSpent',0) or 0; sph=f"{int(sp/3600)}h{int((sp%3600)/60):02d}" if sp else ''
                row=[prefix+t.get('name',''),STATUS.get(t.get('status','todo'),''),PRIO.get(t.get('priority','med'),''),t.get('deadline',''),float(t.get('estimate',0) or 0) or '',sph,t.get('note',''),', '.join(t.get('tags',[]))]
                dfont=Font(color='888888',strikethrough=True)
                for ci,val in enumerate(row,1):
                    cell=ws.cell(row=ri,column=ci,value=val); cell.border=bdr
                    if t.get('done'): cell.font=dfont
                    elif indent>0: cell.fill=PatternFill('solid',fgColor='E8F0FE')
                    elif ri%2==0: cell.fill=PatternFill('solid',fgColor='F6F7FB')
                row_idx[0]+=1
                for st in t.get('subtasks',[]): write_t(st,indent+1)
            for t in pt: write_t(t)
            for i,w in enumerate([40,12,10,12,10,10,30,20],1):
                ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width=w
            ws.freeze_panes='A4'

        output=io.BytesIO(); wb.save(output); xlsx=output.getvalue()
        fname=f"projet_{proj_id[:8]}.xlsx" if proj_id else "projets_export.xlsx"
        self.send_response(200)
        self.send_header('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.send_header('Content-Disposition',f'attachment; filename="{fname}"')
        self.send_header('Content-Length',str(len(xlsx)))
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers()
        self.wfile.write(xlsx)

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

    def do_HEAD(self):
        """Supporte les requetes HEAD pour la verification de connexion."""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
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
        elif path == "/api/history":
            self._send_json(load_history())
        elif path.startswith("/api/restore"):
            self._restore_snapshot()


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
    print(f"  Donnees : {LEGACY_FILE}")
    print("")
    print("  Ferme cette fenetre pour arreter le serveur")
    print("")
    server = http.server.HTTPServer(("localhost", PORT), Handler)
    webbrowser.open(f"http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Serveur arrete.")
