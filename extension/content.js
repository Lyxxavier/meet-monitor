// Watches participant tiles for join/leave + mic/cam changes.
// Meet's DOM changes often, so both the tile selector and the muted aria-label
// should be re-verified whenever reports stop coming in.

const POLL_INTERVAL_MS = 5000;
const DEBOUNCE_MS = 800;

let lastSignature = null;
let debounceTimer = null;

function scanParticipants() {
  const tiles = document.querySelectorAll('[data-participant-id]');
  const snapshot = [];

  tiles.forEach((tile) => {
    snapshot.push({
      name: tile.getAttribute('data-participant-id'),
      micOn: !tile.querySelector('[aria-label*="muted"]'),
      timestamp: Date.now(),
    });
  });

  if (snapshot.length === 0) {
    // Not in a call yet (or Meet changed its DOM) - don't report an empty room.
    lastSignature = null;
    return;
  }

  const signature = JSON.stringify(snapshot.map((entry) => `${entry.name}:${entry.micOn}`));
  if (signature === lastSignature) return; // nothing changed, don't spam the backend
  lastSignature = signature;

  chrome.runtime.sendMessage({ type: 'PRESENCE_UPDATE', data: snapshot });
}

function scheduleScan() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(scanParticipants, DEBOUNCE_MS);
}

const observer = new MutationObserver(scheduleScan);
observer.observe(document.body, { childList: true, subtree: true });

// Fallback poll in case MutationObserver misses fast changes.
setInterval(scanParticipants, POLL_INTERVAL_MS);
