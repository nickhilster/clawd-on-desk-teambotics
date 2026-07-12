"use strict";

const fs = require("fs");
const path = require("path");

const LEGACY_DIR_NAME = "deskbuddy";
const LEGACY_PREFS_FILENAME = "deskbuddy-prefs.json";
const NEW_PREFS_FILENAME = "deskbuddy-prefs.json";

/**
 * One-time migration from the pre-rebrand "deskbuddy" userData folder to
 * the new "deskbuddy" one. Copies (never moves) so the legacy folder is
 * always left intact as a fallback. Forces the migrated theme to "spark"
 * regardless of the user's prior selection, per the approved rebrand spec.
 *
 * @param {object} options
 * @param {string} options.appDataDir - the OS-level app-data parent directory
 *   (e.g. `app.getPath("appData")`), NOT the app's own userData directory.
 * @param {string} options.newUserDataDir - the new (post-rebrand) userData
 *   directory (e.g. `app.getPath("userData")` after the rename).
 * @returns {{ migrated: boolean }}
 */
function migrateLegacyUserData({ appDataDir, newUserDataDir }) {
  const legacyDir = path.join(appDataDir, LEGACY_DIR_NAME);
  const legacyPrefsPath = path.join(legacyDir, LEGACY_PREFS_FILENAME);
  const newPrefsPath = path.join(newUserDataDir, NEW_PREFS_FILENAME);

  if (!fs.existsSync(legacyPrefsPath)) {
    return { migrated: false };
  }
  if (fs.existsSync(newPrefsPath)) {
    // Already migrated (or a fresh install that happens to share the new
    // folder) — never overwrite.
    return { migrated: false };
  }

  fs.mkdirSync(newUserDataDir, { recursive: true });

  for (const entry of fs.readdirSync(legacyDir)) {
    const srcPath = path.join(legacyDir, entry);
    if (!fs.statSync(srcPath).isFile()) continue;

    const destName = entry === LEGACY_PREFS_FILENAME ? NEW_PREFS_FILENAME : entry;
    fs.copyFileSync(srcPath, path.join(newUserDataDir, destName));
  }

  const prefs = JSON.parse(fs.readFileSync(newPrefsPath, "utf8"));
  prefs.theme = "spark";
  fs.writeFileSync(newPrefsPath, JSON.stringify(prefs, null, 2));

  return { migrated: true };
}

module.exports = { migrateLegacyUserData, LEGACY_DIR_NAME, LEGACY_PREFS_FILENAME, NEW_PREFS_FILENAME };
