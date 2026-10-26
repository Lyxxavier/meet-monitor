# Meet Monitor

A proof-of-concept attendance/presence monitor for Google Meet.

- A Chrome extension reads Google Meet participant tiles and reports each participant's name and mic state.
- A small Flask backend stores those reports in SQLite.
- A static dashboard lets students see their own status and professors see the whole class.

The UI uses a white base with red (`#D32F2F`) and yellow (`#FFC107`) accents.

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
| `/api/reports` | Latest status per participant (JSON) |
| `/api/reports/history` | Recent raw presence rows (JSON) |

### 2. Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Join a Google Meet. The extension icon's popup shows backend connectivity and last sync time.

The background worker POSTs to `http://localhost:5000/api/presence`, so the backend must be
running while a meeting is active.

### 3. Dashboard

Open <http://localhost:5000/login.html>, enter an email, pick a role, and continue.
Students set their **Meet display name** on the student page so their rows can be filtered.

## How presence is detected

`extension/content.js` scans participant tiles (`[data-participant-id]`) and marks a participant
as `active` when no `aria-label` containing "muted" is found inside the tile, otherwise `idle`.
It runs on DOM mutations (debounced) plus a 5-second fallback poll, and only sends a snapshot
when something actually changed.

`extension/background.js` queues snapshots and flushes them to the API every 5 seconds, retrying
failed batches (up to 300 entries) on the next flush.

The backend stores each snapshot as a row in `presence_logs`. `/api/reports` returns the newest
row per participant, which is what the professor table renders every 5 seconds.

## Data model

| Table | Columns |
|---|---|
| `users` | `id`, `email`, `role` |
| `meetings` | `id`, `meeting_code`, `started_at`, `ended_at` |
| `presence_logs` | `id`, `meeting_id`, `student_name`, `status`, `timestamp` |

`status` is currently `active` (mic on) or `idle` (mic muted/off).

## Known limitations / next steps

These come from the original spec and are not needed for the POC:

- Replace the plain email login in `routes/login.py` with real OAuth (Google or Microsoft MSAL).
- `content.js` selectors are based on Meet's current DOM. Google changes it periodically, so
  verify `[data-participant-id]` and the muted `aria-label` against the live page.
- Add role-based route protection in `app.py` before a real class uses this. Nothing currently
  stops a student from opening `/professor.html` directly.
- Map Meet display names to `users.email`; presence rows are keyed by display name only.
- `meetings` is created but not yet populated by the extension.
