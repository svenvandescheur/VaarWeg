/**
 * @param {unknown} start - The start point
 * @param {unknown} goal - The destination point
 * @param {(graphNode: unknown) => string|number|symbol} computeKeyFn - Function that takes current node and destination node to provide the distance heuristic.
 * @param {(from: unknown, to: unknown) => number} computeDistanceFn - Function that takes current node and destination node to provide the distance (heuristic).
 * @param {(graphNode: unknown) => unknown[]} findNeighborsFn - Function that takes current node and returns the neighbor nodes.
 * @param {(cameFrom: {[index: string|number|symbol]: unknown}, current: unknown) => unknown[]|*} reconstructPathFn - Function that takes current node and returns the neighbor nodes.
 * @param {function(ProgressEvent): void} [onProgress=()=>null] -
 *        Optional callback function called with a ProgressEvent
 *        each time a chunk is loaded.
 *        The ProgressEvent has properties:
 *          - lengthComputable: true
 *          - loaded: number
 *          - total: number
 * @return {unknown[]|*} - Return value of `reconstructPathFn`.
 */
export function findPath(start, goal, computeKeyFn, computeDistanceFn, findNeighborsFn, reconstructPathFn = reconstructPath, onProgress = () => null) {
  const openSet = [start]
  const cameFrom = {}
  const startKey = computeKeyFn(start);
  const gScore = {[startKey]: 0}
  const fScore = {[startKey]: computeDistanceFn(start, goal)}

  while (openSet.length) {
    const current = openSet.shift()
    const currentKey = computeKeyFn(current);

    if (current === goal) {
      return reconstructPathFn(cameFrom, current)
    }

    const neighbors = findNeighborsFn(current)
    for (const neighbor of neighbors) {
      const neighborKey = computeKeyFn(neighbor)
      const knownGScore = gScore[neighborKey] ?? Infinity;
      const tentativeGScore = gScore[currentKey] + computeDistanceFn(current, neighbor)

      if (tentativeGScore < knownGScore) {
        const neighborDistanceToGoal = computeDistanceFn(neighbor, goal);

        gScore[neighborKey] = tentativeGScore;
        fScore[neighborKey] = tentativeGScore + neighborDistanceToGoal;
        cameFrom[neighborKey] = current;

        onProgress(new ProgressEvent("progress", {
          lengthComputable: typeof graphSize !== "undefined",
          loaded: gScore[neighborKey] / fScore[neighborKey] * 100,
          total: 100
        }))

        openSet.push(neighbor)
        openSet.sort((a, b) => {
          return fScore[computeKeyFn(a)] - fScore[computeKeyFn(b)]
        })
      }
    }
  }

  return false;
}

/**
 * Default only.
 * @param {{[index: string|number|symbol]: unknown}} cameFrom
 * @param {unknown} current
 * @return {unknown[]}
 */
export function reconstructPath(cameFrom, current) {
  const path = []

  let graphNode = current;
  while (graphNode) {
    path.splice(0, 0, graphNode)
    graphNode = cameFrom[computeKey(graphNode)]
  }

  return path
}
