# Space-Flyer — Projektübersicht

Aktueller Stand: nach Persistence-/UI-/Controls-Pässen.

Projekt: Browser-Space-Sim / Visual-Sandbox mit Vite, Three.js, ES Modules, JSON-first Config und getrenntem Runtime-State.

Arbeitsstil für weitere Patches:

- Kleine Änderungen: exakte Suchen/Ersetzen-Blöcke, korrekt eingerückt.
- Größere Integrationspässe: ZIP zurückgeben, ohne `node_modules` und ohne `dist`.
- Keine Nebenbaustellen anfassen, wenn es um Generator-, Shader- oder Renderer-Logik geht.
- Änderungen bevorzugt minimal, testbar und rückbaubar halten.

---

## Aktueller Funktionsumfang

Space-Flyer enthält inzwischen alle ursprünglich geplanten Haupt-Views und Kernfunktionen:

- Star Map mit Signalen, Sektoren, Star Log, Bookmarks und Route Lines.
- System View mit Stern, Planeten, Monden, Ringen, Orbitlinien und Gravity Grid.
- Orbit View mit fokussierter Planet-/Mondansicht, Clouds, Ringen, lokalen Mondschatten und Aurora-Ribbons.
- Terrain View mit Flight Controller, Fullscreen-Terrain-Raymarching, Himmel, Sonne, Planeten/Monden, Wetter, Clouds, Fog, Atmosphere Flow, Aurora und Terrain Bookmarks.
- Stellar Object View für Black Hole, Neutron Star, Pulsar, Quasar, Nebula und Space-Rock-ähnliche Objekte.
- Options Menu mit Save/Load, Display, Camera, Map Settings, UI, Controls, Help und Dev.
- Hybrid-Persistenz mit Save/Load-Config, Browser-Save und JSON-Export/Import.
- Adaptive Terrain Performance für Terrain-only Render Scaling und Pixelation.
- Deterministische Namen und Seed-basierte System-/Planet-/Stellar-Object-Generierung.
- Dev-/Config-Panel für System-, Star-, Planet-, Terrain-, Atmosphere-, Fog-, Cloud-, Aurora-, Ring-, Moon- und Space-Parameter.

Wichtiger Performance-Befund bleibt: Der Terrain View ist der teuerste Pfad. Die Hauptkosten kommen von Fullscreen-Raymarching und vielen wiederholten `terrainHeight()`-Auswertungen pro Pixel. Adaptive Terrain Performance mildert das, ersetzt aber noch nicht den späteren Mesh-/Heightmap-Terrainpfad.

---

## Aktuelle Hauptfeatures

### Star Map

- 3D-Galaxy-/Signal-Ansicht.
- Systeme und Stellar Objects als Signale.
- Hover/Selection/Click-Flow.
- Star Log mit besuchten Systemen und Stellar Objects.
- Bookmarks.
- Route Lines default aktiv.
- Sektorgitter und UI-Farb-/Opacity-Optionen.
- Unknown Signals bleiben auf der Map fix, können aber beim Laden seed-basiert neu hydriert werden.

### System View

- Stern, Planeten, Monde und Ringe.
- Planet Surface Materials für Sphere-Preview.
- Orbit Lines / Orbit Path Material.
- Gravity Grid mit dezenterem Default.
- System Speed verändert nur laufende Simulationsgeschwindigkeit und soll Planetpositionen nicht resetten.
- Planeten-/Mondverteilung im Startsystem wurde gegenüber den alten Slots deutlich auseinandergezogen.
- Generierte Systeme nutzen deterministische Slot-/Golden-Angle-Logik; bei global gewünschter großzügiger Verteilung sollten Startsystem- und Generator-Slots synchron gehalten werden.

### Orbit View

- Fokussierte Ansicht von Planet/Mond.
- Rings, Clouds, Aurora-Ribbons und lokale Mondschatten.
- Orbit Cloud Height ist begrenzt; Orbit Cloud Opacity ist von Terrain Cloud Opacity getrennt.
- Orbit-/Terrain-Farben werden über gemeinsame RGB-/Hue-/Saturation-nahe Parameter ähnlich gehalten, aber nicht exakt identisch.

### Terrain View

- Flight View über einer Terrain-Oberfläche.
- Fullscreen-Raymarch-Terrain über `TerrainSurfaceMaterial`.
- Terrain-Himmel mit Sonne, sichtbaren Planeten/Monden und lokalem Ring.
- Weather Renderer für Rain/Snow.
- Atmosphere, Fog, Clouds und Aurora.
- Terrain Bookmarks.
- Max Render Distance über Options-Menü.
- Terrain View Size wirkt terrain-only auf die RenderTarget-Größe.
- Adaptive Terrain FPS: Target-FPS-Regler mit dynamischer terrain-only RenderScale und optionaler Pixelation.
- Canvas Size / RenderTarget-Skalierung wirkt nicht mehr global auf Star/System/Orbit/Stellar Views.

### Stellar Object View

- Separate View für besondere Stellar Objects.
- Back Button und Tab/Mode-Back zurück zur Star Map.
- Info Panel ähnlich System-/Planet-Info.
- Dev Panel für Stellar-Object-Parameter.

### Save / Load Config

Hybrid-Persistenz:

- Galaxy Map / Signal-Liste wird fix gespeichert.
- Besuchte, bookmarkte, editierte oder aktuelle Systeme werden als Full Snapshot gespeichert.
- Unbekannte Systeme können aus Seed + gespeicherter Position/Map-Metadaten neu erzeugt werden.
- Stellar Objects werden analog behandelt.
- Star Log, Bookmarks, Terrain Bookmarks, Route Lines, Options und Controls werden gespeichert.
- Transiente Runtime-Zustände wie FPS, Pointer Lock, Hover, Drag, Transitionen und Warmup werden nicht gespeichert.
- Browser-Save nutzt `localStorage["space-flyer.save.v1"]`.

---

## File Overview

### Root / Build

| Datei | Aufgabe |
|---|---|
| `package.json` | Vite-Projektdefinition mit `dev`, `build`, `preview`. |
| `package-lock.json` | Lockfile, nicht manuell editieren. |
| `index.html` | Einstiegspunkt für Vite. |
| `README.md` | Öffentliche GitHub-Projektbeschreibung. |
| `overview.md` | Interne technische Projektübersicht. |
| `start.bat` | Windows-Komfortstart. |
| `public/tex/*` | Surface-/Noise-Texturen. |

### Einstieg / Core

| Datei | Aufgabe |
|---|---|
| `src/main.js` | App-Bootstrap: Galaxy erzeugen, Store, Renderer, UI und Frame Loop initialisieren. |
| `src/core/store.js` | Zentraler Runtime-/Progress-/View-State, Selection, View-Wechsel, Star Log, Bookmarks, Restore. |
| `src/core/configSchema.js` | Normalisierung aller persistenten Config-Daten, Defaults, Migrationen, Controls, Display/Render/TerrainView. |
| `src/core/saveGame.js` | Hybrid Save/Load, JSON-Import/Export, Browser-Save, Save-Normalisierung und Galaxy-Hydration. |
| `src/core/math.js` | Math-/Random-/Clamp-Helfer. |
| `src/core/events.js` | Event-Konstanten. |
| `src/core/starMapSectors.js` | Sektor-/Map-Helfer. |
| `src/core/stellarObjects.js` | Stellar-Object-Typen, Defaults und Normalisierung. |
| `src/core/TerrainInputController.js` | Terrain-Input, Pointer Lock, Keybinds. |
| `src/core/TerrainFlightController.js` | Terrain-Fluglogik, Speed, Boost, Ground Following. |

### Daten / Generation

| Datei | Aufgabe |
|---|---|
| `src/data/createDemoGalaxy.js` | Demo-Galaxy, Startsystem, generierte Systeme, Seed-Hydration und Signal-Generation. |
| `src/generation/nameGenerator.js` | Deterministische Namen für Sterne, Systeme, Planeten und Stellar Objects. |

Wichtige Generator-Regeln:

- Startsystem hat deterministischen generierten Namen statt „Local Demo System“.
- Startsystem enthält 16 Planeten.
- Innere Planeten eher kleiner/heißer, mittlere Zonen größer, äußere wieder kleiner/kälter.
- Wasserwelten erzwingen Atmosphäre mit maximaler Atmosphere-Flow-Height.
- Cloud-Werte werden generatorseitig stärker variiert und in sichere Bereiche normalisiert.
- Fog-/Cloud-Distanzen folgen der Terrain Render Distance.
- Aurora-Werte werden stark eingeschränkt/normalisiert, damit die visuelle Signatur stabil bleibt.

### Renderer

| Datei | Aufgabe |
|---|---|
| `src/render/AppRenderer.js` | Three.js Renderer Setup, View-Orchestrierung, RenderTargets, Composite, Warp/Transitions, Warmup, Resize, Adaptive Terrain Performance. |

Wichtige Renderer-Regeln:

- Star Map, System/Orbit und Stellar Object View bleiben full-size.
- Terrain View darf dynamisch RenderTarget-Scale und Pixelation anpassen.
- Adaptive Runtime-Werte werden nicht in die persistente Config zurückgeschrieben.
- Warmup kompiliert wichtige Shaderpfade vor.

### Views

| Datei | Aufgabe |
|---|---|
| `src/views/StarMapView.js` | 3D Star Map, Signalpunkte, Sektoren, StarMap-Input, Route Lines. |
| `src/views/SystemView.js` | System Map und Orbit View, Stern, Planeten, Monde, Ringe, Clouds, Aurora, Gravity Grid, Landing Context. |
| `src/views/TerrainView.js` | Terrain View Orchestrierung, RenderTarget-Größe, Flight, TerrainSurfaceMaterial, Himmel, Weather, Rings, Bookmarks. |
| `src/views/StellarObjectView.js` | Separate View für Black Hole / Neutron Star / Pulsar / Quasar / Nebula / Space Rock. |
| `src/views/system/moonGeometry.js` | Prozedurale Moon-Geometrie. |
| `src/views/system/surfaceTextureCache.js` | Surface Texture Registry und Cache. |
| `src/views/system/systemViewConstants.js` | System-/Orbit-View-Konstanten. |
| `src/views/terrain/TerrainSkyObjectRenderer.js` | Sonne, Planeten und Monde im Terrain-Himmel. |
| `src/views/terrain/TerrainWeatherRenderer.js` | Rain/Snow Renderer. |
| `src/views/terrain/TerrainCloudRenderer.js` | Separater/älterer Cloud-Renderer-Pfad. |
| `src/views/terrain/TerrainLocalRingRenderer.js` | Lokale Ringdarstellung im Terrain View. |

### Terrain / Materials

| Datei | Aufgabe |
|---|---|
| `src/materials/TerrainSurfaceMaterial.js` | Haupt-Fullscreen-Terrain-Raymarcher, teuerster Kern. |
| `src/materials/terrain/terrainRegistry.js` | Aktive Terrain-Shader-Registry, Param-Normalisierung, Height-Sampler. |
| `src/materials/terrain/auroraLayer.js` | Aurora GLSL-Layer. |
| `src/materials/terrain/shaders/*.js` | Terrain-Biome-Module mit GLSL und optionalem JS-Height-Sampler. |
| `src/materials/TerrainCloudMaterial.js` | Cloud-Materialien. |
| `src/materials/TerrainWeatherMaterial.js` | Wetter-Material. |
| `src/materials/TerrainSkyObjectsMaterial.js` | Terrain-Himmelsobjekte. |
| `src/materials/TerrainLocalRingMaterial.js` | Lokale Ringe. |
| `src/materials/TerrainRingShadowSkyMaterial.js` | Ring-Schatten/Himmel. |
| `src/materials/TerrainGroundMaterial.js` | Debug-/Basis-Material für späteres Mesh-Terrain. |

Aktive Terrain Shader in der Registry:

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

Weitere Shaderdateien können noch im Baum liegen, sind aber nicht zwingend aktiv registriert.

### System / Orbit Materials

| Datei | Aufgabe |
|---|---|
| `src/materials/PlanetSurfaceMaterial.js` | Planeten-/Mond-/Cloud-Shell-Surface in System/Orbit/Terrain-Himmel. |
| `src/materials/PlanetRingMaterial.js` | Ring-Disk-Geometrie und Ringmaterial. |
| `src/materials/OrbitAuroraRibbonMaterial.js` | Orbit-Aurora-Ribbons. |
| `src/materials/OrbitPathMaterial.js` | Orbitlinien. |
| `src/materials/GravityGridMaterial.js` | Gravity Grid. |
| `src/materials/SunMaterial.js` | Stern-/Sonnen-Shader. |
| `src/materials/SunHaloMaterial.js` | Sonnenhalo. |
| `src/materials/StarNestSpaceMaterial.js` | Star Nest / volumetrischer Space Shader. |
| `src/materials/GradientStarsSpaceMaterial.js` | Gradient-/Starfield-Space-Shader. |
| `src/materials/SpaceBackgroundMaterial.js` | Star Map / Background-Material. |
| `src/materials/StarPointMaterial.js` | Star Map Points. |
| `src/materials/BlackHoleMaterial.js` | Stellar Object Sammelmaterial. |
| `src/materials/FinalCompositeMaterial.js` | Final Composite / Postprocessing. |
| `src/materials/HudOverlayMaterial.js` | HUD Overlay. |
| `src/materials/WarpTunnelMaterial.js` | Warp-/Transition-Effekt. |

### UI

| Datei | Aufgabe |
|---|---|
| `src/ui/OptionsMenu.js` | Save/Load, Display, Camera, Map Settings, UI, Controls, Help, Dev. |
| `src/ui/SystemConfigPanel.js` | Großes Dev-/Config-Panel für System, Star, Planet, Terrain, Atmosphere, Clouds, Fog, Aurora, Rings, Moons, Space. |
| `src/ui/SystemActionBar.js` | Bottom Actions für System/Orbit/Terrain-Flows. |
| `src/ui/SystemInfoPanel.js` | System-/Planet-Info. |
| `src/ui/SystemPlanetListPanel.js` | Planet Selection. |
| `src/ui/StellarObjectInfoPanel.js` | Stellar-Object-Info. |
| `src/ui/StellarObjectDevPanel.js` | Stellar-Object-Dev-Parameter. |
| `src/ui/StarLogPanel.js` | Star Log, Bookmarks, Route Lines. |
| `src/ui/StarMapPanel.js` | Star Map Info / Selected Signal. |
| `src/ui/TerrainBookmarkPanel.js` | Terrain Location Bookmarks. |
| `src/ui/TerrainCompassOverlay.js` | Terrain HUD/Compass. |
| `src/ui/FpsCounter.js` | FPS Anzeige. |
| `src/ui/StartupOverlay.js` | Warmup-/Loading-Overlay. |
| `src/ui/star-map.css` | Globales UI-/Panel-Styling. |
| `src/ui/system-panel/controlOptions.js` | Selects, Slider-Metadaten und Control-Optionen. |

---

## Datenfluss

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
→ Signal auswählen
→ Store Selection / Active Signal
→ bei System: SystemView
→ bei Stellar Object: StellarObjectView
→ Star Log / Route Lines aktualisieren
```

### System / Orbit

```txt
SystemView
→ Active System lesen
→ Star + Planets + Moons + Rings + Clouds + Aurora + Grid rendern
→ Planet/Moon Selection
→ Orbit View oder Landing Context
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
→ StarMapView synchronisiert Galaxy-Geometrie neu
```

---

## Controls Defaults

- `Esc`: Options/Menu.
- `F2`: Dev/Config Toggle.
- `W/S`: Speed erhöhen/verringern.
- `A/D`: Strafe links/rechts.
- `Q/E`: Roll links/rechts.
- `Space/C`: Up/Down.
- `Tab`: Mode Back / Stellar Object zurück zur Star Map.
- `Shift`: Boost.
- `R`: Reset Flight Position.
- `X`: Level Roll.

Hinweis: Help zeigt Default-Belegung. Controls können im Options-Menü gesetzt werden; reservierte/doppelte Keys sollen verhindert werden.

---

## Bekannte Grenzen / nächste interne Revisionen

Wichtige Low-Level-Themen für spätere Revisionen:

1. TerrainView-Performance langfristig durch Mesh-/Heightmap-/Clipmap-Pfad verbessern.
2. Generator-Regeln weiter vereinheitlichen: Systemzonen, AstroModel/Masse/Radius, Moon-Orbit-Spacing.
3. Terrain Shader zu Core + Extended Pipeline konsolidieren.
4. Inaktive alte Shaderdateien bereinigen oder eindeutig parken.
5. Chunk-Warnung durch Code-Splitting prüfen.
6. System-/Orbit-/Terrain-Look weiter angleichen, ohne neue Nebenpfade zu erzeugen.

---

## Build / Dev

```bash
npm ci
npm run dev
npm run build
npm run preview
```

Falls Vite/Esbuild-Binaries nach ZIP-/OS-Wechsel keine Execute-Rechte haben:

```bash
chmod +x node_modules/.bin/vite node_modules/vite/bin/vite.js node_modules/@esbuild/linux-x64/bin/esbuild || true
npm run build
```

Bekannte Build-Hinweise:

- `chunk > 500 kB` ist aktuell erwartbar.
- Die frühere `sRGBEncoding`-Warnung wurde bereinigt.
