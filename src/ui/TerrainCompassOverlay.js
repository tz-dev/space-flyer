import * as THREE from "three";

const DEFAULT_SETTINGS = {
  enabled: true,
  opacity: 0.95,
  sizePx: 240,
  bottomPx: -10,
  translateYPx: 0,
  centerYOffset: 0.5,
  scale: 75,
  eclipticRadius: 1.0,
  labelScale: 1.04,
  speedRadiusScale: 1.04,
  controlRadiusScale: 1.15,
  speedLineWidth: 5,
  auxLineWidth: 4,
  speedTrackColor: "rgba(60, 220, 235, 0.20)",
  speedFillColor: "rgba(60, 220, 235, 0.95)",
  afterburnerColor: "rgba(255, 70, 70, 0.98)",
  controlColor: "rgba(60, 220, 235, 0.95)",
  controlGuideColor: "rgba(60, 220, 235, 0.12)",
  controlGapRadians: 0.12,
  glowBlur: 10
};

const ORIGIN = new THREE.Vector3(0, 0, 0);
const NORTH = new THREE.Vector3(0, 0, 1);
const SOUTH = new THREE.Vector3(0, 0, -1);
const EAST = new THREE.Vector3(1, 0, 0);
const WEST = new THREE.Vector3(-1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class TerrainCompassOverlay {
  constructor({ host = document.body } = {}) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "terrain-compass-overlay";
    this.ctx = this.canvas.getContext("2d");
    this.lastLayoutKey = "";

    Object.assign(this.canvas.style, {
      position: "fixed",
      left: "50%",
      top: "auto",
      zIndex: "16",
      pointerEvents: "none",
      display: "none",
      filter: "drop-shadow(0 0 10px rgba(0, 190, 255, 0.22))"
    });

    host.appendChild(this.canvas);
  }

  update({ active, settings = {}, flight, controls = {}, telemetry = {} }) {
    const config = { ...DEFAULT_SETTINGS, ...settings };
    const visible = Boolean(active && config.enabled && config.opacity > 0.001 && flight);

    this.canvas.style.display = visible ? "block" : "none";

    if (!visible || !this.ctx) {
      return;
    }

    this.applyLayout(config);
    this.draw({ config, flight, controls, telemetry });
  }

  applyLayout(config) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(120, Number(config.sizePx ?? DEFAULT_SETTINGS.sizePx));
    const width = Math.floor(size * dpr);
    const height = Math.floor(size * dpr);
    const layoutKey = `${width}:${height}:${size}:${config.bottomPx}:${config.translateYPx}:${config.opacity}`;

    if (layoutKey === this.lastLayoutKey) {
      return;
    }

    this.lastLayoutKey = layoutKey;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.style.bottom = `${Number(config.bottomPx ?? 0)}px`;
    this.canvas.style.transform = `translateX(-50%) translateY(${Number(config.translateYPx ?? 0)}px)`;
    this.canvas.style.opacity = String(clamp(Number(config.opacity ?? 1), 0, 1));
  }

  draw({ config, flight, controls, telemetry }) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cx = w * 0.5;
    const cy = h * Number(config.centerYOffset ?? DEFAULT_SETTINGS.centerYOffset);
    const scale = Number(config.scale ?? DEFAULT_SETTINGS.scale) * dpr;

    ctx.clearRect(0, 0, w, h);

    this.drawPanel(ctx, w, h, config);

    ctx.save();
    ctx.translate(cx, cy);

    const speedMax = Math.max(1, telemetry.normalSpeedMax ?? 200);
    const displaySpeed = Math.max(0, telemetry.normalSpeed ?? telemetry.speed ?? 0);
    const normalSpeed01 = clamp(displaySpeed / speedMax, 0, 1);
    const boostedMax = speedMax * 2.0;
    const afterburner01 = clamp((displaySpeed - speedMax) / Math.max(1.0, boostedMax - speedMax), 0, 1);
    const strafeInput = Number(controls.strafeInput ?? 0);
    const verticalInput = Number(controls.verticalInput ?? 0);

    this.drawSpeedAndControlRings({
      ctx,
      config,
      scale,
      normalSpeed01,
      afterburner01,
      strafeInput,
      verticalInput,
      dpr
    });

    this.drawDirectionalCompass({ ctx, config, flight, scale, dpr });
    this.drawReadout({ ctx, telemetry, controls, scale, dpr });

    ctx.restore();
  }

  drawPanel(ctx, w, h, config) {
    const panelCx = w * 0.5;
    const panelCy = h * Number(config.centerYOffset ?? DEFAULT_SETTINGS.centerYOffset);
    const panelRadius = Math.min(w, h) * 0.39;

    ctx.save();
    ctx.shadowColor = "rgba(255, 0, 200, 0.20)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(panelCx, panelCy, panelRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawSpeedAndControlRings({
    ctx,
    config,
    scale,
    normalSpeed01,
    afterburner01,
    strafeInput,
    verticalInput,
    dpr
  }) {
    const speedRadius = scale * Number(config.speedRadiusScale ?? DEFAULT_SETTINGS.speedRadiusScale);
    const controlRadius = scale * Number(config.controlRadiusScale ?? DEFAULT_SETTINGS.controlRadiusScale);
    const speedLineWidth = Number(config.speedLineWidth ?? DEFAULT_SETTINGS.speedLineWidth) * dpr;
    const auxLineWidth = Number(config.auxLineWidth ?? DEFAULT_SETTINGS.auxLineWidth) * dpr;
    const glowBlur = Number(config.glowBlur ?? DEFAULT_SETTINGS.glowBlur) * dpr;
    const halfGap = Number(config.controlGapRadians ?? DEFAULT_SETTINGS.controlGapRadians) * 0.5;
    const q = Math.PI * 0.25;

    const strokeArc = (radius, start, end, color, width, alpha = 1, counterClockwise = false) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = glowBlur;
      ctx.beginPath();
      ctx.arc(0, 0, radius, start, end, counterClockwise);
      ctx.stroke();
      ctx.restore();
    };

    strokeArc(
      speedRadius,
      0,
      Math.PI * 2,
      config.speedTrackColor ?? DEFAULT_SETTINGS.speedTrackColor,
      speedLineWidth
    );

    if (normalSpeed01 > 0.0001) {
      const cyanHalfSpan = Math.PI * normalSpeed01;

      strokeArc(
        speedRadius,
        Math.PI * 0.5,
        Math.PI * 0.5 + cyanHalfSpan,
        config.speedFillColor ?? DEFAULT_SETTINGS.speedFillColor,
        speedLineWidth
      );

      strokeArc(
        speedRadius,
        Math.PI * 0.5,
        Math.PI * 0.5 - cyanHalfSpan,
        config.speedFillColor ?? DEFAULT_SETTINGS.speedFillColor,
        speedLineWidth,
        1,
        true
      );
    }

    if (afterburner01 > 0.0001) {
      const redHalfSpan = Math.PI * afterburner01;

      strokeArc(
        speedRadius,
        Math.PI * 0.5,
        Math.PI * 0.5 + redHalfSpan,
        config.afterburnerColor ?? DEFAULT_SETTINGS.afterburnerColor,
        speedLineWidth * 0.92
      );

      strokeArc(
        speedRadius,
        Math.PI * 0.5,
        Math.PI * 0.5 - redHalfSpan,
        config.afterburnerColor ?? DEFAULT_SETTINGS.afterburnerColor,
        speedLineWidth * 0.92,
        1,
        true
      );
    }

    strokeArc(
      controlRadius,
      0,
      Math.PI * 2,
      config.controlGuideColor ?? DEFAULT_SETTINGS.controlGuideColor,
      auxLineWidth * 0.65
    );

    const controlColor = config.controlColor ?? DEFAULT_SETTINGS.controlColor;

    if (verticalInput > 0.001) {
      strokeArc(
        controlRadius,
        -Math.PI * 0.75 + halfGap,
        -Math.PI * 0.25 - halfGap,
        controlColor,
        auxLineWidth,
        0.35 + clamp(Math.abs(verticalInput), 0, 1) * 0.65
      );
    }

    if (verticalInput < -0.001) {
      strokeArc(
        controlRadius,
        Math.PI * 0.25 + halfGap,
        Math.PI * 0.75 - halfGap,
        controlColor,
        auxLineWidth,
        0.35 + clamp(Math.abs(verticalInput), 0, 1) * 0.65
      );
    }

    if (strafeInput > 0.001) {
      strokeArc(
        controlRadius,
        -q + halfGap,
        q - halfGap,
        controlColor,
        auxLineWidth,
        0.35 + clamp(Math.abs(strafeInput), 0, 1) * 0.65
      );
    }

    if (strafeInput < -0.001) {
      strokeArc(
        controlRadius,
        Math.PI * 0.75 + halfGap,
        Math.PI * 1.25 - halfGap,
        controlColor,
        auxLineWidth,
        0.35 + clamp(Math.abs(strafeInput), 0, 1) * 0.65
      );
    }
  }

  drawDirectionalCompass({ ctx, config, flight, scale, dpr }) {
    const project = (v) => {
      const x = v.dot(flight.right);
      const y = v.dot(flight.up);
      const z = v.dot(flight.forward);
      const persp = 1.0 / (1.7 + z * 0.55);

      return {
        x: x * scale * persp,
        y: -y * scale * persp,
        z
      };
    };

    const strokeLine = (a, b, color, width = 2, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * dpr;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    };

    const label = (text, p, color) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `bold ${12 * dpr}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4 * dpr;
      ctx.fillText(text, p.x, p.y);
      ctx.restore();
    };

    const gradient = ctx.createRadialGradient(0, 0, 12 * dpr, 0, 0, scale * 1.22);
    gradient.addColorStop(0, "rgba(255, 40, 210, 0.11)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, scale * 1.32, 0, Math.PI * 2);
    ctx.fill();

    const ring = [];
    const eclipticRadius = Number(config.eclipticRadius ?? DEFAULT_SETTINGS.eclipticRadius);

    for (let i = 0; i <= 144; i += 1) {
      const a = i / 144 * Math.PI * 2;
      ring.push(project(new THREE.Vector3(
        Math.cos(a) * eclipticRadius,
        0,
        Math.sin(a) * eclipticRadius
      )));
    }

    ctx.save();
    ctx.strokeStyle = "rgba(255, 140, 40, 0.78)";
    ctx.lineWidth = 1.4 * dpr;
    ctx.setLineDash([6 * dpr, 5 * dpr]);
    ctx.beginPath();

    for (let i = 0; i < ring.length; i += 1) {
      if (i === 0) {
        ctx.moveTo(ring[i].x, ring[i].y);
      } else {
        ctx.lineTo(ring[i].x, ring[i].y);
      }
    }

    ctx.stroke();
    ctx.restore();

    const origin = project(ORIGIN);
    const axes = [
      { name: "N", v: NORTH, color: "rgba(0, 255, 255, 0.95)" },
      { name: "S", v: SOUTH, color: "rgba(0, 180, 255, 0.70)" },
      { name: "E", v: EAST, color: "rgba(255, 70, 220, 0.95)" },
      { name: "W", v: WEST, color: "rgba(255, 70, 220, 0.70)" },
      { name: "UP", v: UP, color: "rgba(255, 255, 255, 0.92)" }
    ];

    axes
      .map((axis) => ({ ...axis, p: project(axis.v) }))
      .sort((a, b) => a.p.z - b.p.z)
      .forEach((axis) => {
        const alpha = axis.p.z < 0 ? 0.45 : 0.95;

        strokeLine(origin, axis.p, axis.color, axis.name === "UP" ? 2.4 : 2, alpha);
        label(axis.name, {
          x: axis.p.x * Number(config.labelScale ?? DEFAULT_SETTINGS.labelScale),
          y: axis.p.y * Number(config.labelScale ?? DEFAULT_SETTINGS.labelScale)
        }, axis.color);
      });

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.arc(0, 0, 4 * dpr, 0, Math.PI * 2);
    ctx.moveTo(-9 * dpr, 0);
    ctx.lineTo(9 * dpr, 0);
    ctx.moveTo(0, -9 * dpr);
    ctx.lineTo(0, 9 * dpr);
    ctx.stroke();
    ctx.restore();
  }

  drawReadout({ ctx, telemetry, controls, scale, dpr }) {
    const speed = Number(telemetry.normalSpeed ?? telemetry.speed ?? 0);
    const targetSpeed = Number(controls.targetSpeed ?? 0);
    const strafeInput = Number(controls.strafeInput ?? 0);

    ctx.save();
    ctx.fillStyle = "rgba(220, 255, 255, 0.88)";
    ctx.font = `bold ${10 * dpr}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 5 * dpr;
    ctx.fillText(`SPD ${speed.toFixed(1)} → ${targetSpeed.toFixed(1)}`, 0, scale * 0.45);
    ctx.fillText(`LR ${strafeInput.toFixed(2)}`, 0, scale * 0.63);
    ctx.restore();
  }

  destroy() {
    this.canvas.remove();
  }
}
