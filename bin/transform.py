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


def canal_to_id(canal: dict) -> str:
    """Create id for canal."""
    if "_id" in canal:
        return canal["_id"]

    name = canal["properties"].get("name") or "node"
    key = next(canal_id_gen)
    id = f"{name}#{key}"
    canal["_id"] = id

    return canal["_id"]


def coord_to_id(coord: Tuple[float, float], canal: dict | None) -> str:
    """Create id for coordinate in canal."""
    rounded_coord = round_coord(coord)
    if canal:
        return f"{canal_to_id(canal)};{rounded_coord[0]},{rounded_coord[1]}"
    return f"{rounded_coord[0]},{rounded_coord[1]}"


def round_coord(coord: Tuple[float, float], decimals: int = 5) -> Tuple[float, float]:
    """Round coordinate tuple to given decimals."""
    return [round(coord[0], decimals), round(coord[1], decimals)]


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
    graph = {}

    # Filter dataset to only include features with names
    canals = [f for f in data["features"] if f["properties"].get("name")]

    # Build KDTree to quickly filter nearby points
    all_coords = []
    coord_to_canal = {}

    for canal in canals:
        pos_list = [tuple(coord) for coord in get_canal_pos_list(canal) if coord]
        canal_id = canal_to_id(canal)

        for coord in pos_list:
            all_coords.append(coord)
            if coord not in coord_to_canal:
                coord_to_canal[coord] = []
            coord_to_canal[coord].append((canal, canal_id))

    kdtree = KDTree(all_coords)

    # Loop through canals
    for canal in tqdm(canals):
        canal_id = canal_to_id(canal)
        pos_list = get_canal_pos_list(canal)
        properties = canal["properties"]
        oneway = bool(properties.get("oneway"))

        for i, current_coord in enumerate(pos_list):
            previous_coord = pos_list[i - 1]
            next_coord = pos_list[i + 1] if i + 1 < len(pos_list) else None

            neighbors: list[str] = []

            # Only add next coordinate as neighbor if next coordinate exists.
            if next_coord:
                neighbors.append(coord_to_id(next_coord, None))  # Optimization: same canal neighbors more compact.

            # Only add previous coordinates as neighbor if not one way traffic.
            if not oneway:  # FIXME: improve
                neighbors.append(coord_to_id(previous_coord, None))  # Optimization: same canal neighbors more compact.

            # Add connected canals using KDTree
            nearby_indices = kdtree.query_ball_point(current_coord, distance_tolerance)
            for idx in nearby_indices:
                other_coord = all_coords[idx]
                for other_canal, other_canal_id in coord_to_canal[other_coord]:
                    if other_canal == canal and other_coord == current_coord:
                        continue
                    neighbors.append(
                        coord_to_id(other_coord, other_canal)
                    )

            # Build graph node
            node_id = coord_to_id(current_coord, canal)
            # Optimization: key removed from node.
            # Optimization: Optimization: coordinates removed from node.
            graph[node_id] = {"x": neighbors}

    return graph


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
    graph_output = {
        "name": str(graph_file),
        "createdAt": datetime.utcnow().isoformat(),
        "schemaVersion": 1.0,
        "graph": graph,
    }

    try:
        with graph_file.open("w") as f:
            json.dump(graph_output, f, indent=2)
    except Exception as e:
        sys.stderr.write(f"Error writing output files: {e}\n")
        sys.exit(1)


def main():
    args = parse_args()

    input_file = Path(args.input)
    graph_file = Path(args.graph_output)

    data = load_data(input_file)
    graph = compile_data(data, args.dist_tolerance)
    save_output(graph, graph_file)

    print(f"Graph saved to {graph_file}")


if __name__ == "__main__":
    main()
