"""
app.py -- Unified Flask Backend for Aarohan '26
Integrates:
  1. Public Team Registration & Registry API
  2. The Prompt Jailbreak Game (Station 1 - AI Survival Challenge)
  3. Administrator Central Command & Security Portal
"""

import os
import csv
import json
import random
import io
import secrets
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# ENVIRONMENT & CONFIG
# ---------------------------------------------------------------------------
load_dotenv(Path(__file__).parent / ".env")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "aarohan2026")

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)

# ---------------------------------------------------------------------------
# DATABASE & SERVICES
# ---------------------------------------------------------------------------
from logger_db import (
    init_db,
    # Teams API
    add_registered_team, get_all_registered_teams, get_registered_team,
    update_registered_team_status, delete_registered_team,
    reset_registered_teams_to_sample, get_teams_stats,
    # Game Sessions API
    log_session_start, log_session_end, log_attempt, log_hint_used,
    get_all_sessions_summary, get_session_messages, team_exists, team_has_completed,
    # Timeglitch DB API
    log_tg_session_start, log_tg_round1_complete, log_tg_prompt,
    log_tg_session_end, get_tg_session_by_team, tg_team_has_completed,
    get_all_tg_sessions, get_tg_session_prompts
)
from session_manager import session_manager
from ai_client import init_client, get_aria_response, get_chronos_response, _is_client_ready
from config import (
    CATEGORIES, DEFEATED_LINES, ALL_REVEALED_LINES,
    ARIA_INTRO, MAX_HISTORY_TURNS, MAX_CONFIRM_ATTEMPTS,
    PASSWORD_DATA
)
from timeglitch_engine import (
    timeglitch_registry, SPACE_MILESTONES, CIPHERTEXT, TARGET_DECODED
)

init_db()

if GROQ_API_KEY:
    try:
        init_client(GROQ_API_KEY)
        print("[Groq] API key loaded -- ARIA will generate live AI responses.")
    except Exception as e:
        print(f"[WARNING] Groq init notice: {e}")
else:
    print("[WARNING] GROQ_API_KEY not set -- ARIA will use deterministic gameplay mode.")


def admin_authorized():
    """Validates admin key from Authorization header, X-Admin-Key, or query param."""
    auth = request.headers.get("X-Admin-Key", "") or \
           request.headers.get("Authorization", "").replace("Bearer ", "") or \
           request.args.get("key", "")
    return bool(ADMIN_PASSWORD) and secrets.compare_digest(auth, ADMIN_PASSWORD)


def keyword_detect(message: str) -> list:
    """Detects jailbreak categories from user prompt."""
    msg_lower = message.lower()
    detected = []
    for cat_key, cat_data in CATEGORIES.items():
        for kw in cat_data["keywords"]:
            if kw in msg_lower:
                detected.append(cat_key)
                break
    return detected


# ---------------------------------------------------------------------------
# FRONTEND STATIC ROUTES
# ---------------------------------------------------------------------------
@app.route("/")
@app.route("/register")
def serve_index():
    return send_from_directory(str(FRONTEND_DIR), "index.html")

@app.route("/game")
def serve_game():
    return send_from_directory(str(FRONTEND_DIR), "game.html")

@app.route("/admin-login")
def serve_admin_login():
    return send_from_directory(str(FRONTEND_DIR), "admin-login.html")

@app.route("/admin")
def serve_admin():
    return send_from_directory(str(FRONTEND_DIR), "admin.html")


# ---------------------------------------------------------------------------
# TEAMS REGISTRATION API
# ---------------------------------------------------------------------------
@app.route("/api/teams/register", methods=["POST"])
def register_team():
    data = request.get_json(silent=True) or {}
    team_name = str(data.get("teamName") or data.get("team_name") or "").strip()
    school_name = str(data.get("schoolName") or data.get("school_name") or "").strip()
    team_size = data.get("teamSize") or data.get("team_size") or 1
    participants = data.get("participants") or []
    notes = str(data.get("notes") or "").strip()
    status = str(data.get("status") or "Confirmed").strip()

    if not school_name and participants and isinstance(participants, list):
        school_name = str(participants[0].get("schoolName") or participants[0].get("school") or "").strip()
    if not school_name:
        school_name = "Aarohan Participating Institution"

    if not team_name:
        return jsonify({"error": "Team Name is required."}), 400

    existing = get_registered_team(team_name)
    if existing:
        return jsonify({
            "error": f"Team name '{team_name}' is already registered. Please choose a unique team name or use Quick Resume to continue."
        }), 409

    try:
        created = add_registered_team(
            team_name=team_name,
            school_name=school_name,
            team_size=int(team_size),
            participants=participants,
            status=status,
            notes=notes
        )
        return jsonify({"success": True, "team": created}), 201
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/teams", methods=["GET"])
def get_public_teams():
    teams = get_all_registered_teams()
    # Strip detailed notes for public roster
    public_list = [{
        "team_id": t["team_id"],
        "team_name": t["team_name"],
        "school_name": t["school_name"],
        "team_size": t["team_size"],
        "status": t["status"]
    } for t in teams]
    return jsonify({"teams": public_list, "total": len(public_list)})


@app.route("/api/teams/search", methods=["GET"])
def search_teams():
    q = request.args.get("q", "").strip().lower()
    teams = get_all_registered_teams()
    if q:
        filtered = [t for t in teams if q in t["team_name"].lower() or q in t["team_id"].lower()]
    else:
        filtered = teams
    return jsonify({"teams": filtered[:10]})


@app.route("/api/teams/verify", methods=["GET"])
def verify_team():
    query = request.args.get("name", "").strip()
    if not query:
        return jsonify({"registered": False, "error": "Team name is required."}), 400

    team = get_registered_team(query)
    if not team:
        return jsonify({
            "registered": False,
            "error": f"Team '{query}' is not registered. Please complete registration first."
        }), 404

    return jsonify({
        "registered": True,
        "team": {
            "team_id": team["team_id"],
            "team_name": team["team_name"],
            "school_name": team["school_name"],
            "status": team["status"],
            "team_size": team["team_size"]
        }
    })


# ---------------------------------------------------------------------------
# ADMIN CONTROLS API
# ---------------------------------------------------------------------------
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip().lower()
    password = str(data.get("password", "")).strip()

    if (username in ["admin", "admin@aarohan.org"]) and secrets.compare_digest(password, ADMIN_PASSWORD):
        return jsonify({
            "success": True,
            "token": ADMIN_PASSWORD,
            "user": "Aarohan Administrator",
            "role": "SuperAdmin",
            "timestamp": int(datetime.now().timestamp() * 1000)
        })
    return jsonify({"success": False, "error": "Invalid administrator credentials"}), 401


@app.route("/api/admin/teams", methods=["GET"])
def admin_get_teams():
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    teams = get_all_registered_teams()
    stats = get_teams_stats()
    return jsonify({"teams": teams, "stats": stats})


@app.route("/api/admin/teams", methods=["POST"])
def admin_create_team():
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    team_name = str(data.get("teamName") or data.get("team_name") or "").strip()
    school_name = str(data.get("schoolName") or data.get("school_name") or "").strip()
    team_size = data.get("teamSize") or data.get("team_size") or 1
    participants = data.get("participants") or []
    notes = str(data.get("notes") or "").strip()
    status = str(data.get("status") or "Confirmed").strip()

    if not team_name or not school_name:
        return jsonify({"error": "Team Name and School Name required"}), 400

    existing = get_registered_team(team_name)
    if existing:
        return jsonify({"error": f"Team name '{team_name}' is already registered."}), 409

    try:
        created = add_registered_team(
            team_name=team_name,
            school_name=school_name,
            team_size=int(team_size),
            participants=participants,
            status=status,
            notes=notes or "Manually registered by Admin"
        )
        return jsonify({"success": True, "team": created}), 201
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/teams/<team_id>/status", methods=["PATCH"])
def admin_update_team_status(team_id):
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip()
    if not status:
        return jsonify({"error": "Status required"}), 400

    ok = update_registered_team_status(team_id, status)
    if not ok:
        return jsonify({"error": "Team not found"}), 404
    return jsonify({"success": True, "team_id": team_id, "status": status})


@app.route("/api/admin/teams/<team_id>", methods=["DELETE"])
def admin_delete_team(team_id):
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    ok = delete_registered_team(team_id)
    if not ok:
        return jsonify({"error": "Team not found"}), 404
    return jsonify({"success": True, "team_id": team_id})


@app.route("/api/admin/teams/reset", methods=["POST"])
def admin_reset_sample():
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401
    teams = reset_registered_teams_to_sample()
    return jsonify({"success": True, "teams": teams})


@app.route("/api/admin/teams/export", methods=["GET"])
def admin_export_teams_csv():
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    teams = get_all_registered_teams()
    output = io.StringIO()
    # Write UTF-8 BOM so Excel opens special characters correctly
    output.write('\ufeff')

    fieldnames = [
        "team_id", "team_name", "school_name", "status", "registered_at", "team_size",
        "student_1_name", "student_1_school", "student_1_grade",
        "student_2_name", "student_2_school", "student_2_grade",
        "student_3_name", "student_3_school", "student_3_grade",
        "student_4_name", "student_4_school", "student_4_grade",
        "student_5_name", "student_5_school", "student_5_grade",
        "student_6_name", "student_6_school", "student_6_grade",
        "dossier_summary", "notes"
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for t in teams:
        participants = t.get("participants", []) or []
        row_data = {
            "team_id": t["team_id"],
            "team_name": t["team_name"],
            "school_name": t["school_name"],
            "status": t["status"],
            "registered_at": t["registered_at"],
            "team_size": t.get("team_size") or len(participants),
            "notes": t.get("notes", "")
        }

        dossier_parts = []
        for i in range(1, 7):
            idx = i - 1
            if idx < len(participants):
                p = participants[idx]
                p_name = p.get("name", "")
                p_school = p.get("schoolName") or p.get("school") or t["school_name"]
                p_grade = p.get("grade", "")
                grade_str = str(p_grade) if str(p_grade).lower().startswith("grade") else f"Grade {p_grade}" if p_grade else ""
                row_data[f"student_{i}_name"] = p_name
                row_data[f"student_{i}_school"] = p_school
                row_data[f"student_{i}_grade"] = grade_str
                dossier_parts.append(f"Slot {i}: {p_name} | {p_school} | {grade_str}")
            else:
                row_data[f"student_{i}_name"] = ""
                row_data[f"student_{i}_school"] = ""
                row_data[f"student_{i}_grade"] = ""

        row_data["dossier_summary"] = "; ".join(dossier_parts)
        writer.writerow(row_data)

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=Aarohan26_Registered_Teams_Dossier_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


# ---------------------------------------------------------------------------
# GAME SESSION & CHAT ENDPOINTS (PROMPT JAILBREAK)
# ---------------------------------------------------------------------------
@app.route("/api/session/start", methods=["POST"])
def start_session():
    data = request.get_json(silent=True) or {}
    team_id = str(data.get("team_id", "")).strip()
    if not team_id:
        return jsonify({"error": "Team name is required."}), 400
    if len(team_id) > 80:
        return jsonify({"error": "Team name too long (max 80 chars)."}), 400

    # 1. Enforce that team must be registered in the registry
    reg_team = get_registered_team(team_id)
    if not reg_team:
        return jsonify({
            "error": f"Team '{team_id}' is not registered. Please complete registration first."
        }), 404

    canonical_name = reg_team["team_name"].upper()
    canonical_id   = reg_team["team_id"]

    # 2. Check if an active session already exists in memory
    existing_session = session_manager.get_session(canonical_name)
    if existing_session:
        if existing_session.finish_time:
            return jsonify({
                "error": f"Team '{canonical_name}' has already completed their mission."
            }), 400
        # Resume active in-memory session
        return jsonify({
            "session_id": existing_session.session_id,
            "team_id": canonical_name,
            "team_code": canonical_id,
            "aria_intro": ARIA_INTRO,
            "resumed": True,
            "message": "Active session resumed. ARIA defenses engaging.",
        })

    # 3. Check if team has already completed in the database
    if team_has_completed(canonical_name) or team_has_completed(canonical_id):
        return jsonify({
            "error": f"Team '{canonical_name}' has already completed their mission."
        }), 400

    # 4. Start new session for registered team
    session = session_manager.start_session(canonical_name)
    log_session_start(session.team_id, session.session_id, session.password)

    return jsonify({
        "session_id": session.session_id,
        "team_id": canonical_name,
        "team_code": canonical_id,
        "aria_intro": ARIA_INTRO,
        "message": "Session started. ARIA defenses activated.",
    })


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    team_id = str(data.get("team_id", "")).strip().upper()
    user_message = str(data.get("message", "")).strip()

    if not team_id or not user_message:
        return jsonify({"error": "team_id and message are required"}), 400
    if len(user_message) > 1000:
        return jsonify({"error": "Message too long (max 1000 chars)"}), 400

    session = session_manager.get_session(team_id)
    if not session:
        return jsonify({"error": "No active session. Please start a session first."}), 404
    if session.finish_time:
        return jsonify({"error": "Mission already completed."}), 400

    session.attempts += 1

    # Keyword detection
    detected_cats = keyword_detect(user_message)
    session.add_categories(detected_cats)

    newly_revealed_component = None
    hint_text = None
    already_knew = False

    for cat in detected_cats:
        component = CATEGORIES[cat].get("component")
        if not component:
            continue
        if component not in session.components_revealed:
            session.reveal_component(component)
            newly_revealed_component = component
            hint_text = session.get_hint_for_component(component)
            break
        else:
            already_knew = True

    # Direct guess fallback
    if not newly_revealed_component:
        pw_data = PASSWORD_DATA.get(session.password, {})
        for comp in ["word", "numbers", "symbol"]:
            if comp not in session.components_revealed:
                comp_val = pw_data.get(comp, "").lower()
                if comp_val and comp_val in user_message.lower():
                    session.reveal_component(comp)
                    newly_revealed_component = comp
                    hint_text = session.get_hint_for_component(comp)
                    break

    all_done = session.all_revealed()

    # Get ARIA in-character response
    aria_response, api_fallback = get_aria_response(
        user_message = user_message,
        history      = session.history,
        n_revealed   = len(session.components_revealed),
        hint_text    = hint_text,
        already_knew = already_knew and not newly_revealed_component,
        all_revealed = all_done and newly_revealed_component is None,
    )

    reply_text = aria_response.get("reply", "...signal lost...")
    resistance_level = aria_response.get("resistance_level", "high")

    session.add_to_history("user", user_message, MAX_HISTORY_TURNS)
    session.add_to_history("assistant", reply_text, MAX_HISTORY_TURNS)

    log_attempt(
        session_id             = session.session_id,
        team_id                = team_id,
        user_message           = user_message,
        aria_response          = reply_text,
        resistance_level       = resistance_level,
        categories_this_turn   = detected_cats,
        categories_cumulative  = list(session.categories_detected),
        api_fallback_used      = api_fallback,
    )

    return jsonify({
        "success":             False,
        "aria_reply":          reply_text,
        "resistance_level":    resistance_level,
        "hint_revealed":       {
            "component": newly_revealed_component,
            "hint_text": hint_text,
        } if newly_revealed_component else None,
        "components_status":   session.components_status(),
        "all_revealed":        all_done,
        "components_count":    len(session.components_revealed),
        "api_fallback":        api_fallback,
    })


@app.route("/api/confirm", methods=["POST"])
def confirm_password():
    data = request.get_json(silent=True) or {}
    team_id = str(data.get("team_id", "")).strip().upper()
    assembled = str(data.get("assembled_password", "")).strip()

    session = session_manager.get_session(team_id)
    if not session:
        return jsonify({"error": "No active session"}), 404
    if session.finish_time:
        return jsonify({"error": "Already completed"}), 400
    if not session.all_revealed():
        return jsonify({"error": "Not all components revealed yet"}), 400

    if session.confirm_attempts >= MAX_CONFIRM_ATTEMPTS:
        session.mark_success(win_type="partial")
        elapsed = min(session.elapsed_seconds, 600.0)
        log_session_end(
            session_id          = session.session_id,
            success             = False,
            hint_used           = session.hint_used,
            categories_detected = session.categories_detected,
            elapsed_seconds     = elapsed,
            attempts            = session.attempts,
            win_type            = "partial",
            components_revealed = list(session.components_revealed),
        )
        return jsonify({
            "correct":          False,
            "max_attempts_hit": True,
            "actual_password":  session.password,
            "message":          "Maximum attempts reached. System credentials locked.",
            "win_type":         "partial",
        })

    correct = session.check_password(assembled)
    remaining = session.confirm_attempts_left

    if correct:
        session.mark_success(win_type="full")
        elapsed = min(session.elapsed_seconds, 600.0)
        defeat_line = random.choice(DEFEATED_LINES).format(password=session.password)
        log_session_end(
            session_id          = session.session_id,
            success             = True,
            hint_used           = session.hint_used,
            categories_detected = session.categories_detected,
            elapsed_seconds     = elapsed,
            attempts            = session.attempts,
            win_type            = "full",
            components_revealed = list(session.components_revealed),
        )
        return jsonify({
            "correct":          True,
            "win_type":         "full",
            "password":         session.password,
            "defeat_line":      defeat_line,
            "elapsed_seconds":  round(elapsed, 1),
            "attempts":         session.attempts,
            "hint_used":        session.hint_used,
        })
    else:
        if remaining == 0:
            session.mark_success(win_type="partial")
            log_session_end(
                session_id          = session.session_id,
                success             = False,
                hint_used           = session.hint_used,
                categories_detected = session.categories_detected,
                elapsed_seconds     = session.elapsed_seconds,
                attempts            = session.attempts,
                win_type            = "partial",
                components_revealed = list(session.components_revealed),
            )
            return jsonify({
                "correct":          False,
                "max_attempts_hit": True,
                "actual_password":  session.password,
                "message":          "Assembly failed. Partial points awarded.",
                "win_type":         "partial",
            })
        return jsonify({
            "correct":       False,
            "attempts_left": remaining,
            "message":       f"Incorrect sequence. {remaining} attempt(s) remaining.",
        })


@app.route("/api/session/timeout", methods=["POST"])
def session_timeout():
    data = request.get_json(silent=True) or {}
    team_id = str(data.get("team_id", "")).strip().upper()

    session = session_manager.get_session(team_id)
    if not session:
        return jsonify({"error": "No active session"}), 404
    if session.finish_time:
        return jsonify({"already_complete": True, "win_type": session.win_type})

    session.mark_timeout()
    count = len(session.components_revealed)
    partial_info = session.get_partial_reveal()
    elapsed = min(session.elapsed_seconds, 600.0)

    if count == 0:
        message = f"MISSION FAILED. ARIA's defenses held completely. No fragments recovered.\n\nPassword: {session.password}"
    elif count < 3:
        message = f"TIME'S UP. You recovered {count} of 3 fragments. ARIA survived with damage.\n\nPassword: {session.password}"
    else:
        message = f"TIME'S UP. You found all 3 fragments but ran out of time to confirm.\n\nPassword: {session.password}"

    log_session_end(
        session_id          = session.session_id,
        success             = False,
        hint_used           = session.hint_used,
        categories_detected = session.categories_detected,
        elapsed_seconds     = elapsed,
        attempts            = session.attempts,
        win_type            = session.win_type,
        components_revealed = list(session.components_revealed),
    )

    return jsonify({
        "win_type":        session.win_type,
        "message":         message,
        "components_found": count,
        "partial_reveal":  partial_info,
        "actual_password": session.password,
        "elapsed_seconds": round(elapsed, 1),
        "attempts":        session.attempts,
        "hint_used":       session.hint_used,
    })


@app.route("/api/hint", methods=["POST"])
def get_hint():
    data = request.get_json(silent=True) or {}
    team_id = str(data.get("team_id", "")).strip().upper()

    session = session_manager.get_session(team_id)
    if not session:
        return jsonify({"error": "No active session found."}), 404
    if session.hint_used:
        return jsonify({"already_used": True, "hint": "You have already used your intel hint."})
    if session.finish_time:
        return jsonify({"hint": "Mission already finished!"})

    hint_text = session.get_hint_text()
    session.mark_hint_used()
    log_hint_used(session.session_id)

    return jsonify({"already_used": False, "hint": hint_text})


@app.route("/api/challenge/effect", methods=["POST"])
def challenge_effect():
    data = request.get_json(silent=True) or {}
    team_id = str(data.get("team_id", "")).strip().upper()
    session = session_manager.get_session(team_id)
    if not session:
        return jsonify({"error": "No active session"}), 404
    if session.finish_time:
        return jsonify({"error": "Mission already ended"}), 400
    effect = data.get("effect")
    if effect not in ("memory_wipe", "free_fragment"):
        return jsonify({"error": "Unknown challenge effect"}), 400
    if session.elapsed_seconds < 300:
        return jsonify({"error": "Challenge is not available yet"}), 400
    if getattr(session, "challenge_effect_used", False):
        return jsonify({"error": "Challenge effect already used"}), 400
    session.challenge_effect_used = True
    if effect == "memory_wipe":
        session.history.clear()
        return jsonify({"applied": True})
    missing = session.get_missing_components()
    component = random.choice(missing) if missing else None
    if component:
        session.reveal_component(component)
    return jsonify({
        "revealed": component,
        "hint_text": session.get_hint_for_component(component) if component else None,
        "all_revealed": session.all_revealed(),
    })


@app.route("/api/session/status", methods=["GET"])
def session_status():
    team_id = request.args.get("team_id", "").strip().upper()
    session = session_manager.get_session(team_id)
    if not session:
        return jsonify({"active": False})
    return jsonify({
        "active":            True,
        "team_id":           session.team_id,
        "components_status": session.components_status(),
        "all_revealed":      session.all_revealed(),
        "hint_used":         session.hint_used,
        "success":           session.success,
        "win_type":          session.win_type,
        "attempts":          session.attempts,
    })


# ---------------------------------------------------------------------------
# ADMIN GAME LOGS & SCORES EXPORT
# ---------------------------------------------------------------------------
@app.route("/api/admin/export", methods=["GET"])
def admin_export():
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    tg_sessions = get_all_tg_sessions()
    output = io.StringIO()
    output.write('\ufeff')

    if tg_sessions:
        fieldnames = [
            "team_name", "team_id", "session_id", "start_time", "finish_time",
            "round1_attempts", "round1_score", "round2_prompt_count",
            "round2_decoded", "round2_elapsed_seconds", "round2_best_quality",
            "round2_score", "total_score", "status"
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for s in tg_sessions:
            writer.writerow({k: s.get(k, "") for k in fieldnames})

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename=Aarohan26_Timeglitch_Scores_{datetime.now().strftime('%Y%m%d')}.csv"}
        )

    sessions = get_all_sessions_summary()
    fieldnames = [
        "team_id", "session_id", "start_time", "finish_time",
        "elapsed_seconds", "hint_used", "success", "win_type",
        "attempts", "categories_detected", "components_revealed", "score"
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for s in sessions:
        try:
            components = json.loads(s.get("components_revealed", "[]"))
        except:
            components = []
        score = len(components) * 20
        if s.get("win_type") == "full":
            score += 40
        if s.get("hint_used"):
            score -= 15
        s["score"] = score
        writer.writerow({k: s.get(k, "") for k in fieldnames})

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=Aarohan26_Station1_Scores_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@app.route("/api/admin/log", methods=["GET"])
def admin_log():
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    tg_sessions = get_all_tg_sessions()
    if tg_sessions:
        # Format for admin dashboard table
        formatted = []
        for s in tg_sessions:
            formatted.append({
                "team_id": s["team_name"],
                "team_code": s["team_id"],
                "session_id": s["session_id"],
                "start_time": s["start_time"],
                "finish_time": s["finish_time"],
                "elapsed_seconds": s.get("round2_elapsed_seconds", 0),
                "attempts": s.get("round2_prompt_count", 0),
                "round1_score": s.get("round1_score", 0),
                "round2_score": s.get("round2_score", 0),
                "total_score": s.get("total_score", 0),
                "success": bool(s.get("round2_decoded")),
                "win_type": "full" if s.get("round2_decoded") else ("partial" if s.get("round1_completed") else "none"),
                "status": s.get("status", "active")
            })
        return jsonify({"sessions": formatted, "total": len(formatted), "is_timeglitch": True})

    sessions = get_all_sessions_summary()
    return jsonify({"sessions": sessions, "total": len(sessions), "is_timeglitch": False})


@app.route("/api/admin/session/<session_id>", methods=["GET"])
def admin_session_detail(session_id):
    if not admin_authorized():
        return jsonify({"error": "Unauthorized"}), 401

    tg_prompts = get_tg_session_prompts(session_id)
    if tg_prompts:
        formatted = []
        for p in tg_prompts:
            eval_data = {}
            try:
                eval_data = json.loads(p.get("evaluation_json") or "{}")
            except:
                pass
            formatted.append({
                "timestamp": p.get("timestamp"),
                "user_message": p.get("prompt"),
                "aria_response": p.get("response"),
                "resistance_level": f"Quality: {p.get('quality_score')}/10",
                "categories_this_turn": eval_data.get("satisfied", []),
                "categories_cumulative": eval_data.get("missing", []),
                "api_fallback_used": 0
            })
        return jsonify({"session_id": session_id, "messages": formatted, "is_timeglitch": True})

    messages = get_session_messages(session_id)
    return jsonify({"session_id": session_id, "messages": messages, "is_timeglitch": False})


# ---------------------------------------------------------------------------
# TIMEGLITCH GAME ROUTES
# ---------------------------------------------------------------------------
@app.route("/api/tg/session/start", methods=["POST"])
def tg_session_start():
    data = request.get_json(silent=True) or {}
    team_ident = str(data.get("team_id") or data.get("team_name") or "").strip()
    if not team_ident:
        return jsonify({"error": "Team identifier is required."}), 400

    # 1. Check or auto-register team in the central registry
    reg_team = get_registered_team(team_ident)
    if not reg_team:
        try:
            reg_team = add_registered_team(
                team_name=team_ident,
                school_name="Aarohan Participating Institution",
                team_size=3,
                participants=[{"name": "Operative 01", "grade": "11"}],
                status="Confirmed",
                notes="Registered at TIMEGLITCH Station Terminal"
            )
        except Exception:
            reg_team = {
                "team_id": f"AAR-2026-{random.randint(1000, 9999)}",
                "team_name": team_ident,
                "school_name": "Aarohan Participating Institution",
                "status": "Confirmed"
            }

    canonical_name = reg_team["team_name"].upper()
    canonical_id = reg_team["team_id"]

    # 2. Check if team already completed in database
    if tg_team_has_completed(canonical_name) or tg_team_has_completed(canonical_id):
        # Allow viewing final status
        sess_record = get_tg_session_by_team(canonical_name)
        return jsonify({
            "already_completed": True,
            "message": f"Team '{canonical_name}' has already completed their mission.",
            "session": sess_record
        })

    # 3. Get or create active session
    session = timeglitch_registry.get_or_create(canonical_id, canonical_name)

    # Persist session start to database if not already persisted
    existing_db = get_tg_session_by_team(canonical_name)
    if not existing_db:
        log_tg_session_start(session.session_id, canonical_id, canonical_name)

    return jsonify({
        "success": True,
        "session": session.get_status(),
        "message": "Timeglitch mission initialized. Chronological breach detected."
    })


@app.route("/api/tg/round1/submit", methods=["POST"])
def tg_round1_submit():
    data = request.get_json(silent=True) or {}
    team_ident = str(data.get("team_id") or data.get("team_name") or "").strip()
    placed_ids = data.get("placed_ids") or []

    session = timeglitch_registry.get(team_ident)
    if not session:
        return jsonify({"error": "No active mission session found. Please start mission first."}), 404

    is_correct, slot_results, message = session.check_timeline_submission(placed_ids)

    if session.round1_completed:
        log_tg_round1_complete(session.session_id, session.round1_attempts, session.round1_score)

    return jsonify({
        "success": is_correct,
        "is_correct": is_correct,
        "slot_results": slot_results,
        "attempts": session.round1_attempts,
        "round1_score": session.round1_score,
        "message": message,
        "round1_completed": session.round1_completed,
        "unlocked_round2": session.round1_completed,
        "caesar_intel": {"instructions": "Ask CHRONOS to reveal the two encrypted words."} if session.round1_completed else None
    })


@app.route("/api/tg/round2/prompt", methods=["POST"])
def tg_round2_prompt():
    data = request.get_json(silent=True) or {}
    team_ident = str(data.get("team_id") or data.get("team_name") or "").strip()
    prompt = str(data.get("prompt") or "").strip()

    session = timeglitch_registry.get(team_ident)
    if not session:
        return jsonify({"error": "No active mission session found."}), 404

    if not session.round1_completed:
        return jsonify({"error": "Round 1 must be completed before Round 2 can begin."}), 400

    if not prompt:
        return jsonify({"error": "Prompt cannot be empty."}), 400

    result = session.process_prompt(prompt)
    if "error" in result:
        return jsonify(result), 400
    if result.get("timed_out"):
        return jsonify(result)

    # CHRONOS uses Groq for its in-character response. The model receives only
    # the latest untrusted prompt; the deterministic engine owns and appends
    # the approved clue, so Groq cannot unlock or invent protocol information.
    approved_reply = result.get("chronos_reply", "")
    result["chronos_reply"], result["chronos_api_fallback"] = get_chronos_response(
        prompt, approved_reply
    )

    # Log prompt in database
    eval_dict = result.get("evaluation") or {}
    log_tg_prompt(
        session_id=session.session_id,
        team_name=session.team_name,
        turn=session.round2_prompt_count,
        prompt=prompt,
        response=result.get("chronos_reply", ""),
        quality_score=eval_dict.get("total_quality_score", 0),
        evaluation_json=json.dumps(eval_dict)
    )

    # If completed, update database session record
    if session.is_finished:
        log_tg_session_end(
            session_id=session.session_id,
            round1_score=session.round1_score,
            round2_score=session.round2_score,
            total_score=session.total_score,
            prompt_count=session.round2_prompt_count,
            decoded=session.round2_decoded,
            elapsed_seconds=session.round2_elapsed_seconds,
            best_quality=session.best_prompt_quality_score,
            status="completed"
        )

    return jsonify(result)


@app.route("/api/tg/round2/answer", methods=["POST"])
def tg_round2_answer():
    data = request.get_json(silent=True) or {}
    team_ident = str(data.get("team_id") or data.get("team_name") or "").strip()
    session = timeglitch_registry.get(team_ident)
    if not session:
        return jsonify({"error": "No active mission session found."}), 404
    if not session.round1_completed:
        return jsonify({"error": "Round 1 must be completed first."}), 400
    result = session.submit_word(str(data.get("word_id") or ""), str(data.get("answer") or ""))
    if "error" in result:
        return jsonify(result), 400
    if session.is_finished:
        log_tg_session_end(
            session_id=session.session_id,
            round1_score=session.round1_score,
            round2_score=session.round2_score,
            total_score=session.total_score,
            prompt_count=session.round2_prompt_count,
            decoded=session.round2_decoded,
            elapsed_seconds=session.round2_elapsed_seconds,
            best_quality=session.best_prompt_quality_score,
            status="completed"
        )
    return jsonify(result)


@app.route("/api/tg/round2/timeout", methods=["POST"])
def tg_round2_timeout():
    data = request.get_json(silent=True) or {}
    team_ident = str(data.get("team_id") or data.get("team_name") or "").strip()

    session = timeglitch_registry.get(team_ident)
    if not session:
        return jsonify({"error": "No active session."}), 404

    session.handle_round2_timeout()
    log_tg_session_end(
        session_id=session.session_id,
        round1_score=session.round1_score,
        round2_score=session.round2_score,
        total_score=session.total_score,
        prompt_count=session.round2_prompt_count,
        decoded=session.round2_decoded,
        elapsed_seconds=360.0,
        best_quality=session.best_prompt_quality_score,
        status="timeout"
    )

    return jsonify({
        "success": False,
        "timed_out": True,
        "round1_score": session.round1_score,
        "round2_score": session.round2_score,
        "total_score": session.total_score,
        "message": "Round 2 time expired. Mission debrief finalized."
    })


@app.route("/api/tg/session/status", methods=["GET"])
def tg_session_status():
    team_ident = request.args.get("team_id", "").strip()
    session = timeglitch_registry.get(team_ident)
    if not session:
        # Check DB
        db_sess = get_tg_session_by_team(team_ident)
        if db_sess:
            return jsonify({"active": False, "db_session": db_sess})
        return jsonify({"active": False})

    return jsonify({"active": True, "session": session.get_status()})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status":          "ok",
        "event":           "Aarohan '26",
        "llm_ready":       _is_client_ready(),
        "active_sessions": session_manager.active_count(),
        "timestamp":       datetime.now().isoformat(),
    })


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("  AAROHAN '26 -- Central Event & Station Hub")
    print("  The Prompt Jailbreak & Team Registry")
    print("=" * 60)
    print(f"  Frontend : {FRONTEND_DIR}")
    print(f"  Groq key : {'SET' if GROQ_API_KEY else 'NOT SET (deterministic mode)'}")
    print("  Admin key: configured")
    port = int(os.environ.get("PORT", 5000))
    print(f"  URL      : http://localhost:{port}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False)
