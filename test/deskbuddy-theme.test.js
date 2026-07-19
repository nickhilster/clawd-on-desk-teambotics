"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const themeLoader = require("../src/theme-loader");
const { collectRequiredAssetFiles } = require("../src/theme-schema");

themeLoader.init(path.join(__dirname, "..", "src"));

const THEME_DIR = path.join(__dirname, "..", "themes", "deskbuddy");
const ASSETS_DIR = path.join(__dirname, "..", "assets", "svg");

function readAsset(filename) {
  return fs.readFileSync(path.join(ASSETS_DIR, filename), "utf8");
}

describe("built-in DeskBuddy mascot theme", () => {
  it("loads the complete DeskBuddy capability set", () => {
    const theme = themeLoader.loadTheme("deskbuddy", { strict: true });

    assert.strictEqual(theme.name, "DeskBuddy");
    assert.strictEqual(theme._builtin, true);
    assert.strictEqual(theme.sleepSequence.mode, "full");
    assert.deepStrictEqual(theme.states.idle, ["deskbuddy-idle.svg"]);
    assert.deepStrictEqual(theme.workingTiers.map((tier) => tier.file), [
      "deskbuddy-building.svg",
      "deskbuddy-groove.svg",
      "deskbuddy-working.svg",
    ]);
    assert.deepStrictEqual(theme.jugglingTiers.map((tier) => tier.file), [
      "deskbuddy-dizzy.svg",
      "deskbuddy-groove.svg",
    ]);
    assert.strictEqual(theme.idleAnimations.length, 3);
    assert.strictEqual(theme.miniMode.states["mini-working"][0], "deskbuddy-mini-working.svg");
    assert.deepStrictEqual(theme._capabilities, {
      eyeTracking: true,
      miniMode: true,
      idleAnimations: true,
      reactions: true,
      workingTiers: true,
      jugglingTiers: true,
      idleMode: "tracked",
      sleepMode: "full",
      powerProfile: "standard",
      movement: "roam",
    });
  });

  it("ships every referenced production asset", () => {
    const theme = themeLoader.loadTheme("deskbuddy", { strict: true });
    const referenced = collectRequiredAssetFiles(theme);

    assert.strictEqual(referenced.length, 33);
    for (const filename of referenced) {
      assert.ok(fs.existsSync(path.join(ASSETS_DIR, filename)), `${filename} should exist`);
      assert.match(readAsset(filename), /<svg[\s>]/, `${filename} should be SVG`);
    }
  });

  it("keeps eye tracking wired for every eyeTracking state", () => {
    const theme = themeLoader.loadTheme("deskbuddy", { strict: true });

    for (const stateName of theme.eyeTracking.states) {
      const files = theme.states[stateName] || theme.miniMode.states[stateName];
      assert.ok(files, `${stateName} should map to at least one file`);
      for (const filename of files) {
        const asset = readAsset(filename);
        assert.match(asset, /id="eyes-js"/, `${filename} should expose eyes-js`);
        assert.match(asset, /id="body-js"/, `${filename} should expose body-js`);
        assert.match(asset, /id="shadow-js"/, `${filename} should expose shadow-js`);
        assert.doesNotMatch(asset, /<script|javascript:|(?:href|src)=["']https?:/i, `${filename} should not embed scripts or remote refs`);
      }
    }
  });

  it("defines hitboxes and timing config consistent with the other built-in themes", () => {
    const theme = themeLoader.loadTheme("deskbuddy", { strict: true });

    assert.ok(theme.hitBoxes.default);
    assert.ok(theme.hitBoxes.sleeping);
    assert.ok(theme.hitBoxes.wide);
    assert.deepStrictEqual(theme.wideHitboxFiles, ["deskbuddy-error.svg", "deskbuddy-notification.svg"]);
    assert.deepStrictEqual(theme.sleepingHitboxFiles, ["deskbuddy-sleeping.svg", "deskbuddy-collapsing.svg"]);
    assert.ok(theme.timings.minDisplay.error > 0);
    assert.ok(theme.timings.autoReturn.sweeping > 0);
  });
});
