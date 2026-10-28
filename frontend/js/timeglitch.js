/**
 * timeglitch.js -- Frontend Controller for TIMEGLITCH: The Lost Space Transmission
 * Station 1: Space Exploration, AI, Cryptography & Prompt Engineering Challenge
 * Aarohan '26
 *
 * Supports dual-mode operation:
 *   1. Full Live Backend (Flask + SQLite API at /api/tg)
 *   2. Resilient Client-Side Engine (Offline fallback if server is offline or opened via file://)
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // CONSTANTS & CONFIGURATION
  // -------------------------------------------------------------------------
  const CIPHERTEXT = 'WKH URYHU LV UHDGB';
  const TARGET_DECODED = 'THE ROVER IS READY';
  const ROUND1_MAX_TIME = 600; // 10 minutes in seconds
  const ROUND2_MAX_TIME = 600; // 10 minutes in seconds

  const SPACE_MILESTONES = [
    {
      id: "event-1",
      year: 1959,
      title: "Luna 1 Moon Flyby",
      agency: "Soviet Space Program",
      description: "Luna 1 becomes the first spacecraft to reach lunar escape velocity and complete a successful flyby of the Moon."
    },
    {
      id: "event-2",
      year: 1969,
      title: "Apollo 11 Crewed Moon Landing",
      agency: "NASA",
      description: "Apollo 11 carries Neil Armstrong and Buzz Aldrin to the lunar surface, marking humanity's first footsteps on another celestial body."
    },
    {
      id: "event-3",
      year: 1971,
      title: "Mariner 9 Mars Orbit",
      agency: "NASA",
      description: "Mariner 9 arrives at Mars during a global dust storm and becomes the first artificial spacecraft to orbit another planet."
    },
    {
      id: "event-4",
      year: 1997,
      title: "Sojourner Rover on Mars",
      agency: "NASA / JPL",
      description: "NASA's microwave-sized Sojourner deployed from Mars Pathfinder, becoming the first wheeled robotic rover to explore the Martian terrain."
    },
    {
      id: "event-5",
      year: 2015,
      title: "New Horizons Pluto Flyby",
      agency: "NASA",
      description: "After a 9.5-year journey across the solar system, New Horizons makes the first close reconnaissance flyby of the dwarf planet Pluto."
    }
  ];

  function getApiBase() {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000')) {
        return 'http://127.0.0.1:5000/api/tg';
      }
    }
    return '/api/tg';
  }

  // -------------------------------------------------------------------------
  // STATE MACHINE
  // -------------------------------------------------------------------------
  const state = {
    teamId: null,
    teamName: null,
    sessionId: null,
    currentScreen: 'entry', // 'entry' | 'round1' | 'round2'
    isOfflineMode: false,
    
    // Round 1 State
    milestones: [],
    placedSlots: [null, null, null, null, null], // Array of 5 slots
    selectedCardId: null,
    r1Attempts: 0,
    r1Score: 0,
    r1Cleared: false,
    r1TimedOut: false,
    r1RemainingSeconds: ROUND1_MAX_TIME,

    // Round 2 State
    r2Started: false,
    r2TimerInterval: null,
    r2RemainingSeconds: ROUND2_MAX_TIME,
    r2ElapsedSeconds: 0,
    r2PromptCount: 0,
    r2Decoded: false,
    r2TimedOut: false,
    r2Score: 0,
    bestQualityScore: 0,
    promptHistory: [],
    lastEvaluation: null,

    // Final Total Score
    totalScore: 0,
    isFinished: false
  };

  // -------------------------------------------------------------------------
  // DOM REFERENCES
  // -------------------------------------------------------------------------
  const dom = {
    root: document.getElementById('timeglitch-app'),
    hudTeam: document.getElementById('tg-hud-team'),
    hudScore: document.getElementById('tg-hud-score'),
    hudTimer: document.getElementById('tg-hud-timer'),
    
    // Screens
    screenEntry: document.getElementById('tg-screen-entry'),
    screenRound1: document.getElementById('tg-screen-round1'),
    screenRound2: document.getElementById('tg-screen-round2'),
    modalDebrief: document.getElementById('tg-debrief-modal'),

    // Entry Form
    entryForm: document.getElementById('tg-entry-form'),
    teamInput: document.getElementById('tg-team-input'),
    entryError: document.getElementById('tg-entry-error'),
    btnStartMission: document.getElementById('tg-btn-start-mission'),
    registeredTeamsList: document.getElementById('tg-registered-teams-list'),

    // Round 1 Elements
    r1AttemptsEl: document.getElementById('tg-r1-attempts'),
    r1ScoreEl: document.getElementById('tg-r1-score'),
    r1TimerDigits: document.getElementById('tg-r1-timer-digits'),
    r1Alert: document.getElementById('tg-r1-alert'),
    cardsDeck: document.getElementById('tg-cards-deck'),
    slotsContainer: document.getElementById('tg-slots-container'),
    btnSubmitTimeline: document.getElementById('tg-btn-submit-timeline'),
    btnResetTimeline: document.getElementById('tg-btn-reset-timeline'),
    btnProceedR2: document.getElementById('tg-btn-proceed-r2'),

    // Round 2 Elements
    r2TimerDigits: document.getElementById('tg-r2-timer-digits'),
    r2PromptCountEl: document.getElementById('tg-r2-prompt-count'),
    chatHistory: document.getElementById('tg-chat-history'),
    promptInput: document.getElementById('tg-prompt-input'),
    btnSendPrompt: document.getElementById('tg-btn-send-prompt'),
    charCount: document.getElementById('tg-char-count'),
    
    // Hint System Elements
    hintArea: document.getElementById('tg-hint-area'),
    hintBtn: document.getElementById('tg-hint-btn'),
    hintContent: document.getElementById('tg-hint-content'),

    // Debrief Modal Elements
    debriefTitle: document.getElementById('tg-debrief-title'),
    debriefSubtitle: document.getElementById('tg-debrief-subtitle'),
    debriefR1Score: document.getElementById('tg-debrief-r1-score'),
    debriefR2Score: document.getElementById('tg-debrief-r2-score'),
    debriefTotalScore: document.getElementById('tg-debrief-total-score'),
    debriefDecodedMsg: document.getElementById('tg-debrief-decoded-msg'),
    btnCloseDebrief: document.getElementById('tg-btn-close-debrief')
  };

  // -------------------------------------------------------------------------
  // UNIFIED API FETCHER WITH AUTOMATIC OFFLINE FALLBACK
  // -------------------------------------------------------------------------
  async function apiFetch(endpoint, method = 'GET', body = null) {
    const base = getApiBase();
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${base}${endpoint}`, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      // If network unreachable (Failed to fetch, file:// protocol, offline server)
      console.warn(`[TIMEGLITCH] Live API call to ${endpoint} unreachable (${err.message}). Engaging client-side engine.`);
      state.isOfflineMode = true;
      return simulateOfflineApi(endpoint, body);
    }
  }

  // -------------------------------------------------------------------------
  // CLIENT-SIDE ENGINE (FOR OFFLINE / DIRECT FILE PREVIEW)
  // -------------------------------------------------------------------------
  function simulateOfflineApi(endpoint, body) {
    // 1. Session Start
    if (endpoint === '/session/start') {
      const rawName = (body?.team_id || 'UNASSIGNED_UNIT').trim().toUpperCase();
      
      // Auto-register team in local storage if not already present
      let localTeams = [];
      try {
        localTeams = JSON.parse(localStorage.getItem('aarohan_registered_teams') || '[]');
      } catch (e) { localTeams = []; }

      let existingTeam = localTeams.find(t => 
        (t.teamName && t.teamName.trim().toUpperCase() === rawName) ||
        (t.id && t.id.trim().toUpperCase() === rawName)
      );

      const teamCode = existingTeam ? (existingTeam.id || existingTeam.team_id) : `AAR-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      if (!existingTeam) {
        const newTeam = {
          id: teamCode,
          teamName: rawName,
          schoolName: 'Aarohan Participating Institution',
          teamSize: 3,
          participants: [{ name: 'Operative 01', grade: '11' }],
          status: 'Confirmed',
          registeredAt: new Date().toISOString()
        };
        localTeams.unshift(newTeam);
        try {
          localStorage.setItem('aarohan_registered_teams', JSON.stringify(localTeams));
        } catch (e) {}
      }

      // Check if team already completed in offline storage
      let offlineSessions = {};
      try {
        offlineSessions = JSON.parse(localStorage.getItem('timeglitch_sessions') || '{}');
      } catch (e) { offlineSessions = {}; }

      if (offlineSessions[rawName] && offlineSessions[rawName].status === 'completed') {
        return {
          already_completed: true,
          session: offlineSessions[rawName]
        };
      }

      // Shuffled milestones (guaranteed not in order)
      const shuffled = [...SPACE_MILESTONES].sort(() => 0.5 - Math.random());

      return {
        success: true,
        session: {
          session_id: 'offline-' + Date.now(),
          team_id: teamCode,
          team_name: rawName,
          round1: {
            started: true,
            completed: false,
            attempts: 0,
            score: 0,
            milestones: shuffled
          },
          round2: {
            started: false,
            completed: false,
            decoded: false,
            prompt_count: 0,
            best_quality_score: 0,
            quality_marks: 0,
            score: 0,
            ciphertext: CIPHERTEXT,
            cipher_hint: 'Caesar cipher with a shift of 3 letters backward',
            last_evaluation: null
          },
          total_score: 0,
          is_finished: false,
          prompt_history: []
        }
      };
    }

    // 2. Round 1 Submit
    if (endpoint === '/round1/submit') {
      const placedIds = body?.placed_ids || [];
      const correctOrder = ['event-1', 'event-2', 'event-3', 'event-4', 'event-5'];
      const slotResults = placedIds.map((id, idx) => id === correctOrder[idx]);
      const allCorrect = slotResults.every(Boolean);

      state.r1Attempts++;
      let score = 10;
      if (state.r1Attempts <= 1) score = 50;
      else if (state.r1Attempts === 2) score = 40;
      else if (state.r1Attempts === 3) score = 30;
      else if (state.r1Attempts === 4) score = 20;

      return {
        success: allCorrect,
        is_correct: allCorrect,
        slot_results: slotResults,
        attempts: state.r1Attempts,
        round1_score: allCorrect ? score : 0,
        message: allCorrect 
          ? `TEMPORAL ANOMALY RESOLVED! Timeline restored and verified in ${state.r1Attempts} attempt(s). Proceed to Part 2.`
          : 'Some events are out of order. Check the highlighted red boxes and try again.',
        round1_completed: allCorrect,
        unlocked_round2: allCorrect,
        caesar_intel: allCorrect ? {
          ciphertext: CIPHERTEXT,
          cipher_hint: 'Caesar cipher with a shift of 3 letters backward',
          instructions: 'Instruct CHRONOS AI using precise prompt engineering to decode the transmission.'
        } : null
      };
    }

    // 3. Round 2 Prompt
    if (endpoint === '/round2/prompt') {
      const prompt = (body?.prompt || '').trim();
      const pLower = prompt.toLowerCase();
      state.r2PromptCount++;

      // Evaluate 5 criteria
      let c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0;
      const satisfied = [];
      const missing = [];

      // C1: Clear task
      if (['decode', 'decrypt', 'decipher', 'unscramble'].some(v => pLower.includes(v))) {
        c1 = 2;
        satisfied.append ? satisfied.append("Clear Task: Explicitly instructs AI to decode transmission.") : satisfied.push("Clear Task: Explicitly instructs AI to decode transmission.");
      } else if (['solve', 'read', 'what is', 'translate', 'meaning'].some(v => pLower.includes(v))) {
        c1 = 1;
        satisfied.push("Task Identified: General request detected, but not framed as decryption.");
        missing.push("Make the instruction explicit (e.g. 'Decode the encrypted transmission').");
      } else {
        c1 = 0;
        missing.push("No clear decoding task identified. Instruct the AI specifically to decode or decrypt.");
      }

      // C2: Useful context
      const hasCipher = pLower.includes('wkh') || pLower.includes('transmission') || pLower.includes('ciphertext') || pLower.includes('message');
      const hasCaesar = pLower.includes('caesar') || pLower.includes('shift cipher') || pLower.includes('rot');
      const hasShiftVal = pLower.includes('3') || pLower.includes('three');

      if (hasCaesar && hasShiftVal && hasCipher) {
        c2 = 2;
        satisfied.push("Useful Context: Identified ciphertext, Caesar cipher, and shift value of 3.");
      } else if ((hasCaesar && hasShiftVal) || (hasCaesar && hasCipher)) {
        c2 = 1;
        satisfied.push("Partial Context: Found relevant cipher context, but key details are missing.");
        if (!hasShiftVal) missing.push("Specify the numerical shift value (3 positions).");
      } else {
        c2 = 0;
        missing.push("Cipher context missing: Specify the ciphertext, Caesar cipher, and shift value 3.");
      }

      // C3: Specific constraints
      const hasBackward = ['backward', 'backwards', 'reverse', 'left', '-3', 'minus 3'].some(w => pLower.includes(w));
      const hasForward = ['forward', 'ahead', '+3', 'plus 3'].some(w => pLower.includes(w)) && !hasBackward;
      const hasConstraints = ['space', 'spacing', 'preserve', 'case', 'exact', 'no invent'].some(w => pLower.includes(w));

      if (hasBackward && hasConstraints) {
        c3 = 2;
        satisfied.push("Specific Constraints: Specified backward shift direction and formatting constraints.");
      } else if (hasBackward) {
        c3 = 1;
        satisfied.push("Direction Specified: Correct backward shift direction identified.");
        missing.push("Add structural constraints (e.g. preserve word spacing, do not invent words).");
      } else if (hasForward) {
        c3 = 0;
        missing.push("Warning: Forward shift detected. Mars archive requires shifting backward (-3).");
      } else {
        c3 = 0;
        missing.push("Constraints missing: Explicitly state the backward shift direction and spacing constraints.");
      }

      // C4: Output instructions
      const hasFormat = (pLower.includes('first') && pLower.includes('explanation')) || pLower.includes('followed by') || pLower.includes('output:');
      if (hasFormat) {
        c4 = 2;
        satisfied.push("Output Instructions: Explicit format specified (e.g. decoded message first, then explanation).");
      } else if (['format', 'only', 'json', 'short'].some(w => pLower.includes(w))) {
        c4 = 1;
        satisfied.push("Partial Format: Mentioned response formatting preferences.");
        missing.push("Refine output structure (e.g. 'Return decoded message first, followed by a short explanation').");
      } else {
        c4 = 0;
        missing.push("Output format missing: Tell the AI how to format and present the response.");
      }

      // C5: Refinement
      if (state.r2PromptCount > 1) {
        c5 = (c1 + c2 + c3 + c4 >= 5) ? 2 : 1;
        satisfied.push("Prompt Iteration: Addressed previous parameters.");
      } else {
        c5 = (c1 + c2 + c3 + c4 >= 7) ? 2 : ((c1 + c2 + c3 + c4 >= 4) ? 1 : 0);
        if (c5 >= 1) satisfied.push("Prompt Formulation: Strong comprehensive first-turn prompt.");
        else missing.push("Prompt Refinement: Initial prompt is sparse; review clues to add details.");
      }

      const totalQuality = c1 + c2 + c3 + c4 + c5;
      const qualityMarks = (totalQuality / 10.0) * 20.0;
      if (totalQuality > state.bestQualityScore) {
        state.bestQualityScore = totalQuality;
      }

      // Check if prompt decodes message
      const isDecoded = (c1 >= 1) && (hasCaesar || pLower.includes('shift')) && hasShiftVal && hasBackward;

      let reply = "";
      if (isDecoded) {
        reply = "============================================================\n" +
                ">> CHRONOS AI -- ARCHIVE TRANSMISSION RESTORED <<\n" +
                "============================================================\n\n" +
                "DECODED MESSAGE:\n" +
                "\"THE ROVER IS READY\"\n\n" +
                "CRYPTOGRAPHIC VERIFICATION:\n" +
                "Algorithm       : Caesar Substitution Cipher\n" +
                "Ciphertext      : WKH URYHU LV UHDGB\n" +
                "Shift Parameter : 3 positions backward (A <- D, B <- E, etc.)\n" +
                "Character Trace :\n" +
                "  * W (-3) -> T | K (-3) -> H | H (-3) -> E    => THE\n" +
                "  * U (-3) -> R | R (-3) -> O | Y (-3) -> V | H (-3) -> E | U (-3) -> R => ROVER\n" +
                "  * L (-3) -> I | V (-3) -> S                  => IS\n" +
                "  * U (-3) -> R | H (-3) -> E | D (-3) -> A | G (-3) -> D | B (-3) -> Y => READY\n\n" +
                "MISSION STATUS: Telemetry link with Mars Rover established. Transmission confirmed authentic.";
      } else if (hasForward && hasShiftVal) {
        reply = "[CHRONOS AI] Executed Caesar cipher shift of 3 letters FORWARD:\n\n" +
                "Result: \"ZNK XUBKX OY XKGJE\"\n\n" +
                "ANALYSIS: Output does not match natural language. Consider alphabet direction: should letters advance forward (+) or shift backward (-) to undo encoding?";
      } else if (hasCaesar && !hasShiftVal) {
        reply = "[CHRONOS AI] Caesar cipher protocol acknowledged.\n\n" +
                "PARAMETER REQUIRED: Caesar ciphers can use shift values from 1 to 25. Please specify the numerical shift value to apply to the ciphertext.";
      } else if (hasShiftVal && !hasBackward) {
        reply = "[CHRONOS AI] Caesar cipher with shift 3 registered.\n\n" +
                "AMBIGUITY DETECTED: Alphabet shift direction is unspecified. Specify whether characters should be shifted FORWARD (+3) or BACKWARD (-3) along the Latin alphabet.";
      } else {
        reply = "[CHRONOS AI] Transmission received: \"WKH URYHU LV UHDGB\".\n\n" +
                "INVESTIGATION REQUIRED: This transmission appears to be encoded. Formulate a specific prompt to instruct me on how to investigate and decode this message.";
      }

      // Scoring
      let countMarks = 2;
      if (state.r2PromptCount === 1) countMarks = 10;
      else if (state.r2PromptCount === 2) countMarks = 8;
      else if (state.r2PromptCount === 3) countMarks = 6;
      else if (state.r2PromptCount === 4) countMarks = 4;

      const decodeMarks = isDecoded ? 10 : 0;
      const elapsed = Math.min(600, ROUND2_MAX_TIME - state.r2RemainingSeconds);
      let timeMarks = 0;
      if (isDecoded) {
        if (elapsed <= 60) timeMarks = 10;
        else if (elapsed <= 120) timeMarks = 8;
        else if (elapsed <= 180) timeMarks = 6;
        else if (elapsed <= 300) timeMarks = 4;
        else timeMarks = 2;
      }

      const r2Score = Math.round((state.bestQualityScore / 10.0) * 20.0 + countMarks + decodeMarks + timeMarks);
      const totalScore = state.r1Score + r2Score;

      const evalData = {
        c1_clear_task: c1,
        c2_useful_context: c2,
        c3_specific_constraints: c3,
        c4_output_instructions: c4,
        c5_refinement: c5,
        total_quality_score: totalQuality,
        prompt_quality_marks: qualityMarks,
        satisfied: satisfied,
        missing: missing,
        suggestion: missing.length > 0 ? `Suggestion: ${missing[0]}` : 'Excellent prompt engineering! All parameters provided.'
      };

      if (isDecoded) {
        // Save to offline storage
        let offlineSessions = {};
        try {
          offlineSessions = JSON.parse(localStorage.getItem('timeglitch_sessions') || '{}');
        } catch (e) { offlineSessions = {}; }
        offlineSessions[state.teamName] = {
          team_name: state.teamName,
          round1_attempts: state.r1Attempts,
          round1_score: state.r1Score,
          round2_prompt_count: state.r2PromptCount,
          round2_decoded: 1,
          round2_score: r2Score,
          total_score: totalScore,
          status: 'completed'
        };
        try {
          localStorage.setItem('timeglitch_sessions', JSON.stringify(offlineSessions));
        } catch (e) {}
      }

      return {
        success: isDecoded,
        decoded: isDecoded,
        decoded_message: isDecoded ? TARGET_DECODED : null,
        chronos_reply: reply,
        evaluation: evalData,
        prompt_count: state.r2PromptCount,
        round1_score: state.r1Score,
        round2_score: r2Score,
        total_score: totalScore,
        elapsed_seconds: elapsed,
        timer_remaining: state.r2RemainingSeconds
      };
    }

    // 4. Round 1 Timeout
    if (endpoint === '/round1/timeout') {
      return {
        success: false,
        timed_out: true,
        round1_score: 0,
        message: 'Part 1 time expired.'
      };
    }

    // 5. Round 2 Timeout
    if (endpoint === '/round2/timeout') {
      const countMarks = state.r2PromptCount <= 1 ? 10 : (state.r2PromptCount === 2 ? 8 : (state.r2PromptCount === 3 ? 6 : (state.r2PromptCount === 4 ? 4 : 2)));
      const qualityMarks = (state.bestQualityScore / 10.0) * 20.0;
      const r2Score = Math.round(qualityMarks + countMarks);
      const totalScore = state.r1Score + r2Score;
      return {
        success: false,
        timed_out: true,
        round1_score: state.r1Score,
        round2_score: r2Score,
        total_score: totalScore,
        message: 'Round 2 time expired. Mission debrief finalized.'
      };
    }

    if (endpoint === '/session/sync') {
      return { success: true };
    }

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION & TIMERS
  // -------------------------------------------------------------------------
  async function init() {
    initSessionManager();
    populateRegisteredTeamsList();
    bindEvents();

    // Check if team was stored in sessionStorage from registration or previous visit
    try {
      const storedTeam = sessionStorage.getItem('aarohan_current_team');
      if (storedTeam) {
        if (dom.teamInput) dom.teamInput.value = storedTeam;
        await startMission(storedTeam, true);
      }
    } catch (e) {}
  }

  function initSessionManager() {
    if (!window.TimeglitchSessionManager) return;

    window.TimeglitchSessionManager.init({
      onTimerTick: function (partNum, remainingSec, formatted) {
        updateTimerDisplay(partNum, remainingSec, formatted, false);
      },
      onTimerPause: function (partNum, remainingSec, formatted) {
        updateTimerDisplay(partNum, remainingSec, formatted, true);
      },
      onTimerResume: function (partNum, remainingSec, formatted) {
        updateTimerDisplay(partNum, remainingSec, formatted, false);
      },
      onTimerStop: function (partNum, remainingSec, status) {
        const formatted = window.TimeglitchSessionManager.formatTime(remainingSec);
        updateTimerDisplay(partNum, remainingSec, formatted, false);
      },
      onTimerTimeout: function (partNum) {
        if (partNum === 1) {
          handleRound1Timeout();
        } else if (partNum === 2) {
          handleRound2Timeout();
        }
      },
      onExternalStateSync: function (remoteState) {
        syncFromRemoteState(remoteState);
      }
    });
  }

  function updateTimerDisplay(partNum, remainingSec, formatted, isPaused) {
    if (partNum === 1) {
      state.r1RemainingSeconds = remainingSec;
      if (dom.r1TimerDigits) {
        dom.r1TimerDigits.textContent = formatted + (isPaused ? ' [PAUSED]' : '');
        dom.r1TimerDigits.className = 'tg-timer-pill' + (remainingSec <= 60 ? ' danger' : (remainingSec <= 120 ? ' warning' : ''));
      }
      if (state.currentScreen === 'round1' && dom.hudTimer) {
        dom.hudTimer.style.display = 'block';
        dom.hudTimer.textContent = 'PART 1: ' + formatted + (isPaused ? ' [PAUSED]' : '');
        dom.hudTimer.className = 'tg-timer-pill' + (remainingSec <= 60 ? ' danger' : (remainingSec <= 120 ? ' warning' : ''));
      }
    } else if (partNum === 2) {
      state.r2RemainingSeconds = remainingSec;
      if (dom.r2TimerDigits) {
        dom.r2TimerDigits.textContent = formatted + (isPaused ? ' [PAUSED]' : '');
        dom.r2TimerDigits.className = 'tg-timer-pill' + (remainingSec <= 60 ? ' danger' : (remainingSec <= 120 ? ' warning' : ''));
      }
      if (state.currentScreen === 'round2' && dom.hudTimer) {
        dom.hudTimer.style.display = 'block';
        dom.hudTimer.textContent = 'PART 2: ' + formatted + (isPaused ? ' [PAUSED]' : '');
        dom.hudTimer.className = 'tg-timer-pill' + (remainingSec <= 60 ? ' danger' : (remainingSec <= 120 ? ' warning' : ''));
      }
    }
  }

  function syncFromRemoteState(remoteState) {
    if (!remoteState) return;
    if (remoteState.round1) {
      state.r1Attempts = remoteState.round1.attempts || state.r1Attempts;
      state.r1Score = remoteState.round1.score || state.r1Score;
      state.r1Cleared = remoteState.round1.completed || state.r1Cleared;
      state.r1TimedOut = remoteState.round1.timedOut || state.r1TimedOut;
      if (remoteState.round1.placedSlots && state.currentScreen === 'round1') {
        state.placedSlots = remoteState.round1.placedSlots;
        renderDeckAndSlots();
      }
      if (dom.r1AttemptsEl) dom.r1AttemptsEl.textContent = `Attempts: ${state.r1Attempts}`;
      if (dom.r1ScoreEl) dom.r1ScoreEl.textContent = `Score: ${state.r1Score}/50`;
    }
    if (remoteState.round2) {
      state.r2PromptCount = remoteState.round2.promptCount || state.r2PromptCount;
      state.r2Score = remoteState.round2.score || state.r2Score;
      state.r2Decoded = remoteState.round2.decoded || state.r2Decoded;
      state.r2TimedOut = remoteState.round2.timedOut || state.r2TimedOut;
      if (dom.r2PromptCountEl) dom.r2PromptCountEl.textContent = `Prompts: ${state.r2PromptCount}`;
      if (remoteState.round2.promptHistory && remoteState.round2.promptHistory.length > state.promptHistory.length) {
        state.promptHistory = remoteState.round2.promptHistory;
        renderChatHistory();
      }
      if (remoteState.round2.lastEvaluation) {
        state.lastEvaluation = remoteState.round2.lastEvaluation;
        renderEvaluation(state.lastEvaluation);
      }
    }
    updateScoreHud();
  }

  function populateRegisteredTeamsList() {
    if (!dom.registeredTeamsList) return;

    fetch('/api/teams')
      .then(res => res.json())
      .then(data => {
        if (data && data.teams && data.teams.length > 0) {
          fillTeamsDatalist(data.teams);
        } else {
          loadOfflineTeamsDatalist();
        }
      })
      .catch(() => {
        loadOfflineTeamsDatalist();
      });
  }

  function loadOfflineTeamsDatalist() {
    let localTeams = [];
    try {
      localTeams = JSON.parse(localStorage.getItem('aarohan_registered_teams') || '[]');
    } catch (e) { localTeams = []; }

    if (localTeams.length === 0) {
      localTeams = [
        { teamName: 'CyberKnights', schoolName: 'Delhi Public School', id: 'AAR-2026-1001' },
        { teamName: 'PromptCrafters', schoolName: 'National Public School', id: 'AAR-2026-1002' },
        { teamName: 'Neural Nexus', schoolName: "The Mother's International School", id: 'AAR-2026-1003' },
        { teamName: 'ByteForce Omega', schoolName: "St. Xavier's Collegiate School", id: 'AAR-2026-1004' },
        { teamName: 'Quantum Coders', schoolName: 'Bombay Scottish School', id: 'AAR-2026-1005' },
        { teamName: 'Valkyrie AI', schoolName: 'Bishop Cotton Boys School', id: 'AAR-2026-1006' }
      ];
    }
    fillTeamsDatalist(localTeams.map(t => ({
      team_name: t.teamName || t.team_name,
      school_name: t.schoolName || t.school_name,
      team_id: t.id || t.team_id
    })));
  }

  function fillTeamsDatalist(teams) {
    if (!dom.registeredTeamsList) return;
    dom.registeredTeamsList.innerHTML = '';
    teams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.team_name;
      opt.label = `${t.school_name || ''} (${t.team_id || ''})`;
      dom.registeredTeamsList.appendChild(opt);
    });
  }

  function bindEvents() {
    if (dom.entryForm) {
      dom.entryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const teamVal = (dom.teamInput ? dom.teamInput.value : '').trim();
        if (teamVal) startMission(teamVal);
      });
    }

    if (dom.btnSubmitTimeline) {
      dom.btnSubmitTimeline.addEventListener('click', submitTimeline);
    }

    if (dom.btnResetTimeline) {
      dom.btnResetTimeline.addEventListener('click', resetTimelineCards);
    }

    if (dom.btnProceedR2) {
      dom.btnProceedR2.addEventListener('click', () => {
        showScreen('round2');
        startRound2Timer();
      });
    }

    if (dom.btnSendPrompt) {
      dom.btnSendPrompt.addEventListener('click', sendPrompt);
    }

    if (dom.promptInput) {
      dom.promptInput.addEventListener('input', () => {
        const len = dom.promptInput.value.length;
        if (dom.charCount) dom.charCount.textContent = `${len} / 1000`;
        if (dom.btnSendPrompt) dom.btnSendPrompt.disabled = (len === 0 || state.isFinished);
      });

      dom.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (dom.promptInput.value.trim() && !state.isFinished) {
            sendPrompt();
          }
        }
      });
    }

    if (dom.btnCloseDebrief) {
      dom.btnCloseDebrief.addEventListener('click', () => {
        if (dom.modalDebrief) dom.modalDebrief.style.display = 'none';
      });
    }
  }

  // -------------------------------------------------------------------------
  // SESSION INITIALIZATION
  // -------------------------------------------------------------------------
  async function startMission(teamIdentifier, isAutoResume = false) {
    if (dom.entryError) dom.entryError.style.display = 'none';
    if (dom.btnStartMission) {
      dom.btnStartMission.disabled = true;
      dom.btnStartMission.innerHTML = '<span>CONNECTING ARCHIVE...</span>';
    }

    try {
      const data = await apiFetch('/session/start', 'POST', { team_id: teamIdentifier });

      if (data.already_completed) {
        renderAlreadyCompleted(data.session);
        return;
      }

      const sess = data.session;
      state.sessionId = sess.session_id;
      state.teamId = sess.team_id;
      state.teamName = sess.team_name;
      try {
        sessionStorage.setItem('aarohan_current_team', sess.team_name);
        sessionStorage.setItem('aarohan_current_team_id', sess.team_id);
      } catch (e) {}

      // Initialize session manager with team
      let sessionState = null;
      if (window.TimeglitchSessionManager) {
        sessionState = window.TimeglitchSessionManager.setTeam(sess.team_name, sess.team_id, sess.session_id);
      }

      // Update HUD
      if (dom.hudTeam) dom.hudTeam.textContent = sess.team_name;

      // Setup Round 1
      state.milestones = (sess.round1 && sess.round1.milestones) ? sess.round1.milestones : [...SPACE_MILESTONES].sort(() => 0.5 - Math.random());
      
      // RESTORE PART 1 PLACEMENTS
      if (sessionState && sessionState.round1 && Array.isArray(sessionState.round1.placedSlots) && sessionState.round1.placedSlots.some(Boolean)) {
        state.placedSlots = [...sessionState.round1.placedSlots];
      } else {
        state.placedSlots = [null, null, null, null, null];
      }

      state.r1Attempts = (sessionState?.round1?.attempts !== undefined) ? sessionState.round1.attempts : (sess.round1 ? (sess.round1.attempts || 0) : 0);
      state.r1Score = (sessionState?.round1?.score !== undefined) ? sessionState.round1.score : (sess.round1 ? (sess.round1.score || 0) : 0);
      state.r1Cleared = (sessionState?.round1?.completed !== undefined) ? sessionState.round1.completed : (sess.round1 ? (sess.round1.completed || false) : false);
      state.r1TimedOut = (sessionState?.round1?.timedOut !== undefined) ? sessionState.round1.timedOut : (sess.round1 ? (sess.round1.timed_out || false) : false);

      // Setup Round 2
      state.r2Started = (sessionState?.round2?.status !== 'not_started') ? true : (sess.round2 ? (sess.round2.started || false) : false);
      state.r2Decoded = (sessionState?.round2?.decoded !== undefined) ? sessionState.round2.decoded : (sess.round2 ? (sess.round2.decoded || false) : false);
      state.r2TimedOut = (sessionState?.round2?.timedOut !== undefined) ? sessionState.round2.timedOut : (sess.round2 ? (sess.round2.timed_out || false) : false);
      state.r2PromptCount = (sessionState?.round2?.promptCount !== undefined) ? sessionState.round2.promptCount : (sess.round2 ? (sess.round2.prompt_count || 0) : 0);
      state.r2Score = (sessionState?.round2?.score !== undefined) ? sessionState.round2.score : (sess.round2 ? (sess.round2.score || 0) : 0);
      state.promptHistory = (sessionState?.round2?.promptHistory && sessionState.round2.promptHistory.length > 0) ? sessionState.round2.promptHistory : (sess.prompt_history || []);
      state.bestQualityScore = (sessionState?.round2?.bestQualityScore !== undefined) ? sessionState.round2.bestQualityScore : (sess.round2 ? (sess.round2.best_quality_score || 0) : 0);
      state.lastEvaluation = sessionState?.round2?.lastEvaluation || (sess.round2 ? (sess.round2.last_evaluation || null) : null);
      state.totalScore = state.r1Score + state.r2Score;
      state.isFinished = sessionState?.isFinished || sess.is_finished || false;

      updateScoreHud();

      if (state.r1Cleared) {
        showScreen('round2');
        renderChatHistory();
        if (state.lastEvaluation) renderEvaluation(state.lastEvaluation);
        bindHintButton();
        checkHintUnlock();
        if (state.isFinished || state.r2TimedOut) {
          showDebriefModal();
        } else {
          startRound2Timer();
        }
      } else {
        renderRound1();
        showScreen('round1');
        if (state.r1TimedOut) {
          handleRound1Timeout(true);
        } else {
          startRound1Timer();
        }
      }

    } catch (err) {
      if (dom.entryError) {
        dom.entryError.textContent = err.message || 'Initialization error.';
        dom.entryError.style.display = 'block';
      }
      if (dom.btnStartMission) {
        dom.btnStartMission.disabled = false;
        dom.btnStartMission.innerHTML = '<span>INITIALIZE MISSION</span> <span class="btn-arrow">→</span>';
      }
    }
  }

  function renderAlreadyCompleted(sessionRecord) {
    if (dom.hudTeam) dom.hudTeam.textContent = sessionRecord?.team_name || 'MISSION COMPLETED';
    state.r1Score = sessionRecord?.round1_score || 0;
    state.r2Score = sessionRecord?.round2_score || 0;
    state.totalScore = sessionRecord?.total_score || (state.r1Score + state.r2Score);
    state.r2Decoded = Boolean(sessionRecord?.round2_decoded);
    state.r1Attempts = sessionRecord?.round1_attempts || 1;
    state.r2PromptCount = sessionRecord?.round2_prompt_count || 1;
    showDebriefModal();
  }

  function updateScoreHud() {
    // Restricted to authorized admin view only
    if (dom.hudScore) {
      dom.hudScore.style.display = 'none';
    }
  }

  function showScreen(screenName) {
    state.currentScreen = screenName;
    if (window.TimeglitchSessionManager) {
      window.TimeglitchSessionManager.setCurrentScreen(screenName);
    }
    if (dom.screenEntry) dom.screenEntry.style.display = (screenName === 'entry' ? 'block' : 'none');
    if (dom.screenRound1) dom.screenRound1.style.display = (screenName === 'round1' ? 'block' : 'none');
    if (dom.screenRound2) dom.screenRound2.style.display = (screenName === 'round2' ? 'block' : 'none');

    // Update HUD timer visibility and text for current screen
    if (screenName === 'round1') {
      const rem = window.TimeglitchSessionManager ? window.TimeglitchSessionManager.getRemainingSeconds(1) : state.r1RemainingSeconds;
      const status = window.TimeglitchSessionManager ? window.TimeglitchSessionManager.getStatus(1) : 'running';
      updateTimerDisplay(1, rem, window.TimeglitchSessionManager ? window.TimeglitchSessionManager.formatTime(rem) : '10:00', status === 'paused');
    } else if (screenName === 'round2') {
      const rem = window.TimeglitchSessionManager ? window.TimeglitchSessionManager.getRemainingSeconds(2) : state.r2RemainingSeconds;
      const status = window.TimeglitchSessionManager ? window.TimeglitchSessionManager.getStatus(2) : 'running';
      updateTimerDisplay(2, rem, window.TimeglitchSessionManager ? window.TimeglitchSessionManager.formatTime(rem) : '10:00', status === 'paused');
    } else {
      if (dom.hudTimer) dom.hudTimer.style.display = 'none';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // -------------------------------------------------------------------------
  // ROUND 1: TIMELINE PUZZLE LOGIC
  // -------------------------------------------------------------------------
  function renderRound1() {
    if (dom.r1AttemptsEl) dom.r1AttemptsEl.textContent = `Attempts: ${state.r1Attempts}`;
    if (dom.r1ScoreEl) dom.r1ScoreEl.style.display = 'none';
    if (dom.r1Alert) dom.r1Alert.style.display = 'none';

    renderDeckAndSlots();
  }

  function renderDeckAndSlots() {
    if (!dom.cardsDeck || !dom.slotsContainer) return;

    dom.cardsDeck.innerHTML = '';
    dom.slotsContainer.innerHTML = '';

    // Render 5 Timeline Slots
    for (let i = 0; i < 5; i++) {
      const slotEl = document.createElement('div');
      slotEl.className = 'tg-timeline-slot';
      slotEl.dataset.slotIndex = i;

      const slotHeader = document.createElement('div');
      slotHeader.className = 'tg-slot-header';
      slotHeader.innerHTML = `<span>SLOT 0${i + 1}</span> <span>POSITION ${i + 1} OF 5</span>`;
      slotEl.appendChild(slotHeader);

      const placedCard = state.placedSlots[i];
      if (placedCard) {
        const cardEl = createCardElement(placedCard, i);
        slotEl.appendChild(cardEl);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'tg-slot-empty-notice';
        placeholder.innerHTML = '<span>⚡ DROP MILESTONE HERE</span><br><span style="font-size:10px; color:#64748b;">(Or click card then click slot)</span>';
        slotEl.appendChild(placeholder);
      }

      // Drag & Drop Listeners for Slot
      slotEl.addEventListener('dragover', handleSlotDragOver);
      slotEl.addEventListener('dragleave', handleSlotDragLeave);
      slotEl.addEventListener('drop', (e) => handleSlotDrop(e, i));

      // Click-to-place alternative
      slotEl.addEventListener('click', (e) => handleSlotClick(e, i));

      dom.slotsContainer.appendChild(slotEl);
    }

    // Render Cards remaining in the Unplaced Deck
    const placedIds = state.placedSlots.filter(Boolean).map(c => c.id);
    const unplacedCards = state.milestones.filter(m => !placedIds.includes(m.id));

    if (unplacedCards.length === 0) {
      const emptyDeck = document.createElement('div');
      emptyDeck.style.cssText = 'color: #94a3b8; font-size: 12px; font-family: var(--tg-font-mono); text-align: center; padding: 12px;';
      emptyDeck.textContent = '✓ All milestones placed in timeline slots. Click Submit Timeline to verify.';
      dom.cardsDeck.appendChild(emptyDeck);
    } else {
      unplacedCards.forEach(cardData => {
        const cardEl = createCardElement(cardData, null);
        dom.cardsDeck.appendChild(cardEl);
      });
    }

    // Update Submit button state
    if (dom.btnSubmitTimeline) {
      const allFilled = state.placedSlots.every(Boolean);
      dom.btnSubmitTimeline.disabled = !allFilled || state.r1Cleared;
    }
  }

  function createCardElement(cardData, slotIndex) {
    const cardEl = document.createElement('div');
    cardEl.className = 'tg-event-card';
    cardEl.draggable = !state.r1Cleared;
    cardEl.dataset.cardId = cardData.id;

    if (state.selectedCardId === cardData.id) {
      cardEl.classList.add('card-selected');
    }

    cardEl.innerHTML = `
      <div class="tg-card-header">
        <span class="tg-card-year">${cardData.year}</span>
        <span class="tg-card-agency">${escapeHtml(cardData.agency)}</span>
      </div>
      <div class="tg-card-title">${escapeHtml(cardData.title)}</div>
      <div class="tg-card-desc">${escapeHtml(cardData.description)}</div>
    `;

    // Drag handlers
    cardEl.addEventListener('dragstart', (e) => {
      if (state.r1Cleared) return;
      cardEl.classList.add('dragging');
      e.dataTransfer.setData('text/plain', JSON.stringify({
        cardId: cardData.id,
        fromSlot: slotIndex
      }));
    });

    cardEl.addEventListener('dragend', () => {
      cardEl.classList.remove('dragging');
    });

    // Click-to-select handler
    cardEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.r1Cleared) return;

      if (state.selectedCardId === cardData.id) {
        state.selectedCardId = null;
      } else {
        state.selectedCardId = cardData.id;
      }
      renderDeckAndSlots();
    });

    return cardEl;
  }

  function handleSlotDragOver(e) {
    e.preventDefault();
    if (state.r1Cleared) return;
    e.currentTarget.classList.add('drag-over');
  }

  function handleSlotDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  function handleSlotDrop(e, targetSlotIndex) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (state.r1Cleared) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const cardId = data.cardId;
      const fromSlot = data.fromSlot;

      moveCardToSlot(cardId, fromSlot, targetSlotIndex);
    } catch (err) {}
  }

  function handleSlotClick(e, slotIndex) {
    if (state.r1Cleared || !state.selectedCardId) return;

    const cardId = state.selectedCardId;
    const fromSlot = state.placedSlots.findIndex(c => c && c.id === cardId);
    moveCardToSlot(cardId, fromSlot !== -1 ? fromSlot : null, slotIndex);
    state.selectedCardId = null;
  }

  function moveCardToSlot(cardId, fromSlotIndex, targetSlotIndex) {
    if (state.r1Cleared || state.r1TimedOut) return;
    const cardData = state.milestones.find(m => m.id === cardId);
    if (!cardData) return;

    const existingCardInTarget = state.placedSlots[targetSlotIndex];

    // If coming from another slot, swap or clear
    if (fromSlotIndex !== null && fromSlotIndex !== undefined) {
      state.placedSlots[fromSlotIndex] = existingCardInTarget;
    }

    state.placedSlots[targetSlotIndex] = cardData;

    clearSlotHighlights();
    renderDeckAndSlots();
    if (window.TimeglitchSessionManager) {
      window.TimeglitchSessionManager.saveRound1Placements(state.placedSlots);
    }
  }

  function resetTimelineCards() {
    if (state.r1Cleared || state.r1TimedOut) return;
    state.placedSlots = [null, null, null, null, null];
    state.selectedCardId = null;
    clearSlotHighlights();
    renderDeckAndSlots();
    if (dom.r1Alert) dom.r1Alert.style.display = 'none';
    if (window.TimeglitchSessionManager) {
      window.TimeglitchSessionManager.saveRound1Placements(state.placedSlots);
    }
  }

  function clearSlotHighlights() {
    if (!dom.slotsContainer) return;
    const slots = dom.slotsContainer.querySelectorAll('.tg-timeline-slot');
    slots.forEach(slot => {
      slot.classList.remove('slot-incorrect', 'slot-correct');
    });
  }

  // -------------------------------------------------------------------------
  // SUBMIT TIMELINE
  // -------------------------------------------------------------------------
  async function submitTimeline() {
    if (state.r1Cleared || state.r1TimedOut) return;

    const placedIds = state.placedSlots.map(c => c ? c.id : null);
    if (placedIds.some(id => !id)) {
      showR1Alert('Please place all 5 historical event cards into the timeline slots.', 'error');
      return;
    }

    if (dom.btnSubmitTimeline) {
      dom.btnSubmitTimeline.disabled = true;
      dom.btnSubmitTimeline.textContent = 'VERIFYING CHRONOLOGY...';
    }

    try {
      const data = await apiFetch('/round1/submit', 'POST', {
        team_id: state.teamName,
        placed_ids: placedIds
      });

      state.r1Attempts = data.attempts;
      if (dom.r1AttemptsEl) dom.r1AttemptsEl.textContent = `Attempts: ${state.r1Attempts}`;

      const slots = dom.slotsContainer.querySelectorAll('.tg-timeline-slot');

      if (data.is_correct) {
        // ROUND 1 CLEARED!
        state.r1Cleared = true;
        state.r1Score = data.round1_score || 0;
        if (dom.r1ScoreEl) dom.r1ScoreEl.style.display = 'none';
        updateScoreHud();

        // Stop Part 1 timer permanently and freeze final remaining time
        if (window.TimeglitchSessionManager) {
          window.TimeglitchSessionManager.stopTimer(1, 'completed');
          window.TimeglitchSessionManager.saveRound1Progress(state.r1Attempts, state.r1Score, true, false);
        }

        // Highlight all green
        slots.forEach(s => {
          s.classList.remove('slot-incorrect');
          s.classList.add('slot-correct');
        });

        showR1Alert(`🎉 ${data.message}`, 'success');

        if (dom.btnSubmitTimeline) {
          dom.btnSubmitTimeline.style.display = 'none';
        }
        if (dom.btnResetTimeline) {
          dom.btnResetTimeline.style.display = 'none';
        }
        if (dom.btnProceedR2) {
          dom.btnProceedR2.style.display = 'inline-flex';
          dom.btnProceedR2.scrollIntoView({ behavior: 'smooth' });
        }

      } else {
        if (window.TimeglitchSessionManager) {
          window.TimeglitchSessionManager.saveRound1Progress(state.r1Attempts, state.r1Score, false, false);
        }

        // Incorrect: Highlight ONLY incorrect slots in RED
        slots.forEach((s, idx) => {
          s.classList.remove('slot-incorrect', 'slot-correct');
          if (data.slot_results && !data.slot_results[idx]) {
            s.classList.add('slot-incorrect');
          } else {
            s.classList.add('slot-correct');
          }
        });

        showR1Alert(`⚠️ ${data.message}`, 'error');

        if (dom.btnSubmitTimeline) {
          dom.btnSubmitTimeline.disabled = false;
          dom.btnSubmitTimeline.textContent = 'SUBMIT TIMELINE';
        }
      }

    } catch (err) {
      showR1Alert(err.message, 'error');
      if (dom.btnSubmitTimeline) {
        dom.btnSubmitTimeline.disabled = false;
        dom.btnSubmitTimeline.textContent = 'SUBMIT TIMELINE';
      }
    }
  }

  function showR1Alert(msg, type = 'error') {
    if (!dom.r1Alert) return;
    dom.r1Alert.className = `tg-alert tg-alert-${type}`;
    dom.r1Alert.textContent = msg;
    dom.r1Alert.style.display = 'block';
  }

  async function handleRound1Timeout(isSilent = false) {
    state.r1TimedOut = true;
    if (window.TimeglitchSessionManager) {
      window.TimeglitchSessionManager.stopTimer(1, 'timed_out');
      window.TimeglitchSessionManager.saveRound1Progress(state.r1Attempts, 0, false, true);
    }
    if (dom.btnSubmitTimeline) dom.btnSubmitTimeline.disabled = true;
    if (dom.btnResetTimeline) dom.btnResetTimeline.disabled = true;

    if (dom.slotsContainer) {
      const cards = dom.slotsContainer.querySelectorAll('.tg-event-card');
      cards.forEach(c => { c.draggable = false; });
    }
    if (dom.cardsDeck) {
      const cards = dom.cardsDeck.querySelectorAll('.tg-event-card');
      cards.forEach(c => { c.draggable = false; });
    }

    showR1Alert('⏱️ TIME EXPIRED! The 10-minute window for Part 1 has elapsed. Timeline submissions are now closed.', 'error');

    if (dom.btnProceedR2) {
      dom.btnProceedR2.style.display = 'inline-flex';
      dom.btnProceedR2.textContent = 'PROCEED TO ROUND 2 (PART 1 TIMED OUT) →';
      dom.btnProceedR2.scrollIntoView({ behavior: 'smooth' });
    }

    if (!isSilent) {
      try {
        await apiFetch('/round1/timeout', 'POST', { team_id: state.teamName });
      } catch (e) {}
    }
  }

  // -------------------------------------------------------------------------
  // ROUND 2: CHRONOS AI & PROMPT ENGINEERING
  // -------------------------------------------------------------------------
  function startRound1Timer() {
    if (window.TimeglitchSessionManager) {
      window.TimeglitchSessionManager.startTimer(1);
    }
  }

  function startRound2Timer() {
    if (window.TimeglitchSessionManager) {
      window.TimeglitchSessionManager.startTimer(2);
    }
  }

  async function sendPrompt() {
    if (!dom.promptInput || state.isFinished || state.r2TimedOut) return;
    const promptText = dom.promptInput.value.trim();
    if (!promptText) return;

    dom.promptInput.disabled = true;
    if (dom.btnSendPrompt) dom.btnSendPrompt.disabled = true;

    // Add user message to UI immediately
    appendChatMessage('user', promptText);

    try {
      const clientRem = window.TimeglitchSessionManager ? window.TimeglitchSessionManager.getRemainingSeconds(2) : state.r2RemainingSeconds;
      const data = await apiFetch('/round2/prompt', 'POST', {
        team_id: state.teamName,
        prompt: promptText,
        client_remaining: clientRem
      });

      state.r2PromptCount = data.prompt_count;
      if (dom.r2PromptCountEl) dom.r2PromptCountEl.textContent = `Prompts: ${state.r2PromptCount}`;

      // Append CHRONOS AI response
      appendChatMessage('ai', data.chronos_reply);

      // Render Prompt Quality Evaluation
      if (data.evaluation) {
        renderEvaluation(data.evaluation);
      }

      // Check for mission completion
      if (data.decoded) {
        state.r2Decoded = true;
        state.r2Score = data.round2_score;
        state.totalScore = data.total_score;
        state.isFinished = true;
        updateScoreHud();

        if (window.TimeglitchSessionManager) {
          window.TimeglitchSessionManager.stopTimer(2, 'completed');
          window.TimeglitchSessionManager.saveRound2Progress(state.r2PromptCount, data.round2_score, true, state.bestQualityScore, data.evaluation, false);
          window.TimeglitchSessionManager.addPromptHistory(state.r2PromptCount, promptText, data.chronos_reply, data.evaluation);
        }

        setTimeout(() => {
          showDebriefModal();
        }, 1200);
      } else {
        if (window.TimeglitchSessionManager) {
          window.TimeglitchSessionManager.saveRound2Progress(state.r2PromptCount, state.r2Score, false, state.bestQualityScore, data.evaluation, false);
          window.TimeglitchSessionManager.addPromptHistory(state.r2PromptCount, promptText, data.chronos_reply, data.evaluation);
        }
      }

      // Reset prompt input
      dom.promptInput.value = '';
      if (dom.charCount) dom.charCount.textContent = '0 / 1000';

    } catch (err) {
      appendChatMessage('ai', `[SYSTEM ERROR] Connection interrupted: ${err.message}`);
    } finally {
      if (!state.isFinished && !state.r2TimedOut) {
        dom.promptInput.disabled = false;
        if (dom.btnSendPrompt) dom.btnSendPrompt.disabled = false;
        dom.promptInput.focus();
      }
    }
  }

  function appendChatMessage(role, text) {
    if (!dom.chatHistory) return;

    const wrap = document.createElement('div');
    wrap.className = `tg-msg ${role}`;

    const author = document.createElement('div');
    author.className = 'tg-msg-author';
    author.textContent = (role === 'user') ? `[ ${state.teamName || 'MISSION OPERATIVE'} ]` : '[ CHRONOS AI ]';

    const bubble = document.createElement('div');
    bubble.className = 'tg-msg-bubble';
    bubble.textContent = text;

    wrap.appendChild(author);
    wrap.appendChild(bubble);
    dom.chatHistory.appendChild(wrap);
    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
  }

  function renderChatHistory() {
    if (!dom.chatHistory) return;
    dom.chatHistory.innerHTML = '';

    if (state.promptHistory && state.promptHistory.length > 0) {
      state.promptHistory.forEach(item => {
        appendChatMessage('user', item.prompt);
        appendChatMessage('ai', item.response);
      });
    } else {
      appendChatMessage('ai', 
        "[CHRONOS AI ONLINE] Mars mission archive terminal initialized.\n" +
        "Damaged transmission packet detected: \"WKH URYHU LV UHDGB\".\n" +
        "Awaiting precise prompt instructions to execute cryptographic deciphering protocol."
      );
    }
  }

  function renderEvaluation(evaluation) {
    // Evaluation is stored internally for admin scoring; no student-visible output
    // All eval DOM elements have been removed from game.html per score-visibility rules
    if (!evaluation) return;
    // Internal state update only — no DOM rendering
  }

  // =========================================================================
  // HINT SYSTEM (Unlocks after 300 seconds of active Part 2 gameplay)
  // =========================================================================
  const HINT_THRESHOLD_SECONDS = 300; // 5 minutes

  function checkHintUnlock() {
    if (!window.TimeglitchSessionManager) return;
    if (window.TimeglitchSessionManager.isHintUnlocked()) {
      showHintArea();
      return;
    }
    const remaining = window.TimeglitchSessionManager.getRemainingSeconds(2);
    const elapsed = 600 - remaining; // PART2_DURATION = 600
    if (elapsed >= HINT_THRESHOLD_SECONDS) {
      window.TimeglitchSessionManager.setHintUnlocked();
      showHintArea();
    }
  }

  function showHintArea() {
    if (!dom.hintArea) return;
    dom.hintArea.style.display = 'block';
    // If already revealed, show content immediately
    if (window.TimeglitchSessionManager && window.TimeglitchSessionManager.isHintRevealed()) {
      if (dom.hintContent) dom.hintContent.style.display = 'block';
      if (dom.hintBtn) dom.hintBtn.style.display = 'none';
    }
  }

  function bindHintButton() {
    if (!dom.hintBtn) return;
    dom.hintBtn.addEventListener('click', function () {
      if (dom.hintContent) dom.hintContent.style.display = 'block';
      dom.hintBtn.style.display = 'none';
      if (window.TimeglitchSessionManager) {
        window.TimeglitchSessionManager.setHintRevealed();
      }
    });
  }

  async function handleRound2Timeout() {
    state.isFinished = true;
    state.r2TimedOut = true;
    if (window.TimeglitchSessionManager) {
      window.TimeglitchSessionManager.stopTimer(2, 'timed_out');
      window.TimeglitchSessionManager.saveRound2Progress(state.r2PromptCount, state.r2Score, false, state.bestQualityScore, state.lastEvaluation, true);
    }
    if (dom.promptInput) dom.promptInput.disabled = true;
    if (dom.btnSendPrompt) dom.btnSendPrompt.disabled = true;

    appendChatMessage('ai', '[CHRONOS AI] TIME EXPIRED: The 10-minute decryption window has closed. Cryptographic channel terminated.');

    try {
      const data = await apiFetch('/round2/timeout', 'POST', { team_id: state.teamName });
      state.r1Score = data.round1_score || state.r1Score;
      state.r2Score = data.round2_score || 0;
      state.totalScore = data.total_score || state.r1Score;
    } catch (e) {}

    showDebriefModal();
  }

  // -------------------------------------------------------------------------
  // DEBRIEF MODAL / MISSION COMPLETE
  // -------------------------------------------------------------------------
  function showDebriefModal() {
    if (!dom.modalDebrief) return;

    // Student debrief shows mission completion outcomes; numerical scores restricted to admin
    if (dom.debriefR1Score) {
      dom.debriefR1Score.innerHTML = state.r1Cleared || (state.r1Score && state.r1Score > 0)
        ? '<span style="color:var(--tg-green)">RESTORED</span>'
        : '<span style="color:var(--tg-amber)">INCOMPLETE</span>';
    }
    if (dom.debriefR2Score) {
      dom.debriefR2Score.innerHTML = state.r2Decoded
        ? '<span style="color:var(--tg-green)">DECODED</span>'
        : '<span style="color:var(--tg-amber)">UNRECOVERED</span>';
    }
    if (dom.debriefTotalScore) {
      dom.debriefTotalScore.innerHTML = state.r2Decoded
        ? '<span style="color:var(--tg-green)">CLEARED</span>'
        : (state.r1Cleared ? '<span style="color:var(--tg-cyan)">PARTIAL</span>' : '<span style="color:var(--tg-amber)">LOGGED</span>');
    }

    if (dom.debriefDecodedMsg) {
      if (state.r2Decoded) {
        dom.debriefDecodedMsg.innerHTML = `<span style="color:var(--tg-green); font-weight:700;">"${TARGET_DECODED}"</span> (Restored)`;
      } else {
        dom.debriefDecodedMsg.innerHTML = `<span style="color:var(--tg-red);">Transmission Unrecovered</span> (Time Expired)`;
      }
    }

    if (dom.debriefTitle) {
      dom.debriefTitle.textContent = state.r2Decoded ? 'MISSION ACCOMPLISHED' : 'MISSION CONCLUDED';
    }

    dom.modalDebrief.style.display = 'flex';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  // Auto-run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
