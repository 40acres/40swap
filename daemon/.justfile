set fallback := true

# List all the recipes
help:
    @just -l

# Install all the dependencies from the root folder
tidy:
    go mod tidy

# Build the project
[working-directory: 'cmd']
build: tidy
    go build .

# Generate the project
generate:
    go generate ./...

# Test the project
test:
    go test ./...

run *cmd:
    go run ./cmd/main.go {{cmd}}

run-daemon: copy-lnd-data
    @lndconnect=$(just generate-lndconnect); \
    go tool air -- start -regtest -db-keep-alive -db-host localhost -server-url=http://localhost:7081 -lndconnect "$lndconnect" -mempool-endpoint "http://localhost:7084/api" -mempool-token "test"

# Lint the project
lint:
    golangci-lint run

rehash:
    atlas migrate hash --dir "file://database/migrations"

copy-lnd-data:
    docker cp 40swap_lnd_user:/root/.lnd/tls.cert .
    docker cp 40swap_lnd_user:/root/.lnd/data/chain/bitcoin/regtest/admin.macaroon .

extract-cert-base64 cert_data:
    #!/usr/bin/env node
    parts = `{{cert_data}}`.trim("\n").split("\n")
    parts.shift()
    parts.pop()
    cert_base64 = parts.join("")
    console.log(cert_base64)

generate-lndconnect:
    #!/bin/sh
    lnd_cert=$(docker exec -it 40swap_lnd_user cat /root/.lnd/tls.cert)
    lnd_cert_middle=$(just extract-cert-base64 "$lnd_cert")

    lnd_cert_safe=$(just to-url-safe "$lnd_cert_middle")
    lnd_macaroon=$(docker exec -it 40swap_lnd_user base64 -w0 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon)
    lnd_macaroon_safe=$(just to-url-safe "$lnd_macaroon")
    echo "lndconnect://localhost:10001?cert=$lnd_cert_safe\&macaroon=$lnd_macaroon_safe"

to-url-safe input:
    @echo "{{input}}" | sed 's/+/-/g; s/\//_/g; s/=//g'