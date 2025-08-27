import {createReactiveApp, STATE} from "./lib/reactive.module.js"
import {findPath} from "./lib/findpath.module.js";

const {setState, dispatch} = createReactiveApp("findpath.worker");

/**
 * Worker message handler.
 * @param {MessageEvent} e
 */
onmessage = async ({data}) => {
  setState({action: data})

  /** @type {Action} */
  const action = data

  try {
    switch (action.name) {
      case "FETCH":
        await handleFetch(action);
        break;
      case "CALCULATE_ROUTE":
        await handleCalculateRoute(action);
        break;
      default:
        dispatch(action, {status: 500, statusText: "Unknown error"});
        break;
    }
  } catch (e) {
    dispatch(action, {status: 500, statusText: e.message, body: e})
    throw (e);
  }
};

/**
 * Fetches file from path.
 * @param {string} path
 * @returns {Promise<string>}
 */
async function fetchFile(path) {
  const response = await fetch(path);
  return await response.text();
}

/**
 * Process Worker response.
 * @param {Action} action
 */
async function handleFetch(action) {
  // From state (memoize).
  if (STATE.graph) {
    dispatch(action, {status: 208, statusText: "From cache", body: STATE.graph})
    return;
  }

  // From file.
  const {graphSrc, linksSrc, locatorsSrc} = action.payload;

  const graphContents = await fetchFile(graphSrc)
  const graph = JSON.parse(graphContents)

  const linksContents = await fetchFile(linksSrc)
  const links = JSON.parse(linksContents)

  const locatorsContents = await fetchFile(locatorsSrc)
  const _locators = JSON.parse(locatorsContents)

  // FIXME: Should be pre-sorted.
  const locators = {..._locators, locators: _locators.locators.sort((a, b) => a.name.localeCompare(b.name))}

  setState({graph, links, locators})
  dispatch(action, {body: {locators}})
}

/**
 * Process Worker response.
 * @param {Action} action
 */
async function handleCalculateRoute(action) {
  const {from, to} = action.payload;
  const graph = STATE.graph;
  const links = STATE.links;

  const start = findGraphNode(graph, from);
  const end = findGraphNode(graph, to);

  if (!start || !end) {
    dispatch(action, {status: 400, statusText: "\"From\" or \"To\" not found, please check spelling."});
    return;
  }

  const path = findPath(start, end, computeKey, computeDistance, findNeighbours.bind(null, graph), reconstructRenderablePath.bind(null, graph, links))

  // TODO: Type.
  const plan = path ? path.reduce((acc, {graphNode, link}) => {
    if (!link) return acc;

    const lastLinkName = acc.slice(-1)[0]?.name;
    const linkName = link.split("#")[0];

    if (lastLinkName === linkName) {
      return acc;
    }

    return [...acc, {name: linkName, graphNodeName: graphNode.name}]
  }, []) : []


  const result = path ? {body: {path, plan}} : {status: 404, statusText: "No path found"};
  dispatch(action, result)
}

/**
 * Finds a graph node by its name.
 *
 * Attempts to return an exact match from the graph dictionary first.
 * If no exact match is found, it falls back to a partial match by checking
 * if any node's name starts with the given `graphNodeName`.
 *
 * @param {Graph} graph - The graph object containing nodes.
 * @param {Object<string, {name: string}>|Array<{name: string}>} graph.graph -
 *        A dictionary (keyed by node name) or an array of node objects.
 * @param {string} graphNodeName - The node name (or prefix) to search for.
 * @returns {{name: string}|undefined} The matching node object, or undefined if not found.
 */
function findGraphNode(graph, graphNodeName) {
  return graph.graph[graphNodeName]
      ?? Object.values(graph.graph).find(n => n.name.toLowerCase().startsWith(graphNodeName.toLowerCase()));
}

/**
 * @param {GraphNode} node
 * @returns {string}
 */
function computeKey(node) {
  return node.name
}

/**
 Thx ChatGPT...
 * @param {GraphNode} node1
 * @param {GraphNode} node2
 */
function computeDistance(node1, node2, order = 'lonlat') {
  const [a0, a1] = node1.pos.map(Number);
  const [b0, b1] = node2.pos.map(Number);

  let lat1, lon1, lat2, lon2;
  if (order === 'lonlat') {
    lon1 = a0;
    lat1 = a1;
    lon2 = b0;
    lat2 = b1;
  } else if (order === 'latlon') {
    lat1 = a0;
    lon1 = a1;
    lat2 = b0;
    lon2 = b1;
  } else throw new Error("order must be 'lonlat' or 'latlon'");


  const R = 6371; // km
  const toRad = d => d * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @param {Graph} graph
 * @param {GraphNode} node
 * @return {[string, GraphNode[]]}
 */
function findNeighbours(graph, node) {
  return node.neighbors.map(n => graph.graph[n[1]]);
}

/**
 *
 * @param {Graph} graph
 * @param links
 * @param {{[index: string|number|symbol]: {graphNode: GraphNode, link: string|null}}[]} cameFrom
 * @param {GraphNode} current
 */
function reconstructRenderablePath(graph, links, cameFrom, current) {
  const path = []

  let graphNode = current;
  let link = null;
  while (graphNode) {
    path.splice(0, 0, {graphNode, link})
    const prevNode = graphNode

    graphNode = cameFrom[computeKey(graphNode)]
    link = graphNode && prevNode.neighbors
      .find(([_, neighborName]) => computeKey(graph.graph[neighborName]) === computeKey(graphNode))?.[0]
  }

  return path.map(n => {
    return {...n, graphNode: {...n.graphNode, pos: n.graphNode.pos.toReversed()}};
  })
}
