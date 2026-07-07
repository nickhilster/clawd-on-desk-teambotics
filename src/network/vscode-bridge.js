"use strict";

// src/network/vscode-bridge.js — localhost-only WebSocket bridge for the
// DeskBuddy VS Code extension's dashboard webview. No authentication: same
// trust boundary as extensions/vscode/extension.js's terminal-focus HTTP
// server (any local process is already trusted). Same-machine only — this
// is not the mobile LAN bridge (src/network/mobile-preview-server.js), which
// exists specifically for the cross-machine trust boundary this doesn't have.

const http = require("http");
const WebSocket = require("ws");

const PORT_BASE = 23470;
const PORT_RANGE = 5;

function initVscodeBridge(ctx) {
  let httpServer = null;
  let wss = null;
  let boundPort = null;
  const clients = new Set();

  function getSnapshot() {
    return typeof ctx.getSessionSnapshot === "function"
      ? ctx.getSessionSnapshot()
      : { sessions: [] };
  }

  function send(ws, type, payload) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type, ...payload })); } catch {}
  }

  function broadcastSnapshot() {
    const snapshot = getSnapshot();
    for (const ws of clients) send(ws, "snapshot", { snapshot });
  }

  function handleResolvePermission(msg) {
    if (!msg || msg.action !== "resolve-permission") return;
    const decision = msg.decision === "allow" || msg.decision === "deny" ? msg.decision : null;
    if (!decision) return;
    const pending = Array.isArray(ctx.pendingPermissions) ? ctx.pendingPermissions : [];
    const entry = pending.find((p) => p && p.id === msg.entryId);
    if (!entry) return;
    if (typeof ctx.resolvePermissionEntry === "function") {
      ctx.resolvePermissionEntry(entry, decision, "Resolved from VS Code dashboard");
    }
  }

  function attachWebSocketServer(server) {
    wss = new WebSocket.Server({ server, path: "/ws" });
    wss.on("connection", (ws) => {
      clients.add(ws);
      // Deferred so the client's "open" handler (and any listener it
      // attaches for "message") runs before this first send — otherwise a
      // client's WebSocket implementation can emit "open" immediately
      // followed by "message" in the same synchronous pass, dropping this
      // message if no listener is attached yet.
      setImmediate(() => send(ws, "snapshot", { snapshot: getSnapshot() }));
      ws.on("message", (data) => {
        let msg = null;
        try { msg = JSON.parse(data); } catch { return; }
        handleResolvePermission(msg);
      });
      ws.on("close", () => clients.delete(ws));
    });
  }

  function tryListen(port, maxPort) {
    if (port > maxPort) {
      console.log("DeskBuddy: vscode-bridge: all ports in use, dashboard bridge disabled");
      return;
    }
    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, port }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        tryListen(port + 1, maxPort);
      }
    });
    server.listen(port, "127.0.0.1", () => {
      httpServer = server;
      boundPort = port;
      attachWebSocketServer(server);
      console.log(`DeskBuddy: vscode-bridge listening on 127.0.0.1:${port}`);
    });
  }

  tryListen(PORT_BASE, PORT_BASE + PORT_RANGE - 1);

  return {
    onSnapshot: broadcastSnapshot,
    getPort: () => boundPort,
    close() {
      for (const ws of clients) { try { ws.close(); } catch {} }
      clients.clear();
      if (wss) { try { wss.close(); } catch {} }
      if (httpServer) { try { httpServer.close(); } catch {} }
    },
  };
}

module.exports = { initVscodeBridge };
