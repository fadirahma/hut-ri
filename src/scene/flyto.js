import * as THREE from "three";

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Kamera meluncur halus ke posisi fokus sebuah pulau.
 */
export function createFlyTo(camera, controls) {
  let rafId = null;
  let active = false;

  function cancel() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    active = false;
  }

  function flyTo(center, distance, duration = 1600) {
    cancel();
    active = true;
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();

    const dir = startPos.clone().sub(startTarget).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0.3, 0.4, 1).normalize();
    const goalTarget = center.clone();
    let goalPos = center.clone().add(dir.multiplyScalar(distance));
    goalPos.y = Math.max(goalPos.y, center.y + distance * 0.34);

    const t0 = performance.now();
    const done = () => {
      active = false;
      rafId = null;
      controls.enabled = true;
      if (onDone) onDone();
    };
    let onDone = null;

    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(startPos, goalPos, e);
      controls.target.lerpVectors(startTarget, goalTarget, e);
      controls.update();
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        done();
      }
    };
    controls.enabled = false;
    rafId = requestAnimationFrame(step);

    return {
      promise: new Promise((res) => {
        onDone = res;
      }),
      cancel,
    };
  }

  return { flyTo, cancel, isActive: () => active };
}
