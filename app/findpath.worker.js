import {createReactiveApp, STATE} from "./lib/reactive.module.js";
import {findPath} from "./lib/findpath.module.js";

const {setState, dispatch} = createReactiveApp("findpath.worker");
const SYMBOL_GRAPH_NODE_KEY = Symbol("graph node key");

/**
 * Worker message handler.
 */
onmessage = async ({data}) => {
  setState({action: data});
  const action = data;

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
    dispatch(action, {status: 500, statusText: e.message, body: e});
    throw e;
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
  const data = await fetchFile(src)

  if ("chunks" in data && "chunkTarget" in data && Array.isArray(data.chunks)) {
    const path = src.split("/");
    const filename = path.pop();
    const promises = data.chunks.map(chunk => fetchFile(path.join("/") + "/" + chunk).then(text => text))
    const chunks = await Promise.all(promises)
    data[data.chunkTarget] = chunks.reduce((acc, val) => ({...acc, ...val}), {})
    return data
  }
  return data
}

/**
 * Fetch a file from the given URL and return its content as text,
 * while optionally reporting download progress.
 *
 * This function reads the response in chunks using a ReadableStream,
 * which allows progress updates even for large files. If the
 * "Content-Length" header is present, progress events will report
 * the fraction of the file loaded. Otherwise, progress events
 * will be emitted with `lengthComputable = false`.
 *
 * @param {string} path - The URL or path of the file to fetch.
 * @param {function(ProgressEvent): void} [onProgress=()=>null] -
 *        Optional callback function called with a ProgressEvent
 *        each time a chunk is loaded.
 *        The ProgressEvent has properties:
 *          - lengthComputable: boolean
 *          - loaded: number (bytes loaded so far)
 *          - total: number|null (total bytes if known)
 *
 * @returns {Promise<string>} - A promise that resolves to the file content as text.
 */
async function fetchFile(path, onProgress = () => null) {
  // FIXME FIXME FIXME: after 71af1fc2bb5ffd33a285185b9d95ccdb78d04bad progress is broken.
  const response = await fetch(path);

  const contentLength = response.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength) : null;
  let loaded = 0;

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const {done, value} = await reader.read()
    if (done) break

    chunks.push(value)
    loaded += value.length

    const event = new ProgressEvent("progress", {
      lengthComputable: Boolean(contentLength),
      loaded,
      total,
    })

    onProgress(event)
  }

  const blob = new Blob(chunks);
  return JSON.parse(await blob.text())
}

/**
 * @param {GraphNode} node
 * @returns {string}
 */
function computeKey(node) {
  return `${node.l};${node.p.join(",")}`;
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
 * Compute distance between nodes (Haversine)
 */
function computeDistance(node1, node2, order = "lonlat") {
  const [a0, a1] = node1.p.map(Number);
  const [b0, b1] = node2.p.map(Number);

  let lat1, lon1, lat2, lon2;
  if (order === "lonlat") {
    lon1 = a0;
    lat1 = a1;
    lon2 = b0;
    lat2 = b1;
  } else {
    lat1 = a0;
    lon1 = a1;
    lat2 = b0;
    lon2 = b1;
  }

  const R = 6371; // km
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Return neighbors of a node.
 */
function findNeighbours(graph, node) {
  return node.x.map(id => graph.graph[id]);
}

/**
 * Reconstruct renderable path.
 */
function reconstructRenderablePath(graph, cameFrom, current) {
  const path = [];
  let graphNode = current;
  let link = null;

  while (graphNode) {
    path.unshift({graphNode, link});
    const prevNode = graphNode;
    graphNode = cameFrom[computeKey(graphNode)];
    if (graphNode) {
      link = prevNode.x.find(neighborId => computeKey(graph.graph[neighborId]) === computeKey(graphNode));
    }
  }

  return path.map(n => ({...n, graphNode: {...n.graphNode, p: n.graphNode.p.slice().reverse()}}));
}

/**
 * Handle CALCULATE_ROUTE action.
 */
async function handleCalculateRoute(action) {
  const {from, to} = action.payload;
  const graph = STATE.graph;


  dispatch(action, {status: 102, statusText: `Resolving nodes`});
  const start = findGraphNode(graph, from);
  const end = findGraphNode(graph, to);

  if (!start || !end) {
    dispatch(action, {status: 400, statusText: `"From" or "To" not found`});
    return;
  }

  let progress = 0;
  /**
   * @param progressEvent
   */
  const handleProgress = (progressEvent) => {
    const _progress = Math.round(progressEvent.loaded / progressEvent.total * 10);
    if (_progress > progress) {
      progress = _progress;
      dispatch(action, {
        status: 102, statusText: "Calculating route",
        body: {
          progress: {
            lengthComputable: progressEvent.lengthComputable,
            loaded: progressEvent.loaded,
            total: progressEvent.total,
          }
        }
      });
    }
  }
  const path = findPath(start, end, computeKey, computeDistance, findNeighbours.bind(null, graph), reconstructRenderablePath.bind(null, graph), handleProgress);

  const plan = path ? path.reduce((acc, {graphNode, link}, i) => {
    if (!link) return acc;

    const lastLinkName = acc.slice(-1)[0]?.linkName;
    const linkName = link.split("#")[0];

    if (lastLinkName === linkName) {
      return acc;
    }
    return [...acc, {linkName, graphNodeName: i}]
  }, []) : []

  dispatch(action, path
    ? {body: {path, plan}}
    : {status: 404, statusText: "No path found"});
}
