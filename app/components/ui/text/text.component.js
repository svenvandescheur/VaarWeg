/**
 * Custom Web Component: <ui-text>
 *
 * Displays a text message.
 * Uses open Shadow DOM with inline styles for encapsulation.
 */
class Text extends HTMLElement {
  /** Attributes observed for changes that trigger re-rendering */
  static observedAttributes = [];

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
   * Returns the button type attribute.
   * Defaults to "submit" if not set.
   * @returns {string} Button type: submit, reset, or button
   */
  get size() {
    return (this.getAttribute("size") || "m").toLowerCase();
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
   * Renders the component inside the shadow root.
   * Applies inline styles and forwards attributes to the root element.
   */
  render() {
    /** Inline CSS for the text component */
    const css = `
      :host {
        display: contents;
        --text-font-family: var(--ui-font-family-body, sans-serif);
        --text-font-size: var(--ui-font-size-body, 0.75rem);
        --text-font-weight: var(--ui-font-weight-body, 100);
      }

      .ui-text {
        text-shadow: 1px solid green;
        font-family: var(--text-font-family);
        font-size: var(--text-font-size);
        font-weight: var(--text-font-weight);
        line-height: 1.5;
      }

      .ui-text--s {
        font-size: 10px;
      }
    `;

    this.node.innerHTML = `
      <style>${css}</style>
      <span class="ui-text ui-text--${this.size}" ${this.attrs}><slot></slot></span>
    `;
  }
}

/** Register the custom element <ui-text> */
customElements.define("ui-text", Text);
