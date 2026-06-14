import * as THREE from "three";

export function createMoonGeometry(radius, seed) {
  const moonSeed = normalizeMoonSeed(seed);
  const geometry = new THREE.IcosahedronGeometry(radius, 3);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  const stretch = new THREE.Vector3(
    seededRange(moonSeed, 301, 0.86, 1.18),
    seededRange(moonSeed, 302, 0.78, 1.12),
    seededRange(moonSeed, 303, 0.84, 1.20)
  );

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const normal = vertex.clone().normalize();
    const p = normal.clone();

    const broad = moonFbm3(p.clone().multiplyScalar(2.15), moonSeed + 11);
    const cells = moonVoronoiRidge(p.clone().multiplyScalar(3.6), moonSeed + 47);
    const chips = moonVoronoiRidge(p.clone().multiplyScalar(8.5), moonSeed + 83);
    const dents = moonFbm3(p.clone().multiplyScalar(12.0), moonSeed + 131);

    const deformation =
      0.92 +
      broad * 0.18 +
      cells * 0.135 -
      chips * 0.075 +
      (dents - 0.5) * 0.055;

    vertex
      .copy(normal)
      .multiply(stretch)
      .normalize()
      .multiplyScalar(radius * Math.max(0.68, deformation));

    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return geometry;
}

function moonVoronoiRidge(p, seed) {
  const ix = Math.floor(p.x);
  const iy = Math.floor(p.y);
  const iz = Math.floor(p.z);
  let nearest = 999;
  let second = 999;

  for (let z = -1; z <= 1; z += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        const cx = ix + x;
        const cy = iy + y;
        const cz = iz + z;
        const hash = hashInt3(seed, cx, cy, cz);
        const fx = cx + seededRandom(hash, 1) * 0.72;
        const fy = cy + seededRandom(hash, 2) * 0.72;
        const fz = cz + seededRandom(hash, 3) * 0.72;
        const dx = fx - p.x;
        const dy = fy - p.y;
        const dz = fz - p.z;
        const d = dx * dx + dy * dy + dz * dz;

        if (d < nearest) {
          second = nearest;
          nearest = d;
        } else if (d < second) {
          second = d;
        }
      }
    }
  }

  return Math.max(0, Math.min(1, Math.sqrt(second) - Math.sqrt(nearest)));
}

function moonFbm3(p, seed) {
  let value = 0;
  let amp = 0.5;
  let norm = 0;

  for (let octave = 0; octave < 4; octave += 1) {
    value += moonValueNoise3(p, seed + octave * 101) * amp;
    norm += amp;
    p.multiplyScalar(2.03).add(new THREE.Vector3(17.1, -9.4, 23.7));
    amp *= 0.5;
  }

  return value / Math.max(norm, 0.0001);
}

function moonValueNoise3(p, seed) {
  const ix = Math.floor(p.x);
  const iy = Math.floor(p.y);
  const iz = Math.floor(p.z);
  const fx = p.x - ix;
  const fy = p.y - iy;
  const fz = p.z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const h = (x, y, z) => seededRandom(hashInt3(seed, x, y, z), 0);
  const x00 = lerp(h(ix, iy, iz), h(ix + 1, iy, iz), ux);
  const x10 = lerp(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), ux);
  const x01 = lerp(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), ux);
  const x11 = lerp(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), ux);
  const y0 = lerp(x00, x10, uy);
  const y1 = lerp(x01, x11, uy);

  return lerp(y0, y1, uz);
}

function normalizeMoonSeed(seed) {
  if (Number.isFinite(seed)) {
    return seed;
  }

  if (typeof seed === "number") {
    return Number.isFinite(seed) ? seed : 1;
  }

  if (typeof seed === "string" && seed.length > 0) {
    return hashString(seed);
  }

  return 1;
}

function seededRange(seed, salt, min, max) {
  return min + (max - min) * seededRandom(seed, salt);
}

function seededRandom(seed, salt = 0) {
  let value = (Number(seed) || 0) + salt * 374761393;
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function hashInt3(seed, x, y, z) {
  let hash = (Number(seed) || 0) >>> 0;
  hash ^= 0x9e3779b9;
  hash = Math.imul(hash ^ (x | 0), 0x85ebca6b);
  hash = Math.imul(hash ^ (y | 0), 0xc2b2ae35);
  hash = Math.imul(hash ^ (z | 0), 0x27d4eb2f);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return hash >>> 0;
}

function hashString(source) {
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}