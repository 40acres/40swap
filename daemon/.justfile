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
[working-directory: 'cmd']
run *cmd:
    go run . {{cmd}}

# Lint the project
lint:
    golangci-lint run

# Add migrations
add-migration:
   atlas migrate diff --env gorm

# Apply migrations
apply-migrations:
   atlas migrate apply --env gorm

# Show migrations status
db-status:
    atlas migrate status --env gorm