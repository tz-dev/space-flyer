import {
  ensureStellarSettings,
  getDefaultStellarObjectId,
  getStellarObjectParamDefinitions,
  resolveStellarObjectConfig,
  STELLAR_OBJECT_LABELS
} from "../core/stellarObjects.js";

export class StellarObjectDevPanel {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("aside");
    this.element.className = "stellar-object-dev-panel";

    this.unsubscribe = null;
    this.lastRenderKey = "";
    this.handleInput = this.handleInput.bind(this);
    this.handleClick = this.handleClick.bind(this);
  }

  mount() {
    this.rootElement.appendChild(this.element);
    this.element.addEventListener("input", this.handleInput);
    this.element.addEventListener("change", this.handleInput);
    this.element.addEventListener("click", this.handleClick);

    this.unsubscribe = this.store.subscribe(() => {
      const nextRenderKey = this.createRenderKey();

      if (nextRenderKey !== this.lastRenderKey) {
        this.render();
      }
    });

    this.render();
  }

  destroy() {
    this.unsubscribe?.();
    this.element.removeEventListener("input", this.handleInput);
    this.element.removeEventListener("change", this.handleInput);
    this.element.removeEventListener("click", this.handleClick);
    this.element.remove();
  }

  createRenderKey() {
    const state = this.store.getState();
    const display = this.galaxyConfig.display ?? {};

    return JSON.stringify({
      activeView: state.activeView,
      activeObjectId: state.stellarObjectView?.activeObjectId ?? "",
      configRevision: state.configRevision ?? 0,
      devModeEnabled: display.devModeEnabled !== false
    });
  }

  handleInput(event) {
    const target = event.target;

    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    const settings = ensureStellarSettings(this.galaxyConfig);
    const spaceField = target.dataset.stellarSpaceField;

    if (spaceField === "spaceShaderId") {
      settings.spaceShaderId = "star-nest";
      this.store.notifyConfigChanged?.();
      this.render();
      return;
    }

    const objectId = this.getActiveObjectId();
    const labelField = target.dataset.stellarParamLabel;

    if (labelField) {
      settings.paramNames ??= {};
      settings.paramNames[objectId] ??= {};
      settings.paramNames[objectId][labelField] = String(target.value ?? "").trim().slice(0, 32);
      this.store.notifyConfigChanged?.();
      return;
    }

    const objectField = target.dataset.stellarObjectField;

    if (!objectField) {
      return;
    }

    settings.objectParams[objectId] ??= {};
    settings.objectParams[objectId][objectField] = Number(target.value);
    this.store.notifyConfigChanged?.();
    this.syncReadout(objectField, target.value);
  }

  handleClick(event) {
    const button = event.target.closest("[data-stellar-action]");

    if (!button) {
      return;
    }

    if (button.dataset.stellarAction === "reset-object") {
      const settings = ensureStellarSettings(this.galaxyConfig);
      delete settings.objectParams[this.getActiveObjectId()];
      this.store.notifyConfigChanged?.();
      this.render();
    }
  }

  render() {
    const state = this.store.getState();
    const display = this.galaxyConfig.display ?? {};

    if (state.activeView !== "stellar-object-view" || display.devModeEnabled === false) {
      this.hide();
      return;
    }

    const objectId = this.getActiveObjectId();
    const label = STELLAR_OBJECT_LABELS[objectId] ?? objectId;
    const settings = ensureStellarSettings(this.galaxyConfig);
    const params = resolveStellarObjectConfig(settings, objectId);
    const definitions = getStellarObjectParamDefinitions(settings, objectId);

    this.lastRenderKey = this.createRenderKey();
    this.element.classList.add("is-visible");
    this.element.innerHTML = `
      <div class="stellar-object-dev-card">
        <div class="stellar-object-dev-kicker">Stellar Object Dev</div>
        <h2>${escapeHtml(label)}</h2>

        <div class="stellar-object-dev-row">
          <span>Space Shader</span>
          <span class="stellar-object-dev-static">Star Nest / Gradient Mix</span>
        </div>

        <div class="stellar-object-dev-controls">
          ${definitions.map((definition) => renderControl(definition, params[definition.key])).join("")}
        </div>

        <button class="panel-button stellar-object-dev-reset" type="button" data-stellar-action="reset-object">
          Reset object params
        </button>
      </div>
    `;
  }

  hide() {
    this.lastRenderKey = this.createRenderKey();
    this.element.classList.remove("is-visible");
    this.element.innerHTML = "";
  }

  syncReadout(field, value) {
    const output = this.element.querySelector(`[data-stellar-readout="${field}"]`);

    if (output) {
      output.textContent = formatValue(Number(value));
    }
  }

  getActiveObjectId() {
    return this.store.getState().stellarObjectView.activeObjectId ?? getDefaultStellarObjectId();
  }
}

function renderControl(definition, value) {
  const formatted = formatValue(value);

  return `
    <label class="stellar-object-dev-control">
      <span class="stellar-object-dev-label">
        <input
          class="stellar-object-dev-name-input"
          type="text"
          maxlength="32"
          value="${escapeHtml(definition.label)}"
          title="JSON param name"
          data-stellar-param-label="${escapeHtml(definition.key)}"
        />
      </span>
      <span class="stellar-object-dev-value" data-stellar-readout="${escapeHtml(definition.key)}">${escapeHtml(formatted)}</span>
      <input
        type="range"
        min="${definition.min}"
        max="${definition.max}"
        step="${definition.step}"
        value="${escapeHtml(value)}"
        data-stellar-object-field="${escapeHtml(definition.key)}"
      />
    </label>
  `;
}
function formatValue(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
