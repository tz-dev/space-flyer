export const STAR_MAP_SECTOR_GRID_SIZE = 10;

const SECTOR_X_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const SECTOR_Z_LABELS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function createStarMapSectorBounds(systems, gridSize = STAR_MAP_SECTOR_GRID_SIZE) {
  const positions = (Array.isArray(systems) ? systems : [])
    .map((system) => system?.position)
    .filter((position) => Array.isArray(position) && position.length >= 3);

  if (positions.length === 0) {
    return {
      min: [-100, -100, -100],
      max: [100, 100, 100],
      gridSize
    };
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const position of positions) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = Number(position[axis] ?? 0);
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }

  const center = [
    (min[0] + max[0]) * 0.5,
    (min[1] + max[1]) * 0.5,
    (min[2] + max[2]) * 0.5
  ];

  const span = Math.max(
    1,
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2]
  );
  const halfExtent = span * 0.56;

  return {
    min: [center[0] - halfExtent, center[1] - halfExtent, center[2] - halfExtent],
    max: [center[0] + halfExtent, center[1] + halfExtent, center[2] + halfExtent],
    gridSize
  };
}

export function getStarMapSectorForPosition(position, bounds) {
  if (!Array.isArray(position) || !bounds) {
    return null;
  }

  const gridSize = bounds.gridSize ?? STAR_MAP_SECTOR_GRID_SIZE;

  return {
    x: getSectorIndex(position[0], bounds.min[0], bounds.max[0], gridSize),
    y: getSectorIndex(position[1], bounds.min[1], bounds.max[1], gridSize),
    z: getSectorIndex(position[2], bounds.min[2], bounds.max[2], gridSize)
  };
}

export function formatStarMapSectorId(sector) {
  if (!sector) {
    return "Sector unknown";
  }

  const x = SECTOR_X_LABELS[sector.x] ?? String(sector.x + 1).padStart(2, "0");
  const y = String((sector.y ?? 0) + 1).padStart(2, "0");
  const z = SECTOR_Z_LABELS[sector.z] ?? String(sector.z + 1).padStart(2, "0");

  return `Sector ${x}-${y}-${z}`;
}

export function getStarMapSectorKey(sector) {
  if (!sector) {
    return "";
  }

  return `${sector.x}:${sector.y}:${sector.z}`;
}

export function areStarMapSectorsEqual(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y && a.z === b.z);
}

export function createStarMapGridLinePositions(bounds) {
  const positions = [];
  const gridSize = bounds.gridSize ?? STAR_MAP_SECTOR_GRID_SIZE;
  const xs = createAxisValues(bounds.min[0], bounds.max[0], gridSize);
  const ys = createAxisValues(bounds.min[1], bounds.max[1], gridSize);
  const zs = createAxisValues(bounds.min[2], bounds.max[2], gridSize);

  for (const y of ys) {
    for (const z of zs) {
      pushLine(positions, [bounds.min[0], y, z], [bounds.max[0], y, z]);
    }
  }

  for (const x of xs) {
    for (const z of zs) {
      pushLine(positions, [x, bounds.min[1], z], [x, bounds.max[1], z]);
    }
  }

  for (const x of xs) {
    for (const y of ys) {
      pushLine(positions, [x, y, bounds.min[2]], [x, y, bounds.max[2]]);
    }
  }

  return positions;
}

export function createStarMapSectorLinePositions(bounds, sector) {
  if (!sector) {
    return [];
  }

  const gridSize = bounds.gridSize ?? STAR_MAP_SECTOR_GRID_SIZE;
  const x0 = lerp(bounds.min[0], bounds.max[0], sector.x / gridSize);
  const x1 = lerp(bounds.min[0], bounds.max[0], (sector.x + 1) / gridSize);
  const y0 = lerp(bounds.min[1], bounds.max[1], sector.y / gridSize);
  const y1 = lerp(bounds.min[1], bounds.max[1], (sector.y + 1) / gridSize);
  const z0 = lerp(bounds.min[2], bounds.max[2], sector.z / gridSize);
  const z1 = lerp(bounds.min[2], bounds.max[2], (sector.z + 1) / gridSize);

  const positions = [];

  pushLine(positions, [x0, y0, z0], [x1, y0, z0]);
  pushLine(positions, [x0, y1, z0], [x1, y1, z0]);
  pushLine(positions, [x0, y0, z1], [x1, y0, z1]);
  pushLine(positions, [x0, y1, z1], [x1, y1, z1]);

  pushLine(positions, [x0, y0, z0], [x0, y1, z0]);
  pushLine(positions, [x1, y0, z0], [x1, y1, z0]);
  pushLine(positions, [x0, y0, z1], [x0, y1, z1]);
  pushLine(positions, [x1, y0, z1], [x1, y1, z1]);

  pushLine(positions, [x0, y0, z0], [x0, y0, z1]);
  pushLine(positions, [x1, y0, z0], [x1, y0, z1]);
  pushLine(positions, [x0, y1, z0], [x0, y1, z1]);
  pushLine(positions, [x1, y1, z0], [x1, y1, z1]);

  return positions;
}

function getSectorIndex(value, min, max, gridSize) {
  const span = Math.max(0.000001, max - min);
  const normalized = (Number(value ?? 0) - min) / span;
  return Math.max(0, Math.min(gridSize - 1, Math.floor(normalized * gridSize)));
}

function createAxisValues(min, max, gridSize) {
  const values = [];

  for (let index = 0; index <= gridSize; index += 1) {
    values.push(lerp(min, max, index / gridSize));
  }

  return values;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pushLine(target, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);

  // WebGL ignores LineBasicMaterial.linewidth on most platforms.
  // Fake thicker lines by drawing tiny parallel duplicates.
  const offset = Math.max(0.04, Math.min(0.75, length * 0.002));

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const absZ = Math.abs(dz);

  const offsets = [[0, 0, 0]];

  if (absX >= absY && absX >= absZ) {
    offsets.push(
      [0, offset, 0],
      [0, -offset, 0],
      [0, 0, offset],
      [0, 0, -offset]
    );
  } else if (absY >= absX && absY >= absZ) {
    offsets.push(
      [offset, 0, 0],
      [-offset, 0, 0],
      [0, 0, offset],
      [0, 0, -offset]
    );
  } else {
    offsets.push(
      [offset, 0, 0],
      [-offset, 0, 0],
      [0, offset, 0],
      [0, -offset, 0]
    );
  }

  for (const [ox, oy, oz] of offsets) {
    target.push(
      a[0] + ox,
      a[1] + oy,
      a[2] + oz,
      b[0] + ox,
      b[1] + oy,
      b[2] + oz
    );
  }
}
