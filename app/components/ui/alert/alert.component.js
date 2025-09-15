/**
 * Custom Web Component: <ui-alert>
 *
 * Displays an alert message with an optional translation slot.
 * Supports four levels: info, success, warning, danger.
 * Uses open Shadow DOM with inline styling.
 */
class Alert extends HTMLElement {
  /** Observed attributes that trigger re-rendering */
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
   * Returns all non-observed attributes as a string suitable for HTML.
   * These are forwarded to the root alert div.
   * @returns {string} HTML attribute string
   */
  get attrs() {
    return Array.from(this.attributes)
      .filter(attr => !this.constructor.observedAttributes.includes(attr.name.toLowerCase()))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }

  /**
   * Returns the icon corresponding to the alert level.
   * @returns {string} Unicode icon character
   */
  get icon() {
    const iconMap = {
      info: "ℹ️", success: "✅", warning: "⚠️", danger: "❌",
    };
    return iconMap[this.level] || "";
  }

  /**
   * Returns the current alert level (info, success, warning, danger).
   * Defaults to "info" if not set.
   * @returns {string} Alert level
   */
  get level() {
    return (this.getAttribute("level") || "info").toLowerCase();
  }

  /**
   * Renders the component inside the shadow root.
   * Updates the icon, alert level class, and displays the translation slot if present.
   */
  render() {
    const hasTranslation = this.querySelector('[slot="translation"]') !== null;

    /** Inline CSS for the alert component */
    const css = `
      :host {
          --alert-color: gray;
          --alert-info-color: cornflowerblue;
          --alert-success-color: green;
          --alert-warning-color: orange;
          --alert-danger-color: red;
      }

      .ui-alert {
          border: 1px solid var(--alert-color);
          box-sizing: border-box;
          padding: 0.5rem;
          position: relative;
      }

      .ui-alert--level-info {
          --alert-color: var(--alert-info-color);
      }

      .ui-alert--level-success {
          --alert-color: var(--alert-success-color);
      }

      .ui-alert--level-warning {
          --alert-color: var(--alert-warning-color);
      }

      .ui-alert--level-danger {
          --alert-color: var(--alert-danger-color);
      }

      .ui-alert::before {
          background-color: var(--alert-color);
          content: "";
          width: 100%;
          height: 100%;
          position: absolute;
          inset-inline-start: 0;
          inset-block-start: 0;
          opacity: 0.1;
      }

      .ui-alert__message {
          margin: 0;
      }

      .ui-alert__translation {
          border-block-start: 1px solid var(--alert-color);
          padding-block-start: 0.5rem;
          margin: 0;
          margin-block-start: 0.5rem;
      }
    `;

    this.node.innerHTML = `
      <style>${css}</style>
      <div role="alert" class="ui-alert ui-alert--level-${this.level}" ${this.attrs}>
        <p class="ui-alert__message">${this.icon} <slot></slot></p>
        ${hasTranslation ? `<p class="ui-alert__translation"><slot name="translation"></slot></p>` : ''}
      </div>
    `;
  }
}

/** Define the custom element <ui-alert> */
customElements.define("ui-alert", Alert);
