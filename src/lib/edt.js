/**
 * Exact 2D Euclidean distance transform (Felzenszwalb & Huttenlocher).
 *
 * Input:  mask — typed array W*H, 1 = daratan, 0 = perairan.
 * Output: Float32Array W*H berisi kuadrat jarak Euclidean
 *         ke piksel daratan terdekat.
 */
export function edt2d(mask, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const out = new Float32Array(w * h);
  const tmp = new Float32Array(n);
  const INF = 1e18;

  // 1D EDT kuadratik pada baris f[0..n-1] -> out[off..off+n-1]
  const edt1d = (src, len, off) => {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      const fq = src[q] + q * q;
      let s = (fq - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (fq - (src[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const dq = q - v[k];
      out[off + q] = dq * dq + src[v[k]];
    }
  };

  // Pass baris
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) f[x] = mask[off + x] ? 0 : INF;
    edt1d(f, w, off);
  }
  // Pass kolom
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) tmp[y] = out[y * w + x];
    edt1d(tmp, h, x);
    for (let y = 0; y < h; y++) out[y * w + x] = tmp[y];
  }
  return out;
}
