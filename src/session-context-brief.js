"use strict";

const CONTEXT_EXCERPT_MAX = 220;

function cleanString(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function excerptString(value, max = CONTEXT_EXCERPT_MAX) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : CONTEXT_EXCERPT_MAX;
  return cleaned.length > limit ? `${cleaned.slice(0, Math.max(0, limit - 1))}\u2026` : cleaned;
}

function basenameFromAnyPath(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  const withoutTrailingSlash = cleaned.replace(/[\\/]+$/g, "");
  if (!withoutTrailingSlash) return null;
  const parts = withoutTrailingSlash.split(/[\\/]+/g).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function firstSessionString(session, keys, max) {
  if (!session || typeof session !== "object") return null;
  for (const key of keys) {
    const excerpt = excerptString(session[key], max);
    if (excerpt) return excerpt;
  }
  return null;
}

function firstEventString(events, keys, max) {
  if (!Array.isArray(events)) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event || typeof event !== "object") continue;
    for (const key of keys) {
      const excerpt = excerptString(event[key], max);
      if (excerpt) return excerpt;
    }
  }
  return null;
}

function getLastPromptExcerpt(session, max = CONTEXT_EXCERPT_MAX) {
  return firstSessionString(session, [
    "lastHumanPrompt",
    "lastUserPrompt",
    "humanLastPrompt",
    "userPrompt",
    "lastPrompt",
  ], max) || firstEventString(session && session.recentEvents, [
    "prompt",
    "userPrompt",
    "humanPrompt",
    "message",
    "text",
  ], max);
}

function getLatestOutputExcerpt(session, max = CONTEXT_EXCERPT_MAX) {
  return firstSessionString(session, [
    "assistantLastOutput",
    "lastAssistantOutput",
    "latestOutput",
    "lastOutput",
    "output",
  ], max) || firstEventString(session && session.recentEvents, [
    "summary",
    "output",
    "message",
    "text",
  ], max);
}

function getBranch(session) {
  return firstSessionString(session, [
    "gitBranch",
    "branch",
    "currentBranch",
    "refName",
  ], 80);
}

function getContextStatus({ session, badge, latestEvent, state } = {}) {
  const rawEvent = latestEvent && latestEvent.event;
  if (badge === "interrupted") return "failed";
  if (badge === "done") return "completed";
  if (rawEvent === "Notification" || rawEvent === "Elicitation") return "waiting";
  if (session && session.requiresCompletionAck === true) return "completed";
  if (state === "sleeping") return "sleeping";
  if (state && state !== "idle") return "active";
  return "idle";
}

function getNextHumanAction(status) {
  switch (status) {
    case "waiting":
      return "Respond to the session request.";
    case "completed":
      return "Review the completed output and changes.";
    case "failed":
      return "Review the error or failed tool output.";
    case "active":
      return "Let the agent continue or inspect live output.";
    case "sleeping":
      return "Wake or reopen the session when ready.";
    default:
      return "Open the session when you need more context.";
  }
}

function buildSessionContextBrief({ session, badge, latestEvent, state } = {}) {
  const repoPath = cleanString(session && session.cwd);
  const status = getContextStatus({ session, badge, latestEvent, state });
  const latestOutputExcerpt = getLatestOutputExcerpt(session);
  const lastPromptExcerpt = getLastPromptExcerpt(session);

  return {
    status,
    repoName: basenameFromAnyPath(repoPath),
    repoPath,
    branch: getBranch(session),
    lastPromptExcerpt,
    latestOutputExcerpt,
    latestOutputTruncated: !!(session && session.assistantLastOutputTruncated === true),
    nextHumanAction: getNextHumanAction(status),
  };
}

module.exports = {
  CONTEXT_EXCERPT_MAX,
  cleanString,
  excerptString,
  basenameFromAnyPath,
  getLastPromptExcerpt,
  getLatestOutputExcerpt,
  getBranch,
  getContextStatus,
  getNextHumanAction,
  buildSessionContextBrief,
};
