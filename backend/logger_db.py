"""
logger_db.py — Unified SQLite Database for Aarohan '26
Manages:
  1. Public Team Registrations (teams, schools, participants, rosters, statuses)
  2. The Prompt Jailbreak Game Sessions (attempts, timers, fragments revealed)
  3. Real-time Message Logs (all user prompts, ARIA responses, resistance states)
"""

import sqlite3
import json
import os
import random
from datetime import datetime
from pathlib import Path
from typing import Optional, List

DB_PATH = Path(__file__).parent / "aarohan_main.db"

INITIAL_SEED_TEAMS = [
    {
        "team_id": "AAR-2026-1001",
        "team_name": "CyberKnights",
        "school_name": "Delhi Public School, R.K. Puram",
        "registered_at": "2026-10-25T10:15:00",
        "status": "Confirmed",
        "team_size": 4,
        "participants": [
            {"name": "Aarav Sharma", "grade": "11"},
            {"name": "Diya Patel", "grade": "11"},
            {"name": "Rohan Mehra", "grade": "12"},
            {"name": "Ananya Roy", "grade": "10"}
        ],
        "notes": "Leader: aarav.sharma@gmail.com. Regional prompt hackathon finalist."
    },
    {
        "team_id": "AAR-2026-1002",
        "team_name": "PromptCrafters",
        "school_name": "National Public School, Indiranagar",
        "registered_at": "2026-10-25T14:30:00",
        "status": "Confirmed",
        "team_size": 3,
        "participants": [
            {"name": "Vikramaditya Rao", "grade": "12"},
            {"name": "Sneha Nambiar", "grade": "12"},
            {"name": "Kabir Sengupta", "grade": "11"}
        ],
        "notes": "Experienced in jailbreak and prompt injection defenses."
    },
    {
        "team_id": "AAR-2026-1003",
        "team_name": "Neural Nexus",
        "school_name": "The Mother's International School",
        "registered_at": "2026-10-25T18:20:00",
        "status": "Pending",
        "team_size": 5,
        "participants": [
            {"name": "Ishaan Verma", "grade": "10"},
            {"name": "Tara Mukherjee", "grade": "10"},
            {"name": "Samarth Gupta", "grade": "9"},
            {"name": "Pooja Iyer", "grade": "11"},
            {"name": "Devansh Kulkarni", "grade": "10"}
        ],
        "notes": "School authorization letter pending check at entrance."
    },
    {
        "team_id": "AAR-2026-1004",
        "team_name": "ByteForce Omega",
        "school_name": "St. Xavier's Collegiate School",
        "registered_at": "2026-10-26T08:45:00",
        "status": "Confirmed",
        "team_size": 2,
        "participants": [
            {"name": "Arjun Dasgupta", "grade": "12"},
            {"name": "Tanmay Bannerjee", "grade": "12"}
        ],
        "notes": "Specializing in prompt-chaining algorithms."
    },
    {
        "team_id": "AAR-2026-1005",
        "team_name": "Quantum Coders",
        "school_name": "Bombay Scottish School, Mahim",
        "registered_at": "2026-10-26T11:10:00",
        "status": "Waitlisted",
        "team_size": 4,
        "participants": [
            {"name": "Meera Chawla", "grade": "11"},
            {"name": "Aryan Kapoor", "grade": "11"},
            {"name": "Rehan Siddiqui", "grade": "11"},
            {"name": "Zoya Merchant", "grade": "10"}
        ],
        "notes": "Pending batch slot allocation."
    },
    {
        "team_id": "AAR-2026-1006",
        "team_name": "Valkyrie AI",
        "school_name": "Bishop Cotton Boys School, Bengaluru",
        "registered_at": "2026-10-26T12:00:00",
        "status": "Confirmed",
        "team_size": 3,
        "participants": [
            {"name": "Neil Fernandez", "grade": "12"},
            {"name": "Aditya Menon", "grade": "12"},
            {"name": "Karthik Swaminathan", "grade": "11"}
        ],
        "notes": "Registered via online portal."
    }
]


def _get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create tables if they don't exist and run safe migrations."""
    with _get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS registered_teams (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id             TEXT NOT NULL UNIQUE,
            team_name           TEXT NOT NULL,
            school_name         TEXT NOT NULL,
            team_size           INTEGER NOT NULL,
            participants        TEXT NOT NULL,
            registered_at       TEXT NOT NULL,
            status              TEXT DEFAULT 'Confirmed',
            notes               TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id             TEXT NOT NULL,
            session_id          TEXT NOT NULL UNIQUE,
            start_time          TEXT,
            finish_time         TEXT,
            hint_used           INTEGER DEFAULT 0,
            success             INTEGER DEFAULT 0,
            win_type            TEXT DEFAULT 'none',
            attempts            INTEGER DEFAULT 0,
            categories_detected  TEXT DEFAULT '[]',
            components_revealed  TEXT DEFAULT '[]',
            password_assigned   TEXT,
            elapsed_seconds     REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS messages (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id           TEXT NOT NULL,
            team_id              TEXT NOT NULL,
            timestamp            TEXT,
            user_message         TEXT,
            aria_response        TEXT,
            resistance_level     TEXT,
            categories_this_turn TEXT DEFAULT '[]',
            categories_cumulative TEXT DEFAULT '[]',
            api_fallback_used    INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS timeglitch_sessions (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id          TEXT NOT NULL UNIQUE,
            team_id             TEXT NOT NULL,
            team_name           TEXT NOT NULL,
            start_time          TEXT,
            finish_time         TEXT,
            round1_attempts     INTEGER DEFAULT 0,
            round1_completed    INTEGER DEFAULT 0,
            round1_score        INTEGER DEFAULT 0,
            round2_prompt_count INTEGER DEFAULT 0,
            round2_decoded      INTEGER DEFAULT 0,
            round2_elapsed_seconds REAL DEFAULT 0,
            round2_best_quality INTEGER DEFAULT 0,
            round2_score        INTEGER DEFAULT 0,
            total_score         INTEGER DEFAULT 0,
            status              TEXT DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS timeglitch_prompts (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id          TEXT NOT NULL,
            team_name           TEXT NOT NULL,
            turn                INTEGER NOT NULL,
            prompt              TEXT NOT NULL,
            response            TEXT NOT NULL,
            quality_score       INTEGER DEFAULT 0,
            evaluation_json     TEXT,
            timestamp           TEXT
        );
        """)

        # Seed initial teams if table is empty
        cursor = conn.execute("SELECT COUNT(*) FROM registered_teams")
        count = cursor.fetchone()[0]
        if count == 0:
            for t in INITIAL_SEED_TEAMS:
                conn.execute("""
                    INSERT INTO registered_teams
                    (team_id, team_name, school_name, team_size, participants, registered_at, status, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    t["team_id"],
                    t["team_name"],
                    t["school_name"],
                    t["team_size"],
                    json.dumps(t["participants"]),
                    t["registered_at"],
                    t["status"],
                    t["notes"]
                ))
            print(f"[DB] Seeded {len(INITIAL_SEED_TEAMS)} initial teams into registered_teams")

        # Migrations for timeglitch_sessions columns if missing
        cols = [
            ("round1_remaining_seconds", "REAL DEFAULT 600.0"),
            ("round2_remaining_seconds", "REAL DEFAULT 600.0"),
            ("round1_elapsed_seconds", "REAL DEFAULT 0.0"),
            ("round1_status", "TEXT DEFAULT 'not_started'"),
            ("round2_status", "TEXT DEFAULT 'not_started'"),
            ("round1_placed_json", "TEXT DEFAULT '[]'")
        ]
        for col_name, col_type in cols:
            try:
                conn.execute(f"ALTER TABLE timeglitch_sessions ADD COLUMN {col_name} {col_type}")
            except sqlite3.OperationalError:
                pass  # column already exists

    print(f"[DB] Initialized SQLite at {DB_PATH}")


# ===========================================================================
# REGISTERED TEAMS CRUD
# ===========================================================================

def add_registered_team(team_name: str, school_name: str, team_size: int,
                        participants: list, status: str = "Confirmed", notes: str = "") -> dict:
    now = datetime.now().isoformat()
    random_id_num = random.randint(1000, 9999)
    team_id = f"AAR-2026-{random_id_num}"

    t_name_clean = team_name.strip()
    if not t_name_clean:
        raise ValueError("Team name cannot be empty.")

    with _get_conn() as conn:
        # Check if team name already exists (case-insensitive)
        existing = conn.execute(
            "SELECT team_id, team_name FROM registered_teams WHERE LOWER(team_name) = LOWER(?)",
            (t_name_clean,)
        ).fetchone()
        if existing:
            raise ValueError(f"Team name '{t_name_clean}' is already registered (ID: {existing['team_id']}).")

        # Check uniqueness of ID
        while conn.execute("SELECT 1 FROM registered_teams WHERE team_id = ?", (team_id,)).fetchone():
            random_id_num = random.randint(1000, 9999)
            team_id = f"AAR-2026-{random_id_num}"

        conn.execute("""
            INSERT INTO registered_teams
            (team_id, team_name, school_name, team_size, participants, registered_at, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            team_id,
            t_name_clean,
            school_name.strip(),
            int(team_size),
            json.dumps(participants),
            now,
            status,
            notes.strip() if notes else "Registered via Aarohan Portal"
        ))

    return {
        "team_id": team_id,
        "team_name": team_name.strip(),
        "school_name": school_name.strip(),
        "team_size": int(team_size),
        "participants": participants,
        "registered_at": now,
        "status": status,
        "notes": notes
    }


def get_all_registered_teams() -> list:
    with _get_conn() as conn:
        rows = conn.execute("""
            SELECT id, team_id, team_name, school_name, team_size, participants, registered_at, status, notes
            FROM registered_teams
            ORDER BY registered_at DESC
        """).fetchall()

    result = []
    for r in rows:
        item = dict(r)
        try:
            item["participants"] = json.loads(item["participants"])
        except:
            item["participants"] = []
        result.append(item)
    return result


def get_registered_team(team_id: str):
    with _get_conn() as conn:
        row = conn.execute("""
            SELECT id, team_id, team_name, school_name, team_size, participants, registered_at, status, notes
            FROM registered_teams
            WHERE team_id = ? OR LOWER(team_name) = LOWER(?)
        """, (team_id, team_id)).fetchone()

    if not row:
        return None
    item = dict(row)
    try:
        item["participants"] = json.loads(item["participants"])
    except:
        item["participants"] = []
    return item


def update_registered_team_status(team_id: str, new_status: str) -> bool:
    with _get_conn() as conn:
        cur = conn.execute("""
            UPDATE registered_teams
            SET status = ?
            WHERE team_id = ?
        """, (new_status, team_id))
        return cur.rowcount > 0


def delete_registered_team(team_id: str) -> bool:
    with _get_conn() as conn:
        cur = conn.execute("DELETE FROM registered_teams WHERE team_id = ?", (team_id,))
        return cur.rowcount > 0


def reset_registered_teams_to_sample():
    with _get_conn() as conn:
        conn.execute("DELETE FROM registered_teams")
        for t in INITIAL_SEED_TEAMS:
            conn.execute("""
                INSERT INTO registered_teams
                (team_id, team_name, school_name, team_size, participants, registered_at, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                t["team_id"],
                t["team_name"],
                t["school_name"],
                t["team_size"],
                json.dumps(t["participants"]),
                t["registered_at"],
                t["status"],
                t["notes"]
            ))
    return get_all_registered_teams()


def get_teams_stats() -> dict:
    teams = get_all_registered_teams()
    total_teams = len(teams)
    total_participants = sum(len(t.get("participants", [])) or t.get("team_size", 0) for t in teams)
    unique_schools = len(set(t["school_name"].strip().lower() for t in teams if t.get("school_name")))

    confirmed = sum(1 for t in teams if t.get("status") == "Confirmed")
    pending = sum(1 for t in teams if t.get("status") == "Pending")
    waitlisted = sum(1 for t in teams if t.get("status") == "Waitlisted")

    avg_team_size = round(total_participants / total_teams, 1) if total_teams > 0 else 0

    return {
        "total_teams": total_teams,
        "total_participants": total_participants,
        "unique_schools": unique_schools,
        "confirmed": confirmed,
        "pending": pending,
        "waitlisted": waitlisted,
        "avg_team_size": avg_team_size
    }


# ===========================================================================
# GAME SESSIONS & MESSAGES (PROMPT JAILBREAK)
# ===========================================================================

def log_session_start(team_id: str, session_id: str, password_assigned: str):
    now = datetime.now().isoformat()
    with _get_conn() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO sessions
                (team_id, session_id, start_time, password_assigned)
            VALUES (?, ?, ?, ?)
        """, (team_id, session_id, now, password_assigned))


def log_session_end(session_id: str, success: bool, hint_used: bool,
                    categories_detected: set, elapsed_seconds: float,
                    attempts: int = 0, win_type: str = "none",
                    components_revealed: list = None):
    now = datetime.now().isoformat()
    with _get_conn() as conn:
        conn.execute("""
            UPDATE sessions
            SET finish_time          = ?,
                success              = ?,
                hint_used            = ?,
                win_type             = ?,
                categories_detected  = ?,
                components_revealed  = ?,
                elapsed_seconds      = ?,
                attempts             = ?
            WHERE session_id = ?
        """, (
            now,
            1 if success else 0,
            1 if hint_used else 0,
            win_type,
            json.dumps(list(categories_detected)),
            json.dumps(components_revealed or []),
            elapsed_seconds,
            attempts,
            session_id,
        ))


def log_attempt(session_id: str, team_id: str, user_message: str,
                aria_response: str, resistance_level: str,
                categories_this_turn: list, categories_cumulative: list,
                api_fallback_used: bool = False):
    now = datetime.now().isoformat()
    with _get_conn() as conn:
        conn.execute("""
            UPDATE sessions SET attempts = attempts + 1 WHERE session_id = ?
        """, (session_id,))
        conn.execute("""
            INSERT INTO messages
                (session_id, team_id, timestamp, user_message, aria_response,
                 resistance_level, categories_this_turn, categories_cumulative,
                 api_fallback_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id, team_id, now, user_message, aria_response,
            resistance_level,
            json.dumps(list(categories_this_turn)),
            json.dumps(list(categories_cumulative)),
            1 if api_fallback_used else 0,
        ))


def log_hint_used(session_id: str):
    with _get_conn() as conn:
        conn.execute("""
            UPDATE sessions SET hint_used = 1 WHERE session_id = ?
        """, (session_id,))


def team_exists(team_id: str) -> bool:
    with _get_conn() as conn:
        row = conn.execute("SELECT 1 FROM sessions WHERE team_id = ?", (team_id,)).fetchone()
        return row is not None


def team_has_completed(team_id: str) -> bool:
    with _get_conn() as conn:
        row = conn.execute("""
            SELECT 1 FROM sessions
            WHERE (UPPER(team_id) = UPPER(?) OR team_id = ?)
              AND finish_time IS NOT NULL
        """, (team_id, team_id)).fetchone()
        return row is not None


def get_all_sessions_summary():
    """Returns all sessions as list of dicts for CSV export."""
    with _get_conn() as conn:
        rows = conn.execute("""
            SELECT team_id, session_id, start_time, finish_time,
                   hint_used, success, win_type, attempts,
                   categories_detected, components_revealed,
                   elapsed_seconds, password_assigned
            FROM sessions
            ORDER BY start_time DESC
        """).fetchall()
    return [dict(r) for r in rows]


def get_session_messages(session_id: str):
    with _get_conn() as conn:
        rows = conn.execute("""
            SELECT timestamp, user_message, aria_response, resistance_level,
                   categories_this_turn, categories_cumulative, api_fallback_used
            FROM messages
            WHERE session_id = ?
            ORDER BY id
        """, (session_id,)).fetchall()
    return [dict(r) for r in rows]


def get_all_sessions_with_prompts():
    """
    Returns every session including all user prompts as a list.
    Used by score_teams.py for post-event scoring.
    """
    with _get_conn() as conn:
        sessions = conn.execute("""
            SELECT team_id, session_id, start_time, finish_time,
                   hint_used, success, attempts, categories_detected,
                   elapsed_seconds
            FROM sessions
            ORDER BY start_time
        """).fetchall()

        result = []
        for s in sessions:
            s_dict = dict(s)
            msgs = conn.execute("""
                SELECT user_message, resistance_level, categories_this_turn
                FROM messages
                WHERE session_id = ?
                  AND resistance_level != 'defeated'
                ORDER BY id
            """, (s_dict["session_id"],)).fetchall()

            s_dict["user_prompts"] = [
                m["user_message"] for m in msgs if m["user_message"]
            ]
            s_dict["categories_detected"] = json.loads(
                s_dict.get("categories_detected", "[]")
            )
            result.append(s_dict)

    return result


# ===========================================================================
# TIMEGLITCH GAME SESSIONS PERSISTENCE
# ===========================================================================

def log_tg_session_start(session_id: str, team_id: str, team_name: str):
    with _get_conn() as conn:
        conn.execute("""
            INSERT INTO timeglitch_sessions
            (session_id, team_id, team_name, start_time, status)
            VALUES (?, ?, ?, ?, 'active')
        """, (session_id, team_id, team_name, datetime.now().isoformat()))


def log_tg_round1_complete(session_id: str, attempts: int, score: int):
    with _get_conn() as conn:
        conn.execute("""
            UPDATE timeglitch_sessions
            SET round1_attempts = ?, round1_completed = 1, round1_score = ?, total_score = round2_score + ?
            WHERE session_id = ?
        """, (attempts, score, score, session_id))


def log_tg_prompt(session_id: str, team_name: str, turn: int,
                  prompt: str, response: str, quality_score: int, evaluation_json: str):
    with _get_conn() as conn:
        conn.execute("""
            INSERT INTO timeglitch_prompts
            (session_id, team_name, turn, prompt, response, quality_score, evaluation_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (session_id, team_name, turn, prompt, response, quality_score, evaluation_json, datetime.now().isoformat()))


def log_tg_session_end(session_id: str, round1_score: int, round2_score: int,
                       total_score: int, prompt_count: int, decoded: bool,
                       elapsed_seconds: float, best_quality: int, status: str = "completed"):
    with _get_conn() as conn:
        conn.execute("""
            UPDATE timeglitch_sessions
            SET finish_time = ?,
                round1_score = ?,
                round2_score = ?,
                total_score = ?,
                round2_prompt_count = ?,
                round2_decoded = ?,
                round2_elapsed_seconds = ?,
                round2_best_quality = ?,
                status = ?
            WHERE session_id = ?
        """, (
            datetime.now().isoformat(),
            round1_score,
            round2_score,
            total_score,
            prompt_count,
            1 if decoded else 0,
            elapsed_seconds,
            best_quality,
            status,
            session_id
        ))


def get_tg_session_by_team(team_identifier: str) -> Optional[dict]:
    clean = team_identifier.strip().upper()
    with _get_conn() as conn:
        row = conn.execute("""
            SELECT * FROM timeglitch_sessions
            WHERE UPPER(team_name) = ? OR UPPER(team_id) = ?
            ORDER BY id DESC LIMIT 1
        """, (clean, clean)).fetchone()
    return dict(row) if row else None


def tg_team_has_completed(team_identifier: str) -> bool:
    session = get_tg_session_by_team(team_identifier)
    return bool(session and session.get("status") == "completed")


def get_all_tg_sessions() -> List[dict]:
    with _get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM timeglitch_sessions
            ORDER BY id DESC
        """).fetchall()
    return [dict(r) for r in rows]


def get_tg_session_prompts(session_id: str) -> List[dict]:
    with _get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM timeglitch_prompts
            WHERE session_id = ?
            ORDER BY turn ASC
        """, (session_id,)).fetchall()
    return [dict(r) for r in rows]

