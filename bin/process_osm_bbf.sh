#!/bin/sh
set -eu

TEMP_PBF=""

cleanup() {
    [ -n "$TEMP_PBF" ] && [ -f "$TEMP_PBF" ] && rm -f "$TEMP_PBF"
}

error_exit() {
    echo "Error: $1" >&2
    cleanup
    exit 1
}

usage() {
    echo "Usage: $0 <input.osm.pbf> [output.geojson|-]" >&2
    exit 1
}

check_dependencies() {
    command -v osmium >/dev/null 2>&1 || error_exit "osmium-tool is not installed or in PATH."
}

convert_waterways() {
    input_pbf="$1"
    output_geojson="${2:--}"

    # Check if output file exists
    if [ "$output_geojson" != "-" ] && [ -f "$output_geojson" ]; then
        error_exit "Output file '$output_geojson' already exists. Aborting to avoid overwrite."
    fi

    TEMP_PBF="$(mktemp).pbf"

    echo "Input OSM PBF     : $input_pbf"
    echo "Temp filtered PBF : $TEMP_PBF"
    echo "Output GeoJSON    : $output_geojson"
    echo

    # Step 1: Filter waterways
    osmium tags-filter "$input_pbf" w/waterway -o "$TEMP_PBF" || error_exit "Failed to filter waterways."

    # Step 2: Export to GeoJSON
    if [ "$output_geojson" = "-" ]; then
        osmium export "$TEMP_PBF" -f geojson || error_exit "Failed to export GeoJSON."
    else
        mkdir -p "$(dirname "$output_geojson")" || error_exit "Failed to create output directory."
        osmium export "$TEMP_PBF" -o "$output_geojson" -f geojson || error_exit "Failed to export GeoJSON."
    fi

    cleanup
    echo "Done."
}

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
    usage
fi

check_dependencies

INPUT_PBF="$(realpath "$1")"
OUTPUT_ARG="${2:--}"

convert_waterways "$INPUT_PBF" "$OUTPUT_ARG"
