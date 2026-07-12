const { describe, it } = require("node:test");
const assert = require("node:assert");

const { getLoginItemSettings } = require("../src/login-item");

describe("login item settings", () => {
  it("includes the app path when enabling login items for an unpackaged Windows app", () => {
    const settings = getLoginItemSettings({
      isPackaged: false,
      openAtLogin: true,
      execPath: "D:\\deskbuddy\\node_modules\\electron\\dist\\electron.exe",
      appPath: "D:\\deskbuddy",
    });

    assert.deepStrictEqual(settings, {
      openAtLogin: true,
      path: "D:\\deskbuddy\\node_modules\\electron\\dist\\electron.exe",
      args: ["D:\\deskbuddy"],
    });
  });

  it("uses the default packaged login item settings", () => {
    const settings = getLoginItemSettings({
      isPackaged: true,
      openAtLogin: true,
      execPath: "C:\\Program Files\\DeskBuddy\\DeskBuddy.exe",
      appPath: "C:\\Program Files\\DeskBuddy\\resources\\app.asar",
    });

    assert.deepStrictEqual(settings, { openAtLogin: true });
  });

  it("includes the app path when disabling login items for an unpackaged app", () => {
    const settings = getLoginItemSettings({
      isPackaged: false,
      openAtLogin: false,
      execPath: "D:\\deskbuddy\\node_modules\\electron\\dist\\electron.exe",
      appPath: "D:\\deskbuddy",
    });

    assert.deepStrictEqual(settings, {
      openAtLogin: false,
      path: "D:\\deskbuddy\\node_modules\\electron\\dist\\electron.exe",
      args: ["D:\\deskbuddy"],
    });
  });

});
