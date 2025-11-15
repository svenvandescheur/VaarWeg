/**
 * Custom Web Component: <ui-input>
 *
 * Renders an input element with configurable variant styling.
 * Supported variants: secondary (default), primary, link.
 * Uses light DOM (no shadow) so inputs, buttons, and submission work naturally.
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
   * Renders the component inside the custom element.
   * Updates variant styling and forwards attributes to the inner input.
   * Applies inline CSS for consistent appearance.
   */
  render() {
    /** Inline styles for the input element */
    const css = `
      ui-input {
        --input-active-background: var(--ui-color-background, white);
        --input-active-border: var(--ui-color-primary, cornflowerblue);
        --input-active-scale: var(--ui-scale-factor, 1);
        --input-default-background: var(--ui-background-muted, white);
        --input-default-border: var(--ui-color-secondary, gray);
        --input-default-scale: 1;
        --input-background: var(--input-default-background);
        --input-border: var(--input-default-border);
        --input-border-radius: var(--ui-border-radius-s, 0);
        --input-scale: var(--input-default-scale);
        --input-font-family: var(--ui-font-family-body, sans-serif);
        --input-font-size: var(--ui-font-size-body, 0.75rem);
        --input-font-weight: var(--ui-font-weight-body, 100);
        --input-spacing: var(--ui-spacing-m, 0.5rem);
        --input-transition: var(--ui-transition, none);
      }

      .ui-input {
          -webkit-appearance: none;
          appearance: none;
          background: var(--input-background);
          border: none;
          border-block-end: 1px solid var(--input-border);
          border-radius: var(--input-border-radius);
          box-sizing: border-box;
          font-family: var(--input-font-family);
          font-size: var(--input-font-size);
          font-weight: var(--input-font-weight);
          height: 2rem;
          line-height: 1.5;
          padding: var(--input-spacing);
          transition: var(--input-transition);
          transform: scale(var(--input-scale));
          outline: none;
          width: 100%;

          &:focus {
            --input-background: var(--input-active-background);
            --input-border: var(--input-active-border);
            --input-scale: var(--input-active-scale);
          }
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
