
[working-directory: 'cmd']
tidy:
    go mod tidy
build: tidy
    go build .
test:
    go test ./...
[working-directory: 'cmd']
run *cmd:
    go run . {{cmd}}

lint:
    golangci-lint run