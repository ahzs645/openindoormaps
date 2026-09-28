#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "Usage: run-oda.sh <input_dir> <output_dir> <input_name>" >&2
  exit 1
fi

INPUT_DIR="$1"
OUTPUT_DIR="$2"
INPUT_NAME="$3"

if [ -n "${ODA_FILE_CONVERTER:-}" ] && [ -x "${ODA_FILE_CONVERTER}" ]; then
  ODA_BIN="${ODA_FILE_CONVERTER}"
elif [ -x "/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter" ]; then
  ODA_BIN="/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter"
elif [ -x "/Volumes/ODA ODAFileConverter sample/ODAFileConverter.app/Contents/MacOS/ODAFileConverter" ]; then
  ODA_BIN="/Volumes/ODA ODAFileConverter sample/ODAFileConverter.app/Contents/MacOS/ODAFileConverter"
else
  echo "ODA File Converter not found. Set ODA_FILE_CONVERTER or mount/install the app." >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
"${ODA_BIN}" "${INPUT_DIR}" "${OUTPUT_DIR}" ACAD2018 DXF 0 1 "${INPUT_NAME}"
