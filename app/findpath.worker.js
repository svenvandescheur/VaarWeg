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
  const {graphSrc} = action.payload;
  const graph = await loadData(graphSrc)

  const locators = {
    locators: [...new Set(
      Object.keys(graph.graph)
        .map(k => k.split('#')[0])
        .sort((a, b) => a.localeCompare(b))
    )]
  }

  setState({graph, locators})
  dispatch(action, {body: {locators}})
}

/**
 * Returns JSON parsed data for entry and possibly related chunks.
 * @param {string} src
 * @returns {Promise<Object>}
 */
async function loadData(src) {
  const contents = await fetchFile(src)
  const data = JSON.parse(contents);

  if ("chunks" in data && "chunkTarget" in data && Array.isArray(data.chunks)) {
    const path = src.split("/");
    const filename = path.pop();
    const promises = data.chunks.map(chunk => fetchFile(path.join("/") + "/" + chunk).then(text => JSON.parse(text)))
    const chunks = await Promise.all(promises)
    data[data.chunkTarget] = chunks.reduce((acc, val) => ({...acc, ...val}), {})
    return data
  }
  return data
}

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
async function handleCalculateRoute(action) {
  const {from, to} = action.payload;
  const graph = STATE.graph;

  const start = findGraphNode(graph, from);
  const end = findGraphNode(graph, to);

  if (!start || !end) {
    dispatch(action, {status: 400, statusText: "\"From\" or \"To\" not found, please check spelling."});
    return;
  }

  const path = findPath(start, end, computeKey, computeDistance, findNeighbours.bind(null, graph), reconstructRenderablePath.bind(null, graph))

  // TODO: Type.
  const plan = path ? path.reduce((acc, {graphNode, link}, i) => {
    if (!link) return acc;

    const lastLinkName = acc.slice(-1)[0]?.name;
    const linkName = link.split("#")[0];

    if (lastLinkName === linkName) {
      return acc;
    }

    return [...acc, {name: linkName, graphNodeName: i}]
  }, []) : []


  const result = path ? {body: {path, plan}} : {status: 404, statusText: "No path found"};
  dispatch(action, result)
}

/**
 * Finds a graph node by its (partial) name.
 *
 * @param {Graph} graph - The graph object containing nodes.
 * @param {Object<string, {name: string}>|Array<{name: string}>} graph.graph -
 *        A dictionary (keyed by node name) or an array of node objects.
 * @param {string} partialName - The node name (or prefix) to search for.
 * @returns {GraphNode|undefined} The matching node object, or undefined if not found.
 */
function findGraphNode(graph, partialName) {
  const keyEntries = [...new Set(
    Object.keys(graph.graph)
      .map(k => k.split("#"))
  )]
  const keyEntry = keyEntries.find((ke => ke[0].toLowerCase() === partialName.toLowerCase()))
    ?? keyEntries.find(ke => ke[0].toLowerCase().startsWith(partialName.toLowerCase()))

  const key = keyEntry.join("#");
  return graph.graph[key]
}

/**
 * @param {GraphNode} node
 * @returns {string}
 */
function computeKey(node) {
  return `${node.l};${node.p.join(",")}`;
}

/**
 Thx ChatGPT...
 * @param {GraphNode} node1
 * @param {GraphNode} node2
 */
function computeDistance(node1, node2, order = 'lonlat') {
  const [a0, a1] = node1.p.map(Number);
  const [b0, b1] = node2.p.map(Number);

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
  return node.x.map(n => graph.graph[n]);
}

/**
 *
 * @param {Graph} graph
 * @param {{[index: string|number|symbol]: {graphNode: GraphNode, link: string|null}}[]} cameFrom
 * @param {GraphNode} current
 */
function reconstructRenderablePath(graph, cameFrom, current) {
  const path = []

  let graphNode = current;
  let link = null;
  while (graphNode) {
    path.splice(0, 0, {graphNode, link})
    const prevNode = graphNode

    graphNode = cameFrom[computeKey(graphNode)]
    link = graphNode && prevNode.x
      .find(neighborId => computeKey(graph.graph[neighborId]) === computeKey(graphNode))
  }

  return path.map(n => {
    return {...n, graphNode: {...n.graphNode, p: n.graphNode.p.toReversed()}};
  })
}
