// MDown Manager integration configuration
// Not a coding agent: a local poller reads MDown Manager's local HTTP API
// (agents/mdown-manager-poller.js) and drives the same state machine other
// agents drive via hooks. Registered here so it gets a Settings row, an
// enabled/installed prefs entry, and an icon like every other agent.

module.exports = {
  id: "mdown-manager",
  name: "MDown Manager",
  // No coding-agent process to detect — this integration is poller-only.
  processNames: { win: [], mac: [], linux: [] },
  eventSource: "poller",
  eventMap: {
    McpIdle: "idle",
    McpScanning: "sweeping",
    McpSummarizing: "thinking",
    McpIndexing: "working",
    McpScanError: "error",
  },
  capabilities: {
    httpHook: false,
    permissionApproval: false,
    notificationHook: false,
    interactiveBubble: false,
    sessionEnd: false,
    subagent: false,
  },
  hookConfig: {
    configFormat: "poller",
  },
  // Nothing to Install/Uninstall — there's no local hook/plugin file to write,
  // just an enable toggle + API key. Managed entirely from its own Settings
  // tab (settings-tab-mdown-manager.js) instead of the generic Agents table,
  // which assumes every agent has an installer for that button to drive.
  hiddenFromAgentsTab: true,
};
