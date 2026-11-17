/**
 * Icons - the game's own cartoon icon set (inline SVG, no image files).
 * Game data (JSON) still names icons with emoji, so the IconReplacer below swaps each
 * known emoji in the page for its SVG, now and whenever the UI changes. Unknown
 * emoji are left alone, so new data keeps working. Sized by the surrounding font-size.
 */
const O = "#3b2a1a"; // outline colour shared with the rest of the art
const S = `stroke="${O}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"`;

const PATHS = {
  "🍖": `<path d="M5 15 Q3 8 10 6 Q17 4 18 10 Q19 15 12 17 Q8 18 5 15Z" fill="#c8693c" ${S}/><path d="M9 8 Q12 7 14 9" stroke="#f1a36d" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M16 15 L20 19" ${S} fill="none"/><circle cx="19" cy="20" r="2" fill="#f6ecd6" ${S}/><circle cx="21" cy="18" r="2" fill="#f6ecd6" ${S}/>`,
  "🪵": `<rect x="3" y="7" width="15" height="11" rx="3" fill="#b9773f" ${S}/><ellipse cx="18" cy="12.5" rx="3.4" ry="5.5" fill="#e3b074" ${S}/><ellipse cx="18" cy="12.5" rx="1.4" ry="2.6" fill="none" stroke="${O}" stroke-width="1.2"/><path d="M6 10.5 H13 M6 14.5 H12" stroke="#8a5a2b" stroke-width="1.3" stroke-linecap="round"/>`,
  "🪨": `<path d="M3 17 L5 9 L10 5 L17 7 L21 13 L20 18 Z" fill="#9aa3ad" ${S}/><path d="M10 5 L9 11 L5 9 M9 11 L13 14 L20 18 M13 14 L17 7" fill="none" stroke="${O}" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 14 L9 11.5 L13 14 Z" fill="#c9d0d6"/>`,
  "🔩": `<path d="M12 3 L19 7 V15 L12 19 L5 15 V7 Z" fill="#9aa8b8" ${S}/><circle cx="12" cy="11" r="3.2" fill="#46505c" ${S}/><path d="M6.5 8 L12 5 L17.5 8" fill="none" stroke="#dfe7ef" stroke-width="1.4" stroke-linecap="round"/>`,
  "🪙": `<circle cx="12" cy="12" r="9" fill="#ffc933" ${S}/><circle cx="12" cy="12" r="5.8" fill="#ffdf6b" stroke="#c68a12" stroke-width="1.4"/><path d="M12 8.2 V15.8 M14 9.8 Q12 8.4 10.4 9.6 Q9.6 11 12 12 Q14.4 13 13.6 14.6 Q12 15.8 10 14.3" fill="none" stroke="#c68a12" stroke-width="1.4" stroke-linecap="round"/>`,
  "⚡": `<path d="M14 2 L5 13 H11 L9 22 L19 10 H13 Z" fill="#ffd93b" ${S}/><path d="M13 5 L9 11" stroke="#fff6bf" stroke-width="1.4" stroke-linecap="round"/>`,
  "🧪": `<path d="M9 3 H15 M10 3 V9 L4.5 18.5 Q3.6 21 6.5 21 H17.5 Q20.4 21 19.5 18.5 L14 9 V3" fill="#eaf6ff" ${S}/><path d="M7 15.5 H17 L19.2 19 Q19.6 20.4 17.6 20.4 H6.4 Q4.4 20.4 4.8 19Z" fill="#46c46a" stroke="${O}" stroke-width="1.3"/><circle cx="10.5" cy="17.5" r="1" fill="#c9f5d3"/><circle cx="14" cy="18.5" r="0.8" fill="#c9f5d3"/>`,
  "👑": `<path d="M3 18 L2.5 8 L8 12 L12 5 L16 12 L21.5 8 L21 18 Z" fill="#ffc933" ${S}/><rect x="3" y="18" width="18" height="3" rx="1" fill="#e0a41a" ${S}/><circle cx="12" cy="5" r="1.6" fill="#e0556d" ${S}/><circle cx="2.8" cy="8" r="1.4" fill="#5bc0ff" ${S}/><circle cx="21.2" cy="8" r="1.4" fill="#5bc0ff" ${S}/><circle cx="12" cy="15" r="1.4" fill="#e0556d" stroke="${O}" stroke-width="1"/>`,
  "📜": `<path d="M6 4 H18 V17 Q18 20 15 20 H6 Q3.5 20 3.5 17.5 Q3.5 16 5 16 H6 Z" fill="#f7ecd0" ${S}/><path d="M6 4 Q4 4 4 6 V16" fill="none" stroke="${O}" stroke-width="1.5"/><path d="M9 8 H15 M9 11 H15 M9 14 H13" stroke="#b08a50" stroke-width="1.4" stroke-linecap="round"/><path d="M15 20 Q21 20 21 17 V16 H18" fill="#ecd9a6" ${S}/>`,
  "🏺": `<path d="M8 3 H16 L15 7 Q20 10 19 15 Q18 21 12 21 Q6 21 5 15 Q4 10 9 7 Z" fill="#d9783f" ${S}/><path d="M7 11 H17" stroke="#f6c98f" stroke-width="2" stroke-linecap="round"/><path d="M8 15 Q12 17 16 15" fill="none" stroke="#7a3d1c" stroke-width="1.4" stroke-linecap="round"/>`,
  "🔬": `<rect x="4" y="19" width="14" height="2.6" rx="1" fill="#6f7c8a" ${S}/><path d="M8 19 Q4 18 5 13 Q6 9 10 9" fill="none" ${S} stroke-width="2"/><rect x="9" y="3" width="5" height="12" rx="1.5" transform="rotate(25 11.5 9)" fill="#5d6d7e" ${S}/><rect x="14" y="11" width="6" height="2.4" rx="1" fill="#8fa0b0" ${S}/><circle cx="8" cy="6" r="1.6" fill="#ffd93b" stroke="${O}" stroke-width="1.2"/>`,
  "🏗️": `<path d="M5 21 V4 H8 V21" fill="#ffb02e" ${S}/><path d="M5 8 H8 M5 12 H8 M5 16 H8" stroke="${O}" stroke-width="1.1"/><path d="M3 5 H21" ${S} stroke-width="2.2"/><path d="M17 5 V12" stroke="${O}" stroke-width="1.5"/><rect x="14.5" y="12" width="5" height="4" rx="1" fill="#e0556d" ${S}/><path d="M2 21.5 H22" ${S}/>`,
  "👶": `<circle cx="12" cy="12.5" r="8.4" fill="#ffd9b3" ${S}/><path d="M12 4.2 Q9 3.5 10 6" fill="none" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="12" r="1.2" fill="${O}"/><circle cx="15" cy="12" r="1.2" fill="${O}"/><path d="M9.6 15.5 Q12 17.6 14.4 15.5" fill="none" stroke="${O}" stroke-width="1.5" stroke-linecap="round"/><circle cx="7.4" cy="14.6" r="1.3" fill="#ff9fa8" opacity=".7"/><circle cx="16.6" cy="14.6" r="1.3" fill="#ff9fa8" opacity=".7"/>`,
  "🏠": `<path d="M5 20 V11 H19 V20 Z" fill="#e8b878" ${S}/><path d="M2.5 12 L12 3.5 L21.5 12 Z" fill="#d9553c" ${S}/><rect x="10" y="14" width="4" height="6" rx="1.2" fill="#6b4423" ${S}/><rect x="15.4" y="3.8" width="2.6" height="4" fill="#9aa3ad" ${S}/>`,
  "🎒": `<path d="M7 7 Q7 3 12 3 Q17 3 17 7" fill="none" ${S} stroke-width="2"/><rect x="5" y="7" width="14" height="14" rx="4" fill="#3f8fd9" ${S}/><rect x="8" y="14" width="8" height="5" rx="1.5" fill="#2a6db0" ${S}/><path d="M8 11 H16" stroke="#9fd0ff" stroke-width="1.6" stroke-linecap="round"/>`,
  "🌙": `<path d="M16 3 A9 9 0 1 0 21 15 A7.5 7.5 0 0 1 16 3 Z" fill="#ffe27a" ${S}/><circle cx="9" cy="14" r="1.4" fill="#e8c14d"/><circle cx="12" cy="18" r="1" fill="#e8c14d"/>`,
  "⏳": `<path d="M6 3 H18 M6 21 H18" ${S} stroke-width="2.2"/><path d="M7 3 Q7 11 12 12 Q7 13 7 21 H17 Q17 13 12 12 Q17 11 17 3 Z" fill="#dff1ff" ${S}/><path d="M9 20 Q12 15 15 20 Z" fill="#f2c55c" stroke="${O}" stroke-width="1.1"/><path d="M8.6 5.4 H15.4 Q14.6 8 12 9.5 Q9.4 8 8.6 5.4Z" fill="#f2c55c" stroke="${O}" stroke-width="1.1"/>`,
  "🏛️": `<path d="M2.5 9 L12 3 L21.5 9 Z" fill="#efe6cf" ${S}/><path d="M5 10 V18 M9.5 10 V18 M14.5 10 V18 M19 10 V18" stroke="${O}" stroke-width="3.2" stroke-linecap="round"/><path d="M5 10 V18 M9.5 10 V18 M14.5 10 V18 M19 10 V18" stroke="#f7f0de" stroke-width="1.4" stroke-linecap="round"/><rect x="2.5" y="18.5" width="19" height="3" rx="1" fill="#d9ceb0" ${S}/>`,
  "🌾": `<path d="M12 22 V9" stroke="${O}" stroke-width="2" stroke-linecap="round"/><g fill="#f2c24a" ${S} stroke-width="1.4"><ellipse cx="12" cy="4.5" rx="2" ry="3.2"/><ellipse cx="8.6" cy="8" rx="2" ry="3.2" transform="rotate(-35 8.6 8)"/><ellipse cx="15.4" cy="8" rx="2" ry="3.2" transform="rotate(35 15.4 8)"/><ellipse cx="9" cy="13" rx="1.8" ry="3" transform="rotate(-35 9 13)"/><ellipse cx="15" cy="13" rx="1.8" ry="3" transform="rotate(35 15 13)"/></g>`,
  "⚙️": `<path d="M10.3 2.6 H13.7 L14.3 5.2 L16.4 6.1 L18.6 4.7 L21 7.1 L19.6 9.3 L20.5 11.4 L23 12 V15.4 H20.5 L19.6 17.5 L21 19.7 L18.6 22.1 L16.4 20.7 L14.3 21.6 L13.7 24 H10.3 L9.7 21.6 L7.6 20.7 L5.4 22.1 L3 19.7 L4.4 17.5 L3.5 15.4 H1 V12 L3.5 11.4 L4.4 9.3 L3 7.1 L5.4 4.7 L7.6 6.1 L9.7 5.2 Z" transform="translate(0 -1.4) scale(.95) translate(.6 .6)" fill="#9aa8b8" ${S}/><circle cx="12" cy="12" r="3.6" fill="#f6ecd6" ${S}/>`,
  "🤖": `<path d="M12 3 V6" ${S}/><circle cx="12" cy="3" r="1.6" fill="#ff6b6b" ${S}/><rect x="4" y="6" width="16" height="13" rx="4" fill="#b9c6d6" ${S}/><circle cx="9" cy="12" r="2.4" fill="#5ee6ff" ${S}/><circle cx="15" cy="12" r="2.4" fill="#5ee6ff" ${S}/><path d="M9 16.4 H15" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/><rect x="2" y="10" width="2" height="5" rx="1" fill="#8fa0b0" ${S}/><rect x="20" y="10" width="2" height="5" rx="1" fill="#8fa0b0" ${S}/>`,
  "🏕️": `<path d="M2 20 L12 4 L22 20 Z" fill="#e9a24a" ${S}/><path d="M12 4 L12 20" stroke="${O}" stroke-width="1.4"/><path d="M12 20 L8.5 20 L12 12 L15.5 20 Z" fill="#6b4423" ${S}/><path d="M12 4 L9.5 1.8 M12 4 L14.5 1.8" ${S} stroke-width="1.5"/><path d="M1.5 21 H22.5" stroke="#3f8f3a" stroke-width="2" stroke-linecap="round"/>`,
  "👥": `<circle cx="16.5" cy="8" r="3.2" fill="#f1c08f" ${S}/><path d="M11 20 Q11 13 16.5 13 Q22 13 22 20 Z" fill="#3f8fd9" ${S}/><circle cx="8" cy="8.6" r="3.6" fill="#ffd9b3" ${S}/><path d="M1.5 21 Q1.5 13.4 8 13.4 Q14.5 13.4 14.5 21 Z" fill="#e0654a" ${S}/>`,
  "⬆️": `<path d="M12 3 L21 13 H15.5 V21 H8.5 V13 H3 Z" fill="#5bd26b" ${S}/><path d="M12 6.5 L16.5 11.5" stroke="#c9f5d3" stroke-width="1.5" stroke-linecap="round"/>`,
  "🏆": `<path d="M7 3 H17 V10 Q17 15 12 15 Q7 15 7 10 Z" fill="#ffc933" ${S}/><path d="M7 5 H3.5 Q3.5 10 8 11 M17 5 H20.5 Q20.5 10 16 11" fill="none" ${S}/><path d="M12 15 V18" ${S} stroke-width="2.2"/><rect x="7.5" y="18" width="9" height="3.4" rx="1.2" fill="#b9773f" ${S}/><path d="M9.3 5.5 V9.5" stroke="#fff3a8" stroke-width="1.5" stroke-linecap="round"/>`,
  "📊": `<rect x="3" y="12" width="4.5" height="9" rx="1" fill="#5bc0ff" ${S}/><rect x="9.8" y="4" width="4.5" height="17" rx="1" fill="#ffc933" ${S}/><rect x="16.6" y="9" width="4.5" height="12" rx="1" fill="#5bd26b" ${S}/>`,
  "🔧": `<path d="M20.5 7 A5.2 5.2 0 0 1 14 12.6 L6.2 20.4 A2.2 2.2 0 0 1 3.6 17.8 L11.4 10 A5.2 5.2 0 0 1 17 3.5 L14.2 6.3 L15.2 8.8 L17.7 9.8 Z" fill="#9aa8b8" ${S}/><circle cx="5.5" cy="18.5" r="1" fill="#46505c"/>`,
  "🧠": `<path d="M12 4.5 Q10 2.5 7.6 4 Q4.5 4 4.4 7.4 Q2.5 8.6 3.4 11.2 Q2.6 13.6 4.6 15 Q4.6 18.4 8 18.6 Q9.6 20.4 12 19 Q14.4 20.4 16 18.6 Q19.4 18.4 19.4 15 Q21.4 13.6 20.6 11.2 Q21.5 8.6 19.6 7.4 Q19.5 4 16.4 4 Q14 2.5 12 4.5 Z" fill="#ff9fb4" ${S}/><path d="M12 5 V19 M7.4 9 Q9.6 9 10 11 M16.6 9 Q14.4 9 14 11 M7 14 Q9.4 14 10 15.6 M17 14 Q14.6 14 14 15.6" fill="none" stroke="#c4506f" stroke-width="1.3" stroke-linecap="round"/>`,
  "🔊": `<path d="M3.5 9.5 H7.5 L12.5 5 V19 L7.5 14.5 H3.5 Z" fill="#f6ecd6" ${S}/><path d="M15.5 8.5 Q18 12 15.5 15.5 M18.2 6 Q22.4 12 18.2 18" fill="none" ${S} stroke-width="1.9"/>`,
  "🔇": `<path d="M3.5 9.5 H7.5 L12.5 5 V19 L7.5 14.5 H3.5 Z" fill="#f6ecd6" ${S}/><path d="M16 9.5 L22 15.5 M22 9.5 L16 15.5" fill="none" stroke="#d9453c" stroke-width="2.2" stroke-linecap="round"/>`,
  "🎁": `<rect x="3.5" y="10" width="17" height="11" rx="1.6" fill="#e0556d" ${S}/><rect x="2.5" y="7" width="19" height="4.2" rx="1.4" fill="#f07a8e" ${S}/><path d="M12 7 V21" stroke="#ffd93b" stroke-width="3.2"/><path d="M12 7 V21" stroke="${O}" stroke-width="0" /><path d="M12 7 Q7.5 1.5 6.5 5 Q6.5 7 12 7 Q17.5 7 17.5 5 Q16.5 1.5 12 7Z" fill="#ffd93b" ${S}/>`,
  "😌": `<circle cx="12" cy="12" r="9.2" fill="#ffd96b" ${S}/><path d="M7.5 11 Q9 12.8 10.8 11 M13.2 11 Q15 12.8 16.5 11" fill="none" stroke="${O}" stroke-width="1.7" stroke-linecap="round"/><path d="M8.6 15.4 Q12 18 15.4 15.4" fill="none" stroke="${O}" stroke-width="1.7" stroke-linecap="round"/><circle cx="6.8" cy="14" r="1.4" fill="#ff9f8a" opacity=".7"/><circle cx="17.2" cy="14" r="1.4" fill="#ff9f8a" opacity=".7"/>`,
  "☰": `<path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="${O}" stroke-width="3.6" stroke-linecap="round"/><path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="#f6ecd6" stroke-width="1.8" stroke-linecap="round"/>`,
  "⚠": `<path d="M12 3.2 L22 20.6 H2 Z" fill="#ffc933" ${S}/><path d="M12 9.5 V14.6" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.3" fill="${O}"/>`
};

const SVG = {};
for (const [k, body] of Object.entries(PATHS)) {
  SVG[k] = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

const strip = (s) => s.replace(/️/g, "");
const KEYS = Object.keys(SVG).map(strip);
const RE = new RegExp(`(${KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\uFE0F?`, "g");
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION", "SELECT", "TITLE"]);

/** SVG markup for an emoji key (or null when there is no custom icon for it). */
export function iconSvg(emoji) {
  return SVG[strip(emoji)] ?? SVG[emoji] ?? null;
}

/** Replaces known emoji inside `root` with SVG icons and keeps doing so as the DOM changes. */
export class IconReplacer {
  constructor(root = document.body) {
    this.root = root;
    this._queue = new Set();
    this._raf = 0;
    this._obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") this._queue.add(m.target);
        else for (const n of m.addedNodes) this._queue.add(n);
      }
      this._flush(); // runs before the next paint, so the emoji never flashes
    });
  }

  start() {
    this.replaceIn(this.root);
    this._obs.observe(this.root, { childList: true, subtree: true, characterData: true });
  }

  _flush() {
    this._raf = 0;
    const nodes = [...this._queue];
    this._queue.clear();
    for (const n of nodes) if (n.isConnected) this.replaceIn(n);
  }

  replaceIn(node) {
    if (node.nodeType === 3) return this._text(node);
    if (node.nodeType !== 1 || SKIP.has(node.tagName)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (SKIP.has(t.parentNode?.tagName) || t.parentNode?.classList?.contains("ico") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const t of texts) this._text(t);
  }

  _text(t) {
    const s = t.nodeValue;
    if (!s || SKIP.has(t.parentNode?.tagName)) return;
    RE.lastIndex = 0;
    if (!RE.test(s)) return;
    RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = RE.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      const span = document.createElement("span");
      span.className = "ico";
      span.innerHTML = SVG[m[1]] ?? SVG[m[1] + "️"] ?? m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    t.parentNode.replaceChild(frag, t);
  }
}
