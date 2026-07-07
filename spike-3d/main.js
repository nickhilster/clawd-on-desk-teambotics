// Standalone Three.js/Electron feasibility spike — NOT wired into the app.
// Validates: transparent overlay window, hit-box click-through, 60fps render loop.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let renderWin;
let controlWin;
let clickThrough = false;

function createRenderWindow() {
  renderWin = new BrowserWindow({
    width: 400,
    height: 400,
    x: 200,
    y: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      // Spike-only: nodeIntegration lets index.html `require("three")` from
      // node_modules directly without a bundler. Never do this in the real app.
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
  });
  renderWin.loadFile(path.join(__dirname, "index.html"));
  renderWin.setIgnoreMouseEvents(clickThrough);
  renderWin.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[render console] ${message} (${sourceId}:${line})`);
  });
  renderWin.webContents.on("did-fail-load", (_e, code, desc) => {
    console.log("[render] did-fail-load", code, desc);
  });
  if (process.env.SPIKE_DEVTOOLS) {
    renderWin.webContents.openDevTools({ mode: "detach" });
  }
}

function createControlWindow() {
  controlWin = new BrowserWindow({
    width: 340,
    height: 280,
    x: 700,
    y: 200,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  controlWin.setMenuBarVisibility(false);
  controlWin.loadFile(path.join(__dirname, "control.html"));
}

ipcMain.on("spike:fps", (_event, data) => {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.webContents.send("spike:fps-update", data);
  }
});

ipcMain.on("spike:toggle-click-through", () => {
  clickThrough = !clickThrough;
  if (renderWin && !renderWin.isDestroyed()) {
    // forward:true keeps mousemove events flowing so the OS cursor still
    // reports hover, matching how the real hit-window model behaves.
    renderWin.setIgnoreMouseEvents(clickThrough, { forward: true });
  }
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.webContents.send("spike:click-through-state", clickThrough);
  }
});

ipcMain.on("spike:quit", () => app.quit());

app.whenReady().then(() => {
  createRenderWindow();
  createControlWindow();
});

app.on("window-all-closed", () => app.quit());
