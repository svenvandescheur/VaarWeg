// @ts-check

/**
 * Returns humanized `meters` as a `string` representing the distance in either "km" or "m" units.
 * @param {number} meters - Distance in meters.
 * @returns {string} A formatted distance string such as "300 m" or "1.2 km".
 */
export function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${Math.round(meters)} m`;
}

/**
 * Returns an emoji arrow ("⬆️", "⬅️", or "➡️") representing the direction to turn.
 * @param {number} direction - The direction in degrees relative to where you're facing.
 * @returns {"⬆️" | "⬅️️" | "➡️"} The emoji symbol for the direction.
 */
export function formatDirectionAsEmoji(direction) {
  switch (getTurnDirection(direction)) {
    case "FORWARD":
      return "⬆️";
    case "LEFT":
      return "⬅️️";
    case "RIGHT":
      return "➡️";
  }
}

/**
 * Returns a string representing the direction to turn.
 * @param {number} direction - The direction in degrees relative to where you're facing.
 * @returns {string} The direction label.
 */
export function formatDirectionAsString(direction) {
  switch (getTurnDirection(direction)) {
    case "FORWARD":
      return "ga rechtdoor";
    case "LEFT":
      return "ga links";
    case "RIGHT":
      return "ga rechts";
  }
}

/**
 * Returns whether a given direction implies turning "FORWARD", "LEFT", or "RIGHT"
 * when assuming the current facing direction is 0° (forward).
 * Uses the shortest turn direction.
 * @param {number} direction - The target direction in degrees (0–360).
 * @returns {"FORWARD" | "RIGHT" | "LEFT"} The turn direction relative to forward.
 */
export function getTurnDirection(direction) {
  const angle = ((direction + 540) % 360) - 180; // // Thx ChatGPT.

  if (Math.abs(angle) < 1) return "FORWARD"; // small tolerance
  return angle > 0 ? "RIGHT" : "LEFT";
}
