const vscode = require("vscode");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Port range for Clawd terminal-focus extension instances.
// Each editor window gets its own extension host → each needs a unique port.
// main.js broadcasts to all ports; only the one with the matching PID responds 200.
const PORT_BASE = 23456;
const PORT_RANGE = 5; // support up to 5 concurrent editor windows

const VSCODE_BRIDGE_PORT_BASE = 23470;
const VSCODE_BRIDGE_PORT_RANGE = 5;

let server = null;
let boundPort = null;

let dashboardPanel = null;
let lastKnownBridgePort = null;

async function focusTerminalByPids(pids) {
  for (const terminal of vscode.window.terminals) {
    const termPid = await terminal.processId;
    if (termPid && pids.includes(termPid)) {
      terminal.show(false);
      return true;
    }
  }
  return false;
}

function tryListen(port, maxPort) {
  if (port > maxPort) {
    console.log("Clawd terminal-focus: all ports in use, HTTP server disabled");
    return;
  }

  server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/focus-tab") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const pids = Array.isArray(data.pids) ? data.pids.filter(Number.isFinite) : [];
          if (pids.length) {
            focusTerminalByPids(pids).then((found) => {
              res.writeHead(found ? 200 : 404);
              res.end(found ? "ok" : "not found");
            });
          } else {
            res.writeHead(400);
            res.end("no pids");
          }
        } catch {
          res.writeHead(400);
          res.end("bad json");
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      server = null;
      tryListen(port + 1, maxPort);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    boundPort = port;
    console.log(`Clawd terminal-focus: listening on 127.0.0.1:${port}`);
  });
}

function probeHealthPort(port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: "/health", timeout: timeoutMs }, (res) => {
      resolve(res.statusCode === 200 ? port : null);
      res.resume();
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

async function findVscodeBridgePort() {
  for (let port = VSCODE_BRIDGE_PORT_BASE; port < VSCODE_BRIDGE_PORT_BASE + VSCODE_BRIDGE_PORT_RANGE; port++) {
    const found = await probeHealthPort(port);
    if (found) return found;
  }
  return null;
}

async function showDeskBuddyDashboard(context) {
  if (dashboardPanel) {
    dashboardPanel.reveal(vscode.ViewColumn.One);
    return;
  }
  dashboardPanel = vscode.window.createWebviewPanel(
    "deskbuddyDashboard",
    "DeskBuddy",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] }
  );
  dashboardPanel.onDidDispose(() => { dashboardPanel = null; });

  lastKnownBridgePort = await findVscodeBridgePort();
  dashboardPanel.webview.html = buildDashboardHtml(dashboardPanel.webview, context.extensionUri, lastKnownBridgePort);

  startBridgePortWatcher();
}

function buildDashboardHtml(webview, extensionUri, port) {
  const htmlPath = path.join(extensionUri.fsPath, "webview.html");
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview.css"));
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "webview.js"));
  const template = fs.readFileSync(htmlPath, "utf8");
  return template
    .replace(/__CSP_SOURCE__/g, webview.cspSource)
    .replace("__CSS_URI__", cssUri.toString())
    .replace("__JS_URI__", jsUri.toString())
    .replace("__BRIDGE_PORT__", port ? String(port) : "null");
}

function startBridgePortWatcher() {
  const timer = setInterval(async () => {
    if (!dashboardPanel) { clearInterval(timer); return; }
    const found = await findVscodeBridgePort();
    if (found !== lastKnownBridgePort) {
      lastKnownBridgePort = found;
      dashboardPanel.webview.postMessage({ type: "bridge-port", port: found });
    }
  }, 5000);
}

function activate(context) {
  tryListen(PORT_BASE, PORT_BASE + PORT_RANGE - 1);

  // URI handler kept as fallback for manual testing:
  // vscode://clawd.clawd-terminal-focus?pids=1234,5678
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri) {
        const params = new URLSearchParams(uri.query);
        const raw = params.get("pids") || params.get("pid") || "";
        const pids = raw.split(",").map(Number).filter(Boolean);
        if (pids.length) focusTerminalByPids(pids);
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("deskbuddy.openDashboard", () => showDeskBuddyDashboard(context))
  );

  const totalTabs = vscode.window.tabGroups.all.reduce((count, group) => count + group.tabs.length, 0);
  if (totalTabs === 0) {
    showDeskBuddyDashboard(context);
  }
}

function deactivate() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = { activate, deactivate };
