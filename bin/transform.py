#!/usr/bin/env python3

import argparse
import json
import sys
from datetime import datetime
from itertools import count
from pathlib import Path
from typing import Tuple

from scipy.spatial import KDTree
from tqdm import tqdm

canal_id_gen = count()
canal_coord_id_gen = count()
canal_pos_list_cache = {}
link_name_to_link_index = {}
optimized_coord_id_gen = count()
optimized_coord_ids = {}


def get_canal_id(canal: dict) -> str:
    """Create id for canal."""
    if "_id" in canal:
        return canal["_id"]

    name = canal["properties"].get("name") or "node"
    key = next(canal_id_gen)
    id = f"{name}#{key}"
    canal["_id"] = id

    return canal["_id"]


def get_coord_id(coord: Tuple[float, float], canal: dict) -> str:
    if not "_coord_ids" in canal:
        canal["_coord_ids"] = {}

    if (coord in canal["_coord_ids"]):
        return canal["_coord_ids"][coord]

    id = f"{get_canal_id(canal)};{len(canal['_coord_ids'])}"
    canal["_coord_ids"][coord] = id
    return id


def round_coord(coord: Tuple[float, float], decimals: int = 4) -> Tuple[float, float]:
    """Round coordinate tuple to given decimals."""
    return (round(coord[0], decimals), round(coord[1], decimals))


def compile_data(data: dict, distance_tolerance: float) -> dict:
    """Main compilation function"""
    graph = {}

    # Filter dataset to only include features with names
    canals = [f for f in data["features"] if f["properties"].get("name")]

    # Build KDTree to quickly filter nearby points
    all_coords = []
    coord_to_canal = {}

    for canal in canals:
        pos_list = [tuple(coord) for coord in get_canal_pos_list(canal) if coord]
        canal_id = get_canal_id(canal)

        for coord in pos_list:
            all_coords.append(coord)
            if coord not in coord_to_canal:
                coord_to_canal[coord] = []
            coord_to_canal[coord].append((canal, canal_id))

    kdtree = KDTree(all_coords)

    # Loop through canals
    for canal in tqdm(canals, desc="Compiling graph nodes"):
        pos_list = get_canal_pos_list(canal)
        properties = canal["properties"]
        oneway = bool(properties.get("oneway"))

        for i, current_coord in enumerate(pos_list):
            node_id = get_coord_id(tuple(current_coord), canal)

            previous_coord = pos_list[i - 1]
            previous_node_id = get_coord_id(tuple(previous_coord), canal) if previous_coord else None

            next_coord = pos_list[i + 1] if i + 1 < len(pos_list) else None
            next_node_id = get_coord_id(tuple(next_coord), canal) if next_coord else None

            neighbors: list[str] = []

            # Only add next coordinate as neighbor if next coordinate exists.
            if next_coord:
                neighbors.append(next_node_id)

            # Only add previous coordinates as neighbor if not one way traffic.
            if i and not oneway and previous_node_id not in neighbors:
                neighbors.append(previous_node_id)

            # Add connected canals using KDTree
            nearby_indices = kdtree.query_ball_point(current_coord, distance_tolerance)
            for idx in nearby_indices:
                other_coord = all_coords[idx]
                for other_canal, other_canal_id in coord_to_canal[other_coord]:
                    other_node_id = get_coord_id(other_coord, other_canal)
                    if node_id == other_node_id or other_node_id in neighbors:
                        continue
                    neighbors.append(
                        get_coord_id(other_coord, other_canal)
                    )

            # Build graph node
            graph[node_id] = {"coords": round_coord(current_coord), "neighbors": neighbors}

    # Build a mapping of link names to indices
    for canal in canals:
        name = canal["properties"].get("name")
        if name in link_name_to_link_index:
            continue

        link_name_to_link_index[name] = len(link_name_to_link_index)

    # Optimize node to a very dense format, to be restored by the frontend.
    optimized_graph = []
    skipped_nodes_count = 0
    for node_id, node in tqdm(graph.items(), desc="Optimizing graph"):
        if not node["neighbors"]:
            skipped_nodes_count+=1
            continue

        pos_str = ",".join([optimize_coordinate(c) for c in node["coords"]])
        optimized_x = ",".join([optimize_node_id(x) for x in node["neighbors"]])
        optimized_node_id = f"{optimize_node_id(node_id)}#{pos_str}:{optimized_x}"
        optimized_node = optimized_node_id

        optimized_graph.append(optimized_node)

    return {
        "graph": ";".join(optimized_graph),
        "links": "#".join(list(link_name_to_link_index.keys()))
    }


def optimize_node_id(node_id: str) -> str:
    """Replaces the name of a canal with it's index in node_id."""
    [link_name, coord] = node_id.split("#")
    link_index = link_name_to_link_index[link_name]
    optimized_coord_id: str

    if coord in optimized_coord_ids:
        optimized_coord_id = optimized_coord_ids[coord]
    else:
        optimized_coord_id = next(optimized_coord_id_gen)
        optimized_coord_ids[coord] = optimized_coord_id

    return f"{link_index}#{optimized_coord_id}"


def optimize_coordinate(coord: float, decimals: int = 5) -> str:
    scale = 10 ** decimals
    num = int(round(coord * scale))  # scale to preserve decimal places
    return to_base62(num)  # Seems to have the best efficient/simplicity balance


def to_base62(num: int) -> str:
    base62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

    if num == 0:
        return "0"
    neg = num < 0
    num = abs(num)
    result = ""
    while num:
        num, r = divmod(num, 62)
        result = base62[r] + result
    return "-" + result if neg else result


def get_canal_pos_list(canal: dict) -> list[Tuple[float, float]]:
    """Returns a flat list of coordinates related to a canal."""
    id = get_canal_id(canal)
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


def main():
    args = parse_args()

    input_file = Path(args.input)
    graph_file = Path(args.graph_output)

    data = load_data(input_file)
    graph = compile_data(data, args.dist_tolerance)
    save_output(graph, graph_file)

    sys.stdout.write(f"Graph saved to {graph_file}")


def save_output(graph: dict, graph_file: Path) -> None:
    """Save graph and links to JSON files."""
    graph_output = {
        "name": str(graph_file),
        "createdAt": datetime.utcnow().isoformat(),
        "schemaVersion": 1.0,
        **graph,
    }

    try:
        with graph_file.open("w") as f:
            json.dump(graph_output, f, indent=2)
    except Exception as e:
        sys.stderr.write(f"Error writing output files: {e}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
