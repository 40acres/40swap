FROM golang:1.23-bookworm as builder

ARG COMMIT=v5.0.0

WORKDIR /app
RUN git clone https://github.com/ElementsProject/peerswap.git && cd peerswap && git checkout $COMMIT
RUN cd peerswap && make -j$(nproc) lnd-release

FROM debian:bookworm-slim
COPY --from=builder /go/bin/* /usr/local/bin/
ENTRYPOINT [ "peerswapd" ]