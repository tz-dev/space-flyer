import {
  DEFAULT_KEY_BINDINGS,
  normalizeDisplayConfig,
  normalizeKeyBindings,
  normalizeKeyCode,
  normalizeRenderConfig
} from "../core/configSchema.js";

import { GENERAL_RENDER_OPTIONS } from "./system-panel/controlOptions.js";
import {
  LOCAL_STORAGE_SAVE_KEY,
  buildGalaxyConfigFromSave,
  createSaveGame,
  parseSaveGameText,
  replaceGalaxyConfigContents,
  stringifySaveGame
} from "../core/saveGame.js";

const OPTION_TABS = [
  { id: "save", label: "Save / Load Config" },
  { id: "display", label: "Display" },
  { id: "camera", label: "Camera" },
  { id: "maps", label: "Map Settings" },

  { id: "ui", label: "UI & Bookmark Settings" },
  { id: "controls", label: "Controls" },
  { id: "help", label: "Help" },
  { id: "dev", label: "Dev" }
];

const SYSTEM_MAP_LIMITS = {
  gravityGridScale: { min: 0.25, max: 8, step: 0.05, digits: 2 },
  gravityGridOpacity: { min: 0, max: 1, step: 0.01, digits: 2 },
  gravityGridWeight: { min: 0, max: 4, step: 0.01, digits: 2 },
  orbitLineVisibility: { min: 0, max: 2, step: 0.05, digits: 2 }
};

const CONTROL_BINDING_LABELS = [
  ["forward", "Forward"],
  ["brake", "Brake"],
  ["strafeLeft", "Strafe Left"],
  ["strafeRight", "Strafe Right"],
  ["rollLeft", "Roll Left"],
  ["rollRight", "Roll Right"],
  ["up", "Up"],
  ["down", "Down"],
  ["modeBack", "Mode Back"]
];

export class OptionsMenu {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("aside");
    this.element.className = "options-menu";
    this.element.setAttribute("aria-hidden", "true");

    this.isOpen = false;
    this.activeTab = "display";
    this.unsubscribe = null;
    this.lastRenderKey = "";
    this.saveText = "";
    this.saveMessage = null;
    this.controlMessage = null;
    this.pendingKeyField = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handlePointerBarrier = this.handlePointerBarrier.bind(this);
    this.handleKeyCapture = this.handleKeyCapture.bind(this);
  }

  mount() {
    this.rootElement.appendChild(this.element);

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keydown", this.handleKeyCapture, true);
    this.element.addEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.addEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.addEventListener("click", this.handleClick);
    this.element.addEventListener("input", this.handleInput);
    this.element.addEventListener("change", this.handleChange);

    this.unsubscribe = this.store.subscribe(() => {
      const nextRenderKey = this.createRenderKey();

      if (nextRenderKey !== this.lastRenderKey) {
        this.render();
      }
    });

    this.applyCssVariables();
    this.render();
  }

  destroy() {
    this.unsubscribe?.();
    document.body.classList.remove("is-options-menu-open");

    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keydown", this.handleKeyCapture, true);
    this.element.removeEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.removeEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.removeEventListener("click", this.handleClick);
    this.element.removeEventListener("input", this.handleInput);
    this.element.removeEventListener("change", this.handleChange);
    this.element.remove();
  }

  handlePointerBarrier(event) {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  handleKeyDown(event) {
    if (this.pendingKeyField) {
      return;
    }

    const display = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const devKey = normalizeKeyCode(display.devToggleKey);

    if (event.code === devKey || event.key === display.devToggleKey) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      this.galaxyConfig.display = normalizeDisplayConfig({
        ...(this.galaxyConfig.display ?? {}),
        devModeEnabled: !display.devModeEnabled
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (event.code !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.toggle();
  }

  handleKeyCapture(event) {
    if (!this.pendingKeyField) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const code = normalizeKeyCode(event.code || event.key, "");
    this.finishKeyCapture(code);
  }

  finishKeyCapture(code) {
    const field = this.pendingKeyField;
    this.pendingKeyField = null;

    if (!field) {
      return;
    }

    if (!code || code === "Escape") {
      this.controlMessage = { tone: "error", message: "Esc is reserved for Options and cannot be assigned." };
      this.render();
      return;
    }

    const currentDisplay = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const currentBindings = normalizeKeyBindings(currentDisplay.keyBindings ?? DEFAULT_KEY_BINDINGS, {
      devToggleKey: currentDisplay.devToggleKey ?? "F2"
    });

    if (field === "display.devToggleKey") {
      const usedByControl = Object.values(currentBindings).includes(code);

      if (usedByControl) {
        this.controlMessage = { tone: "error", message: `${renderKeyName(code)} is already used by a control.` };
        this.render();
        return;
      }

      this.galaxyConfig.display = normalizeDisplayConfig({
        ...(this.galaxyConfig.display ?? {}),
        devToggleKey: code,
        keyBindings: currentBindings
      });
      this.controlMessage = { tone: "success", message: `Dev Toggle set to ${renderKeyName(code)}.` };
      this.applyCssVariables();
      this.store.notifyConfigChanged();
      this.render();
      return;
    }

    if (!field.startsWith("display.keyBindings.")) {
      this.controlMessage = { tone: "error", message: "Unsupported key binding target." };
      this.render();
      return;
    }

    const bindingKey = field.replace("display.keyBindings.", "");

    if (!(bindingKey in DEFAULT_KEY_BINDINGS)) {
      this.controlMessage = { tone: "error", message: "Unknown control action." };
      this.render();
      return;
    }

    if (code === currentDisplay.devToggleKey) {
      this.controlMessage = { tone: "error", message: `${renderKeyName(code)} is already used as Dev Toggle.` };
      this.render();
      return;
    }

    const duplicateAction = Object.entries(currentBindings).find(([action, keyCode]) =>
      action !== bindingKey && keyCode === code
    );

    if (duplicateAction) {
      this.controlMessage = { tone: "error", message: `${renderKeyName(code)} is already assigned.` };
      this.render();
      return;
    }

    this.galaxyConfig.display = normalizeDisplayConfig({
      ...(this.galaxyConfig.display ?? {}),
      keyBindings: {
        ...currentBindings,
        [bindingKey]: code
      }
    });
    this.controlMessage = { tone: "success", message: `${renderKeyName(code)} assigned.` };
    this.applyCssVariables();
    this.store.notifyConfigChanged();
    this.render();
  }

  handleClick(event) {
    const tabButton = event.target.closest("[data-options-tab]");

    if (tabButton) {
      event.preventDefault();
      this.activeTab = tabButton.dataset.optionsTab;
      this.render();
      return;
    }

    const actionButton = event.target.closest("[data-options-action]");

    if (actionButton?.dataset.optionsAction === "close") {
      this.close();
      return;
    }

    if (actionButton?.dataset.optionsAction === "capture-key") {
      event.preventDefault();
      this.pendingKeyField = actionButton.dataset.optionsField ?? null;
      this.controlMessage = this.pendingKeyField
        ? { tone: "neutral", message: "Press a key now…" }
        : { tone: "error", message: "No control field selected." };
      this.render();
      return;
    }

    if (actionButton?.dataset.optionsAction === "reset-controls") {
      this.pendingKeyField = null;
      this.controlMessage = { tone: "success", message: "Controls reset to defaults." };
      this.galaxyConfig.display = normalizeDisplayConfig({
        ...(this.galaxyConfig.display ?? {}),
        devToggleKey: "F2",
        keyBindings: DEFAULT_KEY_BINDINGS
      });
      this.store.notifyConfigChanged();
      this.render();
      return;
    }

    if (actionButton?.dataset.optionsAction?.startsWith("save-")) {
      event.preventDefault();
      this.performSaveAction(actionButton.dataset.optionsAction);
      return;
    }

    if (event.target === this.element) {
      this.close();
    }
  }

  handleInput(event) {
    if (event.target?.matches?.("[data-save-text]")) {
      this.saveText = event.target.value;
      return;
    }

    if (event.target?.type === "text") {
      return;
    }

    this.applyControlChange(event.target);
  }

  handleChange(event) {
    if (event.target?.matches?.("[data-save-file-input]")) {
      this.importSaveFile(event.target.files?.[0]);
      event.target.value = "";
      return;
    }

    if (event.target?.matches?.("[data-save-text]")) {
      this.saveText = event.target.value;
      return;
    }

    this.applyControlChange(event.target);
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    document.body.classList.add("is-options-menu-open");
    document.exitPointerLock?.();
    this.render();
  }

  close() {
    this.isOpen = false;
    document.body.classList.remove("is-options-menu-open");
    this.render();
  }

  createRenderKey() {
    const state = this.store.getState();
    const systemView = state.systemView ?? {};

    return JSON.stringify({
      isOpen: this.isOpen,
      activeTab: this.activeTab,
      saveMessage: this.activeTab === "save" ? this.saveMessage : null,
      saveTextLength: this.activeTab === "save" ? this.saveText.length : 0,
      controlMessage: this.activeTab === "controls" || this.activeTab === "dev" ? this.controlMessage : null,
      pendingKeyField: this.pendingKeyField,
      bookmarkMode: {
        dwellSeconds: state.bookmarkMode?.dwellSeconds
      },
      display: this.galaxyConfig.display ?? {},
      render: this.galaxyConfig.render ?? {},
      terrainView: this.galaxyConfig.terrainView ?? {},
      systemMap: {
        gravityGridEnabled: systemView.gravityGridEnabled,
        gravityGridScale: systemView.gravityGridScale,
        gravityGridOpacity: systemView.gravityGridOpacity,
        gravityGridWeight: systemView.gravityGridWeight,
        orbitLinesEnabled: systemView.orbitLinesEnabled,
        moonLinesEnabled: systemView.moonLinesEnabled,
        orbitLineVisibility: systemView.orbitLineVisibility
      }
    });
  }

  applyControlChange(control) {
    const field = control?.dataset?.optionsField;

    if (!field) {
      return;
    }

    if (field.startsWith("display.")) {
      const paramKey = field.replace("display.", "");
      const nextValue = readDisplayValue(control, paramKey, this.galaxyConfig.display?.[paramKey]);

      this.galaxyConfig.display = normalizeDisplayConfig({
        ...(this.galaxyConfig.display ?? {}),
        [paramKey]: paramKey === "devToggleKey"
          ? normalizeKeyCode(nextValue, "F2")
          : nextValue
      });
      this.applyCssVariables();
      this.store.notifyConfigChanged();
      this.render();
      return;
    }

    if (field.startsWith("render.")) {
      const paramKey = field.replace("render.", "");

      if (paramKey.startsWith("adaptiveTerrain.")) {
        const adaptiveKey = paramKey.replace("adaptiveTerrain.", "");
        const nextAdaptive = {
          ...(this.galaxyConfig.render?.adaptiveTerrain ?? {}),
          [adaptiveKey]: readAdaptiveTerrainValue(control, adaptiveKey, this.galaxyConfig.render?.adaptiveTerrain?.[adaptiveKey])
        };

        this.galaxyConfig.render = normalizeRenderConfig({
          ...(this.galaxyConfig.render ?? {}),
          adaptiveTerrain: nextAdaptive
        });
        this.store.notifyConfigChanged();
        return;
      }

      this.galaxyConfig.render = normalizeRenderConfig({
        ...(this.galaxyConfig.render ?? {}),
        [paramKey]: readNumber(control, this.galaxyConfig.render?.[paramKey] ?? 1)
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("terrainView.")) {
      const paramKey = field.replace("terrainView.", "");

      this.galaxyConfig.terrainView = {
        ...(this.galaxyConfig.terrainView ?? {}),
        [paramKey]: readNumber(control, this.galaxyConfig.terrainView?.[paramKey] ?? 12000)
      };
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("bookmarkMode.")) {
      const paramKey = field.replace("bookmarkMode.", "");

      if (paramKey === "dwellSeconds") {
        this.store.setBookmarkModeDwellSeconds?.(readNumber(control, this.store.getState().bookmarkMode?.dwellSeconds ?? 18));
      }

      return;
    }

    if (field.startsWith("systemView.")) {
      const paramKey = field.replace("systemView.", "");
      const value = readSystemViewValue(control, paramKey);

      if (value === undefined) {
        return;
      }

      this.store.setSystemViewState({
        [paramKey]: value
      });
    }
  }


  performSaveAction(action) {
    if (action === "save-export-json") {
      this.exportSaveJson();
      return;
    }

    if (action === "save-copy-text") {
      this.copySaveText();
      return;
    }

    if (action === "save-load-text") {
      this.loadSaveText(this.saveText);
      return;
    }

    if (action === "save-to-browser") {
      this.saveToBrowser();
      return;
    }

    if (action === "save-load-browser") {
      this.loadFromBrowser();
      return;
    }

    if (action === "save-clear-browser") {
      try {
        localStorage.removeItem(LOCAL_STORAGE_SAVE_KEY);
        this.setSaveMessage("Browser save cleared.", "ok");
      } catch (error) {
        this.setSaveMessage("Could not clear browser save.", "error");
      }
      return;
    }

    if (action === "save-import-json") {
      this.element.querySelector("[data-save-file-input]")?.click();
    }
  }

  createCurrentSaveText() {
    const save = createSaveGame({
      galaxyConfig: this.galaxyConfig,
      storeState: this.store.getState()
    });

    return stringifySaveGame(save);
  }

  exportSaveJson() {
    try {
      const text = this.createCurrentSaveText();
      this.saveText = text;
      downloadTextFile(text, createSaveFileName());
      this.setSaveMessage("Save JSON exported.", "ok");
    } catch (error) {
      this.setSaveMessage(error?.message ?? "Could not export save.", "error");
    }
  }

  async copySaveText() {
    try {
      const text = this.createCurrentSaveText();
      this.saveText = text;

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.setSaveMessage("Save text copied to clipboard.", "ok");
      } else {
        this.setSaveMessage("Save text generated below. Copy it manually.", "ok");
      }
    } catch (error) {
      this.setSaveMessage(error?.message ?? "Could not copy save text.", "error");
    }
  }

  saveToBrowser() {
    try {
      const text = this.createCurrentSaveText();
      this.saveText = text;
      localStorage.setItem(LOCAL_STORAGE_SAVE_KEY, text);
      this.setSaveMessage("Saved to browser storage.", "ok");
    } catch (error) {
      this.setSaveMessage(error?.message ?? "Could not save to browser storage.", "error");
    }
  }

  loadFromBrowser() {
    try {
      const text = localStorage.getItem(LOCAL_STORAGE_SAVE_KEY);

      if (!text) {
        this.setSaveMessage("No browser save found.", "error");
        return;
      }

      this.saveText = text;
      this.loadSaveText(text, { source: "browser" });
    } catch (error) {
      this.setSaveMessage(error?.message ?? "Could not load browser save.", "error");
    }
  }

  async importSaveFile(file) {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      this.saveText = text;
      this.loadSaveText(text, { source: file.name ?? "file" });
    } catch (error) {
      this.setSaveMessage(error?.message ?? "Could not import save file.", "error");
    }
  }

  loadSaveText(text, options = {}) {
    try {
      const save = parseSaveGameText(text);
      const nextGalaxyConfig = buildGalaxyConfigFromSave(save);
      replaceGalaxyConfigContents(this.galaxyConfig, nextGalaxyConfig);
      this.store.restoreProgress?.(save.progress ?? {});
      this.applyCssVariables();
      this.setSaveMessage(`Loaded save${options.source ? ` from ${options.source}` : ""}.`, "ok");
    } catch (error) {
      this.setSaveMessage(error?.message ?? "Could not load save.", "error");
    }
  }

  setSaveMessage(message, tone = "ok") {
    this.saveMessage = { message, tone };
    this.render();
  }

  applyCssVariables() {
    const display = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const uiRgb = hexToRgb(display.uiColor ?? "#7ec8ff");
    const panelOpacity = clamp(Number(display.panelOpacity ?? 0.76), 0.2, 1.0);

    document.documentElement.style.setProperty("--sf-ui-rgb", uiRgb.join(", "));
    document.documentElement.style.setProperty("--sf-ui-color", display.uiColor ?? "#7ec8ff");
    document.documentElement.style.setProperty("--sf-panel-opacity", formatNumber(panelOpacity, 2));
  }

  render() {
    const activeCard = this.element.querySelector(".options-menu-card");
    const previousScrollTop = activeCard?.scrollTop ?? 0;

    this.galaxyConfig.display = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    this.galaxyConfig.render = normalizeRenderConfig(this.galaxyConfig.render ?? {});
    this.applyCssVariables();
    this.lastRenderKey = this.createRenderKey();

    this.element.classList.toggle("is-open", this.isOpen);
    this.element.setAttribute("aria-hidden", this.isOpen ? "false" : "true");

    const display = this.galaxyConfig.display;
    const renderConfig = this.galaxyConfig.render;
    const systemView = this.store.getState().systemView ?? {};

    this.element.innerHTML = `
      <div class="options-menu-backdrop" data-options-action="close"></div>
      <div class="options-menu-card" role="dialog" aria-modal="true" aria-label="Options">
        <div class="options-menu-header">
          <div>
            <div class="options-menu-kicker">Space Flyer</div>
            <h2>Options</h2>
          </div>
          <button class="options-menu-close" type="button" data-options-action="close" aria-label="Close options">×</button>
        </div>

        <div class="options-tabs" role="tablist" aria-label="Options sections">
          ${OPTION_TABS.map((tab) => renderTab(tab, this.activeTab)).join("")}
        </div>

        <div class="options-tab-body">
          ${this.renderActiveTab(display, renderConfig, systemView)}
        </div>

        <p class="options-menu-note">Esc toggles this menu. Dev Mode can be toggled with the configured Dev key.</p>
      </div>
    `;

    const nextCard = this.element.querySelector(".options-menu-card");

    if (nextCard && this.isOpen) {
      nextCard.scrollTop = previousScrollTop;
    }
  }

  renderActiveTab(display, renderConfig, systemView) {
    if (this.activeTab === "camera") {
      return renderCameraTab(display);
    }

    if (this.activeTab === "maps") {
      return renderMapSettingsTab(display, systemView);
    }

    if (this.activeTab === "ui") {
      return renderUiTab(display, this.store.getState().bookmarkMode ?? {});
    }

    if (this.activeTab === "controls") {
      return renderControlsTab(display, this.pendingKeyField, this.controlMessage);
    }

    if (this.activeTab === "save") {
      return renderSaveTab(this.saveText, this.saveMessage);
    }

    if (this.activeTab === "help") {
      return renderHelpTab();
    }

    if (this.activeTab === "dev") {
      return renderDevTab(display, this.pendingKeyField, this.controlMessage);
    }

    return renderDisplayTab(display, renderConfig, this.galaxyConfig.terrainView ?? {});
  }
}

function renderDisplayTab(display, renderConfig, terrainViewConfig = {}) {
  return `
    <section class="options-section is-active">
      <h3>Display</h3>
      ${renderSlider("display.canvasSizeScale", "Terrain View Size", display.canvasSizeScale ?? 1, 0.35, 1, 0.01, 2)}
      ${renderSlider("terrainView.maxRenderDistance", "Terrain Max Render Distance", terrainViewConfig.maxRenderDistance ?? 12000, 5000, 15000, 100, 0)}
      ${renderRenderControls(renderConfig)}
      ${renderAdaptiveTerrainControls(renderConfig.adaptiveTerrain ?? {})}
      ${renderCheckbox("display.showFps", "Show FPS", display.showFps)}
    </section>
  `;
}

function renderCameraTab(display) {
  return `
    <section class="options-section is-active">
      <h3>Camera</h3>
      ${renderCheckbox("display.idleCamsEnabled", "Enable Idle Cams", display.idleCamsEnabled)}
      ${renderSlider("display.idleStartSeconds", "Start to Idle", display.idleStartSeconds ?? display.idleDelaySeconds, 1, 60, 1, 0)}
      ${renderSlider("display.idleDurationSeconds", "Idle Time", display.idleDurationSeconds ?? display.idleDelaySeconds, 1, 60, 1, 0)}
      <div class="options-subheading">Scroll Speed</div>
      ${renderSlider("display.starMapScrollSpeed", "Star Map", display.starMapScrollSpeed ?? 1, 0.1, 4, 0.05, 2)}
      ${renderSlider("display.systemMapScrollSpeed", "System Map", display.systemMapScrollSpeed ?? 1, 0.1, 4, 0.05, 2)}
      ${renderSlider("display.orbitScrollSpeed", "Orbit View", display.orbitScrollSpeed ?? 1, 0.1, 4, 0.05, 2)}
      <div class="options-subheading">Rotation</div>
      ${renderCheckbox("display.starMapRotationInertia", "Star Map Rotation Inertia", display.starMapRotationInertia)}
      ${renderCheckbox("display.systemMapRotationInertia", "System Map Rotation Inertia", display.systemMapRotationInertia)}
      <div class="options-subheading">Idle Modes</div>
      ${renderCheckbox("display.starMapIdleAutoSelect", "Star Map Auto Select", display.starMapIdleAutoSelect)}
      ${renderCheckbox("display.systemMapIdleAutoOrbit", "System Map Auto Orbit", display.systemMapIdleAutoOrbit)}
      ${renderCheckbox("display.orbitIdleCamera", "Orbit View Idle Camera", display.orbitIdleCamera)}
    </section>
  `;
}

function renderMapSettingsTab(display, systemView) {
  return `
    <section class="options-section is-active">
      <h3>Map Settings</h3>
      ${renderColor("display.mapColor", "Base Map Color", display.mapColor ?? "#7ec8ff")}
      <div class="options-subheading">Star Map</div>
      ${renderCheckbox("display.sectorGridEnabled", "Sector Grid", display.sectorGridEnabled)}
      ${renderSlider("display.sectorGridOpacity", "Sector Grid Opacity", display.sectorGridOpacity ?? 0.10, 0, 0.6, 0.01, 2)}
      ${renderSlider("display.sectorHoverStrength", "Sector Hover Strength", display.sectorHoverStrength ?? 0.28, 0, 1, 0.01, 2)}
      ${renderSlider("display.sectorActiveStrength", "Sector Active Strength", display.sectorActiveStrength ?? 0.62, 0, 1.5, 0.01, 2)}
      <div class="options-subheading">System Map</div>
      ${renderCheckbox("systemView.gravityGridEnabled", "Gravity Grid", systemView.gravityGridEnabled ?? true)}
      ${renderSlider("systemView.gravityGridScale", "Grid Scale", systemView.gravityGridScale ?? 3, 0.25, 8, 0.05, 2)}
      ${renderSlider("systemView.gravityGridOpacity", "Grid Opacity", systemView.gravityGridOpacity ?? 0.26, 0, 1, 0.01, 2)}
      ${renderSlider("systemView.gravityGridWeight", "Grav Weight", systemView.gravityGridWeight ?? 0.095, 0, 4, 0.01, 2)}
      ${renderCheckbox("systemView.orbitLinesEnabled", "Orbital Lines", systemView.orbitLinesEnabled ?? true)}
      ${renderCheckbox("systemView.moonLinesEnabled", "Moon Lines", systemView.moonLinesEnabled ?? true)}
      ${renderSlider("systemView.orbitLineVisibility", "Line Visibility", systemView.orbitLineVisibility ?? 1, 0, 2, 0.05, 2)}
    </section>
  `;
}

function renderUiTab(display, bookmarkMode = {}) {
  const dwellSeconds = Math.max(5, Math.min(120, Number(bookmarkMode?.dwellSeconds ?? 18)));

  return `
    <section class="options-section is-active">
      <h3>UI & Bookmark Settings</h3>
      ${renderColor("display.uiColor", "Base UI Color", display.uiColor ?? "#7ec8ff")}
      ${renderSlider("display.panelOpacity", "Panel Transparency", display.panelOpacity ?? 0.76, 0.2, 1, 0.01, 2)}
      ${renderColor("display.markerColor", "Marker Color", display.markerColor ?? "#ffd37a")}
      ${renderSlider("display.markerOpacity", "Marker Opacity", display.markerOpacity ?? 0.82, 0, 1, 0.01, 2)}
      ${renderSlider("display.markerGlow", "Marker Glow", display.markerGlow ?? 1, 0, 3, 0.05, 2)}
      <div class="options-subheading">Bookmark Mode</div>
      ${renderSlider("bookmarkMode.dwellSeconds", "Ambient View Time", dwellSeconds, 5, 120, 1, 0)}
      <p class="options-menu-note">Ambient View Time controls how long each terrain bookmark stays visible before the next ambient bookmark fades in.</p>
    </section>
  `;
}

function renderControlsTab(display, pendingKeyField = null, controlMessage = null) {
  const bindings = normalizeKeyBindings(display.keyBindings ?? DEFAULT_KEY_BINDINGS, {
    devToggleKey: display.devToggleKey ?? "F2"
  });

  return `
    <section class="options-section is-active">
      <h3>Controls</h3>
      <p class="options-menu-note">Esc is reserved for the Options menu. Click Set Key, then press the desired key. Duplicate keys are rejected.</p>
      ${CONTROL_BINDING_LABELS.map(([key, label]) => renderKeyCaptureButton(
        `display.keyBindings.${key}`,
        label,
        bindings[key] ?? DEFAULT_KEY_BINDINGS[key],
        pendingKeyField
      )).join("")}
      ${controlMessage ? `<p class="options-save-message is-${escapeHtml(controlMessage.tone)}">${escapeHtml(controlMessage.message)}</p>` : ""}
      <button class="panel-button options-reset-button" type="button" data-options-action="reset-controls">Back to Default Controls</button>
    </section>
  `;
}


function renderSaveTab(saveText = "", saveMessage = null) {
  return `
    <section class="options-section is-active">
      <h3>Save / Load</h3>
      <p class="options-menu-note">Hybrid save: the galaxy map stays fixed, visited/edited/bookmarked systems are stored as snapshots, and unknown systems are rebuilt from their saved seeds.</p>
      <div class="options-save-actions">
        <button class="panel-button" type="button" data-options-action="save-export-json">Export Save JSON</button>
        <button class="panel-button" type="button" data-options-action="save-import-json">Import Save JSON</button>
        <button class="panel-button" type="button" data-options-action="save-copy-text">Copy Save Text</button>
        <button class="panel-button" type="button" data-options-action="save-load-text">Load Save Text</button>
        <button class="panel-button" type="button" data-options-action="save-to-browser">Save to Browser</button>
        <button class="panel-button" type="button" data-options-action="save-load-browser">Load from Browser</button>
        <button class="panel-button" type="button" data-options-action="save-clear-browser">Clear Browser Save</button>
      </div>
      <input type="file" accept="application/json,.json" data-save-file-input hidden />
      <textarea
        class="options-save-textarea"
        data-save-text
        spellcheck="false"
        placeholder="Paste save JSON here, or generate one with Copy Save Text."
      >${escapeHtml(saveText)}</textarea>
      ${saveMessage ? `<p class="options-save-message is-${escapeHtml(saveMessage.tone)}">${escapeHtml(saveMessage.message)}</p>` : ""}
    </section>
  `;
}

function renderHelpTab() {
  return `
    <section class="options-section is-active">
      <h3>Help / Default Controls</h3>

      <div class="options-help-block">
        <div class="options-subheading">Global</div>
        ${renderHelpRow("Esc", "Open / close Options. Esc is always reserved and cannot be rebound.")}
        ${renderHelpRow("F2", "Toggle Dev / Config Menu by default. The Dev key can be changed in the Dev tab.")}
      </div>

      <div class="options-help-block">
        <div class="options-subheading">Star Map</div>
        ${renderHelpRow("Left Drag", "Rotate / pan the star map.")}
        ${renderHelpRow("Mouse Wheel", "Zoom star map.")}
        ${renderHelpRow("Click System / Signal", "Select target.")}
        ${renderHelpRow("Return to System", "Open the selected system view.")}
      </div>

      <div class="options-help-block">
        <div class="options-subheading">System / Orbit View</div>
        ${renderHelpRow("Left Drag", "Rotate the system or orbit camera.")}
        ${renderHelpRow("Mouse Wheel", "Zoom in / out.")}
        ${renderHelpRow("Click Planet / Moon", "Select body or focus orbit view.")}
        ${renderHelpRow("Tab", "Default mode/back key: Orbit → System Map, System Map → Star Map.")}
      </div>

      <div class="options-help-block">
        <div class="options-subheading">Terrain View / Flight</div>
        ${renderHelpRow("Left Click", "Lock pointer and enable mouse flight controls.")}
        ${renderHelpRow("Mouse Move", "Steer / aim while pointer is locked.")}
        ${renderHelpRow("W / S", "Increase / decrease target speed.")}
        ${renderHelpRow("Mouse Wheel", "Fine-adjust target speed.")}
        ${renderHelpRow("A / D", "Strafe left / right.")}
        ${renderHelpRow("Q / E", "Roll left / right.")}
        ${renderHelpRow("Space / C", "Move up / down.")}
        ${renderHelpRow("Shift", "Boost.")}
        ${renderHelpRow("R", "Reset flight position.")}
        ${renderHelpRow("X", "Level roll.")}
        ${renderHelpRow("Tab", "Default mode/back key: return to System View.")}
      </div>

      <div class="options-help-block">
        <div class="options-subheading">Stellar Object View</div>
        ${renderHelpRow("Left Drag", "Rotate object view when supported.")}
        ${renderHelpRow("Mouse Wheel", "Zoom stellar object view.")}
        ${renderHelpRow("Tab", "Default mode/back key: return to Star Map.")}
      </div>
    </section>
  `;
}

function renderDevTab(display, pendingKeyField = null, controlMessage = null) {
  return `
    <section class="options-section is-active">
      <h3>Dev</h3>
      ${renderCheckbox("display.devModeEnabled", "Dev Mode / Config Menu", display.devModeEnabled)}
      ${renderKeyCaptureButton("display.devToggleKey", "Dev Toggle Key", display.devToggleKey ?? "F2", pendingKeyField)}
      ${controlMessage ? `<p class="options-save-message is-${escapeHtml(controlMessage.tone)}">${escapeHtml(controlMessage.message)}</p>` : ""}
    </section>
  `;
}

function renderRenderControls(renderConfig) {
  return GENERAL_RENDER_OPTIONS.map((param) => renderSlider(
    `render.${param.key}`,
    param.label,
    renderConfig?.[param.key] ?? 1,
    param.min,
    param.max,
    param.step,
    param.digits
  )).join("");
}

function renderAdaptiveTerrainControls(config = {}) {
  return `
    <div class="options-subheading">Adaptive Terrain Performance</div>
    ${renderCheckbox("render.adaptiveTerrain.enabled", "Target Min FPS", config.enabled)}
    ${renderSlider("render.adaptiveTerrain.targetFps", "Target FPS", config.targetFps ?? 45, 15, 240, 1, 0)}
    ${renderSlider("render.adaptiveTerrain.updateEveryFrames", "Update Every Frames", config.updateEveryFrames ?? 5, 1, 60, 1, 0)}
    ${renderSlider("render.adaptiveTerrain.renderScaleMin", "Terrain Scale Min", config.renderScaleMin ?? 0.45, 0.25, 1.5, 0.01, 2)}
    ${renderSlider("render.adaptiveTerrain.renderScaleMax", "Terrain Scale Max", config.renderScaleMax ?? 1.0, 0.25, 1.5, 0.01, 2)}
    ${renderCheckbox("render.adaptiveTerrain.pixelationEnabled", "Adaptive Pixelation", config.pixelationEnabled)}
    ${renderSlider("render.adaptiveTerrain.pixelationMin", "Pixelation Min", config.pixelationMin ?? 1.0, 1, 12, 0.1, 1)}
    ${renderSlider("render.adaptiveTerrain.pixelationMax", "Pixelation Max", config.pixelationMax ?? 3.0, 1, 12, 0.1, 1)}
    <p class="options-menu-note">Adaptive scaling affects only Terrain View. Canvas size and Star/System/Stellar views stay fixed.</p>
  `;
}

function renderKeyCaptureButton(field, label, code, pendingKeyField = null) {
  const pending = pendingKeyField === field;

  return `
    <div class="options-row options-key-row">
      <span>${escapeHtml(label)}</span>
      <span class="options-key-chip${pending ? " is-pending" : ""}">${escapeHtml(pending ? "Press key…" : renderKeyName(code))}</span>
      <button
        class="panel-button options-key-set-button"
        type="button"
        data-options-action="capture-key"
        data-options-field="${escapeHtml(field)}"
      >${pending ? "Listening…" : "Set Key"}</button>
    </div>
  `;
}

function renderHelpRow(input, description) {
  return `
    <div class="options-help-row">
      <div class="options-help-key">${escapeHtml(input)}</div>
      <div class="options-help-text">${escapeHtml(description)}</div>
    </div>
  `;
}

function renderSlider(field, label, value, min, max, step, digits) {
  const inputId = `options_${field.replaceAll(".", "_")}`;
  const formatted = formatNumber(value, digits);

  return `
    <div class="options-row">
      <label for="${escapeHtml(inputId)}">${escapeHtml(label)}</label>
      <input
        id="${escapeHtml(inputId)}"
        data-options-field="${escapeHtml(field)}"
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${escapeHtml(formatted)}"
      />
      <input
        class="options-number-input"
        data-options-field="${escapeHtml(field)}"
        type="number"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${escapeHtml(formatted)}"
      />
    </div>
  `;
}

function renderCheckbox(field, label, checked) {
  return `
    <label class="options-check-row">
      <input
        data-options-field="${escapeHtml(field)}"
        type="checkbox"
        ${checked ? "checked" : ""}
      />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderColor(field, label, value) {
  const inputId = `options_${field.replaceAll(".", "_")}`;

  return `
    <div class="options-row options-row-color">
      <label for="${escapeHtml(inputId)}">${escapeHtml(label)}</label>
      <input
        id="${escapeHtml(inputId)}"
        class="options-color-input"
        data-options-field="${escapeHtml(field)}"
        type="color"
        value="${escapeHtml(value)}"
      />
    </div>
  `;
}

function renderTab(tab, activeTab) {
  return `
    <button
      class="options-tab${tab.id === activeTab ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${tab.id === activeTab ? "true" : "false"}"
      data-options-tab="${escapeHtml(tab.id)}"
    >${escapeHtml(tab.label)}</button>
  `;
}

function readDisplayValue(control, paramKey, fallback) {
  if (control.type === "checkbox") {
    return Boolean(control.checked);
  }

  if (control.type === "color" || control.type === "text") {
    return control.value;
  }

  return readNumber(control, fallback ?? 1);
}

function readAdaptiveTerrainValue(control, paramKey, fallback) {
  if (paramKey === "enabled" || paramKey === "pixelationEnabled") {
    return Boolean(control.checked);
  }

  return readNumber(control, fallback ?? 1);
}

function readSystemViewValue(control, paramKey) {
  if (
    paramKey === "gravityGridEnabled" ||
    paramKey === "orbitLinesEnabled" ||
    paramKey === "moonLinesEnabled"
  ) {
    return Boolean(control.checked);
  }

  const limits = SYSTEM_MAP_LIMITS[paramKey];

  if (!limits) {
    return undefined;
  }

  return clamp(readNumber(control, 0), limits.min, limits.max);
}

function readNumber(control, fallback) {
  const value = Number(control.value);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

function formatNumber(value, digits) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toFixed(digits);
}

function renderKeyName(code) {
  const value = String(code ?? "").trim();

  if (/^Key[A-Z]$/i.test(value)) {
    return value.slice(-1).toUpperCase();
  }

  if (/^Digit\d$/i.test(value) || /^Numpad\d$/i.test(value)) {
    return value.slice(-1);
  }

  if (value === "Space") return "Space";
  if (value === "Tab") return "Tab";
  if (value === "Escape") return "Esc";

  return value || "";
}


function downloadTextFile(text, fileName) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createSaveFileName() {
  const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  return `space-flyer-save-${stamp}.json`;
}

function hexToRgb(value) {
  const fallback = [126, 200, 255];

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().replace(/^#/, "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
