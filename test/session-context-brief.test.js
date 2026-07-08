"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  basenameFromAnyPath,
  buildSessionContextBrief,
  excerptString,
  getContextStatus,
} = require("../src/session-context-brief");
const {
  buildSessionSnapshotEntry,
  sessionSnapshotSignature,
} = require("../src/state-session-snapshot");

test("basenameFromAnyPath handles POSIX and Windows paths", () => {
  assert.equal(basenameFromAnyPath("/Users/nik/dev/deskbuddy"), "deskbuddy");
  assert.equal(basenameFromAnyPath("C:\\dev\\deskbuddy\\"), "deskbuddy");
  assert.equal(basenameFromAnyPath("  "), null);
});

test("excerptString collapses whitespace and truncates long text", () => {
  assert.equal(excerptString("  hello\n\nworld  "), "hello world");
  assert.equal(excerptString("abcdef", 4), "abc…");
});

test("buildSessionContextBrief derives deterministic resume context", () => {
  const brief = buildSessionContextBrief({
    badge: "done",
    state: "idle",
    latestEvent: { event: "Stop", at: 123 },
    session: {
      cwd: "C:\\dev\\deskbuddy",
      gitBranch: "feature/context-brief",
      lastUserPrompt: "Add context-aware session cards",
      assistantLastOutput: "Implemented the snapshot fields and added tests.",
      assistantLastOutputTruncated: true,
    },
  });

  assert.deepEqual(brief, {
    status: "completed",
    repoName: "deskbuddy",
    repoPath: "C:\\dev\\deskbuddy",
    branch: "feature/context-brief",
    lastPromptExcerpt: "Add context-aware session cards",
    latestOutputExcerpt: "Implemented the snapshot fields and added tests.",
    latestOutputTruncated: true,
    nextHumanAction: "Review the completed output and changes.",
  });
});

test("getContextStatus maps attention and failure states", () => {
  assert.equal(getContextStatus({ badge: "interrupted", state: "idle" }), "failed");
  assert.equal(getContextStatus({ badge: "idle", state: "idle", latestEvent: { event: "Notification" } }), "waiting");
  assert.equal(getContextStatus({ badge: "running", state: "typing" }), "active");
});

test("buildSessionSnapshotEntry exposes context fields at top level and in contextBrief", () => {
  const entry = buildSessionSnapshotEntry("session-1", {
    agentId: "codex",
    state: "idle",
    cwd: "/home/nik/dev/deskbuddy",
    currentBranch: "main",
    lastHumanPrompt: "Check the failing tests",
    assistantLastOutput: "One test is failing in the renderer suite.",
    recentEvents: [{ event: "Stop", at: 456 }],
  });

  assert.equal(entry.repoName, "deskbuddy");
  assert.equal(entry.repoPath, "/home/nik/dev/deskbuddy");
  assert.equal(entry.branch, "main");
  assert.equal(entry.contextSummaryStatus, "completed");
  assert.equal(entry.lastPromptExcerpt, "Check the failing tests");
  assert.equal(entry.latestOutputExcerpt, "One test is failing in the renderer suite.");
  assert.equal(entry.nextHumanAction, "Review the completed output and changes.");
  assert.deepEqual(entry.contextBrief, {
    status: "completed",
    repoName: "deskbuddy",
    repoPath: "/home/nik/dev/deskbuddy",
    branch: "main",
    lastPromptExcerpt: "Check the failing tests",
    latestOutputExcerpt: "One test is failing in the renderer suite.",
    latestOutputTruncated: false,
    nextHumanAction: "Review the completed output and changes.",
  });
});

test("sessionSnapshotSignature changes when context fields change", () => {
  const snapshotA = {
    orderedIds: ["a"],
    menuOrderedIds: ["a"],
    hudTotalNonIdle: 0,
    hudLastSessionId: null,
    hudLastTitle: null,
    lastSessionId: "a",
    lastTitle: "deskbuddy",
    sessions: [buildSessionSnapshotEntry("a", {
      state: "idle",
      cwd: "/tmp/deskbuddy",
      assistantLastOutput: "First output",
      recentEvents: [{ event: "Stop", at: 1 }],
    })],
  };
  const snapshotB = {
    ...snapshotA,
    sessions: [buildSessionSnapshotEntry("a", {
      state: "idle",
      cwd: "/tmp/deskbuddy",
      assistantLastOutput: "Second output",
      recentEvents: [{ event: "Stop", at: 1 }],
    })],
  };

  assert.notEqual(sessionSnapshotSignature(snapshotA), sessionSnapshotSignature(snapshotB));
});
