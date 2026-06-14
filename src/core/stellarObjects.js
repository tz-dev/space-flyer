export const STELLAR_PARAM_KEYS = ["paramA", "paramB", "paramC", "paramD", "paramE", "paramF"];

export const STELLAR_OBJECT_ORDER = [
  "black-hole-0",
  "neutron-star-0",
  "diffuse-nebula-0",
  "quasar-0",
  "pulsar-0",
  "supernova-remnant-0",
  "space-rock-0",
  "dusty-nebula-0"
];

export const STELLAR_OBJECTS = {
  "black-hole-0": {
    label: "Black Hole",
    mode: 0,
    supportsRotation: false,
    config: {
      eventHorizonRadius: 0.105,
      diskRadius: 0.315,
      diskThickness: 0.075,
      diskTilt: 0.22,
      glowStrength: 0.92,
      lensStrength: 1.25,
      hue: 0,
      saturation: 1,
      red: 1,
      green: 1,
      blue: 1,
      exposure: 1,
      gamma: 1,
      defaultZoom: 1.0,
      minZoom: 0.72,
      maxZoom: 1.42,
      backgroundDrift: 0.018
    },
    params: {
      paramA: { label: "Lens", field: "lensStrength", default: 1.25, min: 0, max: 2.4, step: 0.01 },
      paramB: { label: "Horizon", field: "eventHorizonRadius", default: 0.105, min: 0.04, max: 0.18, step: 0.001 },
      paramC: { label: "Disk Radius", field: "diskRadius", default: 0.315, min: 0.12, max: 0.62, step: 0.005 },
      paramD: { label: "Tilt Anim Frequency", field: "diskTiltFrequency", default: 0.18, min: 0.0, max: 2.5, step: 0.005 },
      paramE: { label: "Glow", field: "glowStrength", default: 0.92, min: 0, max: 2.4, step: 0.01 },
      paramF: { label: "Background Scale", field: "backgroundScale", default: 1.8, min: 0.35, max: 10.0, step: 0.01 }
    }
  },
  "neutron-star-0": {
    label: "Neutron Star",
    mode: 1,
    supportsRotation: false,
    config: {
      lensStrength: 0.0,
      eventHorizonRadius: 0.105,
      diskRadius: 0.315,
      diskThickness: 0.075,
      diskTilt: 0.0,
      glowStrength: 1.0,
      hue: 0,
      saturation: 1,
      red: 1,
      green: 1,
      blue: 1,
      exposure: 0.9,
      gamma: 1.0,
      defaultZoom: 0.95,
      minZoom: 0.56,
      maxZoom: 1.85,
      backgroundDrift: 0.012
    },
    params: {
      paramA: { label: "Core Size", field: "eventHorizonRadius", default: 0.105, min: 0.06, max: 0.22, step: 0.001 },
      paramB: { label: "Glow", field: "glowStrength", default: 1.0, min: 0, max: 2.5, step: 0.01 },
      paramC: { label: "Beam Width", field: "diskRadius", default: 0.315, min: 0.08, max: 0.7, step: 0.005 },
      paramD: { label: "Beam Power", field: "diskThickness", default: 0.075, min: 0, max: 0.8, step: 0.005 },
      paramE: { label: "Pulse", field: "diskTilt", default: 0.0, min: -1, max: 1, step: 0.005 }
    }
  },
  "diffuse-nebula-0": {
    label: "Diffuse Nebula",
    mode: 2,
    supportsRotation: false,
    config: {
      lensStrength: 0.0,
      eventHorizonRadius: 0.105,
      diskRadius: 0.315,
      diskThickness: 0.075,
      diskTilt: 0.0,
      glowStrength: 0.95,
      hue: 0,
      saturation: 1,
      red: 1,
      green: 1,
      blue: 1,
      exposure: 1,
      gamma: 1,
      defaultZoom: 0.54,
      minZoom: 0.28,
      maxZoom: 1.45,
      backgroundDrift: 0.006
    },
    params: {
      paramA: { label: "Density", field: "glowStrength", default: 0.95, min: 0, max: 2.5, step: 0.01 },
      paramB: { label: "Scale", field: "diskRadius", default: 0.315, min: 0.1, max: 1.2, step: 0.005 },
      paramC: { label: "Softness", field: "diskThickness", default: 0.075, min: 0, max: 0.6, step: 0.005 },
      paramD: { label: "Drift", field: "diskTilt", default: 0, min: -1, max: 1, step: 0.005 },
      paramE: { label: "Core Light", field: "eventHorizonRadius", default: 0.105, min: 0, max: 0.8, step: 0.005 }
    }
  },
  "quasar-0": {
    label: "Quasar",
    mode: 3,
    supportsRotation: false,
    config: {
      lensStrength: 0.0,
      eventHorizonRadius: 0.105,
      diskRadius: 0.315,
      diskThickness: 0.075,
      diskTilt: 0.10,
      glowStrength: 1.0,
      hue: 0,
      saturation: 1,
      red: 1,
      green: 1,
      blue: 1,
      exposure: 0.95,
      gamma: 1.0,
      defaultZoom: 0.78,
      minZoom: 0.42,
      maxZoom: 1.65,
      backgroundDrift: 0.01
    },
    params: {
      paramA: { label: "Jet Power", field: "glowStrength", default: 1.0, min: 0, max: 2.5, step: 0.01 },
      paramB: { label: "Core Size", field: "eventHorizonRadius", default: 0.105, min: 0.04, max: 0.25, step: 0.001 },
      paramC: { label: "Jet Width", field: "diskRadius", default: 0.315, min: 0.08, max: 0.8, step: 0.005 },
      paramD: { label: "Disk Glow", field: "diskThickness", default: 0.075, min: 0, max: 0.6, step: 0.005 },
      paramE: { label: "Jet Tilt", field: "diskTilt", default: 0.10, min: -0.8, max: 0.8, step: 0.005 }
    }
  },
  "pulsar-0": {
    label: "Pulsar",
    mode: 4,
    supportsRotation: false,
    config: {
      lensStrength: 0.0,
      eventHorizonRadius: 0.105,
      diskRadius: 0.315,
      diskThickness: 0.075,
      diskTilt: 0.0,
      glowStrength: 0.55,
      hue: 0,
      saturation: 1,
      red: 1,
      green: 1,
      blue: 1,
      exposure: 0.52,
      gamma: 1.18,
      defaultZoom: 0.92,
      minZoom: 0.48,
      maxZoom: 1.7,
      backgroundDrift: 0.012
    },
    params: {
      paramA: { label: "Pulse Power", field: "glowStrength", default: 0.55, min: 0, max: 2.2, step: 0.01 },
      paramB: { label: "Pulse Frequency", field: "pulseFrequency", default: 1.0, min: 0.0, max: 8.0, step: 0.01 },
      paramC: { label: "Core Size", field: "eventHorizonRadius", default: 0.105, min: 0.04, max: 0.24, step: 0.001 },
      paramD: { label: "Beam Width", field: "diskRadius", default: 0.315, min: 0.08, max: 0.8, step: 0.005 },
      paramE: { label: "Beam Split", field: "diskThickness", default: 0.075, min: 0, max: 0.35, step: 0.005 },
      paramF: { label: "Spin Offset", field: "diskTilt", default: 0, min: -1, max: 1, step: 0.005 }
    }
  },
  "supernova-remnant-0": {
    label: "Supernova Remnant",
    mode: 5,
    supportsRotation: false,
    config: {
      lensStrength: 0.0,
      eventHorizonRadius: 0.105,
      diskRadius: 0.315,
      diskThickness: 0.075,
      diskTilt: 0.0,
      glowStrength: 1.05,
      hue: 0,
      saturation: 1,
      red: 1,
      green: 1,
      blue: 1,
      exposure: 0.92,
      gamma: 1.0,
      defaultZoom: 0.74,
      minZoom: 0.36,
      maxZoom: 1.45,
      backgroundDrift: 0.008
    },
    params: {
      paramA: { label: "Shell Density", field: "glowStrength", default: 1.05, min: 0, max: 2.5, step: 0.01 },
      paramB: { label: "Shell Radius", field: "diskRadius", default: 0.315, min: 0.1, max: 1.2, step: 0.005 },
      paramC: { label: "Turbulence", field: "diskThickness", default: 0.075, min: 0, max: 0.7, step: 0.005 },
      paramD: { label: "Max Drift", field: "maxDrift", default: 0.35, min: 0, max: 1.5, step: 0.005 },
      paramE: { label: "Auto Drift Frequency", field: "autoDriftFrequency", default: 0.18, min: 0, max: 4.0, step: 0.01 },
      paramF: { label: "Core Bloom", field: "eventHorizonRadius", default: 0.105, min: 0, max: 0.8, step: 0.005 }
    }
  },
  "space-rock-0": {
    label: "Space Rock",
    mode: 6,
    supportsRotation: true,
    config: {
      lensStrength: 0.0,
      eventHorizonRadius: 0.105,
      diskRadius: 0.315,
      diskThickness: 0.075,
      diskTilt: 0.0,
      glowStrength: 1.0,
      hue: 0,
      saturation: 1,
      red: 1,
      green: 1,
      blue: 1,
      exposure: 1.0,
      gamma: 1.0,
      defaultZoom: 1.0,
      minZoom: 0.55,
      maxZoom: 1.95,
      backgroundDrift: 0.008
    },
    params: {
      paramA: { label: "Surface Relief", field: "glowStrength", default: 1.0, min: 0, max: 2.0, step: 0.01 },
      paramB: { label: "Radius", field: "eventHorizonRadius", default: 0.105, min: 0, max: 0.35, step: 0.005 },
      paramC: { label: "Roughness", field: "diskRadius", default: 0.315, min: 0.05, max: 1.0, step: 0.005 },
      paramD: { label: "Spin", field: "diskThickness", default: 0.075, min: -0.5, max: 0.5, step: 0.005 },
      paramE: { label: "Rim Light", field: "diskTilt", default: 0, min: 0, max: 1.2, step: 0.005 },
      paramF: { label: "Quality", field: "quality", default: 0.72, min: 0.15, max: 1.0, step: 0.01 }
    }
  },
  "dusty-nebula-0": {
    label: "Dusty Nebula",
    mode: 7,
    supportsRotation: true,
    config: {
      lensStrength: 0.0,
      eventHorizonRadius: 0.105,
      diskRadius: 0.315,
      diskThickness: 0.075,
      diskTilt: 0.0,
      glowStrength: 1.0,
      hue: 0,
      saturation: 1,
      red: 1,
      green: 1,
      blue: 1,
      exposure: 0.98,
      gamma: 1.0,
      defaultZoom: 0.58,
      minZoom: 0.30,
      maxZoom: 1.55,
      backgroundDrift: 0.006
    },
    params: {
      paramA: { label: "Dust Density", field: "glowStrength", default: 1.0, min: 0, max: 2.5, step: 0.01 },
      paramB: { label: "Scale", field: "diskRadius", default: 0.315, min: 0.1, max: 1.0, step: 0.005 },
      paramC: { label: "Wisps", field: "diskThickness", default: 0.075, min: 0, max: 0.5, step: 0.005 },
      paramD: { label: "Rotation", field: "diskTilt", default: 0, min: -1, max: 1, step: 0.005 },
      paramE: { label: "Core Glow", field: "eventHorizonRadius", default: 0.105, min: 0, max: 0.45, step: 0.005 }
    }
 
  }
};

export const STELLAR_OBJECT_LABELS = Object.fromEntries(
  STELLAR_OBJECT_ORDER.map((id) => [id, STELLAR_OBJECTS[id]?.label ?? id])
);

export function getDefaultStellarObjectId() {
  return STELLAR_OBJECT_ORDER[0];
}

export function getStellarObjectDescriptor(objectId) {
  return STELLAR_OBJECTS[objectId] ?? STELLAR_OBJECTS[getDefaultStellarObjectId()];
}

export function getStellarObjectParamKeys(objectId) {
  const descriptor = getStellarObjectDescriptor(objectId);
  const keys = Object.keys(descriptor.params ?? {}).filter((key) => STELLAR_PARAM_KEYS.includes(key));
  return keys.length > 0 ? keys : STELLAR_PARAM_KEYS.slice(0, 5);
}

export function getDefaultStellarParamNames() {
  const result = {};

  for (const objectId of STELLAR_OBJECT_ORDER) {
    result[objectId] = {};
    const descriptor = getStellarObjectDescriptor(objectId);

    for (const key of getStellarObjectParamKeys(objectId)) {
      result[objectId][key] = descriptor.params?.[key]?.label ?? key;
    }
  }

  return result;
}

export function getDefaultStellarParamRanges() {
  const result = {};

  for (const objectId of STELLAR_OBJECT_ORDER) {
    result[objectId] = {};
    const descriptor = getStellarObjectDescriptor(objectId);

    for (const key of getStellarObjectParamKeys(objectId)) {
      const definition = descriptor.params?.[key] ?? {};
      result[objectId][key] = {
        min: definition.min ?? 0,
        max: definition.max ?? 1,
        step: definition.step ?? 0.01
      };
    }
  }

  return result;
}

export function normalizeStellarObjectViewConfig(input = {}) {
  const normalized = {
    spaceShaderId: "star-nest",
    objectParams: {},
    paramNames: getDefaultStellarParamNames(),
    paramRanges: getDefaultStellarParamRanges()
  };

  const inputObjectParams = input.objectParams ?? input.params ?? {};
  const inputParamRanges = input.paramRanges ?? input.parameterRanges ?? input.ranges ?? {};

  for (const objectId of STELLAR_OBJECT_ORDER) {
    normalized.paramRanges[objectId] = normalizeObjectParamRanges(objectId, inputParamRanges[objectId] ?? {});
    normalized.objectParams[objectId] = normalizeObjectParams(
      objectId,
      inputObjectParams[objectId] ?? {},
      normalized.paramRanges[objectId]
    );
  }

  const inputParamNames = input.paramNames ?? input.parameterNames ?? input.paramLabels ?? {};

  for (const objectId of STELLAR_OBJECT_ORDER) {
    normalized.paramNames[objectId] ??= {};

    for (const key of getStellarObjectParamKeys(objectId)) {
      const value = inputParamNames?.[objectId]?.[key];
      const trimmed = typeof value === "string" ? value.trim() : "";

      if (trimmed) {
        normalized.paramNames[objectId][key] = trimmed.slice(0, 32);
      }
    }
  }

  return normalized;
}

export function ensureStellarSettings(galaxyConfig) {
  galaxyConfig.stellarObjectView = normalizeStellarObjectViewConfig(galaxyConfig.stellarObjectView ?? {});
  return galaxyConfig.stellarObjectView;
}

export function resolveStellarObjectConfig(settings, objectId, objectParamOverrides = null) {
  const descriptor = getStellarObjectDescriptor(objectId);
  const ranges = normalizeObjectParamRanges(objectId, settings?.paramRanges?.[objectId] ?? {});
  const mergedParams = {
    ...(settings?.objectParams?.[objectId] ?? {}),
    ...(objectParamOverrides ?? {})
  };
  const params = normalizeObjectParams(objectId, mergedParams, ranges);
  const config = {
    ...descriptor.config,
    mode: descriptor.mode,
    supportsRotation: Boolean(descriptor.supportsRotation)
  };

  for (const key of getStellarObjectParamKeys(objectId)) {
    const definition = descriptor.params?.[key];
    const value = params[key];

    config[key] = value;

    if (definition?.field) {
      config[definition.field] = value;
    }
  }

  return config;
}

export function getStellarObjectParamDefinitions(settings, objectId) {
  const descriptor = getStellarObjectDescriptor(objectId);
  const names = settings?.paramNames?.[objectId] ?? {};
  const ranges = normalizeObjectParamRanges(objectId, settings?.paramRanges?.[objectId] ?? {});

  return getStellarObjectParamKeys(objectId).map((key) => {
    const definition = descriptor.params?.[key] ?? {};
    const range = ranges[key] ?? {};
    return {
      key,
      field: key,
      label: names[key] ?? definition.label ?? key,
      defaultLabel: definition.label ?? key,
      min: range.min ?? definition.min ?? 0,
      max: range.max ?? definition.max ?? 1,
      step: range.step ?? definition.step ?? 0.01,
      default: definition.default ?? 0
    };
  });
}

export function normalizeObjectParams(objectId, input = {}, ranges = null) {
  const descriptor = getStellarObjectDescriptor(objectId);
  const normalizedRanges = ranges ?? normalizeObjectParamRanges(objectId, {});
  const result = {};

  for (const key of getStellarObjectParamKeys(objectId)) {
    const definition = descriptor.params?.[key] ?? {};
    const range = normalizedRanges[key] ?? {};
    const raw = input[key] ?? input[definition.field] ?? definition.default ?? 0;
    result[key] = normalizeNumber(
      raw,
      definition.default ?? 0,
      range.min ?? definition.min ?? 0,
      range.max ?? definition.max ?? 1
    );
  }

  return result;
}

export function normalizeObjectParamRanges(objectId, input = {}) {
  const descriptor = getStellarObjectDescriptor(objectId);
  const result = {};

  for (const key of getStellarObjectParamKeys(objectId)) {
    const definition = descriptor.params?.[key] ?? {};
    const source = input[key] ?? {};
    let min = normalizeNumber(source.min, definition.min ?? 0, -100000, 100000);
    let max = normalizeNumber(source.max, definition.max ?? 1, -100000, 100000);
    let step = normalizeNumber(source.step, definition.step ?? 0.01, 0.000001, 100000);

    if (max < min) {
      const tmp = min;
      min = max;
      max = tmp;
    }

    result[key] = { min, max, step };
  }

  return result;
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, number));
}
