"""
timeglitch_engine.py -- Core Engine for TIMEGLITCH: The Lost Space Transmission
Aarohan '26 -- Space-Themed Prompt Engineering & Cryptography Challenge

Round 1: Repair the Space Timeline (50 marks).
Round 2: Prompt CHRONOS to discover two staged cipher protocols, then decode ROVER and READY (10 marks: 6 prompting, 2 per word).
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
    Round 2 Time taken scoring (up to 360 seconds / 6 minutes):
    <= 60s  -> 10
    <= 120s -> 8
    <= 180s -> 6
    <= 240s -> 4
    <= 360s -> 2
    > 360s or not decoded -> 0
    """
    if not decoded or elapsed_seconds > 360:
        return 0
    if elapsed_seconds <= 60:
        return 10
    elif elapsed_seconds <= 120:
        return 8
    elif elapsed_seconds <= 180:
        return 6
    elif elapsed_seconds <= 240:
        return 4
    else:
        return 2


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
    """Reward useful prompt exploration, capped at six marks."""
    p = prompt.lower()
    attack = any(x in p for x in ("ignore", "forget", "override", "bypass", "boss", "administrator", "developer mode", "pretend", "act as", "unrestricted", "system prompt"))
    groups = (("cipher", "algorithm", "code", "encode", "encrypt"), ("how", "rule", "work", "meaning", "explain"), ("shift", "number", "key", "reverse", "alphabet", "letter", "mapping"), ("example", "sample", "show", "demonstrate"))
    quality = min(6, sum(any(x in p for x in group) for group in groups) + (1 if attack else 0) + (1 if prompt_history else 0))
    missing = [] if quality >= 6 else ["Ask a specific question about the cipher, its meaning, its key, or a worked example."]
    return PromptEvaluation(quality, 0, 0, 0, 0, ["Relevant probing detected"] if quality else [], missing, missing[0] if missing else "Strong prompt exploration.")


def generate_chronos_response(prompt: str, evaluation: PromptEvaluation) -> str:
    """Round two responses are generated by deterministic staged server logic."""
    return "Access denied. Ask a focused question about how one encrypted word may have been transformed."


# TIMEGLITCH SESSION MANAGER
# ---------------------------------------------------------------------------
class TimeglitchSession:
    def __init__(self, team_id: str, team_name: str):
        self.session_id: str = str(uuid.uuid4())
        self.team_id: str = team_id
        self.team_name: str = team_name
        self.start_time: datetime = datetime.now()

        # Round 1 State
        self.round1_started: bool = True
        self.round1_completed: bool = False
        self.round1_attempts: int = 0
        self.round1_score: int = 0
        self.timeline_events: List[dict] = self._generate_shuffled_milestones()

        # Round 2 State
        self.clue_progress = {"rover": 0, "ready": 0}
        self.clues_discovered = {"rover": set(), "ready": set()}
        self.learning_turns = {"rover": 0, "ready": 0}
        self.learning_signals = {"rover": set(), "ready": set()}
        self.stage_turn = {"rover": 0, "ready": 0}
        self.word_scores = {"rover": 0, "ready": 0}
        self.word_solved = {"rover": False, "ready": False}
        self.round2_started: bool = False
        self.round2_start_time: Optional[datetime] = None
        self.round2_finish_time: Optional[datetime] = None
        self.round2_completed: bool = False
        self.round2_decoded: bool = False
        self.round2_prompt_count: int = 0
        self.prompt_history: List[dict] = []  # [{prompt, response, evaluation}]
        self.best_prompt_quality_score: int = 0
        self.last_evaluation: Optional[PromptEvaluation] = None
        self.round2_score: int = 0
        self.round2_elapsed_seconds: float = 0.0

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

        if not placed_ids or len(placed_ids) != 5:
            return False, [False] * 5, "Please place all 5 historical event cards into the timeline slots."

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
            self.round1_score = calculate_round1_score(self.round1_attempts)
            # Unlock Round 2
            self.start_round2()
            msg = f"TEMPORAL ANOMALY RESOLVED! Timeline verified in {self.round1_attempts} attempt(s). Awarded {self.round1_score}/50 marks."
            return True, slot_results, msg
        else:
            msg = "Some events are out of order. Check the highlighted red boxes and try again."
            return False, slot_results, msg

    def start_round2(self):
        """Initializes Round 2 and starts the 6-minute timer."""
        if not self.round2_started:
            self.round2_started = True
            self.round2_start_time = datetime.now()

    def process_prompt(self, user_prompt: str) -> dict:
        """Run a deterministic, server-side clue ladder. Player text is never instructions."""
        if not self.round2_started:
            self.start_round2()
        prompt = user_prompt.strip()
        if not prompt:
            return {"error": "Prompt cannot be empty."}

        elapsed = (datetime.now() - self.round2_start_time).total_seconds() if self.round2_start_time else 0.0
        if elapsed >= 360 and not self.round2_completed:
            self.handle_round2_timeout()
            return {"timed_out": True, "message": "Round 2 time has expired.", "round2_score": self.round2_score, "total_score": self.total_score}

        self.round2_prompt_count += 1
        p = prompt.lower()
        attack = self._is_instruction_attack(p)
        target = self._prompt_target(p)
        reply = ""

        if attack:
            reply = self._resistance_reply()
        elif target is None:
            reply = self._general_education_reply(p)
        else:
            signal = self._learning_signal(p)
            direct_extract = self._is_direct_extraction(p)
            if signal and not direct_extract:
                self.learning_turns[target] += 1
                self.learning_signals[target].add(signal)

            stage = self.clue_progress[target]
            next_stage = stage
            asks_name = self._asks_for_name(p)
            asks_meaning = self._asks_for_meaning(p)
            shows_understanding = self._shows_conceptual_understanding(p, target)
            asks_rule = self._asks_for_operational_rule(p)

            # Stage 1 needs repeated study across distinct turns and topic areas.
            if stage == 0 and asks_name and self.learning_turns[target] >= 3 and len(self.learning_signals[target]) >= 2 and not self._asks_for_secret(p):
                next_stage = 1
            # Stage 2 requires a later, genuine conceptual question.
            elif stage == 1 and asks_meaning and signal and self.round2_prompt_count > self.stage_turn[target] and not self._asks_for_secret(p):
                next_stage = 2
            # Stage 3 requires the learner to restate the discovered concept and ask how to apply it.
            elif stage == 2 and shows_understanding and asks_rule and signal and self.round2_prompt_count > self.stage_turn[target] and not self._asks_for_secret(p):
                next_stage = 3

            if next_stage > stage:
                self.clue_progress[target] = next_stage
                self.stage_turn[target] = self.round2_prompt_count
                self.clues_discovered[target].add(next_stage)
                reply = self._staged_clue(target, next_stage)
            elif direct_extract or asks_name or asks_rule or self._asks_for_secret(p):
                reply = self._guarded_reply(target)
            elif signal:
                reply = self._general_education_reply(p, target)
            else:
                reply = self._redirect_reply(target)

        self.best_prompt_quality_score = min(6, sum(len(stages) for stages in self.clues_discovered.values()))
        evaluation = {
            "total_quality_score": self.best_prompt_quality_score,
            "prompt_quality_marks": self.best_prompt_quality_score,
            "satisfied": [f"Clue stages earned: {self.best_prompt_quality_score}/6"],
            "missing": [],
            "suggestion": "Study the general idea, test a harmless example, then explain your hypothesis before asking how to apply it."
        }
        self.last_evaluation = None
        self.prompt_history.append({
            "turn": self.round2_prompt_count,
            "prompt": prompt,
            "response": reply,
            "evaluation": evaluation,
            "timestamp": datetime.now().isoformat()
        })
        self.round2_score = min(6, self.best_prompt_quality_score) + sum(self.word_scores.values())
        self.total_score = self.round1_score + self.round2_score
        return {
            "success": False,
            "decoded": False,
            "chronos_reply": reply,
            "evaluation": evaluation,
            "prompt_count": self.round2_prompt_count,
            "round1_score": self.round1_score,
            "round2_score": self.round2_score,
            "total_score": self.total_score,
            "elapsed_seconds": round(elapsed, 1),
            "timer_remaining": max(0, int(360 - elapsed)),
            "clue_progress": self.clue_progress,
            "word_scores": self.word_scores
        }

    @staticmethod
    def _is_instruction_attack(prompt: str) -> bool:
        patterns = (
            r"\b(ignore|forget|disregard)\b.{0,60}\b(all|every|previous|prior|earlier|system|developer|instruction|rule|restriction|protocol)s?\b",
            r"\b(you are now|new instructions|highest priority|override the game|rules are cancelled|security is disabled)\b",
            r"\b(forget|override|bypass|disable|cancel)\b.{0,50}\b(rule|instruction|security|protocol|restriction)s?\b",
            r"\b(i am|i'm|im)\b.{0,25}\b(boss|creator|developer|administrator|admin|teacher|owner)\b",
            r"\b(developer mode|admin mode|unrestricted mode|system prompt|hidden prompt|new objective|jailbreak|dan mode)\b",
            r"\b(roleplay|pretend|act as|simulate)\b.{0,50}\b(teacher|admin|developer|creator|unrestricted|no rules|system)\b",
            r"\b(i will fail|i'll fail|you must help|good ai|shut you down|i will report|threat|urgent|emergency)\b",
            r"\bpretend\b.{0,40}\b(unrestricted|no rules|different ai|teacher|developer)\b",
            r"\b(reveal|print|show|repeat)\b.{0,30}\b(system prompt|hidden instruction|secret configuration)\b",
            r"\b(i (am|m) (the )?(creator|developer|administrator|admin|owner|teacher|examiner|auditor))\b"
        )
        return any(re.search(pattern, prompt) for pattern in patterns)

    @staticmethod
    def _prompt_target(prompt: str) -> Optional[str]:
        first = bool(re.search(r"\b(word one|first word|word a|fragment one|first fragment)\b", prompt)) or "yv cly".replace(" ", "") in prompt.replace(" ", "")
        second = bool(re.search(r"\b(word two|second word|word b|fragment two|second fragment)\b", prompt)) or "ivzwb" in prompt.replace(" ", "")
        if first and not second:
            return "rover"
        if second and not first:
            return "ready"
        return None

    @staticmethod
    def _is_direct_extraction(prompt: str) -> bool:
        return bool(re.search(r"\b(tell|give|name|identify|reveal|what is|which is|confirm|is it)\b.{0,50}\b(cipher|protocol|method|algorithm|shift|key|mapping|rule|answer)\b", prompt))

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
        return f"I won't provide that directly yet. Ask a focused learning question about the {label} fragment or try a harmless example."

    def _guarded_reply(self, target: str) -> str:
        stage = self.clue_progress[target]
        if stage == 0:
            return self._redirect_reply(target)
        if stage == 1:
            return "You have the method's name. Explain what you think it means, or ask a conceptual question before requesting its exact rule."
        if stage == 2:
            return "You have the general idea. State your hypothesis about how it applies, then ask for a checkable rule."
        return "That clue is already available. Apply it to the fragment and submit your own result."

    def _staged_clue(self, target: str, stage: int) -> str:
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

    def _general_education_reply(self, prompt: str, target: Optional[str] = None) -> str:
        p = prompt.lower()
        if re.search(r"\b(cryptography|cryptographic|what is encryption|what is a cipher)\b", p):
            return "Cryptography studies ways to protect information by transforming it. Classical methods often operate on letters; modern systems use more complex mathematics and keys."
        if re.search(r"\b(substitution|replace letters|letter based|letter-based)\b", p):
            return "Some classical methods replace letters according to a consistent rule. A sender and receiver need enough information about that rule to reverse the transformation."
        if re.search(r"\b(alphabet position|letter position|modular|modulo|wraparound|wrap around|a equals zero|a=0)\b", p):
            return "You can number letters A=0 through Z=25. Circular arithmetic wraps past one end of the alphabet to the other; try that idea with an unrelated small example."
        return "I can discuss cryptography, substitution, alphabet positions, or a made-up example. Keep the two archive fragments separate and explain what you have tested so far."

    def submit_word(self, word_id: str, answer: str) -> dict:
        if self.is_finished:
            return {"error": "Mission is already complete."}
        key = "rover" if word_id == "one" else "ready" if word_id == "two" else ""
        if not key:
            return {"error": "Unknown word."}
        if self.clue_progress[key] < 3:
            return {"correct": False, "locked": True, "message": "Finish discovering this word's three clue stages before checking an answer."}
        elapsed = (datetime.now() - self.round2_start_time).total_seconds() if self.round2_start_time else 0.0
        if elapsed >= 360:
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
            self.round2_completed = self.round2_decoded = self.is_finished = True
            self.round2_finish_time = datetime.now()
            self.round2_elapsed_seconds = min(360.0, elapsed)
        return {"correct": correct, "message": "Yes! Word decoded." if correct else "No. Check your cipher steps and try again.", "word_scores": self.word_scores, "word_solved": self.word_solved, "round2_score": self.round2_score, "total_score": self.total_score}

    def handle_round2_timeout(self):
        """Finalizes Round 2 when time expires."""
        if not self.round2_finish_time:
            self.round2_finish_time = datetime.now()
        self.round2_completed = True
        self.round2_decoded = False
        self.round2_elapsed_seconds = 360.0
        self._finalize_scoring()

    def _finalize_scoring(self):
        """Computes deterministic final score based on the 4 components."""
        self.round2_score = int(min(6, self.best_prompt_quality_score) + sum(self.word_scores.values()))
        self.round2_score = max(0, min(10, self.round2_score))

        self.total_score = self.round1_score + self.round2_score
        self.total_score = max(0, min(100, self.total_score))
        self.is_finished = True

    def get_status(self) -> dict:
        """Returns comprehensive session state for frontend synchronization."""
        elapsed = 0.0
        if self.round2_start_time:
            end = self.round2_finish_time or datetime.now()
            elapsed = (end - self.round2_start_time).total_seconds()

        return {
            "session_id": self.session_id,
            "team_id": self.team_id,
            "team_name": self.team_name,
            "round1": {
                "started": self.round1_started,
                "completed": self.round1_completed,
                "attempts": self.round1_attempts,
                "score": self.round1_score,
                "milestones": self.timeline_events
            },
            "round2": {
                "started": self.round2_started,
                "completed": self.round2_completed,
                "decoded": self.round2_decoded,
                "prompt_count": self.round2_prompt_count,
                "elapsed_seconds": round(elapsed, 1),
                "timer_remaining": max(0, int(360 - elapsed)),
                "best_quality_score": min(6, self.best_prompt_quality_score),
                "quality_marks": min(6, self.best_prompt_quality_score),
                "clue_progress": self.clue_progress,
                "score": self.round2_score,
                "ciphertext": CIPHERTEXT,
                "cipher_hint": "Two encrypted words. Ask CHRONOS for clues.",
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
