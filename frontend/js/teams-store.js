/**
 * Aarohan '26 - Unified Teams Data Store
 * Interacts with Flask backend API (/api/teams, /api/admin/teams)
 * with robust offline localStorage synchronization.
 */

const TEAMS_STORAGE_KEY = 'aarohan_registered_teams';

const INITIAL_SAMPLE_TEAMS = [
    {
        id: 'AAR-2026-1001',
        teamName: 'CyberKnights',
        schoolName: 'Delhi Public School, R.K. Puram',
        registeredAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        status: 'Confirmed',
        teamSize: 4,
        participants: [
            { name: 'Aarav Sharma', grade: '11' },
            { name: 'Diya Patel', grade: '11' },
            { name: 'Rohan Mehra', grade: '12' },
            { name: 'Ananya Roy', grade: '10' }
        ],
        notes: 'Leader contact: aarav.sharma@gmail.com. Regional prompt hackathon finalist.'
    },
    {
        id: 'AAR-2026-1002',
        teamName: 'PromptCrafters',
        schoolName: 'National Public School, Indiranagar',
        registeredAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
        status: 'Confirmed',
        teamSize: 3,
        participants: [
            { name: 'Vikramaditya Rao', grade: '12' },
            { name: 'Sneha Nambiar', grade: '12' },
            { name: 'Kabir Sengupta', grade: '11' }
        ],
        notes: 'Winners of Regional Prompt Hackathon 2025.'
    },
    {
        id: 'AAR-2026-1003',
        teamName: 'Neural Nexus',
        schoolName: "The Mother's International School",
        registeredAt: new Date(Date.now() - 19 * 3600 * 1000).toISOString(),
        status: 'Pending',
        teamSize: 5,
        participants: [
            { name: 'Ishaan Verma', grade: '10' },
            { name: 'Tara Mukherjee', grade: '10' },
            { name: 'Samarth Gupta', grade: '9' },
            { name: 'Pooja Iyer', grade: '11' },
            { name: 'Devansh Kulkarni', grade: '10' }
        ],
        notes: 'School authorization letter pending verification.'
    },
    {
        id: 'AAR-2026-1004',
        teamName: 'ByteForce Omega',
        schoolName: "St. Xavier's Collegiate School",
        registeredAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        status: 'Confirmed',
        teamSize: 2,
        participants: [
            { name: 'Arjun Dasgupta', grade: '12' },
            { name: 'Tanmay Bannerjee', grade: '12' }
        ],
        notes: 'Specializing in prompt-chaining algorithms.'
    },
    {
        id: 'AAR-2026-1005',
        teamName: 'Quantum Coders',
        schoolName: 'Bombay Scottish School, Mahim',
        registeredAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        status: 'Waitlisted',
        teamSize: 4,
        participants: [
            { name: 'Meera Chawla', grade: '11' },
            { name: 'Aryan Kapoor', grade: '11' },
            { name: 'Rehan Siddiqui', grade: '11' },
            { name: 'Zoya Merchant', grade: '10' }
        ],
        notes: 'Waitlisted due to venue batch slot capacity.'
    },
    {
        id: 'AAR-2026-1006',
        teamName: 'Valkyrie AI',
        schoolName: 'Bishop Cotton Boys School, Bengaluru',
        registeredAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        status: 'Confirmed',
        teamSize: 3,
        participants: [
            { name: 'Neil Fernandez', grade: '12' },
            { name: 'Aditya Menon', grade: '12' },
            { name: 'Karthik Swaminathan', grade: '11' }
        ],
        notes: 'Registered online via public portal.'
    }
];

const TeamsStore = {
    init() {
        const existing = localStorage.getItem(TEAMS_STORAGE_KEY);
        if (!existing) {
            localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(INITIAL_SAMPLE_TEAMS));
        }
    },

    getAll() {
        this.init();
        try {
            const data = localStorage.getItem(TEAMS_STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Failed to parse teams data', e);
            return [];
        }
    },

    getById(id) {
        const teams = this.getAll();
        return teams.find(t => t.id === id || t.team_id === id) || null;
    },

    /**
     * Adds team via API and updates localStorage
     */
    async add(teamData) {
        let teamRecord = null;

        // Try API submission to backend
        try {
            const res = await fetch('/api/teams/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teamName: teamData.teamName || teamData.team_name,
                    schoolName: teamData.schoolName || teamData.school_name,
                    teamSize: teamData.teamSize || teamData.team_size || (teamData.participants ? teamData.participants.length : 1),
                    participants: teamData.participants || [],
                    status: teamData.status || 'Confirmed',
                    notes: teamData.notes || 'Registered through Aarohan Portal'
                })
            });

            if (res.ok) {
                const json = await res.json();
                if (json.team) {
                    teamRecord = {
                        id: json.team.team_id,
                        team_id: json.team.team_id,
                        teamName: json.team.team_name,
                        schoolName: json.team.school_name,
                        teamSize: json.team.team_size,
                        participants: json.team.participants,
                        registeredAt: json.team.registered_at,
                        status: json.team.status,
                        notes: json.team.notes
                    };
                }
            }
        } catch (err) {
            console.log('Backend API not reached; persisting in local client storage.');
        }

        // Fallback / local sync
        if (!teamRecord) {
            const randomNum = Math.floor(1000 + Math.random() * 9000);
            const newId = teamData.id || `AAR-2026-${randomNum}`;
            teamRecord = {
                id: newId,
                team_id: newId,
                teamName: (teamData.teamName || teamData.team_name).trim(),
                schoolName: (teamData.schoolName || teamData.school_name).trim(),
                registeredAt: teamData.registeredAt || new Date().toISOString(),
                status: teamData.status || 'Confirmed',
                teamSize: Number(teamData.teamSize || (teamData.participants ? teamData.participants.length : 1)),
                participants: teamData.participants || [],
                notes: teamData.notes || 'Registered through Aarohan Portal'
            };
        }

        const teams = this.getAll();
        teams.unshift(teamRecord);
        localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(teams));
        return teamRecord;
    },

    async updateStatus(id, newStatus) {
        // Try backend
        try {
            const session = (window.AuthService && window.AuthService.getSession()) || {};
            await fetch(`/api/admin/teams/${id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Key': session.token || 'aarohan2026'
                },
                body: JSON.stringify({ status: newStatus })
            });
        } catch (e) {}

        const teams = this.getAll();
        const index = teams.findIndex(t => (t.id === id || t.team_id === id));
        if (index === -1) return false;

        teams[index].status = newStatus;
        localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(teams));
        return true;
    },

    async delete(id) {
        // Try backend
        try {
            const session = (window.AuthService && window.AuthService.getSession()) || {};
            await fetch(`/api/admin/teams/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-Admin-Key': session.token || 'aarohan2026'
                }
            });
        } catch (e) {}

        const teams = this.getAll();
        const filtered = teams.filter(t => t.id !== id && t.team_id !== id);
        if (filtered.length === teams.length) return false;

        localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(filtered));
        return true;
    },

    async syncWithBackend() {
        try {
            const session = (window.AuthService && window.AuthService.getSession()) || {};
            const res = await fetch('/api/admin/teams', {
                headers: { 'X-Admin-Key': session.token || 'aarohan2026' }
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.teams) {
                    const mapped = data.teams.map(t => ({
                        id: t.team_id,
                        team_id: t.team_id,
                        teamName: t.team_name,
                        schoolName: t.school_name,
                        teamSize: t.team_size,
                        participants: t.participants,
                        registeredAt: t.registered_at,
                        status: t.status,
                        notes: t.notes
                    }));
                    localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(mapped));
                    return mapped;
                }
            }
        } catch (e) {}
        return this.getAll();
    },

    resetSampleData() {
        localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(INITIAL_SAMPLE_TEAMS));
        try {
            const session = (window.AuthService && window.AuthService.getSession()) || {};
            fetch('/api/admin/teams/reset', {
                method: 'POST',
                headers: { 'X-Admin-Key': session.token || 'aarohan2026' }
            }).catch(() => {});
        } catch (e) {}
        return INITIAL_SAMPLE_TEAMS;
    },

    getStats() {
        const teams = this.getAll();
        const totalTeams = teams.length;
        const totalParticipants = teams.reduce((acc, t) => acc + (t.participants ? t.participants.length : (t.teamSize || 0)), 0);
        const uniqueSchools = new Set(teams.map(t => (t.schoolName || '').trim().toLowerCase())).size;
        
        const confirmed = teams.filter(t => t.status === 'Confirmed').length;
        const pending = teams.filter(t => t.status === 'Pending').length;
        const waitlisted = teams.filter(t => t.status === 'Waitlisted').length;
        const avgTeamSize = totalTeams > 0 ? (totalParticipants / totalTeams).toFixed(1) : 0;

        return {
            totalTeams,
            totalParticipants,
            uniqueSchools,
            confirmed,
            pending,
            waitlisted,
            avgTeamSize
        };
    }
};

TeamsStore.init();
window.TeamsStore = TeamsStore;
