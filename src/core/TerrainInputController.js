import { DEFAULT_KEY_BINDINGS, normalizeKeyBindings } from "./configSchema.js";
import { clamp } from "./math.js";

export class TerrainInputController {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.enabled = false;

    this.keys = new Set();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.lastHudMoveAt = 0;

    this.hudTarget = { x: 0, y: 0 };
    this.hudLagTarget = { x: 0, y: 0 };

    this.keyBindings = { ...DEFAULT_KEY_BINDINGS };

    this.controls = {
      targetSpeed: 8,
      currentSpeed: 8,
      rollInput: 0,
      strafeInput: 0,
      verticalInput: 0,
      boost: false
    };

    this.rollInputBlend = 0;

    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handlePointerLockChange = this.handlePointerLockChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);

    canvas.addEventListener("mousedown", this.handleMouseDown);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  setKeyBindings(bindings = DEFAULT_KEY_BINDINGS, options = {}) {
    this.keyBindings = normalizeKeyBindings(bindings, options);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);

    if (!this.enabled) {
      this.keys.clear();
      this.mouseDeltaX = 0;
      this.mouseDeltaY = 0;
      this.rollInputBlend = 0;
      this.controls.rollInput = 0;

      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock?.();
      }
    }
  }

  isPointerLocked() {
    return document.pointerLockElement === this.canvas;
  }

  handleMouseDown(event) {
    if (!this.enabled || event.button !== 0) {
      return;
    }

    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock?.();
    }
  }

  handlePointerLockChange() {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  handleMouseMove(event) {
    if (!this.enabled || document.pointerLockElement !== this.canvas) {
      return;
    }

    this.mouseDeltaX += event.movementX;
    this.mouseDeltaY += event.movementY;

    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight || 1);
    const nextX = this.hudTarget.x + event.movementX * 2.0 / h;
    const nextY = this.hudTarget.y - event.movementY * 2.0 / h;
    const length = Math.hypot(nextX, nextY);
    const radius = 1.18;

    if (length > radius) {
      const scale = radius / Math.max(0.00001, length);
      this.hudTarget.x = nextX * scale;
      this.hudTarget.y = nextY * scale;
    } else {
      this.hudTarget.x = nextX;
      this.hudTarget.y = nextY;
    }

    this.lastHudMoveAt = performance.now();
  }

  handleWheel(event) {
    if (!this.enabled || document.pointerLockElement !== this.canvas) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    this.controls.targetSpeed = clamp(
      this.controls.targetSpeed + direction * 0.8,
      0,
      200
    );
  }

  handleKeyDown(event) {
    if (!this.enabled) {
      return;
    }

    const forwardKey = this.keyBindings.forward ?? DEFAULT_KEY_BINDINGS.forward;
    const brakeKey = this.keyBindings.brake ?? DEFAULT_KEY_BINDINGS.brake;

    if (event.repeat && event.code !== forwardKey && event.code !== brakeKey) {
      return;
    }

    this.keys.add(event.code);

    if (event.code === "KeyR") {
      this.requestReset = true;
    }

    if (event.code === "KeyX") {
      this.requestRollLevel = true;
    }
  }

  handleKeyUp(event) {
    this.keys.delete(event.code);
  }

  consumeMouseDelta() {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  consumeActions() {
    const actions = {
      reset: Boolean(this.requestReset),
      rollLevel: Boolean(this.requestRollLevel)
    };

    this.requestReset = false;
    this.requestRollLevel = false;

    return actions;
  }

  update(dt) {
    const keys = this.keys;
    const binding = this.keyBindings ?? DEFAULT_KEY_BINDINGS;
    const forward = keys.has(binding.forward ?? DEFAULT_KEY_BINDINGS.forward) ? 1 : 0;
    const brake = keys.has(binding.brake ?? DEFAULT_KEY_BINDINGS.brake) ? 1 : 0;
    const strafeRight = keys.has(binding.strafeRight ?? DEFAULT_KEY_BINDINGS.strafeRight) ? 1 : 0;
    const strafeLeft = keys.has(binding.strafeLeft ?? DEFAULT_KEY_BINDINGS.strafeLeft) ? 1 : 0;
    const rollRight = keys.has(binding.rollRight ?? DEFAULT_KEY_BINDINGS.rollRight) ? 1 : 0;
    const rollLeft = keys.has(binding.rollLeft ?? DEFAULT_KEY_BINDINGS.rollLeft) ? 1 : 0;
    const verticalUp = keys.has(binding.up ?? DEFAULT_KEY_BINDINGS.up) ? 1 : 0;
    const verticalDown = keys.has(binding.down ?? DEFAULT_KEY_BINDINGS.down) ? 1 : 0;
    const arrowYawRight = keys.has("ArrowRight") ? 1 : 0;
    const arrowYawLeft = keys.has("ArrowLeft") ? 1 : 0;
    const arrowPitchUp = keys.has("ArrowUp") ? 1 : 0;
    const arrowPitchDown = keys.has("ArrowDown") ? 1 : 0;

    const rollTarget = rollRight - rollLeft;
    const rollRate = Math.abs(rollTarget) > Math.abs(this.rollInputBlend) ||
      rollTarget * this.rollInputBlend < 0
      ? 18.0
      : 6.5;
    const rollBlend = 1.0 - Math.exp(-rollRate * dt);
    this.rollInputBlend += (rollTarget - this.rollInputBlend) * rollBlend;

    if (Math.abs(this.rollInputBlend) < 0.0005 && rollTarget === 0) {
      this.rollInputBlend = 0;
    }

    this.controls.forwardInput = forward;
    this.controls.brakeInput = brake;
    this.controls.strafeInput = strafeRight - strafeLeft;
    this.controls.rollInput = this.rollInputBlend;
    this.controls.verticalInput = verticalUp - verticalDown;
    this.controls.keyboardYaw = arrowYawRight - arrowYawLeft;
    this.controls.keyboardPitch = arrowPitchUp - arrowPitchDown;
    this.controls.boost = keys.has("ShiftLeft") || keys.has("ShiftRight");

    if (forward) {
      this.controls.targetSpeed = clamp(this.controls.targetSpeed + 60 * dt, 0, 200);
    }

    if (brake) {
      this.controls.targetSpeed = clamp(this.controls.targetSpeed - 165 * dt, 0, 200);
    }

    const idleMs = performance.now() - this.lastHudMoveAt;

    if (idleMs >= 5000) {
      const blend = 1.0 - Math.exp(-2.4 * dt);
      this.hudTarget.x += (0 - this.hudTarget.x) * blend;
      this.hudTarget.y += (0 - this.hudTarget.y) * blend;
    }

    const lagBlend = 1.0 - Math.exp(-7.5 * dt);
    this.hudLagTarget.x += (this.hudTarget.x - this.hudLagTarget.x) * lagBlend;
    this.hudLagTarget.y += (this.hudTarget.y - this.hudLagTarget.y) * lagBlend;

    if (Math.abs(this.hudTarget.x) < 0.0005) this.hudTarget.x = 0;
    if (Math.abs(this.hudTarget.y) < 0.0005) this.hudTarget.y = 0;
    if (Math.abs(this.hudLagTarget.x) < 0.0005) this.hudLagTarget.x = 0;
    if (Math.abs(this.hudLagTarget.y) < 0.0005) this.hudLagTarget.y = 0;
  }

  destroy() {
    this.setEnabled(false);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }
}
