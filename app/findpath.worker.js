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
 * Handle FETCH action.
 */
async function handleFetch(action) {
  if (STATE.graph) {
    dispatch(action, {status: 208, statusText: "From cache", body: STATE.graph});
    return;
  }

  /**
   * @param progressEvent
   */
  const handleProgress = (progressEvent) => {
    dispatch(action, {
      status: 102, statusText: "Downloading map",
      body: {
        progress: {
          lengthComputable: progressEvent.lengthComputable,
          loaded: progressEvent.loaded,
          total: progressEvent.total,
        }
      }
    });
  }

  const {graphSrc} = action.payload;
  const graph = await fetchFile(graphSrc, handleProgress);
  initializeGraph(graph, action);

  // Build list of unique canal names from links
  const locators = {locators: [...new Set(graph.links)]};
  setState({graph, locators});
  dispatch(action, {statusText: "Map loaded", body: {graph, locators}});
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
 * Reverses file-size optimizations to the graph, converting it into a workable format.
 */
function initializeGraph(graph, action) {
  const normalizedGraph = {}
  const graphNodes = graph.graph.split(";");
  let completed = 0;
  let progress = 0;

  for (const key of graphNodes) {
    // Limit amount of events sent back to main thread.
    const _progress = Math.round(completed / graphNodes.length * 100);
    if (_progress > progress) {
      progress = _progress;
      dispatch(action, {
        status: 102, statusText: "Parsing map",
        body: {
          progress: {
            lengthComputable: true,
            loaded: completed,
            total: graphNodes.length,
          }
        }
      })
    }

    const [meta, neighborsStr] = key.split(":")
    const [linkId, coordId, posStr] = meta.split("#")
    const nodeId = `${linkId}#${coordId}`;

    normalizedGraph[nodeId] = {
      [SYMBOL_GRAPH_NODE_KEY]: nodeId,
      p: posStr.split(",").map(c => restoreCoordinate(c)),
      x: neighborsStr?.split(",") || []
    }

    completed++;
  }
  graph.graph = normalizedGraph;
  graph.links = graph.links.split("#")
}


/**
 * Reverses the base62 coordinate encoding.
 * @returns {number|number}
 * @param {string} encoded - Base62 encoded coordinate.
 * @param {number} decimals
 */
function restoreCoordinate(encoded, decimals = 5) {
  let scale = 10 ** decimals;
  return fromBase62(encoded) / scale;
}


function fromBase62(str) {
  const base62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  let neg = str[0] === "-";
  if (neg) str = str.slice(1);

  let num = 0;
  for (let i = 0; i < str.length; i++) {
    num = num * 62 + base62.indexOf(str[i]);
  }
  return neg ? -num : num;
}

/**
 * Compute a unique key for a node.
 */
function computeKey(node) {
  console.assert(node);
  if (!node[SYMBOL_GRAPH_NODE_KEY]) {
    throw new Error("Graph not initialized!");
  }
  return node[SYMBOL_GRAPH_NODE_KEY];
}

/**
 * Find a graph node by its name (from links array).
 */
function findGraphNode(graph, nodeName) {
  const linkIndex = graph.links.findIndex(name => name.toLowerCase() === nodeName.toLowerCase());

  // Fallback: partial match
  if (linkIndex === -1) {
    const partialIndex = graph.links.findIndex(name => name.toLowerCase().startsWith(nodeName.toLowerCase()));
    if (partialIndex === -1) return undefined;
    return Object.values(graph.graph).find(node => parseInt(node[SYMBOL_GRAPH_NODE_KEY].split(";")[0]) === partialIndex);
  }

  // Find first node in graph.graph that belongs to this canal index
  return Object.values(graph.graph).find(node => {
    const a = parseInt(node[SYMBOL_GRAPH_NODE_KEY].split(";")[0]);
    return parseInt(node[SYMBOL_GRAPH_NODE_KEY].split(";")[0]) === linkIndex;
  });
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
    const linkIndex = parseInt(link.split(";")[0]);
    const linkName = graph.links[linkIndex];
    if (lastLinkName === linkName) return acc;
    return [...acc, {linkName, graphNodeIndex: i}];
  }, []) : [];

  dispatch(action, path
    ? {body: {path, plan}}
    : {status: 404, statusText: "No path found"});
}
