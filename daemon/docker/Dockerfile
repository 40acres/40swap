ARG BASE_BUILDER_IMAGE=golang:1.23 # This is the alpine-based image for building, e.g. "golang:1.20.4-alpine"
ARG BASE_RUNNER_IMAGE=alpine:latest # This is the alpine-based image for running, e.g. "alpine:latest"

FROM ${BASE_BUILDER_IMAGE} AS builder
    COPY . /workspace/
    WORKDIR /workspace/cmd

    RUN go build -o 40swap .

FROM ${BASE_RUNNER_IMAGE}
    RUN adduser -D 40swap
    USER 40swap
    WORKDIR /home/ep
    COPY --from=builder /workspace/cmd/40swap /usr/bin/

    ENTRYPOINT 40swap