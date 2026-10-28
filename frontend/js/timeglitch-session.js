/**
 * timeglitch-session.js -- Resilient Session, State & Timer Manager for TIMEGLITCH
 * Station 1: Space Exploration, AI, Cryptography & Prompt Engineering Challenge
 * Aarohan '26
 *
 * Implements:
 *   - Two independent 10-minute timers (Part 1 and Part 2: 10:00 each)
 *   - Automatic pause when leaving the game (tab switch, window blur, navigation, refresh, close)
 *   - Resumption from exact remaining duration without deducting paused time
 *   - Timestamp-based elapsed timing resistant to browser throttling
 *   - Complete game state persistence (card placements, attempts, scores, chat history, evaluations)
 *   - Team and session isolation
 *   - Multi-tab synchronization and duplicate interval prevention
 */

(function (window) {
  'use strict';

  const STORAGE_PREFIX = 'timeglitch_state_';
  const ACTIVE_TAB_PREFIX = 'timeglitch_activetab_';
  const BROADCAST_CHANNEL_NAME = 'timeglitch_channel';
  const PART1_DURATION = 600; // 10 minutes in seconds
  const PART2_DURATION = 600; // 10 minutes in seconds

  const tabId = 'tab_' + Math.random().toString(36).substring(2, 9);
  let broadcastChannel = null;
  try {
    if (typeof window.BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    }
  } catch (e) {
    broadcastChannel = null;
  }

  // Active runtime timing variables
  let activePart = null; // 1 | 2 | null
  let timerInterval = null;
  let segmentStartTime = null;
  let segmentStartRemaining = 0;
  let isWindowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  let isDocumentVisible = !document.hidden;
  let isGameActive = false; // true when on round1 or round2 screen
  let lastSavedSec = -1;
  let lastSyncBackendTime = 0;

  // Registered UI Callbacks
  const callbacks = {
    onTimerTick: null,    // (partNum, remainingSec, formattedText) => {}
    onTimerPause: null,   // (partNum, remainingSec, formattedText) => {}
    onTimerResume: null,  // (partNum, remainingSec, formattedText) => {}
    onTimerStop: null,    // (partNum, remainingSec, status) => {}
    onTimerTimeout: null, // (partNum) => {}
    onExternalStateSync: null // (newState) => {}
  };

  // Default clean state template
  function createDefaultState(teamName = '', teamId = '', sessionId = '') {
    return {
      teamName: teamName.trim().toUpperCase(),
      teamId: teamId || '',
      sessionId: sessionId || '',
      currentScreen: 'entry', // 'entry' | 'round1' | 'round2'
      round1: {
        remainingSeconds: PART1_DURATION,
        elapsedSeconds: 0,
        status: 'not_started', // 'not_started' | 'running' | 'paused' | 'completed' | 'timed_out'
        attempts: 0,
        score: 0,
        completed: false,
        timedOut: false,
        placedSlots: [null, null, null, null, null],
        slotResults: null,
        selectedCardId: null
      },
      round2: {
        remainingSeconds: PART2_DURATION,
        elapsedSeconds: 0,
        status: 'not_started', // 'not_started' | 'running' | 'paused' | 'completed' | 'timed_out'
        promptCount: 0,
        score: 0,
        completed: false,
        decoded: false,
        timedOut: false,
        bestQualityScore: 0,
        qualityMarks: 0,
        promptHistory: [],
        lastEvaluation: null,
        hintUnlocked: false,
        hintRevealed: false
      },
      totalScore: 0,
      isFinished: false,
      lastUpdated: Date.now()
    };
  }

  let currentState = null;

  function getStorageKey(teamName) {
    if (!teamName) return null;
    return STORAGE_PREFIX + teamName.trim().toUpperCase();
  }

  function getActiveTabKey(teamName) {
    if (!teamName) return null;
    return ACTIVE_TAB_PREFIX + teamName.trim().toUpperCase();
  }

  // ---------------------------------------------------------------------------
  // FORMATTING HELPER
  // ---------------------------------------------------------------------------
  function formatTime(totalSeconds) {
    if (typeof totalSeconds !== 'number' || isNaN(totalSeconds) || totalSeconds < 0) {
      totalSeconds = 0;
    }
    const clamped = Math.max(0, Math.ceil(totalSeconds));
    const m = Math.floor(clamped / 60).toString().padStart(2, '0');
    const s = (clamped % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // ---------------------------------------------------------------------------
  // STATE PERSISTENCE (LOCALSTORAGE)
  // ---------------------------------------------------------------------------
  function saveStateToStorage(state) {
    if (!state || !state.teamName) return;
    const key = getStorageKey(state.teamName);
    if (!key) return;

    state.lastUpdated = Date.now();
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn('[TIMEGLITCH] LocalStorage save error:', e);
    }
  }

  function loadStateFromStorage(teamName) {
    if (!teamName) return null;
    const key = getStorageKey(teamName);
    if (!key) return null;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Ensure state schema completeness
      const def = createDefaultState(teamName);
      return {
        ...def,
        ...parsed,
        round1: { ...def.round1, ...(parsed.round1 || {}) },
        round2: { ...def.round2, ...(parsed.round2 || {}) }
      };
    } catch (e) {
      console.warn('[TIMEGLITCH] LocalStorage load error:', e);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // MULTI-TAB COORDINATION
  // ---------------------------------------------------------------------------
  function claimTabLeadership() {
    if (!currentState || !currentState.teamName) return;
    try {
      localStorage.setItem(getActiveTabKey(currentState.teamName), JSON.stringify({
        tabId,
        timestamp: Date.now()
      }));
    } catch (e) {}
  }

  function isCurrentTabLeader() {
    if (!currentState || !currentState.teamName) return true;
    try {
      const raw = localStorage.getItem(getActiveTabKey(currentState.teamName));
      if (!raw) return true;
      const info = JSON.parse(raw);
      // If claimed by another tab within last 3 seconds
      if (info && info.tabId && info.tabId !== tabId && (Date.now() - info.timestamp < 4000)) {
        return false;
      }
    } catch (e) {}
    return true;
  }

  function broadcast(type, payload = {}) {
    const msg = {
      type,
      senderTabId: tabId,
      teamName: currentState ? currentState.teamName : null,
      timestamp: Date.now(),
      ...payload
    };

    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage(msg);
      } catch (e) {}
    }
  }

  // Handle incoming broadcast messages from other tabs
  if (broadcastChannel) {
    broadcastChannel.onmessage = function (ev) {
      handleBusMessage(ev.data);
    };
  }

  // Fallback storage listener for cross-tab sync
  window.addEventListener('storage', function (e) {
    if (!currentState || !currentState.teamName) return;
    const key = getStorageKey(currentState.teamName);
    if (e.key === key && e.newValue) {
      try {
        const remoteState = JSON.parse(e.newValue);
        if (remoteState && remoteState.lastUpdated > (currentState.lastUpdated || 0)) {
          handleRemoteStateUpdate(remoteState);
        }
      } catch (err) {}
    }
  });

  function handleBusMessage(msg) {
    if (!msg || !currentState || msg.senderTabId === tabId) return;
    if (msg.teamName && msg.teamName !== currentState.teamName) return;

    if (msg.type === 'TICK') {
      const partNum = msg.partNum;
      const partKey = `round${partNum}`;
      if (currentState[partKey]) {
        currentState[partKey].remainingSeconds = msg.remainingSeconds;
        if (callbacks.onTimerTick) {
          callbacks.onTimerTick(partNum, msg.remainingSeconds, formatTime(msg.remainingSeconds));
        }
      }
    } else if (msg.type === 'PAUSE') {
      const partNum = msg.partNum;
      const partKey = `round${partNum}`;
      if (currentState[partKey] && currentState[partKey].status === 'running') {
        currentState[partKey].status = 'paused';
        currentState[partKey].remainingSeconds = msg.remainingSeconds;
        if (callbacks.onTimerPause) {
          callbacks.onTimerPause(partNum, msg.remainingSeconds, formatTime(msg.remainingSeconds));
        }
      }
    } else if (msg.type === 'CLAIM_LEADER') {
      // Another tab became active, pause our local interval so we don't double-count
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        segmentStartTime = null;
      }
    } else if (msg.type === 'STATE_SYNC') {
      if (msg.state) {
        handleRemoteStateUpdate(msg.state);
      }
    }
  }

  function handleRemoteStateUpdate(remoteState) {
    if (!currentState) return;
    currentState = remoteState;
    if (callbacks.onExternalStateSync) {
      callbacks.onExternalStateSync(currentState);
    }
  }

  // ---------------------------------------------------------------------------
  // TIMING ENGINE (TIMESTAMP-BASED ACCURATE TICKS)
  // ---------------------------------------------------------------------------
  function tick() {
    if (!activePart || !currentState) return;
    const partKey = `round${activePart}`;
    const partData = currentState[partKey];
    if (!partData || partData.status !== 'running') {
      stopInterval();
      return;
    }

    if (!segmentStartTime) {
      segmentStartTime = Date.now();
      segmentStartRemaining = partData.remainingSeconds;
    }

    const now = Date.now();
    const elapsedInSegment = (now - segmentStartTime) / 1000.0;
    const currentRemaining = Math.max(0, segmentStartRemaining - elapsedInSegment);

    partData.remainingSeconds = currentRemaining;
    const formatted = formatTime(currentRemaining);

    // Notify UI
    if (callbacks.onTimerTick) {
      callbacks.onTimerTick(activePart, currentRemaining, formatted);
    }

    // Broadcast tick to other tabs (throttled)
    const wholeSec = Math.floor(currentRemaining);
    if (wholeSec !== lastSavedSec) {
      lastSavedSec = wholeSec;
      claimTabLeadership();
      saveStateToStorage(currentState);
      broadcast('TICK', { partNum: activePart, remainingSeconds: currentRemaining });

      // Periodically sync with server (every 5 seconds)
      if (now - lastSyncBackendTime > 5000) {
        lastSyncBackendTime = now;
        syncBackend();
      }
    }

    // Check expiry
    if (currentRemaining <= 0) {
      handlePartTimeout(activePart);
    }
  }

  function startInterval() {
    stopInterval();
    segmentStartTime = Date.now();
    const partKey = `round${activePart}`;
    segmentStartRemaining = currentState ? currentState[partKey].remainingSeconds : 0;
    claimTabLeadership();
    timerInterval = setInterval(tick, 200);
  }

  function stopInterval() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    segmentStartTime = null;
  }

  function handlePartTimeout(partNum) {
    stopInterval();
    if (!currentState) return;
    const partKey = `round${partNum}`;
    const partData = currentState[partKey];

    partData.remainingSeconds = 0;
    partData.status = 'timed_out';
    partData.timedOut = true;

    saveStateToStorage(currentState);
    broadcast('STATE_SYNC', { state: currentState });

    if (callbacks.onTimerTick) {
      callbacks.onTimerTick(partNum, 0, '00:00');
    }
    if (callbacks.onTimerTimeout) {
      callbacks.onTimerTimeout(partNum);
    }

    syncBackend();
  }

  // ---------------------------------------------------------------------------
  // PUBLIC TIMER CONTROL METHODS
  // ---------------------------------------------------------------------------
  function startTimer(partNum) {
    if (!currentState) return;
    const partKey = `round${partNum}`;
    const partData = currentState[partKey];
    if (!partData) return;

    // Completed or timed out timers can never restart
    if (partData.status === 'completed' || partData.status === 'timed_out' || partData.remainingSeconds <= 0) {
      return;
    }

    activePart = partNum;
    partData.status = 'running';

    // If game is active and tab is focused, run ticks immediately
    if (isGameActive && isDocumentVisible && isWindowFocused) {
      startInterval();
      const formatted = formatTime(partData.remainingSeconds);
      if (callbacks.onTimerResume) {
        callbacks.onTimerResume(partNum, partData.remainingSeconds, formatted);
      }
    } else {
      // Otherwise initialize in paused state waiting for active focus
      partData.status = 'paused';
      stopInterval();
      const formatted = formatTime(partData.remainingSeconds);
      if (callbacks.onTimerPause) {
        callbacks.onTimerPause(partNum, partData.remainingSeconds, formatted);
      }
    }

    saveStateToStorage(currentState);
    broadcast('CLAIM_LEADER');
  }

  function pauseTimer(partNum = null) {
    const targetPart = partNum || activePart;
    if (!targetPart || !currentState) return;

    const partKey = `round${targetPart}`;
    const partData = currentState[partKey];
    if (!partData) return;

    // Do not pause completed or expired timers
    if (partData.status === 'completed' || partData.status === 'timed_out') {
      return;
    }

    // Freeze elapsed calculation
    if (segmentStartTime) {
      const now = Date.now();
      const elapsedInSegment = (now - segmentStartTime) / 1000.0;
      partData.remainingSeconds = Math.max(0, segmentStartRemaining - elapsedInSegment);
      partData.elapsedSeconds = (partData.elapsedSeconds || 0) + elapsedInSegment;
    }

    stopInterval();
    partData.status = 'paused';

    const formatted = formatTime(partData.remainingSeconds);
    saveStateToStorage(currentState);
    broadcast('PAUSE', { partNum: targetPart, remainingSeconds: partData.remainingSeconds });

    if (callbacks.onTimerPause) {
      callbacks.onTimerPause(targetPart, partData.remainingSeconds, formatted);
    }
  }

  function resumeTimer(partNum = null) {
    const targetPart = partNum || activePart;
    if (!targetPart || !currentState) return;

    const partKey = `round${targetPart}`;
    const partData = currentState[partKey];
    if (!partData) return;

    // Cannot resume completed or timed out timers
    if (partData.status === 'completed' || partData.status === 'timed_out' || partData.remainingSeconds <= 0) {
      return;
    }

    // Only resume if tab is visible and focused and active in game
    if (!isGameActive || !isDocumentVisible || !isWindowFocused) {
      return;
    }

    activePart = targetPart;
    partData.status = 'running';

    startInterval();
    const formatted = formatTime(partData.remainingSeconds);
    saveStateToStorage(currentState);
    broadcast('CLAIM_LEADER');

    if (callbacks.onTimerResume) {
      callbacks.onTimerResume(targetPart, partData.remainingSeconds, formatted);
    }
  }

  function stopTimer(partNum, finalStatus = 'completed') {
    if (!partNum || !currentState) return;
    const partKey = `round${partNum}`;
    const partData = currentState[partKey];
    if (!partData) return;

    if (segmentStartTime && activePart === partNum) {
      const now = Date.now();
      const elapsedInSegment = (now - segmentStartTime) / 1000.0;
      partData.remainingSeconds = Math.max(0, segmentStartRemaining - elapsedInSegment);
      partData.elapsedSeconds = (partData.elapsedSeconds || 0) + elapsedInSegment;
    }

    stopInterval();
    partData.status = finalStatus;
    if (finalStatus === 'completed') {
      partData.completed = true;
    } else if (finalStatus === 'timed_out') {
      partData.timedOut = true;
      partData.remainingSeconds = 0;
    }

    if (activePart === partNum) {
      activePart = null;
    }

    saveStateToStorage(currentState);
    broadcast('STATE_SYNC', { state: currentState });

    if (callbacks.onTimerStop) {
      callbacks.onTimerStop(partNum, partData.remainingSeconds, finalStatus);
    }

    syncBackend();
  }

  // ---------------------------------------------------------------------------
  // LEAVING / RETURNING EVENT LISTENERS
  // ---------------------------------------------------------------------------
  function onVisibilityChange() {
    isDocumentVisible = !document.hidden;

    if (document.hidden) {
      // Tab hidden -> Immediately pause
      if (activePart && currentState) {
        pauseTimer(activePart);
      }
    } else {
      // Tab visible -> If window has focus, resume
      if (isWindowFocused && isGameActive && activePart && currentState) {
        resumeTimer(activePart);
      }
    }
  }

  function onWindowBlur() {
    isWindowFocused = false;
    // Window lost focus -> Pause immediately
    if (activePart && currentState) {
      pauseTimer(activePart);
    }
  }

  function onWindowFocus() {
    isWindowFocused = true;
    // Window gained focus -> If visible and on active game screen, resume
    if (isDocumentVisible && isGameActive && activePart && currentState) {
      resumeTimer(activePart);
    }
  }

  function onPageLeave() {
    if (activePart && currentState) {
      pauseTimer(activePart);
    }
    if (currentState) {
      saveStateToStorage(currentState);
      syncBackend(true);
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
  window.addEventListener('beforeunload', onPageLeave);
  window.addEventListener('pagehide', onPageLeave);

  // Intercept navigation clicks to guarantee state preservation
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a');
    if (link && link.href && !link.target && !link.href.startsWith('javascript:')) {
      onPageLeave();
    }
  }, true);

  // ---------------------------------------------------------------------------
  // BACKEND SYNCHRONIZATION
  // ---------------------------------------------------------------------------
  function syncBackend(isBeacon = false) {
    if (!currentState || !currentState.teamName) return;

    const payload = {
      team_id: currentState.teamName,
      team_name: currentState.teamName,
      session_id: currentState.sessionId,
      round1_remaining: currentState.round1.remainingSeconds,
      round1_elapsed: currentState.round1.elapsedSeconds,
      round1_status: currentState.round1.status,
      placed_ids: currentState.round1.placedSlots.map(c => (c ? c.id : null)),
      round2_remaining: currentState.round2.remainingSeconds,
      round2_elapsed: currentState.round2.elapsedSeconds,
      round2_status: currentState.round2.status,
      current_screen: currentState.currentScreen
    };

    if (isBeacon && typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/tg/session/sync', blob);
        return;
      } catch (e) {}
    }

    if (typeof fetch === 'function') {
      fetch('/api/tg/session/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {
        // Offline or server down: localStorage is already up to date
      });
    }
  }

  // ---------------------------------------------------------------------------
  // EXPOSED PUBLIC API
  // ---------------------------------------------------------------------------
  window.TimeglitchSessionManager = {
    PART1_DURATION,
    PART2_DURATION,

    init: function (userCallbacks = {}) {
      Object.assign(callbacks, userCallbacks);
    },

    setTeam: function (teamName, teamId = '', sessionId = '') {
      if (!teamName) return;
      const cleanName = teamName.trim().toUpperCase();

      // Check existing storage
      let existing = loadStateFromStorage(cleanName);
      if (!existing) {
        existing = createDefaultState(cleanName, teamId, sessionId);
      } else {
        if (teamId) existing.teamId = teamId;
        if (sessionId) existing.sessionId = sessionId;
      }

      currentState = existing;
      saveStateToStorage(currentState);

      // Save to sessionStorage for active team retrieval
      try {
        sessionStorage.setItem('aarohan_current_team', cleanName);
        if (teamId) sessionStorage.setItem('aarohan_current_team_id', teamId);
      } catch (e) {}

      return currentState;
    },

    getState: function () {
      return currentState;
    },

    saveState: function () {
      if (currentState) {
        saveStateToStorage(currentState);
      }
    },

    loadState: function (teamName) {
      if (!teamName) return null;
      currentState = loadStateFromStorage(teamName);
      return currentState;
    },

    setCurrentScreen: function (screenName) {
      if (!currentState) return;
      currentState.currentScreen = screenName;
      isGameActive = (screenName === 'round1' || screenName === 'round2');

      if (screenName === 'round1') {
        activePart = 1;
      } else if (screenName === 'round2') {
        activePart = 2;
      } else {
        // entry or modal
        if (timerInterval) {
          pauseTimer(activePart);
        }
        activePart = null;
      }
      saveStateToStorage(currentState);
    },

    setGameActive: function (active) {
      isGameActive = Boolean(active);
    },

    // Timer Controls
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,

    getRemainingSeconds: function (partNum) {
      if (!currentState) return partNum === 1 ? PART1_DURATION : PART2_DURATION;
      const partKey = `round${partNum}`;
      return currentState[partKey] ? currentState[partKey].remainingSeconds : 0;
    },

    setRemainingSeconds: function (partNum, seconds) {
      if (!currentState) return;
      const partKey = `round${partNum}`;
      const partData = currentState[partKey];
      if (!partData) return;
      partData.remainingSeconds = Math.max(0, seconds);
      segmentStartRemaining = partData.remainingSeconds;
      segmentStartTime = Date.now();
      saveStateToStorage(currentState);
    },

    getStatus: function (partNum) {
      if (!currentState) return 'not_started';
      const partKey = `round${partNum}`;
      return currentState[partKey] ? currentState[partKey].status : 'not_started';
    },

    formatTime,

    // Part 1 State Helpers
    saveRound1Placements: function (placedSlots, slotResults = null) {
      if (!currentState) return;
      currentState.round1.placedSlots = Array.isArray(placedSlots) ? [...placedSlots] : [null, null, null, null, null];
      if (slotResults !== null) {
        currentState.round1.slotResults = slotResults;
      }
      saveStateToStorage(currentState);
      broadcast('STATE_SYNC', { state: currentState });
      syncBackend();
    },

    saveRound1Progress: function (attempts, score, completed, timedOut = false) {
      if (!currentState) return;
      currentState.round1.attempts = attempts;
      // Client score is sanitized; official scoring calculated & stored on backend for admin only
      currentState.round1.score = 0;
      currentState.round1.completed = completed;
      currentState.round1.timedOut = timedOut;
      if (completed) {
        currentState.round1.status = 'completed';
      } else if (timedOut) {
        currentState.round1.status = 'timed_out';
      }
      saveStateToStorage(currentState);
      broadcast('STATE_SYNC', { state: currentState });
      syncBackend();
    },

    // Part 2 State Helpers
    saveRound2Progress: function (promptCount, score, decoded, bestQuality, lastEvaluation, timedOut = false) {
      if (!currentState) return;
      currentState.round2.promptCount = promptCount;
      // Client score is sanitized; official scoring calculated & stored on backend for admin only
      currentState.round2.score = 0;
      currentState.round2.decoded = decoded;
      currentState.round2.bestQualityScore = 0;
      currentState.round2.qualityMarks = 0;
      currentState.round2.lastEvaluation = lastEvaluation;
      currentState.round2.timedOut = timedOut;

      if (decoded) {
        currentState.round2.completed = true;
        currentState.round2.status = 'completed';
        currentState.isFinished = true;
        currentState.totalScore = 0;
      } else if (timedOut) {
        currentState.round2.completed = true;
        currentState.round2.status = 'timed_out';
        currentState.isFinished = true;
        currentState.totalScore = 0;
      }

      saveStateToStorage(currentState);
      broadcast('STATE_SYNC', { state: currentState });
      syncBackend();
    },

    addPromptHistory: function (turn, prompt, response, evaluation) {
      if (!currentState) return;
      currentState.round2.promptHistory.push({
        turn,
        prompt,
        response,
        evaluation,
        timestamp: new Date().toISOString()
      });
      saveStateToStorage(currentState);
      broadcast('STATE_SYNC', { state: currentState });
    },

    syncBackend,

    // ------------------- Hint System API -------------------
    setHintUnlocked: function () {
        if (!currentState) return;
        currentState.round2.hintUnlocked = true;
        saveStateToStorage(currentState);
    },
    setHintRevealed: function () {
        if (!currentState) return;
        currentState.round2.hintRevealed = true;
        saveStateToStorage(currentState);
    },
    isHintUnlocked: function () {
        return currentState ? !!currentState.round2.hintUnlocked : false;
    },
    isHintRevealed: function () {
        return currentState ? !!currentState.round2.hintRevealed : false;
    }
  };

})(window);
