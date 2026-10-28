/**
 * Aarohan '26 - Admin Authentication System
 * Handles secure session management, login validation, and access control guards.
 */

const AUTH_CONFIG = {
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'aarohan2026',
    SESSION_STORAGE_KEY: 'aarohan_admin_session',
    LOCAL_STORAGE_KEY: 'aarohan_admin_remembered'
};

const AuthService = {
    /**
     * Checks if the admin is currently authenticated.
     * @returns {boolean}
     */
    isAuthenticated() {
        const session = sessionStorage.getItem(AUTH_CONFIG.SESSION_STORAGE_KEY) ||
                        localStorage.getItem(AUTH_CONFIG.LOCAL_STORAGE_KEY);
        if (!session) return false;

        try {
            const data = JSON.parse(session);
            // Session expires after 24 hours
            if (data && data.timestamp && (Date.now() - data.timestamp < 24 * 60 * 60 * 1000)) {
                return true;
            }
            this.logout();
            return false;
        } catch (e) {
            this.logout();
            return false;
        }
    },

    /**
     * Authenticates the admin with credentials.
     * @param {string} username
     * @param {string} password
     * @param {boolean} rememberMe
     * @returns {{ success: boolean, message?: string }}
     */
    login(username, password, rememberMe = false) {
        const cleanUser = (username || '').trim().toLowerCase();
        const cleanPass = (password || '').trim();

        if (!cleanUser || !cleanPass) {
            return { success: false, message: 'Please enter both username and password.' };
        }

        // Validate credentials (supports username 'admin' or 'admin@aarohan.org')
        if ((cleanUser === AUTH_CONFIG.ADMIN_USERNAME || cleanUser === 'admin@aarohan.org') &&
            cleanPass === AUTH_CONFIG.ADMIN_PASSWORD) {
            
            const sessionData = {
                user: 'Aarohan Administrator',
                username: cleanUser,
                role: 'SuperAdmin',
                timestamp: Date.now()
            };

            const serialized = JSON.stringify(sessionData);
            sessionStorage.setItem(AUTH_CONFIG.SESSION_STORAGE_KEY, serialized);

            if (rememberMe) {
                localStorage.setItem(AUTH_CONFIG.LOCAL_STORAGE_KEY, serialized);
            } else {
                localStorage.removeItem(AUTH_CONFIG.LOCAL_STORAGE_KEY);
            }

            return { success: true };
        }

        return { 
            success: false, 
            message: 'Invalid administrator credentials. Please check your username and password.' 
        };
    },

    /**
     * Logs out the current admin and clears credentials.
     */
    logout() {
        sessionStorage.removeItem(AUTH_CONFIG.SESSION_STORAGE_KEY);
        localStorage.removeItem(AUTH_CONFIG.LOCAL_STORAGE_KEY);
        window.location.href = 'admin-login.html';
    },

    /**
     * Retrieves current active admin session details.
     * @returns {object|null}
     */
    getSession() {
        const session = sessionStorage.getItem(AUTH_CONFIG.SESSION_STORAGE_KEY) ||
                        localStorage.getItem(AUTH_CONFIG.LOCAL_STORAGE_KEY);
        if (!session) return null;
        try {
            return JSON.parse(session);
        } catch (e) {
            return null;
        }
    },

    /**
     * Route protection guard for the admin dashboard.
     * Redirects to admin-login.html if not authenticated.
     */
    guardAdminPage() {
        if (!this.isAuthenticated()) {
            const currentUrl = encodeURIComponent(window.location.pathname.split('/').pop() || 'admin.html');
            window.location.href = `admin-login.html?redirect=${currentUrl}`;
        }
    },

    /**
     * Redirects away from login page if already authenticated.
     */
    guardLoginPage() {
        if (this.isAuthenticated()) {
            window.location.href = 'admin.html';
        }
    }
};

window.AuthService = AuthService;
