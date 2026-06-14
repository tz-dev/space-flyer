import { getTerrainShaderOptions } from "../../materials/terrain/terrainRegistry.js";


export const GENERAL_RENDER_OPTIONS = [
  {
    key: "renderScale",
    label: "Render Scaling",
    min: 0.35,
    max: 1.5,
    step: 0.01,
    digits: 2
  },
  {
    key: "brightness",
    label: "Brightness",
    min: 0,
    max: 2,
    step: 0.01,
    digits: 2
  },
  {
    key: "contrast",
    label: "Contrast",
    min: 0,
    max: 2.5,
    step: 0.01,
    digits: 2
  },
  {
    key: "gamma",
    label: "Gamma",
    min: 0.5,
    max: 2.5,
    step: 0.01,
    digits: 2
  },
  {
    key: "exposure",
    label: "Exposure",
    min: 0.1,
    max: 4,
    step: 0.01,
    digits: 2
  }
];

export const SPACE_SHADER_OPTIONS = [
  {
    id: "star-nest",
    label: "Star Nest / Gradient Mix",
    params: [
      {
        key: "starNestAmount",
        label: "Star Nest FX",
        min: 0,
        max: 2,
        step: 0.01,
        digits: 2
      },
      {
        key: "gradientAmount",
        label: "Gradient Stars",
        min: 0,
        max: 2,
        step: 0.01,
        digits: 2
      },
      {
        key: "starCount",
        label: "Star Count",
        min: 0,
        max: 2,
        step: 0.01,
        digits: 2
      },
      {
        key: "starDensity",
        label: "Star Density",
        min: 10,
        max: 320,
        step: 1,
        digits: 0
      },
      {
        key: "horizonGlow",
        label: "Horizon Glow",
        min: 0,
        max: 3,
        step: 0.01,
        digits: 2
      },
      {
        key: "horizonDepth",
        label: "Horizon Depth",
        min: 0.1,
        max: 4,
        step: 0.01,
        digits: 2
      },
      {
        key: "iterations",
        label: "Iterations",
        min: 1,
        max: 17,
        step: 1,
        digits: 0
      },
      {
        key: "volSteps",
        label: "Vol Steps",
        min: 1,
        max: 20,
        step: 1,
        digits: 0
      },
      {
        key: "zoom",
        label: "Zoom",
        min: 0.1,
        max: 2.5,
        step: 0.01,
        digits: 2
      },
      {
        key: "tile",
        label: "Tile",
        min: 0.1,
        max: 2.5,
        step: 0.01,
        digits: 2
      },
      {
        key: "speed",
        label: "Speed",
        min: -0.2,
        max: 0.2,
        step: 0.001,
        digits: 3
      },
      {
        key: "brightness",
        label: "Brightness",
        min: 0,
        max: 0.02,
        step: 0.0001,
        digits: 4
      },
      {
        key: "darkMatter",
        label: "Dark Matter",
        min: 0,
        max: 1,
        step: 0.01,
        digits: 2
      },
      {
        key: "distFading",
        label: "Dist Fade",
        min: 0.1,
        max: 1,
        step: 0.01,
        digits: 2
      },
      {
        key: "saturation",
        label: "Saturation",
        min: 0,
        max: 2,
        step: 0.01,
        digits: 2
      },
      {
        key: "stepSize",
        label: "Step Size",
        min: 0.01,
        max: 0.5,
        step: 0.01,
        digits: 2
      },
      {
        key: "drift",
        label: "Drift",
        min: -1,
        max: 2,
        step: 0.001,
        digits: 3
      }
    ]
  }
];

export const SUN_SHADER_OPTIONS = [
  { id: "fractal-sun", label: "Fractal Sun" }
];

export const PLANET_SHADER_OPTIONS = getTerrainShaderOptions();

export const PLANET_TEXTURE_OPTIONS = [
  { id: "none", label: "None" },
  { id: "rock01", label: "rock01.jpg" },
  { id: "rock02", label: "rock02.jpg" },
  { id: "ice01", label: "ice01.jpg" },
  { id: "mars01", label: "mars01.jpg" },
  { id: "moon01", label: "moon01.jpg" }
];

export const PLANET_TEXTURE_PARAMS = [
  {
    key: "mix",
    label: "Texture Mix",
    min: 0,
    max: 1,
    step: 0.01,
    digits: 2
  },
  {
    key: "scale",
    label: "Texture Scale",
    min: 0.05,
    max: 12,
    step: 0.05,
    digits: 2
  },
  {
    key: "brightness",
    label: "Texture Brightness",
    min: 0.1,
    max: 3,
    step: 0.01,
    digits: 2
  },
  {
    key: "contrast",
    label: "Texture Contrast",
    min: 0.1,
    max: 3,
    step: 0.01,
    digits: 2
  },
  {
    key: "sharpness",
    label: "Texture Sharpness",
    min: 0,
    max: 2,
    step: 0.01,
    digits: 2
  }
];

export const INITIAL_COLLAPSED_SECTIONS = [
  "config",
  "general",
  "system",
  "star",
  "selected-planet",
  "planet-rings",
  "sky-shader",
  "atmosphere",
  "terrain-shader",
  "space",
  "atmosphere-clouds",
  "atmosphere-orbit-clouds",
  "atmosphere-aurora",
  "atmosphere-flow",
  "atmosphere-weather",
  "atmosphere-fog"
];
