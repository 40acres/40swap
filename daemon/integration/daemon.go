package integration

import (
	"context"
	"crypto/tls"
	"fmt"
	"time"

	"github.com/40acres/40swap/daemon/rpc"
	"github.com/testcontainers/testcontainers-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

// Daemon represents a 40swap daemon instance for integration tests
type Daemon struct {
	container testcontainers.Container
	client    rpc.SwapServiceClient
	conn      *grpc.ClientConn
}

// NewDaemon creates a new Daemon helper from a testcontainers container
func NewDaemon(container testcontainers.Container) (*Daemon, error) {
	ctx := context.Background()

	// Get connection details
	host, err := container.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get container host: %w", err)
	}

	mappedPort, err := container.MappedPort(ctx, "7081")
	if err != nil {
		return nil, fmt.Errorf("failed to get mapped port: %w", err)
	}

	// Create gRPC connection with insecure credentials for testing
	address := fmt.Sprintf("%s:%s", host, mappedPort.Port())
	conn, err := grpc.Dial(address,
		grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{
			InsecureSkipVerify: true,
		})),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create gRPC connection: %w", err)
	}

	client := rpc.NewSwapServiceClient(conn)

	return &Daemon{
		container: container,
		client:    client,
		conn:      conn,
	}, nil
}

// Close closes the gRPC connection
func (d *Daemon) Close() error {
	if d.conn != nil {
		return d.conn.Close()
	}
	return nil
}

// GetClient returns the gRPC client
func (d *Daemon) GetClient() rpc.SwapServiceClient {
	return d.client
}

// WaitForReady waits for the daemon to be ready
func (d *Daemon) WaitForReady() error {
	timeout := time.After(60 * time.Second)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for daemon to be ready")
		case <-ticker.C:
			// Try to make a simple call to check if daemon is ready
			// We'll use GetSwapIn with empty ID - it should return an error but connection should work
			_, err := d.client.GetSwapIn(context.Background(), &rpc.GetSwapInRequest{Id: ""})
			if err != nil && err.Error() != "connection refused" {
				// If we get any error other than connection refused, the daemon is responding
				return nil
			}
		}
	}
}

// SwapOut creates a swap out through the daemon
func (d *Daemon) SwapOut(req *rpc.SwapOutRequest) (*rpc.SwapOutResponse, error) {
	return d.client.SwapOut(context.Background(), req)
}

// SwapIn creates a swap in through the daemon
func (d *Daemon) SwapIn(req *rpc.SwapInRequest) (*rpc.SwapInResponse, error) {
	return d.client.SwapIn(context.Background(), req)
}

// GetSwapOut gets swap out information
func (d *Daemon) GetSwapOut(id string) (*rpc.GetSwapOutResponse, error) {
	return d.client.GetSwapOut(context.Background(), &rpc.GetSwapOutRequest{
		Id: id,
	})
}

// GetSwapIn gets swap in information
func (d *Daemon) GetSwapIn(id string) (*rpc.GetSwapInResponse, error) {
	return d.client.GetSwapIn(context.Background(), &rpc.GetSwapInRequest{
		Id: id,
	})
}
