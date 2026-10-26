const DEFAULT_BACKEND_ORIGIN = 'http://localhost:5000';
const backendEl = document.getElementById('backend');
const lastSyncEl = document.getElementById('last-sync');
const queuedEl = document.getElementById('queued');
const backendInput = document.getElementById('backend-origin');
const tokenInput = document.getElementById('upload-token');
const settingMessage = document.getElementById('setting-message');
const dashboardLink = document.getElementById('dashboard-link');

function setBackend(label, offline, detail) {
  backendEl.textContent = label;
  backendEl.className = offline ? 'status warn' : 'status ok';
  backendEl.title = detail || '';
}

function updateDashboardLink(origin) {
  dashboardLink.href = `${origin}/professor.html`;
}

function normalizeBackendOrigin(value) {
  const url = new URL(value);
  const isLocalHttp =
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !isLocalHttp) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Use an HTTPS server URL, or HTTP on localhost only.');
  }
  return url.origin;
}

async function loadBackendSetting() {
  const settings = await chrome.storage.local.get(['backendOrigin', 'uploadToken']);
  const origin = settings.backendOrigin || DEFAULT_BACKEND_ORIGIN;
  backendInput.value = origin;
  tokenInput.value = settings.uploadToken || '';
  updateDashboardLink(origin);
}

document.getElementById('backend-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  settingMessage.textContent = '';
  try {
    const origin = normalizeBackendOrigin(backendInput.value.trim());
    const uploadToken = tokenInput.value.trim();
    if (origin !== DEFAULT_BACKEND_ORIGIN && !uploadToken) {
      throw new Error('Enter the deployed backend’s PRESENCE_API_TOKEN.');
    }
    const permission =
      origin === DEFAULT_BACKEND_ORIGIN ||
      (await chrome.permissions.request({ origins: [`${origin}/*`] }));
    if (!permission) {
      throw new Error('Permission to connect to that server was not granted.');
    }
    await chrome.storage.local.set({
      backendOrigin: origin,
      uploadToken,
    });
    backendInput.value = origin;
    updateDashboardLink(origin);
    settingMessage.textContent = 'Backend saved.';
  } catch (error) {
    settingMessage.textContent = error.message;
  }
});

function refresh() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (status) => {
    if (chrome.runtime.lastError || !status) {
      setBackend('unavailable', true, chrome.runtime.lastError?.message);
      return;
    }

    if (status.lastError) {
      setBackend('offline', true, status.lastError);
    } else {
      setBackend('connected', false);
    }

    lastSyncEl.textContent = status.lastSentAt
      ? new Date(status.lastSentAt).toLocaleTimeString()
      : 'never';
    queuedEl.textContent = String(status.queued ?? 0);
  });
}

loadBackendSetting().catch((error) => {
  settingMessage.textContent = `Could not load backend setting: ${error.message}`;
});
refresh();
setInterval(refresh, 2000);
