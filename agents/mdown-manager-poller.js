"use strict";

// MDown Manager activity poller.
//
// MDown Manager isn't a coding agent — it's a separate local app with its
// own local HTTP API (bearer-token auth, http://127.0.0.1:7734 by default).
// This polls that API and drives Clawd's own state machine the same way
// agents/codex-log-monitor.js drives it from JSONL tailing, except over HTTP
// instead of a file tail. MDown Manager has no session concept, so it's
// represented as a single persistent pseudo-session.

const DEFAULT_POLL_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 3000;
const SESSION_ID = "mdown-manager";

// MDown Manager `kind` -> Clawd state. Chosen to reuse the MDM theme's
// existing states/files (themes/mdown-manager/theme.json) — no new SVGs.
const KIND_TO_STATE = {
  idle: "idle",
  scanning: "sweeping", // security-scan connotation
  summarizing: "thinking",
  embedding: "working",
  error: "error",
};

const KIND_TO_EVENT = {
  idle: "McpIdle",
  scanning: "McpScanning",
  summarizing: "McpSummarizing",
  embedding: "McpIndexing",
  error: "McpScanError",
};

class MdownManagerPoller {
  /**
   * @param {function} getConfig - () => { baseUrl, apiKey }
   * @param {function} onStateChange - (sessionId, state, event, extra) => void
   * @param {object} options - { pollIntervalMs, fetchImpl }
   */
  constructor(getConfig, onStateChange, options = {}) {
    this._getConfig = getConfig;
    this._onStateChange = onStateChange;
    this._intervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    this._fetchImpl = options.fetchImpl || globalThis.fetch;
    this._interval = null;
    this._lastKind = null;
    // Older MDown Manager builds don't have GET /activity yet (a 404 there
    // is permanent for the life of that install, not transient) — once seen,
    // fall back to /health-only liveness instead of re-probing every poll.
    this._activityUnavailable = false;
  }

  start() {
    if (this._interval) return;
    this._poll();
    this._interval = setInterval(() => this._poll(), this._intervalMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._lastKind = null;
    this._activityUnavailable = false;
  }

  async _poll() {
    const config = this._getConfig() || {};
    const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
    const apiKey = String(config.apiKey || "");
    if (!baseUrl || !apiKey) return;

    if (this._activityUnavailable) {
      await this._pollHealthOnly(baseUrl);
      return;
    }

    const result = await this._request(`${baseUrl}/activity`, apiKey);
    if (result === "not-found") {
      this._activityUnavailable = true;
      await this._pollHealthOnly(baseUrl);
      return;
    }
    if (!result || typeof result !== "object") return; // offline / unauthorized — stay quiet, don't spam

    const kind = Object.prototype.hasOwnProperty.call(KIND_TO_STATE, result.kind)
      ? result.kind
      : "idle";
    this._emit(kind);
  }

  async _pollHealthOnly(baseUrl) {
    const reachable = await this._request(`${baseUrl}/health`, null, { skipAuth: true });
    if (reachable) this._emit("idle");
  }

  _emit(kind) {
    if (kind === this._lastKind) return;
    this._lastKind = kind;
    const state = KIND_TO_STATE[kind] || "idle";
    const event = KIND_TO_EVENT[kind] || "McpIdle";
    this._onStateChange(SESSION_ID, state, event, { agentId: "mdown-manager", headless: false });
  }

  // Returns: parsed JSON body on 200, "not-found" on 404, true for a
  // skipAuth reachability check, or null on any other failure (network
  // error, timeout, non-2xx). Never throws.
  async _request(url, apiKey, { skipAuth = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    if (timer && typeof timer.unref === "function") timer.unref();
    try {
      const headers = skipAuth ? {} : { Authorization: `Bearer ${apiKey}` };
      const res = await this._fetchImpl(url, { headers, signal: controller.signal });
      if (res.status === 404) return "not-found";
      if (!res.ok) return null;
      if (skipAuth) return true;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = MdownManagerPoller;
