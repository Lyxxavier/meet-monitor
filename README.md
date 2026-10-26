# Meet Monitor

A proof-of-concept attendance/presence monitor for Google Meet.

- A Chrome extension reads Google Meet participant tiles and reports each participant's name and mic state.
- A small Flask backend stores those reports in SQLite.
- A static dashboard lets students see their status and professors see a selected meeting.

The UI uses a white base with red (`#D32F2F`) and yellow (`#FFC107`) accents.
Meet Monitor records attendance-related metadata only; it does not record or transmit audio or video.

## Project structure

```
meet-monitor/
├── extension/
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   └── icons/
├── backend/
│   ├── app.py
│   ├── config.py
│   ├── models.py
│   ├── routes/
│   │   ├── presence.py
│   │   ├── reports.py
│   │   └── login.py
│   └── requirements.txt
├── dashboard/
│   ├── index.html
│   ├── login.html
│   ├── student.html
│   ├── professor.html
│   ├── style.css
│   └── script.js
├── .gitignore
└── README.md
```

`backend/db.sqlite3` is created automatically the first time the backend starts. It is
git-ignored on purpose so the repo never carries local data.

## Setup

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

The API and dashboard run on <http://localhost:5000>.

Useful pages:

| URL | Purpose |
|---|---|
| `/` | Landing page |
| `/login.html` | Demo email + role login |
| `/student.html` | Student's own status |
| `/professor.html` | Class-wide monitoring |
| `/api/meetings` | Meeting sessions (JSON) |
| `/api/reports` | Latest status per participant (JSON) |
| `/api/reports/history` | Recent raw presence rows (JSON) |
| `POST /api/reports/export` | Export a meeting's presence events as CSV |

### 2. Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Join a Google Meet. The extension icon's popup shows backend connectivity and last sync time.

The background worker POSTs to `http://localhost:5000/api/presence`, so the backend must be
running while a meeting is active. To use a hosted backend, set its HTTPS origin in the extension
popup; Chrome will ask for permission to connect to that host. The extension reads the meeting
code from the Meet URL and uses a per-tab session key to keep separate meeting sessions apart.

### 3. Dashboard

Open <http://localhost:5000/login.html>, enter an email, pick a role, and continue.
Students set their **Meet display name** on the student page so their rows can be filtered.

## How presence is detected

`extension/content.js` scans participant tiles (`[data-participant-id]`) and marks a participant
as `active` when no `aria-label` containing "muted" is found inside the tile, otherwise `idle`.
It runs on DOM mutations (debounced) plus a 5-second fallback poll, sends changed snapshots and
15-second heartbeats, and reports a `left` event when a previously visible tile disappears.
Because Meet may change its DOM or hide tiles, `left` and mic state are best-effort signals, not
authoritative attendance or proof that someone has left the call.

`extension/background.js` queues snapshots and flushes them to the API every 5 seconds, retrying
failed batches (up to 300 entries) on the next flush. A participant's latest event becomes
`stale` when no update has arrived for 45 seconds. Current participants heartbeat so an
unchanged mic state remains fresh.

The backend stores each event in `presence_logs`, scoped to a meeting session and Meet's
participant ID. `/api/reports` returns the newest event per participant in the selected meeting.
Missing tiles are reported as `left`; updates that stop unexpectedly are displayed as `stale`.

## Data model

| Table | Columns |
|---|---|
| `users` | `id`, `email`, `role` |
| `meetings` | `id`, `meeting_code`, `session_key`, `started_at`, `ended_at`, `exported_at` |
| `presence_logs` | `id`, `meeting_id`, `participant_id`, `student_name`, `status`, `timestamp` |

`status` is `active` (mic appears on), `idle` (mic appears muted/off), or `left`; `stale` is
computed by the API when an active/idle participant has not sent an update recently.

## Privacy, notice, and retention

- Collection includes the participant identifier/name exposed in Meet's page, inferred
  microphone state, meeting code, and timestamps. It does **not** capture or transmit audio or
  video.
- The extension popup and student/professor dashboards show a notice. The professor dashboard
  has a **Copy notice** action. The extension cannot display a notice to every participant in
  the call, so the professor must share the notice with participants before monitoring begins.
  The notice is not an affirmative-consent mechanism; follow the institution's rules for notice
  and consent.
- Records for an unexported meeting are retained until a professor exports them or deletes them.
  Export downloads a CSV and starts a 15-day retention period for the server copy. Exporting
  again restarts that period. The backend deletes expired exports at startup and hourly while
  running. Downloaded CSVs are outside the app's retention controls.
- A professor can delete a meeting's server-side records at any time from the dashboard.
- This proof of concept's email/role login is not real authentication: anyone can choose the
  professor role. Do not expose it to a real class or the public internet until real sign-in,
  server-side authorization, HTTPS, and appropriate institutional privacy review are in place.

## Known limitations / next steps

These come from the original spec and are not needed for the POC:

- Replace the plain email login in `routes/login.py` with real OAuth (Google or Microsoft MSAL).
- `content.js` selectors are based on Meet's current DOM. Google changes it periodically, so
  verify `[data-participant-id]` and the muted `aria-label` against the live page.
- Add real authentication and role-based route protection before a real class uses this. Export
  and deletion routes check the demo session role, but that role is user-selectable and therefore
  is not a security boundary.
- Link Meet participant IDs to verified accounts before using student-only views; the current
  student filter is name-based and can collide or be impersonated.
- A tile disappearing can mean it was hidden or virtualized by Meet rather than that the
  participant left. Treat `left`/`stale` and mic state as indicators, not definitive evidence.
- The extension defaults to localhost. For a hosted deployment, configure its backend origin in
  the popup and serve the dashboard/API from the same HTTPS origin.
