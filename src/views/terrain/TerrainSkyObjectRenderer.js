import * as THREE from "three";
import {
  PlanetRingMaterial,
  createPlanetRingDiskGeometry
} from "../../materials/PlanetRingMaterial.js";
import { PlanetSurfaceMaterial } from "../../materials/PlanetSurfaceMaterial.js";
import { SunHaloMaterial } from "../../materials/SunHaloMaterial.js";
import { SunMaterial } from "../../materials/SunMaterial.js";
import { createMoonGeometry } from "../system/moonGeometry.js";
import {
  getSurfaceTexture,
  preloadSurfaceTexture
} from "../system/surfaceTextureCache.js";

const SKY_DISTANCE = 120;
const MAX_SKY_OBJECTS = 12;
const TERRAIN_SKY_SECONDARY_BODY_SCALE = 0.5;
const SKY_OBJECT_MIN_RADIUS = 0.08;
const SKY_OBJECT_MIN_SECONDARY_RADIUS = 0.04;

const SCRATCH_DIRECTION = new THREE.Vector3();
const SCRATCH_SUN_DIRECTION = new THREE.Vector3();
const SCRATCH_LIGHT_DIRECTION = new THREE.Vector3();
const SCRATCH_SPHERE_LIGHT_DIRECTION = new THREE.Vector3();
const SCRATCH_CAMERA_BACK = new THREE.Vector3();
const SCRATCH_CAMERA_MATRIX = new THREE.Matrix4();
const SCRATCH_PLANET_CENTER = new THREE.Vector3();
const SCRATCH_PLANET_SCALE = new THREE.Vector3();
const SCRATCH_PLANET_LOCAL_INVERSE = new THREE.Quaternion();
const SCRATCH_RING_NORMAL = new THREE.Vector3();
const SCRATCH_RING_AXIS_U = new THREE.Vector3();
const SCRATCH_RING_AXIS_V = new THREE.Vector3();
const SCRATCH_RING_MATRIX = new THREE.Matrix4();
const SCRATCH_RING_SHADOW_NORMAL = new THREE.Vector3();
const SCRATCH_RING_SHADOW_AXIS_U = new THREE.Vector3();
const SCRATCH_RING_SHADOW_AXIS_V = new THREE.Vector3();

export class TerrainSkyObjectRenderer {
  constructor({ renderer }) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, SKY_DISTANCE * 3.0);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);

    this.meshes = [];
    this.activeKey = "";
    this.visible = false;
  }

  setSize(width, height) {
    this.camera.aspect = Math.max(0.0001, width / Math.max(1, height));
    this.camera.updateProjectionMatrix();
  }

  update({ active, settings, system, landingContext, terrainCamera, elapsedTime }) {
    const skyObjects = landingContext?.skyObjects ?? [];
    const enabled = active && settings.enabled && skyObjects.length > 0;

    this.visible = enabled;

    if (!enabled) {
      this.clearObjects();
      return;
    }

    const key = this.createSkyKey(system, landingContext, settings);

    if (key !== this.activeKey) {
      this.activeKey = key;
      this.rebuildObjects({ system, landingContext, settings });
    }

    this.updateCameraBasis(terrainCamera);
    this.updateObjectTransforms({ landingContext, terrainCamera, elapsedTime });
  }

  render(renderer) {
    if (!this.visible || this.meshes.length === 0) {
      return;
    }

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    for (const entry of this.meshes) {
      entry.previousVisible = entry.root.visible;
    }

    // Pass 1: Planeten, Ringe und Monde.
    // They are sky overlays, not true depth objects; drawing them first lets
    // the sun disk/halo correctly cover objects that sit behind it on screen.
    for (const entry of this.meshes) {
      entry.root.visible = entry.previousVisible && entry.type !== "star";
    }

    renderer.render(this.scene, this.camera);

    // Pass 2: Sun / corona / flares last, so planets behind the sun do not
    // visually punch through the stellar disk.
    for (const entry of this.meshes) {
      entry.root.visible = entry.previousVisible && entry.type === "star";
    }

    renderer.render(this.scene, this.camera);

    for (const entry of this.meshes) {
      entry.root.visible = entry.previousVisible;
      delete entry.previousVisible;
    }

    renderer.autoClear = previousAutoClear;
  }

  clearObjects({ resetKey = true } = {}) {
    if (resetKey) {
      this.activeKey = "";
    }

    for (const entry of this.meshes) {
      entry.root.parent?.remove(entry.root);
      disposeObject(entry.root);
    }

    this.meshes = [];
  }

  rebuildObjects({ system, landingContext, settings }) {
    this.clearObjects({ resetKey: false });

    const objects = landingContext?.skyObjects ?? [];

    for (const object of objects.slice(0, MAX_SKY_OBJECTS)) {
      if (object.type === "star") {
        this.meshes.push(this.createStarEntry({ object, system, settings }));
      } else if (object.type === "planet") {
        const planet = system?.planets?.find((candidate) => candidate.id === object.id) ?? null;

        if (planet) {
          this.meshes.push(this.createPlanetEntry({ object, planet, settings }));
        }
      } else if (object.type === "moon") {
        this.meshes.push(this.createMoonEntry({ object, settings }));
      }
    }
  }

  createStarEntry({ object, system, settings }) {
    const starConfig = {
      ...(system?.star ?? {}),
      color: object.color ?? system?.star?.color ?? [1.0, 0.62, 0.28]
    };
    const displayScale = object.displayScale ?? settings.sunDisplayScale ?? 1.0;
    const diskRadius = angularRadiusToSkyRadius(object.angularRadius, displayScale * (settings.sunMeshScale ?? 1.0));
    const haloRadius = diskRadius * Math.max(1.8, settings.sunHaloScale ?? 3.2);

    const root = new THREE.Group();
    root.name = "Terrain Sky Star";

    const haloMaterial = new SunHaloMaterial({ starConfig });
    haloMaterial.depthTest = false;
    haloMaterial.depthWrite = false;
    haloMaterial.uniforms.uStarB.value.z = Math.max(0.05, Math.min(0.45, diskRadius / Math.max(haloRadius, 0.0001)));

    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(haloRadius * 2, haloRadius * 2),
      haloMaterial
    );
    halo.name = "Terrain Sky Star Halo";
    halo.renderOrder = 1;
    root.add(halo);

    const sunMaterial = new SunMaterial({
      shaderId: starConfig.shaderId ?? system?.visual?.sunShaderId ?? "fractal-sun",
      starConfig
    });
    sunMaterial.depthTest = false;
    sunMaterial.depthWrite = false;

    const disk = new THREE.Mesh(
      new THREE.SphereGeometry(diskRadius, 48, 24),
      sunMaterial
    );
    disk.name = "Terrain Sky Star Sphere";
    disk.renderOrder = 2;
    root.add(disk);

    this.scene.add(root);

    return {
      type: "star",
      id: object.id,
      root,
      sphere: disk,
      halo,
      directionLocal: object.directionLocal,
      angularRadius: object.angularRadius,
      displayScale,
      material: sunMaterial,
      haloMaterial
    };
  }

  createPlanetEntry({ object, planet, settings }) {
    const terrainShaderId = planet.visual?.terrainShaderId ?? "none";
    const material = new PlanetSurfaceMaterial({
      shaderId: terrainShaderId,
      planetConfig: planet,
      surfaceTexture: this.getSurfaceTexture(planet.visual?.surfaceTextureId)
    });
    material.depthTest = true;
    material.depthWrite = true;

    const displayScale = (object.displayScale ?? settings.planetDisplayScale ?? 1.0) * TERRAIN_SKY_SECONDARY_BODY_SCALE;
    const radius = angularRadiusToSkyRadius(object.angularRadius, displayScale, SKY_OBJECT_MIN_SECONDARY_RADIUS);
    const root = new THREE.Group();
    root.name = `Terrain Sky Planet ${planet.name}`;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 32),
      material
    );

    mesh.name = `Terrain Sky Planet Sphere ${planet.name}`;
    mesh.renderOrder = 3;
    mesh.rotation.z = planet.body?.axialTilt ?? 0;
    root.add(mesh);

    const ringMesh = this.createPlanetRingMesh({ planet, radius });

    if (ringMesh) {
      root.add(ringMesh);
    }

    this.scene.add(root);

    return {
      type: "planet",
      id: object.id,
      root,
      sphere: mesh,
      ringMesh,
      directionLocal: object.directionLocal,
      angularRadius: object.angularRadius,
      displayScale,
      radius,
      planet,
      material,
      lightDirectionLocal: object.lightDirectionLocal,
      planetAxisLocal: object.planetAxisLocal,
      ringNormalLocal: object.ringNormalLocal,
      ringAxisULocal: object.ringAxisULocal,
      ringAxisVLocal: object.ringAxisVLocal
    };
  }

  createMoonEntry({ object, settings }) {
    const spec = object.spec ?? {};
    const material = new PlanetSurfaceMaterial({
      shaderId: "moon",
      planetConfig: {
        visual: {
          terrainShaderId: "moon",
          terrainParams: {
            craterScale: spec.craterScale ?? 22.0,
            craterDepth: spec.craterDepth ?? 0.45,
            fineCraters: spec.fineCraters ?? 0.45,
            batteredness: spec.batteredness ?? 0.55,
            broadRises: spec.broadRises ?? 0.45,
            colorContrast: spec.colorContrast ?? 1.0,
            brightness: spec.brightness ?? 0.92,
            dustAmount: spec.dustAmount ?? 0.5
          },
          baseColor: spec.baseColor ?? object.color ?? [0.64, 0.63, 0.60],
          accentColor: spec.accentColor ?? [0.86, 0.84, 0.78],
          surfaceTextureParams: {
            mix: 0.95,
            scale: 2.0,
            brightness: 2.25,
            contrast: 1.00,
            sharpness: 0.75
          }
        },
        orbitView: {}
      },
      surfaceTexture: this.getSurfaceTexture("rock02")
    });
    material.setSurfaceTexture(this.getSurfaceTexture("rock02"));
    material.depthTest = true;
    material.depthWrite = true;

    const displayScale = (object.displayScale ?? settings.planetDisplayScale ?? 1.0) * TERRAIN_SKY_SECONDARY_BODY_SCALE;
    const radius = angularRadiusToSkyRadius(object.angularRadius, displayScale, SKY_OBJECT_MIN_SECONDARY_RADIUS);
    const root = new THREE.Group();
    root.name = `Terrain Sky Moon ${object.id}`;

    const mesh = new THREE.Mesh(
      createMoonGeometry(radius, spec.seed ?? object.seed ?? object.id ?? 1),
      material
    );

    mesh.name = `Terrain Sky Moon ${object.id}`;
    mesh.renderOrder = 3;
    mesh.rotation.set(
      spec.rotation?.x ?? 0,
      spec.rotation?.y ?? 0,
      spec.rotation?.z ?? 0
    );
    root.add(mesh);

    this.scene.add(root);

    return {
      type: "moon",
      id: object.id,
      root,
      sphere: mesh,
      ringMesh: null,
      directionLocal: object.directionLocal,
      angularRadius: object.angularRadius,
      displayScale,
      planet: {
        body: {
          rotationOffset: spec.rotation?.y ?? 0,
          axialTilt: spec.rotation?.z ?? 0
        }
      },
      material
    };
  }

  createPlanetRingMesh({ planet, radius }) {
    const ring = planet.visual?.ring;

    if (!ring?.enabled) {
      return null;
    }

    const innerRadius = radius * Math.max(1.01, ring.innerRadius ?? 1.35) * (ring.orbitScale ?? 1.0);
    const outerRadius = Math.max(
      innerRadius + radius * 0.05,
      radius * Math.max(1.02, ring.outerRadius ?? 2.35) * (ring.orbitScale ?? 1.0)
    );
    const innerRatio = clamp01(innerRadius / Math.max(outerRadius, 0.0001));

    const group = new THREE.Group();
    group.name = `Terrain Sky Planet Ring ${planet.name}`;
    group.renderOrder = 4;

    const geometry = createPlanetRingDiskGeometry({ segments: 224 });
    const material = new PlanetRingMaterial({
      ringConfig: ring,
      planetConfig: planet
    });

    material.depthTest = true;
    material.depthWrite = false;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Terrain Sky Planet Ring Disc ${planet.name}`;
    mesh.renderOrder = 4;
    group.add(mesh);

    group.userData.ringDisc = mesh;
    group.userData.ringInnerRadius = innerRadius;
    group.userData.ringOuterRadius = outerRadius;
    group.userData.ringBaseOpacity = ring.opacity ?? 0.85;
    group.scale.setScalar(outerRadius * (ring.apparentSize ?? 1.0));

    if (mesh.material instanceof PlanetRingMaterial) {
      mesh.material.setRingConfig(ring, planet, innerRatio, 1.0);
    }

    return group;
  }

  updateCameraBasis(terrainCamera) {
    if (!terrainCamera?.right || !terrainCamera?.up || !terrainCamera?.forward) {
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(0, 0, -1);
      return;
    }

    SCRATCH_CAMERA_BACK.copy(terrainCamera.forward).multiplyScalar(-1).normalize();

    SCRATCH_CAMERA_MATRIX.makeBasis(
      terrainCamera.right,
      terrainCamera.up,
      SCRATCH_CAMERA_BACK
    );
    SCRATCH_CAMERA_MATRIX.setPosition(0, 0, 0);

    this.camera.matrixWorld.copy(SCRATCH_CAMERA_MATRIX);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.camera.matrixAutoUpdate = false;
  }

  updateObjectTransforms({ landingContext, terrainCamera, elapsedTime }) {
    const sunObject = landingContext?.skyObjects?.find((object) => object.type === "star") ?? null;
    const sunDirection = sunObject?.directionLocal ?? landingContext?.sunDirectionLocal ?? [0.0, 1.0, 0.0];

    SCRATCH_SUN_DIRECTION.set(
      Number(sunDirection?.[0] ?? 0),
      Number(sunDirection?.[1] ?? 1),
      Number(sunDirection?.[2] ?? 0)
    ).normalize();

    for (const entry of this.meshes) {
      SCRATCH_DIRECTION.set(
        Number(entry.directionLocal?.[0] ?? 0),
        Number(entry.directionLocal?.[1] ?? 1),
        Number(entry.directionLocal?.[2] ?? 0)
      );

      if (SCRATCH_DIRECTION.lengthSq() < 0.0001) {
        SCRATCH_DIRECTION.set(0, 1, 0);
      }

      SCRATCH_DIRECTION.normalize();

      const forwardAmount = terrainCamera?.forward
        ? SCRATCH_DIRECTION.dot(terrainCamera.forward)
        : 1;

      // Local Y is the landing-surface "up" axis.
      // This sky pass is an overlay and has no terrain depth mask, so objects
      // must stay clearly above the local horizon. Otherwise sun/planets draw
      // on top of mountains and terrain silhouettes.
      const horizonAmount = SCRATCH_DIRECTION.y;
      const horizonThreshold = entry.type === "star" ? -0.055 : 0.18;
      const aboveHorizon = horizonAmount > horizonThreshold;

      entry.root.visible = aboveHorizon && forwardAmount > -0.12;

      if (!entry.root.visible) {
        continue;
      }

      entry.root.position.copy(SCRATCH_DIRECTION).multiplyScalar(SKY_DISTANCE);

      if (entry.type === "star") {
        entry.root.lookAt(this.camera.position);
        entry.root.rotation.z = elapsedTime * 0.015;
        entry.material.uniforms.uTime.value = elapsedTime;
        entry.haloMaterial.uniforms.uTime.value = elapsedTime;
      } else {
        const lightSource = entry.lightDirectionLocal ?? sunDirection;

        SCRATCH_LIGHT_DIRECTION.set(
          Number(lightSource?.[0] ?? SCRATCH_SUN_DIRECTION.x),
          Number(lightSource?.[1] ?? SCRATCH_SUN_DIRECTION.y),
          Number(lightSource?.[2] ?? SCRATCH_SUN_DIRECTION.z)
        );

        if (SCRATCH_LIGHT_DIRECTION.lengthSq() < 0.0001) {
          SCRATCH_LIGHT_DIRECTION.copy(SCRATCH_SUN_DIRECTION);
        }

        SCRATCH_LIGHT_DIRECTION.normalize();

        entry.sphere.rotation.y = entry.planet.body?.rotationOffset ?? 0;
        entry.sphere.rotation.z = entry.planet.body?.axialTilt ?? 0;
        SCRATCH_PLANET_LOCAL_INVERSE.copy(entry.sphere.quaternion).invert();
        SCRATCH_SPHERE_LIGHT_DIRECTION
          .copy(SCRATCH_LIGHT_DIRECTION)
          .applyQuaternion(SCRATCH_PLANET_LOCAL_INVERSE)
          .normalize();

        const skyLight = computeSkyObjectLighting(
          SCRATCH_SUN_DIRECTION,
          SCRATCH_DIRECTION,
          SCRATCH_LIGHT_DIRECTION
        );

        entry.material.uniforms.uTime.value = elapsedTime;
        entry.material.uniforms.uLightDirection.value.copy(SCRATCH_SPHERE_LIGHT_DIRECTION);
        entry.material.uniforms.uSkyObjectDim.value = skyLight.visibility;

        if (entry.material.uniforms.uSkyObjectDayAmount) {
          entry.material.uniforms.uSkyObjectDayAmount.value = skyLight.dayAmount;
        }

        if (entry.material.uniforms.uSkyObjectPhaseAmount) {
          entry.material.uniforms.uSkyObjectPhaseAmount.value = skyLight.phaseAmount;
        }

        if (entry.ringMesh) {
          applySkyRingOrientation(entry);
          updateSkyPlanetRingShadowOnSurface(entry);
        } else {
          entry.material.setRingShadowConfig?.({ enabled: false });
        }

        const ringDisc = entry.ringMesh?.userData?.ringDisc;

        if (ringDisc?.material instanceof PlanetRingMaterial) {
          entry.root.updateMatrixWorld(true);
          entry.sphere.updateMatrixWorld(true);
          entry.sphere.getWorldPosition(SCRATCH_PLANET_CENTER);
          entry.sphere.getWorldScale(SCRATCH_PLANET_SCALE);

          const planetRadius = Math.max(
            0.0001,
            (entry.radius ?? 1.0) * Math.max(
              Math.abs(SCRATCH_PLANET_SCALE.x),
              Math.abs(SCRATCH_PLANET_SCALE.y),
              Math.abs(SCRATCH_PLANET_SCALE.z)
            )
          );

          const ringBaseOpacity = Number(entry.ringMesh.userData?.ringBaseOpacity ?? 0.85);
          ringDisc.material.uniforms.uTime.value = elapsedTime;
          ringDisc.material.uniforms.uLightDirection.value.copy(SCRATCH_LIGHT_DIRECTION).normalize();
          ringDisc.material.uniforms.uRingA.value.w = Math.max(0.035, ringBaseOpacity * skyLight.visibility * mix(1.0, 0.72, skyLight.dayAmount));
          ringDisc.material.setPlanetShadow({
            planetCenter: SCRATCH_PLANET_CENTER.toArray(),
            planetRadius,
            strength: 0.58,
            softness: 0.34
          });
        }
      }
    }
  }

  getSurfaceTexture(textureId) {
    if (!textureId || textureId === "none") {
      return null;
    }

    preloadSurfaceTexture(textureId, this.renderer).catch((error) => {
      console.warn(`Terrain sky surface texture preload failed for ${textureId}:`, error);
    });

    return getSurfaceTexture(textureId) ?? null;
  }

  createSkyKey(system, landingContext, settings) {
    const objectKey = (landingContext?.skyObjects ?? [])
      .map((object) => [
        object.type,
        object.id,
        Number(object.angularRadius ?? 0).toFixed(5),
        Number(object.displayScale ?? 1).toFixed(3),
        object.directionLocal?.map((value) => Number(value).toFixed(3)).join(",")
      ].join(":"))
      .join("|");

    return [
      system?.id ?? "none",
      landingContext?.sectorId ?? "none",
      settings.sunMeshScale ?? 1,
      settings.sunHaloScale ?? 3.2,
      settings.sunDisplayScale ?? 1,
      settings.planetDisplayScale ?? 1,
      objectKey
    ].join("::");
  }

  destroy() {
    this.clearObjects();
  }
}

function updateSkyPlanetRingShadowOnSurface(entry) {
  const material = entry?.material;

  if (!(material instanceof PlanetSurfaceMaterial)) {
    return;
  }

  const ring = entry.planet?.visual?.ring ?? {};
  const planetRadius = Math.max(0.0001, Number(entry.radius ?? 1.0));

  if (!ring.enabled || !entry.ringMesh?.visible) {
    material.setRingShadowConfig({ enabled: false });
    return;
  }

  const innerRadius = Number(entry.ringMesh.userData?.ringInnerRadius ?? 0);
  const outerRadius = Number(entry.ringMesh.userData?.ringOuterRadius ?? 0);

  if (innerRadius <= 0.0001 || outerRadius <= innerRadius) {
    material.setRingShadowConfig({ enabled: false });
    return;
  }

  const apparentSize = ring.apparentSize ?? 1.0;
  const innerPlanetRadius = (innerRadius * apparentSize) / planetRadius;
  const outerPlanetRadius = (outerRadius * apparentSize) / planetRadius;

  SCRATCH_PLANET_LOCAL_INVERSE.copy(entry.sphere.quaternion).invert();

  SCRATCH_RING_SHADOW_NORMAL
    .set(0, 0, 1)
    .applyQuaternion(entry.ringMesh.quaternion)
    .applyQuaternion(SCRATCH_PLANET_LOCAL_INVERSE)
    .normalize();

  SCRATCH_RING_SHADOW_AXIS_U
    .set(1, 0, 0)
    .applyQuaternion(entry.ringMesh.quaternion)
    .applyQuaternion(SCRATCH_PLANET_LOCAL_INVERSE)
    .normalize();

  SCRATCH_RING_SHADOW_AXIS_V
    .set(0, 1, 0)
    .applyQuaternion(entry.ringMesh.quaternion)
    .applyQuaternion(SCRATCH_PLANET_LOCAL_INVERSE)
    .normalize();

  material.setRingShadowConfig({
    enabled: true,
    innerRadius: innerPlanetRadius,
    outerRadius: outerPlanetRadius,
    strength: ring.shadowStrength ?? 0.46,
    softness: ring.shadowSoftness ?? 0.18,
    normal: SCRATCH_RING_SHADOW_NORMAL.toArray(),
    axisU: SCRATCH_RING_SHADOW_AXIS_U.toArray(),
    axisV: SCRATCH_RING_SHADOW_AXIS_V.toArray()
  });
}

function applySkyRingOrientation(entry) {
  if (!entry?.ringMesh) {
    return;
  }

  const normalSource = entry.ringNormalLocal ?? entry.planetAxisLocal;

  if (!normalSource) {
    return;
  }

  SCRATCH_RING_NORMAL.set(
    Number(normalSource?.[0] ?? 0),
    Number(normalSource?.[1] ?? 1),
    Number(normalSource?.[2] ?? 0)
  );

  if (SCRATCH_RING_NORMAL.lengthSq() < 0.0001) {
    SCRATCH_RING_NORMAL.set(0, 1, 0);
  }

  SCRATCH_RING_NORMAL.normalize();

  const axisUSource = entry.ringAxisULocal;

  SCRATCH_RING_AXIS_U.set(
    Number(axisUSource?.[0] ?? 1),
    Number(axisUSource?.[1] ?? 0),
    Number(axisUSource?.[2] ?? 0)
  );

  SCRATCH_RING_AXIS_U.addScaledVector(
    SCRATCH_RING_NORMAL,
    -SCRATCH_RING_AXIS_U.dot(SCRATCH_RING_NORMAL)
  );

  if (SCRATCH_RING_AXIS_U.lengthSq() < 0.0001) {
    SCRATCH_RING_AXIS_U.set(1, 0, 0).addScaledVector(
      SCRATCH_RING_NORMAL,
      -SCRATCH_RING_NORMAL.x
    );
  }

  if (SCRATCH_RING_AXIS_U.lengthSq() < 0.0001) {
    SCRATCH_RING_AXIS_U.set(0, 0, 1).addScaledVector(
      SCRATCH_RING_NORMAL,
      -SCRATCH_RING_NORMAL.z
    );
  }

  SCRATCH_RING_AXIS_U.normalize();

  const axisVSource = entry.ringAxisVLocal;

  if (axisVSource) {
    SCRATCH_RING_AXIS_V.set(
      Number(axisVSource?.[0] ?? 0),
      Number(axisVSource?.[1] ?? 0),
      Number(axisVSource?.[2] ?? 1)
    );

    SCRATCH_RING_AXIS_V.addScaledVector(
      SCRATCH_RING_NORMAL,
      -SCRATCH_RING_AXIS_V.dot(SCRATCH_RING_NORMAL)
    );

    SCRATCH_RING_AXIS_V.addScaledVector(
      SCRATCH_RING_AXIS_U,
      -SCRATCH_RING_AXIS_V.dot(SCRATCH_RING_AXIS_U)
    );

    if (SCRATCH_RING_AXIS_V.lengthSq() < 0.0001) {
      SCRATCH_RING_AXIS_V.crossVectors(SCRATCH_RING_NORMAL, SCRATCH_RING_AXIS_U);
    }
  } else {
    SCRATCH_RING_AXIS_V.crossVectors(SCRATCH_RING_NORMAL, SCRATCH_RING_AXIS_U);
  }

  SCRATCH_RING_AXIS_V.normalize();

  SCRATCH_RING_MATRIX.makeBasis(
    SCRATCH_RING_AXIS_U,
    SCRATCH_RING_AXIS_V,
    SCRATCH_RING_NORMAL
  );

  entry.ringMesh.quaternion.setFromRotationMatrix(SCRATCH_RING_MATRIX);
}

function angularRadiusToSkyRadius(angularRadius, scale, minRadius = SKY_OBJECT_MIN_RADIUS) {
  return Math.max(minRadius, Math.tan(Math.max(0.001, angularRadius)) * SKY_DISTANCE * scale);
}

function computeSkyObjectLighting(sunDirection, objectDirection, lightDirection) {
  const dayAmount = smoothStep(-0.05, 0.55, sunDirection.y);
  const skyVisibility = mix(0.96, 0.48, dayAmount);
  const phaseAmount = clamp01(objectDirection.dot(lightDirection) * 0.5 + 0.5);
  const phaseVisibility = mix(0.62, 1.0, smoothStep(0.03, 0.88, phaseAmount));

  return {
    visibility: Math.max(0.20, Math.min(0.98, skyVisibility * phaseVisibility + 0.08)),
    dayAmount,
    phaseAmount
  };
}

function mix(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function smoothStep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.00001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();

    if (Array.isArray(child.material)) {
      for (const material of child.material) {
        material.dispose?.();
      }
    } else {
      child.material?.dispose?.();
    }
  });
}

function clamp01(value) {
  return Math.min(0.999, Math.max(0.001, value));
}
