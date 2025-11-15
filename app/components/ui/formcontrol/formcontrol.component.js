/**
 * Custom Web Component: <ui-form-control>
 *
 * Wraps an input element with a label and configurable variant styling.
 * Automatically forwards attributes to the inner <ui-input>.
 * Uses light DOM (no shadow) so inputs, buttons, and submission work naturally.
 */
class FormControlComponent extends HTMLElement {
  /** Attributes observed for changes that trigger re-rendering */
  static observedAttributes = ["label", "name", "value"];

  /**
   * Initializes the component.
   * @constructor
   */
  constructor() {
    super();
    this.render();
  }

  /**
   * Called when an observed attribute changes.
   * Re-renders the component to reflect updated attribute values.
   * @param {string} name Name of the changed attribute
   * @param {string|null} oldValue Previous attribute value
   * @param {string|null} newValue New attribute value
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Collects all non-observed attributes and returns them as an HTML string.
   * These attributes are forwarded to the inner <ui-input> element.
   * @returns {string} HTML attribute string for the inner input
   */
  get attrs() {
    return Array.from(this.attributes)
      .filter(attr => !this.constructor.observedAttributes.includes(attr.name.toLowerCase()))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }

  /** Returns the label for the form control, defaults to the name if not set */
  get label() {
    return this.getAttribute("label") || this.name;
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
   * Wraps the input in a labeled container, forwards attributes, and applies inline styles.
   */
  render() {
    /** Inline styles for the form control component */
    const css = `
      ui-form-control {
        display: contents;
        --form-control-spacing: var(--ui-spacing-m, 0.5rem);
      }

      .ui-form-control {
          align-items: center;
          display: flex;
          gap: var(--form-control-spacing);
          height: 2rem;
          justify-content: space-between;
          width: 100%;
      }

      .ui-form-control ui-input {
        width: 75%;
      }
    `;

    this.innerHTML = `
      <style>${css}</style>
        <label class="ui-form-control">
        <ui-text>${this.label}:</ui-text>
        <ui-input list="locators" name="${this.name}" value="${this.value}" ${this.attrs}/>
      </label>
    `;
  }
}

/** Register the custom element <ui-form-control> */
customElements.define("ui-form-control", FormControlComponent);
