import { normalizeGalaxyConfig } from "./configSchema.js";
import {
  SPACE_FLYER_GENERATOR_VERSION,
  createGeneratedSystemFromSignal,
  createGeneratedStellarSignalFromSignal
} from "../data/createDemoGalaxy.js";

export const SAVE_GAME_TYPE = "space-flyer-save";
export const SAVE_GAME_VERSION = 1;
export const LOCAL_STORAGE_SAVE_KEY = "space-flyer.save.v1";

const SNAPSHOT_REASON_KEYS = [
  "visited",
  "bookmarked",
  "terrainBookmark",
  "dirty",
  "current",
  "discovered"
];

export function createSaveGame({ galaxyConfig, storeState }) {
  const progress = createProgressSnapshot(storeState);
  const galaxy = normalizeGalaxyConfig(galaxyConfig ?? {});
  const snapshotIds = collectSnapshotIds(galaxy, progress);
  const snapshots = {
    systems: {},
    stellarObjects: {}
  };

  const signals = galaxy.systems.map((system) => {
    const hasSnapshot = snapshotIds.has(system.id);

    if (hasSnapshot) {
      if (isStellarObjectSignal(system)) {
        snapshots.stellarObjects[system.id] = clonePlainObject(system);
      } else {
        snapshots.systems[system.id] = clonePlainObject(system);
      }
    }

    return createSignalRecord(system, hasSnapshot);
  });

  return {
    type: SAVE_GAME_TYPE,
    saveVersion: SAVE_GAME_VERSION,
    generatorVersion: SPACE_FLYER_GENERATOR_VERSION,
    savedAt: new Date().toISOString(),
    galaxy: createGalaxyShell(galaxy),
    galaxyMap: {
      signals
    },
    snapshots,
    progress
  };
}

export function stringifySaveGame(saveGame) {
  return JSON.stringify(saveGame, null, 2);
}

export function parseSaveGameText(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Save text is empty.");
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Could not parse save JSON.");
  }

  return normalizeSaveGame(parsed);
}

export function normalizeSaveGame(input = {}) {
  if (input.type !== SAVE_GAME_TYPE) {
    throw new Error("Unsupported save file type.");
  }

  const saveVersion = Number(input.saveVersion ?? 0);

  if (saveVersion !== SAVE_GAME_VERSION) {
    throw new Error(`Unsupported save version: ${saveVersion || "unknown"}.`);
  }

  const signals = Array.isArray(input.galaxyMap?.signals)
    ? input.galaxyMap.signals.map(normalizeSignalRecord).filter(Boolean)
    : [];

  if (signals.length === 0) {
    throw new Error("Save file contains no galaxy map signals.");
  }

  return {
    type: SAVE_GAME_TYPE,
    saveVersion: SAVE_GAME_VERSION,
    generatorVersion: Number(input.generatorVersion ?? SPACE_FLYER_GENERATOR_VERSION) || SPACE_FLYER_GENERATOR_VERSION,
    savedAt: typeof input.savedAt === "string" ? input.savedAt : new Date().toISOString(),
    galaxy: input.galaxy && typeof input.galaxy === "object" ? clonePlainObject(input.galaxy) : {},
    galaxyMap: {
      signals
    },
    snapshots: normalizeSnapshots(input.snapshots ?? {}),
    progress: normalizeProgress(input.progress ?? {})
  };
}

export function buildGalaxyConfigFromSave(saveGame) {
  const save = normalizeSaveGame(saveGame);
  const galaxyShell = save.galaxy ?? {};
  const systems = save.galaxyMap.signals.map((signal) => {
    const snapshot = getSnapshotForSignal(signal, save.snapshots);

    if (snapshot) {
      return applySignalMapFields(clonePlainObject(snapshot), signal);
    }

    if (signal.kind === "stellar-object") {
      return createGeneratedStellarSignalFromSignal(signal);
    }

    return createGeneratedSystemFromSignal(signal);
  });

  return normalizeGalaxyConfig({
    ...galaxyShell,
    systems
  });
}

export function replaceGalaxyConfigContents(target, nextConfig) {
  const next = normalizeGalaxyConfig(nextConfig ?? {});

  for (const key of Object.keys(target)) {
    delete target[key];
  }

  Object.assign(target, next);
  return target;
}

function createProgressSnapshot(state = {}) {
  const starLog = state.starLog ?? {};
  const current = {
    activeView: state.activeView ?? "star-map",
    selectedSystemId: state.starMap?.selectedSystemId ?? null,
    activeSystemId: state.systemView?.activeSystemId ?? state.terrainView?.activeSystemId ?? null,
    selectedBodyId: state.systemView?.selectedBodyId ?? null,
    activePlanetId: state.terrainView?.activePlanetId ?? null,
    activeStellarObjectId: state.stellarObjectView?.activeObjectId ?? null,
    activeStellarSignalId: state.stellarObjectView?.activeSignalId ?? null
  };

  return {
    visitedSignalIds: uniqueStrings(starLog.visitedSignalIds ?? starLog.visitedSystemIds ?? []),
    bookmarkedSignalIds: uniqueStrings(starLog.bookmarkedSignalIds ?? starLog.bookmarkedSystemIds ?? []),
    terrainBookmarks: clonePlainObject(Array.isArray(starLog.terrainBookmarks) ? starLog.terrainBookmarks : []),
    activeTab: starLog.activeTab === "bookmarks" ? "bookmarks" : "star-log",
    showVisitedConnections: Boolean(starLog.showVisitedConnections ?? true),
    bookmarkMode: {
      dwellSeconds: clampNumber(state.bookmarkMode?.dwellSeconds, 5, 120, 18)
    },
    dirtySignalIds: uniqueStrings(state.dirtySignalIds ?? []),
    current
  };
}

function normalizeProgress(progress = {}) {
  return {
    visitedSignalIds: uniqueStrings(progress.visitedSignalIds ?? progress.visitedSystemIds ?? []),
    bookmarkedSignalIds: uniqueStrings(progress.bookmarkedSignalIds ?? progress.bookmarkedSystemIds ?? []),
    terrainBookmarks: clonePlainObject(Array.isArray(progress.terrainBookmarks) ? progress.terrainBookmarks : []),
    activeTab: progress.activeTab === "bookmarks" ? "bookmarks" : "star-log",
    showVisitedConnections: Boolean(progress.showVisitedConnections ?? true),
    bookmarkMode: {
      dwellSeconds: clampNumber(progress.bookmarkMode?.dwellSeconds, 5, 120, 18)
    },
    dirtySignalIds: uniqueStrings(progress.dirtySignalIds ?? []),
    current: progress.current && typeof progress.current === "object"
      ? clonePlainObject(progress.current)
      : {}
  };
}

function collectSnapshotIds(galaxy, progress) {
  const ids = new Set();
  const reasonById = new Map();
  const add = (id, reason) => {
    if (!id) return;
    ids.add(id);
    const reasons = reasonById.get(id) ?? new Set();
    reasons.add(reason);
    reasonById.set(id, reasons);
  };

  for (const system of galaxy.systems ?? []) {
    if (system.discovered) {
      add(system.id, "discovered");
    }
  }

  for (const id of progress.visitedSignalIds ?? []) add(id, "visited");
  for (const id of progress.bookmarkedSignalIds ?? []) add(id, "bookmarked");
  for (const id of progress.dirtySignalIds ?? []) add(id, "dirty");

  for (const bookmark of progress.terrainBookmarks ?? []) {
    add(bookmark.systemId, "terrainBookmark");
  }

  const current = progress.current ?? {};
  add(current.selectedSystemId, "current");
  add(current.activeSystemId, "current");
  add(current.activeStellarSignalId, "current");

  return ids;
}

function createSignalRecord(system, hasSnapshot) {
  const signal = {
    id: system.id,
    kind: isStellarObjectSignal(system) ? "stellar-object" : "system",
    seed: system.seed ?? 1,
    generatorVersion: SPACE_FLYER_GENERATOR_VERSION,
    position: clonePlainObject(system.position ?? [0, 0, 0]),
    name: system.name ?? system.id,
    color: clonePlainObject(system.color ?? [1, 0.72, 0.36]),
    size: system.size ?? 1,
    discovered: Boolean(system.discovered),
    summary: clonePlainObject(system.summary ?? {}),
    snapshotId: hasSnapshot ? system.id : null
  };

  if (isStellarObjectSignal(system)) {
    signal.objectId = system.stellarObject?.objectId ?? null;
  }

  return signal;
}

function normalizeSignalRecord(signal = {}) {
  if (!signal || typeof signal !== "object" || !signal.id) {
    return null;
  }

  const kind = signal.kind === "stellar-object" ? "stellar-object" : "system";

  return {
    id: String(signal.id),
    kind,
    seed: Number.isFinite(Number(signal.seed)) ? Number(signal.seed) : 1,
    generatorVersion: Number(signal.generatorVersion ?? SPACE_FLYER_GENERATOR_VERSION) || SPACE_FLYER_GENERATOR_VERSION,
    position: normalizeVector3(signal.position, [0, 0, 0]),
    name: typeof signal.name === "string" && signal.name.trim() ? signal.name : String(signal.id),
    color: normalizeColor(signal.color, kind === "stellar-object" ? [0.65, 0.8, 1.0] : [1, 0.72, 0.36]),
    size: Number.isFinite(Number(signal.size)) ? Number(signal.size) : 1,
    discovered: Boolean(signal.discovered),
    summary: signal.summary && typeof signal.summary === "object" ? clonePlainObject(signal.summary) : {},
    objectId: typeof signal.objectId === "string" ? signal.objectId : null,
    snapshotId: signal.snapshotId ? String(signal.snapshotId) : null
  };
}

function normalizeSnapshots(input = {}) {
  const systems = {};
  const stellarObjects = {};

  for (const [id, system] of Object.entries(input.systems ?? {})) {
    systems[id] = clonePlainObject(system);
  }

  for (const [id, system] of Object.entries(input.stellarObjects ?? {})) {
    stellarObjects[id] = clonePlainObject(system);
  }

  return {
    systems,
    stellarObjects
  };
}

function getSnapshotForSignal(signal, snapshots) {
  if (!signal.snapshotId) {
    return null;
  }

  if (signal.kind === "stellar-object") {
    return snapshots.stellarObjects?.[signal.snapshotId] ?? snapshots.systems?.[signal.snapshotId] ?? null;
  }

  return snapshots.systems?.[signal.snapshotId] ?? null;
}

function applySignalMapFields(system, signal) {
  return {
    ...system,
    id: signal.id,
    kind: signal.kind,
    seed: signal.seed,
    position: clonePlainObject(signal.position),
    name: system.name ?? signal.name,
    color: clonePlainObject(signal.color),
    size: signal.size,
    discovered: signal.discovered || Boolean(system.discovered)
  };
}

function createGalaxyShell(galaxy) {
  return {
    version: galaxy.version ?? 1,
    type: galaxy.type ?? "planet-flyer-galaxy",
    id: galaxy.id ?? "demo-galaxy",
    name: galaxy.name ?? "Demo Galaxy",
    space: clonePlainObject(galaxy.space ?? {}),
    render: clonePlainObject(galaxy.render ?? {}),
    display: clonePlainObject(galaxy.display ?? {}),
    terrainView: clonePlainObject(galaxy.terrainView ?? {}),
    stellarObjectView: clonePlainObject(galaxy.stellarObjectView ?? {})
  };
}

function isStellarObjectSignal(system) {
  return system?.kind === "stellar-object" || Boolean(system?.stellarObject?.objectId);
}

function uniqueStrings(values) {
  const result = [];
  const used = new Set();

  for (const value of values ?? []) {
    if (typeof value !== "string" || !value || used.has(value)) {
      continue;
    }

    used.add(value);
    result.push(value);
  }

  return result;
}

function normalizeVector3(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) {
    return [...fallback];
  }

  return [0, 1, 2].map((index) => {
    const number = Number(value[index]);
    return Number.isFinite(number) ? number : fallback[index];
  });
}

function normalizeColor(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) {
    return [...fallback];
  }

  return [0, 1, 2].map((index) => {
    const number = Number(value[index]);
    return Number.isFinite(number) ? Math.min(1.5, Math.max(0, number)) : fallback[index];
  });
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numeric));
}

function clonePlainObject(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
