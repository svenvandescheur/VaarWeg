/**
 * Custom Web Component: <ui-button>
 *
 * Displays a button element with variant styles.
 * Supports variants: secondary (default), primary, link.
 * Uses shadow DOM and reliably submits forms via a hidden native submit button.
 */
class Button extends HTMLElement {
  /** Attributes to observe for re-rendering */
  static observedAttributes = ["variant", "square", "type"];

  /** Enables form association for custom elements */
  static formAssociated = true;

  /**
   * Constructor: sets up shadow DOM, initializes hidden submit button reference,
   * and performs the initial render.
   */
  constructor() {
    super();

    /** @private @type {ShadowRoot} Shadow root for encapsulated styles */
    this.node = this.attachShadow({mode: "open"});

    /** @private @type {HTMLButtonElement|null} Hidden native submit button for polyfill */
    this._hiddenSubmit = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.render();
  }

  /**
   * Lifecycle callback invoked when the element is connected to the DOM.
   * Adds click and Enter key handlers to submit the closest form.
   */
  connectedCallback() {
    const button = this.node.querySelector("button");
    const form = this.closest("form");

    // Click triggers form submission
    if (button) button.addEventListener("click", this.handleSubmit)
    // Polyfill Enter key on inputs inside the closest form
    if (form) form.addEventListener("keydown", this.handleKeyDown);
  }

  /**
   * Lifecycle callback invoked when the element is disconnected from the DOM.
   * Removes previously attached event listeners to avoid memory leaks.
   */
  disconnectedCallback() {
    const button = this.node.querySelector("button");
    const form = this.closest("form");

    // Click triggers form submission
    if (button) button.removeEventListener("click", this.handleSubmit)
    // Polyfill Enter key on inputs inside the closest form
    if (form) form.removeEventListener("keydown", this.handleKeyDown);
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
  get square() {
    return this.hasAttribute("square")
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
        --button-size: 2rem;
        --button-default-scale: 1;
        --button-focussed-scale: var(--ui-scale-factor, 1);
        --button-focussed-link-scale: 1;
        --button-pressed-scale: var(calc(1 / var(--ui-scale-factor)), 1);
        --button-pressed-link-scale: 1;
        --button-scale: var(--button-default-scale);
        --button-border-radius: var(--ui-border-radius-s, 0);
        --button-color-background: var(--ui-color-secondary, lightgray);
        --button-color-text: var(--ui-color-secondary-contrast, white);
        --button-primary-color-background: var(--ui-color-primary, cornflowerblue);
        --button-primary-color-text: var(--ui-color-primary-contrast, white);
        --button-link-color-text: inherit;
        --button-disabled-color-background: var(--ui-color-muted, lightgray);
        --button-disabled-color-text: var(--ui-color-muted-contrast, gray);
        --button-spacing: var(--ui-spacing-m, 0.5rem);
        --button-transition: var(--ui-transition, none);

      }

      .ui-button {
        appearance: none;
        background-color: var(--button-color-background);
        border: none;
        border-radius: var(--button-border-radius);
        color: var(--button-color-text);
        cursor: pointer;
        height: var(--button-size);
        margin: 0;
        padding: 0 var(--button-spacing);
        transform: scale(var(--button-scale));
        transition: var(--button-transition);
        width: 100%;
        white-space: nowrap;

        &:not(:disabled):focus,
        &:not(:disabled):hover {
          --button-scale: var(--button-focussed-scale);
        }

        &:not(:disabled):active {
          --button-scale: var(--button-pressed-scale);
        }
      }

      .ui-button--variant-primary {
        --button-color-background: var(--button-primary-color-background);
        --button-color-text: var(--button-primary-color-text);
        min-width: 12rem;

      }

      .ui-button--square {
        min-width: unset;
        width: var(--button-size);
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

        &:not(:disabled):focus,
        &:not(:disabled):hover {
          --button-scale: var(--button-focussed-link-scale);
          text-decoration: none;
        }

        &:not(:disabled):active {
          --button-scale: var(--button-focussed-link-scale);
          text-decoration: none;
        }
      }

      .ui-button:disabled {
        --button-color-background: var(--button-disabled-color-background);
        --button-color-text: var(--button-disabled-color-text);
        cursor: not-allowed;
      }
    `;

    this.node.innerHTML = `
      <style>${css}</style>
      <button class="ui-button ${this.square ? 'ui-button--square ' : ''}ui-button--variant-${this.variant}" type="${this.type}" ${this.attrs}>
        <ui-text><slot></slot></ui-text>
      </button>
    `;
  }

  /**
   * Polyfills Enter key on inputs inside the closest form.
   */
  handleKeyDown(e) {
    if (e.key === "Enter") {
      const target = e.target;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA"
      const isSameFormTarget = isInput || target.attachInternals?.()?.form === form;
      const isDataListInput = target.list
      const isDataListCompleted = isDataListInput && [...target.list.options].some(option => option.value === target.value)
      // Fixes issues on Safari where pressing Enter while focussing datalist input submits form before selecting value.
      if(isDataListInput && !isDataListCompleted) return;

      if (isSameFormTarget) {
        this.handleSubmit();
      }
    }
  }

  /**
   * Submits the closest form.
   * For type="submit", uses a hidden native button to trigger real submission.
   * For type="reset", calls form.reset().
   */
  handleSubmit() {
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
