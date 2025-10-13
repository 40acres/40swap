package integration

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

const (
	testTimeout = 10 * time.Minute
)

func TestDaemonIntegration(t *testing.T) {
	// Skip integration tests in short mode
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()

	// Set up basic bitcoind container for now
	bitcoindContainer, err := setupBitcoind(ctx)
	require.NoError(t, err)
	defer func() {
		require.NoError(t, testcontainers.TerminateContainer(bitcoindContainer))
	}()

	// Set up helper clients
	bitcoind, err := NewBitcoind(bitcoindContainer)
	require.NoError(t, err)

	t.Run("TestBitcoindBasic", func(t *testing.T) {
		testBitcoindBasic(t, bitcoind)
	})
}

func setupBitcoind(ctx context.Context) (testcontainers.Container, error) {
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
		WaitingFor: wait.ForLog("init message: Done loading"),
	}

	return testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
}

func testBitcoindBasic(t *testing.T, bitcoind *Bitcoind) {
	t.Log("Testing basic bitcoind functionality...")

	// Test mining
	err := bitcoind.Mine(1)
	require.NoError(t, err)
	t.Log("Successfully mined 1 block")

	// Test getting block height
	height, err := bitcoind.GetBlockHeight()
	require.NoError(t, err)
	require.Greater(t, height, 0)
	t.Logf("Current block height: %d", height)

	// Test generating address
	addr, err := bitcoind.GetNewAddress()
	require.NoError(t, err)
	require.NotEmpty(t, addr)
	require.True(t, len(addr) > 20) // Basic sanity check
	t.Logf("Generated address: %s", addr)

	// Test mining more blocks
	err = bitcoind.Mine(10)
	require.NoError(t, err)

	// Verify height increased
	newHeight, err := bitcoind.GetBlockHeight()
	require.NoError(t, err)
	require.Equal(t, height+10, newHeight)
	t.Logf("New block height after mining 10 blocks: %d", newHeight)
}
