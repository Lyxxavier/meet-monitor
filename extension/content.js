// Meet's DOM changes often; verify the tile selector against the live page.
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 15000;
const DEBOUNCE_MS = 800;

let lastSignature = null;
let lastSentAt = 0;
let previousParticipants = new Map();
let debounceTimer = null;
let activeMeetingCode = null;
let sessionEnded = false;

function meetingIdentity() {
  const meetingCode = location.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  if (!meetingCode || !/^[a-z0-9-]{1,64}$/.test(meetingCode)) return null;

  const storageKey = `meet-monitor-session:${meetingCode}`;
  if (activeMeetingCode !== meetingCode) {
    activeMeetingCode = meetingCode;
    sessionEnded = false;
    previousParticipants = new Map();
    lastSignature = null;
    lastSentAt = 0;
  }
  let sessionKey = sessionStorage.getItem(storageKey);
  if (!sessionKey) sessionKey = createSessionKey(storageKey);
  return { meetingCode, sessionKey };
}

function createSessionKey(storageKey) {
  const sessionKey = crypto.randomUUID();
  sessionStorage.setItem(storageKey, sessionKey);
  return sessionKey;
}

function scanParticipants() {
  const currentParticipants = new Map();
  document.querySelectorAll('[data-participant-id]').forEach((tile) => {
    const participantId = tile.getAttribute('data-participant-id')?.trim();
    if (!participantId) return;
    currentParticipants.set(participantId, {
      participantId,
      name: participantId,
      status: tile.querySelector('[aria-label*="muted" i]') ? 'idle' : 'active',
    });
  });

  let meeting = meetingIdentity();
  if (!meeting) return;
  if (currentParticipants.size > 0 && sessionEnded) {
    meeting = {
      meetingCode: meeting.meetingCode,
      sessionKey: createSessionKey(`meet-monitor-session:${meeting.meetingCode}`),
    };
    sessionEnded = false;
    lastSignature = null;
    lastSentAt = 0;
  }

  const timestamp = Date.now();
  const entries = Array.from(currentParticipants.values()).map((participant) => ({
    ...participant,
    timestamp,
  }));
  for (const [participantId, participant] of previousParticipants) {
    if (!currentParticipants.has(participantId)) {
      entries.push({ ...participant, status: 'left', timestamp });
    }
  }
  if (entries.length === 0) return;

  const signature = JSON.stringify(
    Array.from(currentParticipants.values()).map(
      ({ participantId, status }) => `${participantId}:${status}`
    )
  );
  const changed = signature !== lastSignature;
  const heartbeatDue = timestamp - lastSentAt >= HEARTBEAT_INTERVAL_MS;
  if (!changed && !heartbeatDue) return;

  previousParticipants = currentParticipants;
  lastSignature = signature;
  lastSentAt = timestamp;
  if (currentParticipants.size === 0) sessionEnded = true;
  chrome.runtime.sendMessage({
    type: 'PRESENCE_UPDATE',
    ...meeting,
    entries,
  });
}

function scheduleScan() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(scanParticipants, DEBOUNCE_MS);
}

const observer = new MutationObserver(scheduleScan);
observer.observe(document.body, { childList: true, subtree: true });
setInterval(scanParticipants, POLL_INTERVAL_MS);
scanParticipants();
