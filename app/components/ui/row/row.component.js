/**
 * Custom Web Component: <ui-row>
 *
 * Justifies children horizontally.
 * Uses open Shadow DOM with inline styles for encapsulation.
 */
class Row extends HTMLElement {
  /** Attributes observed for changes that trigger re-rendering */
  static observedAttributes = ["justify-content"];

  /**
   * Initializes the component.
   * Attaches an open shadow root, freezes the reference, and performs the initial render.
   * @constructor
   */
  constructor() {
    super();
    /** @private @type {ShadowRoot} Shadow root for component encapsulation */
    this.node = this.attachShadow({mode: "open"});
    Object.freeze(this.node);

    this.render();
  }

  /**
   * Called when an observed attribute changes.
   * Re-renders the component to reflect updated values.
   * @param {string} name Name of the changed attribute
   * @param {string|null} oldValue Previous attribute value
   * @param {string|null} newValue New attribute value
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Collects all attributes and returns them as an HTML string.
   * These attributes are forwarded to the root element.
   * @returns {string} HTML attribute string for the root element
   */
  get attrs() {
    return Array.from(this.attributes)
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }


  /**
   * Returns the current justify-content value.
   * Defaults to "start" if not set.
   * @returns {string}
   */
  get justifyContent() {
    return (this.getAttribute("justify-content") || "start").toLowerCase();
  }

  /**
   * Renders the component inside the shadow root.
   * Applies inline styles and forwards attributes to the root element.
   */
  render() {
    /** Inline CSS for the row component */
    const css = `
      :host {
        width: 100%;
      }

      .ui-row {
        display: flex;
      }

      .ui-row--justify-content-start {
        justify-content: start;
      }

      .ui-row--justify-content-end {
        justify-content: end;
      }

      .ui-row--justify-content-center {
        justify-content: center;
      }

      .ui-row--justify-content-space-around {
        justify-content: space-around;
      }

      .ui-row--justify-content-space-between {
        justify-content: space-between;
      }

      .ui-row--justify-content-space-evenly {
        justify-content: space-evenly;
      }

      .ui-row--justify-content-space-stretch {
        justify-content: stretch;
      }
    `;

    this.node.innerHTML = `
      <style>${css}</style>
      <div class="ui-row ui-row--justify-content-${this.justifyContent}"><slot></slot></div>
    `;
  }
}

/** Register the custom element <ui-row> */
customElements.define("ui-row", Row);
