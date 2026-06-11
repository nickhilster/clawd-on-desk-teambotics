"use strict";

const ROAM_IDLE_DELAY_MS = 8000;
const ROAM_BETWEEN_DELAY_MS = 4000;
const ROAM_ANIM_DURATION_MS = 2500;
const ROAM_MIN_DIST = 100;
const ROAM_MARGIN_RATIO = 0.15;
const ROAM_FRAME_MS = 16;

module.exports = function initRoam(ctx) {
  let enabled = false;
  let roamActive = false;
  let roamAnimTimer = null;
  let roamPauseTimer = null;

  function cleanupTimers() {
    if (roamAnimTimer) { clearTimeout(roamAnimTimer); roamAnimTimer = null; }
    if (roamPauseTimer) { clearTimeout(roamPauseTimer); roamPauseTimer = null; }
  }

  function isRoamAllowed() {
    if (!enabled) return false;
    if (ctx.getMiniMode && ctx.getMiniMode()) return false;
    if (ctx.getCurrentState && ctx.getCurrentState() !== "idle") return false;
    return true;
  }

  function pickRandomTarget() {
    const bounds = ctx.getPetWindowBounds();
    if (!bounds) return null;
    const wa = ctx.getNearestWorkArea(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
    if (!wa) return null;
    const marginX = Math.round(wa.width * ROAM_MARGIN_RATIO);
    const marginY = Math.round(wa.height * ROAM_MARGIN_RATIO);
    const xMin = wa.x + marginX;
    const xMax = wa.x + wa.width - bounds.width - marginX;
    const yMin = wa.y + marginY;
    const yMax = wa.y + wa.height - bounds.height - marginY;
    if (xMax <= xMin || yMax <= yMin) return null;
    const targetX = xMin + Math.floor(Math.random() * (xMax - xMin));
    const targetY = yMin + Math.floor(Math.random() * (yMax - yMin));
    const dx = targetX - bounds.x;
    const dy = targetY - bounds.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ROAM_MIN_DIST) return null;
    return { x: targetX, y: targetY };
  }

  function animateTo(targetX, targetY) {
    if (roamAnimTimer) { clearTimeout(roamAnimTimer); roamAnimTimer = null; }
    const win = ctx.win;
    if (!win || win.isDestroyed()) { roamActive = false; return; }
    const startBounds = ctx.getPetWindowBounds();
    if (!startBounds) { roamActive = false; return; }
    const startX = startBounds.x;
    const startY = startBounds.y;
    let finalX = targetX;
    let finalY = targetY;
    if (ctx.clampToScreenVisual) {
      const clamped = ctx.clampToScreenVisual(finalX, finalY, startBounds.width, startBounds.height);
      finalX = clamped.x;
      finalY = clamped.y;
    }
    const realBounds = win.getBounds();
    const viewportOffsetY = realBounds.y - startY;
    let currentWidth = startBounds.width;
    let currentHeight = startBounds.height;
    roamActive = true;
    const startTime = Date.now();
    function step() {
      if (!roamActive) return;
      if (!win || win.isDestroyed()) { roamActive = false; return; }
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / ROAM_ANIM_DURATION_MS);
      const eased = t * (2 - t);
      const vx = Math.round(startX + (finalX - startX) * eased);
      const vy = Math.round(startY + (finalY - startY) * eased);
      if (!Number.isFinite(vx) || !Number.isFinite(vy)) { roamActive = false; return; }
      win.setBounds({ x: vx, y: vy + viewportOffsetY, width: currentWidth, height: currentHeight });
      if (t < 1 && roamActive) {
        roamAnimTimer = setTimeout(step, ROAM_FRAME_MS);
      } else {
        ctx.applyPetWindowPosition(finalX, finalY);
        if (typeof ctx.syncHitWin === "function") ctx.syncHitWin();
        if (typeof ctx.repositionAnchoredSurfaces === "function") ctx.repositionAnchoredSurfaces();
        roamActive = false;
        scheduleNextRoam();
      }
    }
    step();
  }

  function scheduleNextRoam() {
    if (roamPauseTimer) { clearTimeout(roamPauseTimer); roamPauseTimer = null; }
    if (!enabled) return;
    roamPauseTimer = setTimeout(() => {
      roamPauseTimer = null;
      if (!isRoamAllowed()) return;
      const target = pickRandomTarget();
      if (!target) { scheduleNextRoam(); return; }
      animateTo(target.x, target.y);
    }, ROAM_BETWEEN_DELAY_MS);
  }

  function setEnabled(value) {
    const next = !!value;
    if (next === enabled) return;
    enabled = next;
    if (!enabled) cancelRoam();
  }

  function cancelRoam() {
    cleanupTimers();
    roamActive = false;
  }

  function tick() {
    if (!enabled) return;
    if (!isRoamAllowed()) { cancelRoam(); return; }
    if (roamActive) return;
    if (roamPauseTimer) return;
    scheduleNextRoam();
  }

  return { setEnabled, cancelRoam, tick, get enabled() { return enabled; } };
};
