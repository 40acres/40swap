
tidy:
    go mod tidy
[working-directory: 'cmd']
build: tidy
    go build .
test:
    go test ./...
[working-directory: 'cmd']
run *cmd:
    go run . {{cmd}}

lint:
    golangci-lint run