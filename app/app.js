// @ts-check
import {createReactiveApp, STATE} from "./lib/reactive.module.js"

const {setState, dispatch} = createReactiveApp("app", render, {
  title: "VaarWeg",
  status: 102,
  statusText: "Loading",
  action: null,
  ready: false,
  path: [],
  plan: [],
  activeGraphNodeName: null,
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
 * @param {string} linksSrc
 * @param {string} locatorsSrc
 * @returns {Promise<void>}
 */
async function dispatchFetch(graphSrc, linksSrc, locatorsSrc) {
  setState({status: 102, statusText: "Loading"})

  /** @type {Action} */
  const action = {name: "FETCH", payload: {graphSrc, linksSrc, locatorsSrc}}
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

  setState({
    status: action.result.status,
    statusText: action.result.statusText,
    ready: true,
    locators: action.result.body.locators,
  })
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
  setState({
    status: action.result.status,
    statusText: action.result.statusText,
    path: action.result.body?.path,
    plan: action.result.body?.plan,
  })
}

/**
 * Renders state into a string.
 * @param state
 */
function render(state) {
  const sidebar = document.getElementById("sidebar");
  const {locators, map, path, plan, activeGraphNodeName, status, statusText, title} = state;
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
        const sectionStart = node.graphNode.pos
        const sectionEnd = nextNode.graphNode.pos
        const polyline = L.polyline([sectionStart, sectionEnd], {
          color: even ? 'cornflowerblue' : 'cornflowerblue',
          weight: 6
        }).addTo(map)

        polyline.bindPopup(node.link?.split("#")[0])
        polylines.push(polyline);

        if (node.graphNode.name === activeGraphNodeName) {
          map.fitBounds(polyline.getBounds())
        }
      }
    }

    const featureGroup = L.featureGroup(polylines);
    if (activeGraphNodeName === null) map.fitBounds(featureGroup.getBounds())

  }

  // Regular DOM.
  sidebar.innerHTML = `
    <header>
      <h1 class="logo">${title}</h1>
    </header>

    <form class="form" method="get" action="./">
      <label class="form-control">From: <input class="input" list="locators" name="from" value="${from}" required/></label>
      <label class="form-control">To: <input class="input" list="locators" name="to" value="${to}" required/></label>
      <datalist id="locators">${locators?.locators.map(l => `<option>${l.name}</option>`).join("")}</datalist>

      <input class="button" type="submit" value="${status === 102 ? "Laden… 🍕" : "Bereken route"}"${status === 102 ? " disabled" : ""}/>
    </form>

    ${plan ? `
    <section class="plan">
      <ol class="plan__list">
        ${plan.map(({name, graphNodeName}) => `
        <li class="plan__list-item">
          <button class="button button--link" id="plan-${graphNodeName}">${name}</button>
        </li>`).join("")}
      </ol>
    </section>

    <footer class="statusbar">
      <span>Status: ${statusText} (${status})</span>
    </footer>
</footer>
    ` : ''}
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
  const handleSubmit = (e) => {
    e.preventDefault();
    const from = e.target.elements.from.value
    const to = e.target.elements.to.value;

    const params = new URLSearchParams({from, to}).toString()
    const state = Object.fromEntries(Object.entries(STATE).filter(([k, v]) => k !== "map"))
    history.pushState(state, '', `?${params}`)

    setTimeout(() => {
      dispatchCalculateRoute(
        e.target.elements.from.value,
        e.target.elements.to.value,
      )
    })
  }

  const handlePlanLinkClick = (e) => {
    if (!e.target.parentElement.classList.contains('plan__list-item')) return
    const id = e.target.id
    const index = id.split('plan-')[1];

    setState({activeGraphNodeName: index})
  }

  document.addEventListener("submit", handleSubmit);
  document.addEventListener("click", handlePlanLinkClick);
}

/**
 * Main routine.
 * @returns {Promise<void>}
 */

async function main() {
  dispatchFetch("./assets/nl_graph.json", "./assets/nl_links.json", "./assets/nl_locators.json");
  initMap()
  initEvents();
}

document.addEventListener("DOMContentLoaded", main);
