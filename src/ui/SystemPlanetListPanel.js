const MAX_SYSTEM_PLANETS = 16;

export class SystemPlanetListPanel {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("aside");
    this.element.className = "system-planet-list-panel";

    this.unsubscribe = null;
    this.collapsed = false;

    this.handleClick = this.handleClick.bind(this);
    this.handlePointerBarrier = this.handlePointerBarrier.bind(this);
  }

  mount() {
    this.rootElement.appendChild(this.element);
    this.element.addEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.addEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.addEventListener("click", this.handleClick);

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
    this.element.remove();
  }

  handlePointerBarrier(event) {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  handleClick(event) {
    const toggleButton = event.target.closest("[data-system-planet-list-action='toggle-collapse']");

    if (toggleButton) {
      this.collapsed = !this.collapsed;
      this.render();
      return;
    }

    const button = event.target.closest("[data-planet-id]");

    if (!button) {
      return;
    }

    const planetId = button.dataset.planetId;

    if (!planetId) {
      return;
    }

    const state = this.store.getState();
    const activeSystemId = state.systemView?.activeSystemId ?? null;

    if (activeSystemId) {
      this.store.setSystemEditorSelectedPlanetId(activeSystemId, planetId);
    }

    this.store.enterOrbitView(planetId);
  }

  render() {
    const state = this.store.getState();

    if (state.activeView !== "system-view") {
      this.hide();
      return;
    }

    const system = this.getActiveSystem(state.systemView.activeSystemId);

    if (!system) {
      this.hide();
      return;
    }

    const planets = getVisiblePlanets(system);

    if (planets.length === 0) {
      this.hide();
      return;
    }

    const selectedPlanetId = getSelectedPlanetId(state.systemView, system);
    const collapsedClass = this.collapsed ? " is-collapsed" : "";
    const listMarkup = this.collapsed
      ? ""
      : `
        <div class="system-planet-list-panel-list">
          ${planets.map(({ planet, index }) => this.renderPlanetButton(planet, index, selectedPlanetId)).join("")}
        </div>
      `;

    const previousListScrollTop =
      this.element.querySelector(".system-planet-list-panel-list")?.scrollTop ?? 0;

    this.element.classList.add("is-visible");
    this.element.innerHTML = `
      <div class="system-planet-list-panel-card${collapsedClass}">
        <div class="system-planet-list-panel-header">
          <div>
            <div class="system-planet-list-panel-kicker">Planets</div>
            <div class="system-planet-list-panel-title">${escapeHtml(system.name)}</div>
          </div>
          <button
            class="system-planet-list-collapse-button"
            type="button"
            data-system-planet-list-action="toggle-collapse"
            aria-expanded="${this.collapsed ? "false" : "true"}"
            aria-label="${this.collapsed ? "Expand planet list" : "Collapse planet list"}"
            title="${this.collapsed ? "Expand" : "Collapse"}"
          >
            ${this.collapsed ? "+" : "–"}
          </button>
        </div>
        ${listMarkup}
      </div>
    `;

    const nextList = this.element.querySelector(".system-planet-list-panel-list");

    if (nextList) {
      nextList.scrollTop = previousListScrollTop;
    }
  }

  hide() {
    this.element.classList.remove("is-visible");
    this.element.innerHTML = "";
  }

  getActiveSystem(systemId) {
    return this.galaxyConfig.systems.find((candidate) => candidate.id === systemId) ?? null;
  }

  renderPlanetButton(planet, index, selectedBodyId) {
    const selectedClass = planet.id === selectedBodyId ? " is-selected" : "";
    const terrainId = planet.visual?.terrainShaderId ?? "none";
    const moonCount = getMoonCount(planet);
    const radius = formatValue(planet.body?.radius);
    const label = planet.name ?? planet.id ?? `Planet ${index + 1}`;

    return `
      <button
        class="system-planet-list-button${selectedClass}"
        type="button"
        data-planet-id="${escapeHtml(planet.id)}"
        aria-pressed="${planet.id === selectedBodyId ? "true" : "false"}"
      >
        <span class="system-planet-list-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="system-planet-list-main">
          <span class="system-planet-list-name">${escapeHtml(label)}</span>
          <span class="system-planet-list-meta">${escapeHtml(terrainId)} · R ${escapeHtml(radius)} · ${moonCount} moon${moonCount === 1 ? "" : "s"}</span>
        </span>
      </button>
    `;
  }
}

function getSelectedPlanetId(systemViewState, system) {
  const selectedBodyId = systemViewState.orbitTargetId ?? systemViewState.selectedBodyId ?? null;

  if (!selectedBodyId) {
    return null;
  }

  if (system?.planets?.some((planet) => planet?.id === selectedBodyId)) {
    return selectedBodyId;
  }

  const separatorIndex = selectedBodyId.indexOf(":moon-");
  return separatorIndex > 0 ? selectedBodyId.slice(0, separatorIndex) : null;
}

function getVisiblePlanets(system) {
  const planets = Array.isArray(system?.planets) ? system.planets.filter(Boolean) : [];
  const visibleCount = getVisiblePlanetCount(system);

  return planets
    .slice(0, visibleCount)
    .map((planet, index) => ({ planet, index }));
}

function getVisiblePlanetCount(system) {
  const rawCount = system?.summary?.planetCount;

  if (rawCount !== null && rawCount !== undefined && rawCount !== "") {
    const configuredCount = Number(rawCount);

    if (Number.isFinite(configuredCount)) {
      return clampInteger(configuredCount, 1, MAX_SYSTEM_PLANETS);
    }
  }

  const sourcePlanetCount = Array.isArray(system?.planets)
    ? system.planets.filter(Boolean).length
    : 0;

  if (sourcePlanetCount > 0 && sourcePlanetCount < MAX_SYSTEM_PLANETS) {
    return clampInteger(sourcePlanetCount, 1, MAX_SYSTEM_PLANETS);
  }

  return Math.min(4, MAX_SYSTEM_PLANETS);
}

function getMoonCount(planet) {
  if (Array.isArray(planet?.moons)) {
    return Math.max(0, Math.min(10, planet.moons.length));
  }

  const count = Number(planet?.moons?.count ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.min(10, Math.round(count))) : 0;
}

function clampInteger(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(number)));
}

function formatValue(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "—";
    }

    if (Math.abs(value) < 1) {
      return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }

    if (Math.abs(value) < 100) {
      return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }

    return Math.round(value).toString();
  }

  return String(value ?? "—");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
