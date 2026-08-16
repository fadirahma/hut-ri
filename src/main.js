import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import geojson from "./data/indonesia.json";
import { REGION_DEFS, OVERVIEW, createProjection } from "./lib/geo.js";
import { buildTerrain } from "./scene/terrain.js";
import { buildPaths } from "./scene/paths.js";
import { buildAmbient } from "./scene/ambient.js";
import { createFlyTo } from "./scene/flyto.js";

/* ---------------- Elemen UI ---------------- */
const $ = (id) => document.getElementById(id);
const loaderEl = $("loader");
const loaderFill = $("loader-fill");
const loaderPct = $("loader-pct");
const focusBanner = $("focus-banner");
const focusName = $("focus-name");
const focusDesc = $("focus-desc");
const nodeButtons = Array.from(document.querySelectorAll(".node"));
const countdownEl = $("countdown");

let renderer;
let scene;
let camera;
let controls;
let composer;
let bloomPass;
let raycaster;
let pointerNdc = new THREE.Vector2();
let regionEntries = [];
let paths;
let ambient;

const isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
// mode verifikasi headless: render ringan tanpa bloom/rotasi
const IS_TEST = new URLSearchParams(window.location.search).has("test");
let userInteracted = false;
let autoFocused = false;
let hoveredMesh = null;
let running = true;
const clock = new THREE.Clock();

/* ---------------- Loader ---------------- */
function setProgress(pct, label) {
  loaderFill.style.width = `${pct}%`;
  loaderPct.textContent = `${Math.round(pct)}%`;
  if (label) loaderPct.dataset.label = label;
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Init 3D ---------------- */
function initRenderer() {
  renderer = new THREE.WebGLRenderer({
    antialias: !isMobile,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(IS_TEST ? 1 : Math.min(window.devicePixelRatio, isMobile ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x04050a, 1);
  $("scene").appendChild(renderer.domElement);
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050a);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 13, 22);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3.5;
  controls.maxDistance = 60;
  controls.maxPolarAngle = 1.52;
  controls.target.set(0, 0, 0);
  controls.autoRotateSpeed = 0.55;
  controls.autoRotate = false;

  raycaster = new THREE.Raycaster();
}

function initComposer() {
  if (IS_TEST) {
    composer = null;
    return;
  }
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.15,
    0.7,
    0.24
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

/* ---------------- Boot ---------------- */
async function boot() {
  setProgress(6, "Mempersiapkan mesin 3D…");
  await tick(60);
  initRenderer();
  initScene();
  initComposer();
  await tick(80);

  setProgress(20, "Memuat peta kepulauan…");
  await tick(60);
  const features = geojson.features;
  const projection = createProjection(features);

  setProgress(38, "Menghitung topografi Nusantara…");
  await tick(60);
  const terrain = buildTerrain(features, projection);
  regionEntries = terrain.meshes;
  for (const e of regionEntries) {
    scene.add(e.mesh);
  }
  setProgress(62, "Medan 3D selesai dibangun…");
  await tick(80);

  setProgress(74, "Menyalakan jalur data merah-putih…");
  await tick(60);
  paths = buildPaths(projection, regionEntries);
  scene.add(paths.group);

  setProgress(88, "Menyiapkan pencahayaan sinematik…");
  await tick(60);
  ambient = buildAmbient(scene, renderer, terrain.worldBounds, { isMobile });

  setProgress(96, "Merapikan partikel melayang…");
  await tick(80);

  setProgress(100, "Merdeka!");
  await tick(420);
  loaderEl.classList.add("done");
  document.body.classList.add("loaded");
  startIntro();
  bindInteractions();
  bindNodes();
  startCountdown();
}

/* ---------------- Intro sinematik ---------------- */
function startIntro() {
  camera.position.set(8, 34, 66);
  controls.target.set(0, 0, 0);
  controls.enabled = false;
  const startPos = camera.position.clone();
  const endPos = new THREE.Vector3(0, 13, 22);
  const D = 3400;
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const step = (now) => {
    const t = Math.min(1, (now - t0) / D);
    camera.position.lerpVectors(startPos, endPos, ease(t));
    controls.update();
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      controls.enabled = true;
      controls.autoRotate = true;
      scheduleAutoFocus();
    }
  };
  requestAnimationFrame(step);
}

function scheduleAutoFocus() {
  setTimeout(() => {
    if (!userInteracted && !autoFocused) {
      autoFocused = true;
      focusRegion("jawa");
    }
  }, 5500);
}

/* ---------------- Fokus pulau ---------------- */
function focusRegion(regionId) {
  const entry = regionEntries.find((e) => e.def.id === regionId);
  if (!entry) return;
  autoFocused = true;
  const distance = THREE.MathUtils.clamp(entry.radius * 2.6, 3.4, 14);
  ensureFlyTo().flyTo(entry.centroid, distance);
  setActiveNode(regionId);
  showBanner(entry.def);
}

let flyTo = null;
function ensureFlyTo() {
  if (!flyTo) flyTo = createFlyTo(camera, controls);
  return flyTo;
}

function setActiveNode(id) {
  for (const btn of nodeButtons) btn.classList.toggle("active", btn.dataset.region === id);
}

function showBanner(def) {
  focusName.textContent = def.name.toUpperCase();
  focusDesc.textContent = def.desc;
  focusBanner.classList.add("show");
  focusBanner.classList.remove("animate");
  void focusBanner.offsetWidth;
  focusBanner.classList.add("animate");
}

function showOverview() {
  focusName.textContent = OVERVIEW.name;
  focusDesc.textContent = OVERVIEW.desc;
  focusBanner.classList.add("show");
}

/* ---------------- Interaksi ---------------- */
function bindInteractions() {
  const el = renderer.domElement;
  let downX = 0;
  let downY = 0;
  let downT = 0;

  el.addEventListener("pointerdown", (e) => {
    userInteracted = true;
    controls.autoRotate = false;
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
  });

  el.addEventListener("pointerup", (e) => {
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    const dt = performance.now() - downT;
    if (dx * dx + dy * dy < 49 && dt < 600) {
      pickAt(e.clientX, e.clientY, (entry) => focusRegion(entry.def.id));
    }
  });

  if (window.matchMedia("(pointer: fine)").matches) {
    let hoverPending = false;
    el.addEventListener("pointermove", (e) => {
      pointerNdc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      if (hoverPending) return;
      hoverPending = true;
      requestAnimationFrame(() => {
        hoverPending = false;
        updateHover();
      });
    });
    el.addEventListener("pointerleave", () => clearHover());
  }

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) clock.getDelta();
  });
}

function pickAt(clientX, clientY, cb) {
  pointerNdc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  for (const e of regionEntries) {
    const hits = raycaster.intersectObject(e.mesh, false);
    if (hits.length > 0) {
      cb(e);
      return;
    }
  }
}

function updateHover() {
  raycaster.setFromCamera(pointerNdc, camera);
  let hit = null;
  for (const e of regionEntries) {
    if (raycaster.intersectObject(e.mesh, false).length > 0) {
      hit = e.mesh;
      break;
    }
  }
  if (hit !== hoveredMesh) {
    clearHover();
    if (hit) {
      hoveredMesh = hit;
      hit.material.userData.uniforms.uGlow.value = 1.55;
      renderer.domElement.style.cursor = "pointer";
    }
  }
}

function clearHover() {
  if (hoveredMesh) {
    hoveredMesh.material.userData.uniforms.uGlow.value = 1.0;
    hoveredMesh = null;
  }
  renderer.domElement.style.cursor = "";
}

function bindNodes() {
  for (const btn of nodeButtons) {
    btn.addEventListener("click", () => focusRegion(btn.dataset.region));
  }
}

/* ---------------- Countdown ---------------- */
const TARGET = new Date("2026-08-17T00:00:00+07:00").getTime();
const pad = (n) => String(n).padStart(2, "0");

function startCountdown() {
  const dEl = $("cd-d");
  const hEl = $("cd-h");
  const mEl = $("cd-m");
  const sEl = $("cd-s");
  const capEl = $("cd-cap");
  const labelEl = $("cd-label");

  const update = () => {
    const diff = TARGET - Date.now();
    if (diff <= 0) {
      countdownEl.classList.add("merdeka");
      labelEl.textContent = "17 Agustus 2026";
      dEl.textContent = "--";
      hEl.textContent = "--";
      mEl.textContent = "--";
      sEl.textContent = "00";
      capEl.textContent = "MERDEKA! 🇮🇩";
      return;
    }
    const days = Math.floor(diff / 864e5);
    const hours = Math.floor(diff / 36e5) % 24;
    const mins = Math.floor(diff / 6e4) % 60;
    const secs = Math.floor(diff / 1e3) % 60;
    dEl.textContent = pad(days);
    hEl.textContent = pad(hours);
    mEl.textContent = pad(mins);
    sEl.textContent = pad(secs);
    capEl.textContent = days > 0 ? `H-${days} menuju kemerdekaan` : "Detik menuju kemerdekaan";
  };
  update();
  setInterval(update, 500);
}

/* ---------------- Resize ---------------- */
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}

/* ---------------- Loop ---------------- */
function loop() {
  requestAnimationFrame(loop);
  if (!running) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (controls)  if (controls) controls.update();

  for (const e of regionEntries) {
    const u = e.mesh.material.userData.uniforms;
    if (u) u.uTime.value = t;
  }
  if (paths) paths.update(t, camera.position);
  if (ambient) ambient.update(t, dt);

  if (composer) composer.render();
  else renderer.render(scene, camera);
}

/* ---------------- Debug (untuk verifikasi otomatis) ---------------- */
window.__dbg = {
  get renderer() { return renderer; },
  get scene() { return scene; },
  get camera() { return camera; },
  get regionEntries() { return regionEntries; },
};

/* ---------------- Start ---------------- */
showOverview();
boot().catch((err) => {
  console.error(err);
  loaderPct.textContent = "Gagal memuat — periksa konsol";
});
requestAnimationFrame(loop);
