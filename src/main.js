import { createDemoGalaxy } from "./data/createDemoGalaxy.js";
import { createStore } from "./core/store.js";
import { AppRenderer } from "./render/AppRenderer.js";
import { StarMapPanel } from "./ui/StarMapPanel.js";
import { StarLogPanel } from "./ui/StarLogPanel.js";
import { SystemConfigPanel } from "./ui/SystemConfigPanel.js";
import { SystemActionBar } from "./ui/SystemActionBar.js";
import { SystemInfoPanel } from "./ui/SystemInfoPanel.js";
import { SystemPlanetListPanel } from "./ui/SystemPlanetListPanel.js";
import { OptionsMenu } from "./ui/OptionsMenu.js";
import { StellarObjectDevPanel } from "./ui/StellarObjectDevPanel.js";
import { StellarObjectInfoPanel } from "./ui/StellarObjectInfoPanel.js";
import { TerrainBookmarkPanel } from "./ui/TerrainBookmarkPanel.js";
import { StartupOverlay } from "./ui/StartupOverlay.js";

import "./ui/star-map.css";

const appElement = document.querySelector("#app");

const startupOverlay = new StartupOverlay({
  rootElement: appElement
});

startupOverlay.mount();
startupOverlay.onStart(startApp);

async function startApp() {
  startupOverlay.setWorking("Computing shaders...");

  await nextFrame();

  const galaxyConfig = createDemoGalaxy();
  const store = createStore();

  const renderer = new AppRenderer({
    rootElement: appElement,
    galaxyConfig,
    store
  });

  await renderer.warmup({
    onProgress: ({ label, current, total }) => {
      startupOverlay.setProgress({ label, current, total });
    }
  });

  const rightOverlayStack = document.createElement("div");
  rightOverlayStack.className = "right-overlay-stack";
  appElement.appendChild(rightOverlayStack);

  const panel = new StarMapPanel({
    rootElement: rightOverlayStack,
    galaxyConfig,
    store
  });

  const starLogPanel = new StarLogPanel({
    rootElement: appElement,
    galaxyConfig,
    store
  });

  const systemConfigPanel = new SystemConfigPanel({
    rootElement: appElement,
    galaxyConfig,
    store
  });

  const systemActionBar = new SystemActionBar({
    rootElement: appElement,
    galaxyConfig,
    store
  });

  const systemInfoPanel = new SystemInfoPanel({
    rootElement: appElement,
    galaxyConfig,
    store
  });

  const systemPlanetListPanel = new SystemPlanetListPanel({
    rootElement: rightOverlayStack,
    galaxyConfig,
    store
  });

  const optionsMenu = new OptionsMenu({
    rootElement: appElement,
    galaxyConfig,
    store
  });

  const stellarObjectDevPanel = new StellarObjectDevPanel({
    rootElement: appElement,
    galaxyConfig,
    store
  });

  const stellarObjectInfoPanel = new StellarObjectInfoPanel({
    rootElement: appElement,
    galaxyConfig,
    store
  });

  const terrainBookmarkPanel = new TerrainBookmarkPanel({
    rootElement: appElement,
    store,
    getBookmarkSnapshot: () => renderer.views["terrain-view"]?.createTerrainBookmarkSnapshot?.() ?? null
  });

  panel.mount();
  starLogPanel.mount();
  systemConfigPanel.mount();
  systemActionBar.mount();
  systemInfoPanel.mount();
  systemPlanetListPanel.mount();
  optionsMenu.mount();
  stellarObjectDevPanel.mount();
  stellarObjectInfoPanel.mount();
  terrainBookmarkPanel.mount();
  renderer.start();
  startupOverlay.hide();
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
