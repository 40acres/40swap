package integration

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// TestBitcoindHelper verifica que el helper de bitcoind funcione correctamente
func TestBitcoindHelper(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()

	// Set up bitcoind container
	bitcoindContainer, err := setupBitcoindContainer(ctx)
	require.NoError(t, err)
	defer func() {
		require.NoError(t, testcontainers.TerminateContainer(bitcoindContainer))
	}()

	// Test Bitcoind helper
	bitcoind, err := NewBitcoind(bitcoindContainer)
	require.NoError(t, err)

	t.Run("TestBitcoindBasics", func(t *testing.T) {
		// Test mining
		err := bitcoind.Mine(1)
		require.NoError(t, err)

		// Test getting block height
		height, err := bitcoind.GetBlockHeight()
		require.NoError(t, err)
		require.Greater(t, height, 0)

		// Test generating address
		addr, err := bitcoind.GetNewAddress()
		require.NoError(t, err)
		require.NotEmpty(t, addr)
		require.True(t, len(addr) > 20) // Basic sanity check

		t.Logf("Generated address: %s", addr)
		t.Logf("Block height: %d", height)
	})
}

func setupBitcoindContainer(ctx context.Context) (testcontainers.Container, error) {
	req := testcontainers.ContainerRequest{
		Image:        "bitcoin/bitcoin:28",
		ExposedPorts: []string{"18443/tcp"},
		Cmd: []string{
			"-printtoconsole",
			"-regtest=1",
			"-rpcbind=0.0.0.0",
			"-rpcport=18443",
			"-rpcallowip=0.0.0.0/0",
			"-rpcuser=40swap",
			"-rpcpassword=pass",
			"-whitelist=0.0.0.0/0",
			"-txindex=1",
			"-server=1",
		},
		WaitingFor: wait.ForLog("init message: Done loading").WithStartupTimeout(2 * time.Minute),
	}

	return testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
}
