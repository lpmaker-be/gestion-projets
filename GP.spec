# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec pour GP - v2

from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=collect_submodules('email') + collect_submodules('http') + [
        'urllib.parse', 'urllib.request', 'zipfile',
        'json', 'pathlib', 'webbrowser', 'threading',
        'socketserver', 'html', 'html.parser', 'codecs',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter','matplotlib','numpy','pandas','PIL','PyQt5','PyQt6'],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='GP-serveur',
    debug=False,
    strip=False,
    upx=False,
    console=True,
    icon=None,
)
