const SYSTEM_VIEW_DEFAULT = {
  yaw: 0,
  pitch: Math.PI * 0.5,
  zoom: 0.24
};

export function createStore() {
  const state = {
    activeView: "star-map",

    transition: {
      type: "idle",
      targetSystemId: null,
      startedAt: 0,
      duration: 0,
      revealed: false
    },

    starMap: {
      yaw: 0,
      pitch: 0,
      zoom: 1,
      hoveredSystemId: null,
      selectedSystemId: "system-001",
      selectionSource: "manual",
      infoVisible: true,
      markerScreenX: 0,
      markerScreenY: 0,
      markerScreenVisible: false,
      pointerDown: false
    },

    systemView: {
      activeSystemId: "system-001",
      enteredAt: 0,
      yaw: SYSTEM_VIEW_DEFAULT.yaw,
      pitch: SYSTEM_VIEW_DEFAULT.pitch,
      zoom: SYSTEM_VIEW_DEFAULT.zoom,
      mode: "system",
      hoveredBodyId: null,
      selectedBodyId: null,
      orbitTargetId: null,
      orbitEnteredAt: 0,
      orbitYaw: 0,
      orbitPitch: 0,
      orbitDistance: 1,
      orbitReturnRequestId: 0,
      systemSpeed: 1,
      gravityGridEnabled: true,
      gravityGridScale: 3,
      gravityGridOpacity: 0.26,
      gravityGridWeight: 0.095,
      orbitLinesEnabled: true,
      moonLinesEnabled: true,
      orbitLineVisibility: 1.0,
      planetGridEnabled: false,
      inclinationMarkersEnabled: false,
      equatorMarkersEnabled: false,
      pointerDown: false
    },

    terrainView: {
      activeSystemId: "system-001",
      activePlanetId: null,
      enteredAt: 0,
      landingContext: null,
      restorePose: null,
      restoreBookmarkId: null
    },

    stellarObjectView: {
      activeObjectId: null,
      activeSignalId: null,
      enteredAt: 0,
      returnView: "system-view"
    },

    systemEditor: {
      selectedPlanetIdBySystemId: {}
    },

    starLog: {
      visitedSystemIds: [],
      bookmarkedSystemIds: [],
      terrainBookmarks: [],
      activeTab: "star-log",
      showVisitedConnections: true
    },

    bookmarkMode: {
      active: false,
      mode: "ambient",
      currentIndex: 0,
      dwellSeconds: 18,
      startedAt: 0,
      stepStartedAt: 0,
      paused: false,
      phase: "idle",
      phaseStartedAt: 0
    },

    dirtySignalIds: [],

    configRevision: 0
  };

  const listeners = new Set();

  function getState() {
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function setStarMapState(partialState) {
    Object.assign(state.starMap, partialState);
    notify();
  }

  function setSystemViewState(partialState) {
    Object.assign(state.systemView, partialState);
    notify();
  }

  function selectSystemBody(bodyId) {
    Object.assign(state.systemView, {
      selectedBodyId: bodyId,
      hoveredBodyId: bodyId
    });

    notify();
  }

  function deselectSystemBody() {
    Object.assign(state.systemView, {
      selectedBodyId: null,
      hoveredBodyId: null
    });

    if (state.systemView.mode !== "orbit") {
      state.systemView.orbitTargetId = null;
    }

    notify();
  }

  function enterOrbitView(bodyId) {
    if (!bodyId) {
      return;
    }

    Object.assign(state.systemView, {
      mode: "orbit",
      selectedBodyId: bodyId,
      orbitTargetId: bodyId,
      orbitEnteredAt: performance.now() * 0.001,
      pointerDown: false
    });

    notify();
  }

  function requestOrbitReturn() {
    state.systemView.orbitReturnRequestId += 1;
    state.systemView.pointerDown = false;
    notify();
  }

  function exitOrbitView() {
    Object.assign(state.systemView, {
      mode: "system",
      selectedBodyId: null,
      hoveredBodyId: null,
      orbitTargetId: null,
      orbitEnteredAt: 0,
      orbitYaw: 0,
      orbitPitch: 0,
      orbitDistance: 1,
      yaw: SYSTEM_VIEW_DEFAULT.yaw,
      pitch: SYSTEM_VIEW_DEFAULT.pitch,
      zoom: SYSTEM_VIEW_DEFAULT.zoom,
      pointerDown: false
    });

    notify();
  }

  function notifyConfigChanged() {
    markActiveSignalDirty({ notifyListeners: false });
    state.configRevision += 1;
    notify();
  }

  function getSystemEditorSelectedPlanetId(systemId) {
    return state.systemEditor.selectedPlanetIdBySystemId[systemId] ?? null;
  }

  function setSystemEditorSelectedPlanetId(systemId, planetId) {
    if (!systemId) {
      return;
    }

    if (planetId) {
      state.systemEditor.selectedPlanetIdBySystemId[systemId] = planetId;
    } else {
      delete state.systemEditor.selectedPlanetIdBySystemId[systemId];
    }

    notify();
  }

  function beginSystemTravel(systemId, options = {}) {
    const now = performance.now() * 0.001;
    const useWarp = options.useWarp ?? true;

    state.activeView = "star-map";

    Object.assign(state.starMap, {
      selectedSystemId: systemId,
      hoveredSystemId: systemId,
      selectionSource: "manual",
      infoVisible: true,
      pointerDown: false
    });

    Object.assign(state.systemView, {
      activeSystemId: systemId,
      enteredAt: 0,
      yaw: SYSTEM_VIEW_DEFAULT.yaw,
      pitch: SYSTEM_VIEW_DEFAULT.pitch,
      zoom: SYSTEM_VIEW_DEFAULT.zoom,
      mode: "system",
      hoveredBodyId: null,
      selectedBodyId: null,
      orbitTargetId: null,
      orbitEnteredAt: 0,
      orbitYaw: 0,
      orbitPitch: 0,
      orbitDistance: 1,
      systemSpeed: 1,
      gravityGridEnabled: true,
      gravityGridScale: 3,
      gravityGridOpacity: 0.26,
      gravityGridWeight: 0.095,
      orbitLinesEnabled: true,
      moonLinesEnabled: true,
      orbitLineVisibility: 1.0,
      planetGridEnabled: false,
      inclinationMarkersEnabled: false,
      equatorMarkersEnabled: false,
      pointerDown: false
    });

    Object.assign(state.transition, {
      type: useWarp ? "star-map-to-system" : "star-map-return-to-system",
      targetSystemId: systemId,
      startedAt: now,
      duration: useWarp ? 2.8 : 1.55,
      revealed: false
    });

    notify();
  }

  function revealSystemTravel() {
    if (
      state.transition.type !== "star-map-to-system" &&
      state.transition.type !== "star-map-return-to-system"
    ) {
      return;
    }

    if (state.transition.revealed) {
      return;
    }

    const targetSystemId = state.transition.targetSystemId;

    state.activeView = "system-view";

    Object.assign(state.systemView, {
      activeSystemId: targetSystemId,
      enteredAt: performance.now() * 0.001,
      yaw: SYSTEM_VIEW_DEFAULT.yaw,
      pitch: SYSTEM_VIEW_DEFAULT.pitch,
      zoom: SYSTEM_VIEW_DEFAULT.zoom,
      mode: "system",
      hoveredBodyId: null,
      selectedBodyId: null,
      orbitTargetId: null,
      orbitEnteredAt: 0,
      orbitYaw: 0,
      orbitPitch: 0,
      orbitDistance: 1,
      systemSpeed: 1,
      gravityGridEnabled: true,
      gravityGridScale: 3,
      gravityGridOpacity: 0.26,
      gravityGridWeight: 0.095,
      orbitLinesEnabled: true,
      moonLinesEnabled: true,
      orbitLineVisibility: 1.0,
      planetGridEnabled: false,
      inclinationMarkersEnabled: false,
      equatorMarkersEnabled: false,
      pointerDown: false
    });

    state.transition.revealed = true;
    addVisitedSystem(targetSystemId);

    notify();
  }

  function beginTerrainLanding(landingContextOrPlanetId) {
    const landingContext = typeof landingContextOrPlanetId === "string"
      ? {
          systemId: state.systemView.activeSystemId,
          planetId: landingContextOrPlanetId,
          sectorId: null,
          skyObjects: []
        }
      : landingContextOrPlanetId;

    const planetId = landingContext?.planetId;

    if (!planetId) {
      return;
    }

    const now = performance.now() * 0.001;
    const systemId = landingContext.systemId ?? state.systemView.activeSystemId;

    Object.assign(state.systemView, {
      mode: "orbit",
      selectedBodyId: planetId,
      hoveredBodyId: planetId,
      orbitTargetId: planetId,
      orbitEnteredAt: now,
      pointerDown: false
    });

    Object.assign(state.terrainView, {
      activeSystemId: systemId,
      activePlanetId: planetId,
      enteredAt: 0,
      landingContext,
      restorePose: null,
      restoreBookmarkId: null
    });

    Object.assign(state.transition, {
      type: "system-to-terrain",
      targetSystemId: systemId,
      startedAt: now,
      duration: 1.75,
      revealed: false
    });

    notify();
  }

  function revealTerrainLanding() {
    if (state.transition.type !== "system-to-terrain") {
      return;
    }

    if (state.transition.revealed) {
      return;
    }

    state.activeView = "terrain-view";
    state.transition.revealed = true;

    Object.assign(state.terrainView, {
      activeSystemId: state.terrainView.landingContext?.systemId ?? state.systemView.activeSystemId,
      activePlanetId: state.terrainView.landingContext?.planetId ?? state.systemView.selectedBodyId,
      enteredAt: performance.now() * 0.001
    });

    notify();
  }

  function returnToSystemView() {
    Object.assign(state.transition, {
      type: "terrain-to-system",
      targetSystemId: state.terrainView.activeSystemId,
      startedAt: performance.now() * 0.001,
      duration: 1.15,
      revealed: false
    });

    notify();
  }

  function revealSystemReturn() {
    if (state.transition.type !== "terrain-to-system") {
      return;
    }

    if (state.transition.revealed) {
      return;
    }

    state.activeView = "system-view";
    state.transition.revealed = true;

    Object.assign(state.systemView, {
      activeSystemId: state.terrainView.activeSystemId,
      mode: "orbit",
      selectedBodyId: state.terrainView.activePlanetId,
      hoveredBodyId: state.terrainView.activePlanetId,
      orbitTargetId: state.terrainView.activePlanetId,
      orbitEnteredAt: performance.now() * 0.001,
      pointerDown: false
    });

    notify();
  }

  function beginStarMapReturn() {
    const now = performance.now() * 0.001;

    Object.assign(state.systemView, {
      mode: "system",
      orbitTargetId: null,
      orbitEnteredAt: 0,
      pointerDown: false
    });

    Object.assign(state.transition, {
      type: "system-to-star-map",
      targetSystemId: state.systemView.activeSystemId,
      startedAt: now,
      duration: 1.55,
      revealed: false
    });

    notify();
  }

  function revealStarMapReturn() {
    if (state.transition.type !== "system-to-star-map") {
      return;
    }

    if (state.transition.revealed) {
      return;
    }

    state.activeView = "star-map";
    state.transition.revealed = true;

    Object.assign(state.starMap, {
      selectedSystemId: state.transition.targetSystemId ?? state.starMap.selectedSystemId,
      hoveredSystemId: state.transition.targetSystemId ?? state.starMap.hoveredSystemId,
      selectionSource: "manual",
      infoVisible: true,
      pointerDown: false
    });

    notify();
  }

  function completeSystemTravel() {
    Object.assign(state.transition, {
      type: "idle",
      targetSystemId: null,
      startedAt: 0,
      duration: 0,
      revealed: false
    });

    notify();
  }

  function returnToStarMap() {
    if (state.activeView === "system-view") {
      beginStarMapReturn();
      return;
    }

    Object.assign(state.transition, {
      type: "idle",
      targetSystemId: null,
      startedAt: 0,
      duration: 0,
      revealed: false
    });

    state.activeView = "star-map";
    notify();
  }

  function beginStellarObjectStarMapReturn() {
    if (state.activeView !== "stellar-object-view") {
      return;
    }

    const now = performance.now() * 0.001;
    const signalId = state.stellarObjectView.activeSignalId ?? state.starMap.selectedSystemId;

    Object.assign(state.transition, {
      type: "stellar-object-to-star-map",
      targetSystemId: signalId,
      startedAt: now,
      duration: 1.35,
      revealed: false
    });

    notify();
  }

  function revealStellarObjectStarMapReturn() {
    if (state.transition.type !== "stellar-object-to-star-map") {
      return;
    }

    if (state.transition.revealed) {
      return;
    }

    const signalId = state.transition.targetSystemId ?? state.stellarObjectView.activeSignalId;

    state.activeView = "star-map";
    state.transition.revealed = true;

    Object.assign(state.starMap, {
      selectedSystemId: signalId ?? state.starMap.selectedSystemId,
      hoveredSystemId: signalId ?? state.starMap.hoveredSystemId,
      selectionSource: "manual",
      infoVisible: true,
      pointerDown: false
    });

    Object.assign(state.stellarObjectView, {
      activeObjectId: null,
      activeSignalId: null,
      enteredAt: 0,
      returnView: "star-map"
    });

    notify();
  }

  function enterStellarObjectView(objectId, options = {}) {
    if (!objectId) {
      return;
    }

    const currentView = state.activeView;
    const returnView = options.returnView ?? (currentView === "stellar-object-view"
      ? state.stellarObjectView.returnView || "system-view"
      : currentView);

    Object.assign(state.transition, {
      type: "idle",
      targetSystemId: null,
      startedAt: 0,
      duration: 0,
      revealed: false
    });

    const signalId = options.signalId ?? null;

    Object.assign(state.stellarObjectView, {
      activeObjectId: objectId,
      activeSignalId: signalId,
      enteredAt: performance.now() * 0.001,
      returnView
    });

    if (signalId) {
      addVisitedSystem(signalId);
    }

    state.activeView = "stellar-object-view";
    notify();
  }

  function exitStellarObjectView() {
    if (state.activeView !== "stellar-object-view") {
      return;
    }

    const returnView = state.stellarObjectView.returnView || "system-view";

    state.activeView = returnView;
    Object.assign(state.stellarObjectView, {
      activeObjectId: null,
      activeSignalId: null,
      enteredAt: 0
    });

    notify();
  }

  function addVisitedSystem(systemId) {
    if (!systemId) {
      return;
    }

    if (!state.starLog.visitedSystemIds.includes(systemId)) {
      state.starLog.visitedSystemIds.push(systemId);
    }
  }

  function visitSystem(systemId) {
    addVisitedSystem(systemId);
    notify();
  }

  function toggleStarLogBookmark(systemId) {
    if (!systemId) {
      return;
    }

    addVisitedSystem(systemId);

    const index = state.starLog.bookmarkedSystemIds.indexOf(systemId);

    if (index >= 0) {
      state.starLog.bookmarkedSystemIds.splice(index, 1);
    } else {
      state.starLog.bookmarkedSystemIds.push(systemId);
    }

    notify();
  }

  function setStarLogTab(tab) {
    state.starLog.activeTab = tab === "bookmarks" ? "bookmarks" : "star-log";
    notify();
  }

  function toggleVisitedConnections() {
    state.starLog.showVisitedConnections = !Boolean(state.starLog.showVisitedConnections);
    notify();
  }

  function setBookmarkModeDwellSeconds(value) {
    const nextValue = clampNumber(value, 5, 120, 18);

    if (Math.abs((state.bookmarkMode.dwellSeconds ?? 18) - nextValue) < 0.001) {
      return;
    }

    state.bookmarkMode.dwellSeconds = nextValue;
    notify();
  }

  function startAmbientBookmarkMode(options = {}) {
    const bookmarks = getTerrainBookmarkTourList();

    if (bookmarks.length === 0) {
      return false;
    }

    const now = performance.now() * 0.001;
    const requestedIndex = Number(options.startIndex ?? state.bookmarkMode.currentIndex ?? 0);
    const currentIndex = normalizeTourIndex(requestedIndex, bookmarks.length);
    const dwellSeconds = clampNumber(options.dwellSeconds ?? state.bookmarkMode.dwellSeconds, 5, 120, 18);

    Object.assign(state.bookmarkMode, {
      active: true,
      mode: "ambient",
      currentIndex,
      dwellSeconds,
      startedAt: now,
      stepStartedAt: now,
      paused: false,
      phase: "terrain-dwell",
      phaseStartedAt: now
    });

    enterTerrainBookmark(bookmarks[currentIndex].id, { notifyListeners: false, forceZeroSpeed: true });
    notify();
    return true;
  }

  function startStarLabBookmarkMode(options = {}) {
    const bookmarks = getTerrainBookmarkTourList();

    if (bookmarks.length === 0) {
      return false;
    }

    const now = performance.now() * 0.001;
    const requestedIndex = Number(options.startIndex ?? state.bookmarkMode.currentIndex ?? 0);
    const currentIndex = normalizeTourIndex(requestedIndex, bookmarks.length);
    const dwellSeconds = clampNumber(options.dwellSeconds ?? state.bookmarkMode.dwellSeconds, 5, 120, 18);

    Object.assign(state.bookmarkMode, {
      active: true,
      mode: "star-lab",
      currentIndex,
      dwellSeconds,
      startedAt: now,
      stepStartedAt: now,
      paused: false,
      phase: "star-map-focus",
      phaseStartedAt: now
    });

    focusBookmarkOnStarMap(bookmarks[currentIndex]);
    notify();
    return true;
  }

  function stopBookmarkMode() {
    if (!state.bookmarkMode.active) {
      return;
    }

    Object.assign(state.bookmarkMode, {
      active: false,
      paused: false,
      startedAt: 0,
      stepStartedAt: 0,
      phase: "idle",
      phaseStartedAt: 0
    });

    notify();
  }

  function pauseBookmarkMode(paused = true) {
    if (!state.bookmarkMode.active) {
      return;
    }

    state.bookmarkMode.paused = Boolean(paused);
    notify();
  }

  function advanceAmbientBookmarkMode(direction = 1) {
    if (!state.bookmarkMode.active || state.bookmarkMode.mode !== "ambient") {
      return false;
    }

    const bookmarks = getTerrainBookmarkTourList();

    if (bookmarks.length === 0) {
      stopBookmarkMode();
      return false;
    }

    const now = performance.now() * 0.001;
    const nextIndex = normalizeTourIndex((state.bookmarkMode.currentIndex ?? 0) + direction, bookmarks.length);

    state.bookmarkMode.currentIndex = nextIndex;
    state.bookmarkMode.stepStartedAt = now;
    state.bookmarkMode.phase = "terrain-dwell";
    state.bookmarkMode.phaseStartedAt = now;
    state.bookmarkMode.paused = false;

    enterTerrainBookmark(bookmarks[nextIndex].id, { notifyListeners: false, forceZeroSpeed: true });
    notify();
    return true;
  }

  function advanceStarLabBookmarkMode(direction = 1) {
    if (!state.bookmarkMode.active || state.bookmarkMode.mode !== "star-lab") {
      return false;
    }

    const bookmarks = getTerrainBookmarkTourList();

    if (bookmarks.length === 0) {
      stopBookmarkMode();
      return false;
    }

    const now = performance.now() * 0.001;
    const nextIndex = normalizeTourIndex((state.bookmarkMode.currentIndex ?? 0) + direction, bookmarks.length);

    Object.assign(state.bookmarkMode, {
      currentIndex: nextIndex,
      stepStartedAt: now,
      phase: "star-map-focus",
      phaseStartedAt: now,
      paused: false
    });

    focusBookmarkOnStarMap(bookmarks[nextIndex]);
    notify();
    return true;
  }

  function setBookmarkModePhase(phase, options = {}) {
    if (!state.bookmarkMode.active) {
      return false;
    }

    const now = performance.now() * 0.001;

    state.bookmarkMode.phase = phase || "idle";
    state.bookmarkMode.phaseStartedAt = Number(options.startedAt ?? now);

    if (options.resetStep !== false) {
      state.bookmarkMode.stepStartedAt = now;
    }

    if (options.notifyListeners !== false) {
      notify();
    }

    return true;
  }

  function focusBookmarkOnStarMap(bookmark) {
    if (!bookmark?.systemId) {
      return false;
    }

    Object.assign(state.transition, {
      type: "idle",
      targetSystemId: null,
      startedAt: 0,
      duration: 0,
      revealed: false
    });

    Object.assign(state.starMap, {
      selectedSystemId: bookmark.systemId,
      hoveredSystemId: bookmark.systemId,
      selectionSource: "manual",
      infoVisible: true,
      pointerDown: false
    });

    Object.assign(state.systemView, {
      activeSystemId: bookmark.systemId,
      selectedBodyId: null,
      hoveredBodyId: null,
      orbitTargetId: null,
      mode: "system",
      pointerDown: false
    });

    state.activeView = "star-map";
    return true;
  }

  function getTerrainBookmarkTourList() {
    return Array.isArray(state.starLog.terrainBookmarks)
      ? state.starLog.terrainBookmarks.filter((bookmark) => bookmark?.id && bookmark?.landingContext && bookmark?.pose)
      : [];
  }

  function selectStarLogSystem(systemId) {
    if (!systemId) {
      return;
    }

    Object.assign(state.starMap, {
      selectedSystemId: systemId,
      hoveredSystemId: systemId,
      selectionSource: "manual",
      infoVisible: true,
      zoom: 2.05
    });

    state.activeView = "star-map";
    notify();
  }

  function addTerrainBookmark(payload = {}) {
    const systemId = payload.systemId;
    const planetId = payload.planetId;
    const pose = payload.pose;
    const landingContext = payload.landingContext;

    if (!systemId || !planetId || !pose || !landingContext) {
      return null;
    }

    addVisitedSystem(systemId);

    const existingCount = state.starLog.terrainBookmarks.filter(
      (bookmark) => bookmark.systemId === systemId && bookmark.planetId === planetId
    ).length;

    const bookmark = {
      id: payload.id ?? `terrain-bookmark-${Date.now().toString(36)}-${Math.floor(Math.random() * 100000).toString(36)}`,
      systemId,
      planetId,
      systemName: payload.systemName ?? systemId,
      planetName: payload.planetName ?? planetId,
      name: payload.name ?? `${payload.planetName ?? planetId} · Site ${existingCount + 1}`,
      createdAt: payload.createdAt ?? Date.now(),
      landingContext: clonePlainObject(landingContext),
      pose: clonePlainObject(pose)
    };

    state.starLog.terrainBookmarks.push(bookmark);
    notify();
    return bookmark.id;
  }

  function removeTerrainBookmark(bookmarkId) {
    const index = state.starLog.terrainBookmarks.findIndex(
      (bookmark) => bookmark.id === bookmarkId
    );

    if (index < 0) {
      return;
    }

    state.starLog.terrainBookmarks.splice(index, 1);

    if (state.bookmarkMode.currentIndex >= state.starLog.terrainBookmarks.length) {
      state.bookmarkMode.currentIndex = Math.max(0, state.starLog.terrainBookmarks.length - 1);
    }

    if (state.bookmarkMode.active && getTerrainBookmarkTourList().length === 0) {
      Object.assign(state.bookmarkMode, {
        active: false,
        paused: false,
        startedAt: 0,
        stepStartedAt: 0,
        phase: "idle",
        phaseStartedAt: 0
      });
    }

    notify();
  }

  function enterTerrainBookmark(bookmarkId, options = {}) {
    const bookmark = state.starLog.terrainBookmarks.find(
      (candidate) => candidate.id === bookmarkId
    );

    if (!bookmark) {
      return;
    }

    addVisitedSystem(bookmark.systemId);

    Object.assign(state.transition, {
      type: "idle",
      targetSystemId: null,
      startedAt: 0,
      duration: 0,
      revealed: false
    });

    Object.assign(state.systemView, {
      activeSystemId: bookmark.systemId,
      mode: "orbit",
      selectedBodyId: bookmark.planetId,
      hoveredBodyId: bookmark.planetId,
      orbitTargetId: bookmark.planetId,
      orbitEnteredAt: performance.now() * 0.001,
      pointerDown: false
    });

    const restorePose = clonePlainObject(bookmark.pose);

    if (options.forceZeroSpeed !== false) {
      restorePose.targetSpeed = 0;
    }

    Object.assign(state.terrainView, {
      activeSystemId: bookmark.systemId,
      activePlanetId: bookmark.planetId,
      enteredAt: performance.now() * 0.001,
      landingContext: clonePlainObject(bookmark.landingContext),
      restorePose,
      restoreBookmarkId: bookmark.id
    });

    state.activeView = "terrain-view";

    if (options.notifyListeners !== false) {
      notify();
    }
  }

  function beginTerrainBookmarkLanding(bookmarkId, options = {}) {
    const bookmark = state.starLog.terrainBookmarks.find(
      (candidate) => candidate.id === bookmarkId
    );

    if (!bookmark) {
      return false;
    }

    const now = performance.now() * 0.001;
    const restorePose = clonePlainObject(bookmark.pose);

    if (options.forceZeroSpeed !== false) {
      restorePose.targetSpeed = 0;
    }

    addVisitedSystem(bookmark.systemId);

    Object.assign(state.systemView, {
      activeSystemId: bookmark.systemId,
      mode: "orbit",
      selectedBodyId: bookmark.planetId,
      hoveredBodyId: bookmark.planetId,
      orbitTargetId: bookmark.planetId,
      orbitEnteredAt: now,
      pointerDown: false
    });

    Object.assign(state.terrainView, {
      activeSystemId: bookmark.systemId,
      activePlanetId: bookmark.planetId,
      enteredAt: 0,
      landingContext: clonePlainObject(bookmark.landingContext),
      restorePose,
      restoreBookmarkId: bookmark.id
    });

    Object.assign(state.transition, {
      type: "system-to-terrain",
      targetSystemId: bookmark.systemId,
      startedAt: now,
      duration: options.duration ?? 1.75,
      revealed: false
    });

    if (options.notifyListeners !== false) {
      notify();
    }

    return true;
  }


  function exportProgress() {
    return {
      visitedSignalIds: clonePlainObject(state.starLog.visitedSystemIds),
      bookmarkedSignalIds: clonePlainObject(state.starLog.bookmarkedSystemIds),
      terrainBookmarks: clonePlainObject(state.starLog.terrainBookmarks),
      activeTab: state.starLog.activeTab,
      showVisitedConnections: state.starLog.showVisitedConnections,
      bookmarkMode: {
        dwellSeconds: state.bookmarkMode.dwellSeconds ?? 18
      },
      dirtySignalIds: clonePlainObject(state.dirtySignalIds),
      current: {
        activeView: state.activeView,
        selectedSystemId: state.starMap.selectedSystemId,
        activeSystemId: state.systemView.activeSystemId,
        selectedBodyId: state.systemView.selectedBodyId,
        activePlanetId: state.terrainView.activePlanetId,
        activeStellarObjectId: state.stellarObjectView.activeObjectId,
        activeStellarSignalId: state.stellarObjectView.activeSignalId
      }
    };
  }

  function restoreProgress(progress = {}) {
    const current = progress.current ?? {};
    const visitedSignalIds = createUniqueStringList(
      progress.visitedSignalIds ?? progress.visitedSystemIds ?? []
    );
    const bookmarkedSignalIds = createUniqueStringList(
      progress.bookmarkedSignalIds ?? progress.bookmarkedSystemIds ?? []
    );
    const selectedSystemId = current.selectedSystemId ?? visitedSignalIds[0] ?? "system-001";
    const activeSystemId = current.activeSystemId ?? selectedSystemId ?? "system-001";

    Object.assign(state.transition, {
      type: "idle",
      targetSystemId: null,
      startedAt: 0,
      duration: 0,
      revealed: false
    });

    Object.assign(state.starMap, {
      yaw: 0,
      pitch: 0,
      zoom: 1,
      hoveredSystemId: selectedSystemId,
      selectedSystemId,
      selectionSource: "manual",
      infoVisible: true,
      markerScreenX: 0,
      markerScreenY: 0,
      markerScreenVisible: false,
      pointerDown: false
    });

    Object.assign(state.systemView, {
      activeSystemId,
      enteredAt: 0,
      yaw: SYSTEM_VIEW_DEFAULT.yaw,
      pitch: SYSTEM_VIEW_DEFAULT.pitch,
      zoom: SYSTEM_VIEW_DEFAULT.zoom,
      mode: "system",
      hoveredBodyId: null,
      selectedBodyId: current.selectedBodyId ?? null,
      orbitTargetId: null,
      orbitEnteredAt: 0,
      orbitYaw: 0,
      orbitPitch: 0,
      orbitDistance: 1,
      pointerDown: false
    });

    Object.assign(state.terrainView, {
      activeSystemId,
      activePlanetId: null,
      enteredAt: 0,
      landingContext: null,
      restorePose: null,
      restoreBookmarkId: null
    });

    Object.assign(state.stellarObjectView, {
      activeObjectId: null,
      activeSignalId: null,
      enteredAt: 0,
      returnView: "star-map"
    });

    Object.assign(state.starLog, {
      visitedSystemIds: visitedSignalIds,
      bookmarkedSystemIds: bookmarkedSignalIds,
      terrainBookmarks: clonePlainObject(Array.isArray(progress.terrainBookmarks) ? progress.terrainBookmarks : []),
      activeTab: progress.activeTab === "bookmarks" ? "bookmarks" : "star-log",
      showVisitedConnections: Boolean(progress.showVisitedConnections ?? true)
    });

    Object.assign(state.bookmarkMode, {
      active: false,
      mode: "ambient",
      currentIndex: 0,
      dwellSeconds: clampNumber(progress.bookmarkMode?.dwellSeconds ?? state.bookmarkMode.dwellSeconds, 5, 120, 18),
      startedAt: 0,
      stepStartedAt: 0,
      paused: false,
      phase: "idle",
      phaseStartedAt: 0
    });

    state.dirtySignalIds = createUniqueStringList(progress.dirtySignalIds ?? []);
    state.activeView = "star-map";
    state.configRevision += 1;
    notify();
  }

  function markActiveSignalDirty(options = {}) {
    const signalId = getActiveSignalId();
    markSignalDirty(signalId, options);
  }

  function markSignalDirty(signalId, options = {}) {
    if (!signalId || state.dirtySignalIds.includes(signalId)) {
      return;
    }

    state.dirtySignalIds.push(signalId);

    if (options.notifyListeners !== false) {
      notify();
    }
  }

  function getActiveSignalId() {
    if (state.activeView === "stellar-object-view") {
      return state.stellarObjectView.activeSignalId ?? state.starMap.selectedSystemId;
    }

    if (state.activeView === "terrain-view") {
      return state.terrainView.activeSystemId ?? state.systemView.activeSystemId;
    }

    if (state.activeView === "system-view") {
      return state.systemView.activeSystemId;
    }

    return state.starMap.selectedSystemId ?? state.systemView.activeSystemId;
  }

  function toggleStellarObjectView(objectId) {
    if (!objectId) {
      return;
    }

    if (state.activeView === "stellar-object-view") {
      if (state.stellarObjectView.activeObjectId === objectId) {
        exitStellarObjectView();
      } else {
        enterStellarObjectView(objectId);
      }

      return;
    }

    enterStellarObjectView(objectId);
  }

  return {
    getState,
    subscribe,
    exportProgress,
    restoreProgress,
    markSignalDirty,
    markActiveSignalDirty,
    setStarMapState,
    setSystemViewState,
    getSystemEditorSelectedPlanetId,
    setSystemEditorSelectedPlanetId,
    selectSystemBody,
    deselectSystemBody,
    enterOrbitView,
    requestOrbitReturn,
    exitOrbitView,
    notifyConfigChanged,
    beginTerrainLanding,
    revealTerrainLanding,
    returnToSystemView,
    revealSystemReturn,
    beginSystemTravel,
    revealSystemTravel,
    beginStarMapReturn,
    revealStarMapReturn,
    completeSystemTravel,
    returnToStarMap,
    beginStellarObjectStarMapReturn,
    revealStellarObjectStarMapReturn,
    enterStellarObjectView,
    exitStellarObjectView,
    toggleStellarObjectView,
    visitSystem,
    toggleStarLogBookmark,
    setStarLogTab,
    toggleVisitedConnections,
    setBookmarkModeDwellSeconds,
    startAmbientBookmarkMode,
    startStarLabBookmarkMode,
    stopBookmarkMode,
    pauseBookmarkMode,
    advanceAmbientBookmarkMode,
    advanceStarLabBookmarkMode,
    setBookmarkModePhase,
    selectStarLogSystem,
    addTerrainBookmark,
    removeTerrainBookmark,
    enterTerrainBookmark,
    beginTerrainBookmarkLanding
  };
}

function createUniqueStringList(values) {
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

function normalizeTourIndex(index, length) {
  if (!Number.isFinite(Number(index)) || length <= 0) {
    return 0;
  }

  return ((Math.trunc(Number(index)) % length) + length) % length;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numeric));
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
