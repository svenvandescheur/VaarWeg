// @ts-check
import {createReactiveApp, STATE} from "./lib/reactive.module.js"
import "./components/index.js"

const SELECT_MAP_MIN_ZOOM = 14;
const SELECT_MAP_MIN_ZOOM_TOLERANCE = 4;

const BASE_STATE = Object.freeze({
  activePathIndex: null,
  locators: null,
  path: [],
  plan: [],
  selectableFor: null,
  selectableNodes: [],
  title: "VaarWeg",
})

const INITIAL_STATE = Object.freeze({
  ...BASE_STATE,
  status: 102,
  statusText: "Bezig met laden",
  action: null,
  map: null,
  progress: 0,
  ready: false,
});


const {setState, dispatch} = createReactiveApp("app", render, INITIAL_STATE, "./compute.worker.js", onMessage)

/**
 * Worker message handler.
 * @param {MessageEvent} e
 */
async function onMessage({data}) {
  setState({action: data})

  /** @type {Action} */
  const action = data

  try {
    switch (action.name) {
      case "FETCH":
        handleFetchResponse(action)
        break;
      case "FIND_NEARBY_NODES":
        handleFindNearbyNodesResponse(action)
        break;
      case "CALCULATE_ROUTE":
        handleCalculateRouteResponse(action)
        break;
      default:
        setState({status: 500, statusText: "Onbekende actie"});
        break;
    }
  } catch (e) {
    console.error(e)
    setState({status: 500, statusText: e.message, body: e});
  }
}

/**
 * Dispatches call to worker.
 * @param {string} graphSrc
 * @returns {Promise<void>}
 */
async function dispatchFetch(graphSrc) {
  setState({status: 102, statusText: "Bezig met laden"})

  /** @type {Action} */
  const action = {name: "FETCH", payload: {graphSrc}}
  dispatch(action)
}

/**
 * Process Worker response.
 * @param {Action} action
 */
function handleFetchResponse(action) {
  if (!action.result?.body) {
    setState({status: 500, statusText: "Er is een onbekende fout opgetreden"});
    return;
  }

  if (action.result.status < 200) {
    setState({
      status: action.result.status,
      statusText: action.result.statusText,
      ready: false,
      progress: action.result.body.progress
        ? action.result.body.progress.loaded / action.result.body.progress.total * 100
        : undefined
    })
  } else {
    setState({
      status: action.result.status,
      statusText: action.result.statusText,
      ready: true,
      locators: action.result.body.locators,
    })
  }
}

/**
 * Dispatches call to worker.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function dispatchFindNearbyNodes(id) {
  setState({status: 102, statusText: "Bezig met laden"})
  const center = Object.values(STATE.map.getCenter())
  const edge = Object.values(STATE.map.getBounds()._southWest)
  /** @type {Action} */
  const action = {name: "FIND_NEARBY_NODES", payload: {id, center: center.reverse(), edge: edge.reverse()}}
  dispatch(action)
}

/**
 * Process Worker response.
 * @param {Action} action
 */
function handleFindNearbyNodesResponse(action) {
  setState({
    status: action.result.status,
    statusText: action.result.statusText,
    selectableNodes: action.result.body.selectableNodes,
  });
}

/**
 * Dispatches call to worker.
 * @param {string} from
 * @param {string} to
 * @returns {Promise<void>}
 */
async function dispatchCalculateRoute(from, to) {
  setState({status: 102, statusText: "Bezig met laden"})

  /** @type {Action} */
  const action = {name: "CALCULATE_ROUTE", payload: {from, to}}
  dispatch(action)
}

/**
 * Process Worker response.
 * @param {Action} action
 */
function handleCalculateRouteResponse(action) {
  if (action.result.status < 200 && action.result.body.progress) {
    setState({
      status: action.result.status,
      statusText: action.result.statusText,
      progress: action.result.body.progress.loaded / action.result.body.progress.total * 100,
      ready: false,
    })
  } else {
    setState({
      status: action.result.status,
      statusText: action.result.statusText,
      path: action.result.body?.path || [],
      plan: action.result.body?.plan || [],
      ready: true,
    })
  }
}

function handleSelectNode(state, node) {
  const link = node.link;
  const coords = node.position.join(",")
  const value = `${link}@${coords}`

  var searchParams = new URLSearchParams(window.location.search);
  searchParams.set(state.selectableFor, value);
  const sanitizedState = Object.fromEntries(Object.entries(STATE).filter(([k, v]) => k !== "map"))
  history.pushState(sanitizedState, undefined, `?${searchParams.toString()}`)
  render(state)
}

/**
 * Renders state into a string.
 * @param state
 */
function render(state) {
  const sidebar = document.getElementById("sidebar");
  const sidebarWidth = sidebar.clientWidth;

  const {
    status,
    statusText,
    activePathIndex,
    locators,
    map,
    path,
    plan,
    progress,
    ready,
    selectableFor,
    selectableNodes,
    title,
  } = state;

  const searchParams = new URL(window.location).searchParams;
  const from = searchParams.get("from") || ""
  const to = searchParams.get("to") || ""

  // Clear existing layers.s
  map?.eachLayer(layer => {
    if (!(layer instanceof L.TileLayer)) {
      map.removeLayer(layer);
    }
  });

  // Draw selectable nodes.
  if (map?.getZoom() >= SELECT_MAP_MIN_ZOOM) {
    for (let node of selectableNodes) {
      const link = node.link;
      const coords = node.position.join(",")
      const title = `${link}@${coords}`
      L.marker(node.position.reverse(), {title}).addTo(map).on("click", () => handleSelectNode(state, node))
    }
  }

  // Draw path.
  if (map && path?.length) {
    const polylines = [];

    for (let i = 0; i <= path.length; i++) {
      const node = path[i];
      const nextNode = path[i + 1];
      const even = i % 2 === 0;

      if (nextNode) {
        const sectionStart = node.graphNode.position
        const sectionEnd = nextNode.graphNode.position
        const polyline = L.polyline([sectionStart, sectionEnd], {
          color: even ? 'cornflowerblue' : 'cornflowerblue',
          weight: 6
        }).addTo(map)

        polyline.bindPopup(node.graphNode.link)
        polylines.push(polyline);

        // When node selection is enabled, do not call fitBounds as it may interfere and cause a loop.
        if (selectableFor === null && i === activePathIndex) {
          map.fitBounds(polyline.getBounds(), {padding: [0, 0, 0, sidebarWidth]})
        }
      }
    }

    const featureGroup = L.featureGroup(polylines);
    // When node selection is enabled, do not call fitBounds as it may interfere and cause a loop.
    if (selectableFor === null && activePathIndex === null) {
      map.fitBounds(featureGroup.getBounds(), {padding: [0, 0, 0, sidebarWidth]})
    }
  }

  // Draw ui.
  sidebar.innerHTML = `
<!--    <header>-->
<!--      <ui-heading>${title}</ui-heading>-->
<!--    </header>-->

    <ui-form method="get" action="./">
        <ui-row>
            <ui-form-control id="from" label="Van" name="from" value="${from}" list="locators" placeholder="🏠" required></ui-form-control>
            <ui-button aria-controls="from"${status < 200 ? " disabled" : ""} name="select-on-map" square type="button" variant="secondary" title="Kies op kaart">📍</ui-button>
        </ui-row>

        <ui-row>
            <ui-form-control id="to" label="Naar" name="to" value="${to}" list="locators" placeholder="🏁" required></ui-form-control>
            <ui-button aria-controls="to"${status < 200 ? " disabled" : ""} name="select-on-map" square type="button" variant="secondary" title="Kies op kaart">📍</ui-button>
        </ui-row>

      <datalist id="locators">${locators?.locators.map(l => `<option>${l}</option>`).join("")}</datalist>

      <ui-row justify-content="space-between">
          <ui-button name="clear" type="reset"${status < 200 ? " disabled" : ""} variant="secondary">Wissen</ui-button>
          <ui-button type="submit"${!ready ? " disabled" : ""} variant="primary">${!ready ? "Nog even wachten… 🍕" : "Bereken route 🧭"}</ui-button>
      </ui-row>
    </ui-form>

    ${plan?.length ? `<vw-plan plan="${encodeURIComponent(JSON.stringify(plan, undefined, false))}"></vw-plan>` : ''}

    <footer>
    <ui-statusbar>
      <ui-text size="s">Status: ${statusText}</ui-text>
      ${ready || typeof progress !== "number" ? '' : `<ui-progressbar value="${progress}" title="${progress}%"/>`}
    </ui-statusbar>
    </footer>
  `;
}

/**
 * TODO: OFFLINE MAP?
 */
function initMap() {
  const map = L.map('map', {zoomControl: false}).setView([52.3676, 4.9041], 13);
  map.addEventListener("moveend", (e) => handleMapInput(e, map))
  map.addEventListener("resize", (e) => handleMapInput(e, map))
  map.addEventListener("zoomend", (e) => handleMapInput(e, map))
  L.control.zoom({
    position: 'bottomright'
  }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  setState({map: map})
}

/**
 * Updates the state based on Leaflet's side effects.
 * @param map
 */
function handleMapInput(e, map) {
  if (STATE.selectableFor && map.getZoom() < SELECT_MAP_MIN_ZOOM) {
    // setState({selectableFor: null, selectableNodes: []})
  }

  if (STATE.selectableFor !== null) {
    dispatchFindNearbyNodes(STATE.selectableFor)
  }
}

/**
 * Sets up events for the toolbar, input values are synced to state.
 */
function initEvents() {
  const handleClick = (e) => {
    const target = e.target;
    const name = target.getAttribute("name");

    switch (name) {
      case "clear":
        const  url = new URL(window.location);
        url.search = '';

        history.pushState(INITIAL_STATE, '', url)
        setState(BASE_STATE)
        break
      case "select-on-map":
        const controls = target.ariaControlsElements;
        console.assert(controls.length === 1, `aria-controls should reference exactly one element (found ${controls.length})!`);

        const uiInput = target.ariaControlsElements[0];
        const id = uiInput.name;

        // Cancel selection.
        if (STATE.selectableFor === id) {
          setState({selectableFor: null, selectableNodes: []});
          return;
        }

        // Show selection.
        STATE.map.setZoom(SELECT_MAP_MIN_ZOOM + SELECT_MAP_MIN_ZOOM_TOLERANCE)
        setState({selectableFor: id})
        dispatchFindNearbyNodes(id)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    const from = e.target.elements.from.value
    const to = e.target.elements.to.value;

    const params = new URLSearchParams({from, to}).toString()
    const state = Object.fromEntries(Object.entries(STATE).filter(([k, v]) => k !== "map"))
    history.pushState(state, '', `?${params}`)

    // Avoid conflicts with node selection.
    setState({selectableFor: null, selectableNodes: []});

    dispatchCalculateRoute(from, to);
  }


  const handleGraphNodeSelect = (e) => {
    const graphNodeId = e.detail.graphNodeId
    setState({activePathIndex: graphNodeId, selectableFor: null, selectableNodes: []})
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("graphNodeSelect", handleGraphNodeSelect);
}

/**
 * Main routine.
 * @returns {Promise<void>}
 */

async function main() {
  dispatchFetch("./assets/nl_graph.json.gz");
  initMap()
  initEvents();
}

document.addEventListener("DOMContentLoaded", main);
