/**
 * CivilizationPanel - the main settlement view. The canvas itself is owned by
 * CanvasRenderer; this panel only toggles the existing #panel-civilization
 * element so it fits the same show()/hide() interface as the other panels.
 */
export class CivilizationPanel {
  constructor() {
    this.id = "civilization";
    this.el = document.getElementById("panel-civilization");
  }
  mount() {}
  show() { this.el.classList.add("active"); }
  hide() { this.el.classList.remove("active"); }
  refresh() {}
}
