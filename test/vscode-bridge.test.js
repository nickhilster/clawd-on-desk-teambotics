"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const WebSocket = require("ws");
const http = require("http");
const { initVscodeBridge } = require("../src/network/vscode-bridge");

function waitForOpen(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error("Timeout waiting for open")), timeoutMs);
    ws.once("open", () => { clearTimeout(timer); resolve(); });
  });
}

// A client's WebSocket implementation can emit "open" immediately followed by
// "message" within the same synchronous turn (both delivered in one socket
// read). Attaching a "message" listener only after `await`ing "open" can miss
// that first message, since the microtask resuming the await runs after the
// synchronous "message" emit. Queueing messages from a listener attached at
// socket-creation time (before any await) avoids the race.
function connectWithQueue(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const queue = [];
  const waiters = [];
  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    const idx = waiters.findIndex((w) => w.type === msg.type);
    if (idx !== -1) {
      const [waiter] = waiters.splice(idx, 1);
      waiter.resolve(msg);
    } else {
      queue.push(msg);
    }
  });
  ws.waitForType = function waitForType(type, timeoutMs = 3000) {
    const idx = queue.findIndex((m) => m.type === type);
    if (idx !== -1) return Promise.resolve(queue.splice(idx, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
      waiters.push({ type, resolve: (msg) => { clearTimeout(timer); resolve(msg); } });
    });
  };
  return ws;
}

function waitForPort(bridge, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const p = bridge.getPort();
      if (typeof p === "number" && p > 0) { resolve(p); return; }
      if (Date.now() - start > timeoutMs) { reject(new Error("Timeout waiting for port")); return; }
      setTimeout(check, 20);
    };
    check();
  });
}

function httpGetJson(port, pathStr) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port, path: pathStr }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, json: body ? JSON.parse(body) : null }));
    }).on("error", reject);
  });
}

describe("vscode-bridge", () => {
  it("responds ok on /health once bound", async () => {
    const bridge = initVscodeBridge({ getSessionSnapshot: () => ({ sessions: [] }) });
    const port = await waitForPort(bridge);
    const res = await httpGetJson(port, "/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.ok, true);
    bridge.close();
  });

  it("sends the current snapshot to a newly connected client", async () => {
    const snapshot = { sessions: [{ id: "s1", todos: [{ content: "A", status: "pending" }] }] };
    const bridge = initVscodeBridge({ getSessionSnapshot: () => snapshot });
    const port = await waitForPort(bridge);
    const ws = connectWithQueue(port);
    await waitForOpen(ws);
    const msg = await ws.waitForType("snapshot");
    assert.deepStrictEqual(msg.snapshot, snapshot);
    ws.close();
    bridge.close();
  });

  it("onSnapshot() pushes an updated snapshot to connected clients", async () => {
    let snapshot = { sessions: [] };
    const bridge = initVscodeBridge({ getSessionSnapshot: () => snapshot });
    const port = await waitForPort(bridge);
    const ws = connectWithQueue(port);
    await waitForOpen(ws);
    await ws.waitForType("snapshot");

    snapshot = { sessions: [{ id: "s2" }] };
    bridge.onSnapshot();
    const msg = await ws.waitForType("snapshot");
    assert.deepStrictEqual(msg.snapshot, snapshot);
    ws.close();
    bridge.close();
  });

  it("broadcasts an updated snapshot to every connected client", async () => {
    let snapshot = { sessions: [] };
    const bridge = initVscodeBridge({ getSessionSnapshot: () => snapshot });
    const port = await waitForPort(bridge);
    const wsA = connectWithQueue(port);
    const wsB = connectWithQueue(port);
    await Promise.all([waitForOpen(wsA), waitForOpen(wsB)]);
    await Promise.all([wsA.waitForType("snapshot"), wsB.waitForType("snapshot")]);

    snapshot = { sessions: [{ id: "s3" }] };
    bridge.onSnapshot();
    const [msgA, msgB] = await Promise.all([wsA.waitForType("snapshot"), wsB.waitForType("snapshot")]);
    assert.deepStrictEqual(msgA.snapshot, snapshot);
    assert.deepStrictEqual(msgB.snapshot, snapshot);
    wsA.close();
    wsB.close();
    bridge.close();
  });

  it("routes a resolve-permission message to ctx.resolvePermissionEntry", async () => {
    const pending = [{ id: "perm-1", sessionId: "s1" }];
    const resolved = [];
    const bridge = initVscodeBridge({
      getSessionSnapshot: () => ({ sessions: [] }),
      pendingPermissions: pending,
      resolvePermissionEntry: (entry, decision, reason) => resolved.push({ entry, decision, reason }),
    });
    const port = await waitForPort(bridge);
    const ws = connectWithQueue(port);
    await waitForOpen(ws);
    await ws.waitForType("snapshot");

    ws.send(JSON.stringify({ action: "resolve-permission", entryId: "perm-1", decision: "allow" }));
    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(resolved.length, 1);
    assert.strictEqual(resolved[0].entry, pending[0]);
    assert.strictEqual(resolved[0].decision, "allow");
    ws.close();
    bridge.close();
  });

  it("ignores a resolve-permission message for an unknown entryId", async () => {
    const resolved = [];
    const bridge = initVscodeBridge({
      getSessionSnapshot: () => ({ sessions: [] }),
      pendingPermissions: [],
      resolvePermissionEntry: (...args) => resolved.push(args),
    });
    const port = await waitForPort(bridge);
    const ws = connectWithQueue(port);
    await waitForOpen(ws);
    await ws.waitForType("snapshot");

    ws.send(JSON.stringify({ action: "resolve-permission", entryId: "nope", decision: "allow" }));
    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(resolved.length, 0);
    ws.close();
    bridge.close();
  });
});
