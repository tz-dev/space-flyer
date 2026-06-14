export const ENTRY_ZOOM_DURATION = 2.6;

export const SYSTEM_VIEW_SCALE = {
  starRadius: 620,
  orbitRadius: 220,
  planetRadius: 880,
  minPlanetRadius: 1.2,
  orbitSegments: 192
};

export const SYSTEM_VIEW_LIMITS = {
  minZoom: 0.11,
  maxZoom: 4.0,
  wheelSensitivity: 0.0015,
  dragSensitivity: 0.006,
  clickMoveThresholdPx: 4
};

export const SYSTEM_VIEW_IDLE = {
  delaySeconds: 4.0,
  yawSpeed: 0.085,
  pitchAmplitude: 0.045,
  pitchSpeed: 0.18
};

export const ORBIT_VIEW = {
  transitionDuration: 1.15,
  dragSensitivity: 0.006,
  wheelSensitivity: 0.0025,
  starDistanceMultiplier: 4.2,
  planetDistanceMultiplier: 3.0,
  minDistanceMultiplier: 1.06,
  minDistancePadding: 0.35,
  maxDistanceMultiplier: 24,
  absoluteMaxDistance: 1800,
  idleDelaySeconds: 5.0,
  idleYawSpeed: 0.18
};
