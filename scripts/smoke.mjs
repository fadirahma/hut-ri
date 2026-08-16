import fs from "node:fs";
import { createProjection } from "../src/lib/geo.js";
import { buildTerrain } from "../src/scene/terrain.js";

const geojson = JSON.parse(fs.readFileSync("src/data/indonesia.json", "utf8"));
const projection = createProjection(geojson.features);

const t0 = performance.now();
const { meshes, heightMax, worldBounds } = buildTerrain(geojson.features, projection);
const dt = (performance.now() - t0).toFixed(0);

console.log(`\nTerrain dibangun dalam ${dt} ms (heightMax=${heightMax})`);
console.log(
  `World bounds: x [${worldBounds.minX.toFixed(2)}, ${worldBounds.maxX.toFixed(2)}], z [${worldBounds.minZ.toFixed(2)}, ${worldBounds.maxZ.toFixed(2)}]\n`
);

let totalTris = 0;
let totalVerts = 0;
for (const m of meshes) {
  const g = m.mesh.geometry;
  const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
  totalTris += tris;
  totalVerts += g.attributes.position.count;
  const y = g.attributes.position;
  let maxH = 0;
  for (let i = 0; i < y.count; i++) maxH = Math.max(maxH, y.getY(i));
  console.log(
    `- ${m.def.id.padEnd(10)} tris: ${tris.toFixed(0).padStart(7)}  verts: ${y.count
      .toString()
      .padStart(7)}  maxH: ${maxH.toFixed(2).padStart(6)}  center: (${m.centroid.x.toFixed(
      2
    )}, ${m.centroid.z.toFixed(2)})  radius: ${m.radius.toFixed(2)}`
  );
}
console.log(`\nTotal tris: ${totalTris.toFixed(0)}, total verts: ${totalVerts}`);
