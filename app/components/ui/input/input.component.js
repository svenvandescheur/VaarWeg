/**
 * Custom Web Component: <ui-input>
 *
 * Renders an input element with configurable variant styling.
 * Supported variants: secondary (default), primary, link.
 * Uses an open Shadow DOM with inline styles for encapsulation.
 */
class Input extends HTMLElement {
  /** Attributes observed for changes that trigger re-rendering */
  static observedAttributes = ["name", "value"];

  /**
   * Initializes the component.
   * Attaches an open shadow root and performs the initial render.
   * @constructor
   */
  constructor() {
    super();
    this.render();
  }

  /**
   * Called when an observed attribute changes.
   * Re-renders the component to reflect updated attributes.
   * @param {string} name Name of the changed attribute
   * @param {string|null} oldValue Previous attribute value
   * @param {string|null} newValue New attribute value
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Collects all non-observed attributes and returns them as an HTML string.
   * These attributes are forwarded to the inner <input> element.
   * @returns {string} HTML attribute string for the inner input
   */
  get attrs() {
    return Array.from(this.attributes)
      .filter(attr => !this.constructor.observedAttributes.includes(attr.name.toLowerCase()))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }

  /** Returns the current value of the "name" attribute */
  get name() {
    return this.getAttribute("name") || "";
  }

  /** Returns the current value of the "value" attribute */
  get value() {
    return this.getAttribute("value") || "";
  }

  /**
   * Renders the component inside the shadow root.
   * Updates variant styling and forwards attributes to the inner input.
   * Applies inline CSS for consistent appearance.
   */
  render() {
    /** Inline styles for the input element */
    const css = `
      ui-input {
        --input-color-border: gray;
      }

      .ui-input {
          -webkit-appearance: none;
          appearance: none;
          border: 1px solid var(--input-color-border);
          box-sizing: border-box;
          height: 2rem;
          width: 100%;
      }
    `;

    this.innerHTML = `
      <style>${css}</style>
      <input class="ui-input" max="100" name="${this.name}" value="${this.value}" ${this.attrs}/>
    `;
  }
}

/** Register the custom element <ui-input> */
customElements.define("ui-input", Input);
