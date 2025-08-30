#!/usr/bin/env python3

import argparse
import hashlib
import json
import math
import sys
from datetime import datetime
from itertools import count
from pathlib import Path
from typing import Tuple

from scipy.spatial import KDTree
from tqdm import tqdm

def distance(c1: Tuple[float, float], c2: Tuple[float, float]) -> float:
    """Euclidean distance between two coordinates."""
    return math.hypot(c1[0] - c2[0], c1[1] - c2[1])


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


def coord_to_id(coord: Tuple[float, float], canal: dict) -> str:
    """Create id for coordinate in canal."""
    return f"{canal_to_id(canal)};{coord[0]},{coord[1]}"


def stable_hash(obj, length=7) -> str:
    data = json.dumps(obj, sort_keys=True).encode("utf-8")
    return hashlib.sha256(data).hexdigest()[:length]


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
        "links_output",
        nargs="?",
        type=str,
        help="Output JSON file for links",
        default="graph_links.json",
    )
    parser.add_argument(
        "locators_output",
        nargs="?",
        type=str,
        help="Output JSON file for locators",
        default="graph_locators.json",
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


def compile_data(data: dict, distance_tolerance: float) -> tuple[dict, dict, list]:
    graph = {}
    links = {}
    locators = {}

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
        canal_name = properties["name"]
        oneway = bool(properties.get("oneway"))

        for i, current_coord in enumerate(pos_list):
            previous_coord = pos_list[i - 1]
            next_coord = pos_list[i + 1] if i + 1 < len(pos_list) else None

            neighbors: list[[str, str]] = []

            # Only add next coordinate as neighbor if next coordinate exists.
            if next_coord:
                neighbors.append([canal_id, coord_to_id(next_coord, canal)])

            # Only add previous coordinates as neighbor if not one way traffic.
            if not oneway:  # FIXME: improve
                neighbors.append([canal_id, coord_to_id(previous_coord, canal)])

            # Add connected canals using KDTree
            nearby_indices = kdtree.query_ball_point(current_coord, distance_tolerance)
            for idx in nearby_indices:
                other_coord = all_coords[idx]
                for other_canal, other_canal_id in coord_to_canal[other_coord]:
                    if other_canal == canal and other_coord == current_coord:
                        continue
                    neighbors.append(
                        [other_canal_id, coord_to_id(other_coord, other_canal)]
                    )

            # Build graph node
            node_id = coord_to_id(current_coord, canal)
            graph[node_id] = {"name": node_id, "pos": current_coord, "neighbors": neighbors}

            # Build link node
            links[canal_id] = {"name": canal_name, "posList": pos_list, "feature": canal}

            if canal_name not in locators:
                locators[canal_name] = {"name": canal_name, "value": node_id}

    return graph, links, list(locators.values())


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


def save_output(graph: dict, links: dict, locators: list, graph_file: Path, links_file: Path,
                locators_file: Path) -> None:
    """Save graph and links to JSON files."""
    graph_output = {
        "name": str(graph_file),
        "createdAt": datetime.utcnow().isoformat(),
        "schemaVersion": 1.0,
        "graph": graph,
    }
    links_output = {
        "name": str(links_file),
        "createdAt": datetime.utcnow().isoformat(),
        "schemaVersion": 1.0,
        "tree": links,
    }
    locators_output = {
        "name": str(locators_file),
        "createdAt": datetime.utcnow().isoformat(),
        "schemaVersion": 1.0,
        "locators": locators,
    }

    try:
        with graph_file.open("w") as f:
            json.dump(graph_output, f, indent=2)
        with links_file.open("w") as f:
            json.dump(links_output, f, indent=2)
        with locators_file.open("w") as f:
            json.dump(locators_output, f, indent=2)
    except Exception as e:
        sys.stderr.write(f"Error writing output files: {e}\n")
        sys.exit(1)


def main():
    args = parse_args()

    input_file = Path(args.input)
    graph_file = Path(args.graph_output)
    links_file = Path(args.links_output)
    locators_file = Path(args.locators_output)

    data = load_data(input_file)
    graph, links, locators = compile_data(data, args.dist_tolerance)
    save_output(graph, links, locators, graph_file, links_file, locators_file)

    print(f"Graph saved to {graph_file}")
    print(f"Links saved to {links_file}")


if __name__ == "__main__":
    main()