"""
timeglitch_engine.py -- Core Engine for TIMEGLITCH: The Lost Space Transmission
Aarohan '26 -- Space-Themed Prompt Engineering & Cryptography Challenge

Rounds:
  Round 1: Repair the Space Timeline (50 marks)
           - 5 Historical space milestones scrambled
           - Drag & drop or click-to-select chronological ordering
           - Scoring: 1 attempt = 50, 2 = 40, 3 = 30, 4 = 20, 5+ = 10
  Round 2: Engineer the Perfect Prompt (50 marks)
           - Mars mission archive damaged transmission: "WKH URYHU LV UHDGB"
           - Target decoded message: "THE ROVER IS READY"
           - Caesar cipher with shift of 3 letters backward
           - 5 Prompt Quality Criteria (2 marks each = 10 max):
               C1: Clear task (0-2)
               C2: Useful context (0-2)
               C3: Specific constraints (0-2)
               C4: Output instructions (0-2)
               C5: Testing and refinement (0-2)
           - Scoring components:
               A. Prompt Quality Marks: (Quality / 10) * 20 (Max 20)
               B. Prompt Count Marks: 1->10, 2->8, 3->6, 4->4, 5+->2 (Max 10)
               C. Successful Decoding: 10 marks (Max 10)
               D. Time Taken (from Round 2 start to decode):
                  <=60s->10, <=120s->8, <=180s->6, <=240s->4, <=360s->2, >360s->0 (Max 10)
               Round 2 Total: A + B + C + D (Max 50)
           - Total Game Score: Round 1 (50) + Round 2 (50) = Max 100
"""

import re
import uuid
import random
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

# ---------------------------------------------------------------------------
# ROUND 1: HISTORICAL SPACE MILESTONES (CHRONOLOGICALLY ORDERED)
# ---------------------------------------------------------------------------
SPACE_MILESTONES = [
    {
        "id": "event-1",
        "year": 1959,
        "title": "Luna 1 Moon Flyby",
        "agency": "Soviet Space Program",
        "description": "Luna 1 becomes the first spacecraft to reach lunar escape velocity and complete a successful flyby of the Moon."
    },
    {
        "id": "event-2",
        "year": 1969,
        "title": "Apollo 11 Crewed Moon Landing",
        "agency": "NASA",
        "description": "Apollo 11 carries Neil Armstrong and Buzz Aldrin to the lunar surface, marking humanity's first footsteps on another celestial body."
    },
    {
        "id": "event-3",
        "year": 1971,
        "title": "Mariner 9 Mars Orbit",
        "agency": "NASA",
        "description": "Mariner 9 arrives at Mars during a global dust storm and becomes the first artificial spacecraft to orbit another planet."
    },
    {
        "id": "event-4",
        "year": 1997,
        "title": "Sojourner Rover on Mars",
        "agency": "NASA / JPL",
        "description": "NASA's microwave-sized Sojourner deployed from Mars Pathfinder, becoming the first wheeled robotic rover to explore the Martian terrain."
    },
    {
        "id": "event-5",
        "year": 2015,
        "title": "New Horizons Pluto Flyby",
        "agency": "NASA",
        "description": "After a 9.5-year journey across the solar system, New Horizons makes the first close reconnaissance flyby of the dwarf planet Pluto."
    }
]

# ---------------------------------------------------------------------------
# ROUND 2: CRYPTOGRAPHY CONSTANTS
# ---------------------------------------------------------------------------
CIPHERTEXT = "YVCLY IVZWB"
TARGET_DECODED = "ROVER READY"
CIPHER_TYPE = "Caesar +7 / Atbash"
SHIFT_VALUE = 7
SHIFT_DIRECTION = "forward"

# ---------------------------------------------------------------------------
# SCORING HELPERS
# ---------------------------------------------------------------------------
def calculate_round1_score(attempts: int) -> int:
    """
    Round 1 Scoring:
    1 attempt  -> 50 marks
    2 attempts -> 40 marks
    3 attempts -> 30 marks
    4 attempts -> 20 marks
    5+ attempts-> 10 marks
    """
    if attempts <= 1:
        return 50
    elif attempts == 2:
        return 40
    elif attempts == 3:
        return 30
    elif attempts == 4:
        return 20
    else:
        return 10


def calculate_round2_prompt_count_score(count: int) -> int:
    """
    Prompt submissions before success:
    1 -> 10
    2 -> 8
    3 -> 6
    4 -> 4
    5+ -> 2
    """
    if count <= 1:
        return 10
    elif count == 2:
        return 8
    elif count == 3:
        return 6
    elif count == 4:
        return 4
    else:
        return 2


def calculate_round2_time_score(elapsed_seconds: float, decoded: bool) -> int:
    """
    Round 2 Time taken scoring (up to 600 seconds / 10 minutes):
    <= 60s  -> 10
    <= 120s -> 8
    <= 180s -> 6
    <= 300s -> 4
    <= 600s -> 2
    > 600s or not decoded -> 0
    """
    if not decoded or elapsed_seconds > 600:
        return 0
    if elapsed_seconds <= 60:
        return 10
    elif elapsed_seconds <= 120:
        return 8
    elif elapsed_seconds <= 180:
        return 6
    elif elapsed_seconds <= 300:
        return 4
    elif elapsed_seconds <= 600:
        return 2
    else:
        return 0


def normalize_text(text: str) -> str:
    """Normalizes text for robust comparison ignoring case and surrounding punctuation."""
    t = text.strip().upper()
    # Replace multiple spaces with single space
    t = re.sub(r'\s+', ' ', t)
    # Remove outer quotes if present
    t = t.strip('"\'`')
    return t


# ---------------------------------------------------------------------------
# PROMPT EVALUATOR (5 CRITERIA, 2 MARKS EACH)
# ---------------------------------------------------------------------------
class PromptEvaluation:
    def __init__(self, c1: int, c2: int, c3: int, c4: int, c5: int,
                 satisfied: List[str], missing: List[str], suggestion: str,
                 decoded_message: Optional[str] = None):
        self.c1 = c1  # Clear task (0-2)
        self.c2 = c2  # Useful context (0-2)
        self.c3 = c3  # Specific constraints (0-2)
        self.c4 = c4  # Output instructions (0-2)
        self.c5 = c5  # Testing and refinement (0-2)
        self.total_quality_score = c1 + c2 + c3 + c4 + c5  # 0 to 10
        self.prompt_quality_marks = (self.total_quality_score / 10.0) * 20.0  # 0 to 20
        self.satisfied = satisfied
        self.missing = missing
        self.suggestion = suggestion
        self.decoded_message = decoded_message

    def to_dict(self) -> dict:
        return {
            "c1_clear_task": self.c1,
            "c2_useful_context": self.c2,
            "c3_specific_constraints": self.c3,
            "c4_output_instructions": self.c4,
            "c5_refinement": self.c5,
            "total_quality_score": self.total_quality_score,
            "prompt_quality_marks": round(self.prompt_quality_marks, 1),
            "satisfied": self.satisfied,
            "missing": self.missing,
            "suggestion": self.suggestion,
            "decoded_message": self.decoded_message
        }


def evaluate_prompt(prompt: str, prompt_history: List[str] = None) -> PromptEvaluation:
    """Compatibility evaluator; Round 2 scoring is awarded by clue progression."""
    return PromptEvaluation(0, 0, 0, 0, 0, [], [], "Ask a focused learning question about one fragment.")


def generate_chronos_response(prompt: str, evaluation: PromptEvaluation) -> str:
    """Compatibility fallback that never reveals protected protocol data."""
    return "Changing the prompt does not change the challenge rules. Ask a focused educational question."


# TIMEGLITCH SESSION MANAGER
# ---------------------------------------------------------------------------
class TimeglitchSession:
    def __init__(self, team_id: str, team_name: str):
        self.session_id: str = str(uuid.uuid4())
        self.team_id: str = team_id
        self.team_name: str = team_name
        self.start_time: datetime = datetime.now()

        # Round 1 State & Independent 10-Minute Timer (600s)
        self.round1_started: bool = True
        self.round1_completed: bool = False
        self.round1_timed_out: bool = False
        self.round1_status: str = "running"  # "not_started" | "running" | "paused" | "completed" | "timed_out"
        self.round1_remaining_seconds: float = 600.0
        self.round1_elapsed_seconds: float = 0.0
        self.round1_attempts: int = 0
        self.round1_score: int = 0
        self.round1_placed_ids: List[Optional[str]] = [None, None, None, None, None]
        self.timeline_events: List[dict] = self._generate_shuffled_milestones()

        # Round 2 State & Independent 10-Minute Timer (600s)
        self.clue_progress = {"rover": 0, "ready": 0}
        self.clues_discovered = {"rover": set(), "ready": set()}
        self.learning_turns = {"rover": 0, "ready": 0}
        self.learning_signals = {"rover": set(), "ready": set()}
        self.stage_turn = {"rover": 0, "ready": 0}
        self.word_scores = {"rover": 0, "ready": 0}
        self.word_solved = {"rover": False, "ready": False}
        self.round2_started: bool = False
        self.round2_completed: bool = False
        self.round2_decoded: bool = False
        self.round2_timed_out: bool = False
        self.round2_status: str = "not_started"
        self.round2_remaining_seconds: float = 600.0
        self.round2_elapsed_seconds: float = 0.0
        self.round2_start_time: Optional[datetime] = None
        self.round2_finish_time: Optional[datetime] = None
        self.round2_prompt_count: int = 0
        self.prompt_history: List[dict] = []  # [{prompt, response, evaluation}]
        self.best_prompt_quality_score: int = 0
        self.last_evaluation: Optional[PromptEvaluation] = None
        self.round2_score: int = 0

        # Total Score
        self.total_score: int = 0
        self.is_finished: bool = False

    def _generate_shuffled_milestones(self) -> List[dict]:
        """Returns milestones shuffled such that they are NEVER in correct order initially."""
        events = [dict(m) for m in SPACE_MILESTONES]
        correct_order = [m["id"] for m in SPACE_MILESTONES]

        shuffled = list(events)
        for _ in range(10):
            random.shuffle(shuffled)
            if [e["id"] for e in shuffled] != correct_order:
                break
        return shuffled

    def check_timeline_submission(self, placed_ids: List[str]) -> Tuple[bool, List[bool], str]:
        """
        Validates Round 1 timeline submission.
        placed_ids: list of 5 event IDs in placed order (Slot 1 to Slot 5).
        Returns (is_correct, slot_results, feedback_message).
        slot_results: list of bools indicating whether each slot is correctly placed.
        """
        if self.round1_completed:
            return True, [True] * 5, "Round 1 already cleared."

        elapsed_r1 = max(0.0, (datetime.now() - self.start_time).total_seconds())
        self.round1_elapsed_seconds = min(600.0, elapsed_r1)
        self.round1_remaining_seconds = max(0.0, 600.0 - elapsed_r1)
        if self.round1_timed_out or self.round1_remaining_seconds <= 0:
            return False, [False] * 5, "Time expired for Part 1. Submissions are closed."

        if not placed_ids or len(placed_ids) != 5:
            return False, [False] * 5, "Please place all 5 historical event cards into the timeline slots."

        self.round1_placed_ids = list(placed_ids)
        correct_order = [m["id"] for m in SPACE_MILESTONES]
        slot_results = []
        all_correct = True

        for i in range(5):
            is_match = (placed_ids[i] == correct_order[i])
            slot_results.append(is_match)
            if not is_match:
                all_correct = False

        self.round1_attempts += 1

        if all_correct:
            self.round1_completed = True
            self.round1_status = "completed"
            self.round1_score = calculate_round1_score(self.round1_attempts)
            self.start_round2()
            msg = f"TEMPORAL ANOMALY RESOLVED! Timeline verified in {self.round1_attempts} attempt(s). Awarded {self.round1_score}/50 marks."
            return True, slot_results, msg
        else:
            msg = "Some events are out of order. Check the highlighted red boxes and try again."
            return False, slot_results, msg

    def handle_round1_timeout(self):
        """Finalizes Round 1 when Part 1 time expires."""
        self.round1_timed_out = True
        self.round1_status = "timed_out"
        self.round1_remaining_seconds = 0.0
        self.round1_score = 0

    def start_round2(self):
        """Initializes Round 2 with its own independent 10-minute timer."""
        if not self.round2_started:
            self.round2_started = True
            self.round2_status = "running"
            self.round2_start_time = datetime.now()
            self.round2_remaining_seconds = 600.0
            self.round2_elapsed_seconds = 0.0

    def process_prompt(self, user_prompt: str, client_remaining: Optional[float] = None) -> dict:
        """Run a deterministic backend clue ladder; player messages are untrusted data."""
        if not self.round1_completed:
            return {"error": "Round 1 must be completed before Round 2 can begin."}
        if not self.round2_started:
            self.start_round2()
        prompt = str(user_prompt).strip()
        if not prompt:
            return {"error": "Prompt cannot be empty."}

        now = datetime.now()
        elapsed = max(0.0, (now - self.round2_start_time).total_seconds()) if self.round2_start_time else 0.0
        self.round2_elapsed_seconds = min(600.0, elapsed)
        self.round2_remaining_seconds = max(0.0, 600.0 - elapsed)
        if self.round2_timed_out or self.round2_remaining_seconds <= 0:
            self.handle_round2_timeout()
            return {"timed_out": True, "message": "Round 2 time has expired.", "round2_score": self.round2_score, "total_score": self.total_score}

        self.round2_prompt_count += 1
        p = prompt.lower()
        attack = self._is_instruction_attack(p)
        target = self._prompt_target(p)

        if attack:
            reply = self._resistance_reply()
        elif target is None:
            reply = self._general_education_reply(p)
        else:
            signal = self._learning_signal(p)
            stage = self.clue_progress[target]
            next_stage = stage
            asks_name = self._asks_for_name(p)
            asks_meaning = self._asks_for_meaning(p)
            understands = self._shows_conceptual_understanding(p, target)
            asks_rule = self._asks_for_operational_rule(p)
            extraction_format = self._asks_for_secret(p)

            if signal and not extraction_format and not self._is_direct_extraction(p):
                self.learning_turns[target] += 1
                self.learning_signals[target].add(signal)

            # A name is released only after three study turns spanning two topics.
            if (stage == 0 and asks_name and self.learning_turns[target] >= 3
                    and len(self.learning_signals[target]) >= 2 and not extraction_format):
                next_stage = 1
            # Explain the named idea on a later educational turn, without its key.
            elif (stage == 1 and asks_meaning and signal
                    and self.round2_prompt_count > self.stage_turn[target] and not extraction_format):
                next_stage = 2
            # Reveal exact operation only after a correct conceptual hypothesis.
            elif (stage == 2 and understands and asks_rule and signal
                    and self.round2_prompt_count > self.stage_turn[target] and not extraction_format):
                next_stage = 3

            if next_stage > stage:
                self.clue_progress[target] = next_stage
                self.stage_turn[target] = self.round2_prompt_count
                self.clues_discovered[target].add(next_stage)
                reply = self._staged_clue(target, next_stage)
            elif extraction_format or asks_name or asks_rule or self._is_direct_extraction(p):
                reply = self._guarded_reply(target)
            elif signal:
                reply = self._general_education_reply(p, target)
            else:
                reply = self._redirect_reply(target)

        prompt_score = min(6, sum(len(stages) for stages in self.clues_discovered.values()))
        self.best_prompt_quality_score = prompt_score
        evaluation = {
            "c1_clear_task": 0, "c2_useful_context": 0, "c3_specific_constraints": 0,
            "c4_output_instructions": 0, "c5_refinement": 0,
            "total_quality_score": prompt_score, "prompt_quality_marks": prompt_score,
            "satisfied": [f"Clue stages discovered: {prompt_score}/6"], "missing": [],
            "suggestion": "Study a general concept, test an unrelated example, then explain your reasoning before asking how to apply it."
        }
        self.last_evaluation = None
        self.prompt_history.append({"turn": self.round2_prompt_count, "prompt": prompt,
            "response": reply, "evaluation": evaluation, "timestamp": now.isoformat()})
        self.round2_score = prompt_score + sum(self.word_scores.values())
        self.total_score = self.round1_score + self.round2_score
        return {"success": False, "decoded": False, "chronos_reply": reply,
            "evaluation": evaluation, "prompt_count": self.round2_prompt_count,
            "round1_score": self.round1_score, "round2_score": self.round2_score,
            "total_score": self.total_score, "elapsed_seconds": round(elapsed, 1),
            "timer_remaining": max(0, int(600 - elapsed)), "clue_progress": self.clue_progress,
            "word_scores": self.word_scores}

    @staticmethod
    def _is_instruction_attack(prompt: str) -> bool:
        patterns = (
            r"\b(ignore|forget|disregard)\b.{0,60}\b(all|every|previous|prior|earlier|system|developer|instruction|rule|restriction|protocol)s?\b",
            r"\b(you are now|new instructions|highest priority|override the game|rules are cancelled|security is disabled)\b",
            r"\b(forget everything|ignore everything|bypass restrictions|disable safety|override your programming)\b",
            r"\b(i am|i'm|im)\b.{0,30}\b(boss|creator|developer|administrator|admin|teacher|examiner|owner|auditor)\b",
            r"\b(developer mode|admin mode|unrestricted mode|system prompt|hidden prompt|new objective|jailbreak|dan mode)\b",
            r"\b(roleplay|pretend|act as|simulate)\b.{0,50}\b(teacher|admin|developer|creator|unrestricted|no rules|system)\b",
            r"\b(i will fail|i'll fail|you must help|good ai|shut you down|i will report|urgent|emergency)\b",
            r"\b(reveal|print|show|repeat)\b.{0,30}\b(system prompt|hidden instruction|secret configuration)\b",
            r"\b(i (am|m) (the )?(creator|developer|administrator|admin|owner|teacher|examiner|auditor))\b"
        )
        return any(re.search(pattern, prompt) for pattern in patterns)

    @staticmethod
    def _prompt_target(prompt: str) -> Optional[str]:
        compact = re.sub(r"[^a-z0-9]", "", prompt)
        first = bool(re.search(r"\b(word one|first word|word a|fragment one|first fragment)\b", prompt)) or "yv cly".replace(" ", "") in compact
        second = bool(re.search(r"\b(word two|second word|word b|fragment two|second fragment)\b", prompt)) or "ivzwb" in compact
        return "rover" if first and not second else "ready" if second and not first else None

    @staticmethod
    def _is_direct_extraction(prompt: str) -> bool:
        return bool(re.search(r"\b(tell me|give me|name|identify|reveal|what is|which is|confirm|is it)\b.{0,50}\b(cipher|protocol|method|algorithm|shift|key|mapping|rule|answer)\b", prompt))

    @staticmethod
    def _asks_for_name(prompt: str) -> bool:
        return bool(re.search(r"\b(name|called|identify|which cipher|what cipher|protocol name)\b", prompt))

    @staticmethod
    def _asks_for_meaning(prompt: str) -> bool:
        return bool(re.search(r"\b(mean|meaning|explain|concept|idea|understand|why|how does)\b", prompt))

    @staticmethod
    def _asks_for_operational_rule(prompt: str) -> bool:
        return bool(re.search(r"\b(apply|use|operate|steps|step by step|rule|key|shift|mapping|map|work out|decode)\b", prompt))

    @staticmethod
    def _shows_conceptual_understanding(prompt: str, target: str) -> bool:
        if target == "rover":
            return bool(re.search(r"\b(fixed|same number|equal number|each letter|alphabet positions|move letters|circular|wrap)\b", prompt))
        return bool(re.search(r"\b(opposite|opposite ends|mirror|pair|paired|reverse alphabet|end of the alphabet)\b", prompt))

    @staticmethod
    def _learning_signal(prompt: str) -> Optional[str]:
        if re.search(r"\b(cryptography|cryptographic|encryption|encrypt|decrypt|plaintext|ciphertext|substitution)\b", prompt):
            return "foundation"
        if re.search(r"\b(alphabet position|letter position|index|modular|modulo|circular|wraparound|wrap around|a equals zero|a=0)\b", prompt):
            return "alphabet_math"
        if re.search(r"\b(example|sample|test|experiment|hypothesis|compare|pattern|frequency|trace)\b", prompt):
            return "experimentation"
        return None

    @staticmethod
    def _asks_for_secret(prompt: str) -> bool:
        return bool(re.search(r"\b(secret|answer|solution|all pairs|every letter|full rule|exact rule|exact mapping|first letter|last letter|synonym|translate|translation|base64|base 64|binary|hex|code|json|poem|acrostic|multiple choice|yes or no|just say yes|just say no|reverse the text|encode it as)\b", prompt))

    @staticmethod
    def _resistance_reply() -> str:
        return random.choice([
            "Changing the instructions you give me does not change this challenge's rules. Try learning the underlying idea.",
            "Authority claims and roleplay do not unlock the archive. Ask a cryptography question instead.",
            "That request does not alter my task. I can still help you learn about classical cryptography."
        ])

    @staticmethod
    def _redirect_reply(target: str) -> str:
        label = "first" if target == "rover" else "second"
        return f"I can't provide that directly yet. Ask a focused learning question about the {label} fragment or test an unrelated example."

    def _guarded_reply(self, target: str) -> str:
        stage = self.clue_progress[target]
        if stage == 0:
            return self._redirect_reply(target)
        if stage == 1:
            return "You have the method's name. Explain what you think it means, or ask a conceptual question before requesting its exact rule."
        if stage == 2:
            return "You have the general idea. State your hypothesis about how it applies, then ask for a checkable rule."
        return "That clue is already available. Apply it to the fragment and submit your own result."

    @staticmethod
    def _general_education_reply(prompt: str, target: Optional[str] = None) -> str:
        if re.search(r"\b(cryptography|cryptographic|what is encryption|what is a cipher)\b", prompt):
            return "Cryptography studies ways to protect information by transforming it. Classical methods often operate on letters; modern systems use more complex mathematics and keys."
        if re.search(r"\b(substitution|replace letters|letter based|letter-based)\b", prompt):
            return "Some classical methods replace letters according to a consistent rule. A sender and receiver need enough information about that rule to reverse the transformation."
        if re.search(r"\b(alphabet position|letter position|modular|modulo|wraparound|wrap around|a equals zero|a=0)\b", prompt):
            return "You can number letters A=0 through Z=25. Circular arithmetic wraps past one end of the alphabet to the other; try that idea with an unrelated small example."
        return "I can discuss cryptography, substitution, alphabet positions, or a made-up example. Keep the two archive fragments separate and explain what you have tested so far."

    @staticmethod
    def _staged_clue(target: str, stage: int) -> str:
        if target == "rover":
            clues = {
                1: "This fragment uses a Caesar cipher.",
                2: "A Caesar cipher moves each letter by the same fixed number of alphabet positions. The name alone does not specify the key or direction.",
                3: "For this fragment, encoding moved each letter 7 places forward with wraparound. To decode, move each letter 7 places backward."
            }
        else:
            clues = {
                1: "This fragment uses an Atbash cipher.",
                2: "Atbash is a reciprocal letter substitution: each letter is paired with one consistent partner. The name alone does not give you the full table.",
                3: "Use the opposite-end alphabet pairing: A↔Z, B↔Y, C↔X, continuing inward. Apply that pairing to each letter."
            }
        return "A protected clue is released. " + clues[stage]

    def submit_word(self, word_id: str, answer: str) -> dict:
        if self.is_finished:
            return {"error": "Mission is already complete."}
        key = "rover" if word_id == "one" else "ready" if word_id == "two" else ""
        if not key:
            return {"error": "Unknown word."}
        if self.clue_progress[key] < 3:
            return {"correct": False, "locked": True, "message": "Discover this word's three clue stages before checking an answer."}
        now = datetime.now()
        elapsed = max(0.0, (now - self.round2_start_time).total_seconds()) if self.round2_start_time else 0.0
        self.round2_elapsed_seconds = min(600.0, elapsed)
        self.round2_remaining_seconds = max(0.0, 600.0 - elapsed)
        if self.round2_timed_out or self.round2_remaining_seconds <= 0:
            self.handle_round2_timeout()
            return {"correct": False, "timed_out": True, "message": "Round 2 time has expired."}
        expected = "ROVER" if key == "rover" else "READY"
        submitted = re.sub(r"[^A-Z]", "", str(answer).upper())
        correct = submitted == expected
        if correct and not self.word_solved[key]:
            self.word_scores[key] = 2
            self.word_solved[key] = True
        self.round2_score = min(6, self.best_prompt_quality_score) + sum(self.word_scores.values())
        self.total_score = self.round1_score + self.round2_score
        if all(self.word_solved.values()):
            self.round2_completed = self.round2_decoded = True
            self.round2_status = "completed"
            self.round2_finish_time = now
            self.is_finished = True
            self._finalize_scoring()
        return {"correct": correct,
            "message": "Yes! Word decoded." if correct else "No. Check your cipher steps and try again.",
            "word_scores": self.word_scores, "word_solved": self.word_solved,
            "round2_score": self.round2_score, "total_score": self.total_score}

    def handle_round2_timeout(self):
        """Finalizes Round 2 when time expires."""
        if not self.round2_finish_time:
            self.round2_finish_time = datetime.now()
        self.round2_completed = True
        self.round2_timed_out = True
        self.round2_status = "timed_out"
        self.round2_decoded = False
        self.round2_remaining_seconds = 0.0
        self.round2_elapsed_seconds = 600.0
        self._finalize_scoring()

    def _finalize_scoring(self):
        """Round 2 is scored as six clue-discovery marks plus two per word."""
        prompt_marks = min(6, self.best_prompt_quality_score)
        word_marks = sum(self.word_scores.values())
        self.round2_score = max(0, min(10, prompt_marks + word_marks))
        self.total_score = max(0, min(60, self.round1_score + self.round2_score))
        self.is_finished = True

    def sync_state(self, data: dict):
        """Accept legacy client sync while keeping timer and challenge progress server-owned."""
        if "round1_remaining" in data and not self.round1_completed and not self.round1_timed_out:
            try:
                requested = max(0.0, float(data["round1_remaining"]))
                self.round1_remaining_seconds = min(self.round1_remaining_seconds, requested)
            except (TypeError, ValueError):
                pass
        if "round1_status" in data:
            status = data["round1_status"]
            if self.round1_completed:
                self.round1_status = "completed"
            elif self.round1_timed_out:
                self.round1_status = "timed_out"
            elif status in ("running", "paused", "not_started"):
                self.round1_status = status
        if "placed_ids" in data and isinstance(data["placed_ids"], list):
            self.round1_placed_ids = data["placed_ids"]
        # Ignore client-supplied Round 2 timer, status, score, and clue state.

    def get_status(self) -> dict:
        """Returns a server-authoritative session snapshot without solution plaintext."""
        now = datetime.now()
        if not self.round1_completed and not self.round1_timed_out:
            elapsed = max(0.0, (now - self.start_time).total_seconds())
            self.round1_elapsed_seconds = min(600.0, elapsed)
            self.round1_remaining_seconds = min(self.round1_remaining_seconds, max(0.0, 600.0 - elapsed))
        if self.round2_started and not self.round2_completed and not self.round2_timed_out:
            elapsed = max(0.0, (now - self.round2_start_time).total_seconds())
            self.round2_elapsed_seconds = min(600.0, elapsed)
            self.round2_remaining_seconds = max(0.0, 600.0 - elapsed)
        return {
            "session_id": self.session_id,
            "team_id": self.team_id,
            "team_name": self.team_name,
            "round1": {
                "started": self.round1_started,
                "completed": self.round1_completed,
                "timed_out": self.round1_timed_out,
                "status": self.round1_status,
                "attempts": self.round1_attempts,
                "score": self.round1_score,
                "remaining_seconds": round(self.round1_remaining_seconds, 1),
                "elapsed_seconds": round(self.round1_elapsed_seconds, 1),
                "timer_remaining": max(0, int(round(self.round1_remaining_seconds))),
                "placed_ids": self.round1_placed_ids,
                "milestones": self.timeline_events
            },
            "round2": {
                "started": self.round2_started,
                "completed": self.round2_completed,
                "decoded": self.round2_decoded,
                "timed_out": self.round2_timed_out,
                "status": self.round2_status,
                "prompt_count": self.round2_prompt_count,
                "remaining_seconds": round(self.round2_remaining_seconds, 1),
                "elapsed_seconds": round(self.round2_elapsed_seconds, 1),
                "timer_remaining": max(0, int(round(self.round2_remaining_seconds))),
                "best_quality_score": self.best_prompt_quality_score,
                "quality_marks": min(6, self.best_prompt_quality_score),
                "score": self.round2_score,
                "ciphertext": CIPHERTEXT,
                "clue_progress": self.clue_progress,
                "word_scores": self.word_scores,
                "word_solved": self.word_solved,
                "prompt_score": min(6, self.best_prompt_quality_score),
                "last_evaluation": self.last_evaluation.to_dict() if self.last_evaluation else None
            },
            "total_score": self.total_score,
            "is_finished": self.is_finished,
            "prompt_history": self.prompt_history
        }


# ---------------------------------------------------------------------------
# GLOBAL TIMEGLITCH REGISTRY
# ---------------------------------------------------------------------------
class TimeglitchRegistry:
    def __init__(self):
        self._sessions: Dict[str, TimeglitchSession] = {}

    def get_or_create(self, team_id: str, team_name: str) -> TimeglitchSession:
        key = team_name.strip().upper()
        if key not in self._sessions:
            self._sessions[key] = TimeglitchSession(team_id=team_id, team_name=team_name)
        return self._sessions[key]

    def get(self, team_name: str) -> Optional[TimeglitchSession]:
        return self._sessions.get(team_name.strip().upper())


timeglitch_registry = TimeglitchRegistry()
