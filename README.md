# AAROHAN '26 — Unified Event & Operations Hub
**TIMEGLITCH: The Lost Space Transmission · Space Prompt Engineering Challenge & Central Team Registry**

---

## 🎯 Architecture Overview

This project follows the modular `backend/` and `frontend/` framework:

```
Aarohan'26/
├── backend/
│   ├── app.py              # Unified Flask application serving API & static frontend
│   ├── timeglitch_engine.py# TIMEGLITCH game engine (timeline, cipher, 5-criteria prompt evaluation, scoring)
│   ├── logger_db.py        # SQLite database (registered_teams, timeglitch_sessions, timeglitch_prompts)
│   ├── session_manager.py  # Active in-game state & timer tracking
│   ├── ai_client.py        # Groq LLM client (with automatic deterministic fallback)
│   ├── config.py           # Legacy configuration
│   ├── requirements.txt    # Python dependencies (flask, flask-cors, groq, python-dotenv)
│   ├── .env                # Server configuration (ADMIN_PASSWORD, GROQ_API_KEY, PORT)
│   └── .env.example
├── frontend/
│   ├── index.html          # Public Team Registration Portal
│   ├── game.html           # Station 1: TIMEGLITCH — The Lost Space Transmission
│   ├── admin-login.html    # Protected Administrator Login Portal
│   ├── admin.html          # Central Admin Dashboard (Teams + Game Arena Logs)
│   ├── css/
│   │   ├── style.css       # Registration & base theme styling (Protected)
│   │   ├── timeglitch.css  # TIMEGLITCH isolated styling (Strictly namespaced to .timeglitch-game)
│   │   ├── game.css        # Station 1 legacy styles (Protected)
│   │   └── admin.css       # Admin dashboard, tables, KPI metrics, modals (Protected)
│   └── js/
│       ├── registration.js # Public team registration logic & validation
│       ├── timeglitch.js   # TIMEGLITCH game loop, drag-and-drop timeline & CHRONOS AI interaction
│       ├── teams-store.js  # Client data store with REST API sync & localStorage backup
│       ├── auth.js         # Admin authentication service & route guards
│       └── admin.js        # Admin dashboard controller (teams + game logs + transcripts)
├── start_station.bat       # One-click startup script for organizers & event laptops
└── README.md               # Documentation
```

---

## 🚀 Quick Start (Running the Event)

### Option 1: One-Click Startup (Windows)
Double-click:
```
start_station.bat
```
This launches the server at `http://localhost:5000/`.

### Option 2: Command Line
```bash
cd backend
pip install -r requirements.txt
python app.py
```

The unified server will be live at:
- **Public Team Registration:** [http://localhost:5000/](http://localhost:5000/)
- **Station 1 Challenge (TIMEGLITCH):** [http://localhost:5000/game](http://localhost:5000/game)
- **Admin Authentication Portal:** [http://localhost:5000/admin-login](http://localhost:5000/admin-login)
- **Admin Command Center:** [http://localhost:5000/admin](http://localhost:5000/admin)

---

## 🔑 Administrator Credentials

| Field | Value |
| :--- | :--- |
| **Username** | `admin` *(or `admin@aarohan.org`)* |
| **Password** | `aarohan2026` *(Configurable in `backend/.env`)* |
| **Quick Access** | Click **⚡ Quick Fill** on the login page for 1-click credential population |

---

## 🌟 Game & Station 1 Overview: TIMEGLITCH

### 1. 📝 Public Team Registration (`/` or `/register`)
- Collects Team Name, School Name, Team Size (1–6 members), and Participant Names & Grades.
- Automatically persists to the SQLite database (`aarohan_main.db`) via `POST /api/teams/register`.
- Assigns a unique official Registration ID (e.g. `AAR-2026-1001`).
- Provides direct 1-click launch link to **Station 1: TIMEGLITCH**.

### 2. 🎮 Station 1: TIMEGLITCH — The Lost Space Transmission (`/game`)
Space-themed two-round prompt engineering challenge:
- **Round 1: Repair the Space Timeline (50 marks)**
  - 5 Historical milestones scrambled across the timeline.
  - Drag-and-drop or click-to-select chronological ordering.
  - Submissions evaluated with visual red-border feedback on incorrect slots.
  - Scoring: 1 attempt = 50, 2 = 40, 3 = 30, 4 = 20, 5+ = 10 marks.
  - Cleared timeline unlocks the encrypted transmission and Caesar cipher intel.
- **Round 2: Engineer the Perfect Prompt (50 marks)**
  - Decrypt the Mars archive ciphertext: `WKH URYHU LV UHDGB` -> `THE ROVER IS READY`
  - Caesar cipher with a shift of 3 letters backward.
  - Interactive chatbot with **CHRONOS AI** featuring progressive clues.
  - Evaluated on 5 criteria (2 marks each = 10 marks prompt quality):
    1. Clear task (2 marks)
    2. Useful context (2 marks)
    3. Specific constraints (2 marks)
    4. Output instructions (2 marks)
    5. Testing and refinement (2 marks)
  - Scoring components:
    * A. Prompt Quality Marks: (Quality / 10) × 20 (Max 20 marks)
    * B. Prompt Submissions Count: 1->10, 2->8, 3->6, 4->4, 5+->2 (Max 10 marks)
    * C. Successful Decoding: 10 marks (Max 10 marks)
    * D. Time Taken (6-minute cap): <=60s->10, <=120s->8, <=180s->6, <=240s->4, <=360s->2 (Max 10 marks)
- **Total Combined Score:** Round 1 (50) + Round 2 (50) = 100 marks.

### 3. 🛡️ Admin Command Dashboard (`/admin`)
- **Route Guard**: Direct access without authentication is blocked and redirected to `/admin-login`.
- **Tab 1: 📋 Registered Teams**:
  - Live KPI stats: Total Teams, Total Participants, Unique Schools, Status Breakdown.
  - Real-time search across team names, schools, students, and IDs.
  - Status management: cycle between `Confirmed`, `Pending`, and `Waitlisted`.
  - Team details modal with participant breakdown and **🖨️ Print Team Slip** feature.
  - Export registered teams as CSV (`GET /api/admin/teams/export`).
- **Tab 2: 🎮 Game Arena Logs**:
  - Real-time session monitoring of all teams playing Station 1.
  - Time elapsed, prompt count, fragments discovered, hint penalty, and calculated scores.
  - **Full Chat Transcript Viewer**: View every prompt sent and ARIA's reply.
  - Export game scores as CSV (`GET /api/admin/export?key=aarohan2026`).

---

## 🛠️ API Reference

### Teams API
- `POST /api/teams/register`: Register a new team into SQLite.
- `GET /api/teams`: Public team listing.
- `GET /api/teams/search?q=...`: Search team by name/ID.

### Admin API (Requires Header `X-Admin-Key: aarohan2026` or Auth session)
- `POST /api/admin/login`: Verify credentials.
- `GET /api/admin/teams`: Retrieve all teams with summary statistics.
- `PATCH /api/admin/teams/<team_id>/status`: Update team status.
- `DELETE /api/admin/teams/<team_id>`: Delete team registration.
- `GET /api/admin/teams/export`: Download CSV of all registered teams.
- `GET /api/admin/log`: Retrieve all game sessions.
- `GET /api/admin/session/<session_id>`: Retrieve prompt transcript.
- `GET /api/admin/export`: Download CSV of game scores.

### Game API
- `POST /api/session/start`: Begin 10-minute challenge session.
- `POST /api/chat`: Send prompt to ARIA.
- `POST /api/confirm`: Submit assembled password.
- `POST /api/hint`: Request official intel hint.
- `GET /api/health`: System and LLM health status.
