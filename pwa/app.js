(function() {
  "use strict";

  // === Constants ===

  var STATE_CONFIG = {
    error:        { icon: "error",        color: "#ef4444", priority: 0, label: "Error" },
    attention:    { icon: "attention",    color: "#b45309", priority: 1, label: "Attention" },
    working:      { icon: "working",      color: "#22c55e", priority: 2, label: "Working" },
    juggling:     { icon: "juggling",     color: "#22c55e", priority: 2, label: "Juggling" },
    thinking:     { icon: "thinking",     color: "#3b82f6", priority: 3, label: "Thinking" },
    notification: { icon: "notification", color: "#d97757", priority: 4, label: "Notification" },
    sweeping:     { icon: "sweeping",     color: "#71717a", priority: 5, label: "Sweeping" },
    carrying:     { icon: "carrying",     color: "#71717a", priority: 5, label: "Carrying" },
    idle:         { icon: "idle",         color: "#71717a", priority: 6, label: "Idle" },
    sleeping:     { icon: "sleeping",     color: "#a1a1aa", priority: 7, label: "Sleeping" },
  };

  var CONNECTION_STATES = {
    connected:    { dot: "connected", text: "Connected", color: "#22c55e" },
    connecting:   { dot: "connecting", text: "Connecting...", color: "#b45309" },
    reconnecting: { dot: "reconnecting", text: "Reconnecting...", color: "#ef4444" },
    disconnected: { dot: "", text: "Offline", color: "#52525b" },
    auth_failed:  { dot: "", text: "Auth Failed", color: "#ef4444" },
  };

  var EVENT_LABELS_CN = {
    UserPromptSubmit: "User Input", PreToolUse: "Tool Start", PostToolUse: "Tool Complete",
    PostToolUseFailure: "Tool Failed", Stop: "Completed", SessionStart: "Session Start",
    SessionEnd: "Session End", PermissionRequest: "Permission", Notification: "Notification",
    SubagentStart: "Subagent Start", SubagentStop: "Subagent Stop",
  };

  var MACHINES_KEY = "clawd-machines";
  var LEGACY_HISTORY_KEY = "clawd-history";
  var MAX_MACHINES = 12;
  var MAX_HISTORY = 5;
  var MAX_LOG_LINES = 200;
  var _logBuffer = [];

  // === Utilities ===

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function icon(name) {
    return (typeof ICONS !== "undefined" && ICONS[name]) || "";
  }

  function shortPath(p) {
    if (!p) return "";
    var parts = p.split(/[/\\]/);
    return parts.length > 3 ? ".../" + parts.slice(-2).join("/") : p;
  }

  function formatAgo(ts) {
    if (!ts) return "";
    var sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return sec + "s ago";
    if (sec < 3600) return Math.floor(sec / 60) + "m ago";
    return Math.floor(sec / 3600) + "h ago";
  }

  function eventLabel(eventName) {
    return EVENT_LABELS_CN[eventName] || (typeof EVENT_LABELS !== "undefined" && EVENT_LABELS[eventName]) || eventName || "";
  }

  var EVENT_ICONS = {
    UserPromptSubmit: "💬", PreToolUse: "⚙️", PostToolUse: "✅",
    PostToolUseFailure: "❌", Stop: "🏁", StopFailure: "❌",
    SessionStart: "▶️", SessionEnd: "⏹️",
    PermissionRequest: "🔒", Notification: "🔔",
    SubagentStart: "🔀", SubagentStop: "🔀",
    AfterAgent: "✅", ApiError: "❌",
    Elicitation: "❓", WorktreeCreate: "🌿",
  };

  function eventIcon(eventName) {
    return EVENT_ICONS[eventName] || "●";
  }

  function log(msg, machineName) {
    var now = new Date();
    var ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(function(n) { return String(n).padStart(2, "0"); }).join(":");
    var prefix = machineName ? "[" + machineName + "] " : "";
    var line = "[" + ts + "] " + prefix + msg;
    _logBuffer.push(line);
    if (_logBuffer.length > MAX_LOG_LINES) _logBuffer.shift();
    var el = document.getElementById("settings-log-content");
    if (el) {
      var div = document.createElement("div");
      div.textContent = line;
      el.appendChild(div);
      el.scrollTop = el.scrollHeight;
    }
  }

  function showToast(message, type, persist) {
    type = type || "info";
    var container = document.getElementById("toast-container");
    var toast = document.createElement("div");
    toast.className = "toast " + type + (persist ? " toast-persist" : "");
    toast.textContent = message;
    if (persist) {
      var close = document.createElement("span");
      close.className = "toast-close";
      close.textContent = "✕";
      close.onclick = function() { toast.remove(); };
      toast.appendChild(close);
    }
    container.appendChild(toast);
    if (!persist) {
      setTimeout(function() {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(function() { toast.remove(); }, 300);
      }, 3000);
    }
  }

  // === Pairing input parsing ===
  // Accepts a full pairUrl (http://ip:port/mobile/?host=..&port=..&token=..&name=..)
  // or a bare query string. Returns { host, port, token, name } or null.
  function parsePairInput(text) {
    if (!text || typeof text !== "string") return null;
    var trimmed = text.trim();
    if (!trimmed) return null;
    var url;
    try {
      if (/^[a-z]+:\/\//i.test(trimmed)) {
        url = new URL(trimmed);
      } else if (trimmed.indexOf("=") !== -1) {
        url = new URL("http://x/?" + trimmed.replace(/^\?/, ""));
      } else {
        return null;
      }
    } catch (e) { return null; }
    var host = url.searchParams.get("host");
    var portRaw = url.searchParams.get("port");
    var token = url.searchParams.get("token");
    var name = url.searchParams.get("name");
    var port = parseInt(portRaw, 10);
    if (!host || !token || !Number.isInteger(port) || port <= 0) return null;
    return { host: host, port: port, token: token, name: name || null };
  }

  // === NotificationManager ===

  class NotificationManager {
    constructor() { this.permission = "default"; this.lastStates = new Map(); }

    requestPermission() {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") { this.permission = "granted"; return; }
      if (Notification.permission !== "denied") {
        var self = this;
        Notification.requestPermission().then(function(p) { self.permission = p; });
      }
    }

    onStateChange(compositeId, data, machineName) {
      if (this.permission !== "granted" || document.visibilityState === "visible") return;
      var prev = this.lastStates.get(compositeId);
      this.lastStates.set(compositeId, data.state);
      var s = data.state;
      var config = STATE_CONFIG[s];
      if (!config) return;
      var label = data.title || data.agentId || "Agent";
      var suffix = machineName ? " · " + machineName : "";
      if (s === "error" || s === "attention") {
        this._notify(config.label, label + suffix + " - " + config.label, s);
      } else if ((prev === "working" || prev === "thinking") && s === "idle") {
        this._notify("Task Complete", label + suffix + " task completed", "idle");
      }
    }

    _notify(title, body, tag) {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(function(reg) {
            reg.showNotification(title, { body: body, tag: "clawd-" + (tag || "default"), icon: "/mobile/icons/icon-256.png" });
          });
        } else {
          new Notification(title, { body: body, tag: "clawd-" + (tag || "default") });
        }
      } catch {}
    }
  }

  // === MachineConnection (one persistent WS connection to one machine) ===

  class MachineConnection {
    constructor(record, handlers) {
      this.id = record.id;
      this.name = record.name;
      this.host = record.host;
      this.port = record.port;
      this.token = record.token;
      this.ws = null;
      this.reconnectDelay = 1000; this.maxReconnectDelay = 30000;
      this.reconnectTimer = null; this.state = "disconnected";
      this.retryCount = 0;
      this.handlers = handlers || {};
      this._hiddenAt = 0;
      this._bindVisibility();
    }

    updateRecord(record) {
      this.name = record.name;
      this.host = record.host;
      this.port = record.port;
      this.token = record.token;
    }

    connect() {
      this.retryCount = 0;
      this.reconnectDelay = 1000;
      clearTimeout(this.reconnectTimer);
      this._doConnect();
    }

    disconnect() {
      clearTimeout(this.reconnectTimer);
      var old = this.ws;
      this.ws = null;
      if (old) {
        old.onopen = old.onmessage = old.onclose = old.onerror = null;
        try { old.close(); } catch {}
      }
    }

    _doConnect() {
      var old = this.ws;
      if (old) {
        old.onopen = old.onmessage = old.onclose = old.onerror = null;
        try { old.close(); } catch {}
      }
      var url = "ws://" + this.host + ":" + this.port + "/ws?token=" + this.token;
      this._setState("connecting");
      log("Connecting to " + this.host + ":" + this.port + "...", this.name);
      var socket;
      try { socket = new WebSocket(url); } catch (err) { log("WS create failed: " + err.message, this.name); this._scheduleReconnect(); return; }
      this.ws = socket;
      var self = this;
      var connected = false;
      socket.onopen = function() {
        if (socket !== self.ws) return; // stale socket — ignore
        connected = true; self.retryCount = 0; self.reconnectDelay = 1000;
        self._setState("connected"); log("Connected", self.name);
        var persisted = document.querySelectorAll(".toast-persist");
        for (var i = 0; i < persisted.length; i++) { persisted[i].remove(); }
        // Strip query params from URL so stale ?token= from QR codes
        // won't overwrite a rotated token in history on next auto-connect.
        if (window.location.search) { history.replaceState(null, "", window.location.pathname); }
      };
      socket.onmessage = function(event) {
        if (socket !== self.ws) return;
        try {
          var msg = JSON.parse(event.data);
          if (self.handlers.onMessage) self.handlers.onMessage(self, msg);
        } catch {}
      };
      socket.onclose = function(event) {
        if (socket !== self.ws) return; // stale socket — ignore
        if (event.code === 1008) { self._setState("auth_failed"); log("Auth failed", self.name); showToast((self.name || self.host) + ": Token expired, please re-add", "error"); return; }
        if (connected) log("Disconnected (code: " + event.code + ")", self.name);
        if (self.handlers.onDisconnected) self.handlers.onDisconnected(self);
        self._scheduleReconnect();
      };
      socket.onerror = function() {};
    }

    _scheduleReconnect() {
      this.retryCount++;
      this._setState("reconnecting");
      if (this.retryCount === 5) {
        showToast((this.name || this.host) + ": reconnecting... check if device is online", "info", true);
      }
      var self = this;
      this.reconnectTimer = setTimeout(function() { self.reconnectDelay = Math.min(self.reconnectDelay * 2, self.maxReconnectDelay); self._doConnect(); }, this.reconnectDelay);
    }

    _setState(state) {
      this.state = state;
      if (this.handlers.onStateChange) this.handlers.onStateChange(this, state);
    }

    _bindVisibility() {
      var self = this;
      this._visibilityHandler = function() {
        if (document.visibilityState !== "visible") {
          self._hiddenAt = Date.now();
          return;
        }
        var hiddenFor = self._hiddenAt ? Date.now() - self._hiddenAt : 0;
        if (hiddenFor < 30000 && self.ws && self.ws.readyState === WebSocket.OPEN) return;
        self.retryCount = 0;
        self.reconnectDelay = 1000;
        clearTimeout(self.reconnectTimer);
        self._doConnect();
      };
      document.addEventListener("visibilitychange", this._visibilityHandler);
    }

    teardown() {
      this.disconnect();
      document.removeEventListener("visibilitychange", this._visibilityHandler);
    }
  }

  // === MachineManager (owns the list of machines + their connections) ===

  class MachineManager {
    constructor(handlers) {
      this.handlers = handlers || {};
      this.machines = new Map(); // id -> { id, name, host, port, token, conn }
      this._load();
    }

    list() {
      var out = [];
      this.machines.forEach(function(m) {
        out.push({ id: m.id, name: m.name, host: m.host, port: m.port, state: m.conn ? m.conn.state : "disconnected" });
      });
      return out;
    }

    get(id) { return this.machines.get(id); }

    _load() {
      var raw = null;
      try { raw = JSON.parse(localStorage.getItem(MACHINES_KEY) || "null"); } catch {}
      if (!Array.isArray(raw)) {
        raw = this._migrateLegacyHistory();
      }
      var self = this;
      (raw || []).forEach(function(entry) {
        if (!entry || !entry.host || !entry.port || !entry.token) return;
        self._register(entry, false);
      });
    }

    _migrateLegacyHistory() {
      var history = null;
      try { history = JSON.parse(localStorage.getItem(LEGACY_HISTORY_KEY) || "null"); } catch {}
      if (!Array.isArray(history) || !history.length) return [];
      return history.slice(0, 1).map(function(h) {
        return { id: h.host + ":" + h.port, name: h.host, host: h.host, port: h.port, token: h.token };
      });
    }

    _persist() {
      var out = [];
      this.machines.forEach(function(m) {
        out.push({ id: m.id, name: m.name, host: m.host, port: m.port, token: m.token });
      });
      try { localStorage.setItem(MACHINES_KEY, JSON.stringify(out)); } catch {}
    }

    _register(entry, persist) {
      var id = entry.id || (entry.host + ":" + entry.port);
      var existing = this.machines.get(id);
      if (existing) {
        existing.name = entry.name || existing.name;
        existing.token = entry.token;
        existing.conn.updateRecord(existing);
        existing.conn.connect();
        if (persist) this._persist();
        return existing;
      }
      var record = { id: id, name: entry.name || entry.host, host: entry.host, port: entry.port, token: entry.token, conn: null };
      var self = this;
      record.conn = new MachineConnection(record, {
        onStateChange: function(conn, state) { if (self.handlers.onStatusChange) self.handlers.onStatusChange(record, state); },
        onMessage: function(conn, msg) {
          if (
            msg && msg.type === "snapshot" && typeof msg.machineName === "string" && msg.machineName
            && !record.userNamed && record.name !== msg.machineName
          ) {
            record.name = msg.machineName;
            record.conn.name = msg.machineName;
            self._persist();
          }
          if (self.handlers.onMessage) self.handlers.onMessage(record, msg);
        },
        onDisconnected: function() { if (self.handlers.onStatusChange) self.handlers.onStatusChange(record, "disconnected"); },
      });
      this.machines.set(id, record);
      record.conn.connect();
      if (persist) this._persist();
      return record;
    }

    addMachine(input) {
      if (!input || !input.host || !input.port || !input.token) {
        return { ok: false, error: "Host / Port / Token required" };
      }
      if (this.machines.size >= MAX_MACHINES && !this.machines.has(input.host + ":" + input.port)) {
        return { ok: false, error: "Maximum " + MAX_MACHINES + " machines supported" };
      }
      var record = this._register({
        id: input.host + ":" + input.port,
        name: input.name || input.host,
        host: input.host,
        port: input.port,
        token: input.token,
      }, true);
      if (input.name) record.userNamed = true;
      return { ok: true, machine: record };
    }

    removeMachine(id) {
      var record = this.machines.get(id);
      if (!record) return;
      record.conn.teardown();
      this.machines.delete(id);
      this._persist();
      if (this.handlers.onRemoved) this.handlers.onRemoved(record);
    }

    connectAll() {
      this.machines.forEach(function(m) { m.conn.connect(); });
    }
  }

  // === SessionRenderer ===

  class SessionRenderer {
    constructor(container) {
      this.container = container;
      this.sessions = new Map(); // compositeId -> session data (with machineId attached)
      this.machinesMeta = []; // [{id, name, state}]
      this.staleTimer = null;
      this.expandedSet = new Set();
      this._startTimerUpdater();
    }

    updateMachines(list) { this.machinesMeta = list; this.render(); }

    _compositeId(machineId, sessionId) { return machineId + "::" + sessionId; }

    updateFromSnapshot(machineId, sessions) {
      for (var key of Array.from(this.sessions.keys())) {
        if (key.indexOf(machineId + "::") === 0) this.sessions.delete(key);
      }
      for (var sid in sessions) {
        if (!sessions.hasOwnProperty(sid)) continue;
        var data = sessions[sid];
        data.machineId = machineId;
        this.sessions.set(this._compositeId(machineId, sid), data);
      }
      this.render();
    }

    updateState(machineId, sessionId, data) {
      var compositeId = this._compositeId(machineId, sessionId);
      var existing = this.sessions.get(compositeId) || {};
      var merged = {}; for (var k in existing) { if (existing.hasOwnProperty(k)) merged[k] = existing[k]; }
      for (var k2 in data) { if (data.hasOwnProperty(k2)) merged[k2] = data[k2]; }
      merged.machineId = machineId;
      this.sessions.set(compositeId, merged);
      this.render();
    }

    removeSession(machineId, sessionId) {
      var compositeId = this._compositeId(machineId, sessionId);
      this.sessions.delete(compositeId);
      this.expandedSet.delete(compositeId);
      this.render();
    }

    removeMachineSessions(machineId) {
      for (var key of Array.from(this.sessions.keys())) {
        if (key.indexOf(machineId + "::") === 0) { this.sessions.delete(key); this.expandedSet.delete(key); }
      }
      this.render();
    }

    toggleExpand(compositeId) {
      var wasExpanded = this.expandedSet.has(compositeId);
      if (wasExpanded) this.expandedSet.delete(compositeId); else this.expandedSet.add(compositeId);
      this._animatingSid = compositeId;
      this.render();
    }

    render() {
      var self = this;

      if (this.machinesMeta.length === 0) {
        this.container.innerHTML = '<div class="empty-state"><div class="empty-icon">' + icon("paw") + '</div>' +
          '<div class="empty-text">Add devices to get started</div>' +
          '<div class="empty-hint">Go to Devices tab to add a desktop</div></div>';
        return;
      }

      var byMachine = new Map();
      this.sessions.forEach(function(v, k) {
        var mid = v.machineId;
        if (!byMachine.has(mid)) byMachine.set(mid, []);
        byMachine.get(mid).push([k, v]);
      });

      var totalSessions = this.sessions.size;
      var html = '<div class="section-label">Active Sessions &middot; ' + totalSessions + '</div>';

      var machinesSorted = this.machinesMeta.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });
      for (var mi = 0; mi < machinesSorted.length; mi++) {
        var machine = machinesSorted[mi];
        var entries = byMachine.get(machine.id) || [];
        entries.sort(function(a, b) {
          var pa = (STATE_CONFIG[a[1].state] || STATE_CONFIG.idle).priority;
          var pb = (STATE_CONFIG[b[1].state] || STATE_CONFIG.idle).priority;
          return pa - pb;
        });

        var stateCfg = CONNECTION_STATES[machine.state] || CONNECTION_STATES.disconnected;
        var isOffline = machine.state !== "connected";
        html += '<div class="machine-group' + (isOffline ? ' offline' : '') + '">';
        html += '<div class="machine-group-header"><span class="machine-status-dot ' + (stateCfg.dot || "") + '"></span>';
        html += '<span class="machine-group-name">' + esc(machine.name) + '</span>';
        if (isOffline) html += '<span class="machine-group-state">' + esc(stateCfg.text) + '</span>';
        html += '</div>';

        if (entries.length === 0) {
          html += '<div class="machine-group-empty">' + (isOffline ? "Waiting to connect..." : "No active sessions") + '</div>';
        } else {
          for (var i = 0; i < entries.length; i++) html += this._renderCard(entries[i][0], entries[i][1]);
        }
        html += '</div>';
      }

      this.container.innerHTML = html;
      this.container.querySelectorAll(".card-footer").forEach(function(el) {
        el.addEventListener("click", function() { self.toggleExpand(this.getAttribute("data-sid")); });
      });
      if (this._animatingSid) {
        var animatingSid = this._animatingSid;
        this._animatingSid = null;
        if (this.expandedSet.has(animatingSid)) {
          var cards = this.container.querySelectorAll('.session-card');
          cards.forEach(function(card) {
            var footer = card.querySelector('.card-footer');
            if (footer && footer.getAttribute('data-sid') === animatingSid) {
              var eh = card.querySelector('.event-history');
              if (eh) requestAnimationFrame(function() { eh.classList.add('show'); });
            }
          });
        }
      }
    }

    _renderCard(compositeId, s) {
      var config = STATE_CONFIG[s.state] || STATE_CONFIG.idle;
      var isExpanded = this.expandedSet.has(compositeId);
      var events = s.recentEvents || [];
      var stateKey = s.state || "idle";
      var agentLabel = (s.agentId || "agent").toUpperCase();
      var sessionTitle = s.title || "";
      var html = '<div class="session-card">';
      html += '<div class="card-header"><div class="card-agent"><div class="agent-dot"></div>';
      html += '<span class="agent-name">' + esc(agentLabel) + '</span></div>';
      html += '<span class="state-badge ' + stateKey + '">' + config.label + '</span></div>';
      if (sessionTitle) html += '<div class="card-title">' + esc(sessionTitle) + '</div>';
      html += '<div class="card-meta">';
      if (s.basename) { html += '<span class="meta-item mono">' + icon("folder") + '<span>' + esc(s.basename) + '</span></span>'; }
      if (s.updatedAt) { html += '<span class="meta-sep">&middot;</span><span class="meta-item meta-time" data-ts="' + s.updatedAt + '">' + formatAgo(s.updatedAt) + '</span>'; }
      html += '</div>';
      html += '<div class="card-divider"></div>';
      html += '<div class="card-footer" data-sid="' + compositeId + '"><div class="footer-events">' + icon("activity") + '<span>Recent Activity</span>';
      if (events.length) html += '<span class="event-count">' + events.length + '</span>';
      html += '</div><span class="footer-chevron">' + (isExpanded ? icon("collapse") : icon("expand")) + '</span></div>';
      if (events.length) html += this._renderEvents(events, isExpanded, this._animatingSid === compositeId);
      html += '</div>';
      return html;
    }

    _renderEvents(events, expanded, animate) {
      var showClass = (expanded && !animate) ? ' show' : '';
      var html = '<div class="event-history' + showClass + '"><div class="event-timeline">';
      for (var i = 0; i < events.length; i++) {
        var ev = events[i]; var c = STATE_CONFIG[ev.state] || STATE_CONFIG.idle;
        html += '<div class="event-row"><div class="event-dot" style="background:' + c.color + '"></div>';
        html += '<div class="event-line" style="background:' + c.color + '"></div>';
        html += '<span class="event-icon">' + eventIcon(ev.event) + '</span>';
        html += '<span class="event-label">' + esc(eventLabel(ev.event)) + '</span>';
        html += '<span class="event-time"' + (ev.at ? ' data-ts="' + ev.at + '"' : '') + '>' + formatAgo(ev.at) + '</span></div>';
      }
      return html + '</div></div>';
    }

    _startTimerUpdater() {
      var self = this;
      setInterval(function() {
        if (document.visibilityState !== 'visible') return;
        var els = self.container.querySelectorAll('.event-time[data-ts], .meta-time[data-ts]');
        for (var i = 0; i < els.length; i++) {
          var ts = parseInt(els[i].getAttribute('data-ts'), 10);
          if (!isNaN(ts)) els[i].textContent = formatAgo(ts);
        }
      }, 1000);
    }

    startStaleCleanup() {
      var self = this;
      this.staleTimer = setInterval(function() {
        var changed = false;
        self.sessions.forEach(function(s, compositeId) {
          if (s.state === "sleeping") { self.sessions.delete(compositeId); changed = true; }
        });
        if (changed) self.render();
      }, 15000);
    }
  }

  // === MachinesRenderer (device list + add-device form + log) ===

  class MachinesRenderer {
    constructor(container) { this.container = container; }

    render(machineManager) {
      var self = this;
      var machines = machineManager.list().sort(function(a, b) { return a.name.localeCompare(b.name); });
      var html = '';

      // Device list
      html += '<div class="settings-section">';
      html += '<div class="settings-section-title">Added Devices &middot; ' + machines.length + '</div>';
      if (machines.length === 0) {
        html += '<div class="machines-empty">No devices added</div>';
      } else {
        html += '<div class="machine-list">';
        for (var i = 0; i < machines.length; i++) {
          var m = machines[i];
          var stCfg = CONNECTION_STATES[m.state] || CONNECTION_STATES.disconnected;
          html += '<div class="machine-row">';
          html += '<span class="conn-status-dot ' + (stCfg.dot || "") + '"></span>';
          html += '<div class="machine-row-info"><div class="machine-row-name">' + esc(m.name) + '</div>';
          html += '<div class="machine-row-addr">' + esc(m.host) + ':' + m.port + ' &middot; ' + esc(stCfg.text) + '</div></div>';
          html += '<button class="machine-remove-btn" data-id="' + esc(m.id) + '">' + icon("x") + '</button>';
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';

      // Add device
      html += '<div class="settings-section">';
      html += '<div class="settings-section-title">Add Device</div>';
      html += '<p class="settings-tab-desc">Copy the connection URL from Desktop Settings → Mobile and paste below.</p>';

      // Discovery section
      html += '<div class="discovery-section">';
      html += '<button class="secondary-btn" id="btn-discover-machines">🔍 Discover Machines</button>';
      html += '<div class="discovery-results hidden" id="discovery-results"></div>';
      html += '</div>';

      html += '<div class="input-group"><textarea id="pair-input" rows="2" placeholder="http://192.168.x.x:23334/mobile/?host=...&amp;port=...&amp;token=..."></textarea></div>';
      html += '<div class="btn-group"><button class="primary-btn" id="btn-add-pair">Add</button>';
      html += '<button class="secondary-btn" id="btn-toggle-manual">Manual Entry</button></div>';

      html += '<div class="manual-form hidden" id="manual-form">';
      html += '<div class="input-group"><label>Name (Optional)</label><input type="text" id="manual-name" placeholder="My Laptop"></div>';
      html += '<div class="input-group"><label>Host / IP</label><input type="text" id="manual-host" placeholder="192.168.1.10"></div>';
      html += '<div class="input-group"><label>Port</label><input type="number" id="manual-port" placeholder="23334"></div>';
      html += '<div class="input-group"><label>Token</label><input type="text" id="manual-token" placeholder="token"></div>';
      html += '<div class="btn-group"><button class="primary-btn" id="btn-add-manual">Add Device</button></div>';
      html += '</div>';
      html += '</div>';

      // Log section (collapsed by default)
      html += '<div class="log-section">';
      html += '<button class="log-toggle" id="btn-toggle-log">Logs (' + _logBuffer.length + ')</button>';
      html += '<div class="log-body" id="settings-log-content"></div>';
      html += '</div>';

      this.container.innerHTML = html;

      var logEl = document.getElementById("settings-log-content");
      if (logEl) {
        for (var li = 0; li < _logBuffer.length; li++) {
          var div = document.createElement("div");
          div.textContent = _logBuffer[li];
          logEl.appendChild(div);
        }
      }

      var logToggle = document.getElementById("btn-toggle-log");
      var logBody = document.getElementById("settings-log-content");
      if (logToggle && logBody) {
        logToggle.addEventListener("click", function() {
          logToggle.classList.toggle("open");
          logBody.classList.toggle("open");
          if (logBody.classList.contains("open")) logBody.scrollTop = logBody.scrollHeight;
        });
      }

      this.container.querySelectorAll(".machine-remove-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          machineManager.removeMachine(this.getAttribute("data-id"));
        });
      });

      document.getElementById("btn-add-pair").addEventListener("click", function() {
        var text = document.getElementById("pair-input").value;
        var parsed = parsePairInput(text);
        if (!parsed) { showToast("Failed to parse connection info", "error"); return; }
        var result = machineManager.addMachine(parsed);
        if (!result.ok) { showToast(result.error, "error"); return; }
        showToast("Device added: " + result.machine.name, "success");
      });

      document.getElementById("btn-toggle-manual").addEventListener("click", function() {
        document.getElementById("manual-form").classList.toggle("hidden");
      });

      document.getElementById("btn-add-manual").addEventListener("click", function() {
        var name = document.getElementById("manual-name").value.trim();
        var hostVal = document.getElementById("manual-host").value.trim();
        var portVal = parseInt(document.getElementById("manual-port").value, 10);
        var tokenVal = document.getElementById("manual-token").value.trim();
        var result = machineManager.addMachine({ name: name, host: hostVal, port: portVal, token: tokenVal });
        if (!result.ok) { showToast(result.error, "error"); return; }
        showToast("Device added: " + result.machine.name, "success");
      });

      var self = this;
      document.getElementById("btn-discover-machines").addEventListener("click", function() {
        self.discover(machineManager);
      });
    }

    discover(machineManager) {
      var btn = document.getElementById("btn-discover-machines");
      var resultDiv = document.getElementById("discovery-results");
      btn.disabled = true;
      btn.textContent = "🔍 Searching...";
      resultDiv.innerHTML = "";
      resultDiv.classList.remove("hidden");

      this._discoverMachines().then(function(machines) {
        if (machines.length === 0) {
          resultDiv.innerHTML = "<p style='color: #888; text-align: center;'>No devices found. Make sure devices are on the same network.</p>";
        } else {
          var html = "<div style='display: flex; flex-direction: column; gap: 8px;'>";
          machines.forEach(function(m) {
            html += "<div style='border: 1px solid #444; border-radius: 4px; padding: 12px; background: #1a1a1a;'>";
            html += "<div style='font-weight: bold; margin-bottom: 4px;'>" + esc(m.machineName || "Unknown") + "</div>";
            html += "<div style='font-size: 12px; color: #aaa; margin-bottom: 8px;'>" + esc(m.host) + ":" + m.port + "</div>";
            html += "<button class='primary-btn' style='width: 100%; padding: 8px; font-size: 12px;' data-host='" + esc(m.host) + "' data-port='" + m.port + "' data-token='" + esc(m.token) + "' data-name='" + esc(m.machineName || "Unknown") + "'>Connect</button>";
            html += "</div>";
          });
          html += "</div>";
          resultDiv.innerHTML = html;
          resultDiv.querySelectorAll("button").forEach(function(btn) {
            btn.addEventListener("click", function() {
              var result = machineManager.addMachine({
                name: this.getAttribute("data-name"),
                host: this.getAttribute("data-host"),
                port: parseInt(this.getAttribute("data-port"), 10),
                token: this.getAttribute("data-token"),
              });
              if (!result.ok) { showToast(result.error, "error"); return; }
              showToast("Device added: " + result.machine.name, "success");
              resultDiv.classList.add("hidden");
            });
          });
        }

        btn.disabled = false;
        btn.textContent = "🔍 Discover Machines";
      }).catch(function(err) {
        resultDiv.innerHTML = "<p style='color: #f44; text-align: center;'>Search failed: " + esc(String(err)) + "</p>";
        btn.disabled = false;
        btn.textContent = "🔍 Discover Machines";
      });
    }

    _discoverMachines() {
      var list = this._getSubnetIPs();
      var timeout = 3000;
      var promises = list.map(function(ip) {
        return fetch("http://" + ip + ":23334/api/connection-info", { method: "GET", timeout: timeout })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.status === "ok" && data.machineId) {
              return {
                host: ip,
                port: data.port || 23334,
                token: data.token || "",
                machineId: data.machineId,
                machineName: data.machineName || "Unknown",
              };
            }
            return null;
          })
          .catch(function() { return null; });
      });
      return Promise.all(promises).then(function(results) {
        return results.filter(function(r) { return r !== null; });
      });
    }

    _getSubnetIPs() {
      var ips = [];
      var baseIP = "192.168.1";
      for (var i = 1; i <= 254; i++) {
        ips.push(baseIP + "." + i);
      }
      return ips;
    }
  }

  // === App ===

  class App {
    constructor() {
      this.renderer = new SessionRenderer(document.getElementById("session-list"));
      this.machinesRenderer = new MachinesRenderer(document.getElementById("settings-content"));
      this.notifier = new NotificationManager();
      this.activeTab = "sessions";

      window._clawdApp = this;

      this.machineManager = new MachineManager({
        onStatusChange: this._onMachineStatusChange.bind(this),
        onMessage: this._onMachineMessage.bind(this),
        onRemoved: this._onMachineRemoved.bind(this),
      });

      this._bindNav();
      this.renderer.startStaleCleanup();

      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/mobile/sw.js").catch(function() {});
      this._bootstrapFromUrl();
      this.renderer.updateMachines(this.machineManager.list());
      this._updateAggregateStatus();
    }

    _bootstrapFromUrl() {
      var params = new URLSearchParams(window.location.search);
      var urlHost = params.get("host");
      var urlPort = params.get("port");
      var urlToken = params.get("token");
      var urlName = params.get("name");
      if (urlHost && urlPort && urlToken) {
        var result = this.machineManager.addMachine({
          host: urlHost, port: parseInt(urlPort, 10), token: urlToken, name: urlName || undefined,
        });
        if (result.ok) showToast("Device added: " + result.machine.name, "success");
        try { window.history.replaceState(null, "", window.location.pathname); } catch {}
      } else {
        this.machineManager.connectAll();
      }
    }

    _onMachineStatusChange(machine, state) {
      if (state === "connected") this.notifier.requestPermission();
      this.renderer.updateMachines(this.machineManager.list());
      this._updateAggregateStatus();
      if (this.activeTab === "settings") this.machinesRenderer.render(this.machineManager);
    }

    _onMachineMessage(machine, msg) {
      if (!msg) return;
      if (msg.type === "snapshot") {
        this.renderer.updateFromSnapshot(machine.id, msg.sessions || {});
        this.renderer.updateMachines(this.machineManager.list());
        log("Snapshot: " + Object.keys(msg.sessions || {}).length + " sessions", machine.name);
        if (this.activeTab === "settings") this.machinesRenderer.render(this.machineManager);
      } else if (msg.type === "state") {
        this.renderer.updateState(machine.id, msg.sessionId, msg.data);
        this.notifier.onStateChange(machine.id + "::" + msg.sessionId, msg.data, machine.name);
      } else if (msg.type === "session_deleted") {
        this.renderer.removeSession(machine.id, msg.sessionId);
      } else if (msg.type === "tool_output") {
        var compositeId = machine.id + "::" + msg.sessionId;
        var session = this.renderer.sessions.get(compositeId);
        if (session) {
          session.lastOutput = { toolName: msg.data.toolName, output: (msg.data.output || "").substring(0, 200), at: msg.timestamp || Date.now() };
          this.renderer.render();
        }
      }
    }

    _onMachineRemoved(machine) {
      this.renderer.removeMachineSessions(machine.id);
      this.renderer.updateMachines(this.machineManager.list());
      this._updateAggregateStatus();
      if (this.activeTab === "settings") this.machinesRenderer.render(this.machineManager);
    }

    _bindNav() {
      var self = this;
      document.querySelectorAll(".nav-tab").forEach(function(tab) {
        tab.addEventListener("click", function() { self._switchTab(this.getAttribute("data-tab")); });
      });
    }

    _switchTab(tabId) {
      this.activeTab = tabId;
      document.querySelectorAll(".nav-tab").forEach(function(t) {
        t.classList.toggle("active", t.getAttribute("data-tab") === tabId);
      });
      document.getElementById("page-sessions").classList.toggle("hidden", tabId !== "sessions");
      document.getElementById("page-settings").classList.toggle("hidden", tabId !== "settings");
      if (tabId === "settings") this.machinesRenderer.render(this.machineManager);
    }

    _updateAggregateStatus() {
      var list = this.machineManager.list();
      var total = list.length;
      var connected = list.filter(function(m) { return m.state === "connected"; }).length;
      var anyConnecting = list.some(function(m) { return m.state === "connecting" || m.state === "reconnecting"; });
      var dot = document.getElementById("connection-dot");
      var text = document.getElementById("connection-text");
      var cls = "connection-dot";
      var label = "";
      if (total === 0) {
        cls += "";
      } else if (connected === total) {
        cls += " connected"; label = connected + "/" + total;
      } else if (anyConnecting) {
        cls += " connecting"; label = connected + "/" + total;
      } else {
        cls += " reconnecting"; label = connected + "/" + total;
      }
      dot.className = cls;
      text.textContent = label;
      text.className = "connection-text" + (total > 0 && connected === total ? " connected" : "");
    }
  }

  // === Init ===
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function() { new App(); });
  else new App();
})();
