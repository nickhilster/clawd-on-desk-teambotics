"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("terminal-focus extension activates on startup and focuses terminal input", () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "extensions", "vscode", "package.json"),
    "utf8"
  ));
  const source = fs.readFileSync(
    path.join(repoRoot, "extensions", "vscode", "extension.js"),
    "utf8"
  );
  const main = fs.readFileSync(path.join(repoRoot, "src", "main.js"), "utf8");

  assert.equal(manifest.version, "0.2.0");
  assert.match(main, /const EXT_VERSION = "0\.2\.0"/);
  assert.ok(manifest.activationEvents.includes("onStartupFinished"));
  assert.ok(manifest.activationEvents.includes("onUri"));
  assert.match(source, /terminal\.show\(false\)/);
  assert.doesNotMatch(source, /terminal\.show\(true\)/);
});

test("dashboard command is contributed and its files are installed", () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "extensions", "vscode", "package.json"),
    "utf8"
  ));
  const main = fs.readFileSync(path.join(repoRoot, "src", "main.js"), "utf8");

  const commands = (manifest.contributes && manifest.contributes.commands) || [];
  assert.ok(commands.some((c) => c.command === "deskbuddy.openDashboard"));
  assert.ok(manifest.activationEvents.includes("onCommand:deskbuddy.openDashboard"));

  assert.match(main, /filesToCopy = \[[^\]]*"webview\.html"[^\]]*\]/s);
  assert.match(main, /filesToCopy = \[[^\]]*"webview\.js"[^\]]*\]/s);
  assert.match(main, /filesToCopy = \[[^\]]*"webview\.css"[^\]]*\]/s);
});

test("extension.js scaffolds the dashboard panel and port discovery", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "extensions", "vscode", "extension.js"),
    "utf8"
  );

  assert.match(source, /VSCODE_BRIDGE_PORT_BASE = 23470/);
  assert.match(source, /VSCODE_BRIDGE_PORT_RANGE = 5/);
  assert.match(source, /deskbuddy\.openDashboard/);
  assert.match(source, /createWebviewPanel/);
  assert.match(source, /retainContextWhenHidden:\s*true/);
});

test("activation auto-opens the dashboard when no tabs are open", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "extensions", "vscode", "extension.js"),
    "utf8"
  );
  assert.match(source, /tabGroups\.all/);
  assert.match(source, /showDeskBuddyDashboard\(context\)/g);
});
