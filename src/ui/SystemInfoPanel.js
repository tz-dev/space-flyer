const SYSTEM_VIEW_SCALE = {
  planetRadius: 880,
  minPlanetRadius: 1.2
};

const MAX_PLANET_MOONS = 10;

export class SystemInfoPanel {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("aside");
    this.element.className = "system-info-panel";

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
    const button = event.target.closest("[data-system-info-action='toggle-collapse']");

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

    if (state.activeView !== "system-view") {
      this.hide();
      return;
    }

    const selectedBodyId = state.systemView.selectedBodyId ?? state.systemView.orbitTargetId;

    if (!selectedBodyId) {
      this.hide();
      return;
    }

    const system = this.getActiveSystem(state.systemView.activeSystemId);

    if (!system) {
      this.hide();
      return;
    }

    const info = this.getBodyInfo(system, selectedBodyId);

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

  getActiveSystem(systemId) {
    return this.galaxyConfig.systems.find((candidate) => candidate.id === systemId) ?? null;
  }

  getBodyInfo(system, bodyId) {
    if (bodyId === "star") {
      return createStarInfo(system);
    }

    const planet = system.planets?.find((candidate) => candidate.id === bodyId) ?? null;

    if (planet) {
      return createPlanetInfo(planet);
    }

    for (const candidate of system.planets ?? []) {
      const planetRadius = Math.max(
        SYSTEM_VIEW_SCALE.minPlanetRadius,
        candidate.body.radius * SYSTEM_VIEW_SCALE.planetRadius
      );
      const moonSpecs = createMoonSpecs(candidate, planetRadius, MAX_PLANET_MOONS);
      const moon = moonSpecs.find((spec) => spec.id === bodyId) ?? null;

      if (moon) {
        return createMoonInfo(candidate, moon);
      }
    }

    return null;
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
      <div class="system-info-panel-card${this.isCollapsed ? " is-collapsed" : ""}">
        <div class="system-info-panel-header">
          <div class="system-info-panel-kicker">Selected ${escapeHtml(info.kind)}</div>
          <button
            class="system-info-collapse-button"
            type="button"
            data-system-info-action="toggle-collapse"
            aria-expanded="${this.isCollapsed ? "false" : "true"}"
            aria-label="${this.isCollapsed ? "Expand body info" : "Collapse body info"}"
            title="${this.isCollapsed ? "Expand" : "Collapse"}"
          >${this.isCollapsed ? "+" : "–"}</button>
        </div>
        ${body}
      </div>
    `;
  }
}

function createStarInfo(system) {
  const star = system.star ?? {};
  const starType = system.summary?.starType ?? "star";

  return {
    kind: "Star",
    title: system.name ? `${system.name} Star` : "Star",
    rows: compactRows([
      ["ID", "star"],
      ["Name", system.name ? `${system.name} Star` : "Star"],
      ["Type", starType],
      ["Seed", system.seed],
      ["Radius", star.radius],
      ["Rotation Speed", star.sphereRotationSpeed ?? 0],
      ["Shader", star.shaderId ?? system.visual?.sunShaderId ?? "fractal-sun"]
    ])
  };
}

function createPlanetInfo(planet) {
  const terrainId = planet.visual?.terrainShaderId ?? "none";
  const ring = planet.visual?.ring ?? {};
  const atmosphere = planet.visual?.atmosphere ?? {};

  return {
    kind: "Planet",
    title: planet.name ?? planet.id,
    rows: compactRows([
      ["ID", planet.id],
      ["Name", planet.name],
      ["Type", getPlanetTypeLabel(terrainId)],
      ["Seed", planet.seed],
      ["Radius", planet.body?.radius],
      ["Orbit Radius", planet.orbit?.radius],
      ["Orbit Speed", planet.orbit?.speed],
      ["Rotation Speed", planet.body?.rotationSpeed],
      ["Moons", getMoonCount(planet)],
      ["Inclination", planet.body?.axialTilt],
      ["Orbit Inclination", planet.orbit?.inclination],
      ["Ring", getRingLabel(ring)],
      ["Atmosphere / Sky", isSkyEnabled(planet) ? "yes" : "no"],
      ["Clouds", atmosphere.clouds?.enabled ? "yes" : "no"],
      ["Fog", atmosphere.fog?.shaderId && atmosphere.fog.shaderId !== "none-fog" ? "yes" : "no"],
      ["Weather", getWeatherLabel(planet)],
      ["Terrain", terrainId]
    ])
  };
}

function createMoonInfo(parentPlanet, moon) {
  const moonName = `${parentPlanet.name ?? parentPlanet.id}_M${String(moon.index + 1).padStart(2, "0")}`;

  return {
    kind: "Moon",
    title: moonName,
    rows: compactRows([
      ["ID", moon.id],
      ["Name", moonName],
      ["Type", "moon"],
      ["Seed", moon.seed],
      ["Parent", parentPlanet.name ?? parentPlanet.id],
      ["Radius", moon.radius],
      ["Orbit Radius", moon.orbitRadius],
      ["Orbit Speed", moon.speed],
      ["Rotation Speed", moon.rotationSpeed],
      ["Inclination", `X ${formatValue(moon.inclinationX)} / Z ${formatValue(moon.inclinationZ)}`],
      ["Ring", "no"],
      ["Atmosphere / Sky", "no"],
      ["Clouds", "no"],
      ["Fog", "no"],
      ["Weather", "no"],
      ["Terrain", "moon"]
    ])
  };
}

function compactRows(rows) {
  return rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => [label, formatValue(value)]);
}

function getPlanetTypeLabel(terrainId) {
  switch (terrainId) {
    case "rocky":
    case "mountain":
    case "efficient-mountains":
    case "biome-mountains":
    case "triwave-ridges":
      return "rock";
    case "soft-dunes":
      return "desert";
    case "turbulent-sea":
      return "ocean";
    case "frozen-lake":
      return "ice";
    case "volcanic":
      return "volcanic";
    case "moon":
      return "moon";
    case "none":
    default:
      return "planet";
  }
}

function getWeatherLabel(planet) {
  const weather = planet?.visual?.atmosphere?.weather;
  const shaderId = weather?.shaderId ?? "none-weather";

  if (shaderId === "snow" || shaderId === "snow-3d") {
    return "Snow 3D";
  }

  if (shaderId === "rain" || shaderId === "rain-3d") {
    return "Rain 3D";
  }

  return "no";
}

function getRingLabel(ring) {
  if (!ring?.enabled) {
    return "no";
  }

  return `yes, inner ${formatValue(ring.innerRadius)}, outer ${formatValue(ring.outerRadius)}`;
}

function isSkyEnabled(planet) {
  const shaderId = planet.visual?.skyShaderId ?? "none";
  return Boolean(shaderId && shaderId !== "none");
}

function getMoonCount(planet) {
  if (Array.isArray(planet?.moons)) {
    return Math.max(0, Math.min(10, planet.moons.length));
  }

  const count = Number(planet?.moons?.count ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.min(10, Math.round(count))) : 0;
}

function getPlanetRotationDirection(planet) {
  const rotationSpeed = Number(planet?.body?.rotationSpeed ?? 0);
  return Number.isFinite(rotationSpeed) && rotationSpeed < 0 ? -1 : 1;
}

function createMoonSpecs(planet, planetRadius, requestedCount = getMoonCount(planet)) {
  const count = Math.max(0, Math.min(MAX_PLANET_MOONS, Math.round(Number(requestedCount) || 0)));
  const seed = hashString(`${planet.id}:${planet.name}:moons`);
  const specs = [];
  const rotationDirection = getPlanetRotationDirection(planet);

  for (let index = 0; index < count; index += 1) {
    const moonSeed = hashString(`${planet.id}:moon:${index}`);
    const grey = seededRange(seed, index * 19 + 4, 0.36, 0.62);
    const warm = seededRange(seed, index * 19 + 5, -0.035, 0.045);
    const radiusFactor = seededRange(seed, index * 19 + 1, 0.075, 0.18);
    const sizeRandom = seededRange(seed, index * 19 + 23, 0.55, 1.50);
    const moonRadius = Math.max(0.14, planetRadius * radiusFactor * sizeRandom);
    const orbitRadius = planetRadius * (
      2.35 +
      index * 0.72 +
      seededRange(seed, index * 19 + 2, 0.0, 0.42)
    );
    const speed = rotationDirection * seededRange(seed, index * 19 + 6, 0.11, 0.24) / Math.pow(index + 1, 0.42);

    specs.push({
      id: `${planet.id}:moon-${index + 1}`,
      name: `${planet.name}_M${String(index + 1).padStart(2, "0")}`,
      index,
      seed: moonSeed,
      radius: moonRadius,
      orbitRadius,
      angle: seededRange(seed, index * 19 + 7, 0, Math.PI * 2),
      speed,
      inclinationX: seededRange(seed, index * 19 + 8, -0.42, 0.42),
      inclinationZ: seededRange(seed, index * 19 + 9, -0.35, 0.35),
      rotationSpeed: rotationDirection * seededRange(seed, index * 19 + 10, 0.22, 0.7),
      baseColor: [grey + warm, grey, grey - warm]
    });
  }

  return specs;
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed, salt) {
  let value = (seed + Math.imul(salt + 1, 374761393)) >>> 0;

  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;

  return ((value >>> 0) % 100000) / 100000;
}

function seededRange(seed, salt, min, max) {
  return min + (max - min) * seededRandom(seed, salt);
}
