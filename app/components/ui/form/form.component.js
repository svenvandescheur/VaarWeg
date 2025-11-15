/**
 * Custom Web Component: <ui-form>
 *
 * Wraps content inside a <form> element while preserving native form behavior.
 * Uses light DOM (no shadow) so inputs, buttons, and submission work naturally.
 */
class Form extends HTMLElement {
  /** Attributes observed for changes that trigger re-rendering */
  static observedAttributes = ["action", "method"];

  /**
   * Initializes the component and sets up the internal form reference.
   * @constructor
   */
  constructor() {
    super();

    /** @private @type {HTMLFormElement|null} The light-DOM <form> wrapper */
    this.form = null;
  }

  /**
   * Callback triggered when observed attributes change.
   * Re-renders the component to reflect new attribute values.
   * @param {string} name The name of the attribute that changed
   * @param {string|null} oldValue The old value of the attribute
   * @param {string|null} newValue The new value of the attribute
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Returns the `action` attribute of the form.
   * Defaults to an empty string if not set.
   * @returns {string}
   */
  get action() {
    return this.getAttribute("action") || "";
  }

  /**
   * Returns the `method` attribute of the form in lowercase.
   * Defaults to "get" if not set.
   * @returns {string}
   */
  get method() {
    return (this.getAttribute("method") || "get").toLowerCase();
  }

  /**
   * Returns all non-observed attributes as an array.
   * These are forwarded to the form element.
   * @returns {Attr[]}
   */
  get attrs() {
    return Array.from(this.attributes).filter(
      attr => !this.constructor.observedAttributes.includes(attr.name.toLowerCase())
    );
  }

  /**
   * Creates the <form> wrapper once, injects style, and moves children into it.
   */
  render() {
    if (!this.form) {
      // Create <form> wrapper
      const form = document.createElement("form");
      form.className = "ui-form";

      // Inject inline style into form
      const style = document.createElement("style");
      style.textContent = `
        ui-form {
          --form-color-border: var(--ui-color-border, gainsboro);
          --form-spacing: var(--ui-spacing-m, 0.5rem);

            &:first-child .ui-form {
              border-block-start: none;
            }

            &:last-child .ui-form {
              border-block-end: none;
            }
        }

        .ui-form {
          align-items: end;
          border-block: 1px solid var(--form-color-border);
          display: flex;
          flex-direction: column;
          gap: var(--form-spacing);
          justify-content: stretch;
          margin: 0;
          padding: var(--form-spacing) 0;
        }
      `;
      form.appendChild(style);

      // Move all current children (except style) into the form
      const children = Array.from(this.childNodes);
      for (const child of children) {
        if (child !== style) form.appendChild(child);
      }

      this.appendChild(form);
      this.form = form;
    } else {
    }

    // Always update attributes on re-render
    this.updateFormAttrs();
  }

  /**
   * Updates the <form>'s action, method, and other forwarded attributes.
   * @param {HTMLFormElement} [form=this.form] The form element to update
   */
  updateFormAttrs(form = this.form) {
    if (!form) return;

    form.action = this.action;
    form.method = this.method;

    for (const attr of this.attrs) {
      form.setAttribute(attr.name, attr.value);
    }
  }
}

/** Register the custom element <ui-form> */
customElements.define("ui-form", Form);
