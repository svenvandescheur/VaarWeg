/**
 * Custom Web Component: <ui-card>
 *
 * Contains arbitrary content.
 * Uses open Shadow DOM with inline styles for encapsulation.
 */
class Card extends HTMLElement {
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
   * Returns the card size attribute.
   * Defaults to "m" if not set.
   * @returns {string} Button type: submit, reset, or button
   */
  get size() {
    return (this.getAttribute("size") || "s").toLowerCase();
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
    /** Inline CSS for the card component */
    const css = `
      :host {
        --card-background: var(--ui-background-muted, white);
        --card-active-background: var(--ui-background-active, white);
        --card-border: var(--ui-color-border, gray);
        --card-blur: var(--ui-blur, 0);
        --card-radius: var(--ui-border-radius-l, 0);
        --card-shadow: var(--ui-shadow, none);
        --card-spacing: var(--ui-spacing-m, 0.5rem);
        --card-transition: var(--ui-transition, none);
      }

      .ui-card {
        backdrop-filter: blur(var(--ui-blur));
        background: var(--card-background);
        border: 1px solid var(--card-border);
        border-radius: var(--card-radius);
        box-shadow: var(--card-shadow);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        max-height: 100cqh;
        padding: var(--card-spacing);
        transition: var(--card-transition);
        width: 100%;
      }

      .ui-card--s {
        max-width: 320px;
      }

      .ui-card:focus-within,
      .ui-card:hover {
        background: var(--card-active-background);
      }

      .ui-card:has(footer:last-child) {
        padding-block-end: 0;
      }

      .ui-card ui-alert {
        margin: var(--card-spacing) 0;
      }
    `;

    this.node.innerHTML = `
      <style>${css}</style>
      <div class="ui-card ui-card--${this.size}" ${this.attrs}><slot></slot></div>
    `;
  }
}

/** Register the custom element <ui-card> */
customElements.define("ui-card", Card);
