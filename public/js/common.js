function token() { return localStorage.getItem('token'); }
function currentUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }
async function logout() {
  try {
    if (token()) await api('/api/auth/logout', { method: 'POST' });
  } catch {}
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  location.href = '/';
}
async function api(url, options = {}, requireAuth = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (requireAuth && token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(url, { ...options, headers });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || `Request failed with status ${res.status}`);
  return data;
}
function guard(role) {
  const u = currentUser();
  if (!token() || !u.role) location.href = '/';
  if (role && u.role !== role && !(role === 'admin' && ['admin','manager'].includes(u.role))) location.href = '/';
}
function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); }
function setupSections() {
  document.querySelectorAll('[data-section-link]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id = link.getAttribute('href').replace('#','');
      document.querySelectorAll('[data-section-link]').forEach(a => a.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      link.classList.add('active');
      document.getElementById(id)?.classList.add('active');
      document.getElementById('sidebar')?.classList.remove('open');
    });
  });
}
function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtMonth(month, year) {
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString([], { month: 'long', year: 'numeric' });
}
function fmtMinutes(mins) {
  mins = Number(mins || 0);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function formToObject(form) {
  const out = {};
  new FormData(form).forEach((v, k) => out[k] = v);
  return out;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function avatarHtml(path, name = 'User') {
  if (path) return `<img class="avatar" src="${path}" alt="${escapeHtml(name)} profile picture">`;
  const initial = escapeHtml(String(name || 'U').trim()[0] || 'U');
  return `<div class="avatar avatar-fallback">${initial}</div>`;
}
function downloadReport(reportId) {
  fetch(`/api/reports/${encodeURIComponent(reportId)}/download`, { headers: { Authorization: `Bearer ${token()}` } })
    .then(async res => {
      if (!res.ok) throw new Error('Could not download report.');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    })
    .catch(err => alert(err.message));
}

function hideSplashScreen() {
  const splash = document.getElementById('appSplash');
  if (!splash) return;
  setTimeout(() => splash.classList.add('hide'), 350);
  setTimeout(() => splash.remove(), 900);
}
window.addEventListener('load', hideSplashScreen);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
