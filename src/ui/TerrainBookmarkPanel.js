export class TerrainBookmarkPanel {
  constructor({ rootElement, store, getBookmarkSnapshot }) {
    this.rootElement = rootElement;
    this.store = store;
    this.getBookmarkSnapshot = getBookmarkSnapshot;

    this.element = document.createElement("div");
    this.element.className = "terrain-bookmark-panel";

    this.unsubscribe = null;
    this.feedbackTimeout = null;
    this.feedbackVisible = false;
    this.handleClick = this.handleClick.bind(this);
    this.handlePointerBarrier = this.handlePointerBarrier.bind(this);
  }

  mount() {
    this.rootElement.appendChild(this.element);
    this.element.addEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.addEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.addEventListener("click", this.handleClick);

    this.unsubscribe = this.store.subscribe(() => {
      this.render();
    });

    this.render();
  }

  destroy() {
    this.unsubscribe?.();
    clearTimeout(this.feedbackTimeout);
    this.element.removeEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.removeEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.removeEventListener("click", this.handleClick);
    this.element.remove();
  }

  handlePointerBarrier(event) {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  handleClick(event) {
    const button = event.target.closest("[data-terrain-bookmark-action]");

    if (!button) {
      return;
    }

    const action = button.dataset.terrainBookmarkAction;

    if (action === "return-to-system") {
      this.store.returnToSystemView();
      return;
    }

    if (action !== "save") {
      return;
    }

    const snapshot = this.getBookmarkSnapshot?.();

    if (!snapshot) {
      return;
    }

    this.store.addTerrainBookmark(snapshot);
    this.showFeedback();
  }

  showFeedback() {
    clearTimeout(this.feedbackTimeout);
    this.feedbackVisible = true;
    this.render();

    this.feedbackTimeout = setTimeout(() => {
      this.feedbackVisible = false;
      this.render();
    }, 1450);
  }

  render() {
    const state = this.store.getState();

    if (state.activeView !== "terrain-view") {
      this.element.classList.remove("is-visible");
      this.element.innerHTML = "";
      return;
    }

    this.element.classList.add("is-visible");
    this.element.innerHTML = `
      <div class="terrain-bookmark-feedback${this.feedbackVisible ? " is-visible" : ""}">
        Location bookmarked
      </div>
      <div class="terrain-bookmark-actions">
        <button
          class="terrain-bookmark-button terrain-bookmark-button-secondary"
          type="button"
          data-terrain-bookmark-action="return-to-system"
        >
          Back to System
        </button>
        <button
          class="terrain-bookmark-button"
          type="button"
          data-terrain-bookmark-action="save"
        >
          Bookmark Location
        </button>
      </div>
    `;
  }
}
