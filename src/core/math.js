export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0, edge1, value) {
  const range = Math.max(edge1 - edge0, 0.000001);
  const t = clamp((value - edge0) / range, 0, 1);

  return t * t * (3 - 2 * t);
}

export function randomRange(random, min, max) {
  return min + (max - min) * random();
}

export function seededRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state += 0x6d2b79f5;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}