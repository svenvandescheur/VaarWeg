#!/usr/bin/env python3

import argparse
import gzip
import json
import os
import sys
import time
from pathlib import Path


def get_parser() -> argparse.ArgumentParser:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Compresses JSON file, optionally creating chunks."
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="-",
        help="Input JSON file path or '-' to read from stdin (default: '-')",
    )
    return parser


def load_data(parser: argparse.ArgumentParser) -> str:
    args = parser.parse_args()

    if args.input == "-" and sys.stdin.isatty():
        sys.stdout.write("Error: No input provided via stdin.\n")
        parser.print_help(sys.stderr)
        sys.exit(1)

    try:
        if args.input == "-":
            return json.load(sys.stdin)
        else:
            input_file = Path(args.input)

            if not input_file.is_file():
                sys.stderr.write(f"Error: Input file '{input_file}' does not exist.\n")
                sys.exit(1)

            f = input_file.open()
            return json.load(f)
    except Exception as e:
        sys.stderr.write(f"Failed to parse JSON: {e}\n")
        sys.exit(1)


def save_output(filename: str, data: str | dict | list) -> None:
    try:
        with gzip.open(filename, "wt") as f:
            sys.stdout.write(f"Writing output to file {filename}...\n")

            if not isinstance(data, str):
                json.dump(data, f, separators=(",", ":"))
            else:
                f.write(data)
    except Exception as e:
        sys.stderr.write(f"Error writing output files: {e}\n")
        sys.exit(1)


def main():
    parser = get_parser()
    args = parser.parse_args()
    data = load_data(parser)
    filename = args.input + ".gz" if args.input != "-" else ""
    save_output(filename, data)


if __name__ == "__main__":
    main()
