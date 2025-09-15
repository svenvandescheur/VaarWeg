// @ts-check
import {createReactiveApp, STATE} from "./lib/reactive.module.js"
import "./components/index.js"

const {setState, dispatch} = createReactiveApp("app", render, {
  dataWarningSeen: localStorage.getItem("VaarWeg.dataWarningSeen")?.toLowerCase() === "true",
  title: "VaarWeg",
  status: 102,
  statusText: "Loading",
  action: null,
  ready: false,
  path: [],
  activePathIndex: null,
  plan: [],
  progress: 0,
  map: null,
}, "./findpath.worker.js", onMessage)

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
      case "CALCULATE_ROUTE":
        handleCalculateRouteResponse(action)
        break;
      default:
        setState({status: 500, statusText: "Unknown error"});
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
  setState({status: 102, statusText: "Loading"})

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
    setState({status: 500, statusText: "Unknown error"});
    return;
  }

  if (action.result.status < 200) {
    setState({
      status: action.result.status,
      statusText: action.result.statusText,
      ready: false,
      progress: action.result.body.progress.loaded / action.result.body.progress.total * 100
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
 * @param {string} from
 * @param {string} to
 * @returns {Promise<void>}
 */
async function dispatchCalculateRoute(from, to) {
  setState({status: 102, statusText: "Loading"})

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

/**
 * Renders state into a string.
 * @param state
 */
function render(state) {
  const sidebar = document.getElementById("sidebar");
  const {
    dataWarningSeen,
    locators,
    map,
    path,
    plan,
    progress,
    ready,
    activePathIndex,
    status,
    statusText,
    title
  } = state;
  const showDataWarning = !dataWarningSeen && !["localhost", "127.0.0.1"].includes(window.location.hostname)
  const searchParams = new URL(window.location).searchParams;
  const from = searchParams.get("from") || ""
  const to = searchParams.get("to") || "";

  // Leaflet
  map?.eachLayer(layer => {
    if (!(layer instanceof L.TileLayer)) {
      map.removeLayer(layer);
    }
  });

  if (map && path?.length) {
    const polylines = [];

    for (let i = 0; i <= path.length; i++) {
      const node = path[i];
      const nextNode = path[i + 1];
      const even = i % 2 === 0;

      if (nextNode) {
        const sectionStart = node.graphNode.p
        const sectionEnd = nextNode.graphNode.p
        const polyline = L.polyline([sectionStart, sectionEnd], {
          color: even ? 'cornflowerblue' : 'cornflowerblue',
          weight: 6
        }).addTo(map)

        polyline.bindPopup(node.link?.split("#")[0])
        polylines.push(polyline);

        if (i === activePathIndex) {
          map.fitBounds(polyline.getBounds())
        }
      }
    }

    const featureGroup = L.featureGroup(polylines);
    if (activePathIndex === null) map.fitBounds(featureGroup.getBounds())
  }

  sidebar.innerHTML = `
    <header>
      <ui-heading>${title}</ui-heading>
      ${dataWarningSeen ? '' :  `<ui-alert level="warning">
          <ui-text>VaarWeg is data-intensief, houd rekening met dataverbruik wanneer je deze pagina opent via een mobiele verbinding.</ui-text>
          <ui-text slot="translation" size="s" lang="en">VaarWeg is data intensive, please consider data usage when opening this page on a mobile connection.</ui-text>
      </ui-alert>`}
    </header>

<!--    <section>-->
    <ui-form method="get" action="./">
      <ui-form-control label="Van" name="from" value="${from}" list="locators" placeholder="🏠" required></ui-form-control>
      <ui-form-control label="Naar" name="to" value="${to}" list="locators" placeholder="🏁" required></ui-form-control>
      <datalist id="locators">${locators?.locators.map(l => `<option>${l}</option>`).join("")}</datalist>
      <ui-button variant="primary" type="submit"${status < 200 ? " disabled" : ""}>${status === 102 ? "Nog even wachten… 🍕" : "Bereken route 🛳️️"}</ui-button>
    </ui-form>

    <vw-plan plan="${plan && encodeURIComponent(JSON.stringify(plan, undefined, false))}"></vw-plan>
<!--    </section>-->

    <footer>
    <ui-statusbar>
      <ui-text size>Status: ${statusText}</ui-text>
      ${ready ? '' : `<ui-progressbar value="${progress}" title="${progress}%"/>`}
    </ui-statusbar>
    </footer>
  `;
}

/**
 * TODO: OFFLINE MAP?
 */
function initMap() {
  var map = L.map('map').setView([52.3676, 4.9041], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  setState({map: map})
}

/**
 * Sets up events for the toolbar, input values are synced to state.
 */
function initEvents() {
  const handleClick = (e) => {
    handleAlertClick(e);
  }

  const handleAlertClick = (e) => {
    if (e.target.tagName !== "UI-ALERT") return

    setState({dataWarningSeen: true})
    localStorage.setItem("VaarWeg.dataWarningSeen", "true")
  }


  const handleSubmit = (e) => {
    e.preventDefault()

    const from = e.target.elements.from.value
    const to = e.target.elements.to.value;

    const params = new URLSearchParams({from, to}).toString()
    const state = Object.fromEntries(Object.entries(STATE).filter(([k, v]) => k !== "map"))
    history.pushState(state, '', `?${params}`)

    dispatchCalculateRoute(from, to);
  }


  const handleGraphNodeSelect = (e) => {
    const graphNodeId = e.detail.graphNodeId
    setState({activePathIndex: graphNodeId})
  }

  document.addEventListener("submit", handleSubmit);
  document.addEventListener("click", handleClick);
  document.addEventListener("graphNodeSelect", handleGraphNodeSelect);
}

/**
 * Main routine.
 * @returns {Promise<void>}
 */

async function main() {
  dispatchFetch("./assets/nl_graph.json");
  initMap()
  initEvents();
}

document.addEventListener("DOMContentLoaded", main);
