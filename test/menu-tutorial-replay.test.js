"use strict";

const assert = require("node:assert");
const Module = require("node:module");
const { describe, it } = require("node:test");

const MENU_MODULE_PATH = require.resolve("../src/menu");

function loadMenuWithElectron(fakeElectron) {
  delete require.cache[MENU_MODULE_PATH];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request) {
    if (request === "electron") return fakeElectron;
    return originalLoad.apply(this, arguments);
  };
  try {
    return require("../src/menu");
  } finally {
    Module._load = originalLoad;
  }
}

function fakeElectron() {
  return {
    app: { quit: () => {}, setActivationPolicy: () => {}, dock: { show: () => {}, hide: () => {} } },
    BrowserWindow: function BrowserWindow() {},
    Menu: { buildFromTemplate: (template) => ({ template }) },
    Tray: function Tray() {},
    nativeImage: {
      createFromPath: () => ({ resize() { return this; }, setTemplateImage() {} }),
    },
    screen: {
      getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ id: 1 }),
    },
  };
}

function buildBaseCtx(overrides = {}) {
  return {
    win: { isDestroyed: () => false },
    sessions: new Map(),
    currentSize: "P:15",
    doNotDisturb: false,
    lang: "en",
    showTray: true,
    showDock: true,
    openAtLogin: false,
    hideBubbles: false,
    soundMuted: false,
    menuOpen: false,
    tray: null,
    contextMenuOwner: null,
    contextMenu: null,
    isQuitting: false,
    petHidden: false,
    getMiniMode: () => false,
    getMiniTransitioning: () => false,
    getDisableMiniMode: () => false,
    getActiveThemeCapabilities: () => ({ miniMode: true }),
    openDashboard: () => {},
    openSettingsWindow: () => {},
    togglePetVisibility: () => {},
    bringPetToPrimaryDisplay: () => {},
    enableDoNotDisturb: () => {},
    disableDoNotDisturb: () => {},
    enterMiniViaMenu: () => {},
    exitMiniMode: () => {},
    miniHandleResize: () => false,
    getPetWindowBounds: () => ({ x: 10, y: 20, width: 120, height: 120 }),
    applyPetWindowBounds: () => {},
    getCurrentPixelSize: () => ({ width: 200, height: 200 }),
    repositionBubbles: () => {},
    syncHitWin: () => {},
    flushRuntimeStateToPrefs: () => {},
    reapplyMacVisibility: () => {},
    clampToScreenVisual: (x, y) => ({ x, y }),
    showTutorial: () => {},
    ...overrides,
  };
}

const LABEL = "Show tutorial again";

describe("tutorial replay menu entry", () => {
  it("appears in the context menu app group, between Settings and Hide Pet", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let opened = 0;
    const ctx = buildBaseCtx({ showTutorial: () => { opened += 1; } });
    const menu = initMenu(ctx);
    menu.buildContextMenu();

    const labels = ctx.contextMenu.template.map((item) => item.label);
    const replayIdx = labels.indexOf(LABEL);
    const settingsIdx = labels.indexOf("Settings…");
    const hideIdx = labels.indexOf("Hide Pet");
    assert.ok(replayIdx !== -1, "context menu exposes the replay entry");
    assert.ok(settingsIdx !== -1 && replayIdx > settingsIdx, "replay sits after Settings");
    assert.ok(hideIdx !== -1 && replayIdx < hideIdx, "replay sits before Hide Pet");

    ctx.contextMenu.template[replayIdx].click();
    assert.strictEqual(opened, 1, "clicking opens the tutorial");
  });

  it("appears in the tray menu", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    let trayTemplate = null;
    let opened = 0;
    const ctx = buildBaseCtx({
      tray: { setContextMenu(menuObj) { trayTemplate = menuObj.template; } },
      showTutorial: () => { opened += 1; },
    });
    const menu = initMenu(ctx);
    menu.buildTrayMenu();

    const item = trayTemplate.find((entry) => entry.label === LABEL);
    assert.ok(item, "tray menu exposes the replay entry");
    item.click();
    assert.strictEqual(opened, 1);
  });

  it("is omitted when no showTutorial hook is wired", () => {
    const initMenu = loadMenuWithElectron(fakeElectron());
    const ctx = buildBaseCtx({ showTutorial: undefined });
    const menu = initMenu(ctx);
    menu.buildContextMenu();
    const labels = ctx.contextMenu.template.map((item) => item.label);
    assert.ok(!labels.includes(LABEL), "no replay entry without a hook");
  });
});
