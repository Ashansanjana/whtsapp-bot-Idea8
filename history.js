/**
 * History Manager for PizzaBot — WhatsApp Conversation Session Management
 *
 * Features:
 *  - Per-user conversation history stored in memory
 *  - 30-minute inactivity timeout (session auto-resets)
 *  - Smart history trimming (always preserves language selection — first 2 messages)
 *  - Manual reset via trigger keywords ("restart", "reset", "menu", "මෙනු")
 *  - Periodic cleanup of expired sessions to prevent memory leaks
 */

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Run cleanup every 10 minutes

// Keywords that trigger a full session reset
const RESET_KEYWORDS = ['restart', 'reset', 'start over', 'නැවත', 'start', 'hi', 'hello', 'හෙලෝ', 'ආයුබෝවන්'];

class HistoryManager {
    /**
     * @param {number} limit - Max messages to keep per session (default: 30)
     */
    constructor(limit = 30) {
        this.limit = limit;

        // Map of chatId → { messages: [], lastActivity: Date, language: null }
        this.sessions = new Map();

        // Start periodic cleanup of expired sessions
        this._cleanupTimer = setInterval(() => this._cleanupExpiredSessions(), CLEANUP_INTERVAL_MS);

        // Allow Node.js to exit even if this timer is running
        if (this._cleanupTimer.unref) {
            this._cleanupTimer.unref();
        }
    }

    // ─────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────

    /**
     * Check if the incoming message should trigger a session reset.
     * Call this BEFORE addMessage / getMessages.
     * @param {string} chatId
     * @param {string} messageText
     * @returns {boolean} true if session was reset
     */
    checkAndReset(chatId, messageText) {
        const session = this.sessions.get(chatId);

        // Reset on inactivity timeout
        if (session && this._isExpired(session)) {
            console.log(`⏰ Session expired for ${chatId} — resetting`);
            this.clearHistory(chatId);
            return true;
        }

        // Reset on trigger keywords (only if session already exists)
        if (session && messageText) {
            const lower = messageText.trim().toLowerCase();
            const isResetKeyword = RESET_KEYWORDS.some(kw => lower === kw);
            if (isResetKeyword) {
                console.log(`🔄 Manual reset triggered by "${messageText}" for ${chatId}`);
                this.clearHistory(chatId);
                return true;
            }
        }

        return false;
    }

    /**
     * Add a message to the conversation history.
     * @param {string} chatId
     * @param {{ role: string, content: string }} message
     */
    addMessage(chatId, message) {
        if (!this.sessions.has(chatId)) {
            this.sessions.set(chatId, { messages: [], lastActivity: Date.now() });
        }

        const session = this.sessions.get(chatId);
        session.messages.push(message);
        session.lastActivity = Date.now();

        // Smart trim: always keep first 2 messages (language selection exchange)
        // then trim the oldest messages from position 2 onward
        if (session.messages.length > this.limit) {
            const protected_ = session.messages.slice(0, 2);   // language selection
            const rest = session.messages.slice(2);             // rest of conversation
            const trimmed = rest.slice(rest.length - (this.limit - 2));
            session.messages = [...protected_, ...trimmed];
        }
    }

    /**
     * Get conversation history for a chat.
     * Also updates lastActivity timestamp.
     * @param {string} chatId
     * @returns {Array<{ role: string, content: string }>}
     */
    getMessages(chatId) {
        const session = this.sessions.get(chatId);
        if (!session) return [];
        session.lastActivity = Date.now();
        return session.messages;
    }

    /**
     * Clear all history for a chat (full session reset).
     * @param {string} chatId
     */
    clearHistory(chatId) {
        this.sessions.delete(chatId);
    }

    /**
     * Get number of active sessions (for monitoring/logging).
     * @returns {number}
     */
    getActiveSessionCount() {
        return this.sessions.size;
    }

    /**
     * Stop the cleanup timer (call on graceful shutdown).
     */
    destroy() {
        if (this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
        }
    }

    // ─────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────

    /**
     * Check if a session has exceeded the inactivity timeout.
     * @param {{ lastActivity: number }} session
     * @returns {boolean}
     */
    _isExpired(session) {
        return Date.now() - session.lastActivity > SESSION_TIMEOUT_MS;
    }

    /**
     * Remove all sessions that have been inactive beyond the timeout.
     * Called automatically every 10 minutes.
     */
    _cleanupExpiredSessions() {
        let removed = 0;
        for (const [chatId, session] of this.sessions.entries()) {
            if (this._isExpired(session)) {
                this.sessions.delete(chatId);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`🧹 Session cleanup: removed ${removed} expired session(s). Active: ${this.sessions.size}`);
        }
    }
}

module.exports = HistoryManager;
