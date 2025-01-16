
[working-directory: 'cmd']
build:
    go build .
test:
    go test ./...
[working-directory: 'cmd']
run *cmd:
    go run . {{cmd}}
