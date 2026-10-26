// Service worker batches meeting-scoped presence updates and POSTs them to Flask.
const DEFAULT_BACKEND_ORIGIN = 'http://localhost:5000';
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE = 300;

let queue = [];
let lastSentAt = null;
let lastError = null;

function getBackendUrl(origin) {
  origin = origin || DEFAULT_BACKEND_ORIGIN;
  return `${origin}/api/presence`;
}

async function flush() {
  if (queue.length === 0) return;

  const batch = queue;
  queue = [];
  const grouped = new Map();
  for (const item of batch) {
    const key = `${item.backendOrigin}:${item.meetingCode}:${item.sessionKey}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  for (const items of grouped.values()) {
    const { backendOrigin, meetingCode, sessionKey } = items[0];
    try {
      const response = await fetch(getBackendUrl(backendOrigin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingCode,
          sessionKey,
          entries: items.map(({ entry }) => entry),
        }),
      });

      if (!response.ok) {
        throw new Error(`backend responded with ${response.status}`);
      }

      lastSentAt = Date.now();
      lastError = null;
    } catch (error) {
      queue = items.concat(queue).slice(-MAX_QUEUE);
      lastError = error.message || String(error);
      console.error('Failed to send presence:', error);
    }
  }
}

setInterval(flush, FLUSH_INTERVAL_MS);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'PRESENCE_UPDATE') {
    if (
      typeof message.meetingCode !== 'string' ||
      typeof message.sessionKey !== 'string' ||
      !Array.isArray(message.entries)
    ) {
      sendResponse({ ok: false, error: 'invalid presence update' });
      return false;
    }
    chrome.storage.local
      .get('backendOrigin')
      .then((settings) => {
        const backendOrigin = settings.backendOrigin || DEFAULT_BACKEND_ORIGIN;
        const entries = message.entries.map((entry) => ({
          backendOrigin,
          meetingCode: message.meetingCode,
          sessionKey: message.sessionKey,
          entry,
        }));
        queue = queue.concat(entries).slice(-MAX_QUEUE);
        const queued = queue.length;
        flush();
        sendResponse({ ok: true, queued });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || String(error) });
      });
    return true;
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ lastSentAt, lastError, queued: queue.length });
  }
  return true;
});
