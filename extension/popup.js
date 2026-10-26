const backendEl = document.getElementById('backend');
const lastSyncEl = document.getElementById('last-sync');
const queuedEl = document.getElementById('queued');

function setBackend(label, offline, detail) {
  backendEl.textContent = label;
  backendEl.className = offline ? 'status warn' : 'status ok';
  backendEl.title = detail || '';
}

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

refresh();
setInterval(refresh, 2000);
