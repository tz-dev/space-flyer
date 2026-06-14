import { createStarMapSectorBounds, formatStarMapSectorId, getStarMapSectorForPosition } from "../core/starMapSectors.js";
import { STELLAR_OBJECT_LABELS } from "../core/stellarObjects.js";

export class StarMapPanel {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("aside");
    this.element.className = "star-map-panel";
    this.sectorBounds = createStarMapSectorBounds(this.galaxyConfig.systems);

    this.unsubscribe = null;
    this.suppressNextClick = false;

    this.handleClick = this.handleClick.bind(this);
    this.handlePointerBarrier = this.handlePointerBarrier.bind(this);
    this.updateConnectorLine = this.updateConnectorLine.bind(this);
    this.updatePanelPosition = this.updatePanelPosition.bind(this);
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

    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    if (event.type === "pointerdown" && (button.dataset.action === "enter-system" || button.dataset.action === "enter-stellar-object")) {
      event.preventDefault();
      this.suppressNextClick = true;
      this.performAction(button);
    }
  }

  handleClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }

    this.performAction(button);
  }

  performAction(button) {
    const action = button.dataset.action;

    if (action === "enter-system") {
      const state = this.store.getState();
      const selectedSystemId = button.dataset.systemId || state.starMap.selectedSystemId;
      const selectedSystem = this.findSystem(selectedSystemId);

      if (!selectedSystem || isStellarObjectSignal(selectedSystem)) {
        return;
      }

      const isSelectedActiveSystem =
        selectedSystem.id === state.systemView.activeSystemId;

      this.store.setStarMapState({
        selectedSystemId: selectedSystem.id,
        hoveredSystemId: selectedSystem.id,
        selectionSource: "manual",
        infoVisible: true
      });

      this.store.beginSystemTravel(selectedSystem.id, {
        useWarp: !isSelectedActiveSystem
      });

      return;
    }

    if (action === "enter-stellar-object") {
      const state = this.store.getState();
      const selectedSystemId = button.dataset.systemId || state.starMap.selectedSystemId;
      const selectedSystem = this.findSystem(selectedSystemId);

      if (!selectedSystem || !isStellarObjectSignal(selectedSystem)) {
        return;
      }

      const objectId = selectedSystem.stellarObject?.objectId;

      if (!objectId) {
        return;
      }

      this.store.setStarMapState({
        selectedSystemId: selectedSystem.id,
        hoveredSystemId: selectedSystem.id,
        selectionSource: "manual",
        infoVisible: true
      });

      this.store.enterStellarObjectView(objectId, {
        signalId: selectedSystem.id,
        returnView: "star-map"
      });

      return;
    }

    if (action === "back-to-star-map") {
      this.store.returnToStarMap();
    }
  }

  render() {
    const state = this.store.getState();

    if (state.activeView === "star-map") {
      this.renderStarMapPanel();
      return;
    }

    this.hide();
  }

  hide() {
    this.element.classList.add("is-hidden");
    this.element.classList.remove("is-floating");
    this.element.style.left = "";
    this.element.style.top = "";
    this.element.innerHTML = "";
  }

  renderStarMapPanel() {
    const state = this.store.getState();
    const selectedSystem = this.findSystem(state.starMap.selectedSystemId);
    const isTraveling = state.transition.type !== "idle";
    const isSelectedActiveSystem =
      selectedSystem?.id === state.systemView.activeSystemId;
    const visitedSystemIds = Array.isArray(state.starLog?.visitedSystemIds)
      ? state.starLog.visitedSystemIds
      : [];
    const isKnownSystem = Boolean(
      selectedSystem?.discovered || visitedSystemIds.includes(selectedSystem?.id)
    );
    const sectorLabel = selectedSystem
      ? formatStarMapSectorId(getStarMapSectorForPosition(selectedSystem.position, this.sectorBounds))
      : "Sector unknown";

    if (!selectedSystem || state.starMap.infoVisible === false || isTraveling) {
      this.hide();
      return;
    }

    this.element.classList.remove("is-hidden");
    this.element.classList.add("is-floating");

    if (isStellarObjectSignal(selectedSystem)) {
      this.renderStellarObjectSignalPanel(selectedSystem, {
        isKnownSystem,
        sectorLabel,
        isTraveling
      });
      return;
    }

    if (!isKnownSystem) {
      this.element.innerHTML = `
        ${renderConnectorSvg()}
      <h1>Selected Signal</h1>
        <h2>Unknown Signal</h2>

        <dl>
          <dt>ID</dt>
          <dd>${escapeHtml(selectedSystem.id)}</dd>

          <dt>Sector</dt>
          <dd>${escapeHtml(sectorLabel)}</dd>

          <dt>Status</dt>
          <dd>unknown</dd>

          <dt>Seed</dt>
          <dd>unknown</dd>

          <dt>Planets</dt>
          <dd>unknown</dd>

          <dt>Star Type</dt>
          <dd>unknown</dd>

          <dt>Position</dt>
          <dd>unknown</dd>
        </dl>

        <div class="star-map-actions">
          <button
            class="panel-button"
            type="button"
            data-action="enter-system"
            data-system-id="${escapeHtml(selectedSystem.id)}"
            ${isTraveling ? "disabled" : ""}
          >
            ${
              isTraveling
                ? "Entering System..."
                : isSelectedActiveSystem
                  ? "Return to System"
                  : "Enter System"
            }
          </button>
        </div>
      `;
      requestAnimationFrame(this.updatePanelPosition);

      return;
    }

    const statusLabel = selectedSystem.discovered ? "discovered" : "visited";

    this.element.innerHTML = `
      ${renderConnectorSvg()}
      <h1>Selected System</h1>
      <h2>${escapeHtml(selectedSystem.name)}</h2>

      <dl>
        <dt>ID</dt>
        <dd>${escapeHtml(selectedSystem.id)}</dd>

        <dt>Sector</dt>
        <dd>${escapeHtml(sectorLabel)}</dd>

        <dt>Status</dt>
        <dd>${escapeHtml(statusLabel)}</dd>

        <dt>Seed</dt>
        <dd>${selectedSystem.seed}</dd>

        <dt>Planets</dt>
        <dd>${selectedSystem.summary.planetCount}</dd>

        <dt>Star Type</dt>
        <dd>${escapeHtml(selectedSystem.summary.starType)}</dd>

        <dt>Position</dt>
        <dd>${selectedSystem.position.map(formatNumber).join(", ")}</dd>
      </dl>

      <div class="star-map-actions">
        <button
          class="panel-button"
          type="button"
          data-action="enter-system"
          data-system-id="${escapeHtml(selectedSystem.id)}"
          ${isTraveling ? "disabled" : ""}
        >
          ${
            isTraveling
              ? isSelectedActiveSystem
                ? "Returning..."
                : "Entering System..."
              : isSelectedActiveSystem
                ? "Return to System"
                : "Enter System"
          }
        </button>
      </div>
    `;
    requestAnimationFrame(this.updatePanelPosition);
  }

  renderStellarObjectSignalPanel(signal, { isKnownSystem, sectorLabel, isTraveling }) {
    const objectId = signal.stellarObject?.objectId ?? "";
    const objectLabel = STELLAR_OBJECT_LABELS[objectId] ?? "Stellar Object";
    const title = isKnownSystem ? signal.name : "Unknown Anomaly";

    this.element.innerHTML = `
      ${renderConnectorSvg()}
      <h1>Selected Signal</h1>
      <h2>${escapeHtml(title)}</h2>

      <dl>
        <dt>ID</dt>
        <dd>${escapeHtml(signal.id)}</dd>

        <dt>Sector</dt>
        <dd>${escapeHtml(sectorLabel)}</dd>

        <dt>Status</dt>
        <dd>${isKnownSystem ? "charted anomaly" : "unknown anomaly"}</dd>

        <dt>Object Type</dt>
        <dd>${isKnownSystem ? escapeHtml(objectLabel) : "unknown"}</dd>

        <dt>Seed</dt>
        <dd>${isKnownSystem ? escapeHtml(signal.seed) : "unknown"}</dd>

        <dt>Position</dt>
        <dd>${isKnownSystem ? signal.position.map(formatNumber).join(", ") : "unknown"}</dd>
      </dl>

      <div class="star-map-actions">
        <button
          class="panel-button"
          type="button"
          data-action="enter-stellar-object"
          data-system-id="${escapeHtml(signal.id)}"
          ${isTraveling ? "disabled" : ""}
        >
          ${isTraveling ? "Inspecting..." : "Inspect Anomaly"}
        </button>
      </div>
    `;
    requestAnimationFrame(this.updatePanelPosition);
  }

  updatePanelPosition() {
    if (!this.element.classList.contains("is-floating")) {
      this.updateConnectorLine();
      return;
    }

    const state = this.store.getState();

    if (!state.starMap.markerScreenVisible) {
      this.updateConnectorLine();
      return;
    }

    const markerX = Number(state.starMap.markerScreenX ?? window.innerWidth * 0.5);
    const markerY = Number(state.starMap.markerScreenY ?? window.innerHeight * 0.5);
    const panelRect = this.element.getBoundingClientRect();
    const margin = 24;
    const offset = 34;
    const panelWidth = panelRect.width || 320;
    const panelHeight = panelRect.height || 260;

    let left = markerX + offset;

    if (left + panelWidth + margin > window.innerWidth) {
      left = markerX - panelWidth - offset;
    }

    let top = markerY - 28;

    left = clamp(left, margin, Math.max(margin, window.innerWidth - panelWidth - margin));
    top = clamp(top, margin, Math.max(margin, window.innerHeight - panelHeight - margin));

    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;

    this.updateConnectorLine();
  }

  updateConnectorLine() {
    const line = this.element.querySelector(".star-map-connector-line");

    if (!line) {
      return;
    }

    const state = this.store.getState();
    const panelRect = this.element.getBoundingClientRect();
    const markerX = Number(state.starMap.markerScreenX ?? window.innerWidth * 0.5);
    const markerY = Number(state.starMap.markerScreenY ?? window.innerHeight * 0.5);

    line.setAttribute("x1", String(Math.round(panelRect.left)));
    line.setAttribute("y1", String(Math.round(panelRect.top)));
    line.setAttribute("x2", String(Math.round(markerX)));
    line.setAttribute("y2", String(Math.round(markerY)));
  }

  renderSystemViewPanel() {
    this.element.classList.remove("is-hidden");
    this.element.classList.remove("is-floating");
    this.element.style.left = "";
    this.element.style.top = "";
    const { activeSystemId } = this.store.getState().systemView;
    const activeSystem = this.findSystem(activeSystemId);

    if (!activeSystem) {
      this.element.innerHTML = `
        <h1>System View</h1>
        <h2 class="muted">No active system</h2>

        <div class="star-map-actions">
          <button class="panel-button" type="button" data-action="back-to-star-map">
            Back to Star Map
          </button>
        </div>
      `;
      requestAnimationFrame(this.updatePanelPosition);

      return;
    }

    this.element.innerHTML = `
      <h1>System View</h1>
      <h2>${escapeHtml(activeSystem.name)}</h2>

      <dl>
        <dt>ID</dt>
        <dd>${escapeHtml(activeSystem.id)}</dd>

        <dt>Status</dt>
        <dd>${activeSystem.discovered ? "discovered" : "unknown"}</dd>

        <dt>Phase</dt>
        <dd>System shell only</dd>
      </dl>

      <div class="star-map-actions">
        <button class="panel-button" type="button" data-action="back-to-star-map">
          Back to Star Map
        </button>
      </div>
    `;
  }

  findSystem(systemId) {
    return (
      this.galaxyConfig.systems.find((system) => system.id === systemId) ??
      null
    );
  }
}

function isStellarObjectSignal(signal) {
  return signal?.kind === "stellar-object" || Boolean(signal?.stellarObject?.objectId);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderConnectorSvg() {
  return `
    <svg class="star-map-connector" aria-hidden="true" focusable="false">
      <line class="star-map-connector-line" x1="0" y1="0" x2="0" y2="0" />
    </svg>
  `;
}

function formatNumber(value) {
  return Number(value).toFixed(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}