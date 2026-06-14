import * as THREE from "three";
import { clamp, smoothstep } from "./math.js";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SCRATCH_FORWARD = new THREE.Vector3();
const SCRATCH_RIGHT = new THREE.Vector3();
const SCRATCH_UP = new THREE.Vector3();

function safeHorizontalForward(forward) {
  SCRATCH_FORWARD.set(forward.x, 0, forward.z);

  if (SCRATCH_FORWARD.lengthSq() < 0.000001) {
    return new THREE.Vector3(0, 0, -1);
  }

  return SCRATCH_FORWARD.clone().normalize();
}

export class TerrainFlightController {
  constructor({ input }) {
    this.input = input;
    this.position = new THREE.Vector3(0, 24, 62);
    this.right = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.forward = new THREE.Vector3(0, -0.08, -1).normalize();
    this.velocityY = 0;
    this.rollTotal = 0;
    this.rollLeveling = false;
    this.afterburnerBlend = 0;
    this.displaySpeed = 8;
    this.normalSpeed = 8;
    this.normalSpeedMax = 200;
    this.baseAltitude = 24;
    this.groundHeight = 0;
  }

  reset({ groundHeight = 0, altitude = 24, distance = 62, terrainHeightAtWorld = null, timeSeconds = 0 } = {}) {
    const startZ = distance;
    const sampledGround = typeof terrainHeightAtWorld === "function"
      ? terrainHeightAtWorld(0, startZ, timeSeconds)
      : groundHeight;

    this.groundHeight = sampledGround;
    this.baseAltitude = altitude;
    this.position.set(0, sampledGround + altitude, startZ);
    this.forward.set(0, -0.08, -1).normalize();
    this.right.set(1, 0, 0);
    this.up.set(0, 1, 0);
    this.velocityY = 0;
    this.rollTotal = 0;
    this.rollLeveling = false;
    this.afterburnerBlend = 0;
    this.displaySpeed = this.input?.controls?.targetSpeed ?? 8;
    this.normalSpeed = this.displaySpeed;
    this.orthonormalize();
  }

  setGroundProfile({ groundHeight = 0, altitude = 24 } = {}) {
    this.groundHeight = groundHeight;
    this.baseAltitude = altitude;
  }

  rotateLocalPitch(angle) {
    this.forward.applyAxisAngle(this.right, angle).normalize();
    this.up.applyAxisAngle(this.right, angle).normalize();
    this.orthonormalize();
  }

  rotateLocalYaw(angle) {
    this.forward.applyAxisAngle(this.up, angle).normalize();
    this.right.applyAxisAngle(this.up, angle).normalize();
    this.orthonormalize();
  }

  rotateLocalRoll(angle) {
    this.right.applyAxisAngle(this.forward, angle).normalize();
    this.up.applyAxisAngle(this.forward, angle).normalize();
    this.rollTotal += angle;
    this.orthonormalize();
  }

  rollToZero() {
    this.rollLeveling = true;
  }

  orthonormalize() {
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.up).normalize();

    if (!Number.isFinite(this.right.x) || this.right.lengthSq() < 0.000001) {
      this.right.crossVectors(WORLD_UP, this.forward).normalize();
    }

    this.up.crossVectors(this.right, this.forward).normalize();
  }

  updateRollLeveling(dt, speed = 4.5) {
    if (!this.rollLeveling) {
      return;
    }

    SCRATCH_FORWARD.set(this.forward.x, 0, this.forward.z);

    if (SCRATCH_FORWARD.lengthSq() < 0.0001) {
      this.rollLeveling = false;
      return;
    }

    SCRATCH_FORWARD.normalize();
    SCRATCH_RIGHT.crossVectors(SCRATCH_FORWARD, WORLD_UP).normalize();
    SCRATCH_UP.crossVectors(SCRATCH_RIGHT, this.forward).normalize();

    const blend = 1.0 - Math.exp(-speed * dt);

    this.right.lerp(SCRATCH_RIGHT, blend).normalize();
    this.up.lerp(SCRATCH_UP, blend).normalize();
    this.rollTotal *= 1.0 - blend;

    const rollAlignment = clamp(this.up.dot(SCRATCH_UP), -1, 1);
    const rollError = 1.0 - rollAlignment;

    if (rollError < 0.00001 && Math.abs(this.rollTotal) < 0.003) {
      this.right.copy(SCRATCH_RIGHT);
      this.up.copy(SCRATCH_UP);
      this.rollTotal = 0;
      this.rollLeveling = false;
    }

    this.orthonormalize();
  }

  applyLowAltitudeAutopilot({ dt, clearance, heightAboveGround, config }) {
    const lowBand = clearance + config.lowAltitudeExtraBand;
    const highBand = clearance + config.highAltitudeBand;
    const altitudeT = smoothstep(lowBand, highBand, heightAboveGround);
    const allowedWorldDown = config.nearDownLookLimit * (1.0 - altitudeT) +
      config.farDownLookLimit * altitudeT;

    const isLookingDownTooMuch = this.forward.y < allowedWorldDown;

    if (!isLookingDownTooMuch) {
      return;
    }

    const autopilotAltitudeT = 1.0 - smoothstep(
      clearance + config.autopilotHeightFull,
      clearance + config.autopilotHeightStart,
      heightAboveGround
    );

    if (autopilotAltitudeT <= 0.0001) {
      return;
    }

    const lookDownExcess = smoothstep(
      allowedWorldDown,
      allowedWorldDown - 0.45,
      this.forward.y
    );

    const autopilotStrength = clamp(
      autopilotAltitudeT * lookDownExcess * config.autopilotLookDownBoost,
      0,
      1
    );

    if (autopilotStrength <= 0.0001) {
      return;
    }

    const levelForward = safeHorizontalForward(this.forward);
    const desiredForward = new THREE.Vector3(
      levelForward.x,
      config.autopilotMaxForwardYNearGround * autopilotStrength,
      levelForward.z
    ).normalize();

    const forwardBlend = 1.0 - Math.exp(
      -config.autopilotForwardLevelPower * autopilotStrength * dt
    );

    this.forward.lerp(desiredForward, forwardBlend).normalize();

    SCRATCH_RIGHT.crossVectors(WORLD_UP, this.forward);

    if (SCRATCH_RIGHT.lengthSq() < 0.0001) {
      SCRATCH_RIGHT.copy(this.right);
    }

    SCRATCH_RIGHT.normalize();
    SCRATCH_UP.crossVectors(this.forward, SCRATCH_RIGHT).normalize();

    const rollBlend = 1.0 - Math.exp(
      -config.autopilotRollLevelPower * autopilotStrength * dt
    );

    this.up.lerp(SCRATCH_UP, rollBlend).normalize();
    this.right.crossVectors(this.up, this.forward).normalize();
    this.up.crossVectors(this.forward, this.right).normalize();
    this.orthonormalize();
  }

  update(dt, elapsedTime, options = {}) {
    const input = this.input;
    const controls = input.controls;
    const actions = input.consumeActions();
    const config = createFlightConfig(options);
    const terrainHeightAtWorld = typeof options.terrainHeightAtWorld === "function"
      ? options.terrainHeightAtWorld
      : () => options.groundHeight ?? this.groundHeight;

    if (actions.reset) {
      this.reset({
        ...options,
        groundHeight: terrainHeightAtWorld(0, options.distance ?? 62, elapsedTime),
        terrainHeightAtWorld,
        timeSeconds: elapsedTime
      });
    }

    if (actions.rollLevel) {
      this.rollToZero();
    }

    const mouse = input.consumeMouseDelta();
    const sensitivity = config.mouseSensitivity;

    if (mouse.x !== 0) {
      this.rotateLocalYaw(-mouse.x * sensitivity);
    }

    if (mouse.y !== 0) {
      this.rotateLocalPitch(-mouse.y * sensitivity);
    }

    if (controls.keyboardYaw) {
      this.rotateLocalYaw(-controls.keyboardYaw * config.yawSpeed * dt);
    }

    if (controls.keyboardPitch) {
      this.rotateLocalPitch(controls.keyboardPitch * config.pitchSpeed * dt);
    }

    if (controls.rollInput) {
      this.rollLeveling = false;
      this.rotateLocalRoll(controls.rollInput * config.rollSpeed * dt);
    }

    this.updateRollLeveling(dt, config.rollLevelSpeed);

    const targetSpeed = clamp(controls.targetSpeed ?? config.speed, 0, config.speedMax);
    const speedBlend = 1.0 - Math.exp(-((targetSpeed > this.displaySpeed) ? config.speedEaseIn : config.speedEaseOut) * dt);
    this.displaySpeed += (targetSpeed - this.displaySpeed) * speedBlend;

    const boostTarget = controls.boost ? 1 : 0;
    const boostRate = boostTarget > this.afterburnerBlend ? config.afterburnerRise : config.afterburnerFall;
    this.afterburnerBlend += (boostTarget - this.afterburnerBlend) * (1.0 - Math.exp(-boostRate * dt));

    if (Math.abs(this.afterburnerBlend) < 0.0005) {
      this.afterburnerBlend = 0;
    }

    const normalSpeedMax = Math.max(1.0, config.speedMax);
    const normalSpeed = this.displaySpeed + (normalSpeedMax - this.displaySpeed) * this.afterburnerBlend;
    const speed = normalSpeed * (1.0 + (config.boostMultiplier - 1.0) * this.afterburnerBlend);

    this.normalSpeed = normalSpeed;
    this.normalSpeedMax = normalSpeedMax;

    const ground = terrainHeightAtWorld(this.position.x, this.position.z, elapsedTime);
    const heightAboveGround = this.position.y - ground;

    this.applyLowAltitudeAutopilot({
      dt,
      clearance: config.clearance,
      heightAboveGround,
      config
    });

    const throttle = clamp(
      config.throttleForward,
      config.throttleMinWhenSpeedAboveZero,
      config.throttleMax
    );

    let moveX = this.forward.x * speed * throttle;
    let moveY = this.forward.y * speed * throttle;
    let moveZ = this.forward.z * speed * throttle;

    moveX += this.right.x * speed * config.strafeInfluence * controls.strafeInput;
    moveY += this.right.y * speed * config.strafeInfluence * controls.strafeInput;
    moveZ += this.right.z * speed * config.strafeInfluence * controls.strafeInput;

    moveY += config.verticalSpeed * controls.verticalInput;

    const cushionRange = Math.max(config.cushionMinRange, config.clearance * config.cushionClearanceFactor);
    const cushionT = 1.0 - smoothstep(0.0, cushionRange, heightAboveGround - config.clearance);
    const predictedVerticalVelocity = moveY + this.velocityY;
    const isNearGround = cushionT > 0.0001;
    const isMovingDown = predictedVerticalVelocity < 0.0;
    const isLookingDown = this.forward.y < -0.02;
    const shouldApplyCushion = isNearGround && (isMovingDown || isLookingDown);

    if (shouldApplyCushion) {
      const downwardSpeed = Math.max(0.0, -predictedVerticalVelocity);
      const lookDownAmount = Math.max(0.0, -this.forward.y);
      const danger = clamp(downwardSpeed / Math.max(speed, 1.0) + lookDownAmount, 0.0, 1.0);
      const targetUpVelocity = cushionT * cushionT * danger * Math.max(
        config.cushionBaseUpVelocity,
        speed * config.cushionSpeedFactor
      );
      const approach = 1.0 - Math.exp(-config.cushionApproach * dt);

      this.velocityY += (targetUpVelocity - this.velocityY) * approach;
    } else {
      this.velocityY += (0.0 - this.velocityY) * (1.0 - Math.exp(-config.cushionDamping * dt));
    }

    this.velocityY *= Math.exp(-config.cushionDamping * dt);
    moveY += this.velocityY;

    if (config.escapeLookDownPower > 0 || config.escapeUpPower > 0) {
      const lookDownDanger = Math.max(0.0, -this.forward.y);
      const escapeDanger = shouldApplyCushion ? cushionT * cushionT * lookDownDanger : 0.0;
      const escapeSmooth = 1.0 - Math.exp(-config.escapeSmoothness * dt);
      const escapeSpeed = Math.max(config.escapeMinSpeed, speed * config.escapeSpeedFactor);
      const escapeAmount = escapeDanger * escapeSpeed * escapeSmooth;

      moveX += -this.forward.x * config.escapeLookDownPower * escapeAmount;
      moveY += -this.forward.y * config.escapeLookDownPower * escapeAmount;
      moveZ += -this.forward.z * config.escapeLookDownPower * escapeAmount;
      moveY += config.escapeUpPower * escapeAmount;
    }

    this.position.x += moveX * dt;
    this.position.y += moveY * dt;
    this.position.z += moveZ * dt;

    const newGround = terrainHeightAtWorld(this.position.x, this.position.z, elapsedTime);
    const newMinY = newGround + config.clearance;
    const maxY = newGround + config.maxAltitude;

    if (this.position.y < newMinY) {
      const penetration = newMinY - this.position.y;
      this.position.y += penetration * (1.0 - Math.exp(-config.groundCatchupSmoothness * dt));
      this.velocityY = Math.max(this.velocityY, penetration * 3.0);
    }

    this.position.y = clamp(this.position.y, newMinY - 0.02, maxY);
    this.groundHeight = newGround;

    return {
      ground: newGround,
      heightAboveGround: this.position.y - newGround,
      speed,
      normalSpeed: this.normalSpeed,
      normalSpeedMax: this.normalSpeedMax,
      afterburnerBlend: this.afterburnerBlend
    };
  }

  getCameraBasis() {
    return {
      position: this.position,
      right: this.right,
      up: this.up,
      forward: this.forward
    };
  }

  getPose() {
    return {
      position: this.position.toArray(),
      forward: this.forward.toArray(),
      right: this.right.toArray(),
      up: this.up.toArray(),
      rollTotal: this.rollTotal,
      targetSpeed: this.input?.controls?.targetSpeed ?? this.displaySpeed ?? 8
    };
  }

  setPose(pose = {}, { terrainHeightAtWorld = null, clearance = 150, elapsedTime = 0 } = {}) {
    if (!pose || typeof pose !== "object") {
      return;
    }

    if (Array.isArray(pose.position) && pose.position.length >= 3) {
      this.position.fromArray(pose.position);
    }

    if (Array.isArray(pose.forward) && pose.forward.length >= 3) {
      this.forward.fromArray(pose.forward);
    }

    if (Array.isArray(pose.right) && pose.right.length >= 3) {
      this.right.fromArray(pose.right);
    }

    if (Array.isArray(pose.up) && pose.up.length >= 3) {
      this.up.fromArray(pose.up);
    }

    this.rollTotal = Number.isFinite(Number(pose.rollTotal)) ? Number(pose.rollTotal) : 0;
    this.velocityY = 0;
    this.rollLeveling = false;
    this.afterburnerBlend = 0;

    const targetSpeed = Number(pose.targetSpeed ?? this.displaySpeed ?? 8);

    if (Number.isFinite(targetSpeed)) {
      this.displaySpeed = targetSpeed;
      this.normalSpeed = targetSpeed;

      if (this.input?.controls) {
        this.input.controls.targetSpeed = targetSpeed;
      }
    }

    this.orthonormalize();

    if (typeof terrainHeightAtWorld === "function") {
      const ground = terrainHeightAtWorld(this.position.x, this.position.z, elapsedTime);
      const safeY = ground + Math.max(0, clearance) + 0.25;

      if (this.position.y < safeY) {
        this.position.y = safeY;
      }

      this.groundHeight = ground;
    }
  }
}

function createFlightConfig(options) {
  return {
    mouseSensitivity: options.mouseSensitivity ?? 0.002,
    speed: options.speed ?? 8.0,
    speedMax: options.speedMax ?? 200.0,
    clearance: Math.max(150.0, options.clearance ?? 150.0),
    boostMultiplier: options.boostMultiplier ?? 2.0,
    maxAltitude: Math.max(5000.0, options.maxAltitude ?? 5000.0),

    yawSpeed: options.yawSpeed ?? 1.55,
    pitchSpeed: options.pitchSpeed ?? 1.0,
    rollSpeed: options.rollSpeed ?? 1.55,
    rollLevelSpeed: options.rollLevelSpeed ?? 4.5,

    throttleForward: options.throttleForward ?? 1.0,
    throttleMinWhenSpeedAboveZero: options.throttleMinWhenSpeedAboveZero ?? 0.04,
    throttleMax: options.throttleMax ?? 1.55,
    strafeInfluence: options.strafeInfluence ?? 1.25,
    verticalSpeed: options.verticalSpeed ?? 72.0,
    speedEaseIn: options.speedEaseIn ?? 20.0,
    speedEaseOut: options.speedEaseOut ?? 10.0,
    afterburnerRise: options.afterburnerRise ?? 2.8,
    afterburnerFall: options.afterburnerFall ?? 2.2,

    cushionMinRange: options.cushionMinRange ?? 1.8,
    cushionClearanceFactor: options.cushionClearanceFactor ?? 1.35,
    cushionBaseUpVelocity: options.cushionBaseUpVelocity ?? 3.5,
    cushionSpeedFactor: options.cushionSpeedFactor ?? 0.9,
    cushionApproach: options.cushionApproach ?? 6.0,
    cushionDamping: options.cushionDamping ?? 1.8,
    groundCatchupSmoothness: options.groundCatchupSmoothness ?? 14.0,

    nearDownLookLimit: options.nearDownLookLimit ?? -0.03,
    farDownLookLimit: options.farDownLookLimit ?? -1.0,
    lowAltitudeExtraBand: options.lowAltitudeExtraBand ?? 0.15,
    highAltitudeBand: options.highAltitudeBand ?? 9.0,
    autopilotHeightStart: options.autopilotHeightStart ?? 8.0,
    autopilotHeightFull: options.autopilotHeightFull ?? 1.2,
    autopilotForwardLevelPower: options.autopilotForwardLevelPower ?? 7.5,
    autopilotRollLevelPower: options.autopilotRollLevelPower ?? 5.0,
    autopilotLookDownBoost: options.autopilotLookDownBoost ?? 1.85,
    autopilotMaxForwardYNearGround: options.autopilotMaxForwardYNearGround ?? 0.06,

    escapeLookDownPower: options.escapeLookDownPower ?? 0.0,
    escapeUpPower: options.escapeUpPower ?? 0.0,
    escapeSmoothness: options.escapeSmoothness ?? 8.0,
    escapeMinSpeed: options.escapeMinSpeed ?? 12.0,
    escapeSpeedFactor: options.escapeSpeedFactor ?? 1.0
  };
}
