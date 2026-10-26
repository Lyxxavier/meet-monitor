# Meet Monitor

A proof-of-concept attendance/presence monitor for Google Meet.

- A Chrome extension reads Google Meet participant tiles and reports each participant's name and mic state.
- A small Flask backend stores those reports in SQLite.
- A static dashboard lets students see their status and professors see a selected meeting.

The UI uses a dark navy dashboard palette with purple highlights and red/yellow brand accents.
The dashboards show the last successful refresh time, selected meeting details, and presence
filters. Student matching uses the exact display name entered from Google Meet.
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
# Replace the example values in .env before signing in.
python app.py
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your Google OAuth web client values.
Replace `MEET_MONITOR_SECRET` and `PRESENCE_API_TOKEN` with private, randomly generated values.
If `PRESENCE_API_TOKEN` is set, enter the same value in the extension popup. Keep `.env` private;
never commit or share it.

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
| `/api/meetings` | Meeting sessions, recent activity, and current/archive state (JSON) |
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
Students set their **Meet display name** on the student page so their matching row can be shown;
the name must match the one shown in Meet, including spacing. The chosen role is saved to the
account and can be changed on a later Google sign-in. This proof of concept lets any signed-in
Google account choose Professor; it does not verify instructor status. Professor access includes
viewing, exporting, and deleting all recorded meeting data, so do not use it with sensitive
attendance records.

### 4. Demo walkthrough

For a live demo, use the backend and dashboard together with the unpacked extension:

1. Start the backend and sign in to the dashboard with a Google test account.
2. In Chrome, open the extension popup and confirm **Backend: connected**. For a local setup,
   the backend origin should be `http://localhost:5000`; no upload token is required unless
   `PRESENCE_API_TOKEN` is configured in the backend.
3. Join a Google Meet using a meeting code made from lowercase letters, numbers, or hyphens.
   Before monitoring, tell participants what data is collected and share the notice shown in the
   dashboard or extension.
4. Confirm that the extension popup's **Last sync** updates. Open the professor dashboard and
   confirm the current meeting is selected. Each Meet session has its own participant list. When
   a session ends, or stops sending updates for 45 seconds, it is removed from the default
   Participants view while its records remain archived and selectable in the meeting list.
   **Show current session** returns to the active session. Rows may take a few seconds to appear;
   the page refreshes automatically.
5. Show the presence totals, use the overview buttons to filter the participant table, and open
   the student view with a name that exactly matches a Meet participant.
6. If appropriate for the demo, export the meeting CSV and then delete the meeting's server-side
   records. Do not use real attendance data unless you have the required authorization.

**Before presenting:** verify Google sign-in works, the extension is connected to the intended
backend, the intended Meet is open, and the dashboard is showing the same meeting code. The
extension and dashboard provide best-effort signals, not authoritative attendance proof. A
missing participant row can also mean the name does not exactly match or the extension has not
reported the participant yet.

### 5. Deploy to Render

The repository includes [`render.yaml`](./render.yaml) for a Render web service and PostgreSQL
database, both configured on Render's **Free** plans. This keeps the service within the free
compute tier, subject to Render's workspace usage limits and current pricing terms.

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

The server uses the Render PostgreSQL connection string for database storage, HTTPS-only session
cookies, and Gunicorn (not Flask's development server). Do not commit `.env` or copy real
credentials into source control. Render requires you to supply the Google OAuth client values;
the service cannot be deployed with working sign-in until those are configured.

**Free-tier limitations:** the web service spins down after 15 minutes without traffic and may
take about a minute to wake up. Free Render PostgreSQL databases have a 1 GB limit and expire
30 days after creation; after expiry, the database is inaccessible, and Render deletes it after
the 14-day grace period unless upgraded. Free databases have no backups. This is suitable for a
short-lived class project demo, not long-term attendance retention. Export any data you need and
do not rely on the free database as a permanent record. Check Render's [current free-tier
limits](https://render.com/docs/free) before deploying.

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
