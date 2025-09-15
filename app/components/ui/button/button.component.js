/**
 * Custom Web Component: <ui-button>
 *
 * Displays a button element with variant styles.
 * Supports variants: secondary (default), primary, link.
 * Uses shadow DOM and reliably submits forms via a hidden native submit button.
 */
class Button extends HTMLElement {
  /** Attributes to observe for re-rendering */
  static observedAttributes = ["variant", "type"];

  /** Enables form association for custom elements */
  static formAssociated = true;

  /**
   * Constructor: sets up shadow DOM, initializes hidden submit button reference,
   * and performs the initial render.
   */
  constructor() {
    super();

    /** @private @type {ShadowRoot} Shadow root for encapsulated styles */
    this.node = this.attachShadow({ mode: "open" });

    /** @private @type {HTMLButtonElement|null} Hidden native submit button for polyfill */
    this._hiddenSubmit = null;

    this.render();
  }

  /**
   * Lifecycle callback invoked when the element is connected to the DOM.
   * Adds click and Enter key handlers to submit the closest form.
   */
  connectedCallback() {
    const button = this.node.querySelector("button");
    if (!button) return;

    // Click triggers form submission
    button.addEventListener("click", (e) => {
      this.submitForm();
    });

    // Polyfill Enter key on inputs inside the closest form
    const form = this.closest("form");
    if (form) {
      form.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const target = e.target;
          if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.attachInternals?.()?.form === form) {
            this.submitForm();
          }
        }
      });
    }
  }

  /**
   * Lifecycle callback invoked when an observed attribute changes.
   * Re-renders the component to reflect new values.
   * @param {string} name - Name of the changed attribute
   * @param {string|null} oldValue - Previous value of the attribute
   * @param {string|null} newValue - New value of the attribute
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Returns all non-observed attributes as a string suitable for HTML.
   * These attributes are forwarded to the inner button element.
   * @returns {string} HTML attribute string
   */
  get attrs() {
    return Array.from(this.attributes)
      .filter(attr => !Button.observedAttributes.includes(attr.name.toLowerCase()))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }

  /**
   * Returns the current button variant.
   * Defaults to "secondary" if not set.
   * @returns {string} Button variant
   */
  get variant() {
    return (this.getAttribute("variant") || "secondary").toLowerCase();
  }

  /**
   * Returns the button type attribute.
   * Defaults to "submit" if not set.
   * @returns {string} Button type: submit, reset, or button
   */
  get type() {
    return (this.getAttribute("type") || "submit").toLowerCase();
  }

  /**
   * Renders the shadow DOM content for the button.
   * Updates the variant class, applies inline styles, and includes a slot for children.
   */
  render() {
    /** Inline CSS for the button component */
    const css = `
      :host {
        --button-color-background: gray;
        --button-color-text: white;
        --button-primary-color-background: cornflowerblue;
        --button-primary-color-text: white;
        --button-link-color-text: var(--button-primary-color-background);
        --button-disabled-color-background: lightgray;
        --button-disabled-color-text: gray;
      }

      .ui-button {
        appearance: none;
        background-color: var(--button-color-background);
        border: none;
        color: var(--button-color-text);
        cursor: pointer;
        font-family: Tahoma;
        font-size: 12px;
        height: 2rem;
        margin: 0;
        min-width: 12rem;
        padding: 0 1rem;
        width: 100%;
      }

      .ui-button--variant-primary {
        --button-color-background: var(--button-primary-color-background);
        --button-color-text: var(--button-primary-color-text);
      }

      .ui-button--variant-link {
        background-color: transparent;
        color: var(--button-link-color-text);
        display: inline;
        font-size: inherit;
        height: auto;
        margin: unset;
        padding: unset;
        text-align: start;
        text-decoration: underline;
      }

      .ui-button:disabled {
        --button-color-background: var(--button-disabled-color-background);
        --button-color-text: var(--button-disabled-color-text);
        cursor: not-allowed;
      }
    `;

    this.node.innerHTML = `
      <style>${css}</style>
      <button class="ui-button ui-button--variant-${this.variant}" type="${this.type}" ${this.attrs}>
        <slot></slot>
      </button>
    `;
  }

  /**
   * Submits the closest form.
   * For type="submit", uses a hidden native button to trigger real submission.
   * For type="reset", calls form.reset().
   */
  submitForm() {
    const form = this.closest("form");
    if (!form) return;

    if (this.type === "reset") {
      form.reset();
      return;
    }

    if (this.type === "submit") {
      // Create hidden native submit button if not already present
      if (!this._hiddenSubmit) {
        this._hiddenSubmit = document.createElement("button");
        this._hiddenSubmit.type = "submit";
        this._hiddenSubmit.style.display = "none";
        form.appendChild(this._hiddenSubmit);
      }

      // Trigger click on hidden submit button
      this._hiddenSubmit.click();
    }
  }
}

/** Define the custom element <ui-button> */
customElements.define("ui-button", Button);
