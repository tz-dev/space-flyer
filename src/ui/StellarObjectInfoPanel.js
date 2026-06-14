import {
  createStarMapSectorBounds,
  formatStarMapSectorId,
  getStarMapSectorForPosition
} from "../core/starMapSectors.js";
import {
  ensureStellarSettings,
  getDefaultStellarObjectId,
  getStellarObjectParamDefinitions,
  resolveStellarObjectConfig,
  STELLAR_OBJECT_LABELS
} from "../core/stellarObjects.js";

export class StellarObjectInfoPanel {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("aside");
    this.element.className = "stellar-object-info-panel";
    this.sectorBounds = createStarMapSectorBounds(galaxyConfig.systems ?? []);

    this.unsubscribe = null;
    this.isCollapsed = false;
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
    const button = event.target.closest("[data-stellar-info-action='toggle-collapse']");

    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.isCollapsed = !this.isCollapsed;
    this.render();
  }

  render() {
    const state = this.store.getState();

    if (state.activeView !== "stellar-object-view") {
      this.hide();
      return;
    }

    const info = this.createInfo(state);

    if (!info) {
      this.hide();
      return;
    }

    this.element.classList.add("is-visible");
    this.element.classList.toggle("is-collapsed", this.isCollapsed);
    this.element.innerHTML = this.renderInfo(info);
  }

  hide() {
    this.element.classList.remove("is-visible");
    this.element.innerHTML = "";
  }

  createInfo(state) {
    const activeObjectId = state.stellarObjectView?.activeObjectId ?? getDefaultStellarObjectId();
    const signalId = state.stellarObjectView?.activeSignalId ?? null;
    const signal = signalId
      ? this.galaxyConfig.systems?.find((candidate) => candidate.id === signalId) ?? null
      : null;
    const objectId = signal?.stellarObject?.objectId ?? activeObjectId;
    const settings = ensureStellarSettings(this.galaxyConfig);
    const objectParams = signal?.stellarObject?.objectParams ?? null;
    const config = resolveStellarObjectConfig(settings, objectId, objectParams);
    const definitions = getStellarObjectParamDefinitions(settings, objectId);
    const label = STELLAR_OBJECT_LABELS[objectId] ?? "Stellar Object";
    const sector = signal?.position
      ? formatStarMapSectorId(getStarMapSectorForPosition(signal.position, this.sectorBounds))
      : "runtime object";
    const visited = signalId && Array.isArray(state.starLog?.visitedSystemIds)
      ? state.starLog.visitedSystemIds.includes(signalId)
      : false;

    return {
      title: signal?.name ?? label,
      kind: "Stellar Object",
      rows: compactRows([
        ["ID", signal?.id ?? objectId],
        ["Name", signal?.name ?? label],
        ["Object Type", label],
        ["Sector", sector],
        ["Status", signal?.discovered ? "charted anomaly" : visited ? "visited anomaly" : "runtime object"],
        ["Seed", signal?.seed],
        ["Position", signal?.position ? formatVector(signal.position) : null],
        ...definitions.map((definition) => [definition.label, config[definition.key]])
      ])
    };
  }

  renderInfo(info) {
    const body = this.isCollapsed
      ? ""
      : `
        <h2>${escapeHtml(info.title)}</h2>
        <dl>
          ${info.rows.map(([label, value]) => `
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          `).join("")}
        </dl>
      `;

    return `
      <div class="stellar-object-info-panel-card${this.isCollapsed ? " is-collapsed" : ""}">
        <div class="stellar-object-info-panel-header">
          <div class="stellar-object-info-panel-kicker">Selected ${escapeHtml(info.kind)}</div>
          <button
            class="stellar-object-info-collapse-button"
            type="button"
            data-stellar-info-action="toggle-collapse"
            aria-expanded="${this.isCollapsed ? "false" : "true"}"
            aria-label="${this.isCollapsed ? "Expand stellar object info" : "Collapse stellar object info"}"
            title="${this.isCollapsed ? "Expand" : "Collapse"}"
          >${this.isCollapsed ? "+" : "–"}</button>
        </div>
        ${body}
      </div>
    `;
  }
}

function compactRows(rows) {
  return rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => [label, formatValue(value)]);
}

function formatVector(position) {
  return position
    .slice(0, 3)
    .map((value) => formatValue(Number(value)))
    .join(", ");
}

function formatValue(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "—";
    }

    const abs = Math.abs(value);

    if (abs > 0 && abs < 0.001) {
      return value.toExponential(2);
    }

    if (abs < 1) {
      return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    }

    if (abs < 100) {
      return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }

    return Math.round(value).toString();
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
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
