import {createReactiveApp, STATE} from "./lib/reactive.module.js";
import {findPath} from "./lib/path.module.js";
import {getDirection, getDistance, getRelativeDirection} from "./lib/geo.module.js";

const {setState, dispatch} = createReactiveApp("compute.worker");

/**
 * Worker message handler.
 */
onmessage = async ({data}) => {
  const action = data;

  try {
    switch (action.name) {
      case "FETCH":
        await handleFetch(action);
        break;
      case "FIND_NEARBY_NODES":
        await handleFindNearbyNodes(action);
        break;
      case "CALCULATE_ROUTE":
        await handleCalculateRoute(action);
        break;
      default:
        dispatch(action, {status: 500, statusText: "Unknown action"});
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

  // Throttle ref.
  let progress = 0;

  /**
   * Dispatches throttled (see `progress`) `progressEvent` (10 steps).
   * @todo: Make a more generic solution for this.
   * @param {ProgressEvent} progressEvent
   */
  const handleProgress = (progressEvent) => {
    const _progress = Math.round(progressEvent.loaded / progressEvent.total * 10);
    if (_progress > progress) {
      progress = _progress > 90 ? 0 : _progress; // More accurate when > 90%.
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
  }

  // From file.
  const {graphSrc} = action.payload;
  const graph = await fetchFile(graphSrc, handleProgress)
  const links = graph.links
  setState({graph, locators: links})

  const graphStr = graph.graph;
  const graphNodes = graphStr.split("#")

  dispatch(action, {status: 102, statusText: "Parsing map"})

  graph.graph = {}
  for (const dataStr of graphNodes) {
    const [key, link, position, neighbors] = dataStr.split(";")
    graph.graph[key] = {
      k: key,
      link: links[parseInt(link)],
      position: position.split(","),
      neighbors: neighbors.split(",")
    }
  }

  // FIXME: reduce nesting.
  dispatch(action, {body: {locators: {locators: links}}})
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
  const contentType = response.headers.get("Content-Type");

  let stream = response.body;

  // If gzip, decompress
  if (contentType.includes("gzip")) {
    const ds = new DecompressionStream("gzip");
    stream = stream.pipeThrough(ds);
  }

  const total = contentLength ? parseInt(contentLength) : null;
  let loaded = 0;

  const reader = stream.getReader();
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
  return node.k;
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
  // This is an exact node.
  if (partialName.includes("@")) {
    const [locator, strCoords] = partialName.split("@");

    for (const node of Object.values(graph.graph)) {
      if (node.link === locator) {
        const strPosition = node.position.toReversed().join();
        if (strPosition === strCoords) return node
      }
    }
    return
  }

  const q = partialName.toLowerCase()
  const candidates = []

  for (const key in graph.graph) {
    const node = graph.graph[key]
    const locator = node.link.toLowerCase()

    if (locator === q) {
      return node
    }

    if (locator.startsWith(q)) {
      candidates.push(node)
    }
  }

  return candidates.sort((a, b) => a.length - b.length)[0]
}

/**
 * Return neighbors of a node.
 */
function findNeighbours(graph, node) {
  return node.neighbors.map(id => graph.graph[id]).filter(Boolean)
}

/**
 * Reconstructs a path from the `cameFromMap` for rendering.
 *
 * Walks backward from the `end` node to the start using `cameFromMap`,
 * building an array of path segments. Each segment contains:
 *   - `graphNode`: the current node in the path
 *   - `link`: any link information associated with the node
 *
 * The positions of nodes are reversed from [lon, lat] to [lat, lon] to
 * be compatible with Leaflet mapping.
 *
 * @param {Object} graph - The graph containing nodes and links.
 * @param {Object} cameFromMap - Map of node IDs to their predecessor nodes.
 * @param {Object} end - The end node of the path.
 * @returns {Array} Array of path segments with `graphNode`, `distance`, and `link`.
 */
function reconstructRenderablePath(graph, cameFromMap, end) {
  const path = [];
  let graphNode = end;
  let direction = 360;
  let distance = 0;
  let link = graphNode.link;


  while (graphNode) {
    // Insert current `graphNode` and it's connecting to `link` to path.
    path.unshift({direction, distance, graphNode, link});

    // Get the id of the current `graphNode`.
    const currentId = computeKey(graphNode);

    // Assign the node connecting to the current `graphNode` to `graphNode`.
    const previousGraphNode = graphNode;
    graphNode = cameFromMap[currentId];

    // Compute the direction between the two points (reverse order as we're computing from end to start).
    direction = graphNode ? getDirection(graphNode.position, previousGraphNode.position) || direction : direction

    // Compute the distance between the two points.
    distance = graphNode ? getDistance(previousGraphNode.position, graphNode.position) : 0

    // Get the name of the link connecting to the previous `graphNode` value.
    link = graphNode?.link || null
  }

  return path
}

/**
 * Finds nodes close to `center`
 */
function handleFindNearbyNodes(action) {
  const {center, edge} = action.payload;
  const distance = getDistance(center, edge);
  const graph = STATE.graph.graph;
  const selectableNodes = []

  for (const node of Object.values(graph)) {
    const position = node.position;

    if (getDistance(position, center) < distance) {
      selectableNodes.push(node);
    }
  }
  dispatch(action, {body: {selectableNodes}});
}

/**
 * Handle CALCULATE_ROUTE action.
 */
function handleCalculateRoute(action) {
  const {from, to} = action.payload;
  const graph = STATE.graph;

  dispatch(action, {status: 102, statusText: `Resolving nodes`});
  const start = findGraphNode(graph, from);
  const end = findGraphNode(graph, to);

  if (!start || !end) {
    dispatch(action, {status: 400, statusText: `"From" or "To" not found`});
    return;
  }

  const _path = findPath(start, end, computeKey, (n1, n2) => getDistance(n1.position, n2.position, "lonlat"), findNeighbours.bind(null, graph), reconstructRenderablePath.bind(null, graph))
  // lonLat to latLon.
  const path = _path?.map?.(n => ({...n, graphNode: {...n.graphNode, position: n.graphNode.position.slice().reverse().map(parseFloat)}}));

  // TODO: Add turn info.
  const plan = path
    ? path.reduce((acc, {direction, distance, graphNode, link}, i) => {
      const previousGraphNode = path[i - 1];
      const previousLink = previousGraphNode?.link
      const isSameLink = link === previousLink;

      // Update the previous node and extend the distance calculation with the new link segment.
      if (isSameLink) {
        const linkDistance = acc[acc.length - 1].distance + distance;  // Build total distance of all segments of this link.
        acc[acc.length - 1] = {
          ...acc[acc.length - 1],
          distance: linkDistance,
        };
        return acc;
      }

      // Add a new link.
      const previousNode = acc[acc.length - 1];
      const previousDirection = previousNode ? previousNode.direction : 360;
      const relativeDirection = getRelativeDirection(previousDirection, direction)

      return [...acc, {
        direction,
        relativeDirection,
        distance,
        linkName: link,
        graphNodeIndex: i
      }]
    }, [])
    : []

  dispatch(action, path
    ? {body: {path, plan}}
    : {status: 404, statusText: "No path found"});
}
