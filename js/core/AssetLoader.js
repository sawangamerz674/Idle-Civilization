/**
 * AssetLoader - loads JSON definitions and (later) images/audio.
 * Reports progress so the loading screen can show a bar.
 * Missing images resolve to null so renderers fall back to vector drawing.
 */
export class AssetLoader {
  constructor() {
    this.images = new Map();
  }

  async loadJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
    return res.json();
  }

  /**
   * Load a map of name -> url as JSON, calling onProgress(done, total).
   * @returns {Promise<Object<string, any>>}
   */
  async loadJSONMap(files, onProgress = () => {}) {
    const names = Object.keys(files);
    const out = {};
    let done = 0;
    await Promise.all(
      names.map(async (name) => {
        out[name] = await this.loadJSON(files[name]);
        done++;
        onProgress(done, names.length);
      })
    );
    return out;
  }

  /** Load an image; resolves null on failure instead of throwing. */
  loadImage(url) {
    if (this.images.has(url)) return Promise.resolve(this.images.get(url));
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(url, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  getImage(url) {
    return this.images.get(url) || null;
  }
}
