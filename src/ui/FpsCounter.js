export class FpsCounter {
  constructor({ rootElement }) {
    this.rootElement = rootElement;
    this.element = document.createElement("div");
    this.element.className = "fps-counter";
    this.element.id = "fpsCounter";
    this.element.innerHTML = `
      <canvas id="fpsCounterCanvas"></canvas>
      <div class="fps-readout">
        <div class="fps-label">FPS</div>
        <div id="fpsCounterValue">0</div>
      </div>
    `;

    this.canvas = this.element.querySelector("#fpsCounterCanvas");
    this.valueEl = this.element.querySelector("#fpsCounterValue");
    this.ctx = this.canvas?.getContext("2d") ?? null;
    this.history = new Array(96).fill(0);
    this.lastDrawTime = 0;
    this.visible = true;

    this.rootElement.appendChild(this.element);
    this.resize();
  }

  resize() {
    if (!this.canvas || !this.ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();

    const width = Math.max(2, Math.floor(rect.width * dpr));
    const height = Math.max(2, Math.floor(rect.height * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.element.classList.toggle("is-hidden", !this.visible);
  }

  push(fps) {
    this.history.push(fps);
    this.history.shift();

    if (this.valueEl) {
      this.valueEl.textContent = String(Math.round(fps));
    }
  }

  draw(now) {
    if (!this.visible || !this.canvas || !this.ctx) return;

    if (now - this.lastDrawTime < 120) {
      return;
    }

    this.lastDrawTime = now;
    this.resize();

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const pad = Math.max(10, w * 0.08);
    const graphX = pad;
    const graphY = pad;
    const graphW = w - pad * 2;
    const graphH = h - pad * 2;

    ctx.save();

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(155, 227, 255, 0.28)";
    ctx.lineWidth = 1;

    for (let i = 1; i <= 3; i++) {
      const y = graphY + graphH * i / 4;
      ctx.beginPath();
      ctx.moveTo(graphX, y);
      ctx.lineTo(graphX + graphW, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;

    const maxFps = 160.0;
    const step = graphW / Math.max(1, this.history.length - 1);

    ctx.beginPath();

    for (let i = 0; i < this.history.length; i++) {
      const fps = Math.max(0, Math.min(maxFps, this.history[i]));
      const x = graphX + i * step;
      const y = graphY + graphH - fps / maxFps * graphH;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.strokeStyle = "rgba(155, 227, 255, 0.95)";
    ctx.lineWidth = Math.max(1.5, w * 0.014);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(101, 216, 255, 0.30)";
    ctx.shadowBlur = 8;
    ctx.stroke();

    ctx.restore();
  }

  destroy() {
    this.element.remove();
  }
}
