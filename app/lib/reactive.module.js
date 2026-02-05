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

/**
 * @typedef {Object} AppConfiguration
 * @property {string[]} keysToQuery  - State keys to sync with the query string (via history.pushState)
 * @property {string[]} unClonableKeys  - State keys to that cannot be cloned, will not be pushed to history state.
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
 * @param {AppConfiguration} options - Optional configuration.
 * @returns {{
 *   setState: (state: Object, pushHistory?: boolean) => void,
 *   dispatch: (action: Action, result?: Partial<ActionResult>) => void,
 *   worker: Worker|undefined
 * }} An object containing the application state, state mutator, dispatcher, and optional worker instance.
 */
export function createReactiveApp(name, render, initialState = {}, workerPath = undefined, onmessage = undefined, options) {
  const worker = workerPath ? new Worker(workerPath, {type: "module"}) : undefined;
  const setState = (state, pushHistory = 'auto') => _setState(state, render, options, pushHistory);
  const dispatch = (action, result) => _dispatch(action, result, setState, worker);

  if (worker) worker.onmessage = onmessage;
  if (worker) worker.onerror = () => setState({status: 500, statusText: "Unknown error"});

  // Handle initial state.
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : undefined);
  const searchState = {}
  for (const key of options?.keysToQuery || []) {
    if (searchParams.has(key)) {
      searchState[key] = searchParams.get(key);
    }
  }
  setState({name, ...initialState, ...searchState})

  // Handle popstate
  if (typeof window !== 'undefined') {
    window.addEventListener("popstate", (e) => {
      setState(e.state, false);
    });
  }

  return {dispatch, setState, STATE, worker};
}

/**
 * Merges changes into the state store and triggers a render.
 *
 * @param {Object} changes - Partial state updates to merge into the store.
 * @param {Function} [render] - Function to render the complete updated state.
 * @param {AppConfiguration} options - Optional configuration.
 * @param {boolean|"auto"} pushHistory - Whether to sync the state with the history.
 */
function _setState(changes, render, options, pushHistory) {
  STATE = Object.freeze({...STATE, ...changes})

  // Check for a scheduled render, skip frames if already rendering.
  if (!RENDER_SCHEDULED) {
    RENDER_SCHEDULED = true;

    requestAnimationFrame(() => {
      render?.(STATE);  // Always the latest state.
      RENDER_SCHEDULED = false;
      _pushHistory(STATE, options, pushHistory)
    })
  }
}

/**
 * Syncs `state` history.
 * @param {Object} state
 * @param {AppConfiguration} options - Optional configuration.
 * @param {boolean|"auto"} pushHistory - Whether to sync the state with the history.
 */
function _pushHistory(state, options, pushHistory) {
  if (!options?.keysToQuery?.length) return

  const {origin, pathname, search} = window.location
  let changed = false;

  // Create querystring.
  const searchParams = new URLSearchParams(search);
  const currentState = history.state || {}

  for (let key of options.keysToQuery || []) {
    const value = state[key]
    const empty = typeof value === undefined || value === ""

    changed = changed || currentState[key] !== value

    if (!empty) {
      searchParams.set(key, value);
    } else {
      searchParams.delete(key);
    }
  }
  const qs = searchParams.toString()

  // Create a clonable state by omitting unClonableKeys`.
  const _state = {}

  for (const key in state) {
    if (options.unClonableKeys.includes(key)) continue
    _state[key] = state[key]

  }

  // Update/replace history.
  const sync = pushHistory === "auto" ? changed : pushHistory
  const url = qs ? `${origin}${pathname}?${qs}` : `${origin}${pathname}`;

  if (sync) {
    history.pushState(_state, undefined, url);
  } else {
    history.replaceState(_state, undefined, url);
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
