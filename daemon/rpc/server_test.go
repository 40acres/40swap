package rpc

import (
	"testing"
)

func TestNewRPCServer(test *testing.T) {
	server := NewRPCServer(50051, nil, nil)
	if server == nil {
		test.Fatalf("Expected non-nil server")
	}
}

func TestListenAndServe(test *testing.T) {
	server := NewRPCServer(50051, nil, nil)
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
		// Server started successfully
	}
}
