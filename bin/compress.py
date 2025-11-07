#!/usr/bin/env python3

import argparse
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
    parser.add_argument(
        "chunk_target",
        nargs="?",
        type=str,
        help="Target key to chunk",
        default="",
    )
    parser.add_argument(
        "chunk_limit",
        nargs="?",
        type=int,
        help="Max number of nodes per chunk",
        default=10000,
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


def chunk_data(filename: str, data: dict | list, chunk_target: str, chunk_limit: int
               ) -> tuple[list | dict | None, list[list]]:
    target: list = data if isinstance(data, list) else []

    if isinstance(data, dict) and chunk_target:
        try:
            target = data[chunk_target]
        except KeyError:
            sys.stderr.write(f"Invalid key {chunk_target}.\n")
            sys.exit(1)

    if isinstance(data, list):
        if chunk_target:
            sys.stderr.write("Can't use chunk target for data with type list.\n")
            sys.exit(1)
        target = data

    if len(target) <= chunk_limit:  # Chunking not required.
        return data, []

    if not isinstance(target, list) and not isinstance(target, dict):
        sys.stderr.write(f"Can't use chunk {type(target)}.\n")
        sys.exit(1)

    chunks: list[list] = []
    chunk: list | dict = [] if isinstance(target, list) else {}
    _target = target if isinstance(target, list) else target.items()

    for row in _target:
        if isinstance(target, list):
            chunk.append(row)
        elif isinstance(target, dict):
            chunk[row[0]] = row[1]

        if len(chunk) >= chunk_limit:
            chunks.append(chunk)
            chunk= [] if isinstance(target, list) else {}

    if chunk:  # Add remaining rows
        chunks.append(chunk)

    if not isinstance(data, dict):  # No index to update.
        return None, chunks

    data.pop(chunk_target)
    basename, extension = os.path.splitext(os.path.basename(filename))
    data["chunkTarget"] = chunk_target
    data["chunks"] = [f"{basename}.{i}{extension}" for i, _ in enumerate(chunks)]

    # Check that no data is lost.
    total_target_rows = len(target)
    total_chunk = len(chunks)
    total_chunk_rows = sum(len(c) for c in chunks)

    sys.stdout.write(f"Counted {total_target_rows} rows in {chunk_target}.\n")
    sys.stdout.write(f"Counted {total_chunk_rows} lines in {total_chunk} chunks.\n")

    if total_chunk_rows != total_target_rows:
        sys.stderr.write(
            f"Chunking error: expected {total_target_rows} rows, "
            f"but only got {total_chunk_rows}\n"
        )
        sys.exit(1)

    return data, chunks


def save_output(filename: str, data: str | dict | list) -> None:
    path = Path(filename)

    try:
        with path.open("w") as f:
            sys.stdout.write(f"Writing output to file {filename}...\n")

            if not isinstance(data, str):
                json.dump(data, f)
            else:
                f.write(data)
    except Exception as e:
        sys.stderr.write(f"Error writing output files: {e}\n")
        sys.exit(1)


def main():
    parser = get_parser()
    args = parser.parse_args()
    data = load_data(parser)
    filename = args.input if args.input != "-" else ""
    index, chunks = chunk_data(filename, data, args.chunk_target, args.chunk_limit)

    basename, extension = os.path.splitext(filename)
    if index:
        if args.input != "-":
            input_file = Path(args.input)
            f = input_file.open()
            backup = f"{basename}.bak.{int(time.time())}{extension}"
            save_output(backup, f.read())

        save_output(filename, index)
    for i, chunk in enumerate(chunks):
        name = f"{basename}.{i}{extension}"
        save_output(name, chunk)


if __name__ == "__main__":
    main()
