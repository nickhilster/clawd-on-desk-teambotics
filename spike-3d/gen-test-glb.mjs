// One-off generator: builds a small animated glTF (.glb) locally so the spike
// can test GLTFLoader + AnimationMixer without depending on an external download.
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFile } from "node:fs/promises";
// Minimal FileReader polyfill: GLTFExporter's binary path uses it to turn a
// Blob into an ArrayBuffer. Node has no Blob->FileReader bridge, so shim just
// enough of the API for that one call site.
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
};
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const scene = new THREE.Scene();

const bodyGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
bodyGeo.computeVertexNormals();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6fc3ff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.name = "Body";
body.position.y = 1;
scene.add(body);

const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
headGeo.computeVertexNormals();
const headMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
const head = new THREE.Mesh(headGeo, headMat);
head.name = "Head";
head.position.y = 1.1; // local offset, relative to Body's origin
body.add(head);

// Keyframe animation on the body: a bounce (position.y) + a head bob (rotation.x),
// mirroring the kind of clip a real pet rig would ship (idle/bounce/etc).
const bounceTrack = new THREE.KeyframeTrack(
  "Body.position[y]",
  [0, 0.5, 1],
  [1, 1.4, 1]
);
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0));
const headBobTrack = new THREE.QuaternionKeyframeTrack(
  "Head.quaternion",
  [0, 0.5, 1],
  [...q0.toArray(), ...q1.toArray(), ...q0.toArray()]
);
const clip = new THREE.AnimationClip("Bounce", 1, [bounceTrack, headBobTrack]);
scene.animations = [clip];

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  async (result) => {
    const buffer = Buffer.from(result);
    const outPath = path.join(__dirname, "assets", "test-character.glb");
    await writeFile(outPath, buffer);
    console.log("Wrote", outPath, buffer.length, "bytes");
  },
  (err) => {
    console.error("Export failed:", err);
    process.exit(1);
  },
  { binary: true, animations: scene.animations }
);
