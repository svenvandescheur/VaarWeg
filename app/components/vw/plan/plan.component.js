/**
 * Custom Web Component: <vw-plan>
 *
 * Renders a plan message element as a list of buttons.
 * Uses an open Shadow DOM with inline styling for encapsulation.
 * Dispatches a "graphNodeSelect" event when a button is clicked.
 */
class plan extends HTMLElement {
  /** Attributes that trigger a re-render when changed */
  static observedAttributes = ["plan"];

  /**
   * Constructs the component instance.
   * Attaches an open shadow root, freezes the reference, and renders the component.
   */
  constructor() {
    super();
    /** @private @type {ShadowRoot} Shadow root instance for encapsulation */
    this.node = this.attachShadow({mode: "open"});
    Object.freeze(this.node);

    /** @private @type {Function[]} Functions to remove attached event listeners */
    this._removeListeners = [];

    this.render();
  }

  /**
   * Called when an observed attribute changes.
   * Re-renders the component when any observed attribute is updated.
   * @param {string} name - Name of the changed attribute
   * @param {string|null} oldValue - Previous attribute value
   * @param {string|null} newValue - Current attribute value
   */
  attributeChangedCallback(name, oldValue, newValue) {
    this.render();
  }

  /**
   * Called when the element is inserted into the DOM.
   * Attaches click listeners to all plan buttons.
   */
  connectedCallback() {
    // Remove any existing listeners first (in case of re-render)
    this._removeListeners.forEach(remove => remove());
    this._removeListeners = [];

    this.plan.forEach(({graphNodeIndex}) => {
      const button = this.node.getElementById(`vw-plan-${graphNodeIndex}`);
      if (!button) return;

      const handler = () => {
        this.dispatchEvent(new CustomEvent("graphNodeSelect", {
          detail: {graphNodeId: parseInt(graphNodeIndex, 10)},
          bubbles: true,
          composed: true
        }));
      };

      button.addEventListener("click", handler);
      this._removeListeners.push(() => button.removeEventListener("click", handler));
    });
  }

  /**
   * Called when the element is removed from the DOM.
   * Cleans up all event listeners to prevent memory leaks.
   */
  disconnectedCallback() {
    this._removeListeners.forEach(remove => remove());
    this._removeListeners = [];
  }

  /**
   * Returns the parsed `plan` attribute as an array of objects.
   * Each object should have the form `{ linkName, graphNodeIndex }`.
   * Decodes the attribute from URL-encoded JSON.
   * @returns {Array<{linkName: string, graphNodeIndex: number}>}
   */
  get plan() {
    const value = this.getAttribute("plan");
    if (!value) return [];
    const json = decodeURIComponent(value);
    return JSON.parse(json);
  }

  /**
   * Serializes all element attributes as an HTML string.
   * Useful for forwarding attributes to a child element.
   * @returns {string} Concatenated attribute string
   */
  get attrs() {
    return Array.from(this.attributes)
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(" ");
  }

  /**
   * Renders the component inside the shadow root.
   * Applies scoped CSS and inserts the list of plan items.
   */
  render() {
    const css = `
      :host {
        display: contents;
        --plan-font-family: var(--ui-font-family-body, sans-serif);
        --plan-font-size: var(--ui-font-size-body, 0.75rem);
        --plan-font-weight: var(--ui-font-weight-body, 100);
        --plan-spacing: var(--ui-spacing-m, 0.5rem);
      }

      .vw-plan {
          height: 100%;
          overflow-x: hidden;
          overflow-y: auto;
      }

      .vw-plan__list {
          margin: var(--plan-spacing) 0;
      }

      .vw-plan__list-item {
        font-family: var(--plan-font-family);
        font-size: var(--plan-font-size);
        font-weight: var(--plan-font-weight);
        line-height: 1.5;
      }

      .vw-plan__list-item .button {
          color: inherit;
      }
    `;

    this.node.innerHTML = `
      <style>${css}</style>
      <div class="vw-plan">
        <ol class="vw-plan__list">
          ${this.plan.map(({linkName, graphNodeIndex}) => `
          <li class="vw-plan__list-item">
            <ui-button variant="link" id="vw-plan-${graphNodeIndex}">${linkName}</ui-button>
          </li>`).join("")}
        </ol>
      </div>
    `;
  }
}

/** Registers the custom element <vw-plan> */
customElements.define("vw-plan", plan);
