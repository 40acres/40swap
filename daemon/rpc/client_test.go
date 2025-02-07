package rpc

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/connectivity"
)

func TestNewConnection(test *testing.T) {
	connection := NewConnection("localhost", 50051)
	if connection == nil {
		test.Fatalf("Expected non-nil connection")
	}

	state := connection.GetState()
	require.Equal(test, connectivity.Idle, state)

	connection.Close()
}

func TestClient(test *testing.T) {
	client := NewRPCClient("localhost", 50051)
	if client == nil {
		test.Fatalf("Expected non-nil client")
	}
}

func TestClientInvalidRequest(test *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	port := 50051
	server := NewRPCServer(port)
	errChan := make(chan error)
	go func() {
		errChan <- server.ListenAndServe()
	}()
	select {
	case err := <-errChan:
		if err != nil {
			test.Fatalf("couldn't start server: %v", err)
		}
	default:
		client := NewRPCClient("localhost", port)
		testRequest := &SwapOutRequest{
			Chain:      Chain_BITCOIN,
			AmountSats: 100000000,
		}
		response, err := client.SwapOut(ctx, testRequest)

		if err != nil {
			test.Fatalf("could not swap out: %v", err)
		}
		if response == nil {
			test.Fatalf("Expected non-nil response")
		}
	}
}
