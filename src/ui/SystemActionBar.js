const SYSTEM_VIEW_CONTROL_LIMITS = {
  gravityGridScale: { min: 0.25, max: 8, digits: 2 },
  gravityGridOpacity: { min: 0, max: 1, digits: 2 },
  gravityGridWeight: { min: 0, max: 4, digits: 2 },
  orbitLineVisibility: { min: 0, max: 2, digits: 2 }
};

export class SystemActionBar {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("div");
    this.element.className = "system-action-bar";

    this.unsubscribe = null;
    this.isControlsCollapsed = true;
    this.lastRenderedActiveView = null;

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
  }

  handleClick(event) {
    if (event.target.closest("button,input,label")) {
      notifySystemInteraction();
    }

    const button = event.target.closest("[data-system-action]");

    if (!button) {
      return;
    }

    const action = button.dataset.systemAction;
    const { systemView } = this.store.getState();

    if (action === "toggle-controls") {
      this.isControlsCollapsed = !this.isControlsCollapsed;
      this.render();
      return;
    }

    if (action === "enter-orbit-view") {
      this.store.enterOrbitView(systemView.selectedBodyId);
      return;
    }

    if (action === "exit-orbit-view") {
      this.store.requestOrbitReturn();
      return;
    }

    if (action === "return-to-star-map") {
      this.store.returnToStarMap();
      return;
    }

    if (action === "return-to-system-view") {
      this.store.returnToSystemView();
    }
  }

  handleInput(event) {
    const speedControl = event.target.closest("[data-system-speed-control]");

    if (speedControl) {
      const value = clamp(Number(speedControl.value), -10, 10);

      if (!Number.isFinite(value)) {
        return;
      }

      notifySystemInteraction();

      this.store.setSystemViewState({
        systemSpeed: value
      });
      return;
    }

    const control = event.target.closest("[data-system-view-control]");

    if (!control) {
      return;
    }

    const field = control.dataset.systemViewControl;
    const nextValue = readSystemViewControl(control, field);

    if (nextValue === undefined) {
      return;
    }

    notifySystemInteraction();

    if (field === "orbitLinesAllEnabled") {
      this.store.setSystemViewState({
        orbitLinesEnabled: nextValue,
        moonLinesEnabled: nextValue
      });
      return;
    }

    this.store.setSystemViewState({
      [field]: nextValue
    });
  }

  render() {
    const state = this.store.getState();
    const { activeView, systemView } = state;

    if (activeView !== "system-view") {
      this.lastRenderedActiveView = activeView;
      this.element.innerHTML = "";
      this.element.classList.remove("is-visible");
      return;
    }

    if (this.lastRenderedActiveView !== "system-view") {
      this.isControlsCollapsed = true;
    }

    this.lastRenderedActiveView = activeView;

    const actionMarkup = this.renderActionMarkup(systemView);

    this.element.classList.add("is-visible");
    this.element.innerHTML = `
      <div class="system-action-bar-stack ${this.isControlsCollapsed ? "is-controls-collapsed" : ""}">
        ${actionMarkup}
        ${this.renderControlsMarkup(systemView)}
      </div>
    `;
  }

  renderActionMarkup(systemView) {
    if (systemView.mode === "orbit") {
      return `
        <div class="system-action-bar-card system-action-bar-card-button-row">
          <button
            class="panel-button system-action-button"
            type="button"
            data-system-action="exit-orbit-view"
          >
            Back to System Map
          </button>
        </div>
      `;
    }

    return `
      <div class="system-action-bar-card system-action-bar-card-button-row">
        <button
          class="panel-button system-action-button"
          type="button"
          data-system-action="return-to-star-map"
        >
          Back to Star Map
        </button>
        ${systemView.selectedBodyId ? `
          <button
            class="panel-button system-action-button"
            type="button"
            data-system-action="enter-orbit-view"
          >
            Orbit View
          </button>
        ` : ""}
      </div>
    `;
  }

  renderControlsMarkup(systemView) {
    if (this.isControlsCollapsed) {
      return `
        <button
          class="system-controls-collapsed-button"
          type="button"
          data-system-action="toggle-controls"
          aria-label="Expand system controls"
        >
          System Controls ▲
        </button>
      `;
    }

    return `
      <div class="system-action-bar-card system-action-bar-card-controls system-action-bar-card-speed-only">
        <div class="system-action-controls-content">
          ${this.renderSpeedControl(systemView)}
          ${this.renderPlanetMarkerControls(systemView)}
        </div>
        <button
          class="system-controls-collapse-button"
          type="button"
          data-system-action="toggle-controls"
          aria-label="Collapse system controls"
        >
          Controls ▼
        </button>
      </div>
    `;
  }

  renderSpeedControl(systemView) {
    const value = clamp(Number(systemView.systemSpeed ?? 1), -10, 10);
    const formatted = formatNumber(value, 1);

    return `
      <div class="system-action-row is-top-row is-speed-only">
        <label class="system-speed-control">
          <span class="system-speed-label">System Speed</span>
          <input
            class="system-speed-slider"
            type="range"
            min="-10"
            max="10"
            step="0.1"
            value="${escapeHtml(formatted)}"
            data-system-speed-control="slider"
          >
          <input
            class="system-speed-number"
            type="number"
            min="-10"
            max="10"
            step="0.1"
            value="${escapeHtml(formatted)}"
            data-system-speed-control="number"
            aria-label="System speed"
          >
        </label>
      </div>
    `;
  }

  renderPlanetMarkerControls(systemView) {
    const orbitLinesAllEnabled =
      Boolean(systemView.orbitLinesEnabled ?? true) &&
      Boolean(systemView.moonLinesEnabled ?? true);

    return `
      <div class="system-action-row is-marker-row">
        ${renderCheckbox("gravityGridEnabled", "Gravity Grid", systemView.gravityGridEnabled)}
        ${renderCheckbox("orbitLinesAllEnabled", "Orbital Lines", orbitLinesAllEnabled)}
        ${renderCheckbox("planetGridEnabled", "Planet Grid", systemView.planetGridEnabled)}
        ${renderCheckbox("inclinationMarkersEnabled", "Inclination", systemView.inclinationMarkersEnabled)}
        ${renderCheckbox("equatorMarkersEnabled", "Equator", systemView.equatorMarkersEnabled)}
      </div>
    `;
  }
}

function renderCheckbox(field, label, checked) {
  return `
    <label class="system-action-checkbox">
      <input
        type="checkbox"
        data-system-view-control="${escapeHtml(field)}"
        ${checked ? "checked" : ""}
      >
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderMiniSlider(field, label, value, min, max, step, digits, modifierClass = "") {
  const formatted = formatNumber(value, digits);
  const className = `system-action-slider ${modifierClass}`.trim();

  return `
    <label class="${escapeHtml(className)}">
      <span class="system-control-label">${escapeHtml(label)}</span>
      <input
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${escapeHtml(formatted)}"
        data-system-view-control="${escapeHtml(field)}"
      >
      <input
        class="system-number-input"
        type="number"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${escapeHtml(formatted)}"
        data-system-view-control="${escapeHtml(field)}"
        aria-label="${escapeHtml(label)}"
      >
    </label>
  `;
}

function readSystemViewControl(control, field) {
  if (
    field === "gravityGridEnabled" ||
    field === "orbitLinesEnabled" ||
    field === "moonLinesEnabled" ||
    field === "orbitLinesAllEnabled" ||
    field === "planetGridEnabled" ||
    field === "inclinationMarkersEnabled" ||
    field === "equatorMarkersEnabled"
  ) {
    return Boolean(control.checked);
  }

  const limits = SYSTEM_VIEW_CONTROL_LIMITS[field];

  if (!limits) {
    return undefined;
  }

  const value = Number(control.value);

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return clamp(value, limits.min, limits.max);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function formatNumber(value, digits = 2) {
  return Number(value)
    .toFixed(digits)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function notifySystemInteraction() {
  window.dispatchEvent(new CustomEvent("space-flyer-system-input"));
}
