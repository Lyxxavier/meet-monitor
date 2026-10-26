const API_BASE = 'http://localhost:5000';
const REFRESH_MS = 5000;

const page = document.body.dataset.page || 'index';
const state = {
  studentName: localStorage.getItem('meetMonitorName') || '',
};

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]
  );
}

function showMessage(text) {
  const element = document.getElementById('message');
  if (!element) return;
  element.textContent = text || '';
  element.hidden = !text;
}

function setRefreshState(text, offline = false) {
  const element = document.getElementById('refresh-state');
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('offline', offline);
}

async function fetchPresence(student) {
  const url = new URL(`${API_BASE}/api/reports`);
  if (student) url.searchParams.set('student', student);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Backend responded ${response.status}`);
  }
  return response.json();
}

function renderTable(rows, emptyMessage = 'No presence data yet. Open a Google Meet with the extension enabled.') {
  const tbody = document.querySelector('#presence-table tbody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty">${escapeHtml(emptyMessage)}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (row) => `
    <tr class="${row.status === 'idle' ? 'inactive-flag' : ''}">
      <td>${escapeHtml(row.student_name)}</td>
      <td><span class="badge-${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
      <td>${new Date(row.timestamp * 1000).toLocaleTimeString()}</td>
    </tr>`
    )
    .join('');
}

function updateStats(rows) {
  const total = document.getElementById('stat-total');
  if (!total) return;

  const active = rows.filter((row) => row.status === 'active').length;
  total.textContent = String(rows.length);
  document.getElementById('stat-active').textContent = String(active);
  document.getElementById('stat-idle').textContent = String(rows.length - active);
}

async function refreshProfessor() {
  try {
    const rows = await fetchPresence();
    renderTable(rows);
    updateStats(rows);
    showMessage('');
    setRefreshState('Live');
  } catch (error) {
    setRefreshState('Offline', true);
    showMessage(`Cannot reach the backend at ${API_BASE}. Start it with "python backend/app.py".`);
    renderTable([]);
    updateStats([]);
  }
}

async function refreshStudent() {
  if (!state.studentName) {
    renderTable([], 'Set your Meet display name above to see your own status.');
    showMessage('');
    setRefreshState('Waiting');
    return;
  }

  try {
    const rows = await fetchPresence(state.studentName);
    renderTable(rows, `No activity recorded yet for "${state.studentName}".`);
    showMessage('');
    setRefreshState('Live');
  } catch (error) {
    setRefreshState('Offline', true);
    showMessage(`Cannot reach the backend at ${API_BASE}. Start it with "python backend/app.py".`);
    renderTable([]);
  }
}

function initStudent() {
  const input = document.getElementById('display-name');
  const form = document.getElementById('name-form');
  if (!input || !form) return;

  input.value = state.studentName;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.studentName = input.value.trim();
    localStorage.setItem('meetMonitorName', state.studentName);
    refreshStudent();
  });
}

function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', () => {
    const email = document.getElementById('email');
    if (email && email.value.trim()) {
      localStorage.setItem('meetMonitorEmail', email.value.trim());
    }
  });
}

function init() {
  initLogin();

  if (page === 'professor') {
    refreshProfessor();
    setInterval(refreshProfessor, REFRESH_MS);
  }

  if (page === 'student') {
    initStudent();
    refreshStudent();
    setInterval(refreshStudent, REFRESH_MS);
  }
}

init();
