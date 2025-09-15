/**
 * Custom Web Component: <ui-progressbar>
 *
 * Displays a progressbar element with a variant style.
 * Supports variants: secondary (default), primary, link.
 * Uses open Shadow DOM with inline styling.
 */
class Progressbar extends HTMLElement {
  /** Observed attributes that trigger re-rendering */
  static observedAttributes = ["max", "value"];

  /**
   * Constructor: attaches an open shadow root and performs the initial render.
   * @constructor
   */
  constructor() {
    super();
    /** @private @type {ShadowRoot} The open shadow root of this component */
    this.node = this.attachShadow({ mode: "open" });
    this.render();
  }

  /**
   * Callback triggered when observed attributes change.
   * Re-renders the component to reflect new attribute values.
   * @param {string} name The name of the changed attribute
   * @param {string|null} oldValue The previous value
   * @param {string|null} newValue The new value
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Returns all non-observed attributes as a string suitable for HTML.
   * These are forwarded to the inner progressbar element.
   * @returns {string} HTML attribute string
   */
  get attrs() {
    return Array.from(this.attributes)
      .filter(attr => !this.constructor.observedAttributes.includes(attr.name.toLowerCase()))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }

  /**
   * Returns the maximum value of the progressbar.
   * Defaults to 100 if the `max` attribute is not set.
   * @type {number}
   */
  get max() {
    return parseInt(this.getAttribute("max") || 100);
  }

  /**
   * Returns the current value of the progressbar.
   * Defaults to 0 if the `value` attribute is not set.
   * @type {number}
   */
  get value() {
    return parseInt(this.getAttribute("value") || 0);
  }

  /**
   * Renders the component inside the shadow root.
   * Updates the progressbar variant class and applies inline styles.
   * Calculates percentage value for visual display.
   */
  render() {
    /** Inline CSS for the progressbar component */
    const css = `
      :host {
        --progressbar-color-bar: lightgray;
        --progressbar-color-value: cornflowerblue;
        --progressbar-color-border: gray;
      }

      .ui-progressbar {
          appearance: none;
          box-sizing: border-box;
          height: 16px;
          -webkit-appearance: none;
      }

      .ui-progressbar::-webkit-progress-bar {
          background-color: var(--progressbar-color-bar);
          border: 1px solid var(--progressbar-color-border);
          box-sizing: border-box;
      }

      .ui-progressbar::-webkit-progress-value {
          background-color: var(--progressbar-color-value);
      }

      .ui-progressbar::-moz-progress-bar {
          background-color: var(--progressbar-color-value);
          border: 1px solid var(--progressbar-color-border);
      }
    `;

    const percent = this.value / this.max * 100;
    this.node.innerHTML = `
      <style>${css}</style>
      <progress class="ui-progressbar" max="100" value="${percent}" ${this.attrs}>${percent}%</progress>
    `;
  }
}

/** Define the custom element <ui-progressbar> */
customElements.define("ui-progressbar", Progressbar);
