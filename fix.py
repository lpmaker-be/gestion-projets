from pathlib import Path

# 1. Ajouter theme.js dans index.html
html = Path(r"D:\Onedrive\Documents\Claude\gestion_projets\index.html")
t = html.read_text(encoding='utf-8')
if 'theme.js' not in t:
    t = t.replace(
        '<script src="morphdom.min.js"></script>',
        '<script src="theme.js"></script>\n    <script src="morphdom.min.js"></script>'
    )
    html.write_text(t, encoding='utf-8')
    print("theme.js ajoute dans index.html OK")
else:
    print("theme.js deja present")

# 2. Corriger dark mode dans styles.css
css = Path(r"D:\Onedrive\Documents\Claude\gestion_projets\styles.css")
c = css.read_text(encoding='utf-8-sig')
old = """    --sidebar-active: #0073ea;
    --border:         #2c2e33;
    --text:           #c1c2c5;
    --text2:          #868e96;
    --text3:          #4a4b50;
    --accent:         #4dabf7;
    --accent-h:       #339af0;
    --green:          #51cf66;"""
new = """    --border:         #2c2e33;
    --text:           #c1c2c5;
    --text2:          #868e96;
    --text3:          #4a4b50;
    --green:          #51cf66;"""
if old in c:
    c = c.replace(old, new)
    # Ajouter les accents par theme apres la fermeture de body.dark
    insert = """\n\n/* Accent par theme en dark mode */\nbody.dark,\nbody.dark[data-theme="blue"]   { --accent:#4dabf7;--accent-h:#339af0;--sidebar-active:#4dabf7; }\nbody.dark[data-theme="purple"] { --accent:#a78bfa;--accent-h:#8b5cf6;--sidebar-active:#a78bfa; }\nbody.dark[data-theme="green"]  { --accent:#34d399;--accent-h:#10b981;--sidebar-active:#34d399; }\nbody.dark[data-theme="red"]    { --accent:#fc8181;--accent-h:#f87171;--sidebar-active:#fc8181; }\nbody.dark[data-theme="orange"] { --accent:#fbbf24;--accent-h:#f59e0b;--sidebar-active:#fbbf24; }\nbody.dark[data-theme="cyan"]   { --accent:#67e8f9;--accent-h:#22d3ee;--sidebar-active:#67e8f9; }\nbody.dark[data-theme="gray"]   { --accent:#9ca3af;--accent-h:#6b7280;--sidebar-active:#9ca3af; }"""
    c = c.replace(
        "\nbody.dark .btbl tbody tr",
        insert + "\nbody.dark .btbl tbody tr"
    )
    css.write_text(c, encoding='utf-8')
    print("dark mode themes CSS OK")
else:
    print("FAIL CSS")

print("DONE - fais: git add -A && git commit -m fix && git push")
