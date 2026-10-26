// Service worker: batches presence snapshots from content.js and POSTs them
// to the Flask backend.

const BACKEND_URL = 'http://localhost:5000/api/presence';
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE = 300;

let queue = [];
let lastSentAt = null;
let lastError = null;

async function flush() {
  if (queue.length === 0) return;

  const batch = queue;
  queue = [];

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      throw new Error(`backend responded with ${response.status}`);
    }

    lastSentAt = Date.now();
    lastError = null;
  } catch (error) {
    // Keep the batch for a retry, but never let the queue grow without bound.
    queue = batch.concat(queue).slice(-MAX_QUEUE);
    lastError = error.message || String(error);
    console.error('Failed to send presence:', error);
  }
}

setInterval(flush, FLUSH_INTERVAL_MS);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PRESENCE_UPDATE') {
    queue = queue.concat(message.data || []).slice(-MAX_QUEUE);
    flush();
    sendResponse({ ok: true, queued: queue.length });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ lastSentAt, lastError, queued: queue.length });
  }
  return true;
});
