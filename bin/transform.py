#!/usr/bin/env python3

import argparse
import json
import sys
from datetime import datetime
from itertools import count
from pathlib import Path
from typing import Tuple, TypedDict, Any, Literal, Union, List, TypeAlias, Optional

from scipy.spatial import KDTree
from tqdm import tqdm

canal_id_gen = count()

GeoJSONWaterway = Literal[
    "access_point",
    "artificial",
    "barrier",
    "basin",
    "baywatch",
    "biwak",
    "blocked",
    "boat_lift",
    "boatyard",
    "boom",
    "buoy",
    "canal",
    "construction",
    "coupure",
    "customs",
    "dam",
    "dept_line",
    "depth",
    "derelict_canal",
    "ditch",
    "dock",
    "drain",
    "drainage_channel",
    "drawbridge",
    "fairway",
    "fender",
    "fish_pass",
    "floating_barrier",
    "flow_control",
    "flowline",
    "fuel",
    "gate",
    "jetty",
    "link",
    "lock_NHW",
    "lock_gate",
    "milestone",
    "moat",
    "pressurised",
    "proposed",
    "pump",
    "pumping_station",
    "river",
    "safe_water",
    "sanitary_dump_station",
    "security_lock",
    "sluice_gate",
    "stream",
    "stream_end",
    "swale",
    "tidal_channel",
    "tunnel",
    "turning_point",
    "valve",
    "vertical_slope",
    "virtual",
    "visitor_berth",
    "wadi",
    "water_point",
    "waterfall",
    "weir",
    "yes",
]

UNSUPPORTED_WATERWAYS: List[GeoJSONWaterway] = [
    "access_point",
    "artificial",
    "barrier",
    "baywatch",
    "biwak",
    "blocked",
    "boom",
    "buoy",
    "construction",
    "customs",
    "dept_line",
    "depth",
    "drawbridge",
    "fender",
    "fish_pass",
    "floating_barrier",
    "flow_control",
    "flowline",
    "fuel",
    "gate",
    "link",
    "milestone",
    "pressurised",
    "proposed",
    "pump",
    "pumping_station",
    "safe_water",
    "sanitary_dump_station",
    "security_lock",
    "stream_end",
    "turning_point",
    "valve",
    "vertical_slope",
    "virtual",
    "visitor_berth",
    "water_point",
]


class GeoJSONProperties(TypedDict, total=False):
    waterway: Optional[GeoJSONWaterway]


GeoJSONCoordinate: TypeAlias = Tuple[str, str]

#    [
#        [4.8412926,52.3756264],
#        [4.842443,52.3754473]
#    ]
GeoJSONCoordinateCollection: TypeAlias = List[GeoJSONCoordinate]

#    [
#        [
#            [
#                [4.9529876,52.366774],
#                [4.9529911,52.366633],
#                [4.9530013,52.3666331],
#                [4.9530003,52.3667741],
#                [4.9529876,52.366774]
#            ]
#        ]
#    ]
GeoJSONMultiCoordinateCollection: TypeAlias = List[GeoJSONCoordinateCollection]


class GeoJSONGeometry(TypedDict):
    """
    {
        "geometry": {
        "type":"LineString",
        "coordinates":
        [
            [4.8412926,52.3756264],
            [4.842443,52.3754473]
        ]
    },
    """
    type: Literal["LineString", "MultiPolygon"] | str
    coordinates: GeoJSONCoordinateCollection | GeoJSONMultiCoordinateCollection


class GeoJSONFeature(TypedDict):
    """
    {
        "type":"Feature",
        "geometry": {
            "type":"LineString",
            "coordinates":
            [
                [4.8412926,52.3756264],
                [4.842443,52.3754473]
            ]
        },
        "properties": {
            "boat":"yes",
            "name": "Erasmusgracht",
            "waterway": "canal"
        }
    },
    """
    type: str
    geometry: GeoJSONGeometry
    properties: GeoJSONProperties


class GeoJSONFeatureCollection(TypedDict):
    """
    {
        "type": "FeatureCollection",
        "features":[]
    }
    """
    type: str
    features: List[GeoJSONFeature]


#   {
#       [4.8412926,52.3756264]: [
#           {...},  (feature)
#           Erasmusgracht#1,  (id)
#       ]
#   }
CoordinateIndex: TypeAlias = dict[
    GeoJSONCoordinate,
    list[tuple["GeoJSONFeature", str]]
]


class GraphNode(TypedDict):
    """
    Graph node in an (unoptimized) GraphDocument
    """
    id: str
    link: str  # name
    position: GeoJSONCoordinate
    neighbors: list[int]  # id's


Graph = dict[str, GraphNode]


class GraphDocument(TypedDict):
    """
    Graph document without optimization.
    """
    name: str
    createdAt: str
    schemaVersion: float
    graph: Graph


class OptimizedGraphDocument(TypedDict):
    """
    Graph document with optimization.
    """

    name: str
    createdAt: str
    schemaVersion: float
    graph: str
    links: list[str]


def feature_to_id(canal: dict) -> str:
    """Create id for canal."""
    if "_id" in canal:
        return canal["_id"]

    name = canal["properties"].get("name") or "node"
    key = next(canal_id_gen)
    id = f"{name}#{key}"
    canal["_id"] = id

    return canal["_id"]


coord_ids = {}


def coord_to_id(coord: Tuple[float, float], canal: dict) -> int:
    """Create id for coordinate in canal."""
    rounded_coord = round_coord(coord)
    key = f"{feature_to_id(canal)};{rounded_coord[0]},{rounded_coord[1]}"

    if not coord_ids.get(key):
        coord_ids[key] = len(coord_ids)
    return coord_ids[key]


def round_coord(coord: Tuple[float, float], decimals: int = 5) -> Tuple[float, float]:
    """
    Round a coordinate tuple to `decimals` decimal places and return as a tuple.
    Returning a tuple ensures stable, hashable keys for dictionaries.
    """
    return (round(coord[0], decimals), round(coord[1], decimals))


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Build junction/link graph from canal data."
    )
    parser.add_argument(
        "input",
        type=str,
        help="Input JSON file with canal features",
    )
    parser.add_argument(
        "graph_output",
        type=str,
        nargs="?",
        help="Output JSON file for graph",
        default="graph_nodes.json",
    )
    parser.add_argument(
        "--dist-tolerance",
        type=float,
        default=0.000005,
        help="Distance tolerance for detecting junctions (default: 0.000005)",
    )
    return parser.parse_args()


def load_data(input_file: Path) -> dict:
    """Load canal features from input JSON file."""
    if not input_file.is_file():
        sys.stderr.write(f"Error: Input file '{input_file}' does not exist.\n")
        sys.exit(1)

    f = input_file.open()
    data = json.load(f)
    return data


def feature_collection_to_graph(feature_collection: GeoJSONFeatureCollection, distance_tolerance: float) -> Graph:
    graph: Graph = {}
    features = feature_collection["features"]

    # Loop through canals and build nodes
    print("Building graph nodes...")
    for feature in tqdm(features):
        if not is_supported_feature(feature):
            continue

        graph_nodes = feature_to_graph_nodes(feature_collection, feature, distance_tolerance)
        for graph_node in graph_nodes:
            graph_node_id = graph_node["id"]
            graph[graph_node_id] = graph_node

    return graph


coordinate_index_cache: CoordinateIndex | None = None


def get_coordinate_index(feature_collection: GeoJSONFeatureCollection) -> CoordinateIndex:
    """
    A mapping between a coordinate, one or more tuples with a feature and the feature id.
    """
    global coordinate_index_cache

    if coordinate_index_cache:
        return coordinate_index_cache

    all_coords: GeoJSONCoordinateCollection = []
    coordinate_index: CoordinateIndex = {}
    features = feature_collection["features"]

    for feature in features:
        # Filter dataset to only include features with names
        if not is_supported_feature(feature):
            continue

        pos_list = get_canal_pos_list(feature)
        feature_id = feature_to_id(feature)

        for coord in pos_list:
            if not coord:
                continue

            rounded = round_coord(coord)
            all_coords.append(rounded)
            coordinate_index.setdefault(rounded, []).append((feature, feature_id))

    coordinate_index_cache = coordinate_index
    return coordinate_index


all_coords_cache: List[GeoJSONCoordinate] | None = None


def get_all_coords(coordinate_index: CoordinateIndex) -> List[GeoJSONCoordinate]:
    """
    All coordinates
    """
    global all_coords_cache

    if all_coords_cache:
        return all_coords_cache

    all_coords = list(coordinate_index.keys())
    all_coords_cache = all_coords

    return all_coords


kdtree_cache: KDTree | None = None


def get_kdtree(coordinates: List[GeoJSONCoordinate]) -> KDTree:
    """
    KDTree for allowing to query output of get_all_coords, and use with coordinate_index.
    """
    global kdtree_cache

    if kdtree_cache:
        return kdtree_cache

    kdtree = KDTree(coordinates)

    kdtree_cache = kdtree
    return kdtree


def is_supported_feature(feature: GeoJSONFeature) -> bool:
    """
    Returns whether a feature is supported for mapping.
    """
    properties = feature["properties"]
    waterway_type = properties.get("waterway")
    name = get_feature_name(feature)
    boat = properties.get("boat")

    if waterway_type in UNSUPPORTED_WATERWAYS:
        return False

    if not name:
        return False

    if boat == "no":
        return False

    if not get_canal_pos_list(feature):
        return False

    return True  # Probably


def get_feature_name(feature: GeoJSONFeature) -> str:
    properties = feature["properties"]
    return properties.get("name") or properties.get("alt_name") or properties.get("canal_name") or properties.get(
        "note") or "UNKNOWN"


def feature_to_graph_nodes(feature_collection: GeoJSONFeatureCollection, feature: GeoJSONFeature,
                           distance_tolerance: float) -> List[GraphNode]:
    coordinate_index = get_coordinate_index(feature_collection)
    all_coords = get_all_coords(coordinate_index)
    kdtree = get_kdtree(all_coords)

    pos_list = get_canal_pos_list(feature)
    properties = feature.get("properties", {}) or {}
    oneway = bool(properties.get("oneway"))
    neighbors: set[int] = set()

    graph_nodes: list[GraphNode] = []

    for i, current_coord in enumerate(pos_list):
        if not current_coord:
            continue

        # Use rounded current_coord for KDTree lookup and mapping
        rounded_current = round_coord(current_coord)

        neighbor_pairs = []  # (neighbor_id, squared_distance)
        seen = set()

        def add_pair(coord, canal):
            nid = coord_to_id(coord, canal)
            if nid in seen:
                return
            seen.add(nid)

            dx = coord[0] - rounded_current[0]
            dy = coord[1] - rounded_current[1]
            dist2 = dx * dx + dy * dy

            neighbor_pairs.append((nid, dist2))

        # previous_coord is None at the start (avoid pos_list[-1] bug)
        previous_coord: GeoJSONCoordinate | None = pos_list[i - 1] if i > 0 else None
        next_coord: GeoJSONCoordinate | None = pos_list[i + 1] if i + 1 < len(pos_list) else None

        # Only add the next coordinate as a neighbor if the next coordinate exists.
        if next_coord:
            add_pair(next_coord, feature)

        # Only add previous coordinate as a neighbor if not oneway and previous exists.
        if not oneway and previous_coord:
            add_pair(previous_coord, feature)

        nearby_indices = kdtree.query_ball_point(rounded_current, distance_tolerance)
        for idx in nearby_indices:
            other_coord = all_coords[idx]

            for other_canal, other_canal_id in coordinate_index.get(other_coord, []):
                # skip exact same (canal + coordinate)
                if other_canal is feature and other_coord == rounded_current:
                    continue
                # Note: use the original other_canal object when generating ids
                # but pass a coordinate that matches coord_to_id rounding expectations
                add_pair(other_coord, other_canal)

        # Order
        neighbor_pairs.sort(key=lambda x: x[1])
        ordered_neighbors = [nid for nid, _ in neighbor_pairs]

        # Build graph node
        node_id = coord_to_id(current_coord, feature)
        graph_node = GraphNode(
            id=node_id,
            link=get_feature_name(feature),
            position=rounded_current,
            neighbors=ordered_neighbors,
        )
        graph_nodes.append(graph_node)
    return graph_nodes


canal_pos_list_cache = {}


def get_canal_pos_list(feature: GeoJSONFeature) -> GeoJSONCoordinateCollection:
    """Returns a flat list of coordinates related to a canal."""
    id = feature_to_id(feature)
    if id in canal_pos_list_cache:
        return canal_pos_list_cache[id]

    result: list
    geometry: dict = feature["geometry"]

    # Build a list of (long, lat) coordinates, normalize, geometry.
    geometry_type: str = geometry["type"]
    coordinates: list[[float, float]]

    if geometry_type == "Point":
        result = [geometry["coordinates"]]
    elif geometry_type == "MultiPolygon":
        return [
            pair
            for polygon in geometry["coordinates"]
            for ring in polygon
            for pair in ring
        ]
    elif geometry_type == "Polygon":
        result = [pair for ring in geometry["coordinates"] for pair in ring]
    else:
        result = geometry["coordinates"]

    canal_pos_list_cache[id] = result
    return result


def save_output(graph: dict, graph_file: Path) -> None:
    """Save graph and links to JSON files."""
    try:
        with graph_file.open("w") as f:
            json.dump(graph, f, indent=2)
    except Exception as e:
        sys.stderr.write(f"Error writing output files: {e}\n")
        sys.exit(1)


def optimize_graph(document: GraphDocument) -> OptimizedGraphDocument:
    links = []
    data_strs = []

    print("Optimizing graph...")
    for key in tqdm(document["graph"]):
        node = document["graph"][key]
        link = node["link"]

        if link not in links:
            links.append(link)

        key_str = str(key)
        link_str = str(links.index(link))
        position_str = ",".join(map(str, node["position"]))
        neighbor_str = ",".join(map(str, node["neighbors"]))
        data_str = ";".join([key_str, link_str, position_str, neighbor_str])

        data_strs.append(data_str)
    graph_str = "#".join(data_strs)

    return OptimizedGraphDocument(
        name=document["name"],
        createdAt=document["createdAt"],
        schemaVersion=document["schemaVersion"],
        graph=graph_str,
        links=links,
    )


def main():
    args = parse_args()

    input_file = Path(args.input)
    graph_file = Path(args.graph_output)

    data = load_data(input_file)
    graph = feature_collection_to_graph(data, args.dist_tolerance)

    graph_document: GraphDocument = {
        "name": str(graph_file),
        "createdAt": datetime.utcnow().isoformat(),
        "schemaVersion": 1.0,
        "graph": graph,
    }
    optimize_graph_document: OptimizedGraphDocument = optimize_graph(graph_document)
    save_output(optimize_graph_document, graph_file)

    print(f"Graph saved to {graph_file}")


if __name__ == "__main__":
    main()
