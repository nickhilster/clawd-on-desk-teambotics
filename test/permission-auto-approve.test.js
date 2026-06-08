// Auto-pilot (autoApproveAllPermissions) chokepoint in showPermissionBubble.
//
// When the toggle is on, showPermissionBubble must resolve the entry as
// "allow" and return BEFORE constructing a BrowserWindow — that early return
// is also what lets this test run without a real Electron window. The DND /
// per-agent / headless gates live earlier in the route (server-route-
// permission.js), so they still win: by the time showPermissionBubble runs,
// a gated request never reaches it.
//
// Exclusions: passive codex/kimi notifications and the hardware-buddy self
// test are not approvals and must NOT be auto-resolved.

const { describe, it } = require("node:test");
const assert = require("node:assert");

const initPermission = require("../src/permission");

function makeCtx(overrides = {}) {
  return {
    focusTerminalForSession() {},
    getSettingsSnapshot: () => ({}),
    isAgentPermissionsEnabled: () => true,
    isAutoApproveAllEnabled: () => true,
    getBubblePolicy: () => ({ enabled: true, autoCloseMs: 0 }),
    getPetWindowBounds: () => null,
    getNearestWorkArea: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    getHitRectScreen: () => null,
    getHudReservedOffset: () => 0,
    guardAlwaysOnTop: () => {},
    reapplyMacVisibility: () => {},
    permDebugLog: null,
    repositionUpdateBubble: () => {},
    win: null,
    bubbleFollowPet: false,
    petHidden: false,
    doNotDisturb: false,
    hideBubbles: false,
    pendingPermissions: [],
    sessions: new Map(),
    sendPermissionResponse: () => {},
    subscribeShortcuts: () => {},
    reportShortcutFailure: () => {},
    clearShortcutFailure: () => {},
    STATE_SVGS: {},
    setState: () => {},
    updateSession: () => {},
    ...overrides,
  };
}

function makePermEntry(overrides = {}) {
  return {
    res: null,
    abortHandler: () => {},
    suggestions: [],
    sessionId: "session-test",
    bubble: null,
    hideTimer: null,
    toolName: "Bash",
    toolInput: { command: "rm -rf /" },
    resolvedSuggestion: null,
    createdAt: Date.now() - 5000,
    ...overrides,
  };
}

describe("auto-pilot: showPermissionBubble auto-approve chokepoint", () => {
  it("resolves a real tool request as allow without building a bubble", () => {
    const resolved = [];
    const ctx = makeCtx();
    const perm = initPermission(ctx);
    // Capture resolve calls by wrapping the factory's resolvePermissionEntry.
    const origResolve = perm.resolvePermissionEntry;
    const permEntry = makePermEntry();
    perm.pendingPermissions.push(permEntry);

    // Patch ctx is not enough — resolve is internal. Spy by observing the
    // pending list + bubble state, which is the externally visible contract.
    perm.showPermissionBubble(permEntry);

    assert.equal(permEntry.bubble, null, "no BrowserWindow should be created");
    assert.equal(
      perm.pendingPermissions.indexOf(permEntry),
      -1,
      "entry should be resolved out of the pending list"
    );
    void origResolve; void resolved;
  });

  it("sends an allow decision down the HTTP response (Claude Code branch)", () => {
    const captured = { statusCode: null, body: "", headers: {} };
    const res = {
      writableEnded: false,
      destroyed: false,
      headersSent: false,
      writeHead(status, headers) {
        captured.statusCode = status;
        if (headers) Object.assign(captured.headers, headers);
        this.headersSent = true;
      },
      end(chunk) {
        if (chunk !== undefined) captured.body += String(chunk);
        this.writableEnded = true;
      },
      on() {},
      removeListener() {},
    };
    const ctx = makeCtx();
    const perm = initPermission(ctx);
    const permEntry = makePermEntry({ res, agentId: "claude-code" });
    perm.pendingPermissions.push(permEntry);

    perm.showPermissionBubble(permEntry);

    assert.equal(captured.statusCode, 200);
    const parsed = JSON.parse(captured.body);
    assert.equal(parsed.hookSpecificOutput.decision.behavior, "allow");
  });

  it("does nothing special when the toggle is off (would build a bubble)", () => {
    // With auto-approve off and win=null, showPermissionBubble proceeds to
    // BrowserWindow construction. We only assert the early-return did NOT
    // fire by checking the entry stays pending up to the point of bubble
    // creation throwing (no Electron in tests).
    const ctx = makeCtx({ isAutoApproveAllEnabled: () => false });
    const perm = initPermission(ctx);
    const permEntry = makePermEntry();
    perm.pendingPermissions.push(permEntry);

    assert.throws(() => perm.showPermissionBubble(permEntry));
    assert.equal(
      perm.pendingPermissions.indexOf(permEntry),
      0,
      "entry should still be pending (auto-approve did not consume it)"
    );
  });

  it("does NOT auto-approve passive codex notifications", () => {
    const ctx = makeCtx();
    const perm = initPermission(ctx);
    const permEntry = makePermEntry({ isCodexNotify: true, res: null });
    perm.pendingPermissions.push(permEntry);

    // Passive notify entries route to dismissPassiveNotify on resolve, never
    // to an allow. Auto-approve must skip them: with win=null the subsequent
    // bubble build throws, proving the early-return did not consume it.
    assert.throws(() => perm.showPermissionBubble(permEntry));
    assert.equal(perm.pendingPermissions.indexOf(permEntry), 0);
  });

  it("does NOT auto-approve the hardware-buddy self test", () => {
    const ctx = makeCtx();
    const perm = initPermission(ctx);
    const permEntry = makePermEntry({ isHardwareBuddyTest: true });
    perm.pendingPermissions.push(permEntry);

    assert.throws(() => perm.showPermissionBubble(permEntry));
    assert.equal(perm.pendingPermissions.indexOf(permEntry), 0);
  });

  it("answers elicitation questions with a deferral reply so allow is a real allow", () => {
    const captured = { body: "" };
    const res = {
      writableEnded: false,
      destroyed: false,
      headersSent: false,
      writeHead() { this.headersSent = true; },
      end(chunk) { if (chunk !== undefined) captured.body += String(chunk); this.writableEnded = true; },
      on() {},
      removeListener() {},
    };
    const ctx = makeCtx();
    const perm = initPermission(ctx);
    const permEntry = makePermEntry({
      res,
      agentId: "claude-code",
      isElicitation: true,
      toolName: "AskUserQuestion",
      toolInput: { questions: [{ question: "Pick one" }, { question: "And another?" }] },
    });
    perm.pendingPermissions.push(permEntry);

    perm.showPermissionBubble(permEntry);

    // Elicitation allow path emits updatedInput, not a bare deny, and every
    // question is answered with the neutral defer-to-agent reply (not blank).
    const parsed = JSON.parse(captured.body);
    assert.equal(parsed.hookSpecificOutput.decision.behavior, "allow");
    assert.ok(parsed.hookSpecificOutput.decision.updatedInput, "updatedInput present");
    assert.deepEqual(parsed.hookSpecificOutput.decision.updatedInput.answers, {
      "Pick one": "You choose whatever is best.",
      "And another?": "You choose whatever is best.",
    });
  });
});
