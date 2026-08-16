/**
 * Deterministic value-noise, fBm, dan ridged multifractal.
 * Dipakai untuk medan ketinggian dan perincian garis pantai.
 */
export function makeNoise(seed = 1337) {
  const hash = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    h = Math.imul(h ^ seed, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967295;
  };

  const smooth = (t) => t * t * (3 - 2 * t);

  const noise2 = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    const u = smooth(xf);
    const v = smooth(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  const fbm = (x, y, oct = 4, lac = 2, gain = 0.5) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lac;
    }
    return sum / norm;
  };

  const ridged = (x, y, oct = 4) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(2 * noise2(x * freq, y * freq) - 1);
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };

  return { noise2, fbm, ridged };
}
