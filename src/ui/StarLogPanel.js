import { createStarMapSectorBounds, formatStarMapSectorId, getStarMapSectorForPosition } from "../core/starMapSectors.js";
import { STELLAR_OBJECT_LABELS } from "../core/stellarObjects.js";

export class StarLogPanel {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("aside");
    this.element.className = "star-log-panel";
    this.sectorBounds = createStarMapSectorBounds(this.galaxyConfig.systems);

    this.unsubscribe = null;
    this.collapsed = false;
    this.suppressNextClick = false;
    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handlePointerBarrier = this.handlePointerBarrier.bind(this);
  }

  mount() {
    this.rootElement.appendChild(this.element);
    this.element.addEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.addEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.addEventListener("click", this.handleClick);
    this.element.addEventListener("input", this.handleInput);
    this.element.addEventListener("change", this.handleInput);

    this.unsubscribe = this.store.subscribe(() => {
      this.render();
    });

    this.render();
  }

  destroy() {
    this.unsubscribe?.();
    this.element.removeEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.removeEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.removeEventListener("click", this.handleClick);
    this.element.removeEventListener("input", this.handleInput);
    this.element.removeEventListener("change", this.handleInput);
    this.element.remove();
  }

  handlePointerBarrier(event) {
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const actionTarget = findActionTarget(event.target);

    if (event.type !== "pointerdown" || !actionTarget) {
      return;
    }

    event.preventDefault();
    this.suppressNextClick = true;
    this.performAction(actionTarget);
  }

  handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }

    const actionTarget = findActionTarget(event.target);

    if (actionTarget) {
      this.performAction(actionTarget);
    }
  }

  handleInput(event) {
    const target = event.target;

    if (!target?.matches?.("[data-bookmark-mode-dwell]")) {
      return;
    }

    event.stopPropagation();
    this.store.setBookmarkModeDwellSeconds?.(target.value);
  }

  performAction(target) {
    if (target.matches("[data-star-log-action='toggle-collapse']")) {
      this.collapsed = !this.collapsed;
      this.render();
      return;
    }

    if (target.matches("[data-terrain-bookmark-id]")) {
      this.store.enterTerrainBookmark(target.dataset.terrainBookmarkId);
      return;
    }

    if (target.matches("[data-remove-terrain-bookmark-id]")) {
      this.store.removeTerrainBookmark(target.dataset.removeTerrainBookmarkId);
      return;
    }

    if (target.matches("[data-star-log-tab]")) {
      this.store.setStarLogTab(target.dataset.starLogTab);
      return;
    }

    if (target.matches("[data-star-log-action='toggle-visited-connections']")) {
      this.store.toggleVisitedConnections?.();
      return;
    }

    if (target.matches("[data-star-log-action='start-ambient-bookmark-mode']")) {
      this.store.startAmbientBookmarkMode?.();
      return;
    }

    if (target.matches("[data-star-log-action='start-star-lab-bookmark-mode']")) {
      this.store.startStarLabBookmarkMode?.();
      return;
    }

    if (target.matches("[data-star-log-action='stop-bookmark-mode']")) {
      this.store.stopBookmarkMode?.();
      return;
    }

    if (target.matches("[data-star-log-bookmark]")) {
      this.store.toggleStarLogBookmark(target.dataset.starLogBookmark);
      return;
    }

    if (target.matches("[data-star-log-system]")) {
      this.store.selectStarLogSystem(target.dataset.starLogSystem);
    }
  }

  render() {
    const state = this.store.getState();

    if (state.activeView !== "star-map") {
      this.hide();
      return;
    }

    const starLog = state.starLog ?? {};
    const activeTab = starLog.activeTab === "bookmarks" ? "bookmarks" : "star-log";
    const visitedIds = Array.isArray(starLog.visitedSystemIds) ? starLog.visitedSystemIds : [];
    const bookmarkIds = Array.isArray(starLog.bookmarkedSystemIds) ? starLog.bookmarkedSystemIds : [];
    const terrainBookmarks = Array.isArray(starLog.terrainBookmarks) ? starLog.terrainBookmarks : [];
    const sourceIds = activeTab === "bookmarks"
      ? mergeUnique([
          ...bookmarkIds,
          ...terrainBookmarks.map((bookmark) => bookmark.systemId)
        ])
      : visitedIds;
    const systems = sourceIds
      .map((systemId) => this.findSystem(systemId))
      .filter(Boolean);

    const collapsedClass = this.collapsed ? " is-collapsed" : "";
    const bodyMarkup = this.collapsed
      ? ""
      : `
        <div class="star-log-tabs" role="tablist" aria-label="Star log tabs">
          ${renderTab("star-log", "Star Log", activeTab)}
          ${renderTab("bookmarks", "Bookmarks", activeTab)}
        </div>

        <div class="star-log-route-toggle-row">
          <button
            class="star-log-route-toggle${starLog.showVisitedConnections ? " is-active" : ""}"
            type="button"
            data-star-log-action="toggle-visited-connections"
            title="Draw route between visited systems"
          >Route Lines ${starLog.showVisitedConnections ? "On" : "Off"}</button>
        </div>

        ${activeTab === "bookmarks" ? renderBookmarkModeControls(starLog, state.bookmarkMode ?? {}, terrainBookmarks) : ""}

        <div class="star-log-list">
          ${systems.length > 0
            ? systems.map((system) => this.renderSystemGroup(system, state, bookmarkIds, terrainBookmarks, activeTab)).join("")
            : renderEmpty(activeTab)}
        </div>
      `;

    const previousListScrollTop =
      this.element.querySelector(".star-log-list")?.scrollTop ?? 0;

    this.element.classList.add("is-visible");
    this.element.innerHTML = `
      <div class="star-log-card${collapsedClass}">
        <div class="star-log-kicker">Navigation</div>
        <div class="star-log-title-row">
          <h2>Star Log</h2>
          <div class="star-log-title-actions">
            <span class="star-log-count">${systems.length}</span>
            <button
              class="star-log-collapse-button"
              type="button"
              data-star-log-action="toggle-collapse"
              aria-expanded="${this.collapsed ? "false" : "true"}"
              aria-label="${this.collapsed ? "Expand star log" : "Collapse star log"}"
              title="${this.collapsed ? "Expand" : "Collapse"}"
            >${this.collapsed ? "+" : "–"}</button>
          </div>
        </div>
        ${bodyMarkup}
      </div>
    `;

    const nextList = this.element.querySelector(".star-log-list");

    if (nextList) {
      nextList.scrollTop = previousListScrollTop;
    }
  }

  hide() {
    this.element.classList.remove("is-visible");
    this.element.innerHTML = "";
  }

  findSystem(systemId) {
    return this.galaxyConfig.systems.find((system) => system.id === systemId) ?? null;
  }

  renderSystemGroup(system, state, bookmarkIds, terrainBookmarks, activeTab) {
    const systemBookmarks = terrainBookmarks.filter((bookmark) => bookmark.systemId === system.id);

    return `
      <div class="star-log-system-group">
        ${this.renderSystemRow(system, state, bookmarkIds, systemBookmarks.length)}
        ${activeTab === "bookmarks" && systemBookmarks.length > 0
          ? `<div class="star-log-terrain-bookmark-list">
              ${systemBookmarks.map((bookmark) => renderTerrainBookmarkRow(bookmark)).join("")}
            </div>`
          : ""}
      </div>
    `;
  }

  renderSystemRow(system, state, bookmarkIds, terrainBookmarkCount = 0) {
    const selectedClass = system.id === state.starMap.selectedSystemId ? " is-selected" : "";
    const bookmarked = bookmarkIds.includes(system.id);
    const planetCount = system.summary?.planetCount ?? "?";
    const starType = system.summary?.starType ?? "unknown";
    const siteLabel = terrainBookmarkCount > 0 ? ` · ${terrainBookmarkCount} site${terrainBookmarkCount === 1 ? "" : "s"}` : "";
    const sectorLabel = formatStarMapSectorId(getStarMapSectorForPosition(system.position, this.sectorBounds));
    const metaLabel = isStellarObjectSignal(system)
      ? `${sectorLabel} · ${system.id} · anomaly · ${getStellarObjectLabel(system)}`
      : `${sectorLabel} · ${system.id} · ${starType} · ${planetCount} planet${planetCount === 1 ? "" : "s"}${siteLabel}`;

    return `
      <button class="star-log-row${selectedClass}" type="button" data-star-log-system="${escapeHtml(system.id)}">
        <span class="star-log-row-main">
          <span class="star-log-row-name">${escapeHtml(system.name ?? system.id)}</span>
          <span class="star-log-row-meta">${escapeHtml(metaLabel)}</span>
        </span>
        <span
          class="star-log-bookmark${bookmarked ? " is-bookmarked" : ""}"
          role="button"
          tabindex="0"
          title="${bookmarked ? "Remove bookmark" : "Bookmark system"}"
          aria-label="${bookmarked ? "Remove bookmark" : "Bookmark system"}"
          data-star-log-bookmark="${escapeHtml(system.id)}"
        >★</span>
      </button>
    `;
  }
}

function isStellarObjectSignal(system) {
  return system?.kind === "stellar-object" || Boolean(system?.stellarObject?.objectId);
}

function getStellarObjectLabel(system) {
  const objectId = system?.stellarObject?.objectId;
  return STELLAR_OBJECT_LABELS[objectId] ?? system?.summary?.starType ?? "stellar object";
}

function findActionTarget(target) {
  return target?.closest?.(
    "[data-star-log-action='toggle-collapse']," +
    "[data-star-log-action='toggle-visited-connections']," +
    "[data-star-log-action='start-ambient-bookmark-mode']," +
    "[data-star-log-action='start-star-lab-bookmark-mode']," +
    "[data-star-log-action='stop-bookmark-mode']," +
    "[data-terrain-bookmark-id]," +
    "[data-remove-terrain-bookmark-id]," +
    "[data-star-log-tab]," +
    "[data-star-log-bookmark]," +
    "[data-star-log-system]"
  ) ?? null;
}


function renderBookmarkModeControls(starLog, bookmarkMode, terrainBookmarks) {
  const bookmarkCount = terrainBookmarks.length;
  const active = Boolean(bookmarkMode?.active);
  const activeMode = bookmarkMode?.mode ?? "ambient";
  const dwellSeconds = Math.max(5, Math.min(120, Number(bookmarkMode?.dwellSeconds ?? 18)));

  return `
    <div class="star-log-bookmark-mode-card">
      <div class="star-log-bookmark-mode-header">
        <span>Bookmark Mode</span>
        <span>${bookmarkCount} site${bookmarkCount === 1 ? "" : "s"}</span>
      </div>
      <div class="star-log-bookmark-mode-dwell is-readonly">
        <span>Ambient View Time</span>
        <strong>${Math.round(dwellSeconds)}s</strong>
      </div>
      <div class="star-log-bookmark-mode-actions">
        <button
          class="star-log-bookmark-mode-start${active && activeMode === "ambient" ? " is-active" : ""}"
          type="button"
          data-star-log-action="${active ? "stop-bookmark-mode" : "start-ambient-bookmark-mode"}"
          ${bookmarkCount > 0 ? "" : "disabled"}
        >${active && activeMode === "ambient" ? "Stop Ambient" : "Start Ambient"}</button>
        <button
          class="star-log-bookmark-mode-start${active && activeMode === "star-lab" ? " is-active" : ""}"
          type="button"
          data-star-log-action="${active ? "stop-bookmark-mode" : "start-star-lab-bookmark-mode"}"
          ${bookmarkCount > 0 ? "" : "disabled"}
        >${active && activeMode === "star-lab" ? "Stop Star Lab" : "Start Star Lab"}</button>
      </div>
    </div>
  `;
}

function renderTerrainBookmarkRow(bookmark) {
  const title = bookmark.name ?? `${bookmark.planetName ?? bookmark.planetId} · Site`;
  const meta = `${bookmark.planetName ?? bookmark.planetId} · ${formatBookmarkTime(bookmark.createdAt)}`;

  return `
    <div class="star-log-terrain-bookmark-row">
      <button
        class="star-log-terrain-bookmark-button"
        type="button"
        data-terrain-bookmark-id="${escapeHtml(bookmark.id)}"
      >
        <span class="star-log-terrain-bookmark-name">${escapeHtml(title)}</span>
        <span class="star-log-terrain-bookmark-meta">${escapeHtml(meta)}</span>
      </button>
      <button
        class="star-log-terrain-bookmark-remove"
        type="button"
        title="Remove location bookmark"
        aria-label="Remove location bookmark"
        data-remove-terrain-bookmark-id="${escapeHtml(bookmark.id)}"
      >×</button>
    </div>
  `;
}

function renderTab(value, label, activeTab) {
  return `
    <button
      class="star-log-tab${activeTab === value ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${activeTab === value ? "true" : "false"}"
      data-star-log-tab="${escapeHtml(value)}"
    >${escapeHtml(label)}</button>
  `;
}

function renderEmpty(activeTab) {
  const text = activeTab === "bookmarks"
    ? "No bookmarked systems or terrain sites yet."
    : "No visited systems yet.";

  const hint = activeTab === "bookmarks"
    ? "Favorite systems or bookmark terrain locations to pin them here."
    : "Enter systems from the Star Map to record them here.";

  return `
    <div class="star-log-empty">
      <strong>${escapeHtml(text)}</strong>
      <span>${escapeHtml(hint)}</span>
    </div>
  `;
}

function mergeUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatBookmarkTime(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "runtime";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
