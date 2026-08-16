import * as THREE from "three";

/* Cincin api: waypoint (lng, lat) Sumatra → Jawa → Bali → Nusa Tenggara → Banda */
const VOLCANIC_ARC = [
  [95.3, 5.55], [96.1, 5.0], [96.6, 4.6], [97.4, 3.9], [98.3, 3.4],
  [99.2, 2.7], [100.1, 1.7], [100.7, 0.9], [101.3, 0.1], [102.0, -0.7],
  [103.0, -1.6], [104.0, -2.4], [105.0, -3.4], [105.6, -4.5], [105.4, -5.4],
  [105.7, -6.0], // Selat Sunda
  [105.9, -6.6], [106.9, -7.0], [108.1, -7.4], [109.2, -7.6], [110.3, -7.6],
  [111.3, -7.8], [112.5, -8.0], [113.6, -8.2], [114.5, -8.4], [115.3, -8.6],
  [116.0, -8.5], // Bali
  [117.0, -8.6], [118.2, -8.5], [119.2, -8.7], [120.3, -8.9], [121.6, -8.9],
  [122.6, -8.6], [123.9, -8.5], [125.4, -8.4], [127.0, -8.1], [128.3, -7.6],
  [129.9, -6.9], [131.0, -6.4], [132.0, -6.0],
];

/* Urutan simpul untuk tautan data antar pulau */
const LINK_ORDER = ["sumatera", "jawa", "kalimantan", "sulawesi", "maluku", "papua", "bali"];

/* ------------------------------------------------------------------ */

function makePulseMaterial(color, speed, repeat, brightness, radiusFade) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uSpeed: { value: speed },
      uRepeat: { value: repeat },
      uBrightness: { value: brightness },
      uRadiusFade: { value: radiusFade },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;
      uniform float uRepeat;
      uniform float uBrightness;
      uniform float uRadiusFade;
      varying vec2 vUv;

      void main() {
        float u = vUv.x;
        float t1 = fract(u * uRepeat - uTime * uSpeed);
        float t2 = fract(u * uRepeat - uTime * uSpeed - 0.5);
        float band1 = exp(-pow((t1 - 0.5) * 16.0, 2.0));
        float band2 = exp(-pow((t2 - 0.5) * 16.0, 2.0));
        float body = 0.05;
        vec3 col = uColor * body * uBrightness;
        col += uColor * (band1 + band2) * 0.55 * uBrightness;
        col += vec3(1.0, 0.96, 0.92) * (pow(band1, 5.0) + pow(band2, 5.0)) * 1.1 * uBrightness;
        float edge = smoothstep(1.0, 0.55, vUv.y);
        col *= mix(edge, 1.0, uRadiusFade);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* ------------------------------------------------------------------ */

export function buildPaths(projection, regionEntries) {
  const group = new THREE.Group();
  const updates = [];

  const yAt = (x, z, base) => base + 0.1 * Math.sin(x * 1.3) * Math.cos(z * 1.7);

  // --- Jalur utama: Cincin Api (merah-putih) ---
  {
    const pts = VOLCANIC_ARC.map(([lng, lat]) => {
      const [x, z] = projection.proj(lng, lat);
      return new THREE.Vector3(x, yAt(x, z, 0.42), z);
    });
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.45);
    const tube = new THREE.TubeGeometry(curve, Math.max(48, pts.length * 4), 0.034, 6, false);
    const mat = makePulseMaterial(0xff2d3c, 0.32, 3.0, 1.0, 0.35);
    const mesh = new THREE.Mesh(tube, mat);
    mesh.renderOrder = 5;
    group.add(mesh);
    updates.push({ uniforms: mat.uniforms });

    // inti putih tipis
    const core = new THREE.TubeGeometry(curve, Math.max(48, pts.length * 4), 0.012, 6, false);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreMesh = new THREE.Mesh(core, coreMat);
    coreMesh.renderOrder = 6;
    group.add(coreMesh);
  }

  // --- Tautan data antar simpul pulau ---
  const centerById = new Map(regionEntries.map((e) => [e.def.id, e.centroid]));
  for (let i = 0; i < LINK_ORDER.length - 1; i++) {
    const a = centerById.get(LINK_ORDER[i]);
    const b = centerById.get(LINK_ORDER[i + 1]);
    if (!a || !b) continue;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 1.4;
    const curve = new THREE.CatmullRomCurve3([a.clone(), mid, b.clone()], false, "catmullrom", 0.4);
    const tube = new THREE.TubeGeometry(curve, 24, 0.014, 4, false);
    const mat = makePulseMaterial(0xff3b3b, 0.18, 2.0, 0.5, 0.6);
    const mesh = new THREE.Mesh(tube, mat);
    mesh.renderOrder = 4;
    group.add(mesh);
    updates.push({ uniforms: mat.uniforms });
  }

  // --- Penanda pulau (bola bercahaya + cincin berdenyut) ---
  const markers = [];
  regionEntries.forEach((e, idx) => {
    const pos = e.centroid.clone();
    pos.y = Math.max(pos.y, 0.3) + 0.55;

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sphere.position.copy(pos);
    sphere.renderOrder = 7;
    group.add(sphere);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.16, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff2d3c,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ring.position.copy(pos);
    ring.renderOrder = 7;
    group.add(ring);

    markers.push({ sphere, ring, phase: idx * 1.7 });
  });

  return {
    group,
    update(t, cameraPos) {
      for (const u of updates) u.uniforms.uTime.value = t;
      for (const m of markers) {
        const s = 1 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2.4 + m.phase));
        m.ring.scale.setScalar(s);
        m.ring.material.opacity = 0.85 * (1 - (s - 1) / 0.22);
        m.ring.lookAt(cameraPos);
      }
    },
  };
}
