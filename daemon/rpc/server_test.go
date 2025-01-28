package rpc

import (
	"testing"
)

func TestNewRPCServer(test *testing.T) {
	server := NewRPCServer()
	if server == nil {
		test.Fatalf("Expected non-nil server")
	}
}

func TestListenAndServe(test *testing.T) {
	port := "50051"
	server := NewRPCServer()
	errChan := make(chan error)
	go func() {
		errChan <- server.ListenAndServe(port)
	}()
	select {
	case err := <-errChan:
		if err != nil {
			test.Fatalf("couldn't start server: %v", err)
		}
	default:
		// Server started successfully
	}
}
