"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { migrateLegacyUserData } = require("../src/deskbuddy-migration");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("deskbuddy-migration", async (t) => {
  await t.test("copies legacy prefs into the new location and renames the file", () => {
    const appDataDir = makeTempDir("deskbuddy-migration-appdata-");
    const legacyDir = path.join(appDataDir, "deskbuddy");
    const newDir = path.join(appDataDir, "deskbuddy");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, "deskbuddy-prefs.json"),
      JSON.stringify({ theme: "calico", x: 100 }),
    );

    const result = migrateLegacyUserData({ appDataDir, newUserDataDir: newDir });

    assert.equal(result.migrated, true);
    const migratedPrefsPath = path.join(newDir, "deskbuddy-prefs.json");
    assert.equal(fs.existsSync(migratedPrefsPath), true);
    const migrated = JSON.parse(fs.readFileSync(migratedPrefsPath, "utf8"));
    assert.equal(migrated.theme, "spark", "theme must be force-migrated to spark regardless of prior selection");
    assert.equal(migrated.x, 100, "unrelated prefs fields must survive the migration untouched");
  });

  await t.test("leaves the legacy folder in place (copy, not move)", () => {
    const appDataDir = makeTempDir("deskbuddy-migration-appdata-");
    const legacyDir = path.join(appDataDir, "deskbuddy");
    const newDir = path.join(appDataDir, "deskbuddy");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "deskbuddy-prefs.json"), JSON.stringify({ theme: "deskbuddy" }));

    migrateLegacyUserData({ appDataDir, newUserDataDir: newDir });

    assert.equal(fs.existsSync(path.join(legacyDir, "deskbuddy-prefs.json")), true);
  });

  await t.test("is a no-op when there is no legacy folder", () => {
    const appDataDir = makeTempDir("deskbuddy-migration-appdata-");
    const newDir = path.join(appDataDir, "deskbuddy");
    fs.mkdirSync(newDir, { recursive: true });

    const result = migrateLegacyUserData({ appDataDir, newUserDataDir: newDir });

    assert.equal(result.migrated, false);
    assert.equal(fs.readdirSync(newDir).length, 0);
  });

  await t.test("is a no-op when the new location already has a prefs file (already migrated)", () => {
    const appDataDir = makeTempDir("deskbuddy-migration-appdata-");
    const legacyDir = path.join(appDataDir, "deskbuddy");
    const newDir = path.join(appDataDir, "deskbuddy");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "deskbuddy-prefs.json"), JSON.stringify({ theme: "deskbuddy" }));
    fs.writeFileSync(path.join(newDir, "deskbuddy-prefs.json"), JSON.stringify({ theme: "calico" }));

    const result = migrateLegacyUserData({ appDataDir, newUserDataDir: newDir });

    assert.equal(result.migrated, false);
    const untouched = JSON.parse(fs.readFileSync(path.join(newDir, "deskbuddy-prefs.json"), "utf8"));
    assert.equal(untouched.theme, "calico", "must not overwrite an already-migrated (or fresh) install");
  });

  await t.test("copies non-prefs files (e.g. theme overrides cache) alongside the prefs file", () => {
    const appDataDir = makeTempDir("deskbuddy-migration-appdata-");
    const legacyDir = path.join(appDataDir, "deskbuddy");
    const newDir = path.join(appDataDir, "deskbuddy");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "deskbuddy-prefs.json"), JSON.stringify({ theme: "deskbuddy" }));
    fs.writeFileSync(path.join(legacyDir, "deskbuddy-main.log"), "some log line\n");

    migrateLegacyUserData({ appDataDir, newUserDataDir: newDir });

    assert.equal(fs.existsSync(path.join(newDir, "deskbuddy-main.log")), true);
  });
});
