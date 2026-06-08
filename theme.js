/* === THEMES DE COULEURS + MODE SOMBRE === */
function applyTheme(name) {
    document.documentElement.setAttribute('data-theme', name || 'blue');
    localStorage.setItem('gp_theme', name || 'blue');
    document.querySelectorAll('.theme-swatch').forEach(function(s) {
        s.classList.toggle('active', s.dataset.theme === name);
    });
}
function openThemePicker() {
    var cur = localStorage.getItem('gp_theme') || 'blue';
    document.querySelectorAll('.theme-swatch').forEach(function(s) {
        s.classList.toggle('active', s.dataset.theme === cur);
    });
    openModal('modal-theme');
}
function toggleDark() {
    var d = document.body.classList.toggle('dark');
    localStorage.setItem('gp_dark', d ? '1' : '0');
}
function initTheme() {
    var t = localStorage.getItem('gp_theme') || 'blue';
    var d = localStorage.getItem('gp_dark') === '1';
    document.documentElement.setAttribute('data-theme', t);
    if (d) document.body.classList.add('dark');
}
initTheme();
