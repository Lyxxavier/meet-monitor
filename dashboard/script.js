const API_BASE = window.location.origin;
const REFRESH_MS = 5000;

const page = document.body.dataset.page || 'index';
const state = {
  studentName: localStorage.getItem('meetMonitorName') || '',
  meetingId: '',
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

function showMessage(text, isError = true) {
  const element = document.getElementById('message');
  if (!element) return;
  element.textContent = text || '';
  element.hidden = !text;
  element.classList.toggle('success-message', Boolean(text) && !isError);
}

function setRefreshState(text, offline = false) {
  const element = document.getElementById('refresh-state');
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('offline', offline);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Backend responded ${response.status}`);
  }
  return response.json();
}

async function loadMeetings() {
  const select = document.getElementById('meeting-select');
  if (!select) return;

  const meetings = await requestJson(`${API_BASE}/api/meetings`);
  const previousId = state.meetingId || select.value;
  select.replaceChildren();
  for (const meeting of meetings) {
    const option = document.createElement('option');
    option.value = String(meeting.id);
    option.textContent = `${meeting.meeting_code} · ${new Date(
      meeting.started_at * 1000
    ).toLocaleString()}${meeting.exported_at ? ' · exported' : ''}`;
    select.append(option);
  }

  const nextId = meetings.some((meeting) => String(meeting.id) === previousId)
    ? previousId
    : meetings.length
      ? String(meetings[0].id)
      : '';
  state.meetingId = nextId;
  select.value = nextId;
  for (const buttonId of ['export-meeting', 'delete-meeting']) {
    const button = document.getElementById(buttonId);
    if (button) button.disabled = !nextId;
  }
}

async function fetchPresence(student) {
  const url = new URL(`${API_BASE}/api/reports`);
  if (student) url.searchParams.set('student', student);
  if (state.meetingId) url.searchParams.set('meeting_id', state.meetingId);
  return requestJson(url);
}

function renderTable(rows, emptyMessage = 'No presence data recorded for this meeting yet.') {
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
  const idle = rows.filter((row) => row.status === 'idle').length;
  total.textContent = String(rows.length);
  document.getElementById('stat-active').textContent = String(active);
  document.getElementById('stat-idle').textContent = String(idle);
  document.getElementById('stat-not-current').textContent = String(
    rows.length - active - idle
  );
}

async function refreshProfessor(successMessage = '') {
  try {
    await loadMeetings();
    const rows = await fetchPresence();
    renderTable(rows);
    updateStats(rows);
    showMessage(successMessage, false);
    setRefreshState('Live');
  } catch (error) {
    setRefreshState('Offline', true);
    showMessage(`Unable to refresh meeting data: ${error.message}`);
    renderTable([]);
    updateStats([]);
  }
}

async function refreshStudent() {
  try {
    await loadMeetings();
  } catch (error) {
    setRefreshState('Offline', true);
    showMessage(`Unable to load meetings: ${error.message}`);
    renderTable([]);
    return;
  }

  if (!state.studentName) {
    renderTable([], 'Set your Meet display name above to see your status.');
    showMessage('');
    setRefreshState('Waiting');
    return;
  }

  try {
    const rows = await fetchPresence(state.studentName);
    renderTable(rows, `No activity recorded for "${state.studentName}" in this meeting.`);
    showMessage('');
    setRefreshState('Live');
  } catch (error) {
    setRefreshState('Offline', true);
    showMessage(`Unable to refresh presence data: ${error.message}`);
    renderTable([]);
  }
}

function initStudent() {
  const input = document.getElementById('display-name');
  const form = document.getElementById('name-form');
  if (input && form) {
    input.value = state.studentName;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      state.studentName = input.value.trim();
      localStorage.setItem('meetMonitorName', state.studentName);
      refreshStudent();
    });
  }

  document.getElementById('meeting-select')?.addEventListener('change', (event) => {
    state.meetingId = event.target.value;
    refreshStudent();
  });
}

async function exportMeeting() {
  if (!state.meetingId) return;
  try {
    const response = await fetch(`${API_BASE}/api/reports/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: state.meetingId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Backend responded ${response.status}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'attendance.csv';
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    await loadMeetings();
    showMessage('Export downloaded. The server copy will be automatically deleted in 15 days.', false);
  } catch (error) {
    showMessage(`Export failed: ${error.message}`);
  }
}

async function deleteMeeting() {
  if (
    !state.meetingId ||
    !window.confirm('Permanently delete all server-side records for this meeting?')
  ) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/meetings/${state.meetingId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Backend responded ${response.status}`);
    }
    state.meetingId = '';
    await refreshProfessor('Meeting records deleted.');
  } catch (error) {
    showMessage(`Delete failed: ${error.message}`);
  }
}

function initProfessor() {
  document.getElementById('meeting-select')?.addEventListener('change', (event) => {
    state.meetingId = event.target.value;
    refreshProfessor();
  });
  document.getElementById('export-meeting')?.addEventListener('click', exportMeeting);
  document.getElementById('delete-meeting')?.addEventListener('click', deleteMeeting);

  const copyButton = document.getElementById('copy-notice');
  const notice = document.getElementById('participant-notice');
  copyButton?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(notice.textContent.trim());
      showMessage('Participant notice copied to the clipboard.', false);
    } catch (error) {
      showMessage(`Could not copy the notice: ${error.message}`);
    }
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
    initProfessor();
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
