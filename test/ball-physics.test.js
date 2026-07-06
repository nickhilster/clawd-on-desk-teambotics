"use strict";

const { beforeEach, afterEach, describe, it, mock } = require("node:test");
const assert = require("node:assert");

const { createBallPhysics, buildRendererBallTheme } = require("../src/ball-physics");

function makeTheme() {
  return {
    movement: "physics",
    ballPhysics: {
      defaultSport: "tennis",
      sports: {
        tennis: {
          file: "ball-tennis.svg",
          gravity: 0.22,
          restitution: 0.86,
          rollingFriction: 0.03,
          airDrag: 0.004,
          spinFactor: 0.24,
          radius: 26,
        },
        cricket: {
          file: "ball-cricket.svg",
          gravity: 0.24,
          restitution: 0.68,
          rollingFriction: 0.06,
          airDrag: 0.006,
          spinFactor: 0.18,
          radius: 26,
        },
        football: {
          file: "ball-football.svg",
          gravity: 0.18,
          restitution: 0.58,
          rollingFriction: 0.025,
          airDrag: 0.003,
          spinFactor: 0.12,
          radius: 26,
        },
      },
    },
  };
}

function makeCtx(overrides = {}) {
  const bounds = { x: 240, y: 180, width: 120, height: 120 };
  const appliedBounds = [];
  const sports = [];
  const rotations = [];
  let currentState = "working";
  const ctx = {
    getTheme: () => makeTheme(),
    win: {
      isDestroyed() { return false; },
    },
    getPetWindowBounds() { return { ...bounds }; },
    applyPetWindowBounds(next) {
      appliedBounds.push({ ...next });
      bounds.x = next.x;
      bounds.y = next.y;
      bounds.width = next.width;
      bounds.height = next.height;
    },
    syncHitWin() {},
    repositionAnchoredSurfaces() {},
    repositionBubbles() {},
    bubbleFollowPet: false,
    pendingPermissions: [],
    getNearestWorkArea() { return { x: 0, y: 0, width: 1440, height: 900 }; },
    getMiniMode() { return false; },
    getCurrentState() { return currentState; },
    miniTransitioning: false,
    getDragLocked() { return false; },
    applyState(state) { currentState = state; },
    setState(state) { currentState = state; },
    setBallRotation(rotationDeg) { rotations.push(rotationDeg); },
    setBallSport(sportId) { sports.push(sportId); },
    _appliedBounds: appliedBounds,
    _sports: sports,
    _rotations: rotations,
    _setCurrentState(state) { currentState = state; },
  };
  Object.assign(ctx, overrides);
  return ctx;
}

describe("ball physics", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.reset();
  });

  it("builds renderer ball metadata from a physics theme", () => {
    const rendererTheme = buildRendererBallTheme(makeTheme());
    assert.deepEqual(rendererTheme, {
      defaultSport: "tennis",
      sports: {
        tennis: { file: "ball-tennis.svg", miniFile: "ball-tennis.svg" },
        cricket: { file: "ball-cricket.svg", miniFile: "ball-cricket.svg" },
        football: { file: "ball-football.svg", miniFile: "ball-football.svg" },
      },
    });
  });

  it("drives movement and rotation for active states", () => {
    const ctx = makeCtx();
    const physics = createBallPhysics(ctx);
    physics.setEnabled(true);
    physics.tick();

    mock.timers.tick(64);

    assert.ok(ctx._appliedBounds.length > 0, "physics should write pet bounds");
    assert.ok(ctx._rotations.length > 0, "physics should emit rotation updates");
  });

  it("morphs to a different sport on Claude session start", () => {
    mock.method(Math, "random", () => 0.95);
    const ctx = makeCtx();
    const physics = createBallPhysics(ctx);
    physics.setEnabled(true);

    assert.equal(ctx._sports[0], "tennis");
    physics.noteSessionLifecycle({ event: "SessionStart", agentId: "claude-code" });

    assert.equal(ctx._sports.at(-1), "football");
  });

  it("suspends movement in mini mode", () => {
    const ctx = makeCtx({ getMiniMode: () => true });
    const physics = createBallPhysics(ctx);
    physics.setEnabled(true);
    physics.tick();

    mock.timers.tick(64);

    assert.equal(ctx._appliedBounds.length, 0);
  });
});
