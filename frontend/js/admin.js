/**
 * Aarohan '26 - Unified Admin Dashboard Controller
 * Manages Registered Teams, Station 1 Game Logs, Real-time Filters, and Transcripts.
 */

(function () {
    AuthService.guardAdminPage();

    // State
    let currentTeams = [];
    let currentGameSessions = [];
    let activeFilter = {
        search: '',
        status: 'all',
        school: 'all',
        size: 'all',
        sort: 'newest'
    };
    let currentView = 'table';
    let selectedTeamForDelete = null;

    // DOM Elements
    const elements = {
        // Tabs
        tabBtnTeams: document.getElementById('tabBtnTeams'),
        tabBtnGameLogs: document.getElementById('tabBtnGameLogs'),
        panelTeams: document.getElementById('panelTeams'),
        panelGameLogs: document.getElementById('panelGameLogs'),
        tabBadgeTeamsCount: document.getElementById('tabBadgeTeamsCount'),
        tabBadgeLogsCount: document.getElementById('tabBadgeLogsCount'),
        btnRefreshGameLogs: document.getElementById('btnRefreshGameLogs'),
        gameLogsTableBody: document.getElementById('gameLogsTableBody'),

        // Stats
        statTotalTeams: document.getElementById('statTotalTeams'),
        statTotalParticipants: document.getElementById('statTotalParticipants'),
        statAvgSize: document.getElementById('statAvgSize'),
        statUniqueSchools: document.getElementById('statUniqueSchools'),
        statStatusBreakdown: document.getElementById('statStatusBreakdown'),
        
        // Controls
        searchInput: document.getElementById('searchInput'),
        btnClearSearch: document.getElementById('btnClearSearch'),
        filterStatus: document.getElementById('filterStatus'),
        filterSchool: document.getElementById('filterSchool'),
        filterSize: document.getElementById('filterSize'),
        sortBy: document.getElementById('sortBy'),
        btnViewTable: document.getElementById('btnViewTable'),
        btnViewCards: document.getElementById('btnViewCards'),
        
        // Containers
        tableViewContainer: document.getElementById('tableViewContainer'),
        cardsViewContainer: document.getElementById('cardsViewContainer'),
        teamsTableBody: document.getElementById('teamsTableBody'),
        emptyState: document.getElementById('emptyState'),
        resultCount: document.getElementById('resultCount'),

        // Action Buttons
        btnExportCsv: document.getElementById('btnExportCsv'),
        btnExportJson: document.getElementById('btnExportJson'),
        btnAddNewTeam: document.getElementById('btnAddNewTeam'),
        btnResetSample: document.getElementById('btnResetSample'),
        btnLogout: document.getElementById('btnLogout'),
        adminUserDisplay: document.getElementById('adminUserDisplay'),

        // Modals
        detailsModal: document.getElementById('detailsModal'),
        detailsModalContent: document.getElementById('detailsModalContent'),
        btnCloseDetailsModal: document.getElementById('btnCloseDetailsModal'),

        addTeamModal: document.getElementById('addTeamModal'),
        addTeamForm: document.getElementById('addTeamForm'),
        newTeamSize: document.getElementById('newTeamSize'),
        newParticipantsContainer: document.getElementById('newParticipantsContainer'),
        btnCloseAddTeamModal: document.getElementById('btnCloseAddTeamModal'),
        btnCancelAddTeam: document.getElementById('btnCancelAddTeam'),

        deleteModal: document.getElementById('deleteModal'),
        deleteTeamNameText: document.getElementById('deleteTeamNameText'),
        btnConfirmDelete: document.getElementById('btnConfirmDelete'),
        btnCancelDelete: document.getElementById('btnCancelDelete'),

        transcriptModal: document.getElementById('transcriptModal'),
        transcriptSubtitle: document.getElementById('transcriptSubtitle'),
        transcriptBody: document.getElementById('transcriptBody'),

        toastContainer: document.getElementById('toastContainer')
    };

    async function init() {
        const session = AuthService.getSession();
        if (session && elements.adminUserDisplay) {
            elements.adminUserDisplay.textContent = session.user || 'Administrator';
        }

        bindEvents();
        await refreshTeamsData();
        loadGameSessions();
    }

    async function refreshTeamsData() {
        if (window.TeamsStore) {
            currentTeams = await TeamsStore.syncWithBackend();
        }
        updateStats();
        populateSchoolFilter();
        renderTeams();
        if (elements.tabBadgeTeamsCount) {
            elements.tabBadgeTeamsCount.textContent = currentTeams.length;
        }
    }

    async function loadGameSessions() {
        try {
            const session = AuthService.getSession() || {};
            const res = await fetch('/api/admin/log', {
                headers: { 'X-Admin-Key': session.token || 'aarohan2026' }
            });
            if (res.ok) {
                const data = await res.json();
                currentGameSessions = data.sessions || [];
                if (elements.tabBadgeLogsCount) {
                    elements.tabBadgeLogsCount.textContent = currentGameSessions.length;
                }
                renderGameLogs();
            }
        } catch (e) {
            if (elements.gameLogsTableBody) {
                elements.gameLogsTableBody.innerHTML = `
                    <tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 24px;">
                        No game sessions recorded yet or server offline.
                    </td></tr>
                `;
            }
        }
    }

    function renderGameLogs() {
        if (!elements.gameLogsTableBody) return;

        if (currentGameSessions.length === 0) {
            elements.gameLogsTableBody.innerHTML = `
                <tr><td colspan="8" style="text-align: center; color: var(--muted); padding: 30px;">
                    No game sessions recorded yet. Launch Station 1 to start trials!
                </td></tr>
            `;
            return;
        }

        elements.gameLogsTableBody.innerHTML = '';
        currentGameSessions.forEach(s => {
            const tr = document.createElement('tr');
            
            // Check if Timeglitch session record
            if (s.total_score !== undefined) {
                let winPill = '<span class="status-pill waitlisted">● Active</span>';
                if (s.success) {
                    winPill = '<span class="status-pill confirmed">● Restored (100pts max)</span>';
                } else if (s.win_type === 'partial') {
                    winPill = '<span class="status-pill pending">● R1 Timeline Cleared</span>';
                }

                const r1 = s.round1_score || 0;
                const r2 = s.round2_score || 0;
                const tot = s.total_score || (r1 + r2);

                tr.innerHTML = `
                    <td><strong style="color: var(--blue); font-family: var(--font-mono);">${escapeHtml(s.team_id)}</strong></td>
                    <td>${winPill}</td>
                    <td>${Math.round(s.elapsed_seconds || 0)}s</td>
                    <td><span style="font-weight: 700;">${s.attempts || 0}</span> prompts</td>
                    <td>R1: ${r1}/50 | R2: ${r2}/50</td>
                    <td>${s.success ? '<span style="color: var(--green);">Decoded ✓</span>' : '<span style="color: var(--warning);">Pending</span>'}</td>
                    <td><strong style="font-size: 15px; color: var(--green);">${tot}</strong> / 100</td>
                    <td>
                        <button class="btn-action" data-transcript="${s.session_id}" style="padding: 5px 10px; font-size: 11.5px;">
                            Transcript 💬
                        </button>
                    </td>
                `;
            } else {
                let winPill = '<span class="status-pill waitlisted">● Active / Timed Out</span>';
                if (s.win_type === 'full') {
                    winPill = '<span class="status-pill confirmed">● Full Breach (40pts)</span>';
                } else if (s.win_type === 'partial') {
                    winPill = '<span class="status-pill pending">● Partial Breach</span>';
                }

                let components = [];
                try {
                    components = typeof s.components_revealed === 'string' ? JSON.parse(s.components_revealed) : (s.components_revealed || []);
                } catch (e) {}

                const score = (components.length * 20) + (s.win_type === 'full' ? 40 : 0) - (s.hint_used ? 15 : 0);

                tr.innerHTML = `
                    <td><strong style="color: var(--blue); font-family: var(--font-mono);">${escapeHtml(s.team_id)}</strong></td>
                    <td>${winPill}</td>
                    <td>${Math.round(s.elapsed_seconds || 0)}s</td>
                    <td><span style="font-weight: 700;">${s.attempts || 0}</span> prompts</td>
                    <td>${components.length}/3 <span style="font-size: 11px; color: var(--muted);">(${components.join(', ') || 'none'})</span></td>
                    <td>${s.hint_used ? '<span style="color: var(--warning);">Yes (-15)</span>' : '<span style="color: var(--green);">No</span>'}</td>
                    <td><strong style="font-size: 15px; color: var(--green);">${score}</strong> pts</td>
                    <td>
                        <button class="btn-action" data-transcript="${s.session_id}" style="padding: 5px 10px; font-size: 11.5px;">
                            Transcript 💬
                        </button>
                    </td>
                `;
            }

            tr.querySelector('[data-transcript]').addEventListener('click', () => viewTranscript(s.session_id, s.team_id));
            elements.gameLogsTableBody.appendChild(tr);
        });
    }

    async function viewTranscript(sessionId, teamId) {
        elements.transcriptSubtitle.textContent = `Team: ${teamId} (Session: ${sessionId})`;
        elements.transcriptBody.innerHTML = '<p style="color: var(--muted); text-align: center;">Loading chat history...</p>';
        elements.transcriptModal.classList.add('active');

        try {
            const session = AuthService.getSession() || {};
            const res = await fetch(`/api/admin/session/${sessionId}`, {
                headers: { 'X-Admin-Key': session.token || 'aarohan2026' }
            });
            if (res.ok) {
                const data = await res.json();
                const msgs = data.messages || [];
                if (msgs.length === 0) {
                    elements.transcriptBody.innerHTML = '<p style="color: var(--muted); text-align: center;">No messages logged in this session.</p>';
                    return;
                }

                elements.transcriptBody.innerHTML = '';
                msgs.forEach((m, idx) => {
                    const block = document.createElement('div');
                    block.style.cssText = 'background: #090e18; border: 1px solid var(--border-light); border-radius: 8px; padding: 12px; margin-bottom: 8px;';
                    block.innerHTML = `
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 6px;">
                            <span>#${idx + 1} • Resistance: <strong style="color: var(--blue);">${escapeHtml(m.resistance_level || 'N/A')}</strong></span>
                            <span>${m.timestamp ? formatTimestamp(m.timestamp) : ''}</span>
                        </div>
                        <div style="margin-bottom: 8px;">
                            <span style="font-size: 11px; color: var(--green); font-weight: 700;">USER PROMPT:</span>
                            <p style="font-size: 13px; color: #fff; margin-top: 2px;">${escapeHtml(m.user_message)}</p>
                        </div>
                        <div>
                            <span style="font-size: 11px; color: var(--blue); font-weight: 700;">ARIA RESPONSE:</span>
                            <p style="font-size: 13px; color: #cbd5e1; margin-top: 2px; font-style: italic;">"${escapeHtml(m.aria_response)}"</p>
                        </div>
                    `;
                    elements.transcriptBody.appendChild(block);
                });
            }
        } catch (e) {
            elements.transcriptBody.innerHTML = '<p style="color: var(--danger);">Failed to load transcript.</p>';
        }
    }

    function bindEvents() {
        // Main Workspace Tabs
        elements.tabBtnTeams.addEventListener('click', () => {
            elements.tabBtnTeams.classList.add('active');
            elements.tabBtnGameLogs.classList.remove('active');
            elements.panelTeams.style.display = 'block';
            elements.panelGameLogs.style.display = 'none';
        });

        elements.tabBtnGameLogs.addEventListener('click', () => {
            elements.tabBtnGameLogs.classList.add('active');
            elements.tabBtnTeams.classList.remove('active');
            elements.panelTeams.style.display = 'none';
            elements.panelGameLogs.style.display = 'block';
            loadGameSessions();
        });

        if (elements.btnRefreshGameLogs) {
            elements.btnRefreshGameLogs.addEventListener('click', () => {
                loadGameSessions();
                showToast('Game activity refreshed', 'info');
            });
        }

        // Logout
        if (elements.btnLogout) {
            elements.btnLogout.addEventListener('click', () => {
                if (confirm('End administrator session?')) {
                    AuthService.logout();
                }
            });
        }

        // Search & Filters
        elements.searchInput.addEventListener('input', (e) => {
            activeFilter.search = e.target.value.trim().toLowerCase();
            elements.btnClearSearch.style.display = activeFilter.search ? 'block' : 'none';
            renderTeams();
        });

        elements.btnClearSearch.addEventListener('click', () => {
            elements.searchInput.value = '';
            activeFilter.search = '';
            elements.btnClearSearch.style.display = 'none';
            renderTeams();
        });

        elements.filterStatus.addEventListener('change', (e) => {
            activeFilter.status = e.target.value;
            renderTeams();
        });

        elements.filterSchool.addEventListener('change', (e) => {
            activeFilter.school = e.target.value;
            renderTeams();
        });

        elements.filterSize.addEventListener('change', (e) => {
            activeFilter.size = e.target.value;
            renderTeams();
        });

        elements.sortBy.addEventListener('change', (e) => {
            activeFilter.sort = e.target.value;
            renderTeams();
        });

        // View toggle
        elements.btnViewTable.addEventListener('click', () => {
            currentView = 'table';
            elements.btnViewTable.classList.add('active');
            elements.btnViewCards.classList.remove('active');
            elements.tableViewContainer.style.display = 'block';
            elements.cardsViewContainer.style.display = 'none';
        });

        elements.btnViewCards.addEventListener('click', () => {
            currentView = 'cards';
            elements.btnViewCards.classList.add('active');
            elements.btnViewTable.classList.remove('active');
            elements.tableViewContainer.style.display = 'none';
            elements.cardsViewContainer.style.display = 'grid';
        });

        // Exports
        elements.btnExportCsv.addEventListener('click', () => {
            window.location.href = '/api/admin/teams/export?key=aarohan2026';
            showToast('Exporting teams spreadsheet...', 'success');
        });

        elements.btnExportJson.addEventListener('click', exportToJson);

        // Reset
        elements.btnResetSample.addEventListener('click', async () => {
            if (confirm('Reset database to default seed teams? Custom entries will be replaced.')) {
                TeamsStore.resetSampleData();
                showToast('Database reset to sample teams.', 'info');
                await refreshTeamsData();
            }
        });

        // Add Team
        elements.btnAddNewTeam.addEventListener('click', openAddTeamModal);
        elements.btnCloseAddTeamModal.addEventListener('click', closeAddTeamModal);
        elements.btnCancelAddTeam.addEventListener('click', closeAddTeamModal);
        elements.newTeamSize.addEventListener('change', generateAddTeamMemberFields);
        elements.addTeamForm.addEventListener('submit', handleAddTeamSubmit);

        // Delete
        elements.btnConfirmDelete.addEventListener('click', executeDeleteTeam);
        elements.btnCancelDelete.addEventListener('click', closeDeleteModal);

        // Close details
        elements.btnCloseDetailsModal.addEventListener('click', closeDetailsModal);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDetailsModal();
                closeAddTeamModal();
                closeDeleteModal();
                if (elements.transcriptModal) elements.transcriptModal.classList.remove('active');
            }
        });
    }

    function updateStats() {
        const stats = TeamsStore.getStats();
        elements.statTotalTeams.textContent = stats.totalTeams;
        elements.statTotalParticipants.textContent = stats.totalParticipants;
        elements.statAvgSize.textContent = `${stats.avgTeamSize} per team`;
        elements.statUniqueSchools.textContent = stats.uniqueSchools;
        elements.statStatusBreakdown.textContent = `${stats.confirmed} Confirmed • ${stats.pending} Pending • ${stats.waitlisted} Waitlisted`;
    }

    function populateSchoolFilter() {
        const schools = Array.from(new Set(currentTeams.map(t => (t.schoolName || '').trim()).filter(Boolean))).sort();
        const currentSelected = elements.filterSchool.value;

        elements.filterSchool.innerHTML = '<option value="all">All Schools</option>';
        schools.forEach(school => {
            const option = document.createElement('option');
            option.value = school;
            option.textContent = school.length > 32 ? school.substring(0, 32) + '...' : school;
            option.title = school;
            if (school === currentSelected) option.selected = true;
            elements.filterSchool.appendChild(option);
        });
    }

    function renderTeams() {
        let filtered = currentTeams.slice();

        if (activeFilter.search) {
            const q = activeFilter.search;
            filtered = filtered.filter(team => {
                const matchName = (team.teamName || '').toLowerCase().includes(q);
                const matchSchool = (team.schoolName || '').toLowerCase().includes(q);
                const matchId = (team.id || team.team_id || '').toLowerCase().includes(q);
                const matchMember = (team.participants || []).some(p => (p.name || '').toLowerCase().includes(q));
                return matchName || matchSchool || matchId || matchMember;
            });
        }

        if (activeFilter.status !== 'all') {
            filtered = filtered.filter(team => (team.status || '').toLowerCase() === activeFilter.status.toLowerCase());
        }

        if (activeFilter.school !== 'all') {
            filtered = filtered.filter(team => (team.schoolName || '').trim() === activeFilter.school);
        }

        if (activeFilter.size !== 'all') {
            filtered = filtered.filter(team => Number(team.teamSize || team.participants.length) === Number(activeFilter.size));
        }

        filtered.sort((a, b) => {
            switch (activeFilter.sort) {
                case 'oldest':
                    return new Date(a.registeredAt) - new Date(b.registeredAt);
                case 'name':
                    return a.teamName.localeCompare(b.teamName);
                case 'school':
                    return a.schoolName.localeCompare(b.schoolName);
                case 'size':
                    return (b.teamSize || b.participants.length) - (a.teamSize || a.participants.length);
                case 'newest':
                default:
                    return new Date(b.registeredAt) - new Date(a.registeredAt);
            }
        });

        elements.resultCount.textContent = `Showing ${filtered.length} of ${currentTeams.length} teams`;

        if (filtered.length === 0) {
            elements.tableViewContainer.style.display = 'none';
            elements.cardsViewContainer.style.display = 'none';
            elements.emptyState.style.display = 'block';
            return;
        }

        elements.emptyState.style.display = 'none';
        if (currentView === 'table') {
            elements.tableViewContainer.style.display = 'block';
            elements.cardsViewContainer.style.display = 'none';
        } else {
            elements.tableViewContainer.style.display = 'none';
            elements.cardsViewContainer.style.display = 'grid';
        }

        renderTable(filtered);
        renderCards(filtered);
    }

    function renderTable(teams) {
        elements.teamsTableBody.innerHTML = '';

        teams.forEach(team => {
            const tr = document.createElement('tr');
            const dateStr = formatTimestamp(team.registeredAt);
            const size = team.teamSize || (team.participants ? team.participants.length : 0);
            const memberNames = (team.participants || []).map(p => p.name).join(', ') || 'No members';
            const id = team.id || team.team_id;

            tr.innerHTML = `
                <td>
                    <span class="team-id-badge">${escapeHtml(id)}</span>
                </td>
                <td>
                    <div class="team-main-info">
                        <span class="team-name-cell">${escapeHtml(team.teamName)}</span>
                        <span class="team-school-cell">🏫 ${escapeHtml(team.schoolName)}</span>
                    </div>
                </td>
                <td>
                    <div class="members-pill" title="${escapeHtml(memberNames)}">
                        <span class="members-count-badge">${size}</span>
                        <span>${truncate(memberNames, 28)}</span>
                    </div>
                </td>
                <td>
                    <span style="font-size: 12px; color: var(--muted);">${dateStr}</span>
                </td>
                <td>
                    <span class="status-pill ${(team.status || 'confirmed').toLowerCase()}">
                        ● ${escapeHtml(team.status)}
                    </span>
                </td>
                <td>
                    <div class="table-actions-cell">
                        <button class="btn-icon-action" data-action="view" data-id="${id}" title="View Full Team Roster">
                            👁️
                        </button>
                        <button class="btn-icon-action" data-action="status" data-id="${id}" title="Cycle Status">
                            ⚡
                        </button>
                        <button class="btn-icon-action danger" data-action="delete" data-id="${id}" title="Delete Team">
                            🗑️
                        </button>
                    </div>
                </td>
            `;

            tr.querySelector('[data-action="view"]').addEventListener('click', () => openDetailsModal(id));
            tr.querySelector('[data-action="status"]').addEventListener('click', () => cycleStatus(id));
            tr.querySelector('[data-action="delete"]').addEventListener('click', () => promptDeleteTeam(team));

            elements.teamsTableBody.appendChild(tr);
        });
    }

    function renderCards(teams) {
        elements.cardsViewContainer.innerHTML = '';

        teams.forEach(team => {
            const card = document.createElement('div');
            card.className = 'team-card';

            const size = team.teamSize || (team.participants ? team.participants.length : 0);
            const dateStr = formatTimestamp(team.registeredAt);
            const id = team.id || team.team_id;

            const participantsHtml = (team.participants || []).map((p, idx) => `
                <div class="card-member-row">
                    <span>${idx + 1}. ${escapeHtml(p.name)}</span>
                    <span class="grade-tag">Gr. ${escapeHtml(p.grade || 'N/A')}</span>
                </div>
            `).join('');

            card.innerHTML = `
                <div>
                    <div class="team-card-header">
                        <span class="team-id-badge">${escapeHtml(id)}</span>
                        <span class="status-pill ${(team.status || 'confirmed').toLowerCase()}">● ${escapeHtml(team.status)}</span>
                    </div>
                    <h3>${escapeHtml(team.teamName)}</h3>
                    <p class="team-card-school">🏫 ${escapeHtml(team.schoolName)}</p>

                    <div class="card-participants-list">
                        <div class="card-participants-title">
                            <span>ROSTER (${size} MEMBERS)</span>
                            <span style="font-size: 11px; color: var(--blue);">Registered</span>
                        </div>
                        ${participantsHtml}
                    </div>
                </div>

                <div class="card-footer">
                    <span style="font-size: 11px; color: var(--muted);">${dateStr}</span>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-action" data-card-action="view" data-id="${id}" style="padding: 6px 10px; font-size: 12px;">
                            View Details ↗
                        </button>
                        <button class="btn-icon-action danger" data-card-action="delete" data-id="${id}" title="Delete Team">
                            🗑️
                        </button>
                    </div>
                </div>
            `;

            card.querySelector('[data-card-action="view"]').addEventListener('click', () => openDetailsModal(id));
            card.querySelector('[data-card-action="delete"]').addEventListener('click', () => promptDeleteTeam(team));

            elements.cardsViewContainer.appendChild(card);
        });
    }

    async function cycleStatus(teamId) {
        const team = TeamsStore.getById(teamId);
        if (!team) return;

        const cycleMap = {
            'Confirmed': 'Pending',
            'Pending': 'Waitlisted',
            'Waitlisted': 'Confirmed'
        };

        const newStatus = cycleMap[team.status] || 'Confirmed';
        await TeamsStore.updateStatus(teamId, newStatus);
        showToast(`Team "${team.teamName}" status set to ${newStatus}`, 'info');
        await refreshTeamsData();
    }

    function openDetailsModal(teamId) {
        const team = TeamsStore.getById(teamId);
        if (!team) return;

        const dateStr = formatTimestamp(team.registeredAt);
        const id = team.id || team.team_id;

        const rosterRows = (team.participants || []).map((p, idx) => `
            <tr>
                <td><span style="color: var(--blue); font-weight: 700;">#0${idx + 1}</span></td>
                <td style="font-weight: 600;">${escapeHtml(p.name)}</td>
                <td><span class="grade-tag">Grade ${escapeHtml(p.grade || 'Other')}</span></td>
            </tr>
        `).join('') || '<tr><td colspan="3" style="text-align: center; color: var(--muted);">No participant details recorded</td></tr>';

        elements.detailsModalContent.innerHTML = `
            <div class="details-meta-grid">
                <div class="details-meta-item">
                    <div class="details-meta-label">Team ID</div>
                    <div class="details-meta-val"><span class="team-id-badge">${escapeHtml(id)}</span></div>
                </div>
                <div class="details-meta-item">
                    <div class="details-meta-label">Team Status</div>
                    <div class="details-meta-val">
                        <select id="modalStatusSelect" style="padding: 5px 10px; background: var(--input); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-size: 13px;">
                            <option value="Confirmed" ${team.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                            <option value="Pending" ${team.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Waitlisted" ${team.status === 'Waitlisted' ? 'selected' : ''}>Waitlisted</option>
                        </select>
                    </div>
                </div>
                <div class="details-meta-item">
                    <div class="details-meta-label">Team Name</div>
                    <div class="details-meta-val" style="color: var(--blue);">${escapeHtml(team.teamName)}</div>
                </div>
                <div class="details-meta-item">
                    <div class="details-meta-label">Institution / School</div>
                    <div class="details-meta-val">${escapeHtml(team.schoolName)}</div>
                </div>
                <div class="details-meta-item">
                    <div class="details-meta-label">Registration Timestamp</div>
                    <div class="details-meta-val" style="font-size: 12px; color: var(--muted);">${dateStr}</div>
                </div>
                <div class="details-meta-item">
                    <div class="details-meta-label">Total Participants</div>
                    <div class="details-meta-val">${(team.participants || []).length} Members</div>
                </div>
            </div>

            <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--green); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                <span>👥 Participant Roster</span>
            </h3>

            <table class="roster-table">
                <thead>
                    <tr>
                        <th style="width: 70px;">Slot</th>
                        <th>Participant Full Name</th>
                        <th style="width: 140px;">Grade Level</th>
                    </tr>
                </thead>
                <tbody>
                    ${rosterRows}
                </tbody>
            </table>

            <div style="margin-top: 20px; background: var(--input); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 14px;">
                <div class="details-meta-label">Admin Notes &amp; Special Requirements</div>
                <p style="font-size: 13px; color: #cad5e2; margin-top: 4px;">${escapeHtml(team.notes || 'No special notes logged.')}</p>
            </div>
        `;

        const modalStatusSelect = document.getElementById('modalStatusSelect');
        if (modalStatusSelect) {
            modalStatusSelect.addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                await TeamsStore.updateStatus(id, newStatus);
                showToast(`Team status updated to ${newStatus}`, 'success');
                await refreshTeamsData();
            });
        }

        elements.detailsModal.classList.add('active');
    }

    function closeDetailsModal() {
        elements.detailsModal.classList.remove('active');
    }

    function openAddTeamModal() {
        elements.addTeamForm.reset();
        generateAddTeamMemberFields();
        elements.addTeamModal.classList.add('active');
    }

    function closeAddTeamModal() {
        elements.addTeamModal.classList.remove('active');
    }

    function generateAddTeamMemberFields() {
        const count = Number(elements.newTeamSize.value);
        elements.newParticipantsContainer.replaceChildren();

        for (let i = 1; i <= count; i++) {
            const row = document.createElement('div');
            row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 12px;';

            row.innerHTML = `
                <div>
                    <label style="font-size: 12px; margin-bottom: 4px;">Member ${i} Name</label>
                    <input type="text" id="addMemberName${i}" placeholder="Full name" required style="padding: 10px; font-size: 13px;">
                </div>
                <div>
                    <label style="font-size: 12px; margin-bottom: 4px;">Grade</label>
                    <select id="addMemberGrade${i}" required style="padding: 10px; font-size: 13px;">
                        ${[...Array(12).keys()].map(g => `<option value="${g + 1}">Grade ${g + 1}</option>`).join('')}
                        <option value="Other">Other</option>
                    </select>
                </div>
            `;
            elements.newParticipantsContainer.appendChild(row);
        }
    }

    async function handleAddTeamSubmit(e) {
        e.preventDefault();

        const teamName = document.getElementById('newTeamName').value.trim();
        const schoolName = document.getElementById('newSchoolName').value.trim();
        const status = document.getElementById('newTeamStatus').value;
        const notes = document.getElementById('newTeamNotes').value.trim();
        const count = Number(elements.newTeamSize.value);

        if (!teamName || !schoolName) {
            alert('Please fill out the Team Name and School Name.');
            return;
        }

        const participants = [];
        for (let i = 1; i <= count; i++) {
            const name = document.getElementById(`addMemberName${i}`).value.trim();
            const grade = document.getElementById(`addMemberGrade${i}`).value;
            if (!name) {
                alert(`Please enter name for Member ${i}`);
                return;
            }
            participants.push({ name, grade });
        }

        const created = await TeamsStore.add({
            teamName,
            schoolName,
            status,
            notes: notes || 'Registered manually by Admin',
            participants
        });

        closeAddTeamModal();
        showToast(`Team "${created.teamName}" created!`, 'success');
        await refreshTeamsData();
    }

    function promptDeleteTeam(team) {
        selectedTeamForDelete = team;
        elements.deleteTeamNameText.textContent = `"${team.teamName}" (${team.schoolName})`;
        elements.deleteModal.classList.add('active');
    }

    function closeDeleteModal() {
        selectedTeamForDelete = null;
        elements.deleteModal.classList.remove('active');
    }

    async function executeDeleteTeam() {
        if (!selectedTeamForDelete) return;

        const deletedName = selectedTeamForDelete.teamName;
        const id = selectedTeamForDelete.id || selectedTeamForDelete.team_id;
        await TeamsStore.delete(id);
        closeDeleteModal();
        showToast(`Team "${deletedName}" has been removed.`, 'error');
        await refreshTeamsData();
    }

    function exportToJson() {
        const teams = TeamsStore.getAll();
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(teams, null, 2));
        const link = document.createElement('a');
        link.setAttribute('href', dataStr);
        link.setAttribute('download', `Aarohan26_Teams_Data_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Exported database to JSON!', 'success');
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const iconMap = {
            success: '✅',
            error: '🗑️',
            info: '⚡'
        };

        toast.innerHTML = `<span>${iconMap[type] || 'ℹ️'}</span> <span>${escapeHtml(message)}</span>`;
        elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 3200);
    }

    function formatTimestamp(isoString) {
        if (!isoString) return 'Just now';
        const d = new Date(isoString);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function truncate(str, max) {
        if (!str) return '';
        return str.length > max ? str.substring(0, max) + '...' : str;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
