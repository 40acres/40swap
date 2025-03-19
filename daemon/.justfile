# List all the recipes
help:
    @just -l

# Install all the dependencies from the root folder
tidy:
    go mod tidy

[macos]
install-deps:
    #!/usr/bin/env bash
    set -euo pipefail

    echo "Checking dependencies..."
    
    # atlas
    if ! command -v atlas &> /dev/null; then
        curl -sSf https://atlasgo.sh | sh
    fi

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

run-daemon: install-deps
    go tool air -- start -db-keep-alive -server-url=http://localhost:7081

# Lint the project
lint:
    golangci-lint run

# Add migrations
add-migration:
   atlas migrate diff --env gorm

# Apply migrations
apply-migrations *url="postgres://40swap:40swap@localhost:5432/40swap?sslmode=disable":
   atlas migrate apply --env gorm --url {{url}}

# Show migrations status
db-status *url="postgres://40swap:40swap@localhost:5432/40swap?sslmode=disable":
    atlas migrate status --env gorm --url {{url}}

db-clean *url="postgres://40swap:40swap@localhost:5432/40swap?sslmode=disable":
    atlas schema clean --env gorm --url {{url}}