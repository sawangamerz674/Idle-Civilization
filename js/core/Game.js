import { EventBus } from "./EventBus.js";
import { GameLoop } from "./GameLoop.js";
import { GameState } from "./GameState.js";
import { AssetLoader } from "./AssetLoader.js";
import { CanvasRenderer } from "../rendering/CanvasRenderer.js";
import { CivilizationRenderer } from "../rendering/CivilizationRenderer.js";
import { UIManager } from "../ui/UIManager.js";
import { ResourceSystem } from "../systems/ResourceSystem.js";
import { ProductionSystem } from "../systems/ProductionSystem.js";
import { EconomySystem } from "../systems/EconomySystem.js";
import { BuildingSystem } from "../systems/BuildingSystem.js";
import { PopulationSystem } from "../systems/PopulationSystem.js";
import { EraSystem } from "../systems/EraSystem.js";
import { EffectSystem } from "../systems/EffectSystem.js";
import { ResearchSystem } from "../systems/ResearchSystem.js";
import { TechnologySystem } from "../systems/TechnologySystem.js";
import { UpgradeSystem } from "../systems/UpgradeSystem.js";
import { AchievementSystem } from "../systems/AchievementSystem.js";
import { AdvisorSystem } from "../systems/AdvisorSystem.js";
import { AdvisorLLM } from "../integrations/AdvisorLLM.js";
import { StatisticsSystem } from "../systems/StatisticsSystem.js";
import { PrestigeSystem } from "../systems/PrestigeSystem.js";
import { OfflineSystem } from "../systems/OfflineSystem.js";
import { AudioManager } from "./AudioManager.js";
import { SaveSystem } from "../systems/SaveSystem.js";
import { AdRewardSystem } from "../systems/AdRewardSystem.js";
import { CrazyGamesIntegration } from "../integrations/CrazyGamesIntegration.js";
import { LocalStorageBackend, IndexedDBBackend } from "../utils/StorageUtils.js";

/**
 * Game - the core controller. Boots everything in order:
 *   load JSON -> build GameState -> create renderer + UI -> start loop.
 * Later phases register gameplay systems via registerSystem(); each system
 * exposes update(dt) and is ticked at the fixed logic rate.
 */
export class Game {
  constructor() {
    this.bus = new EventBus();
    this.assets = new AssetLoader();
    this.state = null;
    this.renderer = null;
    this.ui = null;
    this.loop = null;
    this.systems = [];
    this.integration = null;
    this.saves = null;
  }

  async init() {
    const loadingFill = document.getElementById("loading-bar-fill");
    const loadingText = document.getElementById("loading-text");
    const setProgress = (p, text) => {
      loadingFill.style.width = `${Math.round(p * 100)}%`;
      if (text) loadingText.textContent = text;
    };

    setProgress(0.05, "Loading configuration...");
    const [cfg, bal] = await Promise.all([
      this.assets.loadJSON("config/game.config.json"),
      this.assets.loadJSON("config/balance.config.json")
    ]);

    const data = await this.assets.loadJSONMap(cfg.dataFiles, (done, total) =>
      setProgress(0.1 + 0.7 * (done / total), "Loading game data...")
    );

    // CrazyGames SDK (optional: the game runs without it).
    this.integration = new CrazyGamesIntegration(cfg, this.bus);
    this.integration.loadingStart();
    await this.integration.init();

    setProgress(0.85, "Loading your save...");
    this.state = new GameState(cfg, bal, data);
    // The save is loaded BEFORE the systems exist, so each system derives its state from it.
    this.saves = new SaveSystem(this.state, this.bus, {
      local: new LocalStorageBackend(),
      idb: new IndexedDBBackend(),
      integration: this.integration
    });
    const loadResult = await this.saves.load();
    setProgress(0.9, "Building your world...");

    const canvas = document.getElementById("game-canvas");
    // Economy systems. Registration order is tick order.
    const resources = new ResourceSystem(this.state, this.bus);
    const production = new ProductionSystem(this.state, this.bus);
    const economy = new EconomySystem(this.state, this.bus, resources, production);
    const buildings = new BuildingSystem(this.state, this.bus, economy);
    const population = new PopulationSystem(this.state, this.bus, economy, production, buildings);
    const era = new EraSystem(this.state, this.bus, resources, buildings);
    const effects = new EffectSystem(this.state, this.bus, production, resources);
    const research = new ResearchSystem(this.state, this.bus, resources);
    const technology = new TechnologySystem(this.state, this.bus, effects);
    const upgrades = new UpgradeSystem(this.state, this.bus, effects, resources);
    const achievements = new AchievementSystem(this.state, this.bus, effects);
    const statistics = new StatisticsSystem(this.state, this.bus);
    const prestige = new PrestigeSystem(this.state, this.bus, { resources, production, buildings, era, research, technology, upgrades, achievements, effects });
    const ads = new AdRewardSystem(this.state, this.bus, this.integration, production, research, resources);
    const offline = new OfflineSystem(this.state, this.bus, () => this.systems, () => ads.available());
    this.api = { saves: this.saves, ads, integration: this.integration, prestige, offline, resources, production, economy, buildings, population, era, effects, research, technology, upgrades, achievements, statistics };
    const advisor = new AdvisorSystem(this.state, this.bus, { buildings, production, economy, research, population, prestige, ads }, new AdvisorLLM(this.state.cfg.advisor));
    this.api.advisor = advisor;
    this.registerSystem(production);
    this.registerSystem(resources);
    this.registerSystem(economy);
    this.registerSystem(population);
    this.registerSystem(buildings);
    this.registerSystem(era);
    this.registerSystem(research);
    this.registerSystem(achievements);
    this.registerSystem(statistics);
    this.registerSystem(ads);
    this.registerSystem(advisor);
    this.registerSystem(offline);
    this.registerSystem(this.saves);
    resources.recalcCaps();
    production.recompute();

    this.renderer = new CanvasRenderer(canvas, cfg.canvas.width, cfg.canvas.height);
    this.renderer.setScene(new CivilizationRenderer(this.state, this.bus));
    this.renderer.setQuality(this.state.player.settings.quality ?? "auto");
    this.bus.on("settings:changed", ({ key, value }) => { if (key === "quality") this.renderer.setQuality(value); });
    this.audio = new AudioManager(this.state, this.bus);
    this.api.audio = this.audio;
    this.ui = new UIManager(this.state, this.bus, this.api);
    this.ui.init();

    this.loop = new GameLoop({
      tickRate: cfg.tickRate,
      maxFrameDelta: cfg.maxFrameDeltaSeconds,
      update: (dt) => this.update(dt),
      render: (dt) => this.render(dt)
    });

    // Pause when the tab is hidden; OfflineSystem credits the time away when it returns.
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (this.integration.adActive) return; // ads manage the loop themselves
      if (document.hidden) {
        hiddenAt = Date.now();
        this.loop.stop();
      } else {
        this.loop.start();
        if (hiddenAt) offline.process((Date.now() - hiddenAt) / 1000);
        hiddenAt = 0;
      }
    });

    // Rewarded ads: pause the game and mute audio while one plays (CrazyGames requirement).
    this.bus.on("ads:started", () => {
      this.loop.stop();
      this.bus.emit("audio:mute", true);
    });
    this.bus.on("ads:ended", () => {
      this.loop.start();
      this.bus.emit("audio:mute", false);
    });

    // Save management: lifecycle saves, and a reload after import / wipe.
    this.saves.attachLifecycle();
    this.bus.on("save:imported", () => setTimeout(() => location.reload(), 300));
    this.bus.on("save:wiped", () => setTimeout(() => location.reload(), 300));

    setProgress(1, "Ready!");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("loading-screen").remove();
    this.loop.start();
    this.integration.loadingStop();
    this.integration.gameplayStart();
    this.bus.emit("game:ready");

    if (loadResult.locked) {
      this.bus.emit("modal:open", {
        title: "Newer save found",
        body: "Your saved game was made by a newer version of Idle Civilization, so it was not loaded and will not be overwritten. Please update the game.",
        buttons: [{ label: "OK" }]
      });
    } else if (loadResult.loaded) {
      if (loadResult.issues.length) console.warn("[Save] skipped copies:", loadResult.issues);
      const back = offline.processSinceLastSession();
      if (!back) this.bus.emit("notify", { text: "Game loaded.", type: "success" });
    } else {
      if (loadResult.issues.length) this.bus.emit("notify", { text: "Your save could not be read, starting a new game.", type: "error", duration: 5000 });
      this.bus.emit("notify", { text: "Welcome to Idle Civilization!", type: "success" });
    }
  }

  /** Register a gameplay system (object with update(dt)). */
  registerSystem(system) {
    this.systems.push(system);
  }

  /** Fixed-rate logic tick. */
  update(dt) {
    this.state.runtime.tick++;
    for (const system of this.systems) system.update(dt);
  }

  /** Per-frame drawing and DOM refresh. */
  render(dt) {
    // Render whenever the canvas is on screen (always on the split phone layouts, only on the
    // Civilization tab otherwise).
    const cv = this.renderer.canvas;
    if (cv.offsetParent !== null && cv.clientWidth > 0) this.renderer.render(dt);
    this.ui.update(dt);
  }
}
