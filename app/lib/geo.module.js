// Thx ChatGPT.

const R = 6371; // Earth radius in km
const DEG_TO_RAD = Math.PI / 180;

/**
 * Computes the great-circle distance between two geographic points using the Haversine formula.
 * @param {[number, number]} start - Starting coordinates [lon, lat] or [lat, lon].
 * @param {[number, number]} end - Ending coordinates [lon, lat] or [lat, lon].
 * @param {"lonlat" | "latlon"} [order="lonlat"] - Order of coordinates in position arrays.
 * @returns {number} Distance in meters.
 */
export function getDistance(start, end, order = "lonlat") {
  const lat1 = order === "lonlat" ? start[1] : start[0];
  const lon1 = order === "lonlat" ? start[0] : start[1];

  const lat2 = order === "lonlat" ? end[1] : end[0];
  const lon2 = order === "lonlat" ? end[0] : end[1];

  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;

  const sinDLat = Math.sin(dLat * 0.5);
  const sinDLon = Math.sin(dLon * 0.5);

  const a =
    sinDLat * sinDLat +
    Math.cos(lat1 * DEG_TO_RAD) *
    Math.cos(lat2 * DEG_TO_RAD) *
    sinDLon * sinDLon;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000;
}

/**
 * Computes the initial bearing (direction) from a start point to an end point.
 * @param {[number, number]} start - Starting coordinates [lon, lat] or [lat, lon].
 * @param {[number, number]} end - Ending coordinates [lon, lat] or [lat, lon].
 * @param {"lonlat" | "latlon"} [order="lonlat"] - Order of coordinates in arrays.
 * @returns {number} Bearing in degrees from 0 to 360.
 */
export function getDirection(
  start,
  end,
  order = "lonlat"
) {
  const [startLat, startLon] = order === "lonlat" ? [start[1], start[0]] : [start[0], start[1]];
  const [endLat, endLon] = order === "lonlat" ? [end[1], end[0]] : [end[0], end[1]];

  const lat1Rad = startLat * Math.PI / 180;
  const lat2Rad = endLat * Math.PI / 180;
  const deltaLonRad = (endLon - startLon) * Math.PI / 180;

  const y = Math.sin(deltaLonRad) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Computes the relative direction from `start` to `end` when facing `start`.
 * @param {number} start - Start degrees from 0 to 360
 * @param {number} end - End degrees from 0 to 360
 * @returns {number} - The clockwise angle to end (0–359)
 */
export function getRelativeDirection(start, end) {
  return (end - start + 360) % 360;
}
