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
 * @typedef {Object} Graph
 * @property {string} name - Graph name.
 * @property {string} createAd - Graph creation date.
 * @property {number} schemaVersion - Schema version.
 * @property {InlineGraph} graph - Graph data.
 */

/**
 * @typedef {Object.<string, GraphNode>} InlineGraph
 */

/**
 * @typedef GraphNode *
 * @property {string} l - The link id this node is a member of.
 * @property {string[]} p - The positions (coordinates) of this node.
 * @property {string[]} x - The keys of the neighboring nodes.
 * @property {string[]} neighbors
 */
