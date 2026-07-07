// --- Render window: optional 3D (Three.js/GLTF) render path ---
// Runs independently of renderer.js's DOM/SVG swap logic. A theme without
// `render3d` in theme.json never touches this file's active code paths — it
// early-returns from configure() and the 2D layer stays untouched.
//
// Design: rather than hook into renderer.js's swapToFile()/renderStateFile(),
// this module owns its own canvas overlay and its own state-change listener.
// That means a 3D theme's model failing to load can never break the existing
// 2D rendering path — the 2D layer keeps swapping in the background the whole
// time, and #pet-container only gets the `render-3d-active` class (hiding the
// 2D layer, see styles.css) once the GLB has actually loaded successfully.

import * as THREE from "../node_modules/three/build/three.module.js";
// GLTFLoader is vendored under src/vendor/, not imported from node_modules/three/examples/ —
// see the comment at the top of that file for why.
import { GLTFLoader } from "./vendor/three-addons/loaders/GLTFLoader.js";

const petContainer = document.getElementById("pet-container");
const canvas = document.getElementById("clawd3d-canvas");

let renderer = null;
let scene = null;
let camera = null;
let mixer = null;
let currentAction = null;
let rafHandle = null;
let lastFrameTime = 0;
let mixerClipsCache = [];
let clipActionsByState = {};
let configureToken = 0;

function disposeScene() {
  if (rafHandle != null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  if (scene) {
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry && obj.geometry.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
          if (!mat) continue;
          for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap"]) {
            if (mat[key]) mat[key].dispose();
          }
          mat.dispose();
        }
      }
    });
  }
  if (renderer) renderer.dispose();
  scene = null;
  camera = null;
  mixer = null;
  mixerClipsCache = [];
  clipActionsByState = {};
  currentAction = null;
  petContainer.classList.remove("render-3d-active");
}

function resizeToContainer() {
  if (!renderer || !camera) return;
  const width = petContainer.clientWidth || 1;
  const height = petContainer.clientHeight || 1;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function applyState(stateName) {
  if (!mixer) return;
  const nextAction = clipActionsByState[stateName] || clipActionsByState.__default || null;
  if (!nextAction || nextAction === currentAction) return;
  if (currentAction) currentAction.fadeOut(0.25);
  nextAction.reset().fadeIn(0.25).play();
  currentAction = nextAction;
}

function animate(now) {
  rafHandle = requestAnimationFrame(animate);
  const dt = lastFrameTime ? (now - lastFrameTime) / 1000 : 0;
  lastFrameTime = now;
  if (mixer) mixer.update(dt);
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function setupModel(gltf, clipsConfig) {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 1.5, 4.5);
  camera.lookAt(0, 1.2, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 3, 2);
  scene.add(dirLight);

  scene.add(gltf.scene);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  resizeToContainer();

  mixer = new THREE.AnimationMixer(gltf.scene);
  mixerClipsCache = gltf.animations || [];
  for (const [state, clipName] of Object.entries(clipsConfig || {})) {
    const clip = THREE.AnimationClip.findByName(mixerClipsCache, clipName);
    if (clip) clipActionsByState[state] = mixer.clipAction(clip);
  }
  if (!clipActionsByState.__default && mixerClipsCache.length > 0) {
    clipActionsByState.__default = mixer.clipAction(mixerClipsCache[0]);
  }

  lastFrameTime = 0;
  petContainer.classList.add("render-3d-active");
  applyState(window.__clawdCurrentState || "idle");
  animate(performance.now());
}

const loader = new GLTFLoader();

function configure(render3dConfig) {
  disposeScene();
  const token = ++configureToken;
  if (!render3dConfig || !render3dConfig.modelUrl) return;

  loader.load(
    render3dConfig.modelUrl,
    (gltf) => {
      if (token !== configureToken) return; // a newer configure() call superseded this load
      setupModel(gltf, render3dConfig.clips);
    },
    undefined,
    (err) => {
      console.error("[renderer-3d] failed to load GLB, falling back to 2D theme visuals:", render3dConfig.modelUrl, err);
    }
  );
}

window.electronAPI.onStateChange((state) => {
  window.__clawdCurrentState = state;
  applyState(state);
});

window.electronAPI.onThemeConfig((cfg) => configure(cfg && cfg.render3d));
window.addEventListener("resize", resizeToContainer);

configure(window.themeConfig && window.themeConfig.render3d);
