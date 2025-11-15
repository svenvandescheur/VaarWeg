/**
 * Custom Web Component: <ui-heading>
 *
 * Displays a heading element (<h1>-<h6>) with inline styles.
 * Uses open Shadow DOM for encapsulation.
 */
class Heading extends HTMLElement {
  /** Attributes observed for changes that trigger re-rendering */
  static observedAttributes = ["level"];

  /**
   * Constructor: attaches an open shadow root, freezes the reference,
   * and performs the initial render.
   */
  constructor() {
    super();
    /** @private @type {ShadowRoot} The open shadow root of this component */
    this.node = this.attachShadow({mode: "open"});
    Object.freeze(this.node);

    this.render();
  }

  /**
   * Callback triggered when an observed attribute changes.
   * Re-renders the heading to reflect updated values.
   * @param {string} name The name of the changed attribute
   * @param {string|null} oldValue The previous attribute value
   * @param {string|null} newValue The new attribute value
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Returns all attributes as a string suitable for HTML.
   * These attributes are forwarded to the root heading element.
   * @returns {string} HTML attribute string
   */
  get attrs() {
    return Array.from(this.attributes)
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }

  /**
   * Returns the current heading level (1-6).
   * Defaults to 1 if the `level` attribute is missing or invalid.
   * @returns {number} Heading level
   */
  get level() {
    return parseInt(this.getAttribute("level") || 1);
  }

  /**
   * Renders the heading inside the shadow root.
   * Applies inline styles and forwards attributes to the <h1>-<h6> element.
   */
  render() {
    /** Inline CSS for the heading component */
    const css = `
      :host {
        --heading-color-text: var(--ui-color-primary, cornflowerblue);
        --heading-font-family: var(--ui-font-family-heading, Arial);
        --heading-font-weight: var(--ui-font-weight-heading, 100);
      }


      .ui-heading {
          color: var(--heading-color-text);
          font-family: var(--heading-font-family);
          font-size: 2rem;
          font-weight: var(--heading-font-weight);
          margin: 0;
      }
    `;

    this.node.innerHTML = `
      <style>${css}</style>
      <h${this.level} class="ui-heading ui-heading--${this.level}" ${this.attrs}><slot></slot></h${this.level}>
    `;
  }
}

/** Register the custom element <ui-heading> */
customElements.define("ui-heading", Heading);
