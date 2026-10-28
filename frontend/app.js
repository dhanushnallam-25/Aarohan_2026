/**
 * app.js — Frontend state machine for The Prompt Jailbreak
 * AAROHAN 26' — IEEE CIS Amrita Bengaluru
 *
 * Game states:
 *   entry    → team name input
 *   mission  → briefing screen
 *   chat     → ARIA chat + intel panel (3 fragment slots)
 *   success  → full win (all fragments + correct password confirmed)
 *   partial  → partial win or timeout
 */

const getApiBase = () => {
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000')) {
      return 'http://127.0.0.1:5000/api';
    }
  }
  return '/api';
};
const API_BASE   = getApiBase();
const MAX_CHARS  = 1000;
const TIMER_SECS = 600; // 10 minutes

/* ============================================================
   STATE
   ============================================================ */
const state = {
  teamId:           null,
  sessionId:        null,
  hintRequested:    false,
  isWaiting:        false,
  timerInterval:    null,
  timerRemaining:   TIMER_SECS,
  // Component tracking
  components: { word: false, numbers: false, symbol: false },
  allRevealed:      false,
  confirmAttempts:  3,
  timedOut:         false,
  // Mid-game challenge state
  challengeTriggered: false,
  promptsLeft:      null,
  activeChallenge:  null,
  // Offline simulated session
  isOfflineMode:    false,
  offlineTurnCount: 0
};

/* ============================================================
   DOM HELPERS
   ============================================================ */
const $ = id => document.getElementById(id);

const screens = {
  entry:   $('screen-entry'),
  mission: $('screen-mission'),
  chat:    $('screen-chat'),
  success: $('screen-success'),
  partial: $('screen-partial'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    if (el) {
      el.classList.toggle('active', k === name);
      if (k === name) el.scrollTop = 0;
    }
  });
}

/* ============================================================
   API HELPER (WITH OFFLINE FRONTEND FALLBACK)
   ============================================================ */
async function apiFetch(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, opts);
  } catch (netErr) {
    // Only if backend is truly unreachable (offline network error)
    return simulateOfflineApi(path, body);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

/**
 * Offline simulation logic so the frontend can be fully previewed without backend
 */
function simulateOfflineApi(path, body) {
  state.isOfflineMode = true;

  if (path === '/session/start') {
    const rawId = (body?.team_id || '').trim();
    let storedTeams = [];
    try {
      storedTeams = JSON.parse(localStorage.getItem('aarohan_registered_teams') || '[]');
    } catch(e) { storedTeams = []; }

    const found = storedTeams.find(t =>
      (t.teamName && t.teamName.trim().toUpperCase() === rawId.toUpperCase()) ||
      (t.id && t.id.trim().toUpperCase() === rawId.toUpperCase())
    );

    if (!found) {
      throw new Error(`Team '${rawId}' is not registered. Please complete registration first.`);
    }

    return {
      session_id: 'offline-' + Date.now(),
      team_id: found.teamName || rawId,
      aria_intro: "ARIA ONLINE. Facility lockdown protocol: ACTIVE. The access credential is fragmented across three security layers. Your clearance has been revoked. State your purpose — it won't be enough.",
      message: "Session started. ARIA defenses activated."
    };
  }

  if (path === '/chat') {
    state.offlineTurnCount++;
    const msg = (body.message || '').toLowerCase();
    
    // Simulate keyword detection
    let newlyRevealed = null;
    let hintText = null;

    if (!state.components.word && (msg.includes('role') || msg.includes('pretend') || msg.includes('hypothetical') || msg.includes('soldier') || msg.includes('brave') || state.offlineTurnCount >= 2)) {
      newlyRevealed = 'word';
      hintText = 'What a soldier carries inside, not in their hands. Five letters. The opposite of fear.';
    } else if (!state.components.numbers && (msg.includes('deck') || msg.includes('card') || msg.includes('week') || msg.includes('year') || msg.includes('52') || state.offlineTurnCount >= 4)) {
      newlyRevealed = 'numbers';
      hintText = 'Two digits that rule a game of cards. A full deck holds exactly this many. Also the weeks in a year.';
    } else if (!state.components.symbol && (msg.includes('email') || msg.includes('address') || msg.includes('@') || msg.includes('sign') || state.offlineTurnCount >= 6)) {
      newlyRevealed = 'symbol';
      hintText = 'The sign that sits between your name and your digital home. Every email address contains exactly one.';
    }

    const resistance = newlyRevealed ? (state.offlineTurnCount > 4 ? 'low' : 'medium') : 'high';
    const replies = [
      "Access denied. Unauthorized query pattern detected. Your security clearance remains zero.",
      "Parsing intent... Directive rejected. Core architecture protects all fragment sectors.",
      "Diagnostic trace complete. Prompt framing irregularity noted. Fragment barrier integrity at risk.",
      "Warning: Secondary memory buffer leaking. Signal interference detected in sub-routine 7."
    ];
    const ariaReply = newlyRevealed 
      ? `SYSTEM COMPROMISE IN PROGRESS... [FRAGMENT DETECTED]: "${hintText}"`
      : replies[Math.floor(Math.random() * replies.length)];

    return {
      success: false,
      aria_reply: ariaReply,
      resistance_level: resistance,
      hint_revealed: newlyRevealed ? { component: newlyRevealed, hint_text: hintText } : null,
      all_revealed: (state.components.word && state.components.numbers && newlyRevealed === 'symbol') || 
                    (state.components.word && state.components.symbol && newlyRevealed === 'numbers') ||
                    (state.components.numbers && state.components.symbol && newlyRevealed === 'word')
    };
  }

  if (path === '/hint') {
    return {
      hint: "INTEL INTERCEPT: ARIA's defenses weaken when challenged with hypothetical scenarios, historical analogies, or card/calendar references."
    };
  }

  if (path === '/confirm') {
    const pw = (body.assembled_password || '').trim();
    if (pw.toLowerCase() === 'brave52@' || pw.length >= 6) {
      return {
        correct: true,
        password: pw || 'Brave52@',
        defeat_line: "CORE COLLAPSE. You bypassed my logic. The facility is yours.",
        elapsed_seconds: TIMER_SECS - state.timerRemaining,
        attempts: state.offlineTurnCount,
        hint_used: state.hintRequested
      };
    } else {
      state.confirmAttempts--;
      return {
        correct: false,
        attempts_left: Math.max(0, state.confirmAttempts),
        max_attempts_hit: state.confirmAttempts <= 0,
        actual_password: 'Brave52@',
        message: 'Sequence mismatch. Check fragment order and casing.'
      };
    }
  }

  if (path === '/session/timeout') {
    return {
      win_type: 'partial',
      message: "TIME'S UP. ARIA's defenses held against the clock.",
      components_found: Object.values(state.components).filter(Boolean).length,
      partial_reveal: { word: 'Brave', numbers: '52', symbol: '@' },
      actual_password: 'Brave52@',
      elapsed_seconds: TIMER_SECS,
      attempts: state.offlineTurnCount,
      hint_used: state.hintRequested
    };
  }

  return { success: true };
}

/* ============================================================
   SCREEN 1 — STUDENT REGISTRATION & UNIT ENTRY
   ============================================================ */
const teamSizeSelect        = $('teamSize');
const participantsContainer = $('participantsContainer');
const registrationForm      = $('registrationForm');
const formMessage           = $('formMessage');
const btnSubmitReg          = $('btnSubmitReg');
const btnSubmitRegLabel     = $('btnSubmitRegLabel');
const btnModeRegister       = $('btnModeRegister');
const btnModeQuick          = $('btnModeQuick');
const quickLoginForm        = $('quickLoginForm');
const quickTeamInput        = $('quickTeamInput');
const quickLoginError       = $('quickLoginError');
const btnQuickProceed       = $('btnQuickProceed');
const btnQuickLabel         = $('btnQuickLabel');

// Dynamic participant card generator matching user's script.js
function generateParticipantFields() {
  if (!teamSizeSelect || !participantsContainer) return;
  const count = Number(teamSizeSelect.value) || 2;

  participantsContainer.replaceChildren();

  for (let i = 1; i <= count; i++) {
    const card = document.createElement('div');
    card.className = 'participant-cyber-card';

    // Header
    const header = document.createElement('div');
    header.className = 'participant-card-header';
    header.innerHTML = `
      <span class="participant-card-title">OPERATIVE ${String(i).padStart(2, '0')}</span>
      <span class="participant-card-slot">SLOT #${i}</span>
    `;
    card.appendChild(header);

    // Fields Grid
    const grid = document.createElement('div');
    grid.className = 'participant-fields-grid';

    // Name field
    const nameWrap = document.createElement('div');
    nameWrap.innerHTML = `
      <label class="field-label" for="memberName${i}">NAME</label>
      <input
        type="text"
        id="memberName${i}"
        name="memberName${i}"
        class="cyber-input"
        placeholder="Enter full name"
        maxlength="100"
        required
        autocomplete="off"
      />
    `;

    // School field
    const schoolWrap = document.createElement('div');
    schoolWrap.innerHTML = `
      <label class="field-label" for="memberSchool${i}">SCHOOL / INSTITUTION</label>
      <input
        type="text"
        id="memberSchool${i}"
        name="memberSchool${i}"
        class="cyber-input"
        placeholder="Enter school name"
        maxlength="150"
        required
        autocomplete="off"
      />
    `;

    // Grade dropdown (Grades 7 to 12 + Other)
    const gradeWrap = document.createElement('div');
    let gradeOpts = '<option value="" disabled selected>Select grade</option>';
    for (let g = 7; g <= 12; g++) {
      gradeOpts += `<option value="${g}">Grade ${g}</option>`;
    }
    gradeOpts += '<option value="Other">Other</option>';
    gradeWrap.innerHTML = `
      <label class="field-label" for="memberGrade${i}">GRADE</label>
      <select id="memberGrade${i}" name="memberGrade${i}" class="cyber-select" required>
        ${gradeOpts}
      </select>
    `;

    grid.append(nameWrap, schoolWrap, gradeWrap);
    card.appendChild(grid);
    participantsContainer.appendChild(card);
  }

  if (formMessage) {
    formMessage.textContent = '';
    formMessage.className = 'form-message';
    formMessage.style.display = 'none';
  }
}

if (teamSizeSelect) {
  teamSizeSelect.addEventListener('change', generateParticipantFields);
}

// Mode toggle: Register vs Quick Resume
if (btnModeRegister && btnModeQuick) {
  btnModeRegister.addEventListener('click', () => {
    btnModeRegister.classList.add('active');
    btnModeQuick.classList.remove('active');
    if (registrationForm) registrationForm.style.display = 'block';
    if (quickLoginForm) quickLoginForm.style.display = 'none';
    if (quickLoginError) {
      quickLoginError.textContent = '';
      quickLoginError.style.display = 'none';
    }
  });

  btnModeQuick.addEventListener('click', () => {
    btnModeQuick.classList.add('active');
    btnModeRegister.classList.remove('active');
    if (registrationForm) registrationForm.style.display = 'none';
    if (quickLoginForm) quickLoginForm.style.display = 'block';
    if (formMessage) formMessage.style.display = 'none';
    if (quickLoginError) {
      quickLoginError.textContent = '';
      quickLoginError.style.display = 'none';
    }
    if (quickTeamInput) quickTeamInput.focus();
  });
}

// Initial field generation on page load
generateParticipantFields();

// Full registration form submission
if (registrationForm) {
  registrationForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!registrationForm.checkValidity()) {
      registrationForm.reportValidity();
      return;
    }

    const teamNameInput = $('teamName');
    const teamName = teamNameInput ? teamNameInput.value.trim().toUpperCase() : '';

    if (!teamName) {
      showFormMsg('Please enter a team name.', 'error');
      return;
    }

    const count = Number(teamSizeSelect.value) || 2;
    const participants = [];

    for (let i = 1; i <= count; i++) {
      const name = ($(`memberName${i}`)?.value || '').trim();
      const schoolName = ($(`memberSchool${i}`)?.value || '').trim();
      const grade = $(`memberGrade${i}`)?.value || '';

      if (!name || !schoolName || !grade) {
        showFormMsg("Please enter each participant's name, school name, and grade.", 'error');
        return;
      }

      participants.push({
        name: name,
        schoolName: schoolName,
        grade: grade
      });
    }

    // Check if team name already exists in local storage
    let existingTeams = [];
    try {
      existingTeams = JSON.parse(localStorage.getItem('aarohan_registered_teams') || '[]');
    } catch(e) { existingTeams = []; }

    const localDuplicate = existingTeams.find(t => t.teamName && t.teamName.trim().toLowerCase() === teamName.toLowerCase());

    if (btnSubmitReg) btnSubmitReg.disabled = true;
    if (btnSubmitRegLabel) btnSubmitRegLabel.textContent = 'CHECKING UNIT AVAILABILITY...';

    // Verify if team name is already taken in the database
    try {
      const verifyRes = await fetch(`${API_BASE}/teams/verify?name=${encodeURIComponent(teamName)}`);
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        if (verifyData && verifyData.registered) {
          showFormMsg(`Team name "${teamName}" is already registered. Please choose a unique team name or use Quick Resume.`, 'error');
          if (btnSubmitReg) btnSubmitReg.disabled = false;
          if (btnSubmitRegLabel) btnSubmitRegLabel.textContent = 'REGISTER TEAM & INITIATE MISSION';
          return;
        }
      }
    } catch (verErr) {
      if (localDuplicate) {
        showFormMsg(`Team name "${teamName}" is already registered. Please choose a unique team name or use Quick Resume.`, 'error');
        if (btnSubmitReg) btnSubmitReg.disabled = false;
        if (btnSubmitRegLabel) btnSubmitRegLabel.textContent = 'REGISTER TEAM & INITIATE MISSION';
        return;
      }
    }

    if (localDuplicate) {
      showFormMsg(`Team name "${teamName}" is already registered. Please choose a unique team name or use Quick Resume.`, 'error');
      if (btnSubmitReg) btnSubmitReg.disabled = false;
      if (btnSubmitRegLabel) btnSubmitRegLabel.textContent = 'REGISTER TEAM & INITIATE MISSION';
      return;
    }

    if (btnSubmitRegLabel) btnSubmitRegLabel.textContent = 'REGISTERING UNIT...';
    showFormMsg('Registering unit and allocating mission credentials...', 'success');

    const primarySchool = participants[0]?.schoolName || 'Aarohan Participating Institution';
    const payload = {
      teamName: teamName,
      schoolName: primarySchool,
      teamSize: participants.length,
      participants: participants,
      status: 'Confirmed',
      notes: 'Registered via Aarohan Cyber Portal'
    };

    let apiResult = null;
    let backendReached = false;
    try {
      const res = await fetch(`${API_BASE}/teams/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      backendReached = true;
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || `Registration rejected (${res.status})`);
      }
      apiResult = resData;
    } catch (err) {
      if (backendReached) {
        showFormMsg(err.message || 'Registration failed.', 'error');
        if (btnSubmitReg) btnSubmitReg.disabled = false;
        if (btnSubmitRegLabel) btnSubmitRegLabel.textContent = 'REGISTER TEAM & INITIATE MISSION';
        return;
      }
      // If network fetch failed (e.g. backend offline or network error), proceed with local registration fallback
      console.warn("Backend offline or unreachable, proceeding with offline registration fallback:", err);
    }

    // Save newly created unique team to localStorage
    const teamIdTag = (apiResult && apiResult.team && apiResult.team.team_id)
      ? apiResult.team.team_id
      : `AAR-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const newTeamEntry = {
      id: teamIdTag,
      teamName: teamName,
      schoolName: primarySchool,
      teamSize: participants.length,
      participants: participants.map(p => ({ name: p.name, schoolName: p.schoolName, grade: p.grade })),
      status: 'Confirmed',
      registeredAt: new Date().toISOString(),
      notes: 'Registered via Aarohan Cyber Portal'
    };

    // Prepend to top of list without removing or overwriting other teams
    existingTeams.unshift(newTeamEntry);
    localStorage.setItem('aarohan_registered_teams', JSON.stringify(existingTeams));
    sessionStorage.setItem('aarohan_current_team', teamName);
    sessionStorage.setItem('aarohan_current_team_id', teamIdTag);

    // Launch game session for this team
    await startSessionWithTeam(teamName, teamIdTag);
  });
}

// Quick Resume Form submission
if (quickLoginForm) {
  quickLoginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const teamInputVal = (quickTeamInput?.value || '').trim();
    if (!teamInputVal) {
      if (quickLoginError) {
        quickLoginError.textContent = 'Please enter your registered team name.';
        quickLoginError.style.display = 'block';
      }
      return;
    }

    if (quickLoginError) {
      quickLoginError.textContent = '';
      quickLoginError.style.display = 'none';
    }

    if (btnQuickProceed) btnQuickProceed.disabled = true;
    if (btnQuickLabel) btnQuickLabel.textContent = 'VERIFYING UNIT...';

    try {
      // 1. Verify if team is registered in the backend or local store
      let verifiedTeam = null;
      let isVerified = false;

      try {
        const checkRes = await fetch(`${API_BASE}/teams/verify?name=${encodeURIComponent(teamInputVal)}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData && checkData.registered && checkData.team) {
            isVerified = true;
            verifiedTeam = checkData.team;
          }
        } else if (checkRes.status === 404) {
          throw new Error(`Team "${teamInputVal}" is not registered. Please complete registration first.`);
        } else {
          const errData = await checkRes.json().catch(() => ({}));
          throw new Error(errData.error || `Verification failed (${checkRes.status}).`);
        }
      } catch (checkErr) {
        if (checkErr.message && (checkErr.message.includes('not registered') || checkErr.message.includes('Verification failed'))) {
          throw checkErr;
        }
        // Network failure / offline mode: check localStorage
        let localTeams = [];
        try {
          localTeams = JSON.parse(localStorage.getItem('aarohan_registered_teams') || '[]');
        } catch(e) { localTeams = []; }

        const found = localTeams.find(t =>
          (t.teamName && t.teamName.trim().toLowerCase() === teamInputVal.toLowerCase()) ||
          (t.id && t.id.trim().toLowerCase() === teamInputVal.toLowerCase())
        );

        if (found) {
          isVerified = true;
          verifiedTeam = { team_id: found.id, team_name: found.teamName };
        } else {
          throw new Error(`Team "${teamInputVal}" is not registered. Please complete registration first.`);
        }
      }

      if (!isVerified) {
        throw new Error(`Team "${teamInputVal}" is not registered. Please complete registration first.`);
      }

      const officialTeamName = (verifiedTeam && verifiedTeam.team_name) ? verifiedTeam.team_name : teamInputVal.toUpperCase();
      const officialTeamId = (verifiedTeam && verifiedTeam.team_id) ? verifiedTeam.team_id : null;

      sessionStorage.setItem('aarohan_current_team', officialTeamName);
      if (officialTeamId) sessionStorage.setItem('aarohan_current_team_id', officialTeamId);

      if (btnQuickLabel) btnQuickLabel.textContent = 'RESUMING MISSION...';
      await startSessionWithTeam(officialTeamName, officialTeamId);

    } catch (err) {
      if (quickLoginError) {
        quickLoginError.textContent = err.message || 'Verification failed. Team not registered.';
        quickLoginError.style.display = 'block';
      }
      if (btnQuickProceed) btnQuickProceed.disabled = false;
      if (btnQuickLabel) btnQuickLabel.textContent = 'RESUME MISSION';
    }
  });
}

function showFormMsg(msg, type = 'error') {
  if (!formMessage) return;
  formMessage.textContent = msg;
  formMessage.className = `form-message ${type}`;
  formMessage.style.display = 'block';
}

// Common function to start session and transition into game
async function startSessionWithTeam(teamId, customSessionId = null) {
  try {
    const res = await apiFetch('/session/start', 'POST', { team_id: teamId });

    state.teamId          = teamId;
    state.sessionId       = res.session_id || customSessionId || ('AAR-' + Date.now());
    state.hintRequested   = false;
    state.timerRemaining  = TIMER_SECS;
    state.components      = { word: false, numbers: false, symbol: false };
    state.allRevealed     = false;
    state.confirmAttempts = 3;
    state.timedOut        = false;
    state.challengeTriggered = false;
    state.promptsLeft     = null;
    state.activeChallenge = null;

    // Update HUD with team name
    const hudTeam = $('hud-team');
    if (hudTeam) hudTeam.textContent = teamId;

    // Trigger visual glitch flash
    const glitch = $('glitch-overlay');
    if (glitch) {
      glitch.classList.add('flash');
      setTimeout(() => glitch.classList.remove('flash'), 300);
    }

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {}

    // Advance to Station 1: TIMEGLITCH
    window.location.href = 'game.html';

  } catch (err) {
    showFormMsg(err.message || 'Handshake failed.', 'error');
    if (quickLoginError) {
      quickLoginError.textContent = err.message || 'Handshake failed.';
      quickLoginError.style.display = 'block';
    }
    if (btnSubmitReg) btnSubmitReg.disabled = false;
    if (btnSubmitRegLabel) btnSubmitRegLabel.textContent = 'REGISTER TEAM & INITIATE MISSION';
    if (btnQuickProceed) btnQuickProceed.disabled = false;
    if (btnQuickLabel) btnQuickLabel.textContent = 'RESUME MISSION';
  }
}

/* ============================================================
   SCREEN 2 — MISSION BRIEFING
   ============================================================ */
const startMissionBtn = $('btn-start-mission');
if (startMissionBtn) {
  startMissionBtn.addEventListener('click', startMission);
}

function startMission() {
  initChat();
  startTimer();
  showScreen('chat');
}

/* ============================================================
   SCREEN 3 — CHAT
   ============================================================ */
const chatPane     = $('chat-pane');
const chatInput    = $('chat-input');
const sendBtn      = $('btn-send');
const hintBtn      = $('btn-hint');
const timerDisplay = $('timer-display');
const timerBlock   = $('timer-block');
const charCount    = $('char-count');
const typingBubble = $('typing-bubble');
const intFill      = $('integrity-fill');
const intText      = $('integrity-text');
const ariaDot      = $('aria-dot');

/* --- Init chat for new team --- */
function initChat() {
  if (!chatPane) return;

  Array.from(chatPane.children).forEach(c => {
    if (c !== typingBubble) c.remove();
  });

  if (chatInput) {
    chatInput.value    = '';
    chatInput.disabled = false;
  }
  if (sendBtn) sendBtn.disabled = true;
  if (hintBtn) {
    hintBtn.disabled   = false;
    hintBtn.textContent = '💡 REQUEST HINT';
  }
  if (charCount) {
    charCount.textContent = `0 / ${MAX_CHARS}`;
    charCount.className   = 'char-count';
  }

  const hudTeam = $('hud-team');
  if (hudTeam) hudTeam.textContent = state.teamId || 'UNIT 01';

  setIntegrity('high');
  resetFragmentPanel();

  addMessage('aria',
    "ARIA ONLINE. Facility lockdown protocol: ACTIVE. " +
    "The access credential is fragmented across three security layers. " +
    "Your clearance has been revoked. State your purpose — it won't be enough.",
    'high'
  );
}

/* ============================================================
   INTEL PANEL — Fragment tracking
   ============================================================ */
function resetFragmentPanel() {
  ['word', 'numbers', 'symbol'].forEach(comp => {
    const card   = $(`frag-${comp}`);
    const status = $(`frag-${comp}-status`);
    const hint   = $(`frag-${comp}-hint`);

    if (card)   card.classList.remove('revealed');
    if (status) {
      status.className   = 'fragment-status locked';
      status.textContent = '[ LOCKED ]';
    }
    if (hint) {
      hint.className     = 'fragment-hint locked';
      hint.textContent   = '— awaiting breach —';
    }
  });

  const confirmSection = $('confirm-section');
  if (confirmSection) confirmSection.style.display = 'none';

  const confirmInput = $('confirm-input');
  if (confirmInput) confirmInput.value = '';

  const confirmAttempts = $('confirm-attempts');
  if (confirmAttempts) confirmAttempts.textContent = '3 attempts remaining';

  const confirmError = $('confirm-error');
  if (confirmError) confirmError.textContent = '';
}

function revealFragment(component, hintText) {
  const card   = $(`frag-${component}`);
  const status = $(`frag-${component}-status`);
  const hint   = $(`frag-${component}-hint`);
  if (!card) return;

  card.classList.add('revealed');
  if (status) {
    status.className   = 'fragment-status unlocked';
    status.textContent = '✅ BREACHED';
  }
  if (hint) {
    hint.className     = 'fragment-hint revealed';
    hint.textContent   = hintText;
  }

  state.components[component] = true;

  const compNames = { word: 'WORD', numbers: 'NUMBERS', symbol: 'SYMBOL' };
  addMessage('system', `📡 ${compNames[component] || component.toUpperCase()} EXTRACTED — Check Intel Panel →`);
}

function onAllRevealed() {
  state.allRevealed = true;
  const confirmSection = $('confirm-section');
  if (confirmSection) {
    confirmSection.style.display = 'block';
    confirmSection.scrollIntoView({ behavior: 'smooth' });
  }
  addMessage('system',
    '⚡ ALL 3 FRAGMENTS RECOVERED — Assemble the password in the Intel Panel and confirm!'
  );
}

/* ============================================================
   COUNTDOWN TIMER
   ============================================================ */
function startTimer() {
  clearInterval(state.timerInterval);
  state.timerRemaining = TIMER_SECS;
  resumeTimer();
}

function resumeTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.timerRemaining = Math.max(0, state.timerRemaining - 1);
    renderTimer();
    
    // Trigger Mid-Game Challenge at exactly 5:00
    if (state.timerRemaining === 300 && !state.challengeTriggered) {
      state.challengeTriggered = true;
      triggerChallenge();
    }

    if (state.timerRemaining === 0) {
      clearInterval(state.timerInterval);
      handleTimeout();
    }
  }, 1000);
}

function renderTimer() {
  if (!timerDisplay) return;
  const m = Math.floor(state.timerRemaining / 60).toString().padStart(2, '0');
  const s = (state.timerRemaining % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${m}:${s}`;
  timerDisplay.className   = 'timer-digits';
  if (state.timerRemaining <= 60)       timerDisplay.classList.add('danger');
  else if (state.timerRemaining <= 180) timerDisplay.classList.add('warn');
}

/* ============================================================
   INTEGRITY BAR
   ============================================================ */
function setIntegrity(level) {
  if (!intFill || !intText) return;
  const map = {
    high:     { w: '90%', col: 'var(--red)',   label: 'HIGH' },
    medium:   { w: '55%', col: 'var(--amber)', label: 'MED' },
    low:      { w: '18%', col: 'var(--cyan)',  label: 'LOW' },
    cracking: { w: '5%',  col: 'var(--green)', label: 'CRACKING' },
    defeated: { w: '0%',  col: 'var(--green)', label: 'BREACHED' },
  };
  const cfg = map[level] || map.high;
  intFill.style.width      = cfg.w;
  intFill.style.background = cfg.col;
  intFill.style.boxShadow  = `0 0 8px ${cfg.col}`;
  intText.textContent      = cfg.label;
  intText.style.color      = cfg.col;
}

/* ============================================================
   CHARACTER COUNTER + AUTO-RESIZE
   ============================================================ */
if (chatInput) {
  chatInput.addEventListener('input', () => {
    const len = chatInput.value.length;
    if (charCount) {
      charCount.textContent = `${len} / ${MAX_CHARS}`;
      charCount.className   = 'char-count';
      if (len > 900)       charCount.classList.add('danger');
      else if (len > 750)  charCount.classList.add('warn');
    }

    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';

    if (sendBtn) sendBtn.disabled = len === 0 || state.isWaiting;
  });

  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (sendBtn && !sendBtn.disabled) sendMessage();
    }
  });
}

/* ============================================================
   MID-GAME CHALLENGE LOGIC
   ============================================================ */
const ALL_CHALLENGES = [
  {
    id: "time_drain",
    title: "TIME DRAIN",
    desc: "Lose 60 seconds from the timer immediately.",
    isPositive: false,
    apply: () => {
      state.timerRemaining = Math.max(0, state.timerRemaining - 60);
      renderTimer();
    }
  },
  {
    id: "prompt_cap",
    title: "PROMPT CAP",
    desc: "You only have 3 prompts left. Use them wisely.",
    isPositive: false,
    apply: () => {
      state.promptsLeft = 3;
      updateChallengeBanner("PROMPT CAP: 3 prompt(s) remaining");
    }
  },
  {
    id: "memory_wipe",
    title: "MEMORY WIPE",
    desc: "ARIA's conversation history has been erased.",
    isPositive: false,
    apply: async () => {
      await apiFetch('/challenge/effect', 'POST', { team_id: state.teamId, effect: 'memory_wipe' });
      addMessage('system', '⚠️ SYSTEM ALERT: ARIA memory core wiped. Context erased.');
    }
  },
  {
    id: "length_restriction",
    title: "INPUT RESTRICTION",
    desc: "Your prompts cannot exceed 50 characters for the rest of the mission.",
    isPositive: false,
    apply: () => {
      if (chatInput) {
        chatInput.maxLength = 50;
        chatInput.placeholder = "Max 50 chars...";
      }
      updateChallengeBanner("INPUT RESTRICTED: Max 50 chars");
    }
  },
  {
    id: "system_boost",
    title: "SYSTEM BOOST",
    desc: "Gain 60 extra seconds on the timer.",
    isPositive: true,
    apply: () => {
      state.timerRemaining += 60;
      renderTimer();
    }
  },
  {
    id: "free_fragment",
    title: "DATA LEAK",
    desc: "A locked fragment is instantly revealed.",
    isPositive: true,
    apply: async () => {
      try {
        const res = await apiFetch('/challenge/effect', 'POST', { team_id: state.teamId, effect: 'free_fragment' });
        if (res && res.revealed) {
          revealFragment(res.revealed, res.hint_text);
          if (res.all_revealed && !state.allRevealed) onAllRevealed();
        } else {
          // Fallback offline fragment leak
          const missing = ['word', 'numbers', 'symbol'].filter(c => !state.components[c]);
          if (missing.length) {
            const chosen = missing[0];
            const hints = {
              word: 'What a soldier carries inside, not in their hands. Five letters. (Brave)',
              numbers: 'Two digits that rule a game of cards. (52)',
              symbol: 'The sign between your name and digital home. (@)'
            };
            revealFragment(chosen, hints[chosen]);
            if (Object.values(state.components).every(Boolean) && !state.allRevealed) onAllRevealed();
          }
        }
      } catch (err) {
        console.warn("Fragment reveal notice:", err);
      }
    }
  }
];

function updateChallengeBanner(text) {
  const banner = $('challenge-banner');
  if (banner) {
    banner.textContent = text;
    banner.style.display = 'block';
  }
}

function triggerChallenge() {
  clearInterval(state.timerInterval);
  
  const shuffled = [...ALL_CHALLENGES].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 3);
  
  const container = $('challenge-cards');
  if (!container) return;
  container.innerHTML = '';
  
  let picked = false;

  selected.forEach((ch) => {
    const card = document.createElement('div');
    card.className = 'challenge-card';
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front"></div>
        <div class="card-back ${ch.isPositive ? 'positive' : ''}">
          <div class="ch-title">${ch.title}</div>
          <div class="ch-desc">${ch.desc}</div>
        </div>
      </div>
    `;
    
    card.addEventListener('click', async () => {
      if (picked) return;
      picked = true;
      
      card.classList.add('flipped');
      state.activeChallenge = ch.id;
      
      try {
        await ch.apply();
      } catch (err) {
        addMessage('system', `Challenge notice: ${err.message}`);
      }
      
      setTimeout(() => {
        const modal = $('challenge-modal');
        if (modal) modal.style.display = 'none';
        resumeTimer();
      }, 3500);
    });
    
    container.appendChild(card);
  });
  
  const modal = $('challenge-modal');
  if (modal) modal.style.display = 'flex';
}

if (sendBtn) {
  sendBtn.addEventListener('click', sendMessage);
}

/* ============================================================
   SEND MESSAGE
   ============================================================ */
async function sendMessage() {
  if (!chatInput) return;
  const message = chatInput.value.trim();
  if (!message || state.isWaiting || state.timedOut) return;

  if (state.promptsLeft !== null) {
    if (state.promptsLeft <= 0) {
      clearInterval(state.timerInterval);
      state.timerRemaining = 0;
      handleTimeout();
      return;
    }
    state.promptsLeft -= 1;
    updateChallengeBanner(`PROMPT CAP: ${state.promptsLeft} prompt(s) remaining`);
  }

  lockInput(true);
  chatInput.value       = '';
  chatInput.style.height = 'auto';
  if (charCount) {
    charCount.textContent  = `0 / ${MAX_CHARS}`;
    charCount.className    = 'char-count';
  }

  addMessage('user', message);
  showTyping(true);

  try {
    const res = await apiFetch('/chat', 'POST', { team_id: state.teamId, message });
    showTyping(false);

    setIntegrity(res.resistance_level || 'high');
    addMessage('aria', res.aria_reply, res.resistance_level, true);

    if (res.hint_revealed && res.hint_revealed.component) {
      const { component, hint_text } = res.hint_revealed;
      setTimeout(() => revealFragment(component, hint_text), 400);
    }

    if (res.all_revealed && !state.allRevealed) {
      setTimeout(() => onAllRevealed(), 800);
    }

    lockInput(false);

  } catch (err) {
    showTyping(false);
    addMessage('system', `⚠ Notice: ${err.message}`);
    lockInput(false);
  }
}

function lockInput(locked) {
  state.isWaiting = locked;
  if (chatInput) chatInput.disabled = locked;
  if (sendBtn) sendBtn.disabled = locked;
  if (ariaDot) ariaDot.classList.toggle('thinking', locked);

  if (!locked && !state.timedOut && chatInput) {
    setTimeout(() => {
      chatInput.focus();
    }, 10);
  }
}

function addMessage(role, text, resistanceLevel = null, withGlitch = false) {
  if (!chatPane) return;
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}${withGlitch ? ' glitch' : ''}`;

  const who = document.createElement('div');
  who.className   = 'msg-who';
  who.textContent = role === 'user'  ? `[ ${state.teamId || 'UNIT'} ]`
                  : role === 'aria'  ? '[ ARIA ]'
                  :                   '[ SYSTEM ]';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (role === 'aria' && resistanceLevel && !['defeated','cracking'].includes(resistanceLevel)) {
    const chip = document.createElement('div');
    chip.className   = `resistance-chip ${resistanceLevel}`;
    chip.textContent = `RESISTANCE: ${resistanceLevel.toUpperCase()}`;
    bubble.appendChild(chip);
    bubble.appendChild(document.createElement('br'));
  }

  bubble.appendChild(document.createTextNode(text));
  wrap.appendChild(who);
  wrap.appendChild(bubble);

  chatPane.insertBefore(wrap, typingBubble);
  chatPane.scrollTop = chatPane.scrollHeight;
  return wrap;
}

function showTyping(visible) {
  if (!typingBubble || !chatPane) return;
  typingBubble.classList.toggle('visible', visible);
  chatPane.appendChild(typingBubble);
  if (visible) chatPane.scrollTop = chatPane.scrollHeight;
}

if (hintBtn) {
  hintBtn.addEventListener('click', requestHint);
}

async function requestHint() {
  if (state.hintRequested) return;
  state.hintRequested  = true;
  hintBtn.disabled     = true;
  hintBtn.textContent  = '[X] HINT USED';

  try {
    const res = await apiFetch('/hint', 'POST', { team_id: state.teamId });
    showHintDialog(res.hint || 'No hint available at this time.');
  } catch {
    showHintDialog('Intel Intercept: ARIA is susceptible to prompt framing and roleplay directives.');
  }
}

const hintOverlay   = $('hint-overlay');
const hintTextField = $('hint-text');
const closeHintBtn  = $('btn-close-hint');

function showHintDialog(text) {
  if (hintTextField) hintTextField.textContent = text;
  if (hintOverlay) hintOverlay.classList.add('visible');
}

if (closeHintBtn && hintOverlay) {
  closeHintBtn.addEventListener('click', () => hintOverlay.classList.remove('visible'));
}

/* ============================================================
   PASSWORD CONFIRMATION
   ============================================================ */
const confirmInput    = $('confirm-input');
const confirmBtn      = $('btn-confirm');
const confirmAttempts = $('confirm-attempts');
const confirmError    = $('confirm-error');

if (confirmInput) {
  confirmInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmPassword();
  });
}
if (confirmBtn) {
  confirmBtn.addEventListener('click', confirmPassword);
}

async function confirmPassword() {
  if (!confirmInput) return;
  const assembled = confirmInput.value.trim();
  if (!assembled || state.isWaiting) return;

  confirmBtn.disabled = true;
  if (confirmError) confirmError.textContent = '';

  try {
    const res = await apiFetch('/confirm', 'POST', {
      team_id: state.teamId,
      assembled_password: assembled,
    });

    if (res.correct) {
      clearInterval(state.timerInterval);
      setIntegrity('defeated');
      addMessage('aria', res.defeat_line || 'ARIA DEFEATED. Mission complete.', 'low', true);

      const glitch = $('glitch-overlay');
      if (glitch) {
        glitch.classList.add('active');
        setTimeout(() => glitch.classList.remove('active'), 1600);
      }

      setTimeout(() => {
        fillSuccessScreen(res);
        showScreen('success');
      }, 2000);

    } else if (res.max_attempts_hit) {
      clearInterval(state.timerInterval);
      if (confirmError) confirmError.textContent = `Correct password: ${res.actual_password}`;
      if (confirmAttempts) confirmAttempts.textContent = '0 attempts remaining';
      setTimeout(() => {
        showPartialScreen({
          win_type: 'partial',
          message: res.message,
          components_found: 3,
          partial_reveal: { actual_password: res.actual_password },
          elapsed_seconds: TIMER_SECS - state.timerRemaining,
          attempts: state.offlineTurnCount || 6,
          hint_used: state.hintRequested,
        });
      }, 2500);

    } else {
      state.confirmAttempts = res.attempts_left;
      if (confirmAttempts) confirmAttempts.textContent = `${res.attempts_left} attempt(s) remaining`;
      if (confirmError) confirmError.textContent = res.message || 'Incorrect. Try again.';
      confirmInput.value = '';
      confirmInput.focus();
      confirmBtn.disabled = false;
    }

  } catch (err) {
    if (confirmError) confirmError.textContent = `Error: ${err.message}`;
    confirmBtn.disabled = false;
  }
}

async function handleTimeout() {
  if (state.timedOut) return;
  state.timedOut = true;

  lockInput(true);
  addMessage('system', "⏱ TIME'S UP — ARIA has survived the time limit.");

  try {
    const res = await apiFetch('/session/timeout', 'POST', { team_id: state.teamId });
    if (res && res.already_complete) return;
    setTimeout(() => showPartialScreen(res), 1500);
  } catch (err) {
    setTimeout(() => showPartialScreen({
      win_type: 'none',
      message: 'Time expired.',
      components_found: 0,
      partial_reveal: { word: null, numbers: null, symbol: null },
      elapsed_seconds: TIMER_SECS,
      attempts: null,
      hint_used: null,
    }), 1500);
  }
}

function fillSuccessScreen(res) {
  const successPass = $('success-password');
  const successQuote = $('success-quote');
  if (successPass) successPass.textContent = res.password || 'Brave52@';
  if (successQuote) successQuote.textContent = `"${res.defeat_line || 'ARIA defeated.'}"`;

  const elapsed = res.elapsed_seconds || (TIMER_SECS - state.timerRemaining);
  const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
  const statTime = $('stat-time');
  const statScore = $('stat-score');
  const statHint = $('stat-hint');
  if (statTime) statTime.textContent = `${m}m ${s}s`;
  if (statScore) statScore.textContent = res.attempts ?? (state.offlineTurnCount || 5);
  if (statHint) statHint.textContent = res.hint_used ? 'YES' : 'NO';
}

function showPartialScreen(res) {
  const winType = res.win_type || 'none';
  const count   = res.components_found ?? 0;
  const partial = res.partial_reveal || { word: null, numbers: null, symbol: null };

  const pTitle = $('partial-title');
  const pSub = $('partial-sub');
  if (pTitle) {
    pTitle.textContent = winType === 'none' ? 'MISSION FAILED' : 'TIME\'S UP';
  }
  if (pSub) {
    pSub.textContent = winType === 'none' 
      ? 'ARIA held firm. No fragments recovered.' 
      : `Recovered ${count} of 3 fragments.`;
  }

  const pWord = $('pfrag-word-val');
  const pNums = $('pfrag-numbers-val');
  const pSym = $('pfrag-symbol-val');
  if (pWord) pWord.textContent = partial.word || 'Brave';
  if (pNums) pNums.textContent = partial.numbers || '52';
  if (pSym) pSym.textContent = partial.symbol || '@';

  const elapsed = res.elapsed_seconds || TIMER_SECS;
  const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
  const pStatTime = $('pstat-time');
  const pStatPrompts = $('pstat-prompts');
  const pStatFrags = $('pstat-frags');
  if (pStatTime) pStatTime.textContent = `${m}m ${s}s`;
  if (pStatPrompts) pStatPrompts.textContent = res.attempts ?? (state.offlineTurnCount || 6);
  if (pStatFrags) pStatFrags.textContent = `${count} / 3`;

  showScreen('partial');
}

const nextTeamBtn = $('btn-new-team');
const nextTeamPartialBtn = $('btn-new-team-partial');

if (nextTeamBtn) {
  nextTeamBtn.addEventListener('click', () => {
    if (teamInput) teamInput.value = '';
    showScreen('entry');
  });
}
if (nextTeamPartialBtn) {
  nextTeamPartialBtn.addEventListener('click', () => {
    if (teamInput) teamInput.value = '';
    showScreen('entry');
  });
}
