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
import os
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
LEGACY_FILE  = BASE_DIR / "projets.json"
ARCHIVE_DIR  = BASE_DIR / "archives"
HIST_FILE    = BASE_DIR / "historique.json"
MAX_VERSIONS = 5
PORT         = 8742

STATIC_FILES = {
    "/":           ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js":     ("app.js",     "application/javascript; charset=utf-8"),
    "/aide.html":  ("aide.html",   "text/html; charset=utf-8"),
    "/sw.js":       ("sw.js",       "application/javascript; charset=utf-8"),
    "/favicon.svg": ("favicon.svg", "image/svg+xml"),
    "/morphdom.min.js": ("morphdom.min.js", "application/javascript"),
    "/sortable.min.js": ("sortable.min.js", "application/javascript"),
}



def proj_dirname(p):
    """Retourne un nom de dossier valide depuis le nom du projet."""
    import re
    name = p.get('name', p['id'])
    # Remplacer les caracteres invalides
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = name.strip('. ')[:60]  # Max 60 chars
    return name or p['id']

def find_proj_dir(pid):
    """Trouve le dossier d'un projet par son ID (cherche dans tous les sous-dossiers)."""
    if not DATA_DIR.exists():
        return None
    for d in DATA_DIR.iterdir():
        if not d.is_dir(): continue
        pf = d / 'projet.json'
        if pf.exists():
            with open(pf, 'r', encoding='utf-8') as f:
                p = json.load(f)
            if p.get('id') == pid:
                return d
    return None

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
    # Ajouter les projets archives depuis les zips
    ARCHIVE_DIR.mkdir(exist_ok=True)
    for zip_path in sorted(ARCHIVE_DIR.iterdir()):
        if zip_path.suffix != '.zip': continue
        try:
            import zipfile
            with zipfile.ZipFile(zip_path, 'r') as z:
                # Chercher projet.json dans le zip
                names = z.namelist()
                proj_files = [n for n in names if n.endswith('projet.json')]
                tasks_files = [n for n in names if n.endswith('taches.json')]
                if proj_files:
                    p = json.loads(z.read(proj_files[0]).decode('utf-8'))
                    p['archived'] = True  # S'assurer que archived=True
                    projects.append(p)
                    if tasks_files:
                        tasks[p['id']] = json.loads(z.read(tasks_files[0]).decode('utf-8'))
                    else:
                        tasks[p['id']] = []
        except Exception as e:
            print(f"Erreur lecture archive {zip_path.name}: {e}")

    return {"projects": projects, "tasks": tasks}

def save_data(data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    projects, tasks = data.get('projects',[]), data.get('tasks',{})
    existing_ids = {p['id'] for p in projects}
    for entry in DATA_DIR.iterdir():
        if not entry.is_dir(): continue
        # Ne supprimer que si c'est un vrai dossier projet (contient projet.json)
        pjson = entry / 'projet.json'
        if not pjson.exists(): continue
        try:
            import json as _j
            with open(pjson,'r',encoding='utf-8') as _f: _p = _j.load(_f)
            if _p.get('id') not in existing_ids:
                import shutil; shutil.rmtree(entry)
        except: pass
    for p in projects:
        # Ne pas recreer le dossier d'un projet archive
        if p.get('archived'):
            continue
        # Chercher si le dossier existe deja (par ID)
        existing = find_proj_dir(p['id'])
        # Calculer le nouveau nom de dossier
        new_name = proj_dirname(p)
        new_path = DATA_DIR / new_name
        # Renommer si necessaire
        if existing and existing.name != new_name:
            existing.rename(new_path)
            pdir = new_path
        elif existing:
            pdir = existing
        else:
            pdir = new_path
        pdir.mkdir(exist_ok=True)
        # Creer les sous-dossiers standard
        for sub in ['images', 'stl', 'cura', 'docs']:
            (pdir / sub).mkdir(exist_ok=True)
        with open(pdir/'projet.json','w',encoding='utf-8') as f:
            json.dump(p, f, ensure_ascii=False, indent=2)
        with open(pdir/'taches.json','w',encoding='utf-8') as f:
            json.dump(tasks.get(p['id'],[]), f, ensure_ascii=False, indent=2)
    # Snapshot APRES l'ecriture
    try:
        save_snapshot()
    except Exception as e:
        print(f"Erreur snapshot (non critique): {e}")


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
        filepath = BASE_DIR / filename
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



    def _delete_archive(self):
        """Supprime definitivement une archive zip et retire le projet."""
        from urllib.parse import urlparse, parse_qs
        import re as _re
        qs      = parse_qs(urlparse(self.path).query)
        proj_id = qs.get('projId', [None])[0]
        if not proj_id:
            self._send_json({'error': 'projId manquant'}); return

        # Trouver le projet dans les archives (zip)
        data = load_data()
        proj = next((p for p in data['projects'] if p['id'] == proj_id), None)
        if not proj:
            self._send_json({'error': 'Projet introuvable'}); return

        # Supprimer le zip
        zip_name = _re.sub(r'[<>:"/\\|?*]', '_', proj.get('name', proj_id)).strip('. ')[:60] + '.zip'
        zip_path = ARCHIVE_DIR / zip_name
        if zip_path.exists():
            zip_path.unlink()
            print(f"Archive supprimee: {zip_path}")

        # Retirer le projet de la liste et sauvegarder
        data['projects'] = [p for p in data['projects'] if p['id'] != proj_id]
        if proj_id in data['tasks']:
            del data['tasks'][proj_id]

        # Sauvegarder sans le projet supprime
        # On sauvegarde manuellement pour eviter les complications avec save_data
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        active = [p for p in data['projects'] if not p.get('archived')]
        for p in active:
            pdir = find_proj_dir(p['id'])
            if not pdir:
                pdir = DATA_DIR / proj_dirname(p)
                pdir.mkdir(exist_ok=True)
            with open(pdir / 'projet.json', 'w', encoding='utf-8') as f:
                json.dump(p, f, ensure_ascii=False, indent=2)
            with open(pdir / 'taches.json', 'w', encoding='utf-8') as f:
                json.dump(data['tasks'].get(p['id'], []), f, ensure_ascii=False, indent=2)

        self._send_json({'ok': True})

    def _restore_snapshot(self):
        from urllib.parse import urlparse, parse_qs
        qs  = parse_qs(urlparse(self.path).query)
        idx = int(qs.get('idx', [0])[0])
        history = load_history()
        if 0 <= idx < len(history):
            snap = history[idx]
            save_data(snap['data'])
            self._send_json({'ok': True, 'date': snap['date']})
        else:
            self._send_json({'ok': False, 'error': 'Index invalide'})

    def _list_archives(self):
        ARCHIVE_DIR.mkdir(exist_ok=True)
        archives = []
        for f in sorted(ARCHIVE_DIR.iterdir()):
            if f.suffix == '.zip':
                archives.append({'name': f.stem, 'file': f.name,
                    'size': f.stat().st_size,
                    'date': datetime.datetime.fromtimestamp(f.stat().st_mtime).strftime('%d/%m/%Y %H:%M')})
        self._send_json({'archives': archives})

    def _archive_project(self):
        from urllib.parse import urlparse, parse_qs
        import zipfile
        qs      = parse_qs(urlparse(self.path).query)
        proj_id = qs.get('projId', [None])[0]
        if not proj_id: self._send_json({'error': 'projId manquant'}); return
        pdir = find_proj_dir(proj_id)
        if not pdir: self._send_json({'error': 'Projet introuvable'}); return
        ARCHIVE_DIR.mkdir(exist_ok=True)
        zip_name = pdir.name + '.zip'
        zip_path = ARCHIVE_DIR / zip_name
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in pdir.rglob('*'):
                if file.is_file():
                    z.write(file, file.relative_to(pdir.parent))
        # Marquer archive et sauvegarder AVANT de supprimer le dossier
        data = load_data()
        for p in data['projects']:
            if p['id'] == proj_id:
                p['archived'] = True
                break
        save_data(data)

        # Supprimer le dossier APRES save_data
        import shutil, time, stat
        time.sleep(0.1)
        if pdir.exists():
            def force_remove(func, path, exc):
                import os
                os.chmod(path, stat.S_IWRITE)
                func(path)
            shutil.rmtree(pdir, onerror=force_remove)

        self._send_json({'ok': True, 'zip': zip_name, 'size': zip_path.stat().st_size})

    def _unarchive_project(self):
        from urllib.parse import urlparse, parse_qs
        import re as _re
        qs      = parse_qs(urlparse(self.path).query)
        proj_id = qs.get('projId', [None])[0]
        if not proj_id: self._send_json({'error': 'projId manquant'}); return
        data = load_data()
        proj = next((p for p in data['projects'] if p['id'] == proj_id), None)
        if not proj: self._send_json({'error': 'Projet introuvable'}); return
        zip_name = _re.sub(r'[<>:"/\\|?*]', '_', proj.get('name', proj_id)).strip('. ')[:60] + '.zip'
        zip_path = ARCHIVE_DIR / zip_name
        # Restaurer le dossier depuis le zip
        if zip_path.exists():
            import zipfile
            with zipfile.ZipFile(zip_path, 'r') as z:
                z.extractall(DATA_DIR)
            zip_path.unlink()

        proj['archived'] = False
        save_data(data)
        self._send_json({'ok': True})

    def _list_files(self):
        from urllib.parse import urlparse, parse_qs
        import mimetypes
        qs      = parse_qs(urlparse(self.path).query)
        proj_id = qs.get('projId', [None])[0]
        subdir  = qs.get('dir',    ['images'])[0]
        if not proj_id or subdir not in ['images','stl','cura','docs']:
            self._send_json({'error': 'Parametres invalides'}); return
        pdir = find_proj_dir(proj_id)
        if not pdir: self._send_json({'files': []}); return
        target = pdir / subdir
        target.mkdir(exist_ok=True)
        files = []
        for f in sorted(target.iterdir()):
            if f.is_file():
                files.append({'name': f.name, 'size': f.stat().st_size,
                    'url': f'/api/files/get?projId={proj_id}&dir={subdir}&file={f.name}'})
        self._send_json({'files': files})

    def _get_file(self):
        from urllib.parse import urlparse, parse_qs
        import mimetypes
        qs      = parse_qs(urlparse(self.path).query)
        proj_id = qs.get('projId', [None])[0]
        subdir  = qs.get('dir',    ['images'])[0]
        fname   = qs.get('file',   [None])[0]
        if not all([proj_id, subdir, fname]) or subdir not in ['images','stl','cura','docs']:
            self.send_response(400); self.end_headers(); return
        pdir = find_proj_dir(proj_id)
        if not pdir: self.send_response(404); self.end_headers(); return
        fpath = pdir / subdir / fname
        if not fpath.exists(): self.send_response(404); self.end_headers(); return
        import mimetypes
        ctype = mimetypes.guess_type(str(fpath))[0] or 'application/octet-stream'
        content = fpath.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Content-Disposition', f'inline; filename="{fname}"')
        self._cors()
        self.end_headers()
        self.wfile.write(content)

    def _upload_file(self):
        from urllib.parse import urlparse, parse_qs
        import re as _re
        qs      = parse_qs(urlparse(self.path).query)
        proj_id = qs.get('projId', [None])[0]
        subdir  = qs.get('dir',    ['images'])[0]
        if not proj_id or subdir not in ['images','stl','cura','docs']:
            self._send_json({'error': 'Parametres invalides'}); return
        pdir = find_proj_dir(proj_id)
        if not pdir: self._send_json({'error': 'Projet introuvable'}); return
        ctype  = self.headers.get('Content-Type', '')
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)
        boundary = None
        for part in ctype.split(';'):
            part = part.strip()
            if part.startswith('boundary='):
                boundary = part[9:].strip('"'); break
        if not boundary: self._send_json({'error': 'Pas de boundary'}); return
        bnd   = ('--' + boundary).encode()
        parts = body.split(bnd)
        saved = []
        for part in parts[1:]:
            if part.strip() in [b'', b'--', b'--\r\n']: continue
            sep = part.find(b'\r\n\r\n')
            if sep < 0: continue
            hdr_raw = part[:sep].decode('utf-8', errors='replace')
            content = part[sep+4:]
            if content.endswith(b'\r\n'): content = content[:-2]
            fname = None
            for line in hdr_raw.split('\r\n'):
                if 'filename=' in line:
                    m = _re.search(r'filename="([^"]+)"', line)
                    if m: fname = m.group(1)
            if not fname: continue
            target = pdir / subdir
            target.mkdir(exist_ok=True)
            (target / fname).write_bytes(content)
            saved.append({'name': fname, 'size': len(content),
                'url': f'/api/files/get?projId={proj_id}&dir={subdir}&file={fname}'})
        self._send_json({'ok': True, 'files': saved})

    def _delete_file(self):
        from urllib.parse import urlparse, parse_qs
        qs      = parse_qs(urlparse(self.path).query)
        proj_id = qs.get('projId', [None])[0]
        subdir  = qs.get('dir',    ['images'])[0]
        fname   = qs.get('file',   [None])[0]
        if not all([proj_id, subdir, fname]): self._send_json({'error': 'Parametres manquants'}); return
        pdir = find_proj_dir(proj_id)
        if not pdir: self._send_json({'error': 'Projet introuvable'}); return
        fpath = pdir / subdir / fname
        if fpath.exists():
            fpath.unlink()
            self._send_json({'ok': True})
        else:
            self._send_json({'error': 'Fichier introuvable'})

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
        elif path == "/api/archives":
            self._list_archives()
        elif path == "/api/tasks/reorder":
            self._reorder_tasks()
        elif path == "/api/history":
            self._send_json(load_history())
        elif path.startswith("/api/files/list"):
            self._list_files()
        elif path.startswith("/api/files/get"):
            self._get_file()

        elif path.startswith("/api/restore"):
            self._restore_snapshot()


        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)

        # Routes upload fichiers (multipart - traitement separe)
        if parsed.path == "/api/delete-archive":
            self._delete_archive()
            return
        if parsed.path == "/api/archive":
            self._archive_project()
            return
        if parsed.path == "/api/unarchive":
            self._unarchive_project()
            return
        if parsed.path == "/api/files/upload":
            self._upload_file()
            return
        if parsed.path == "/api/files/delete":
            self._delete_file()
            return

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
    print(f"  Donnees : {DATA_DIR}")
    print("")
    print("  Ferme cette fenetre pour arreter le serveur")
    print("")
    server = http.server.HTTPServer(("localhost", PORT), Handler)
    webbrowser.open(f"http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Serveur arrete.")
