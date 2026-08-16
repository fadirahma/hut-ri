import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

function makeRadialTexture(inner, outer, size = 256) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildAmbient(scene, renderer, worldBounds, opts = {}) {
  const isMobile = opts.isMobile;

  // ---- Lingkungan (refleksi studio) ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  if ("environmentIntensity" in scene) scene.environmentIntensity = 0.85;

  // ---- Pencahayaan ----
  const ambient = new THREE.AmbientLight(0x141824, 0.7);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff1e0, 2.6);
  key.position.set(14, 20, 12);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xff1a24, 7);
  rim.position.set(-16, 8, -14);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0x3d6cff, 1.4);
  fill.position.set(-4, 6, -18);
  scene.add(fill);

  // ---- Laut reflektif ----
  const oceanTex = makeRadialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)");
  const ocean = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x04060c,
      metalness: 1,
      roughness: 0.16,
      envMapIntensity: 0.9,
      transparent: true,
      alphaMap: oceanTex,
      depthWrite: false,
    })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.42;
  ocean.renderOrder = 2;
  scene.add(ocean);

  // ---- Aura merah di bawah kepulauan ----
  const glowTex = makeRadialTexture("rgba(255,45,60,0.85)", "rgba(255,45,60,0)");
  const underglow = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 30),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = -0.36;
  underglow.renderOrder = 3;
  scene.add(underglow);

  // ---- Partikel melayang ----
  const COUNT = isMobile ? 320 : 640;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  const white = new THREE.Color(0xcfd6ff);
  const red = new THREE.Color(0xff3b30);
  const col = new THREE.Color();

  const halfW = (worldBounds.maxX - worldBounds.minX) / 2 + 5;
  const halfD = (worldBounds.maxZ - worldBounds.minZ) / 2 + 5;
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * halfW;
    positions[i * 3 + 1] = Math.random() * 7;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * halfD;
    col.copy(Math.random() < 0.78 ? white : red);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
    speeds[i] = 0.08 + Math.random() * 0.22;
  }

  const particleTex = makeRadialTexture("rgba(255,255,255,1)", "rgba(255,255,255,0)", 64);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.085,
    map: particleTex,
    transparent: true,
    opacity: 0.65,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.renderOrder = 4;
  scene.add(points);

  const posAttr = pGeo.attributes.position;

  return {
    ocean,
    underglow,
    points,
    update(t, dt) {
      underglow.material.opacity = 0.26 + 0.1 * Math.sin(t * 0.8);
      for (let i = 0; i < COUNT; i++) {
        let y = posAttr.getY(i) + speeds[i] * dt;
        if (y > 7.2) y = 0;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    },
  };
}
