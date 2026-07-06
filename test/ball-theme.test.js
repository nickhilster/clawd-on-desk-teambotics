"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { validateTheme, mergeDefaults } = require("../src/theme-schema");
const createThemeContext = require("../src/theme-context");

const THEME_PATH = path.join(__dirname, "..", "themes", "ball", "theme.json");

test("ball theme validates as a physics theme", () => {
  const raw = JSON.parse(fs.readFileSync(THEME_PATH, "utf8"));
  const errors = validateTheme(raw);
  assert.deepEqual(errors, []);

  const theme = mergeDefaults(raw, "ball", true);
  assert.equal(theme.movement, "physics");
  assert.equal(theme.ballPhysics.defaultSport, "tennis");
});

test("ball theme renderer config exposes sport asset mapping", () => {
  const raw = JSON.parse(fs.readFileSync(THEME_PATH, "utf8"));
  const theme = mergeDefaults(raw, "ball", true);
  theme._themeDir = path.join(__dirname, "..", "themes", "ball");
  const context = createThemeContext(theme, {
    assetsSvgDir: path.join(__dirname, "..", "assets", "svg"),
    assetsSoundsDir: path.join(__dirname, "..", "assets", "sounds"),
  });

  const rendererConfig = context.getRendererConfig();
  assert.equal(rendererConfig.movement, "physics");
  assert.equal(rendererConfig.ballTheme.defaultSport, "tennis");
  assert.equal(rendererConfig.ballTheme.sports.cricket.file, "ball-cricket.svg");
});
