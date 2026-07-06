"use strict";

const PHYSICS_FRAME_MS = 16;
const IDLE_DELAY_MS = 8000;
const BETWEEN_ROAM_DELAY_MS = 4000;
const TARGET_MIN_DIST = 120;
const TARGET_ATTEMPTS = 8;
const TARGET_MARGIN_RATIO = 0.15;
const SETTLE_SPEED_EPSILON = 0.08;
const SETTLE_SPIN_EPSILON = 0.2;

const STATE_IMPULSES = {
  idle: { kind: "idle", intervalMs: [1400, 2600] },
  roam: { kind: "roam", intervalMs: null },
  working: { kind: "tap", intervalMs: [500, 900] },
  thinking: { kind: "tap", intervalMs: [650, 1100] },
  attention: { kind: "pop", intervalMs: [1400, 2200] },
  notification: { kind: "pop", intervalMs: [1400, 2200] },
  error: { kind: "wobble", intervalMs: [700, 1200] },
  sleeping: { kind: "sleep", intervalMs: null },
  dozing: { kind: "sleep", intervalMs: null },
  waking: { kind: "wake", intervalMs: [1200, 1800] },
  dizzy: { kind: "dizzy", intervalMs: [500, 900] },
  carrying: { kind: "tap", intervalMs: [650, 950] },
  sweeping: { kind: "tap", intervalMs: [650, 950] },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickDelay(range) {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [min, max] = range;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  return Math.round(min + Math.random() * (max - min));
}

function sanitizeSportEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const radius = Number(raw.radius);
  const gravity = Number(raw.gravity);
  const restitution = Number(raw.restitution);
  const rollingFriction = Number(raw.rollingFriction);
  const airDrag = Number(raw.airDrag);
  const spinFactor = Number(raw.spinFactor);
  const file = typeof raw.file === "string" && raw.file ? raw.file : null;
  if (!file) return null;
  if (![radius, gravity, restitution, rollingFriction, airDrag, spinFactor].every(Number.isFinite)) {
    return null;
  }
  return {
    radius,
    gravity,
    restitution,
    rollingFriction,
    airDrag,
    spinFactor,
    file,
    miniFile: typeof raw.miniFile === "string" && raw.miniFile ? raw.miniFile : null,
  };
}

function getBallTheme(theme) {
  if (!theme || theme.movement !== "physics" || !theme.ballPhysics || typeof theme.ballPhysics !== "object") {
    return null;
  }
  const sports = {};
  for (const [sportId, rawSport] of Object.entries(theme.ballPhysics.sports || {})) {
    const sport = sanitizeSportEntry(rawSport);
    if (sport) sports[sportId] = sport;
  }
  const sportIds = Object.keys(sports);
  if (sportIds.length === 0) return null;
  const defaultSport = typeof theme.ballPhysics.defaultSport === "string" && sports[theme.ballPhysics.defaultSport]
    ? theme.ballPhysics.defaultSport
    : sportIds[0];
  return {
    defaultSport,
    sports,
    sportIds,
  };
}

function buildRendererBallTheme(theme) {
  const ballTheme = getBallTheme(theme);
  if (!ballTheme) return null;
  const sports = {};
  for (const [sportId, sport] of Object.entries(ballTheme.sports)) {
    sports[sportId] = {
      file: sport.file,
      miniFile: sport.miniFile || sport.file,
    };
  }
  return {
    defaultSport: ballTheme.defaultSport,
    sports,
  };
}

function pickRandomSport(ballTheme, currentSportId) {
  if (!ballTheme || !Array.isArray(ballTheme.sportIds) || ballTheme.sportIds.length === 0) return null;
  if (ballTheme.sportIds.length === 1) return ballTheme.sportIds[0];
  const candidates = ballTheme.sportIds.filter((sportId) => sportId !== currentSportId);
  return candidates[Math.floor(Math.random() * candidates.length)] || ballTheme.sportIds[0];
}

function createBallPhysics(ctx) {
  let enabled = false;
  let loopTimer = null;
  let roamTimer = null;
  let nextImpulseAt = 0;
  let firstRoam = true;
  let lastState = null;
  let dragging = false;
  let currentSportId = null;
  let currentSport = null;
  let physics = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    spin: 0,
    rotationDeg: 0,
  };

  function getTheme() {
    return typeof ctx.getTheme === "function" ? ctx.getTheme() : null;
  }

  function getBallConfig() {
    return getBallTheme(getTheme());
  }

  function isSupportedTheme() {
    return !!getBallConfig();
  }

  function clearLoop() {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
  }

  function clearRoamTimer() {
    if (roamTimer) {
      clearTimeout(roamTimer);
      roamTimer = null;
    }
  }

  function clearTimers() {
    clearLoop();
    clearRoamTimer();
  }

  function getBounds() {
    if (typeof ctx.getPetWindowBounds !== "function") return null;
    const bounds = ctx.getPetWindowBounds();
    if (!bounds) return null;
    return {
      x: Number(bounds.x),
      y: Number(bounds.y),
      width: Number(bounds.width),
      height: Number(bounds.height),
    };
  }

  function syncPhysicsToBounds() {
    const bounds = getBounds();
    if (!bounds) return false;
    physics.x = bounds.x;
    physics.y = bounds.y;
    return Number.isFinite(physics.x) && Number.isFinite(physics.y);
  }

  function pushFrame() {
    const bounds = getBounds();
    if (!bounds) return false;
    if (![physics.x, physics.y, physics.rotationDeg].every(Number.isFinite)) return false;
    ctx.applyPetWindowBounds({
      x: Math.round(physics.x),
      y: Math.round(physics.y),
      width: bounds.width,
      height: bounds.height,
    });
    if (typeof ctx.syncHitWin === "function") ctx.syncHitWin();
    if (typeof ctx.repositionAnchoredSurfaces === "function") ctx.repositionAnchoredSurfaces();
    if (typeof ctx.repositionBubbles === "function" && ctx.bubbleFollowPet && ctx.pendingPermissions.length) {
      ctx.repositionBubbles();
    }
    if (typeof ctx.setBallRotation === "function") ctx.setBallRotation(physics.rotationDeg);
    return true;
  }

  function setSport(sportId) {
    const ballConfig = getBallConfig();
    if (!ballConfig) return false;
    const nextSport = ballConfig.sports[sportId];
    if (!nextSport) return false;
    currentSportId = sportId;
    currentSport = nextSport;
    if (typeof ctx.setBallSport === "function") ctx.setBallSport(currentSportId);
    return true;
  }

  function ensureSport() {
    const ballConfig = getBallConfig();
    if (!ballConfig) {
      currentSportId = null;
      currentSport = null;
      return false;
    }
    if (currentSportId && ballConfig.sports[currentSportId]) {
      currentSport = ballConfig.sports[currentSportId];
      return true;
    }
    return setSport(ballConfig.defaultSport);
  }

  function canRun() {
    if (!enabled) return false;
    if (!isSupportedTheme()) return false;
    if (!ctx.win || (typeof ctx.win.isDestroyed === "function" && ctx.win.isDestroyed())) return false;
    if (typeof ctx.getMiniMode === "function" && ctx.getMiniMode()) return false;
    if (ctx.miniTransitioning) return false;
    return true;
  }

  function scheduleLoop() {
    if (loopTimer || !canRun()) return;
    loopTimer = setTimeout(step, PHYSICS_FRAME_MS);
  }

  function scheduleStateImpulse(state) {
    const impulse = STATE_IMPULSES[state] || null;
    if (!impulse || !impulse.intervalMs) {
      nextImpulseAt = 0;
      return;
    }
    nextImpulseAt = Date.now() + pickDelay(impulse.intervalMs);
  }

  function isSettled() {
    return Math.abs(physics.vx) < SETTLE_SPEED_EPSILON
      && Math.abs(physics.vy) < SETTLE_SPEED_EPSILON
      && Math.abs(physics.spin) < SETTLE_SPIN_EPSILON;
  }

  function pickTarget() {
    const bounds = getBounds();
    if (!bounds) return null;
    const wa = ctx.getNearestWorkArea(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
    if (!wa) return null;
    const marginX = Math.round(wa.width * TARGET_MARGIN_RATIO);
    const marginY = Math.round(wa.height * TARGET_MARGIN_RATIO);
    const xMin = wa.x + marginX;
    const xMax = wa.x + wa.width - bounds.width - marginX;
    const yMin = wa.y + marginY;
    const yMax = wa.y + wa.height - bounds.height - marginY;
    if (xMax <= xMin || yMax <= yMin) return null;
    for (let i = 0; i < TARGET_ATTEMPTS; i += 1) {
      const x = xMin + Math.floor(Math.random() * (xMax - xMin));
      const y = yMin + Math.floor(Math.random() * (yMax - yMin));
      const dx = x - bounds.x;
      const dy = y - bounds.y;
      if (Math.sqrt(dx * dx + dy * dy) >= TARGET_MIN_DIST) return { x, y };
    }
    return { x: xMin, y: yMin };
  }

  function resolveRoamKick(target) {
    const bounds = getBounds();
    if (!bounds || !target) return null;
    const dx = target.x - bounds.x;
    const dy = target.y - bounds.y;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const nx = dx / dist;
    const ny = dy / dist;
    const speed = clamp(dist * 0.04, 4.5, 13);
    return {
      vx: nx * speed,
      vy: ny * speed - currentSport.gravity * 2.8,
    };
  }

  function applyImpulse(kind, payload = null) {
    if (!currentSport) return;
    switch (kind) {
      case "idle":
        physics.vx += (Math.random() - 0.5) * 1.2;
        physics.vy -= 1.8 + Math.random() * 1.3;
        physics.spin += (Math.random() - 0.5) * 3;
        break;
      case "tap":
        physics.vx += (Math.random() - 0.5) * 1.8;
        physics.vy -= 2 + Math.random() * 1.8;
        physics.spin += (Math.random() - 0.5) * 5;
        break;
      case "pop":
        physics.vx += (Math.random() - 0.5) * 2.4;
        physics.vy -= 4.5 + Math.random() * 2.5;
        physics.spin += (Math.random() - 0.5) * 8;
        break;
      case "wobble":
        physics.vx += (Math.random() - 0.5) * 1.4;
        physics.vy += (Math.random() - 0.5) * 1.2;
        physics.spin += (Math.random() - 0.5) * 18;
        break;
      case "dizzy":
        physics.vx += (Math.random() - 0.5) * 3;
        physics.vy -= 1 + Math.random() * 2;
        physics.spin += (Math.random() - 0.5) * 24;
        break;
      case "sleep":
        physics.vx *= 0.75;
        physics.vy *= 0.75;
        physics.spin *= 0.6;
        break;
      case "wake":
        physics.vx += (Math.random() - 0.5) * 1.5;
        physics.vy -= 2.8 + Math.random();
        physics.spin += (Math.random() - 0.5) * 5;
        break;
      case "roam": {
        const kick = resolveRoamKick(payload);
        if (!kick) return;
        physics.vx += kick.vx;
        physics.vy += kick.vy;
        physics.spin += kick.vx * currentSport.spinFactor * 10;
        break;
      }
      default:
        break;
    }
  }

  function maybeStartIdleRoam(state) {
    if (state !== "idle") {
      clearRoamTimer();
      firstRoam = true;
      return;
    }
    if (roamTimer) return;
    const delay = firstRoam ? IDLE_DELAY_MS : BETWEEN_ROAM_DELAY_MS;
    firstRoam = false;
    roamTimer = setTimeout(() => {
      roamTimer = null;
      if (!canRun()) return;
      if ((typeof ctx.getCurrentState === "function" ? ctx.getCurrentState() : "idle") !== "idle") return;
      const target = pickTarget();
      if (!target) {
        maybeStartIdleRoam("idle");
        return;
      }
      if (typeof ctx.applyState === "function") ctx.applyState("roam");
      applyImpulse("roam", target);
      scheduleLoop();
    }, delay);
  }

  function handleStateChange(state) {
    if (state === lastState) return;
    lastState = state;
    const impulse = STATE_IMPULSES[state] || null;
    if (impulse && impulse.kind !== "idle" && impulse.kind !== "roam") {
      applyImpulse(impulse.kind);
    }
    if (state === "sleeping" || state === "dozing") {
      physics.vx *= 0.5;
      physics.vy *= 0.5;
      physics.spin *= 0.4;
    }
    scheduleStateImpulse(state);
    maybeStartIdleRoam(state);
  }

  function maybeApplyPeriodicImpulse(state) {
    const impulse = STATE_IMPULSES[state] || null;
    if (!impulse || !impulse.intervalMs || !nextImpulseAt || Date.now() < nextImpulseAt) return;
    applyImpulse(impulse.kind);
    scheduleStateImpulse(state);
  }

  function stopAtDropPoint() {
    physics.vx = 0;
    physics.vy = 0;
    physics.spin = 0;
    const bounds = getBounds();
    if (bounds) {
      physics.x = bounds.x;
      physics.y = bounds.y;
    }
    if (typeof ctx.setBallRotation === "function") ctx.setBallRotation(physics.rotationDeg);
  }

  function step() {
    loopTimer = null;
    if (!canRun()) {
      clearLoop();
      return;
    }
    if (!ensureSport()) return;
    const currentState = typeof ctx.getCurrentState === "function" ? ctx.getCurrentState() : "idle";
    handleStateChange(currentState);

    const dragLocked = typeof ctx.getDragLocked === "function" ? ctx.getDragLocked() : false;
    if (dragLocked) {
      dragging = true;
      stopAtDropPoint();
      scheduleLoop();
      return;
    }
    if (dragging) {
      dragging = false;
      syncPhysicsToBounds();
      stopAtDropPoint();
      maybeApplyPeriodicImpulse(currentState === "roam" ? "idle" : currentState);
    }

    maybeApplyPeriodicImpulse(currentState);

    physics.vy += currentSport.gravity;
    physics.vx *= 1 - currentSport.airDrag;
    physics.vy *= 1 - currentSport.airDrag;

    physics.x += physics.vx;
    physics.y += physics.vy;
    physics.rotationDeg += physics.spin;

    const bounds = getBounds();
    if (!bounds) return;
    const wa = ctx.getNearestWorkArea(
      physics.x + bounds.width / 2,
      physics.y + bounds.height / 2
    );
    if (!wa) return;

    const minX = wa.x;
    const maxX = wa.x + wa.width - bounds.width;
    const minY = wa.y;
    const maxY = wa.y + wa.height - bounds.height;

    let collided = false;
    if (physics.x <= minX) {
      physics.x = minX;
      physics.vx = Math.abs(physics.vx) * currentSport.restitution;
      collided = true;
    } else if (physics.x >= maxX) {
      physics.x = maxX;
      physics.vx = -Math.abs(physics.vx) * currentSport.restitution;
      collided = true;
    }
    if (physics.y <= minY) {
      physics.y = minY;
      physics.vy = Math.abs(physics.vy) * currentSport.restitution;
      collided = true;
    } else if (physics.y >= maxY) {
      physics.y = maxY;
      physics.vy = -Math.abs(physics.vy) * currentSport.restitution;
      physics.vx *= (1 - currentSport.rollingFriction);
      physics.spin += physics.vx * currentSport.spinFactor;
      collided = true;
      if (Math.abs(physics.vy) < 0.9) physics.vy = 0;
    }

    if (collided) {
      physics.spin += physics.vx * currentSport.spinFactor * 0.6;
    }

    physics.spin *= 0.985;
    if (!Number.isFinite(physics.x) || !Number.isFinite(physics.y) || !Number.isFinite(physics.rotationDeg)) {
      syncPhysicsToBounds();
      physics.vx = 0;
      physics.vy = 0;
      physics.spin = 0;
      return;
    }

    pushFrame();

    if (currentState === "roam" && isSettled()) {
      if (typeof ctx.setState === "function") ctx.setState("idle");
      maybeStartIdleRoam("idle");
    }

    if (!isSettled() || currentState !== "idle" || roamTimer || nextImpulseAt) {
      scheduleLoop();
    }
  }

  function refreshTheme() {
    if (!ensureSport()) {
      clearTimers();
      return;
    }
    if (typeof ctx.setBallSport === "function") ctx.setBallSport(currentSportId);
    if (typeof ctx.setBallRotation === "function") ctx.setBallRotation(physics.rotationDeg);
    if (enabled) scheduleLoop();
  }

  function setEnabled(value) {
    const next = !!value;
    enabled = next;
    if (!enabled) {
      clearTimers();
      return;
    }
    if (!ensureSport()) return;
    syncPhysicsToBounds();
    scheduleLoop();
    maybeStartIdleRoam(typeof ctx.getCurrentState === "function" ? ctx.getCurrentState() : "idle");
  }

  function cancelRoam() {
    clearRoamTimer();
    if ((typeof ctx.getCurrentState === "function" ? ctx.getCurrentState() : null) === "roam" && typeof ctx.setState === "function") {
      ctx.setState("idle");
    }
    firstRoam = true;
  }

  function tick() {
    if (!canRun()) {
      cancelRoam();
      clearLoop();
      return;
    }
    if (!ensureSport()) return;
    syncPhysicsToBounds();
    handleStateChange(typeof ctx.getCurrentState === "function" ? ctx.getCurrentState() : "idle");
    scheduleLoop();
  }

  function noteSessionLifecycle(event) {
    if (!canRun()) return;
    if (!event || event.event !== "SessionStart" || event.agentId !== "claude-code") return;
    const ballConfig = getBallConfig();
    if (!ballConfig) return;
    const nextSport = pickRandomSport(ballConfig, currentSportId || ballConfig.defaultSport);
    if (!nextSport) return;
    setSport(nextSport);
    applyImpulse("pop");
    scheduleLoop();
  }

  function syncRendererState() {
    if (currentSportId && typeof ctx.setBallSport === "function") ctx.setBallSport(currentSportId);
    if (typeof ctx.setBallRotation === "function") ctx.setBallRotation(physics.rotationDeg);
  }

  function cleanup() {
    clearTimers();
  }

  return {
    setEnabled,
    cancelRoam,
    tick,
    refreshTheme,
    noteSessionLifecycle,
    syncRendererState,
    cleanup,
    get enabled() {
      return enabled;
    },
    getCurrentSportId() {
      return currentSportId;
    },
  };
}

module.exports = {
  createBallPhysics,
  buildRendererBallTheme,
  getBallTheme,
  pickRandomSport,
};
