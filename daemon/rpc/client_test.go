package rpc

import (
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
