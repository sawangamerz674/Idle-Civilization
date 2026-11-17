/**
 * AdvisorLLM - OPTIONAL connection to a language model for the Advisor chat.
 * Disabled unless config.advisor.endpoint is set to the URL of YOUR OWN small server
 * (a proxy that holds the model API key, e.g. for Gemini, and forwards the request).
 * NEVER put an API key in this game: it would be visible to every player.
 *
 * Request:  POST {endpoint}  JSON { question, state }   (state = AdvisorSystem.summary())
 * Response: JSON { text }
 * Any failure or timeout returns null, so the Advisor falls back to its built-in rules.
 * Note: CrazyGames may restrict external requests; check their current rules before enabling.
 */
export class AdvisorLLM {
  constructor(cfg = {}) {
    this.endpoint = typeof cfg.endpoint === "string" ? cfg.endpoint.trim() : "";
    this.timeoutMs = cfg.timeoutMs ?? 8000;
    this.enabled = /^https:\/\//.test(this.endpoint);
  }

  async ask(question, state) {
    if (!this.enabled) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, state }), signal: ctrl.signal
      });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data.text === "string" ? data.text.slice(0, 600) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
