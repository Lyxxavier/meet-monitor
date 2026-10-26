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
│   ├── .env.example
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
├── render.yaml
├── .gitignore
└── README.md
```

Local development uses `backend/db.sqlite3`, created automatically and ignored by Git.
Deployments use PostgreSQL through `DATABASE_URL`.

## Setup

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Fill in the Google OAuth values and secrets in .env before signing in.
python app.py
```

The API and dashboard run on <http://localhost:5000>.
Create a Google OAuth web client and add `http://localhost:5000/auth/google/callback` as an
authorized redirect URI and `http://localhost:5000` as an authorized JavaScript origin. The
login page accepts any verified Google account, including consumer Gmail accounts; Google
Workspace accounts are accepted too.

Useful pages:

| URL | Purpose |
|---|---|
| `/` | Landing page |
| `/login.html` | Google sign-in and role selection |
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

Open <http://localhost:5000/login.html>, choose a role, and continue with Google.
Students set their **Meet display name** on the student page so their rows can be filtered.
The chosen role is saved to the account and can be changed on a later Google sign-in.

### 4. Deploy to Render

The repository includes [`render.yaml`](./render.yaml) for a Render web service and PostgreSQL
database.

1. Create a Google Cloud project and configure the OAuth consent screen for external Google
   accounts. During testing, add the intended Google accounts as test users; publish the consent
   screen when ready for general Google-account sign-in.
2. Create an OAuth client with application type **Web application**. Add
   `https://YOUR-SERVICE.onrender.com` as an authorized JavaScript origin and
   `https://YOUR-SERVICE.onrender.com/auth/google/callback` as an authorized redirect URI.
3. In Render, create a new Blueprint from this repository and deploy `render.yaml`.
4. In the Render service environment, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from
   Google Cloud. The blueprint generates `MEET_MONITOR_SECRET` and `PRESENCE_API_TOKEN`.
5. Redeploy after setting the Google credentials. Visit the service URL and sign in.
6. Load the unpacked extension, open its popup, set the service's HTTPS origin and the
   `PRESENCE_API_TOKEN` value from Render, and save. Chrome will ask permission to connect.

The server uses the Render PostgreSQL connection string for durable storage, HTTPS-only session
cookies, and Gunicorn (not Flask's development server). Do not commit `.env` or copy real
credentials into source control. Render requires you to supply the Google OAuth client values;
the service cannot be deployed with working sign-in until those are configured.

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
| `users` | `id`, `email`, `role`, `google_sub` |
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
- Google verifies each user's identity, but role assignment is unrestricted: **any signed-in
  Google account can choose professor** and access all class data, export records, and delete
  meetings. Do not use this open professor policy on a public deployment with real attendance
  records.
- `PRESENCE_API_TOKEN` is a shared upload credential for configured extension installs. It is
  stored in each install's local extension settings and is not per-user identity or authorization.

## Known limitations / next steps

These come from the original spec and are not needed for the POC:

- `content.js` selectors are based on Meet's current DOM. Google changes it periodically, so
  verify `[data-participant-id]` and the muted `aria-label` against the live page.
- Professor access is intentionally self-selectable per the current configuration. For a public
  deployment, restrict professor assignment to an administrator-approved email list before
  collecting real attendance data.
- Link Meet participant IDs to verified accounts before using student-only views; the current
  student filter is name-based and can collide or be impersonated.
- A tile disappearing can mean it was hidden or virtualized by Meet rather than that the
  participant left. Treat `left`/`stale` and mic state as indicators, not definitive evidence.
- The extension defaults to localhost. For a hosted deployment, configure its HTTPS backend
  origin and `PRESENCE_API_TOKEN` in the popup.
