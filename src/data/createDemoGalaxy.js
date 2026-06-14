import { normalizeGalaxyConfig } from "../core/configSchema.js";
import { randomRange, seededRandom } from "../core/math.js";
import {
  STELLAR_CATEGORIES,
  generateStellarName,
  generateUniqueStellarName,
  hashInt
} from "../generation/nameGenerator.js";
import {
  STELLAR_OBJECT_LABELS,
  STELLAR_OBJECT_ORDER,
  getStellarObjectDescriptor,
  getStellarObjectParamKeys
} from "../core/stellarObjects.js";

export const SPACE_FLYER_GENERATOR_VERSION = 1;

const SYSTEM_COUNT = 1800;
const GALAXY_RADIUS = 165;
const CORE_BIAS = 0.72;
const STELLAR_SIGNAL_RATE_MIN = 0.05;
const STELLAR_SIGNAL_RATE_MAX = 0.10;
const GOLDEN_ANGLE = Math.PI * (3.0 - Math.sqrt(5.0));

const DEMO_SPACE_SHADER_PARAMS = {
  "iterations": 16,
  "volSteps": 14,
  "zoom": 1,
  "tile": 2.03,
  "speed": 0,
  "brightness": 0.0009,
  "darkMatter": 0.12,
  "distFading": 0.74,
  "saturation": 1,
  "stepSize": 0.1,
  "drift": 0,
  "starNestAmount": 0.87,
  "gradientAmount": 1.25,
  "horizonGlow": 1.61,
  "horizonDepth": 0.1,
  "starCount": 2,
  "starDensity": 320
};

const DEMO_STAR_CONFIG = {
  "shaderId": "fractal-sun",
  "radius": 0.027,
  "color": [
    1,
    0.62,
    0.28
  ],
  "brightness": 3.27,
  "haloBrightness": 5.82,
  "glow": 5.13,
  "corona": 3.34,
  "flare": 1.48,
  "surfaceScale": 2.35,
  "coronaScale": 0.12,
  "surfaceAnimationSpeed": 1,
  "sphereRotationSpeed": 0,
  "coronaSpeed": 12
};

const SKY_SHADER_SLOTS = [
  "thin-atmosphere",
  "thin-atmosphere",
  "thin-atmosphere",
  "none",
  "thin-atmosphere",
  "thin-atmosphere",
  "none",
  "thin-atmosphere",
  "thin-atmosphere",
  "thin-atmosphere",
  "none",
  "none",
  "thin-atmosphere",
  "none",
  "thin-atmosphere",
  "thin-atmosphere"
];

const SKY_SHADER_PARAM_SLOTS = [
  {
    "density": 1.63,
    "horizon": 2.6,
    "spaceFade": 0.61,
    "skyBrightness": 1.5,
    "ambient": 0.79,
    "lightIntensity": 2.5,
    "shadowStrength": 0.77,
    "shadowDistance": 260,
    "shadowSteps": 39
  },
  {
    "density": 1.56,
    "horizon": 2.31,
    "spaceFade": 0.72,
    "skyBrightness": 1.5,
    "ambient": 0.66,
    "lightIntensity": 2,
    "shadowStrength": 1,
    "shadowDistance": 300,
    "shadowSteps": 48
  },
  {
    "density": 1.61,
    "horizon": 2.29,
    "spaceFade": 0.36,
    "skyBrightness": 1.5,
    "ambient": 0.74,
    "lightIntensity": 2.5,
    "shadowStrength": 1,
    "shadowDistance": 280,
    "shadowSteps": 48
  },
  {},
  {
    "density": 2,
    "horizon": 2.67,
    "spaceFade": 0.39,
    "skyBrightness": 1.5,
    "ambient": 0.93,
    "lightIntensity": 3,
    "shadowStrength": 0.87,
    "shadowDistance": 275,
    "shadowSteps": 48
  },
  {
    "density": 1.08,
    "horizon": 1.56,
    "spaceFade": 0.25,
    "skyBrightness": 1.5,
    "ambient": 0.41,
    "lightIntensity": 1.6,
    "shadowStrength": 1,
    "shadowDistance": 200,
    "shadowSteps": 33
  },
  {},
  {
    "density": 0.55,
    "horizon": 1.1,
    "spaceFade": 0.25,
    "skyBrightness": 1.5,
    "ambient": 0.22,
    "lightIntensity": 1,
    "shadowStrength": 0.35,
    "shadowDistance": 90,
    "shadowSteps": 18
  },
  {
    "density": 1.73,
    "horizon": 2.55,
    "spaceFade": 0.14,
    "skyBrightness": 1.5,
    "ambient": 0.74,
    "lightIntensity": 2.8,
    "shadowStrength": 0.82,
    "shadowDistance": 260,
    "shadowSteps": 45
  },
  {
    "density": 1.63,
    "horizon": 2.67,
    "spaceFade": 0.89,
    "skyBrightness": 1.5,
    "ambient": 0.85,
    "lightIntensity": 2.85,
    "shadowStrength": 1,
    "shadowDistance": 300,
    "shadowSteps": 48
  },
  {},
  {},
  {
    "density": 1.7,
    "horizon": 2.49,
    "spaceFade": 0.45,
    "skyBrightness": 1.5,
    "ambient": 1,
    "lightIntensity": 2.9,
    "shadowStrength": 1,
    "shadowDistance": 300,
    "shadowSteps": 47
  },
  {},
  {
    "density": 1.68,
    "horizon": 2.36,
    "spaceFade": 0.24,
    "skyBrightness": 1.5,
    "ambient": 0.67,
    "lightIntensity": 2.15,
    "shadowStrength": 0.74,
    "shadowDistance": 220,
    "shadowSteps": 45
  },
  {
    "density": 1.09,
    "horizon": 1.3,
    "spaceFade": 0.25,
    "skyBrightness": 1.5,
    "ambient": 0.28,
    "lightIntensity": 1.1,
    "shadowStrength": 0.48,
    "shadowDistance": 250,
    "shadowSteps": 47
  }
];

const TERRAIN_PARAM_SLOTS = [
  {
    "baseHeight": 0,
    "heightScale": 2.15,
    "featureScale": 1,
    "terrainScale": 47,
    "terrainFreq": 0.002,
    "ridgeSharpness": 0.34,
    "terrainOffset": 0.78,
    "lavaLevel": 4,
    "lavaGlow": 15,
    "lavaThreshold": 0.52,
    "lavaScale": 4.65,
    "lavaSpeed": 0.57,
    "emberAmount": 1,
    "emberScale": 2,
    "rockBrightness": 0.55,
    "rockContrast": 1.15,
    "redHeat": 2,
    "hue": 0,
    "textureScale": 2.4,
    "textureMix": 0,
    "renderDistance": 10000,
    "warp": 7.9,
    "heightWarp": 161.1
  },
  {
    "baseHeight": 0,
    "heightScale": 1.1,
    "featureScale": 1.3,
    "warp": 10,
    "heightWarp": 41.6,
    "ridgeSharpness": 2.35,
    "colorContrast": 1.2,
    "brightness": 1,
    "saturation": 1,
    "hue": 0,
    "tintR": 1,
    "tintG": 1,
    "tintB": 1,
    "textureScale": 2,
    "textureMix": 0.35,
    "textureOpacity": 1,
    "textureContrast": 1.2,
    "textureBrightness": 1,
    "textureSharpness": 0.45,
    "renderDistance": 10000
  },
  {
    "terrainScale": 0.015,
    "heightScale": 28.6,
    "heightOffset": -23.7,
    "renderDistance": 10000,
    "spacing": 1.84,
    "ridgePower": 0.93,
    "colorContrast": 1.44,
    "snowAmount": 0.16,
    "textureMix": 1,
    "textureScale": 0.2,
    "textureSharpness": 0.35,
    "textureBrightness": 0.76,
    "textureContrast": 1.15,
    "warp": 9.45,
    "heightWarp": 240.1,
    "tintR": 1,
    "tintG": 1,
    "tintB": 1,
    "hue": 0,
    "saturation": 1
  },
  {
    "baseHeight": 0,
    "heightScale": 114.5,
    "featureScale": 200,
    "bumpStrength": 0.82,
    "regionScale": 18.1,
    "regionAmount": 1.2,
    "rockContrast": 1,
    "ambient": 0.16,
    "distanceTint": 0.22,
    "surfaceHue": 0,
    "surfaceSaturation": 1,
    "tintR": 1,
    "tintG": 1,
    "tintB": 1,
    "textureMix": 1,
    "textureScale": 0.05,
    "textureSharpness": 0.35,
    "textureBrightness": 1,
    "textureContrast": 1.15,
    "renderDistance": 13000,
    "quality": 0.45
  },
  {
    "terrainScale": 0.017,
    "heightScale": 60,
    "heightOffset": -3.5,
    "renderDistance": 10000,
    "rippleStrength": 0.68,
    "rippleScale": 0.1,
    "colorContrast": 1,
    "hue": 0,
    "saturation": 1,
    "warp": 7.6,
    "heightWarp": 169
  },
  {
    "terrainScale": 0.009,
    "heightScale": 29.4,
    "heightOffset": -4,
    "renderDistance": 8160,
    "spacing": 2.15,
    "ridgePower": 0.83,
    "colorContrast": 1.1,
    "snowAmount": 0.45,
    "textureMix": 0,
    "textureScale": 1,
    "textureSharpness": 0.35,
    "textureBrightness": 1,
    "textureContrast": 1.15,
    "warp": 4.25,
    "heightWarp": 250,
    "tintR": 1,
    "tintG": 1,
    "tintB": 1,
    "hue": 0.13,
    "saturation": 1
  },
  {
    "waveHeight": 11.13,
    "waveSpeed": 1.59,
    "renderDistance": 10000,
    "foamAmount": 1.15,
    "quality": 5,
    "hue": 0.73,
    "saturation": 1.3
  },
  {
    "baseHeight": 0,
    "crackScale": 0.1,
    "crackThickness": 1.3,
    "crackAlpha": 1.36,
    "snowAmount": 0.59,
    "snowScale": 0.73,
    "deepBrightness": 1.59,
    "fresnel": 0.98,
    "hue": 0.08,
    "renderDistance": 10000,
    "quality": 0.83
  },
  {
    "terrainScale": 0.147,
    "heightOffset": -119.7,
    "heightScale": 5.37,
    "renderDistance": 10000,
    "waterLevel": -10,
    "snowAmount": -0.2,
    "grassAmount": 3,
    "sandAmount": 2.57,
    "rockAmount": 2.88,
    "mountainAmount": 1.16,
    "detailAmount": 2,
    "hue": 0,
    "warp": 2.05,
    "heightWarp": 143.8
  },
  {
    "terrainScale": 0.025,
    "heightScale": 19.9,
    "heightOffset": 21.8,
    "renderDistance": 10000,
    "spacing": 1.77,
    "snowStart": 0.56,
    "slopeDarkening": 0.45,
    "colorContrast": 1,
    "textureMix": 0,
    "textureScale": 1,
    "textureSharpness": 0.35,
    "textureBrightness": 1,
    "textureContrast": 1.15,
    "warp": 6.4,
    "heightWarp": 174.8
  },
  {
    "baseHeight": 0,
    "heightScale": 0.85,
    "featureScale": 1.85,
    "warp": 10,
    "heightWarp": 45.9,
    "ridgeSharpness": 1.5,
    "colorContrast": 1,
    "brightness": 1,
    "saturation": 1,
    "hue": -0.74,
    "tintR": 1.2,
    "tintG": 1.2,
    "tintB": 0.85,
    "textureScale": 2,
    "textureMix": 0.35,
    "textureOpacity": 1,
    "textureContrast": 1.2,
    "textureBrightness": 1,
    "textureSharpness": 0.45,
    "renderDistance": 10000
  },
  {
    "waveHeight": 3.04,
    "waveSpeed": 1,
    "renderDistance": 10000,
    "foamAmount": 1.3,
    "quality": 6,
    "hue": -0.68,
    "saturation": 1.63
  },
  {
    "terrainScale": 0.012,
    "heightScale": 25,
    "heightOffset": -2.35,
    "renderDistance": 10000,
    "spacing": 1.83,
    "snowStart": 0.56,
    "slopeDarkening": 1,
    "colorContrast": 1.57,
    "textureMix": 1,
    "textureScale": 0.25,
    "textureSharpness": 2,
    "textureBrightness": 1,
    "textureContrast": 1.15,
    "warp": 3.15,
    "heightWarp": 128.3
  },
  {
    "baseHeight": 0,
    "heightScale": 205.5,
    "featureScale": 200,
    "bumpStrength": 0.84,
    "regionScale": 22.7,
    "regionAmount": 1.77,
    "rockContrast": 1,
    "ambient": 0.39,
    "distanceTint": 0.56,
    "surfaceHue": 0,
    "surfaceSaturation": 1,
    "tintR": 1,
    "tintG": 1,
    "tintB": 1,
    "textureMix": 0,
    "textureScale": 1,
    "textureSharpness": 0.35,
    "textureBrightness": 1,
    "textureContrast": 1.15,
    "renderDistance": 10000,
    "quality": 0.7
  },
  {
    "baseHeight": 0,
    "crackScale": 0.44,
    "crackThickness": 0.59,
    "crackAlpha": 0.8,
    "snowAmount": 1.65,
    "snowScale": 0.72,
    "deepBrightness": 1.56,
    "fresnel": 1,
    "hue": -0.3,
    "renderDistance": 10000,
    "quality": 1
  },
  {
    "baseHeight": 15,
    "heightScale": 0.55,
    "featureScale": 3.4,
    "warp": 8.5,
    "heightWarp": 50,
    "ridgeSharpness": 2.6,
    "colorContrast": 1,
    "brightness": 1,
    "saturation": 1.1,
    "hue": 0.56,
    "tintR": 1,
    "tintG": 1,
    "tintB": 1,
    "textureScale": 0.25,
    "textureMix": 1,
    "textureOpacity": 1,
    "textureContrast": 1.2,
    "textureBrightness": 1,
    "textureSharpness": 0.45,
    "renderDistance": 10000
  }
];

const SURFACE_TEXTURE_SLOTS = [
  "none",
  "none",
  "rock02",
  "rock01",
  "none",
  "none",
  "none",
  "none",
  "none",
  "none",
  "none",
  "none",
  "ice01",
  "none",
  "none",
  "mars01"
];

const SURFACE_TEXTURE_PARAM_SLOTS = [
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.93,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.65,
    "scale": 1,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  },
  {
    "mix": 0.95,
    "scale": 1.25,
    "brightness": 1,
    "contrast": 1,
    "sharpness": 0
  }
];

const RING_CONFIG_SLOTS = [
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": true,
    "innerRadius": 1.34,
    "outerRadius": 2.15,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.15,
    "opacity": 0.72,
    "shadowStrength": 0.42,
    "shadowSoftness": 0.22,
    "hue": 0.08,
    "banding": 1.25,
    "color": [
      0.7,
      0.78,
      0.84
    ]
  },
  {
    "enabled": true,
    "innerRadius": 1.42,
    "outerRadius": 2.55,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1.12,
    "brightness": 1.15,
    "opacity": 0.72,
    "shadowStrength": 0.42,
    "shadowSoftness": 0.22,
    "hue": 0.08,
    "banding": 1.25,
    "color": [
      0.86,
      0.76,
      0.56
    ]
  },
  {
    "enabled": true,
    "innerRadius": 1.42,
    "outerRadius": 2.55,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1.18,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.15,
    "opacity": 0.72,
    "shadowStrength": 0.42,
    "shadowSoftness": 0.22,
    "hue": 0.08,
    "banding": 3.25,
    "color": [
      0.78,
      0.7,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  },
  {
    "enabled": false,
    "innerRadius": 1.35,
    "outerRadius": 2.35,
    "tilt": 0,
    "yaw": 0,
    "roll": 0,
    "apparentSize": 1,
    "surfaceScale": 1,
    "orbitScale": 1,
    "orbitWidth": 1,
    "systemScale": 1,
    "brightness": 1.25,
    "opacity": 0.85,
    "shadowStrength": 0.46,
    "shadowSoftness": 0.18,
    "hue": 0.12,
    "banding": 1.15,
    "color": [
      0.86,
      0.78,
      0.62
    ]
  }
];

const PLANET_ATMOSPHERE_SLOTS = [
  {
    "clouds": {
      "enabled": false,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.55,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 1.99,
        "opacity": 0.51,
        "scale": 3.93,
        "height": 2,
        "brightness": 1.44,
        "softness": 2.44,
        "hue": -0.75,
        "saturation": 2.5
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": false,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.55,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 1.96,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": false,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.55,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "none-atmosphere",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 0.25,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": false,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.55,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "none-atmosphere",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 0.25,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 0.59,
      "opacity": 0.44,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0.25,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 2.68
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 1.93,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.21,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "none-atmosphere",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 0.25,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 0.93,
      "opacity": 0.44,
      "scale": 0.44,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0.31,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1.43
    },
    "aurora": {
      "enabled": true,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "none-atmosphere",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 0.25,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 1.57,
      "opacity": 0.39,
      "scale": 0.76,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0.38,
      "bigPatches": 0,
      "orbitHeight": 1.039,
      "orbitPatchinessScale": 3.38
    },
    "aurora": {
      "enabled": true,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 0.25,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "snow-3d",
      "params": {
        "count": 8000,
        "fallSpeed": 139,
        "windX": 85,
        "windZ": 82,
        "opacity": 0.46
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 0.9,
      "opacity": 0.46,
      "scale": 0.99,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0.16,
      "bigPatches": 0,
      "orbitHeight": 1.05,
      "orbitPatchinessScale": 1.85
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.69,
        "density": 2,
        "opacity": 0.85,
        "scale": 3.82,
        "height": 2,
        "brightness": 1.29,
        "softness": 1.35,
        "hue": -3.14,
        "saturation": 0
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.55,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": true,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 2,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.45,
      "scale": 0.78,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0.24,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1.43
    },
    "aurora": {
      "enabled": true,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 0.25,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "fog-clouds",
      "params": {
        "speed": 0.25,
        "density": 1.9,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0,
        "brightness": 2,
        "softness": 1,
        "hue": 1.7,
        "saturation": 1,
        "renderDistance": 10000,
        "fadeDistance": 7800,
        "deckThickness": 1.9
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 1.37,
      "opacity": 0.45,
      "scale": 0.61,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0.23,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1.99
    },
    "aurora": {
      "enabled": true,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 1.65,
        "opacity": 0.32,
        "scale": 1,
        "height": 2,
        "brightness": 1.31,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "rain-3d",
      "params": {
        "count": 8000,
        "fallSpeed": 163,
        "windX": 48,
        "windZ": 0,
        "opacity": 0.62
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 0.82,
      "opacity": 0.49,
      "scale": 0.71,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0.1,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 1.18,
        "opacity": 0.6,
        "scale": 1,
        "height": 1.96,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": false,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.55,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "atmosphere-flow",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.77,
        "scale": 1,
        "height": 2,
        "brightness": 1.54,
        "softness": 1.93,
        "hue": -3.03,
        "saturation": 0
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  },
  {
    "clouds": {
      "enabled": true,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.55,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "none-atmosphere",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 0.25,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "snow-3d",
      "params": {
        "count": 8000,
        "fallSpeed": 59,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.69
      }
    }
  },
  {
    "clouds": {
      "enabled": false,
      "speed": 0.25,
      "density": 1,
      "opacity": 0.55,
      "scale": 1,
      "brightness": 1,
      "contrast": 1,
      "softness": 1,
      "hue": 0,
      "saturation": 0,
      "patchiness": 0,
      "bigPatches": 0,
      "orbitHeight": 1.035,
      "orbitPatchinessScale": 1
    },
    "aurora": {
      "enabled": false,
      "params": {
        "intensity": 1,
        "speed": 1,
        "bandScale": 140,
        "height": 1200,
        "spread": 1.35,
        "trail": 1,
        "glow": 1.35,
        "horizonFade": 1
      }
    },
    "atmosphere": {
      "shaderId": "none-atmosphere",
      "params": {
        "speed": 0.18,
        "density": 0.9,
        "opacity": 0.32,
        "scale": 1,
        "height": 0.25,
        "brightness": 0.92,
        "softness": 1.35,
        "hue": 0,
        "saturation": 0.65
      }
    },
    "fog": {
      "shaderId": "none-fog",
      "params": {
        "speed": 0.25,
        "density": 1,
        "opacity": 0.55,
        "scale": 0.1,
        "height": 0.25,
        "brightness": 1,
        "softness": 1,
        "hue": 0,
        "saturation": 1,
        "renderDistance": 18000,
        "fadeDistance": 4500,
        "deckThickness": 1
      }
    },
    "weather": {
      "shaderId": "none-weather",
      "params": {
        "count": 8000,
        "fallSpeed": 34,
        "windX": 0,
        "windZ": 0,
        "opacity": 0.72
      }
    }
  }
];

const ORBIT_VIEW_SLOTS = [
  {
    "featureScale": 33.85,
    "textureScale": 1,
    "contrast": null,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 5,
    "textureScale": 1,
    "contrast": 1.6,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 0.44,
    "textureScale": 0.81,
    "contrast": 1.05,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 255,
    "textureScale": 1.03,
    "contrast": 1.25,
    "hue": -2.74,
    "saturation": 1
  },
  {
    "featureScale": 25,
    "textureScale": null,
    "contrast": 1.55,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 0.25,
    "textureScale": 0.05,
    "contrast": 1.37,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 11.65,
    "textureScale": null,
    "contrast": 1.05,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 10,
    "textureScale": null,
    "contrast": null,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": null,
    "textureScale": null,
    "contrast": 1.25,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 11.9,
    "textureScale": null,
    "contrast": 1.39,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 3.7,
    "textureScale": 1,
    "contrast": 1.3,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": null,
    "textureScale": null,
    "contrast": null,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 12,
    "textureScale": 0.71,
    "contrast": 1.22,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": null,
    "textureScale": null,
    "contrast": 1.83,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 7.82,
    "textureScale": null,
    "contrast": 0.6,
    "hue": 0,
    "saturation": 1
  },
  {
    "featureScale": 15,
    "textureScale": 1,
    "contrast": null,
    "hue": 0,
    "saturation": 1
  }
];

const MOON_CONFIG_SLOTS = [
  {
    "count": 0,
    "radiusScale": 1,
    "sizeScale": 1
  },
  {
    "count": 0,
    "radiusScale": 1,
    "sizeScale": 1
  },
  {
    "count": 1,
    "radiusScale": 1.14,
    "sizeScale": 1
  },
  {
    "count": 2,
    "radiusScale": 1,
    "sizeScale": 1
  },
  {
    "count": 2,
    "radiusScale": 0.72,
    "sizeScale": 0.48
  },
  {
    "count": 1,
    "radiusScale": 0.7,
    "sizeScale": 0.48
  },
  {
    "count": 2,
    "radiusScale": 1.11,
    "sizeScale": 0.48
  },
  {
    "count": 2,
    "radiusScale": 0.72,
    "sizeScale": 0.48
  },
  {
    "count": 4,
    "radiusScale": 0.61,
    "sizeScale": 0.48
  },
  {
    "count": 5,
    "radiusScale": 0.7,
    "sizeScale": 0.48
  },
  {
    "count": 3,
    "radiusScale": 0.82,
    "sizeScale": 0.48
  },
  {
    "count": 2,
    "radiusScale": 0.98,
    "sizeScale": 0.48
  },
  {
    "count": 1,
    "radiusScale": 0.91,
    "sizeScale": 0.48
  },
  {
    "count": 0,
    "radiusScale": 1,
    "sizeScale": 1
  },
  {
    "count": 0,
    "radiusScale": 1,
    "sizeScale": 1
  },
  {
    "count": 0,
    "radiusScale": 1,
    "sizeScale": 1
  }
];


const ORBIT_RADIUS_SLOTS = [
  0.14, 0.36, 0.68, 1.08, 1.55, 2.10, 2.74, 3.47,
  4.30, 5.24, 6.30, 7.48, 8.80, 10.25, 11.85, 13.60
];

const LOCAL_DEMO_ORBIT_RADIUS_SLOTS = [
  0.14, 0.36, 0.68, 1.08, 1.55, 2.10, 2.74, 3.47,
  4.30, 5.24, 6.30, 7.48, 8.80, 10.25, 11.85, 13.60
];

const ORBIT_INCLINATION_SLOTS = [
  0.000, 0.006, -0.008, 0.012, -0.015, 0.020, -0.024, 0.030,
 -0.035, 0.042, -0.048, 0.056, -0.064, 0.074, -0.086, 0.100
];

const ORBIT_SPEED_SLOTS = [
  0.082, 0.061, 0.047, 0.036, 0.028, 0.022, 0.017, 0.0135,
  0.0105, 0.0082, 0.0064, 0.0050, 0.0039, 0.0030, 0.0023, 0.0018
];

// Small inner bodies, large mid/outer gas-giant slots, smaller far bodies.
const PLANET_RADIUS_SLOTS = [
  0.0024, 0.0036, 0.0048, 0.0065, 0.0085, 0.0110, 0.0145, 0.0190,
  0.0240, 0.0320, 0.0380, 0.0280, 0.0180, 0.0100, 0.0056, 0.0022
];

const PLANET_AXIAL_TILT_SLOTS = [
  0.035, -0.090, 0.180, -0.310, 0.420, -0.560, 0.120, 0.720,
 -0.260, 1.050, -0.680, 0.480, -0.140, 0.920, -0.390, 1.320
];

const ROTATION_SPEED_SLOTS = [
  0.42, -0.34, 0.28, 0.21, -0.18, 0.16, 0.12, -0.10,
  0.085, 0.070, -0.060, 0.052, 0.044, -0.036, 0.028, 0.018
];

const MOON_COUNT_SLOTS = [
  0, 0, 0, 0, 1, 1, 2, 2, 4, 5, 3, 2, 1, 0, 0, 0
];

const TERRAIN_SHADER_SLOTS = [
  "volcanic", "rocky", "rocky", "mountain", "soft-dunes", "triwave-ridges",
  "turbulent-sea", "frozen-lake", "biome-mountains", "efficient-mountains", "rocky",
  "turbulent-sea", "efficient-mountains", "mountain", "frozen-lake", "rocky"
];

const PLANET_COLOR_SLOTS = [
  { baseColor: [0.56, 0.42, 0.34], accentColor: [1.00, 0.48, 0.24] },
  { baseColor: [0.62, 0.58, 0.54], accentColor: [0.86, 0.82, 0.74] },
  { baseColor: [0.70, 0.62, 0.54], accentColor: [1.00, 0.78, 0.52] },
  { baseColor: [0.58, 0.60, 0.58], accentColor: [0.86, 0.90, 0.82] },
  { baseColor: [0.78, 0.64, 0.42], accentColor: [1.00, 0.84, 0.52] },
  { baseColor: [0.42, 0.54, 0.56], accentColor: [0.74, 0.92, 0.90] },
  { baseColor: [0.22, 0.38, 0.62], accentColor: [0.72, 0.88, 1.00] },
  { baseColor: [0.62, 0.72, 0.82], accentColor: [0.94, 0.98, 1.00] },
  { baseColor: [0.54, 0.48, 0.42], accentColor: [0.92, 0.82, 0.62] },
  { baseColor: [0.42, 0.58, 0.82], accentColor: [0.78, 0.92, 1.00] },
  { baseColor: [0.78, 0.62, 0.42], accentColor: [1.00, 0.86, 0.56] },
  { baseColor: [0.18, 0.34, 0.48], accentColor: [0.68, 0.86, 0.92] },
  { baseColor: [0.48, 0.54, 0.50], accentColor: [0.78, 0.88, 0.76] },
  { baseColor: [0.58, 0.54, 0.50], accentColor: [0.88, 0.84, 0.76] },
  { baseColor: [0.54, 0.62, 0.68], accentColor: [0.88, 0.94, 1.00] },
  { baseColor: [0.40, 0.38, 0.36], accentColor: [0.74, 0.72, 0.68] }
];

const CLOUD_ENABLED_SLOTS = [
  false, false, false, false, true, true, true, true,
  true, true, true, true, true, false, false, false
];

const AURORA_ENABLED_SLOTS = [
  false, false, false, false, false, false, true, true,
  false, true, true, true, false, false, false, false
];

const RING_SLOT_INDICES = new Set([8, 9, 10]);

const STELLAR_SIGNAL_WEIGHTS = [
  ["diffuse-nebula-0", 20],
  ["dusty-nebula-0", 18],
  ["supernova-remnant-0", 13],
  ["neutron-star-0", 13],
  ["pulsar-0", 12],
  ["black-hole-0", 10],
  ["quasar-0", 8],
  ["space-rock-0", 6]
];

const STELLAR_OBJECT_NAME_CATEGORIES = {
  "black-hole-0": STELLAR_CATEGORIES.BLACK_HOLE,
  "neutron-star-0": STELLAR_CATEGORIES.NEUTRON_STAR,
  "diffuse-nebula-0": STELLAR_CATEGORIES.NEBULA,
  "dusty-nebula-0": STELLAR_CATEGORIES.NEBULA,
  "supernova-remnant-0": STELLAR_CATEGORIES.NEBULA,
  "quasar-0": STELLAR_CATEGORIES.QUASAR,
  "pulsar-0": STELLAR_CATEGORIES.PULSAR,
  "space-rock-0": STELLAR_CATEGORIES.PLANET
};

export function createDemoGalaxy() {
  const random = seededRandom(7331);
  const usedSignalNames = new Set();
  const demoStarName = generateUniqueStellarName(STELLAR_CATEGORIES.STAR, 7331, usedSignalNames);
  const stellarSignalRate = randomRange(random, STELLAR_SIGNAL_RATE_MIN, STELLAR_SIGNAL_RATE_MAX);

  const systems = [
    {
      id: "system-001",
      kind: "system",
      name: demoStarName,
      seed: 7331,
      position: [0, 0, 0],
      color: [1.0, 0.72, 0.36],
      size: 1.65,
      discovered: true,
      visual: {
        spaceShaderId: "star-nest",
        spaceShaderParams: cloneConfig(DEMO_SPACE_SHADER_PARAMS),
        sunShaderId: "fractal-sun"
      },
      star: createDemoStarConfig(demoStarName),
      summary: {
        planetCount: 16,
        starType: "yellow"
      },
      planets: createLocalDemoPlanets(demoStarName, 7331)
    }
  ];

  for (let i = 2; i <= SYSTEM_COUNT; i += 1) {
    const id = `system-${String(i).padStart(4, "0")}`;
    const position = createSphericalGalaxyPosition(random);
    const seed = Math.floor(randomRange(random, 1000, 999999));
    const createStellarSignal = random() < stellarSignalRate;

    if (createStellarSignal) {
      systems.push(createGeneratedStellarSignal({ id, position, seed, usedSignalNames }));
      continue;
    }

    const starName = generateUniqueStellarName(
      STELLAR_CATEGORIES.STAR,
      seed,
      usedSignalNames
    );
    const planetCount = createGeneratedPlanetCount(seed);

    systems.push({
      id,
      kind: "system",
      name: starName,
      seed,
      position,
      color: createStarColor(random),
      size: randomRange(random, 0.42, 1.25),
      discovered: false,
      visual: {
        spaceShaderId: "star-nest",
        spaceShaderParams: createGeneratedSpaceShaderParams(seed),
        sunShaderId: "fractal-sun"
      },
      star: createGeneratedStarConfig(starName, seed),
      summary: {
        planetCount,
        starType: "unknown"
      },
      planets: createGeneratedPlanets(starName, seed, planetCount)
    });
  }

  return normalizeGalaxyConfig({
    version: 1,
    type: "planet-flyer-galaxy",
    id: "demo-galaxy",
    name: "Demo Galaxy",

    space: {
      shaderId: "star-nest",
      params: {}
    },

    render: {
      renderScale: 1.0,
      pixelation: 1.0,
      brightness: 1.0,
      contrast: 1.0,
      gamma: 1.0,
      exposure: 1.0,
      adaptiveTerrain: {
        enabled: false,
        targetFps: 45,
        updateEveryFrames: 5,
        renderScaleMin: 0.45,
        renderScaleMax: 1.0,
        pixelationEnabled: true,
        pixelationMin: 1.0,
        pixelationMax: 3.0
      }
    },

    systems
  });
}


export function createGeneratedSystemFromSignal(signal = {}) {
  const seed = Number.isFinite(Number(signal.seed)) ? Number(signal.seed) : 1;
  const name = typeof signal.name === "string" && signal.name.trim()
    ? signal.name
    : generateStellarName(STELLAR_CATEGORIES.STAR, seed);
  const planetCount = Number.isFinite(Number(signal.summary?.planetCount))
    ? Math.max(1, Math.min(16, Math.round(Number(signal.summary.planetCount))))
    : createGeneratedPlanetCount(seed);

  return {
    id: signal.id ?? `system-${String(seed).padStart(4, "0")}`,
    kind: "system",
    name,
    seed,
    position: normalizeSignalPosition(signal.position),
    color: normalizeSignalColor(signal.color, [1.0, 0.72, 0.36]),
    size: Number.isFinite(Number(signal.size)) ? Number(signal.size) : 0.86,
    discovered: Boolean(signal.discovered),
    visual: {
      spaceShaderId: "star-nest",
      spaceShaderParams: createGeneratedSpaceShaderParams(seed),
      sunShaderId: "fractal-sun"
    },
    star: createGeneratedStarConfig(name, seed),
    summary: {
      planetCount,
      starType: signal.summary?.starType ?? "unknown"
    },
    planets: createGeneratedPlanets(name, seed, planetCount)
  };
}

export function createGeneratedStellarSignalFromSignal(signal = {}) {
  const seed = Number.isFinite(Number(signal.seed)) ? Number(signal.seed) : 1;
  const objectId = STELLAR_OBJECT_ORDER.includes(signal.objectId)
    ? signal.objectId
    : pickWeightedStellarObjectId(seed);
  const label = STELLAR_OBJECT_LABELS[objectId] ?? "Stellar Object";
  const name = typeof signal.name === "string" && signal.name.trim()
    ? signal.name
    : generateStellarName(STELLAR_OBJECT_NAME_CATEGORIES[objectId] ?? STELLAR_CATEGORIES.NEBULA, seed);

  return {
    id: signal.id ?? `stellar-${String(seed).padStart(4, "0")}`,
    kind: "stellar-object",
    name,
    seed,
    position: normalizeSignalPosition(signal.position),
    color: normalizeSignalColor(signal.color, createStellarSignalColor(objectId, seed)),
    size: Number.isFinite(Number(signal.size)) ? Number(signal.size) : createStellarSignalSize(objectId, seed),
    discovered: Boolean(signal.discovered),
    visual: {
      spaceShaderId: "star-nest",
      spaceShaderParams: createGeneratedSpaceShaderParams(seed),
      sunShaderId: "fractal-sun"
    },
    summary: {
      planetCount: 0,
      starType: signal.summary?.starType ?? label
    },
    stellarObject: {
      objectId,
      objectParams: createGeneratedStellarObjectParams(objectId, seed)
    },
    planets: []
  };
}

function createDemoStarConfig(name) {
  return {
    ...cloneConfig(DEMO_STAR_CONFIG),
    name
  };
}

function createGeneratedStarConfig(name, seed) {
  const base = createDemoStarConfig(name);
  const star = jitterObjectNumbers(base, seed, {
    radius: [0.80, 1.20, 0.021, 0.035],
    brightness: [0.80, 1.20, 2.4, 3.9],
    haloBrightness: [0.80, 1.20, 3.4, 6.8],
    glow: [0.80, 1.20, 3.4, 6.2],
    corona: [0.80, 1.20, 2.3, 4.3],
    flare: [0.80, 1.20, 0.8, 2.0],
    surfaceScale: [0.80, 1.20, 1.8, 2.9],
    coronaScale: [0.80, 1.20, 0.08, 0.17],
    surfaceAnimationSpeed: [0.80, 1.20, 0.7, 1.4],
    coronaSpeed: [0.80, 1.20, 8.0, 12.0]
  });

  star.color = jitterColorRgb(base.color, seed, 4050, 0.90, 1.10);
  star.sphereRotationSpeed = 0;
  return star;
}

function createLocalDemoPlanets(parentStarName = "Demo Star", systemSeed = 7331) {
  const orbitAngles = createSeededOrbitAngles(
    systemSeed,
    LOCAL_DEMO_ORBIT_RADIUS_SLOTS.length,
    80,
    0.72
  );

  return LOCAL_DEMO_ORBIT_RADIUS_SLOTS.map((orbitRadius, index) =>
    createDemoPlanet({
      parentStarName,
      systemSeed,
      index,
      slotIndex: index,
      orbitRadius,
      angle: orbitAngles[index],
      rotationOffset: seededSlotOffset(systemSeed, 900 + index, 0.0, Math.PI * 2),
      generated: false
    })
  );
}

function createSeededOrbitAngles(seed, count, salt = 80, jitterAmount = 0.5) {
  const sectorSize = Math.PI * 2 / Math.max(1, count);
  const angles = Array.from({ length: count }, (_, index) => {
    const jitter = seededSlotOffset(seed, salt + index, -0.5, 0.5) * jitterAmount;
    return wrapPositiveRadians((index + 0.5 + jitter) * sectorSize);
  });

  for (let index = angles.length - 1; index > 0; index -= 1) {
    const random = seededRandom(hashInt(seed, salt + 1000 + index));
    const swapIndex = Math.floor(random() * (index + 1));
    const tmp = angles[index];
    angles[index] = angles[swapIndex];
    angles[swapIndex] = tmp;
  }

  return angles;
}

function createGeneratedPlanets(parentStarName, systemSeed, planetCount = 16) {
  const activeSlotIndices = createDistributedSlotIndices(planetCount, ORBIT_RADIUS_SLOTS.length);
  const orbitAngles = createSeededOrbitAngles(systemSeed, ORBIT_RADIUS_SLOTS.length, 700, 0.82);

  return Array.from({ length: ORBIT_RADIUS_SLOTS.length }, (_, index) => {
    const isActive = index < planetCount;
    const slotIndex = isActive ? activeSlotIndices[index] : index;
    const orbitJitter = slotIndex === 0 || slotIndex === ORBIT_RADIUS_SLOTS.length - 1
      ? 1
      : seededSlotOffset(systemSeed, 100 + index, 0.965, 1.035);
    const radiusJitter = seededSlotOffset(systemSeed, 300 + index, 0.86, 1.14);
    const speedJitter = seededSlotOffset(systemSeed, 500 + index, 0.86, 1.12);

    return createDemoPlanet({
      parentStarName,
      systemSeed,
      index,
      slotIndex,
      orbitRadius: clampNumber(ORBIT_RADIUS_SLOTS[slotIndex] * orbitJitter, 0.10, 16.00),
      planetRadius: clampNumber(PLANET_RADIUS_SLOTS[slotIndex] * radiusJitter, 0.0018, 0.0420),
      orbitSpeed: ORBIT_SPEED_SLOTS[slotIndex] * speedJitter,
      angle: orbitAngles[index],
      rotationOffset: seededSlotOffset(systemSeed, 900 + index, 0.0, Math.PI * 2),
      generated: true
    });
  });
}

function createDemoPlanet({
  parentStarName,
  systemSeed,
  index,
  slotIndex = index,
  orbitRadius = ORBIT_RADIUS_SLOTS[slotIndex],
  planetRadius = PLANET_RADIUS_SLOTS[slotIndex],
  orbitSpeed = ORBIT_SPEED_SLOTS[slotIndex],
  angle = index * 0.73,
  rotationOffset = index * 0.41,
  generated = false
}) {
  const terrainShaderId = resolveTerrainShaderId(slotIndex, orbitRadius);
  const terrainSourceSlotIndex = getTerrainSourceSlotIndex(terrainShaderId, slotIndex);
  const baseColors = generated
    ? jitterPlanetColors(PLANET_COLOR_SLOTS[terrainSourceSlotIndex] ?? PLANET_COLOR_SLOTS[slotIndex] ?? PLANET_COLOR_SLOTS[0], systemSeed, slotIndex)
    : PLANET_COLOR_SLOTS[slotIndex] ?? PLANET_COLOR_SLOTS[0];
  const colors = shapePlanetColorsForTerrain(
    terrainShaderId,
    baseColors,
    systemSeed,
    slotIndex,
    generated
  );
  const moonCount = generated
    ? createGeneratedMoonCount(systemSeed, slotIndex, planetRadius)
    : MOON_CONFIG_SLOTS[slotIndex]?.count ?? MOON_COUNT_SLOTS[slotIndex] ?? 0;
  const moonRadiusScale = moonCount > 0
    ? generated
      ? seededSlotOffset(systemSeed, 1200 + index, 0.72, 1.18)
      : MOON_CONFIG_SLOTS[slotIndex]?.radiusScale ?? 0.82
    : 1.0;
  const moonSizeScale = moonCount > 0
    ? generated
      ? seededSlotOffset(systemSeed, 1300 + index, 0.42, 0.58)
      : MOON_CONFIG_SLOTS[slotIndex]?.sizeScale ?? 0.48
    : 1.0;
  const rotationSpeed = generated
    ? clampNumber(
        (ROTATION_SPEED_SLOTS[slotIndex] ?? 0.08) * seededSlotOffset(systemSeed, 1400 + index, 0.75, 1.25),
        -0.50,
        0.50
      )
    : ROTATION_SPEED_SLOTS[slotIndex] ?? 0.08;
  const axialTilt = generated
    ? clampNumber(
        (PLANET_AXIAL_TILT_SLOTS[slotIndex] ?? 0) + seededSlotOffset(systemSeed, 1500 + index, -0.08, 0.08),
        -1.40,
        1.40
      )
    : PLANET_AXIAL_TILT_SLOTS[slotIndex] ?? 0;
  const baseTerrainParams = TERRAIN_PARAM_SLOTS[terrainSourceSlotIndex] ?? TERRAIN_PARAM_SLOTS[slotIndex] ?? {};
  const baseOrbitView = ORBIT_VIEW_SLOTS[terrainSourceSlotIndex] ?? ORBIT_VIEW_SLOTS[slotIndex] ?? {};
  const terrainParams = generated
    ? jitterTerrainParams(terrainShaderId, baseTerrainParams, systemSeed, 2000 + index)
    : cloneConfig(baseTerrainParams);
  const atmosphere = shapeDemoCloudAndAtmosphere(
    syncDemoAtmosphereWithTerrain(
      generated
        ? jitterPlanetAtmosphereConfig(PLANET_ATMOSPHERE_SLOTS[slotIndex] ?? {}, systemSeed, 2400 + index)
        : cloneConfig(PLANET_ATMOSPHERE_SLOTS[slotIndex] ?? {}),
      terrainParams,
      terrainShaderId
    ),
    {
      terrainShaderId,
      slotIndex,
      systemSeed,
      index,
      generated
    }
  );
  const orbitView = syncOrbitViewWithTerrain(
    generated
      ? jitterOrbitViewConfig(baseOrbitView, systemSeed, 2600 + index)
      : cloneConfig(baseOrbitView),
    terrainParams
  );

  return {
    id: `planet-${index + 1}`,
    name: generateStellarName(
      STELLAR_CATEGORIES.PLANET,
      hashInt(systemSeed, 200 + index),
      {
        parentStarName,
        planetIndex: index
      }
    ),
    orbit: {
      radius: orbitRadius,
      angle,
      speed: orbitSpeed,
      inclination: generated
        ? clampNumber(
            (ORBIT_INCLINATION_SLOTS[slotIndex] ?? 0) * seededSlotOffset(systemSeed, 1600 + index, 0.65, 1.35),
            -0.12,
            0.12
          )
        : ORBIT_INCLINATION_SLOTS[slotIndex] ?? 0
    },
    body: {
      radius: planetRadius,
      rotationSpeed,
      rotationOffset,
      axialTilt
    },
    visual: {
      showGrid: true,
      showInclinationIndicators: false,
      skyShaderId: SKY_SHADER_SLOTS[slotIndex] ?? "none",
      skyShaderParams: generated
        ? jitterConfigNumbers(SKY_SHADER_PARAM_SLOTS[slotIndex] ?? {}, systemSeed, 1800 + index, 0.12)
        : cloneConfig(SKY_SHADER_PARAM_SLOTS[slotIndex] ?? {}),
      terrainShaderId,
      terrainParams,
      surfaceTextureId: SURFACE_TEXTURE_SLOTS[slotIndex] ?? "none",
      surfaceTextureParams: generated
        ? jitterConfigNumbers(SURFACE_TEXTURE_PARAM_SLOTS[slotIndex] ?? {}, systemSeed, 2200 + index, 0.12)
        : cloneConfig(SURFACE_TEXTURE_PARAM_SLOTS[slotIndex] ?? {}),
      baseColor: colors.baseColor,
      accentColor: colors.accentColor,
      atmosphere,
      ring: createRingConfig(slotIndex, generated ? systemSeed + index * 31 : null)
    },
    orbitView,
    moons: {
      count: moonCount,
      radiusScale: moonRadiusScale,
      sizeScale: moonSizeScale
    }
  };
}

function syncDemoAtmosphereWithTerrain(atmosphere = {}, terrainParams = {}, terrainShaderId = "none") {
  const renderDistance = clampNumber(Number(terrainParams.renderDistance ?? 18000), 1000, 30000);
  const fog = atmosphere.fog ?? { shaderId: "none-fog", params: {} };
  const clouds = atmosphere.clouds ?? {};
  const atmosphereLayer = atmosphere.atmosphere ?? { shaderId: "none-atmosphere", params: {} };
  const isWaterWorld = terrainShaderId === "turbulent-sea" || terrainShaderId === "lagoon-mountains";

  return {
    ...atmosphere,
    clouds: {
      ...clouds,
      enabled: isWaterWorld ? true : clouds.enabled ?? false,
      scale: clampNumber(Number(clouds.scale ?? 0.12), 0.01, 0.25),
      height: Math.max(1.2, Number(clouds.height ?? 1.2)),
      blurStrength: Math.max(0.4, Number(clouds.blurStrength ?? 0.4)),
      deckThickness: clampNumber(Number(clouds.deckThickness ?? 0.86), 0.75, 1.0),
      orbitHeight: clampNumber(Number(clouds.orbitHeight ?? 1.035), 1.0, 1.125),
      orbitOpacity: clampNumber(Number(clouds.orbitOpacity ?? clouds.opacity ?? 0.55), 0.1, 0.7),
      renderDistance,
      fadeDistance: renderDistance
    },
    atmosphere: isWaterWorld
      ? {
          ...atmosphereLayer,
          shaderId: "atmosphere-flow",
          params: {
            ...(atmosphereLayer.params ?? {}),
            height: 2.0
          }
        }
      : atmosphereLayer,
    fog: {
      ...fog,
      params: {
        ...(fog.params ?? {}),
        height: fog.shaderId === "fog-clouds" ? 0.01 : fog.params?.height ?? 0.25,
        renderDistance,
        fadeDistance: renderDistance
      }
    }
  };
}

function shapeDemoCloudAndAtmosphere(atmosphere = {}, { terrainShaderId, slotIndex, systemSeed, index, generated }) {
  const clouds = atmosphere.clouds ?? {};
  const isWaterWorld = terrainShaderId === "turbulent-sea" || terrainShaderId === "lagoon-mountains";
  const randomSeed = hashInt(systemSeed, 3100 + index * 17 + slotIndex);
  const cloudEnabled = isWaterWorld || Boolean(clouds.enabled);

  if (!cloudEnabled) {
    return {
      ...atmosphere,
      clouds: {
        ...clouds,
        enabled: false,
        scale: clampNumber(Number(clouds.scale ?? 0.12), 0.01, 0.25),
        height: Math.max(1.2, Number(clouds.height ?? 1.2)),
        blurStrength: Math.max(0.4, Number(clouds.blurStrength ?? 0.4)),
        deckThickness: clampNumber(Number(clouds.deckThickness ?? 0.86), 0.75, 1.0),
        orbitHeight: clampNumber(Number(clouds.orbitHeight ?? 1.035), 1.0, 1.125),
        orbitOpacity: clampNumber(Number(clouds.orbitOpacity ?? clouds.opacity ?? 0.55), 0.1, 0.7)
      }
    };
  }

  const variation = generated ? 1.0 : 0.55;
  const patchiness = seededSlotOffset(randomSeed, 1, 0.25, 0.90);
  const bigPatches = seededSlotOffset(randomSeed, 2, 0.15, 0.85);
  const density = seededSlotOffset(randomSeed, 3, isWaterWorld ? 1.45 : 1.25, 2.0);
  const opacity = seededSlotOffset(randomSeed, 4, isWaterWorld ? 0.80 : 0.72, 0.96);
  const brightness = seededSlotOffset(randomSeed, 5, isWaterWorld ? 1.24 : 1.15, 1.75);
  const scale = seededSlotOffset(randomSeed, 6, 0.01, 0.25);
  const deckThickness = seededSlotOffset(randomSeed, 7, 0.75, 1.0);
  const heightVariation = seededSlotOffset(randomSeed, 8, 0.08, 0.55);
  const blurStrength = seededSlotOffset(randomSeed, 9, 0.40, 1.15);
  const orbitHeight = seededSlotOffset(randomSeed, 10, 1.015, 1.115);
  const orbitOpacity = seededSlotOffset(randomSeed, 11, 0.22, 0.68);

  return {
    ...atmosphere,
    clouds: {
      ...clouds,
      enabled: true,
      density: clampNumber(mixNumber(Number(clouds.density ?? density), density, variation), 1.20, 2.0),
      opacity: clampNumber(mixNumber(Number(clouds.opacity ?? opacity), opacity, variation), 0.70, 0.98),
      brightness: clampNumber(mixNumber(Number(clouds.brightness ?? brightness), brightness, variation), 1.10, 1.85),
      scale: clampNumber(mixNumber(Number(clouds.scale ?? scale), scale, variation), 0.01, 0.25),
      patchiness: clampNumber(mixNumber(Number(clouds.patchiness ?? patchiness), patchiness, variation), 0.20, 0.95),
      bigPatches: clampNumber(mixNumber(Number(clouds.bigPatches ?? bigPatches), bigPatches, variation), 0.10, 0.90),
      height: Math.max(1.2, Number(clouds.height ?? 1.2)),
      blurStrength: clampNumber(mixNumber(Number(clouds.blurStrength ?? blurStrength), blurStrength, variation), 0.4, 2.0),
      deckThickness: clampNumber(mixNumber(Number(clouds.deckThickness ?? deckThickness), deckThickness, variation), 0.75, 1.0),
      heightVariation: clampNumber(mixNumber(Number(clouds.heightVariation ?? heightVariation), heightVariation, variation), 0.0, 1.0),
      orbitHeight: clampNumber(mixNumber(Number(clouds.orbitHeight ?? orbitHeight), orbitHeight, variation), 1.0, 1.125),
      orbitOpacity: clampNumber(mixNumber(Number(clouds.orbitOpacity ?? clouds.opacity ?? orbitOpacity), orbitOpacity, variation), 0.1, 0.7),
      renderDistance: atmosphere.fog?.params?.renderDistance ?? clouds.renderDistance ?? 18000,
      fadeDistance: atmosphere.fog?.params?.fadeDistance ?? clouds.fadeDistance ?? 18000
    },
    atmosphere: isWaterWorld
      ? {
          ...(atmosphere.atmosphere ?? {}),
          shaderId: "atmosphere-flow",
          params: {
            ...(atmosphere.atmosphere?.params ?? {}),
            height: 2.0
          }
        }
      : atmosphere.atmosphere
  };
}

function syncOrbitViewWithTerrain(orbitView = {}, terrainParams = {}) {
  return {
    ...orbitView,
    hue: terrainParams.hue ?? terrainParams.surfaceHue ?? orbitView.hue ?? 0,
    saturation: terrainParams.saturation ?? terrainParams.surfaceSaturation ?? orbitView.saturation ?? 1
  };
}

function createRingConfig(slotIndex, variationSeed = null) {
  const base = cloneConfig(RING_CONFIG_SLOTS[slotIndex] ?? { enabled: false });

  if (!base.enabled) {
    return {
      ...base,
      enabled: false
    };
  }

  if (variationSeed === null) {
    return base;
  }

  const innerRadius = clampNumber((base.innerRadius ?? 1.35) * seededSlotOffset(variationSeed, 11, 0.92, 1.08), 1.30, 1.55);
  const outerRadius = clampNumber((base.outerRadius ?? 2.35) * seededSlotOffset(variationSeed, 12, 0.90, 1.10), innerRadius + 0.55, Math.min(2.75, innerRadius + 1.35));

  return {
    ...base,
    innerRadius,
    outerRadius,
    apparentSize: clampNumber((base.apparentSize ?? 1.0) * seededSlotOffset(variationSeed, 13, 0.92, 1.08), 0.92, 1.15),
    systemScale: clampNumber((base.systemScale ?? 1.0) * seededSlotOffset(variationSeed, 14, 0.92, 1.08), 0.92, 1.14),
    brightness: clampNumber((base.brightness ?? 1.15) * seededSlotOffset(variationSeed, 15, 0.88, 1.12), 0.95, 1.35),
    opacity: clampNumber((base.opacity ?? 0.72) * seededSlotOffset(variationSeed, 16, 0.90, 1.10), 0.55, 0.82),
    shadowStrength: clampNumber((base.shadowStrength ?? 0.42) * seededSlotOffset(variationSeed, 17, 0.85, 1.15), 0.25, 0.55),
    shadowSoftness: clampNumber((base.shadowSoftness ?? 0.22) * seededSlotOffset(variationSeed, 18, 0.85, 1.15), 0.14, 0.30),
    banding: clampNumber((base.banding ?? 1.25) * seededSlotOffset(variationSeed, 19, 0.80, 1.20), 0.85, 1.80),
    color: jitterColorRgb(base.color ?? [0.86, 0.78, 0.62], variationSeed, 20, 0.88, 1.12)
  };
}


function createGeneratedSpaceShaderParams(seed) {
  return jitterConfigNumbers(DEMO_SPACE_SHADER_PARAMS, seed, 1750, 0.10, {
    iterations: "integer",
    volSteps: "integer",
    horizonGlow: "fixed",
    horizonDepth: "fixed",
    speed: "fixed",
    drift: "fixed"
  });
}

function resolveTerrainShaderId(slotIndex, orbitRadius) {
  const baseShaderId = TERRAIN_SHADER_SLOTS[slotIndex] ?? "rocky";

  if (orbitRadius <= 0.18) {
    return "volcanic";
  }

  if (slotIndex < 7 && baseShaderId === "frozen-lake") {
    return "rocky";
  }

  return baseShaderId === "none" ? "rocky" : baseShaderId;
}

function getTerrainSourceSlotIndex(terrainShaderId, fallbackSlotIndex) {
  if (TERRAIN_SHADER_SLOTS[fallbackSlotIndex] === terrainShaderId) {
    return fallbackSlotIndex;
  }

  const matchingSlotIndex = TERRAIN_SHADER_SLOTS.findIndex((candidate, index) =>
    candidate === terrainShaderId && index >= (terrainShaderId === "frozen-lake" ? 7 : 0)
  );

  return matchingSlotIndex >= 0 ? matchingSlotIndex : fallbackSlotIndex;
}

function jitterTerrainParams(shaderId, params, seed, salt) {
  return jitterConfigNumbers(params, seed, salt, 0.20, {
    renderDistance: "fixed",
    quality: "fixed",
    hue: "hue",
    surfaceHue: "hue",
    saturation: "saturation",
    surfaceSaturation: "saturation"
  });
}

function jitterOrbitViewConfig(config, seed, salt) {
  return jitterConfigNumbers(config, seed, salt, 0.20, {
    hue: "hue",
    saturation: "saturation"
  });
}

function jitterPlanetAtmosphereConfig(config, seed, salt) {
  return jitterConfigNumbers(config, seed, salt, 0.20, {
    shaderId: "fixed",
    enabled: "fixed",
    hue: "hue",
    saturation: "saturation",
    count: "integer",
    renderDistance: "fixed",
    fadeDistance: "fixed",
    orbitHeight: "fixed",
    orbitOpacity: "fixed"
  });
}

function jitterConfigNumbers(value, seed, salt, pct = 0.20, rules = {}, path = "") {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 3 && value.every((entry) => Number.isFinite(Number(entry)))) {
      return jitterColorRgb(value, seed, salt, 1 - Math.min(pct, 0.18), 1 + Math.min(pct, 0.18));
    }

    return value.map((entry, index) => jitterConfigNumbers(entry, seed, salt + index + 1, pct, rules, path));
  }

  if (typeof value === "object") {
    const result = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = jitterConfigNumbers(entry, seed, salt + hashInt(key, 7) % 997, pct, rules, key);
    }

    return result;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value;
  }

  const rule = rules[path] ?? null;

  if (rule === "fixed") {
    return value;
  }

  if (rule === "integer") {
    return Math.max(1, Math.round(value * seededSlotOffset(seed, salt, 1 - pct, 1 + pct)));
  }

  if (rule === "hue") {
    return clampNumber(value + seededSlotOffset(seed, salt, -0.25, 0.25), -3.14, 3.14);
  }

  if (rule === "saturation") {
    return clampNumber(value * seededSlotOffset(seed, salt, 0.85, 1.15), 0.0, 2.5);
  }

  if (Math.abs(value) < 0.000001) {
    return value;
  }

  return value * seededSlotOffset(seed, salt, 1 - pct, 1 + pct);
}


function normalizeSignalPosition(value) {
  if (!Array.isArray(value) || value.length < 3) {
    return [0, 0, 0];
  }

  return [0, 1, 2].map((index) => {
    const number = Number(value[index]);
    return Number.isFinite(number) ? number : 0;
  });
}

function normalizeSignalColor(value, fallback = [1, 0.72, 0.36]) {
  if (!Array.isArray(value) || value.length < 3) {
    return [...fallback];
  }

  return [0, 1, 2].map((index) => {
    const number = Number(value[index]);
    return Number.isFinite(number) ? clampNumber(number, 0, 1.5) : fallback[index];
  });
}

function cloneConfig(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createGeneratedStellarSignal({ id, position, seed, usedSignalNames }) {
  const objectId = pickWeightedStellarObjectId(seed);
  const category = STELLAR_OBJECT_NAME_CATEGORIES[objectId] ?? STELLAR_CATEGORIES.NEBULA;
  const name = generateUniqueStellarName(
    category,
    seed,
    usedSignalNames,
    objectId === "space-rock-0"
      ? { parentStarName: "Minor Object", namingMode: "proper" }
      : {}
  );
  const label = STELLAR_OBJECT_LABELS[objectId] ?? "Stellar Object";

  return {
    id,
    kind: "stellar-object",
    name,
    seed,
    position,
    color: createStellarSignalColor(objectId, seed),
    size: createStellarSignalSize(objectId, seed),
    discovered: false,
    visual: {
      spaceShaderId: "star-nest",
      spaceShaderParams: createGeneratedSpaceShaderParams(seed),
      sunShaderId: "fractal-sun"
    },
    summary: {
      planetCount: 0,
      starType: label
    },
    stellarObject: {
      objectId,
      objectParams: createGeneratedStellarObjectParams(objectId, seed)
    },
    planets: []
  };
}

function createGeneratedStellarObjectParams(objectId, seed) {
  const descriptor = getStellarObjectDescriptor(objectId);
  const params = {};

  for (const key of getStellarObjectParamKeys(objectId)) {
    const definition = descriptor.params?.[key] ?? {};
    const baseValue = Number(definition.default ?? 0);
    const min = Number(definition.min ?? baseValue - Math.abs(baseValue) * 0.2);
    const max = Number(definition.max ?? baseValue + Math.abs(baseValue) * 0.2);

    if (!Number.isFinite(baseValue)) {
      continue;
    }

    if (Math.abs(baseValue) < 0.000001) {
      const span = Math.max(Math.abs(max - min), 1);
      params[key] = clampNumber(seededSlotOffset(seed, 2100 + key.charCodeAt(key.length - 1), -span * 0.10, span * 0.10), min, max);
      continue;
    }

    params[key] = clampNumber(
      baseValue * seededSlotOffset(seed, 2100 + key.charCodeAt(key.length - 1), 0.80, 1.20),
      min,
      max
    );
  }

  return params;
}

function createGeneratedPlanetCount(seed) {
  const random = seededRandom(hashInt(seed, 420));
  const roll = random();

  if (roll < 0.08) {
    return randomInteger(random, 1, 3);
  }

  if (roll < 0.34) {
    return randomInteger(random, 4, 7);
  }

  if (roll < 0.78) {
    return randomInteger(random, 8, 12);
  }

  return randomInteger(random, 13, 16);
}

function createDistributedSlotIndices(count, slotCount) {
  const safeCount = Math.max(1, Math.min(slotCount, Math.round(count)));

  if (safeCount === slotCount) {
    return Array.from({ length: slotCount }, (_, index) => index);
  }

  if (safeCount === 1) {
    return [Math.floor(slotCount * 0.5)];
  }

  const result = [];
  let previous = -1;

  for (let index = 0; index < safeCount; index += 1) {
    const rawSlot = Math.round(index * (slotCount - 1) / (safeCount - 1));
    const slotIndex = Math.max(previous + 1, Math.min(slotCount - safeCount + index, rawSlot));
    result.push(slotIndex);
    previous = slotIndex;
  }

  return result;
}

function createGeneratedMoonCount(seed, slotIndex, planetRadius) {
  const random = seededRandom(hashInt(seed, 1700 + slotIndex));
  const radiusBonus = planetRadius >= 0.018 ? 1 : 0;
  let min = 0;
  let max = 0;

  if (slotIndex <= 1) {
    min = 0;
    max = 0;
  } else if (slotIndex <= 3) {
    min = 0;
    max = 1;
  } else if (slotIndex <= 7) {
    min = 0;
    max = 3;
  } else if (slotIndex <= 11) {
    min = 2;
    max = 6;
  } else if (slotIndex <= 13) {
    min = 0;
    max = 2;
  } else {
    min = 0;
    max = 0;
  }

  min = Math.min(max, min + radiusBonus);
  return randomInteger(random, min, max);
}

function pickWeightedStellarObjectId(seed) {
  const random = seededRandom(hashInt(seed, 1800));
  const totalWeight = STELLAR_SIGNAL_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = randomRange(random, 0, totalWeight);

  for (const [objectId, weight] of STELLAR_SIGNAL_WEIGHTS) {
    roll -= weight;

    if (roll <= 0 && STELLAR_OBJECT_ORDER.includes(objectId)) {
      return objectId;
    }
  }

  return STELLAR_OBJECT_ORDER[0];
}

function createStellarSignalColor(objectId, seed) {
  const baseColors = {
    "black-hole-0": [1.00, 0.78, 0.42],
    "neutron-star-0": [0.70, 0.88, 1.00],
    "diffuse-nebula-0": [0.74, 0.45, 1.00],
    "quasar-0": [0.82, 0.92, 1.00],
    "pulsar-0": [0.56, 0.80, 1.00],
    "supernova-remnant-0": [1.00, 0.58, 0.34],
    "space-rock-0": [0.70, 0.66, 0.58],
    "dusty-nebula-0": [0.95, 0.62, 0.38]
  };

  return jitterColorRgb(baseColors[objectId] ?? [0.85, 0.86, 1.0], seed, 1900, 0.85, 1.15);
}

function createStellarSignalSize(objectId, seed) {
  const baseSizes = {
    "black-hole-0": 1.34,
    "neutron-star-0": 0.82,
    "diffuse-nebula-0": 1.15,
    "quasar-0": 1.18,
    "pulsar-0": 0.92,
    "supernova-remnant-0": 1.22,
    "space-rock-0": 0.58,
    "dusty-nebula-0": 1.08
  };

  return clampNumber((baseSizes[objectId] ?? 1.0) * seededSlotOffset(seed, 1950, 0.85, 1.15), 0.44, 1.55);
}

function jitterPlanetColors(colors, seed, slotIndex) {
  return {
    baseColor: jitterColorRgb(colors.baseColor, seed, 3000 + slotIndex, 0.88, 1.12),
    accentColor: jitterColorRgb(colors.accentColor, seed, 3100 + slotIndex, 0.88, 1.12)
  };
}

function shapePlanetColorsForTerrain(terrainShaderId, colors, seed, slotIndex, generated = false) {
  if (terrainShaderId !== "turbulent-sea" && terrainShaderId !== "lagoon-mountains") {
    return colors;
  }

  const blueGreenMix = seededSlotOffset(seed, 3400 + slotIndex, 0.0, 1.0);
  const depthMix = seededSlotOffset(seed, 3420 + slotIndex, 0.0, 1.0);
  const baseColor = [
    0.05 + blueGreenMix * 0.10,
    0.24 + blueGreenMix * 0.30 + depthMix * 0.06,
    0.52 + (1.0 - blueGreenMix) * 0.18
  ];
  const accentColor = [
    0.34 + blueGreenMix * 0.12,
    0.74 + blueGreenMix * 0.20,
    0.82 + (1.0 - blueGreenMix) * 0.16
  ];

  if (!generated) {
    return { baseColor, accentColor };
  }

  return {
    baseColor: jitterColorRgb(baseColor, seed, 3440 + slotIndex, 0.92, 1.08),
    accentColor: jitterColorRgb(accentColor, seed, 3460 + slotIndex, 0.92, 1.08)
  };
}

function jitterColorRgb(color, seed, salt, minMultiplier, maxMultiplier) {
  return color.map((component, index) =>
    clampNumber(component * seededSlotOffset(seed, salt + index, minMultiplier, maxMultiplier), 0, 1)
  );
}

function jitterObjectNumbers(base, seed, rules) {
  const result = { ...base };

  for (const [key, [minMultiplier, maxMultiplier, min, max]] of Object.entries(rules)) {
    const value = Number(base[key]);

    if (!Number.isFinite(value)) {
      continue;
    }

    result[key] = clampNumber(
      value * seededSlotOffset(seed, 4000 + hashInt(key, 1) % 1000, minMultiplier, maxMultiplier),
      min,
      max
    );
  }

  return result;
}

function seededSlotOffset(seed, salt, min, max) {
  const random = seededRandom(hashInt(seed, salt));
  return randomRange(random, min, max);
}

function createSphericalGalaxyPosition(random) {
  const direction = randomUnitVector(random);
  const radius = GALAXY_RADIUS * Math.pow(random(), CORE_BIAS);
  const clusterNoise = 1.0 + randomRange(random, -0.08, 0.08);

  return [
    direction[0] * radius * clusterNoise,
    direction[1] * radius * clusterNoise,
    direction[2] * radius * clusterNoise
  ];
}

function randomUnitVector(random) {
  const z = randomRange(random, -1, 1);
  const angle = randomRange(random, 0, Math.PI * 2);
  const radius = Math.sqrt(Math.max(0, 1 - z * z));

  return [
    Math.cos(angle) * radius,
    z,
    Math.sin(angle) * radius
  ];
}

function createStarColor(random) {
  const palettes = [
    [1.0, 0.48, 0.34],
    [1.0, 0.72, 0.36],
    [1.0, 0.92, 0.72],
    [0.72, 0.84, 1.0],
    [0.55, 0.68, 1.0]
  ];

  return palettes[Math.floor(random() * palettes.length)];
}

function randomInteger(random, min, max) {
  return Math.floor(randomRange(random, min, max + 1));
}

function mixNumber(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.max(min, Math.min(max, number));
}

function wrapPositiveRadians(value) {
  const number = Number(value);
  const tau = Math.PI * 2.0;

  if (!Number.isFinite(number)) {
    return 0;
  }

  return ((number % tau) + tau) % tau;
}
