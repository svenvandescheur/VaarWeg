#!/usr/bin/env python3

import argparse
import json
import sys
from datetime import datetime
from itertools import count
from pathlib import Path
from typing import Tuple, TypedDict

from scipy.spatial import KDTree
from tqdm import tqdm

canal_id_gen = count()


class GraphNode(TypedDict):
    """
    Graph node in an (unoptimized) GraphDocument
    """
    link: str
    position: tuple[float, float]
    neighbors: list[int]


GraphNodeDict = dict[str, GraphNode]


class GraphDocument(TypedDict):
    """
    Graph document without optimization.
    """
    name: str
    createdAt: str
    schemaVersion: float
    graph: GraphNodeDict


class OptimizedGraphDocument(TypedDict):
    """
    Graph document with optimization.
    """

    name: str
    createdAt: str
    schemaVersion: float
    graph: str
    links: list[str]


def canal_to_id(canal: dict) -> str:
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
    key = f"{canal_to_id(canal)};{rounded_coord[0]},{rounded_coord[1]}"

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
    return json.load(f)


def compile_data(data: dict, distance_tolerance: float) -> dict:
    """
    Build graph nodes from input features. Uses rounded coordinates for KDTree and id mapping
    to ensure consistent matching between KDTree neighbors and coord_to_id keys.
    """
    graph_node_dict: dict = {}

    # Filter dataset to only include features with names
    canals = [f for f in data["features"] if f.get("properties", {}).get("name")]

    # Build KDTree to quickly filter nearby points
    all_coords: list[Tuple[float, float]] = []
    coord_to_canal: dict[Tuple[float, float], list[Tuple[dict, str]]] = {}

    for canal in canals:
        pos_list = get_canal_pos_list(canal)
        canal_id = canal_to_id(canal)

        for coord in pos_list:
            if not coord:
                continue
            rounded = round_coord(coord)
            all_coords.append(rounded)
            coord_to_canal.setdefault(rounded, []).append((canal, canal_id))

    if not all_coords:
        return graph_node_dict

    kdtree = KDTree(all_coords)

    # Loop through canals and build nodes
    for canal in tqdm(canals):
        pos_list = get_canal_pos_list(canal)
        properties = canal.get("properties", {}) or {}
        oneway = bool(properties.get("oneway"))

        for i, current_coord in enumerate(pos_list):
            if not current_coord:
                continue

            # previous_coord is None at start (avoid pos_list[-1] bug)
            previous_coord = pos_list[i - 1] if i > 0 else None
            next_coord = pos_list[i + 1] if i + 1 < len(pos_list) else None

            neighbors: set[int] = set()

            # Only add next coordinate as neighbor if next coordinate exists.
            if next_coord:
                neighbors.add(coord_to_id(next_coord, canal))

            # Only add previous coordinate as neighbor if not oneway and previous exists.
            if not oneway and previous_coord:
                neighbors.add(coord_to_id(previous_coord, canal))

            # Use rounded current_coord for KDTree lookup and mapping
            rounded_current = round_coord(current_coord)
            nearby_indices = kdtree.query_ball_point(rounded_current, distance_tolerance)
            for idx in nearby_indices:
                other_coord = all_coords[idx]
                for other_canal, other_canal_id in coord_to_canal.get(other_coord, []):
                    # skip exact same (canal + coordinate)
                    if other_canal is canal and other_coord == rounded_current:
                        continue
                    # Note: use the original other_canal object when generating ids
                    # but pass a coordinate that matches coord_to_id rounding expectations
                    neighbors.add(coord_to_id(other_coord, other_canal))

            # Build graph node
            node_id = coord_to_id(current_coord, canal)
            graph_node_dict[node_id] = GraphNode(
                link=canal.get("properties", {}).get("name"),
                position=round_coord(current_coord),
                neighbors=list(neighbors),
            )

    return graph_node_dict


canal_pos_list_cache = {}


def get_canal_pos_list(canal: dict) -> list[Tuple[float, float]]:
    """Returns a flat list of coordinates related to a canal."""
    id = canal_to_id(canal)
    if id in canal_pos_list_cache:
        return canal_pos_list_cache[id]

    result: list
    geometry: dict = canal["geometry"]

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
    graph = compile_data(data, args.dist_tolerance)

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
