export class StartupOverlay {
  constructor({ rootElement }) {
    this.rootElement = rootElement;
    this.element = document.createElement("div");
    this.element.className = "startup-overlay";

    this.titleElement = document.createElement("div");
    this.titleElement.className = "startup-overlay-title";

    this.messageElement = document.createElement("div");
    this.messageElement.className = "startup-overlay-message";

    this.progressElement = document.createElement("div");
    this.progressElement.className = "startup-overlay-progress";

    this.progressBarElement = document.createElement("div");
    this.progressBarElement.className = "startup-overlay-progress-bar";

    this.progressFillElement = document.createElement("div");
    this.progressFillElement.className = "startup-overlay-progress-fill";

    this.buttonElement = document.createElement("button");
    this.buttonElement.className = "startup-overlay-button";
    this.buttonElement.type = "button";

    this.progressBarElement.appendChild(this.progressFillElement);
    this.element.append(
      this.titleElement,
      this.messageElement,
      this.progressElement,
      this.progressBarElement,
      this.buttonElement
    );

    this.setClickToStart();
  }

  mount() {
    this.rootElement.appendChild(this.element);
  }

  setClickToStart() {
    this.titleElement.textContent = "Space-Flyer";
    this.messageElement.textContent = "Click to Start";
    this.progressElement.textContent = "";
    this.progressFillElement.style.width = "0%";
    this.buttonElement.textContent = "Start";
    this.buttonElement.disabled = false;
    this.element.classList.remove("is-working", "is-hidden");
  }

  onStart(callback) {
    this.buttonElement.addEventListener(
      "click",
      () => {
        callback();
      },
      { once: true }
    );
  }

  setWorking(message = "Computing shaders...") {
    this.titleElement.textContent = "Preparing Space-Flyer";
    this.messageElement.textContent = message;
    this.progressElement.textContent = "";
    this.progressFillElement.style.width = "0%";
    this.buttonElement.disabled = true;
    this.buttonElement.textContent = "Please wait";
    this.element.classList.add("is-working");
  }

  setProgress({ label, current, total }) {
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeCurrent = Math.min(safeTotal, Math.max(0, Number(current) || 0));
    const percent = (safeCurrent / safeTotal) * 100;

    this.messageElement.textContent = label ?? "Computing shaders...";
    this.progressElement.textContent = `${safeCurrent} / ${safeTotal}`;
    this.progressFillElement.style.width = `${percent.toFixed(1)}%`;
  }

  hide() {
    this.element.classList.add("is-hidden");

    window.setTimeout(() => {
      this.element.remove();
    }, 360);
  }
}
