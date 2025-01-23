#!/bin/bash

# Make sure we have the container built.
docker build . -t 40swap-proto-builder

# Set the root directory of the project using git.
ROOT=$(git rev-parse --show-toplevel)

# Ensure the proto directory exists
PROTO_DIR="${ROOT}/daemon/proto"
if [ ! -d "$PROTO_DIR" ]; then
  echo "proto/: warning: directory does not exist."
  exit 1
fi

# Ensure the output directory exists
OUT_DIR="${ROOT}/daemon"
mkdir -p ${OUT_DIR}

# Find all the proto files in the project.
PROTO_FILES=$(find ${PROTO_DIR} -iname "*.proto")

# Run the container with the current user and group, and mount the project.
docker run --rm -v ${ROOT}:${ROOT} -w ${ROOT} -u $(id -u):$(id -g) 40swap-proto-builder \
    -I ${PROTO_DIR}      \
    --go_out=${OUT_DIR}      \
    --go-grpc_out=${OUT_DIR} \
    ${PROTO_FILES}
