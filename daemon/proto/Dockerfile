# This Dockerfile produces an image that runs the protocol compiler
# to generate Go declarations for messages and gRPC interfaces.
#
# For build reproducibility, it is explicit about the versions of its
# dependencies, which include:
# - the golang base docker image (linux, go, git),
# - protoc,
# - Go packages (protoc-gen-go and protoc-gen-go-grpc),
# - apt packages (unzip).

FROM golang:1.21.0

WORKDIR /work

ENV PROTOC_VERSION=24.3
ENV PROTOC_GEN_GO_VERSION=1.31.0
ENV PROTOC_GEN_GO_GRPC_VERSION=1.3.0

RUN apt-get update && \
    apt-get install -y unzip && \
    curl --location --silent -o protoc.zip https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/protoc-${PROTOC_VERSION}-linux-x86_64.zip && \
    unzip protoc.zip -d /usr/local/ && \
    rm -fr protoc.zip

RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v${PROTOC_GEN_GO_VERSION} && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v${PROTOC_GEN_GO_GRPC_VERSION}

ENTRYPOINT ["protoc"]