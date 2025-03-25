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

# Run command from the cmd directory
run *cmd:
    go run ./cmd {{cmd}}

run-daemon:
    go tool air -- start -db-keep-alive

# Lint the project
lint:
    golangci-lint run
