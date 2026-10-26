const API_BASE = window.location.origin;
const REFRESH_MS = 5000;

const page = document.body.dataset.page || 'index';
const state = {
  studentName: localStorage.getItem('meetMonitorName') || '',
  meetingId: '',
  meetings: [],
  presenceRows: [],
  presenceFilter: 'all',
  lastSuccessfulRefresh: null,
  refreshOffline: false,
  refreshWaiting: false,
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

function setRefreshState(text, offline = false, detail = '') {
  const element = document.getElementById('refresh-state');
  if (element) {
    element.textContent = text;
    element.classList.toggle('offline', offline);
    element.classList.toggle('waiting', text === 'Waiting' || text === 'Name needed');
  }
  const detailElement = document.getElementById('last-refresh');
  if (detailElement && detail) detailElement.textContent = detail;
  state.refreshOffline = offline;
  state.refreshWaiting = text === 'Waiting' || text === 'Name needed';
}

function markRefreshSuccess() {
  state.lastSuccessfulRefresh = Date.now();
  state.refreshOffline = false;
  state.refreshWaiting = false;
  const detail = document.getElementById('last-refresh');
  if (detail) {
    detail.textContent = `Last successful update at ${new Date(
      state.lastSuccessfulRefresh
    ).toLocaleTimeString()}`;
    detail.title = new Date(state.lastSuccessfulRefresh).toLocaleString();
  }
  updateRefreshAge();
}

function updateRefreshAge() {
  if (!state.lastSuccessfulRefresh || state.refreshOffline || state.refreshWaiting) return;
  const seconds = Math.floor((Date.now() - state.lastSuccessfulRefresh) / 1000);
  setRefreshState(seconds < 2 ? 'Updated just now' : `Updated ${seconds}s ago`);
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
  state.meetings = meetings;
  const previousId = state.meetingId || select.value;
  select.replaceChildren();
  if (!meetings.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No meetings recorded yet';
    option.disabled = true;
    option.selected = true;
    select.append(option);
  }
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
  updateMeetingContext(meetings);
  for (const buttonId of ['export-meeting', 'delete-meeting']) {
    const button = document.getElementById(buttonId);
    if (button) button.disabled = !nextId;
  }
}

function updateMeetingContext(meetings) {
  const title = document.getElementById('meeting-title');
  const details = document.getElementById('meeting-details');
  const exportState = document.getElementById('meeting-export-state');
  if (!title || !details || !exportState) return;

  const meeting = meetings.find((item) => String(item.id) === state.meetingId);
  if (!meeting) {
    title.textContent = 'No meeting selected';
    details.textContent = 'New meeting details will appear here when available.';
    exportState.textContent = '';
    exportState.classList.remove('is-exported');
    return;
  }

  title.textContent = meeting.meeting_code || 'Meeting';
  const startedAt = new Date(meeting.started_at * 1000);
  const parts = [`Started ${startedAt.toLocaleString()}`];
  if (meeting.ended_at) {
    parts.push(`Ended ${new Date(meeting.ended_at * 1000).toLocaleString()}`);
  }
  details.textContent = parts.join(' · ');
  exportState.textContent = meeting.exported_at ? 'Exported' : 'Not exported';
  exportState.classList.toggle('is-exported', Boolean(meeting.exported_at));
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
  const other = rows.length - active - idle;
  total.textContent = String(rows.length);
  document.getElementById('stat-active').textContent = String(active);
  document.getElementById('stat-idle').textContent = String(idle);
  document.getElementById('stat-not-current').textContent = String(other);
  document.getElementById('legend-total').textContent = String(rows.length);

  const distribution = document.getElementById('presence-distribution');
  if (distribution) {
    const percent = (count) => (rows.length ? (count / rows.length) * 100 : 0);
    document.getElementById('distribution-active').style.width = `${percent(active)}%`;
    document.getElementById('distribution-idle').style.width = `${percent(idle)}%`;
    document.getElementById('distribution-other').style.width = `${percent(other)}%`;
    document.getElementById('legend-active').textContent = String(active);
    document.getElementById('legend-idle').textContent = String(idle);
    document.getElementById('legend-other').textContent = String(other);
    distribution.setAttribute(
      'aria-label',
      `Of ${rows.length} participants: ${active} mic on, ${idle} muted, ${other} stale or left`
    );
  }
}

function renderProfessorTable() {
  const filteredRows = state.presenceRows.filter((row) => {
    if (state.presenceFilter === 'all') return true;
    if (state.presenceFilter === 'other') {
      return row.status !== 'active' && row.status !== 'idle';
    }
    return row.status === state.presenceFilter;
  });
  const filterLabel = {
    all: 'all participants',
    active: 'participants with mic on',
    idle: 'muted participants',
    other: 'stale or left participants',
  }[state.presenceFilter];
  const caption = document.getElementById('table-caption');
  if (caption) {
    caption.textContent = `Showing ${filteredRows.length} of ${state.presenceRows.length} ${filterLabel}`;
  }
  renderTable(
    filteredRows,
    state.presenceRows.length
      ? `No ${filterLabel} in this meeting. Choose another presence filter to see more participants.`
      : 'No presence data recorded for this meeting yet.'
  );
}

function setPresenceFilter(filter) {
  state.presenceFilter = filter;
  document.querySelectorAll('.distribution-filter').forEach((button) => {
    const selected = button.dataset.status === filter;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  renderProfessorTable();
}

async function refreshProfessor(successMessage = '') {
  try {
    await loadMeetings();
    const rows = await fetchPresence();
    state.presenceRows = rows;
    updateStats(rows);
    renderProfessorTable();
    showMessage(successMessage, false);
    markRefreshSuccess();
  } catch (error) {
    const lastUpdate = state.lastSuccessfulRefresh
      ? `Last successful update at ${new Date(state.lastSuccessfulRefresh).toLocaleTimeString()}`
      : 'No successful update yet';
    setRefreshState('Connection issue', true, lastUpdate);
    showMessage(`Unable to refresh meeting data: ${error.message}`);
  }
}

async function refreshStudent() {
  try {
    await loadMeetings();
  } catch (error) {
    setRefreshState('Connection issue', true, 'No successful update yet');
    showMessage(`Unable to load meetings: ${error.message}`);
    renderTable([]);
    return;
  }

  if (!state.meetings.length) {
    renderTable(
      [],
      'No meetings have been recorded yet. Your status will appear here after a meeting is reported.'
    );
    showMessage('');
    markRefreshSuccess();
    return;
  }

  if (!state.studentName) {
    renderTable([], 'Set your Meet display name above to see your status.');
    showMessage('');
    setRefreshState('Name needed', false, 'Set your Meet display name to check presence.');
    return;
  }

  try {
    const rows = await fetchPresence(state.studentName);
    renderTable(
      rows,
      `No row matched "${state.studentName}". Check the exact spelling and spacing shown in Meet, confirm the selected meeting, and allow time for the extension to report an update.`
    );
    showMessage('');
    markRefreshSuccess();
  } catch (error) {
    const lastUpdate = state.lastSuccessfulRefresh
      ? `Last successful update at ${new Date(state.lastSuccessfulRefresh).toLocaleTimeString()}`
      : 'No successful update yet';
    setRefreshState('Connection issue', true, lastUpdate);
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
      setRefreshState('Connecting');
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
  document.querySelectorAll('.distribution-filter').forEach((button) => {
    button.addEventListener('click', () => setPresenceFilter(button.dataset.status));
  });

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

  const error = new URLSearchParams(window.location.search).get('error');
  if (error) {
    document.getElementById('login-error').textContent = error;
    document.getElementById('login-error').hidden = false;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const role = document.getElementById('role').value;
    window.location.assign(`/login/google?role=${encodeURIComponent(role)}`);
  });
}

function init() {
  initLogin();

  if (page === 'professor') {
    initProfessor();
    loadAccountIdentity();
    refreshProfessor();
    setInterval(refreshProfessor, REFRESH_MS);
    setInterval(updateRefreshAge, 1000);
  }

  if (page === 'student') {
    initStudent();
    loadAccountIdentity();
    refreshStudent();
    setInterval(refreshStudent, REFRESH_MS);
    setInterval(updateRefreshAge, 1000);
  }
}

async function loadAccountIdentity() {
  try {
    const account = await requestJson(`${API_BASE}/api/me`);
    if (!account.email || !['student', 'professor'].includes(account.role)) {
      throw new Error('No signed-in account was returned.');
    }
    const email = document.getElementById('account-email');
    const role = document.querySelector('.account-role');
    if (email) email.textContent = account.email;
    if (role) role.textContent = `${account.role[0].toUpperCase()}${account.role.slice(1)} view`;
  } catch (error) {
    const email = document.getElementById('account-email');
    if (email) {
      email.textContent = 'Account unavailable';
      email.title = error.message;
    }
    showMessage(`Unable to load account details: ${error.message}`);
  }
}

init();
