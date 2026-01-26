/**
 * @typedef {Object} Action
 * @property {string} name - THe action name.
 * @property {ActionPayload} payload - The payload.
 * @property {ActionResult} [result] - The payload.
 */

/** @typedef {Record<string, boolean|number|string>} ActionPayload */

/**
 * @typedef {Object} ActionResult
 * @property {number} status - HTTP-like status code.
 * @property {string} statusText - Human readable status.
 * @property {string} [body] - Resulting payload.
 */

// Can be imported for raw access to the state.
export let STATE = Object.freeze({});

// Flag to determine whether a render is scheduled.
let RENDER_SCHEDULED = false;

/**
 * Creates a reactive application instance with optional Web Worker integration.
 *
 * @param {string} name - Name identifying the reactive module.
 * @param {Function} render - Function called with the latest state to render UI or perform side effects.
 * @param {Object} [initialState={}] - Initial application state.
 * @param {string} [workerPath] - Optional path to a JavaScript module to be run in a Web Worker.
 * @param {Function} [onmessage] - Optional message handler for incoming worker messages.
 * @returns {{
 *   setState: (state: Object) => void,
 *   dispatch: (action: Action, result?: Partial<ActionResult>) => void,
 *   worker: Worker|undefined
 * }} An object containing the application state, state mutator, dispatcher, and optional worker instance.
 */
export function createReactiveApp(name, render, initialState = {}, workerPath = undefined, onmessage = undefined) {
  const worker = workerPath ? new Worker(workerPath, {type: "module"}) : undefined;
  const setState = (state) => _setState(state, render);
  const dispatch = (action, result) => _dispatch(action, result, setState, worker);
  setState({name, ...initialState})

  if (worker) worker.onmessage = onmessage;
  if (worker) worker.onerror = () => setState({status: 500, statusText: "Unknown error"});
  return {dispatch, setState, STATE, worker};
}

/**
 * Merges changes into the state store and triggers a render.
 *
 * @param {Object} changes - Partial state updates to merge into the store.
 * @param {Function} [render] - Function to render the complete updated state.
 */
function _setState(changes, render) {
  STATE = Object.freeze({...STATE, ...changes})

  // Check for a scheduled render, skip frames if already rendering.
  if(!RENDER_SCHEDULED) {
    RENDER_SCHEDULED = true;

    requestAnimationFrame(() => {
      render?.(STATE);  // Always the latest state.
      RENDER_SCHEDULED = false;
    })
  }
}

/**
 * Dispatches an action, optionally with a result, to a worker or the main thread.
 *
 * @param {Action} action - Action object containing type and payload.
 * @param {Partial<ActionResult>} [result] - Optional result object; defaults to `{ status: 200, statusText: "OK" }` if provided.
 * @param {Function} [setState=_setState] - Function to mutate state before dispatching.
 * @param {Worker} [worker] - Target worker to receive the dispatched action; if omitted, posts to main thread.
 */
function _dispatch(action, result, setState = _setState, worker = undefined) {
  setState({action});

  /** @type {ActionResult} */
  const defaultResult = {
    status: 200,
    statusText: "OK",
    body: {},
  };

  const _result = result ? Object.assign(defaultResult, result) : undefined;
  const payload = {...action, result: _result};

  if (worker) {
    worker.postMessage(payload);
  } else {
    postMessage(payload);
  }
}
