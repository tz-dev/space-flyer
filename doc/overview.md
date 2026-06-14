# Space-Flyer — Project Overview

Current status: after the persistence, UI, controls, and adaptive terrain passes.

Project: browser-based space sim / visual sandbox built with Vite, Three.js, ES modules, JSON-first configuration, and separated runtime state.

Patch workflow for future work:

- Small changes: provide exact search/replace blocks with correct indentation.
- Larger integration passes: return a ZIP, excluding `node_modules` and `dist`.
- Do not touch unrelated areas when working on generator, shader, or renderer logic.
- Prefer minimal, testable, reversible changes.

---

## Current Feature Set

Space-Flyer now includes all originally planned main views and core systems:

- Star Map with signals, sectors, Star Log, bookmarks, and route lines.
- System View with star, planets, moons, rings, orbit lines, and gravity grid.
- Orbit View with focused planet/moon view, clouds, rings, local moon shadows, and aurora ribbons.
- Terrain View with flight controller, fullscreen terrain raymarching, sky, sun, planets/moons, weather, clouds, fog, atmosphere flow, aurora, and terrain bookmarks.
- Stellar Object View for black holes, neutron stars, pulsars, quasars, nebulae, and space-rock-like objects.
- Options Menu with Save/Load, Display, Camera, Map Settings, UI, Controls, Help, and Dev.
- Hybrid persistence with save/load config, browser save, and JSON export/import.
- Adaptive Terrain Performance for terrain-only render scaling and pixelation.
- Deterministic names and seed-based system, planet, and stellar-object generation.
- Dev/config panel for system, star, planet, terrain, atmosphere, fog, cloud, aurora, ring, moon, and space parameters.

Important performance note: Terrain View remains the most expensive rendering path. The main cost comes from fullscreen raymarching and repeated `terrainHeight()` evaluations per pixel. Adaptive Terrain Performance mitigates this, but it does not replace the future mesh/heightmap terrain path.

---

## Main Features

### Star Map

- 3D galaxy/signal view.
- Systems and stellar objects represented as signals.
- Hover, selection, and click flow.
- Star Log with visited systems and stellar objects.
- Bookmarks.
- Route lines enabled by default.
- Sector grid and UI color/opacity options.
- Unknown signals keep fixed map positions and can be hydrated from seed on load.

### System View

- Star, planets, moons, and rings.
- Planet surface materials for sphere preview.
- Orbit lines / orbit path material.
- Gravity grid with more subtle defaults.
- System Speed changes only the running simulation speed and should not reset planet positions.
- Planet/moon spacing in the starter system has been expanded compared to the older compact slots.
- Generated systems use deterministic slot and golden-angle logic; if a globally wider distribution is desired, starter-system and generator slots should stay synchronized.

### Orbit View

- Focused planet/moon view.
- Rings, clouds, aurora ribbons, and local moon shadows.
- Orbit cloud height is capped; orbit cloud opacity is separated from terrain cloud opacity.
- Orbit and Terrain colors are kept similar through shared RGB/Hue/Saturation-adjacent parameters, but they are not expected to match exactly.

### Terrain View

- Flight view above a terrain surface.
- Fullscreen raymarched terrain through `TerrainSurfaceMaterial`.
- Terrain sky with sun, visible planets/moons, and local rings.
- Weather renderer for rain/snow.
- Atmosphere, fog, clouds, and aurora.
- Terrain bookmarks.
- Max Render Distance exposed in the Options Menu.
- Terrain View Size affects only the terrain render target size.
- Adaptive Terrain FPS: target-FPS control with dynamic terrain-only render scale and optional pixelation.
- Canvas size / render target scaling no longer affects Star Map, System/Orbit, or Stellar Object views globally.

### Stellar Object View

- Separate view for special stellar objects.
- Back button and Tab/Mode Back return to Star Map.
- Info panel similar to system/planet info.
- Dev panel for stellar-object parameters.

### Save / Load Config

Hybrid persistence:

- The galaxy map / signal list is stored with fixed positions.
- Visited, bookmarked, edited, or currently active systems are stored as full snapshots.
- Unknown systems can be regenerated from seed plus stored map position/metadata.
- Stellar objects are handled the same way.
- Star Log, bookmarks, terrain bookmarks, route lines, options, and controls are saved.
- Transient runtime states such as FPS, pointer lock, hover, drag, transitions, and warmup are not saved.
- Browser save uses `localStorage["space-flyer.save.v1"]`.

---

## File Overview

### Root / Build

| File | Purpose |
|---|---|
| `package.json` | Vite project definition with `dev`, `build`, and `preview`. |
| `package-lock.json` | Lockfile; do not edit manually. |
| `index.html` | Vite entry point. |
| `README.md` | Public GitHub project description. |
| `overview.md` | Internal technical project overview. |
| `start.bat` | Convenience launcher for Windows. |
| `public/tex/*` | Surface and noise textures. |

### Entry / Core

| File | Purpose |
|---|---|
| `src/main.js` | App bootstrap: creates galaxy, store, renderer, UI, and frame loop. |
| `src/core/store.js` | Central runtime/progress/view state, selection, view switching, Star Log, bookmarks, restore. |
| `src/core/configSchema.js` | Normalizes all persistent config data, defaults, migrations, controls, display/render/terrain-view settings. |
| `src/core/saveGame.js` | Hybrid save/load, JSON import/export, browser save, save normalization, and galaxy hydration. |
| `src/core/math.js` | Math, random, and clamp helpers. |
| `src/core/events.js` | Event constants. |
| `src/core/starMapSectors.js` | Sector and map helpers. |
| `src/core/stellarObjects.js` | Stellar-object types, defaults, and normalization. |
| `src/core/TerrainInputController.js` | Terrain input, pointer lock, key bindings. |
| `src/core/TerrainFlightController.js` | Terrain flight logic, speed, boost, ground following. |

### Data / Generation

| File | Purpose |
|---|---|
| `src/data/createDemoGalaxy.js` | Demo galaxy, starter system, generated systems, seed hydration, and signal generation. |
| `src/generation/nameGenerator.js` | Deterministic names for stars, systems, planets, and stellar objects. |

Important generator rules:

- The starter system has a deterministic generated name instead of “Local Demo System”.
- The starter system contains 16 planets.
- Inner planets tend to be smaller/hotter, middle zones larger, outer zones smaller/colder again.
- Water worlds force atmosphere with maximum atmosphere-flow height.
- Cloud values are varied by the generator and normalized into safe ranges.
- Fog/cloud distances follow the terrain render distance.
- Aurora values are strongly constrained/normalized to keep the visual signature stable.

### Renderer

| File | Purpose |
|---|---|
| `src/render/AppRenderer.js` | Three.js renderer setup, view orchestration, render targets, composite, warp/transitions, warmup, resize, adaptive terrain performance. |

Important renderer rules:

- Star Map, System/Orbit, and Stellar Object views remain full-size.
- Terrain View may dynamically adjust render target scale and pixelation.
- Adaptive runtime values are not written back into persistent config.
- Warmup precompiles important shader paths.

### Views

| File | Purpose |
|---|---|
| `src/views/StarMapView.js` | 3D Star Map, signal points, sectors, Star Map input, route lines. |
| `src/views/SystemView.js` | System Map and Orbit View, star, planets, moons, rings, clouds, aurora, gravity grid, landing context. |
| `src/views/TerrainView.js` | Terrain View orchestration, render target size, flight, TerrainSurfaceMaterial, sky, weather, rings, bookmarks. |
| `src/views/StellarObjectView.js` | Separate view for black holes, neutron stars, pulsars, quasars, nebulae, and space rocks. |
| `src/views/system/moonGeometry.js` | Procedural moon geometry. |
| `src/views/system/surfaceTextureCache.js` | Surface texture registry and cache. |
| `src/views/system/systemViewConstants.js` | System/Orbit View constants. |
| `src/views/terrain/TerrainSkyObjectRenderer.js` | Sun, planets, and moons in the terrain sky. |
| `src/views/terrain/TerrainWeatherRenderer.js` | Rain/snow renderer. |
| `src/views/terrain/TerrainCloudRenderer.js` | Separate/older cloud renderer path. |
| `src/views/terrain/TerrainLocalRingRenderer.js` | Local ring rendering in Terrain View. |

### Terrain / Materials

| File | Purpose |
|---|---|
| `src/materials/TerrainSurfaceMaterial.js` | Main fullscreen terrain raymarcher; most expensive rendering core. |
| `src/materials/terrain/terrainRegistry.js` | Active terrain shader registry, parameter normalization, height sampler. |
| `src/materials/terrain/auroraLayer.js` | Aurora GLSL layer. |
| `src/materials/terrain/shaders/*.js` | Terrain biome modules with GLSL and optional JS height sampler. |
| `src/materials/TerrainCloudMaterial.js` | Cloud materials. |
| `src/materials/TerrainWeatherMaterial.js` | Weather material. |
| `src/materials/TerrainSkyObjectsMaterial.js` | Terrain sky objects. |
| `src/materials/TerrainLocalRingMaterial.js` | Local rings. |
| `src/materials/TerrainRingShadowSkyMaterial.js` | Ring shadows / sky. |
| `src/materials/TerrainGroundMaterial.js` | Debug/base material for the later mesh terrain path. |

Active terrain shaders in the registry:

- `none`
- `rocky`
- `frozen-lake`
- `mountain`
- `volcanic`
- `efficient-mountains`
- `biome-mountains`
- `triwave-ridges`
- `soft-dunes`
- `turbulent-sea`

Additional shader files may still exist in the tree, but are not necessarily registered as active shaders.

### System / Orbit Materials

| File | Purpose |
|---|---|
| `src/materials/PlanetSurfaceMaterial.js` | Planet/moon/cloud-shell surface material for System/Orbit/Terrain-sky rendering. |
| `src/materials/PlanetRingMaterial.js` | Ring disk geometry and ring material. |
| `src/materials/OrbitAuroraRibbonMaterial.js` | Orbit aurora ribbons. |
| `src/materials/OrbitPathMaterial.js` | Orbit lines. |
| `src/materials/GravityGridMaterial.js` | Gravity grid. |
| `src/materials/SunMaterial.js` | Star/sun shader. |
| `src/materials/SunHaloMaterial.js` | Sun halo. |
| `src/materials/StarNestSpaceMaterial.js` | Star Nest / volumetric space shader. |
| `src/materials/GradientStarsSpaceMaterial.js` | Gradient/starfield space shader. |
| `src/materials/SpaceBackgroundMaterial.js` | Star Map / background material. |
| `src/materials/StarPointMaterial.js` | Star Map points. |
| `src/materials/BlackHoleMaterial.js` | Shared stellar-object material. |
| `src/materials/FinalCompositeMaterial.js` | Final composite / postprocessing. |
| `src/materials/HudOverlayMaterial.js` | HUD overlay. |
| `src/materials/WarpTunnelMaterial.js` | Warp/transition effect. |

### UI

| File | Purpose |
|---|---|
| `src/ui/OptionsMenu.js` | Save/Load, Display, Camera, Map Settings, UI, Controls, Help, Dev. |
| `src/ui/SystemConfigPanel.js` | Large dev/config panel for system, star, planet, terrain, atmosphere, clouds, fog, aurora, rings, moons, and space. |
| `src/ui/SystemActionBar.js` | Bottom actions for System/Orbit/Terrain flows. |
| `src/ui/SystemInfoPanel.js` | System/planet info. |
| `src/ui/SystemPlanetListPanel.js` | Planet selection. |
| `src/ui/StellarObjectInfoPanel.js` | Stellar-object info. |
| `src/ui/StellarObjectDevPanel.js` | Stellar-object dev parameters. |
| `src/ui/StarLogPanel.js` | Star Log, bookmarks, route lines. |
| `src/ui/StarMapPanel.js` | Star Map info / selected signal. |
| `src/ui/TerrainBookmarkPanel.js` | Terrain location bookmarks. |
| `src/ui/TerrainCompassOverlay.js` | Terrain HUD/compass. |
| `src/ui/FpsCounter.js` | FPS display. |
| `src/ui/StartupOverlay.js` | Warmup/loading overlay. |
| `src/ui/star-map.css` | Global UI/panel styling. |
| `src/ui/system-panel/controlOptions.js` | Selects, slider metadata, and control options. |

---

## Data Flow

### App Start

```txt
main.js
→ createDemoGalaxy()
→ normalizeGalaxyConfig()
→ createStore(galaxyConfig)
→ AppRenderer + Views
→ UI Panels / Options / Overlay
→ renderer.start()
```

### Star Map → System / Stellar Object

```txt
StarMapView
→ select signal
→ Store selection / active signal
→ if system: SystemView
→ if stellar object: StellarObjectView
→ update Star Log / Route Lines
```

### System / Orbit

```txt
SystemView
→ read active system
→ render Star + Planets + Moons + Rings + Clouds + Aurora + Grid
→ Planet/Moon selection
→ Orbit View or Landing Context
```

### Terrain

```txt
SystemView.createLandingContextFromSector()
→ store.beginTerrainLanding()
→ TerrainView
→ TerrainSurfaceMaterial + TerrainSkyObjectRenderer + TerrainWeatherRenderer + TerrainLocalRingRenderer
→ Terrain Bookmark / Compass / HUD
```

### Save / Load

```txt
OptionsMenu Save Tab
→ createSaveGame({ galaxyConfig, storeState })
→ JSON/File/Clipboard/localStorage

Import:
parseSaveGameText()
→ buildGalaxyConfigFromSave()
→ replaceGalaxyConfigContents()
→ store.restoreProgress()
→ StarMapView resynchronizes galaxy geometry
```

---

## Default Controls

- `Esc`: Options/Menu.
- `F2`: Dev/Config Toggle.
- `W/S`: Increase/decrease speed.
- `A/D`: Strafe left/right.
- `Q/E`: Roll left/right.
- `Space/C`: Up/Down.
- `Tab`: Mode Back / return from Stellar Object View to Star Map.
- `Shift`: Boost.
- `R`: Reset Flight Position.
- `X`: Level Roll.

Note: Help shows the default bindings. Controls can be changed in the Options Menu; reserved and duplicate keys should be rejected.

---

## Known Limits / Next Internal Revisions

Important low-level topics for later revisions:

1. Improve Terrain View performance long-term with a mesh/heightmap/clipmap path.
2. Further unify generator rules: system zones, astro model/mass/radius, moon orbit spacing.
3. Consolidate terrain shaders into a Core + Extended pipeline.
4. Remove inactive old shader files or park them clearly.
5. Investigate the chunk warning through code splitting.
6. Keep aligning the System/Orbit/Terrain look without introducing unnecessary parallel paths.

---

## Build / Dev

```bash
npm ci
npm run dev
npm run build
npm run preview
```

If Vite/Esbuild binaries lose execute permissions after ZIP/OS transfer:

```bash
chmod +x node_modules/.bin/vite node_modules/vite/bin/vite.js node_modules/@esbuild/linux-x64/bin/esbuild || true
npm run build
```

Known build notes:

- `chunk > 500 kB` is expected at the moment.
- The earlier `sRGBEncoding` warning has been resolved.
