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
    go tool air -- start -regtest -db-keep-alive -db-host localhost -server-url=http://localhost:7081 -tls-cert=./tls.cert -macaroon=./admin.macaroon -lnd-host=localhost:10001

# Lint the project
lint:
    golangci-lint run

rehash:
    atlas migrate hash --dir "file://database/migrations"

copy-lnd-data:
    docker cp 40swap_lnd_user:/root/.lnd/tls.cert .
    docker cp 40swap_lnd_user:/root/.lnd/data/chain/bitcoin/regtest/admin.macaroon .