# Idle Civilization

A 2D cartoon idle civilization game: grow a tiny Stone Age settlement into a futuristic empire.
HTML5 + CSS3 + vanilla JavaScript (ES modules) + Canvas 2D + JSON data. No build step.

## Running locally

ES modules and `fetch` need HTTP, so do not open `index.html` by double-clicking. From this folder:

    python3 -m http.server 8000

then open http://localhost:8000.

## Development status

- Phase 1 - Foundation and core interface: DONE
- Phase 2 - Economy and resource production: DONE
- Phase 3 - Buildings and population: DONE
- Phase 4 - Eras and civilization expansion: DONE
- Phase 5 - Research, technologies, upgrades, achievements, statistics: DONE
- Phase 6 - Prestige (Civilization Legacy) and offline progression: DONE
- Phase 7 - Saving and CrazyGames SDK integration: DONE
- Phase 8 - Visual/audio polish and release preparation: DONE
- Phase 8b - Fixed mobile layout and HD visual upgrade: DONE

## Buildings and population (Phase 3)

- `BuildingSystem` - build and upgrade. A building type has a `count` and one shared `level`; upgrading raises every copy (+50% output per level, `levelProductionBonus`). Upgrade cost = `upgrade.cost * growth^(level-1)`.
- `PopulationSystem` - citizens grow one at a time while housing and a food reserve exist (faster in later eras), and leave one by one while starving. Employment: `jobs` per building copy; auto-assign fills open jobs, least-staffed first; manual +/- in the Population panel.
- Staffing: buildings always work on their own; a fully staffed building produces up to double (`workerStaffingBonus`). Each citizen also adds +1% to all production (`populationBonusPerCitizen`).
- Rendering: `BuildingRenderer` lays out up to 3 copies per type (procedural sprites, level badges); `CitizenRenderer` walks workers to their building and animates work; idle citizens wander. Both are depth-sorted together in `CivilizationRenderer`.
- Events added: `building:upgrade`, `building:upgraded`, `workers:assign`, `workers:auto`, `workers:changed`, `population:changed`, `population:grew`.
- New building fields in `data/buildings.json`: `jobs`, `upgrade {cost, growth}`, `maxCount` (optional).

## Economy (Phase 2)

- `ResourceSystem` - only place amounts change; storage caps (base + building storage, times multipliers); spend/afford.
- `ProductionSystem` - computes rates: `output / interval * count * levelMultiplier`, times named modifiers (`setModifier(source, resource|"all", mult)`). Includes a small free "foraging" income from `balance.config.json`.
- `EconomySystem` - per-tick order: citizens eat, production applied, input-consuming buildings run at the efficiency of their scarcest input, starvation flagged (`economy:starving`). Also `costFor()` (geometric cost growth).
- `BuildingSystem` - handles `building:buy`; era and unlock checks; recalculates housing (upgrades and workers: Phase 3).
- Add a building by editing `data/buildings.json` (fields: cost, costGrowth, output, interval, input, housing, storage, unlock).

## Architecture and communication

| Layer | Files | Responsibility |
|---|---|---|
| Core | `js/core/*` | `Game` boots and ticks systems; `GameLoop` fixed-step logic + rAF render; `GameState` is the only gameplay store; `EventBus` is the only channel between systems and UI; `AssetLoader` loads JSON/images. |
| Rendering | `js/rendering/*` | Read-only drawing of `GameState` to the canvas. `CanvasRenderer` owns the canvas and scaling; `CivilizationRenderer` draws the scene using `BuildingRenderer`, `CitizenRenderer`, `AnimationManager`. |
| Systems | `js/systems/*` | Gameplay rules (economy, population, research, ...). Each exposes `update(dt)`, mutates `GameState`, and announces changes with `EventBus`. Implemented from Phase 2 onward. |
| UI | `js/ui/*` | DOM views. `UIManager` owns navigation and panels; panels read `GameState` and request actions via the bus. Never contains economy math. |
| Data | `data/*.json`, `config/*.json` | All content and balance numbers. Add eras, buildings, upgrades by editing JSON. |
| Utils | `js/utils/*` | Number formatting, math, time, validation helpers. |

### Event catalogue (generated from the code)

Systems and UI only talk through these events; the UI reads `GameState` and requests actions by emitting events.

| Event | Emitted by | Listened by |
|---|---|---|
| `achievement:unlocked` | AchievementSystem | AudioManager, SaveSystem |
| `ads:ended` | CrazyGamesIntegration | Game |
| `ads:rewarded` | AdRewardSystem | AudioManager |
| `ads:started` | CrazyGamesIntegration | Game |
| `ads:watch` | HUD, OfflineSystem | AdRewardSystem |
| `audio:mute` | Game | AudioManager |
| `building:built` | BuildingSystem | AudioManager, CivilizationRenderer |
| `building:buy` | BuildingPanel | BuildingSystem |
| `building:changed` | BuildingSystem | BuildingSystem, PopulationSystem, ProductionSystem, ResourceSystem, SaveSystem |
| `building:upgrade` | BuildingPanel | BuildingSystem |
| `building:upgraded` | BuildingSystem | AudioManager, CivilizationRenderer |
| `crazygames:ready` | CrazyGamesIntegration | - |
| `economy:starving` | EconomySystem | UIManager |
| `era:advance` | EraPanel | EraSystem |
| `era:changed` | EraSystem, PrestigeSystem | AudioManager, BuildingSystem, CivilizationRenderer, HUD, SaveSystem |
| `era:readiness` | EraSystem, PrestigeSystem | HUD |
| `game:ready` | Game | - |
| `keydown` | (UI / external) | AudioManager |
| `modal:open` | EraPanel, EraSystem, Game, HUD, OfflineSystem, PrestigePanel, PrestigeSystem, SettingsPanel | UIManager |
| `mods:changed` | EffectSystem | BuildingSystem, ProductionSystem |
| `notify` | AchievementSystem, AdRewardSystem, BuildingSystem, EraSystem, Game, NotificationManager, PopulationSystem, PrestigeSystem, ResearchSystem, SaveSystem, SettingsPanel, UIManager, UpgradeSystem | AudioManager, NotificationManager |
| `offline:done` | OfflineSystem | AudioManager |
| `offline:process` | (UI / external) | OfflineSystem |
| `panel:changed` | UIManager | - |
| `pointerdown` | (UI / external) | AudioManager |
| `population:changed` | PopulationSystem | - |
| `population:grew` | PopulationSystem | AudioManager, CivilizationRenderer |
| `prestige:ascend` | PrestigePanel | PrestigeSystem |
| `prestige:bought` | PrestigeSystem | AudioManager, SaveSystem |
| `prestige:buy` | PrestigePanel | PrestigeSystem |
| `prestige:done` | PrestigeSystem | AudioManager, SaveSystem |
| `research:completed` | ResearchSystem | AudioManager, BuildingSystem, SaveSystem, TechnologySystem |
| `research:start` | ResearchPanel | ResearchSystem |
| `research:started` | ResearchSystem | - |
| `resource:changed` | ResourceSystem | - |
| `save:import` | SettingsPanel | SaveSystem |
| `save:imported` | SaveSystem | Game |
| `save:now` | SettingsPanel | SaveSystem |
| `save:request` | AdRewardSystem | SaveSystem |
| `save:reset` | SettingsPanel | SaveSystem |
| `save:status` | SaveSystem | HUD |
| `save:wiped` | SaveSystem | Game |
| `settings:changed` | HUD, SettingsPanel | AudioManager, HUD |
| `touchstart` | (UI / external) | AudioManager |
| `upgrade:bought` | UpgradeSystem | AudioManager, SaveSystem |
| `upgrade:buy` | UpgradePanel | UpgradeSystem |
| `workers:assign` | PopulationPanel | PopulationSystem |
| `workers:auto` | PopulationPanel | PopulationSystem |
| `workers:autoassign` | (UI / external) | PopulationSystem |
| `workers:changed` | PopulationSystem | ProductionSystem |

## File reference (every JavaScript file)

| File | Responsibility |
|---|---|
| `js/core/AssetLoader.js` | AssetLoader - loads JSON definitions and (later) images/audio |
| `js/core/AudioManager.js` | AudioManager - all sound is generated with the Web Audio API (no audio files, so nothing to license or download) |
| `js/core/EventBus.js` | EventBus - tiny publish/subscribe hub |
| `js/core/Game.js` | Game - the core controller |
| `js/core/GameLoop.js` | GameLoop - drives logic ticks at a fixed rate and render frames at display rate |
| `js/core/GameState.js` | StatMods - additive stat bonuses from named sources (upgrades, technologies, achievements, prestige) |
| `js/integrations/CrazyGamesIntegration.js` | CrazyGamesIntegration - the only file that touches the CrazyGames SDK |
| `js/main.js` | Entry point |
| `js/rendering/AnimationManager.js` | AnimationManager - short-lived canvas effects: floating text and spark bursts |
| `js/rendering/BuildingRenderer.js` | BuildingRenderer - lays out and draws the settlement's buildings |
| `js/rendering/CanvasRenderer.js` | CanvasRenderer - owns the <canvas>, handles resolution/resizing, and delegates drawing to the scene renderer (CivilizationRenderer) |
| `js/rendering/CitizenRenderer.js` | CitizenRenderer - draws and animates citizens |
| `js/rendering/CivilizationRenderer.js` | CivilizationRenderer - draws the whole settlement scene: era background, then buildings and citizens depth-sorted together, then effects. |
| `js/rendering/EraBackground.js` | EraBackground - era-specific sky, distant scenery and ground texture |
| `js/systems/AchievementSystem.js` | AchievementSystem - milestones from data/achievements.json |
| `js/systems/AdRewardSystem.js` | AdRewardSystem - optional rewarded ads (CrazyGames) |
| `js/systems/BuildingSystem.js` | BuildingSystem - buying and upgrading buildings, housing capacity |
| `js/systems/EconomySystem.js` | EconomySystem - applies production and consumption every logic tick and answers cost questions |
| `js/systems/EffectSystem.js` | EffectSystem - the single place where data-defined effects change the economy |
| `js/systems/EraSystem.js` | EraSystem - historical era progression |
| `js/systems/OfflineSystem.js` | OfflineSystem - progress while the player is away (tab hidden, or - from Phase 7 - a saved game loaded later) |
| `js/systems/PopulationSystem.js` | PopulationSystem - citizens: growth, starvation decline, employment |
| `js/systems/PrestigeSystem.js` | PrestigeSystem - Civilization Legacy |
| `js/systems/ProductionSystem.js` | ProductionSystem - calculates (does not apply) production rates |
| `js/systems/ResearchSystem.js` | ResearchSystem - the research tree |
| `js/systems/ResourceSystem.js` | ResourceSystem - the only place resource amounts change |
| `js/systems/SaveSystem.js` | SaveSystem - persistence of state.player |
| `js/systems/StatisticsSystem.js` | StatisticsSystem - tracks lifetime statistics in player.stats |
| `js/systems/TechnologySystem.js` | TechnologySystem - the lasting results of research |
| `js/systems/UpgradeSystem.js` | UpgradeSystem - leveled upgrades from data/upgrades.json |
| `js/ui/AchievementPanel.js` | AchievementPanel - milestones by category with progress bars and their permanent production rewards |
| `js/ui/BasePanel.js` | BasePanel - shared behavior for every navigation panel |
| `js/ui/BuildingPanel.js` | BuildingPanel - building list with category filter, cost, owned count, output, statistics (level, current production, staffing) and Build / Upgrade buttons |
| `js/ui/CivilizationPanel.js` | CivilizationPanel - the main settlement view |
| `js/ui/EraPanel.js` | EraPanel - shows the next era's requirements (live progress), an Advance button, and the list of all eras |
| `js/ui/HUD.js` | HUD - top bar: era badge, resource counters, population, save indicator |
| `js/ui/ModalManager.js` | ModalManager - dialogs (info, confirm, unlock popups, offline summary) |
| `js/ui/NotificationManager.js` | NotificationManager - toast messages |
| `js/ui/PopulationPanel.js` | PopulationPanel - citizens, housing, growth status and worker assignment |
| `js/ui/PrestigePanel.js` | PrestigePanel - Civilization Legacy: shows this run's progress, the Civilization Points an ascension would grant, a confirmation dialog, the bonus shop and offline info |
| `js/ui/ResearchPanel.js` | ResearchPanel - used twice: mode "research":     the research tree (branch filter, status, cost, time, progress, prerequisites, rewards) and the active project card |
| `js/ui/SettingsPanel.js` | SettingsPanel - audio toggles, saving (save now, export / import text, delete save) and a short status of the CrazyGames connection |
| `js/ui/StatisticsPanel.js` | StatisticsPanel - lifetime totals, progress counts and per-resource production. |
| `js/ui/UIManager.js` | UIManager - builds the navigation, owns all panels, switches between them, and refreshes the visible panel and HUD on a throttle. |
| `js/ui/UpgradePanel.js` | UpgradePanel - leveled upgrades grouped by category (building production, resource multipliers, population, storage, research efficiency, offline production, economy) |
| `js/utils/MathUtils.js` | MathUtils - small shared math helpers. |
| `js/utils/NumberFormatter.js` | NumberFormatter - compact display of large idle-game numbers. |
| `js/utils/StorageUtils.js` | StorageUtils - tiny storage backends and text helpers used by SaveSystem |
| `js/utils/TimeUtils.js` | TimeUtils - duration formatting and safe elapsed-time math. |
| `js/utils/ValidationUtils.js` | ValidationUtils - defensive checks used by loaders and the save system. |

## Assets

All art is drawn procedurally on the canvas and all sound is synthesised (original, no external assets, nothing to license). The `assets/` sub-folders from the project structure are kept; drop PNG/audio files there if you ever want to replace the procedural art.

## Eras (Phase 4)

- `EraSystem` - reads `requirements` from `data/eras.json`: `resources` (spent on advancing), `population` and `buildings` (required, not spent), and `research` (ids; used from Phase 5). Emits `era:readiness` when the next era becomes reachable (the HUD era badge pulses) and `era:changed` on advancing. Each era has a `storageMultiplier` applied to every storage cap; costs must fit the previous era's caps.
- Advance flow: click the era badge -> Eras panel (live requirement checklist) -> Advance -> confirm -> `era:advance` -> welcome popup listing new resources and buildings.
- New resources appear in the HUD automatically (`unlockEra` in `data/resources.json`); new buildings appear automatically (`era` in `data/buildings.json`).
- 25 buildings across the five eras. New building fields: `input` (resources consumed per interval; the building runs at the efficiency of its scarcest input), `bonus {target, perCopy}` (global production bonus, e.g. roads, castles, railways) and `maxCount`.
- `EraBackground` (extra file in `js/rendering/`) draws the era sky, scenery and ground: mountains, pyramids and palms, a castle and forest, smoking factories, a neon city with stars. `BuildingRenderer` has a drawn sprite per building and shows the newest-era buildings first when the settlement is crowded.
- Events added: `era:advance`, `era:changed`, `era:readiness`.

### Balancing eras

Edit `data/eras.json` (costs, `storageMultiplier`, `population`) and building `cost`/`costGrowth`/`output` in `data/buildings.json`. With an optimal bot that buys the best building every second, current numbers reach the Ancient/Medieval/Industrial/Futuristic ages at about 2/7/19/29 minutes; real players will be several times slower, and research (Phase 5) will add further gates.

## Research, technologies, upgrades, achievements, statistics (Phase 5)

Systems (all in `js/systems/`, all tick-driven or event-driven, none touch the DOM):
- **EffectSystem** (extra file) - the single place bonuses are applied. Effects are `{type: production|building|storage|stat, target, value}` registered under a named source (`tech:`, `upgrade:`, `achievement:`); sources are replaced, never stacked twice. Stat effects feed `state.mods` (housing, growth speed, food use, research speed, staffing, building cost, offline efficiency/hours).
- **ResearchSystem** - one project at a time; cost is paid upfront, progress advances with time x research speed. Unlocks buildings/upgrades via `unlock.research`.
- **TechnologySystem** - technologies are derived from completed research (nothing extra saved); re-applies their effects on load.
- **UpgradeSystem** (extra file) - leveled upgrades, `cost = base * growth^level`, max level per upgrade.
- **AchievementSystem** - checked every 0.5 s; rewards are small permanent production bonuses.
- **StatisticsSystem** - playtime, highest population, totals.

Data: `data/research.json` (7 branches, 35 projects), `data/technologies.json`, `data/upgrades.json` (7 categories, 27 upgrades), `data/achievements.json` (6 categories, 36 achievements).

UI: Research, Techs, Upgrades (new nav item), Achieve and Stats panels; the Buildings panel lists locked buildings and what unlocks them. A warning marker next to a cost means it exceeds current storage capacity.

Events: `research:start` / `research:started` / `research:completed`, `upgrade:buy` / `upgrade:bought`, `achievement:unlocked`, `mods:changed`.

Balance: an optimal-play bot reaches the Futuristic Age in roughly 40 minutes; real players will take longer. Era costs must fit the previous era's storage caps (Stone Age cap is 200, so the Ancient cost stays at or below it).

## Prestige and offline progression (Phase 6)

**PrestigeSystem** (`js/systems/PrestigeSystem.js`, data in `data/prestige.json`)
- Civilization Legacy: the player can *ascend* and restart for Civilization Points (CP).
- Run score = sum(produced this run x resource weight); points = floor((score / divisor) ^ exponent). Production is tracked per run by `ResourceSystem` in `player.prestige.runProduced`. Balance target: about 1 point at 15 minutes, about 3 at 20 and about 20 at 40 minutes of optimal play.
- Reset keeps achievements, statistics, settings and Legacy bonuses; it clears resources, buildings, population, era, research and upgrades, then re-applies every derived effect (upgrades, technologies, achievements, legacy, era storage, housing, production).
- Shop of 10 permanent bonuses (production, storage, research speed, building cost, growth, housing, starting resources, offline efficiency, offline hours, start in the Ancient Age). Effects go through `EffectSystem` under sources `legacy:<id>`.
- Events: `prestige:ascend`, `prestige:buy` (requests); `prestige:bought`, `prestige:done` (results).

**OfflineSystem** (`js/systems/OfflineSystem.js`)
- Away time is capped at `offlineMaxHours` (8 h) + the `offlineHours` mod, and credited at `offlineEfficiency` (50 %) + the `offlineEfficiency` mod, max 100 %.
- The credited time is fast-forwarded through the normal systems in 5-second steps with `state.runtime.offline = true`: storage caps, input shortages, population growth and research behave as usual; citizens never starve away and nothing is bought automatically.
- Used when the tab becomes visible again (`visibilitychange`); `processSinceLastSession()` is ready for Phase 7 to call after loading a save (`player.lastSession` is refreshed every second).
- Event `offline:process` ({seconds}) in, `offline:done` (report) out; a "Welcome back!" dialog summarises the gains. Absences under 60 s are ignored.

**UI**: the Legacy panel shows points, the ascension preview and progress to the next point, a confirmation dialog, the shop, and the current offline efficiency and limit.

## Saving and CrazyGames (Phase 7)

**SaveSystem** (`js/systems/SaveSystem.js`, backends in `js/utils/StorageUtils.js`)
- Copies: LocalStorage (main, synchronous so it works while the page closes) plus a previous-save backup `<key>.bak`, an IndexedDB copy, and, on CrazyGames, a mirror in the SDK data module. Loading picks the newest valid copy.
- Envelope `{v, savedAt, hash, data}`; a bad checksum or damaged JSON skips that copy and falls back to the next one. If every copy is bad the game starts fresh (and says so).
- The save is loaded *before* the gameplay systems are built, so each system derives its state (effects, caps, housing) from the loaded player.
- Sanitising: merged over a fresh default player; non-finite numbers replaced, counts and levels clamped, unknown ids (changed JSON data) dropped, `__proto__` keys ignored. `SaveSystem.migrations[n]` upgrades version n to n+1. A save from a newer game version is never loaded or overwritten.
- Autosave every 30 s (`autosaveIntervalSeconds`), shortly after key events (era, research, upgrade, prestige, achievement, building), when the tab is hidden or closed, and from Settings.
- Export / import: a base64 text string (`IDLECIV1:...`), validated before importing; Delete save wipes every copy. Import and delete reload the page.
- Settings panel: save now, last-saved time, export, copy, import, delete, CrazyGames status.
- Events: `save:now`, `save:request`, `save:import`, `save:reset` in; `save:status`, `save:imported`, `save:wiped` out. Offline progress after loading uses `player.lastSession` (`OfflineSystem.processSinceLastSession`).

**CrazyGamesIntegration** (`js/integrations/CrazyGamesIntegration.js`) - the only file that touches the SDK, official v3 only:
`SDK.init()`, `SDK.environment`, `game.loadingStart/loadingStop/gameplayStart/gameplayStop`, `ad.requestAd("rewarded", {adStarted, adFinished, adError})`, `ad.hasAdblock()`, `data.getItem/setItem/removeItem`. The script tag is in `index.html`. Every call is feature-checked; if the SDK is blocked, times out (5 s) or the environment is `disabled`, the game runs without ads and cloud data. Check the current CrazyGames requirements before submitting.
- While an ad plays the game loop pauses and `audio:mute` is emitted (the audio system of Phase 8 listens); both resume on `adFinished` / `adError`.

**AdRewardSystem** (`js/systems/AdRewardSystem.js`) - optional rewarded ads, only after the player clicks:
- Production x2 and Research x2 for 5 minutes each (watching again adds time, max 20 minutes); boost time is saved.
- "Double it" on the Welcome back dialog doubles the offline gains once.
- A gift button in the HUD appears only when ads are available; no ad is ever required. Tune in `config/balance.config.json` -> `ads`.

## Polish and release (Phase 8)

**AudioManager** (`js/core/AudioManager.js`) - every sound is generated with the Web Audio API (no audio files).
- Effects: click, tick, build, upgrade, research, achievement, era fanfare, prestige, reward, pop and error; triggered by gameplay events (`building:built`, `research:completed`, `achievement:unlocked`, `era:changed`, ...) and by a single delegated listener for UI buttons. Bursts of the same effect are rate limited.
- Music: a quiet generative loop whose scale, tempo and instruments change per era (minor pentatonic, dorian, mixolydian, natural minor, major pentatonic).
- Browser rules: the AudioContext is created only after the first user gesture; audio suspends while the tab is hidden. `audio:mute` (sent by the ad flow) silences everything while an ad plays.
- Settings: music and effects toggles and volume sliders (Settings panel), plus a speaker button in the HUD. If Web Audio is missing the game is silent but fully playable.

**Mobile and layout**
- `CanvasRenderer`: wide screens letterbox as before; portrait screens zoom the scene (up to 1.7x), drift slowly sideways and can be dragged to pan. The area around the scene is filled with the era's sky and ground (`CivilizationRenderer.fillBackdrop`) instead of black bars.
- `css/responsive.css`: smaller toasts, larger touch targets, compact navigation in landscape, keyboard focus outlines and `prefers-reduced-motion` support.

**Release**
- Version 1.0.0 (`config/game.config.json`), favicon (`assets/icons/icon.svg`), global error logging, friendlier start-up error.
- `release/RELEASE_CHECKLIST.md` (upload and QA checklist) and `release/store/` (cover images generated from the game).
- Performance: about 60 FPS with every building built in the Futuristic Age at 1280x720 (headless Chromium).

## Mobile layout and HD visuals
- **Fixed mobile layout** (`css/responsive.css`): the page never scrolls; `100dvh` with safe-area insets. Portrait phones get a scene band on top, a scrolling panel in the middle and a compact bottom nav (primary tabs plus a "More" sheet, built by `UIManager._buildNav`). Landscape phones split scene (left) and panel (right). The scene is zoomed and can be dragged to pan on narrow screens (`CanvasRenderer`).
- **HD rendering**: `CanvasRenderer` renders at up to 3x device pixels. Settings > Graphics: Auto (drops resolution automatically if frames stay slow), Ultra HD, High, Low. Stored in `player.settings.quality`.
- **`js/rendering/ArtKit.js`**: shared drawing helpers (cached gradients, sphere shading, soft shadows, rounded rects, colour mixing). `BuildingRenderer` uses them for shaded bricks, planks, shingles, lit windows and soft shadows.
- **`CitizenRenderer`**: limbed NPCs with walking animation, skin/hair variety, era outfits and headgear, job tools (axe, pickaxe, hoe, hammer, wrench, book, coins) and occasional speech bubbles.
- **`EraBackground`**: sun glow and rays, layered clouds, birds, three hill layers with haze, shaded ground with flowers.
- Art remains fully procedural (no image files); communication between systems is unchanged (EventBus only).

## AI Advisor
- **`js/systems/AdvisorSystem.js`** - built-in, offline "AI": ranks what to build next (value per cost and time-to-afford), warns about food and housing, suggests idle research, unemployed citizens and Legacy readiness. Emits `advisor:updated`; actions are performed through normal bus events (`building:buy`, `research:start`, `ui:showPanel`). Optional **Autopilot** (`settings.autopilot`, off by default) acts on the top suggestion every 2.5 s and never runs during offline catch-up.
- **`js/ui/AdvisorPanel.js`** - "Advisor" tab (in the More sheet on phones): suggestions with action buttons, Autopilot switch, ask box.
- **`js/integrations/AdvisorLLM.js`** - OPTIONAL language-model answers (for example Gemini). Disabled unless `advisor.endpoint` in `config/game.config.json` is an `https://` URL of your own proxy server that holds the API key and returns `{ "text": "..." }`. Never put an API key in the game. Failures fall back to the built-in rules. Check CrazyGames' current rules on external requests before enabling.

## Game icon
`assets/icons/icon.svg` (source) plus PNGs at 512, 192, 128, 64, 32 and `apple-touch-icon.png` (180), generated from the SVG. `icon.webmanifest` lists the 192/512 icons. Use `icon-512.png` for the CrazyGames upload.

## Custom icon set
- **`js/ui/Icons.js`** - 33 hand-drawn cartoon SVG icons (resources, navigation, sound, gift, crown, and more) drawn inline, no image files. `IconReplacer` swaps each known emoji in the page for its SVG, immediately and whenever the DOM changes (a MutationObserver, so data-file emoji in `data/*.json` and `config/game.config.json` keep working). Emoji without a custom icon are left as they are. Styles: `css/icons.css`. To add an icon, add one entry to `PATHS` keyed by the emoji.

## CrazyGames requirements audit
See `release/RELEASE_CHECKLIST.md` (requirements table) and `release/STORE_LISTING.md` (title, description, controls, ratings text). `js/ui/Onboarding.js` adds a small skippable first-steps banner (`settings.onboardingDone`).

## Store images and videos
`release/store/` has the three cover images (1920x1080, 800x1200, 800x800). `release/media/` has two 18-second 30 fps H.264 videos: `idle-civilization-pc-1920x1080.mp4` (about 11 MB) and `idle-civilization-mobile-1080x1920.mp4` (about 9 MB). They were rendered frame by frame from the real game, with no sound. CrazyGames asks that videos are hosted on YouTube; upload there and give the link.

## Assets
`assets/` now holds the exported art, audio and fonts (backgrounds, buildings, NPC animation strips, resource and UI icons, effects, sound effects, era music). See `assets/README.md` and `assets/manifest.json`. The game itself still draws and synthesizes everything live.

## Device support & fixed layout (v1.0.0)

- Targets: desktop browsers (Chrome/Edge/Firefox/Safari), iOS Safari/WebView, Android Chrome/WebView, tablets; portrait and landscape; rotating live reflows with no reload.
- The page never scrolls or zooms (`html, body` fixed, `100dvh` with `-webkit-fill-available` fallback, `viewport-fit=cover` + safe-area insets for notches). Only the inner panel content scrolls.
- Layout modes (css/responsive.css): portrait phone (HUD, scene band, panel, 5-slot bottom bar + More sheet); short landscape (scene left, panel right, two-column nav); tablets/desktop/ultrawide (side nav whose buttons share the available height, never scroll).
- `js/utils/ViewportUtils.js` blocks pinch/double-tap zoom and long-press menus using standard events only (no device sniffing).
- Verified in headless Chromium at 28 viewport sizes from 320x568 to 3440x1440 in both orientations: no page overflow, no clipped nav, no JS errors.

## CrazyGames options

- **Save progress – Data module:** every save is mirrored to `sdk.data` (with LocalStorage + IndexedDB fallbacks); loading prefers the newest valid copy.
- **Muting audio through the SDK:** `sdk.game.settings.muteAudio` + `addSettingsChangeListener` mute all game audio; ad muting is combined with it so neither unmutes the other.
