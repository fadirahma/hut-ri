import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeNoise } from "../lib/noise.js";
import { edt2d } from "../lib/edt.js";
import { fillRings, makeCanvasTransform } from "../lib/raster.js";
import { REGION_DEFS } from "../lib/geo.js";

export const HEIGHT_SCALE = 2.6;
const JITTER = 0.03; // perincian organik garis pantai
const MASK_W = 2048;

/* ------------------------------------------------------------------ */

function makeTerrainMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x0d1118,
    metalness: 0.85,
    roughness: 0.3,
    envMapIntensity: 1.35,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uHeightMax = { value: HEIGHT_SCALE };
    shader.uniforms.uGlow = { value: 1.0 };

    shader.vertexShader =
      "attribute float aHeight;\n" +
      "attribute float aCoast;\n" +
      "varying float vHeight;\n" +
      "varying float vCoast;\n" +
      "varying vec3 vNormalW;\n" +
      "varying vec3 vViewDirW;\n" +
      shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vHeight = aHeight;
      vCoast = aCoast;
      vec4 vWP = modelMatrix * vec4(transformed, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDirW = cameraPosition - vWP.xyz;`
    );

    shader.fragmentShader =
      "varying float vHeight;\n" +
      "varying float vCoast;\n" +
      "varying vec3 vNormalW;\n" +
      "varying vec3 vViewDirW;\n" +
      "uniform float uTime;\n" +
      "uniform float uHeightMax;\n" +
      "uniform float uGlow;\n" +
      shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <tonemapping_fragment>",
      `/* ---- pancaran sinematik Dirgahayu ---- */
      vec3 gN = normalize(vNormalW);
      vec3 gV = normalize(vViewDirW);
      float gNdV = clamp(dot(gN, gV), 0.0, 1.0);

      // garis kontur topografi
      float bands = fract(vHeight * 10.0);
      float line = smoothstep(0.82, 1.0, bands);
      vec3 topoCol = mix(vec3(0.08, 0.10, 0.15), vec3(0.55, 0.62, 0.72), line);
      topoCol *= 0.25 + 0.75 * vCoast;

      // garis pantai bercahaya
      float coastE = pow(max(0.0, 1.0 - vCoast), 3.0);
      vec3 coastCol = vec3(1.0, 0.95, 0.92) * coastE * 1.2;

      // puncak hangat
      float pk = smoothstep(0.66, 1.0, vHeight);
      vec3 peakCol = mix(vec3(1.0, 0.35, 0.24), vec3(1.0, 0.85, 0.55), pk) * (pk * pk) * 0.6;

      // rim merah sinematik
      float rim = pow(1.0 - gNdV, 3.0);
      vec3 rimCol = vec3(1.0, 0.10, 0.09) * rim * 0.32;

      float breath = 0.85 + 0.15 * sin(uTime * 0.6);
      outgoingLight += (topoCol + coastCol + peakCol + rimCol) * uGlow * breath;
      #include <tonemapping_fragment>`
    );

    mat.userData.uniforms = shader.uniforms;
  };

  return mat;
}

/* ------------------------------------------------------------------ */

/**
 * Membangun mesh kepulauan per region.
 * Returns: { meshes: [{ mesh, def, centroid: Vector3, radius }], heightMax, worldBounds }
 */
export function buildTerrain(features, projection) {
  const noise = makeNoise(17082026);
  const { proj } = projection;

  // ---- Kumpulkan cincin poligon per region (dengan jitter pantai) ----
  const featByName = new Map(features.map((f) => [f.properties.state, f]));
  const regionPolys = REGION_DEFS.map((def) => ({ def, polys: [] }));

  for (const r of regionPolys) {
    for (const pname of r.def.provinces) {
      const f = featByName.get(pname);
      if (!f) {
        console.warn("[terrain] provinsi tidak ditemukan:", pname);
        continue;
      }
      const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const poly of polys) {
        const rings = poly.map((ring) =>
          ring.map(([lng, lat]) => {
            const [x, z] = proj(lng, lat);
            const jx = (noise.fbm(x * 2.3, z * 2.3, 3) - 0.5) * 2 * JITTER;
            const jz = (noise.fbm(x * 2.3 + 37.7, z * 2.3 + 91.3, 3) - 0.5) * 2 * JITTER;
            return { x: x + jx, z: z + jz };
          })
        );
        r.polys.push({ rings, factor: r.def.factor });
      }
    }
  }

  // ---- Batas dunia ----
  const wb = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const r of regionPolys) {
    for (const p of r.polys) {
      for (const ring of p.rings) {
        for (const pt of ring) {
          if (pt.x < wb.minX) wb.minX = pt.x;
          if (pt.x > wb.maxX) wb.maxX = pt.x;
          if (pt.z < wb.minZ) wb.minZ = pt.z;
          if (pt.z > wb.maxZ) wb.maxZ = pt.z;
        }
      }
    }
  }

  // ---- Mask + distance transform (jarak dari pantai) ----
  const MASK_H = Math.max(64, Math.round(MASK_W * ((wb.maxZ - wb.minZ) / Math.max(1e-6, wb.maxX - wb.minX))));
  const toCanvas = makeCanvasTransform(wb, MASK_W, MASK_H);
  const land = fillRings(regionPolys, toCanvas, MASK_W, MASK_H);
  // Jarak dihitung dari PERAIRAN: garis pantai = 0, interior pulau = jauh.
  const water = new Float32Array(MASK_W * MASK_H);
  for (let i = 0; i < land.length; i++) water[i] = land[i] ? 0 : 1;
  const dist = edt2d(water, MASK_W, MASK_H);
  let maxD = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
  const distMax = Math.sqrt(maxD);

  const sampleCoast = (x, z) => {
    const [px, py] = toCanvas(x, z);
    const x0 = Math.max(0, Math.min(MASK_W - 1, Math.floor(px)));
    const y0 = Math.max(0, Math.min(MASK_H - 1, Math.floor(py)));
    const x1 = Math.min(MASK_W - 1, x0 + 1);
    const y1 = Math.min(MASK_H - 1, y0 + 1);
    const fx = px - x0;
    const fy = py - y0;
    const d00 = dist[y0 * MASK_W + x0];
    const d10 = dist[y0 * MASK_W + x1];
    const d01 = dist[y1 * MASK_W + x0];
    const d11 = dist[y1 * MASK_W + x1];
    const d = (d00 * (1 - fx) + d10 * fx) * (1 - fy) + (d01 * (1 - fx) + d11 * fx) * fy;
    return Math.min(1, Math.sqrt(d) / distMax);
  };

  // ---- Bangun geometri per region ----
  const meshes = [];
  for (const r of regionPolys) {
    const pieces = [];

    for (const p of r.polys) {
      const outer = p.rings[0];
      if (outer.length < 3) continue;
      const shape = new THREE.Shape();
      shape.moveTo(outer[0].x, outer[0].z);
      for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i].x, outer[i].z);
      for (let i = 1; i < p.rings.length; i++) {
        const ring = p.rings[i];
        if (ring.length < 3) continue;
        const hole = new THREE.Path();
        hole.moveTo(ring[0].x, ring[0].z);
        for (let j = 1; j < ring.length; j++) hole.lineTo(ring[j].x, ring[j].z);
        shape.holes.push(hole);
      }

      let geom;
      try {
        geom = new THREE.ShapeGeometry(shape, 1);
      } catch (e) {
        console.warn("[terrain] geometri gagal:", r.def.id, e);
        continue;
      }

      const pos = geom.attributes.position;
      const count = pos.count;
      const heights = new Float32Array(count);
      const coasts = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const z = pos.getY(i);
        const coast = sampleCoast(x, z);
        const interior = Math.pow(coast, 0.6);
        const broad = noise.fbm(x * 0.55, z * 0.55, 4);
        const ridge = noise.ridged(x * 2.4, z * 2.4, 4);
        let h = (broad * 0.7 + ridge * 1.15) * interior * p.factor;
        h *= HEIGHT_SCALE;
        pos.setXYZ(i, x, h, z);
        heights[i] = Math.min(1, h / HEIGHT_SCALE);
        coasts[i] = coast;
      }

      geom.setAttribute("aHeight", new THREE.BufferAttribute(heights, 1));
      geom.setAttribute("aCoast", new THREE.BufferAttribute(coasts, 1));
      pieces.push(geom);
    }

    if (pieces.length === 0) continue;
    const merged = mergeGeometries(pieces);
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();

    // centroid & radius
    const posAttr = merged.attributes.position;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const n = posAttr.count;
    for (let i = 0; i < n; i++) {
      cx += posAttr.getX(i);
      cy += posAttr.getY(i);
      cz += posAttr.getZ(i);
    }
    cx /= n;
    cy /= n;
    cz /= n;
    const centroid = new THREE.Vector3(cx, Math.max(0.3, cy), cz);
    const diag = merged.boundingBox.max.clone().sub(merged.boundingBox.min);
    const radius = diag.length() / 2;

    const material = makeTerrainMaterial();
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.regionId = r.def.id;
    mesh.userData.regionDef = r.def;
    meshes.push({ mesh, def: r.def, centroid, radius, polys: r.polys });
  }

  return { meshes, heightMax: HEIGHT_SCALE, worldBounds: wb };
}
