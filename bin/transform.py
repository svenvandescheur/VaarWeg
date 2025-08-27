#!/usr/bin/env python3

import argparse
import hashlib
import json
import math
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple

from tqdm import tqdm


def distance(c1: Tuple[float, float], c2: Tuple[float, float]) -> float:
    """Euclidean distance between two coordinates."""
    return math.hypot(c1[0] - c2[0], c1[1] - c2[1])


def canal_to_id(canal: dict) -> str:
    """Create id for canal."""
    name = canal["properties"].get("name") or "node"
    key = stable_hash(canal)
    return f"{name}#{key}"


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

    # Filter dataset to only includes features with names.
    # These values should be safe to work with but may be not strictly be limited to canals.
    # Other types may be bridges or locks.
    canals = [f for f in data["features"] if f["properties"].get("name")]

    # Loop through every canal.
    for canal in tqdm(canals):
        pos_list: list[Tuple[float, float]] = get_canal_pos_list(canal)
        properties: dict = canal["properties"]
        canal_name: str = properties["name"]
        canal_id: str = canal_to_id(canal)
        oneway: bool = bool(properties.get("oneway"))

        # Every coordinate becomes a node in the graph.
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

            # Add connected canals.
            for other_canal in canals:
                if other_canal == canal:
                    continue

                for other_canal_coord in get_canal_pos_list(other_canal):
                    if distance(current_coord, other_canal_coord) < distance_tolerance:
                        neighbors.append(
                            [
                                canal_to_id(other_canal),
                                coord_to_id(other_canal_coord, other_canal),
                            ]
                        )

            # Build graph node.
            id = coord_to_id(current_coord, canal)
            graph[id] = {"name": id, "pos": current_coord, "neighbors": neighbors}

            # Build Link node.
            links[canal_id] = {
                "name": canal_name,
                "posList": pos_list,
                "feature": canal,
            }

            if not locators.get(canal_name):
                locators[canal_name] = {
                    "name": canal_name,
                    "value": id,
                }

    return graph, links, list(locators.values())


def get_canal_pos_list(canal: dict) -> list[Tuple[float, float]]:
    """Returns a flat list of coordinates related to a canal."""
    geometry: dict = canal["geometry"]

    # Built a list of (long, lat) coordinates, normalize, geometry.
    geometry_type: str = geometry["type"]
    coordinates: list[[float, float]]

    if geometry_type == "Point":
        return [geometry["coordinates"]]
    elif geometry_type == "MultiPolygon":
        return [
            pair
            for polygon in geometry["coordinates"]
            for ring in polygon
            for pair in ring
        ]
    elif geometry_type == "Polygon":
        return [pair for ring in geometry["coordinates"] for pair in ring]
    else:
        return geometry["coordinates"]


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
