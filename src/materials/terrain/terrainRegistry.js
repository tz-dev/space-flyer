import { rockyTerrainShader } from "./shaders/rockyTerrain.js";
import { frozenLakeTerrainShader } from "./shaders/frozenLakeTerrain.js";
import { mountainTerrainShader } from "./shaders/mountainTerrain.js";
import { volcanicTerrainShader } from "./shaders/volcanicTerrain.js";
import { efficientMountainsTerrainShader } from "./shaders/efficientMountainsTerrain.js";
import { biomeMountainsTerrainShader } from "./shaders/biomeMountainsTerrain.js";
import { triwaveRidgesTerrainShader } from "./shaders/triwaveRidgesTerrain.js";
import { softDunesTerrainShader } from "./shaders/softDunesTerrain.js";
import { turbulentSeaTerrainShader } from "./shaders/turbulentSeaTerrain.js";

export const TERRAIN_PARAM_FLOAT_COUNT = 32;

const NONE_TERRAIN_SHADER = {
  id: "none",
  label: "None",
  description: "Plain unmodified planet surface.",
  params: [],
  glsl: /* glsl */`
float terrainEnabled() {
  return 0.0;
}

float terrainHeight(vec2 xz, float time) {
  return 0.0;
}

float terrainRenderDistance() {
  return 1000.0;
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  float latitude = normal.y * 0.5 + 0.5;
  return mix(uBaseColor * 0.72, uAccentColor, latitude * 0.45);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  return vec3(0.0);
}
`
};

export const TERRAIN_SHADERS = [
  NONE_TERRAIN_SHADER,
  rockyTerrainShader,
  frozenLakeTerrainShader,
  mountainTerrainShader,
  volcanicTerrainShader,
  efficientMountainsTerrainShader,
  biomeMountainsTerrainShader,
  triwaveRidgesTerrainShader,
  softDunesTerrainShader,
  turbulentSeaTerrainShader
];

export function getTerrainShader(shaderId) {
  return TERRAIN_SHADERS.find((shader) => shader.id === shaderId) ?? NONE_TERRAIN_SHADER;
}

export function isTerrainShaderId(shaderId) {
  return TERRAIN_SHADERS.some((shader) => shader.id === shaderId);
}

export function getTerrainShaderOptions() {
  return TERRAIN_SHADERS.map((shader) => ({
    id: shader.id,
    label: shader.label,
    params: getDisplayTerrainParams(shader.params).map((param) => ({
      key: param.key,
      label: param.label,
      min: param.min,
      max: param.max,
      step: param.step,
      digits: inferDigits(param.step),
      description: param.description
    }))
  }));
}

function getDisplayTerrainParams(params) {
  const renderDistance = params.find((param) => param.key === "renderDistance") ?? null;

  if (!renderDistance) {
    return params;
  }

  return [
    renderDistance,
    ...params.filter((param) => param.key !== "renderDistance")
  ];
}

export function createDefaultTerrainParams(shaderId) {
  const shader = getTerrainShader(shaderId);
  const params = {};

  for (const param of shader.params) {
    params[param.key] = param.default;
  }

  return params;
}

export function normalizeTerrainParams(shaderId, input = {}, normalizeNumber) {
  const shader = getTerrainShader(shaderId);
  const params = {};

  for (const param of shader.params) {
    params[param.key] = normalizeNumber(
      input[param.key],
      param.default,
      param.min,
      param.max
    );
  }

  return params;
}

export function terrainParamsToFloatArray(shaderId, input = {}) {
  const shader = getTerrainShader(shaderId);
  const values = new Float32Array(TERRAIN_PARAM_FLOAT_COUNT);

  shader.params.forEach((param, index) => {
    if (index >= TERRAIN_PARAM_FLOAT_COUNT) {
      return;
    }

    values[index] = Number(input[param.key] ?? param.default ?? 0);
  });

  return values;
}

export function createTerrainHeightSampler(shaderId, input = {}) {
  const shader = getTerrainShader(shaderId);
  const params = {};

  for (const param of shader.params) {
    params[param.key] = Number(input[param.key] ?? param.default ?? 0);
  }

  return function terrainHeightAtWorld(x, z, timeSeconds = 0) {
    if (typeof shader.heightAtWorld !== "function") {
      return Number(params.baseHeight ?? 0);
    }

    const height = shader.heightAtWorld({
      x,
      z,
      timeSeconds,
      params
    });

    return Number.isFinite(height) ? height : Number(params.baseHeight ?? 0);
  };
}

function inferDigits(step) {
  if (!Number.isFinite(step)) {
    return 2;
  }

  if (step >= 1) {
    return 0;
  }

  if (step >= 0.1) {
    return 1;
  }

  if (step >= 0.01) {
    return 2;
  }

  if (step >= 0.001) {
    return 3;
  }

  return 4;
}