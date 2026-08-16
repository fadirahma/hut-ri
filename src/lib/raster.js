/**
 * Rasterisasi poligon (scanline, aturan even-odd) ke dalam mask array.
 * Bekerja tanpa DOM canvas sehingga dapat diuji di Node.
 *
 * regionPolys: [{ rings: [[{x,z}, ...], ...] }] — rings[0] = luar, sisanya lubang.
 * wb: { minX, maxX, minZ, maxZ } — batas dunia untuk transformasi.
 */

export function makeCanvasTransform(wb, W, H) {
  return (x, z) => {
    const px = ((x - wb.minX) / (wb.maxX - wb.minX)) * (W - 1);
    const py = ((wb.maxZ - z) / (wb.maxZ - wb.minZ)) * (H - 1);
    return [px, py];
  };
}

export function fillRings(regionPolys, toCanvas, W, H) {
  const mask = new Float32Array(W * H);
  const edges = [];

  for (const r of regionPolys) {
    for (const p of r.polys) {
      for (const ring of p.rings) {
        if (ring.length < 3) continue;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const [x1, y1] = toCanvas(a.x, a.z);
          const [x2, y2] = toCanvas(b.x, b.z);
          edges.push({
            x1, y1, x2, y2,
            minY: Math.min(y1, y2),
            maxY: Math.max(y1, y2),
          });
        }
      }
    }
  }

  const xs = [];
  for (let y = 0; y < H; y++) {
    const yy = y + 0.5;
    xs.length = 0;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (yy < e.minY || yy > e.maxY) continue;
      const t = (yy - e.y1) / (e.y2 - e.y1);
      xs.push(e.x1 + (e.x2 - e.x1) * t);
    }
    xs.sort((a, b) => a - b);
    const rowOff = y * W;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.round(xs[i]));
      const x1 = Math.min(W - 1, Math.round(xs[i + 1]));
      for (let x = x0; x <= x1; x++) mask[rowOff + x] = 1;
    }
  }
  return mask;
}
