/**
 * Custom Web Component: <ui-statusbar>
 *
 * Provides a status bar element with styling variations.
 * Available variants: secondary (default), primary, link.
 * Implements an open Shadow DOM and inline CSS.
 */
class Statusbar extends HTMLElement {
  /** List of attributes to observe for changes that trigger re-rendering */
  static observedAttributes = [];

  /**
   * Creates the component, attaches an open shadow root, and performs the first render.
   * @constructor
   */
  constructor() {
    super();
    /** @private @type {ShadowRoot} Holds the shadow root of this component */
    this.node = this.attachShadow({ mode: "open" });
    this.render();
  }

  /**
   * Called when one of the observed attributes changes.
   * Ensures the component reflects updated values by re-rendering.
   * @param {string} name The attribute name that changed
   * @param {string|null} oldValue The attribute’s previous value
   * @param {string|null} newValue The attribute’s new value
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Collects and formats all attributes not listed in observedAttributes.
   * These attributes are forwarded to the inner status bar element.
   * @returns {string} A string of HTML attributes
   */
  get attrs() {
    return Array.from(this.attributes)
      .filter(attr => !this.constructor.observedAttributes.includes(attr.name.toLowerCase()))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }

  /**
   * Updates the shadow DOM with markup and styling for the status bar.
   * Applies the variant style and computes progress percentage if available.
   */
  render() {
    /** Inline CSS styles for the <ui-statusbar> component */
    const css = `
      :host {
        --statusbar-color-border: var(--ui-color-border, gainsboro);
        --statusbar-spacing: var(--ui-spacing-m, 0.5rem);
      }

      .ui-statusbar {
          border-block: 1px solid var(--statusbar-color-border);
          box-sizing: border-box;
          display: flex;
          justify-content: space-between;
          padding: var(--statusbar-spacing) 0;

          &:last-child {
            border-block-end: none;
          }
      }
    `;

    const percent = this.value / this.max * 100;
    this.node.innerHTML = `
      <style>${css}</style>
      <div class="ui-statusbar" ${this.attrs}>
        <slot></slot>
      </div>
    `;
  }
}

/** Register the custom element <ui-statusbar> */
customElements.define("ui-statusbar", Statusbar);
