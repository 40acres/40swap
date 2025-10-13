package integration

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// TestLndHelper verifica que el helper de LND funcione correctamente
func TestLndHelper(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()

	// Create a network for the containers
	networkRequest := testcontainers.GenericNetworkRequest{
		NetworkRequest: testcontainers.NetworkRequest{
			Name:       "lnd-test-network",
			Attachable: true,
		},
	}
	network, err := testcontainers.GenericNetwork(ctx, networkRequest)
	require.NoError(t, err)
	defer func() {
		require.NoError(t, network.Remove(ctx))
	}()

	// Set up bitcoind first (LND needs it)
	bitcoindContainer, err := setupBitcoindForLnd(ctx, network)
	require.NoError(t, err)
	defer func() {
		require.NoError(t, testcontainers.TerminateContainer(bitcoindContainer))
	}()

	// Set up LND container
	lndContainer, err := setupLndContainer(ctx, network)
	require.NoError(t, err)
	defer func() {
		require.NoError(t, testcontainers.TerminateContainer(lndContainer))
	}()

	// Wait a bit for LND to fully start
	time.Sleep(10 * time.Second)

	// Create bitcoind helper to mine blocks
	bitcoind, err := NewBitcoind(bitcoindContainer)
	require.NoError(t, err)

	// Mine some blocks to trigger initial blockchain sync
	t.Log("Mining initial blocks to bootstrap the regtest network...")
	err = bitcoind.Mine(10)
	require.NoError(t, err)

	// Test LND helper
	lnd, err := NewLnd(lndContainer)
	require.NoError(t, err)
	defer lnd.Close()

	t.Run("TestLndBasics", func(t *testing.T) {
		// Test getting node info
		info, err := lnd.GetInfo()
		require.NoError(t, err)
		require.NotEmpty(t, info.IdentityPubkey)
		require.Contains(t, info.Alias, "test-lnd")

		t.Logf("LND Node Info:")
		t.Logf("  Pubkey: %s", info.IdentityPubkey)
		t.Logf("  Alias: %s", info.Alias)
		t.Logf("  Version: %s", info.Version)
		t.Logf("  Synced to Chain: %t", info.SyncedToChain)

		// If not synced, mine more blocks and wait
		if !info.SyncedToChain {
			t.Log("LND not synced yet, mining more blocks...")
			err = bitcoind.Mine(5)
			require.NoError(t, err)

			// Wait for sync
			time.Sleep(5 * time.Second)

			// Check again
			info, err = lnd.GetInfo()
			require.NoError(t, err)
			t.Logf("Updated sync status: %t", info.SyncedToChain)
		}

		// Test getting balance
		balance, err := lnd.GetBalance()
		require.NoError(t, err)
		require.NotNil(t, balance)

		t.Logf("Wallet Balance: %d sats", balance.TotalBalance)

		// Test generating a new address
		addr, err := lnd.NewAddress()
		require.NoError(t, err)
		require.NotEmpty(t, addr)
		require.True(t, len(addr) > 20) // Basic sanity check

		t.Logf("Generated address: %s", addr)
	})

	t.Run("TestLndInvoice", func(t *testing.T) {
		// Check sync status first
		info, err := lnd.GetInfo()
		require.NoError(t, err)

		if !info.SyncedToChain {
			t.Skip("LND is not synced to chain, skipping invoice test")
		}

		// Test creating an invoice
		invoice, err := lnd.CreateInvoice(100000) // 100k sats
		require.NoError(t, err)
		require.NotEmpty(t, invoice.PaymentRequest)
		require.NotEmpty(t, invoice.RHash)

		t.Logf("Created invoice:")
		t.Logf("  Payment Request: %s", invoice.PaymentRequest)
		t.Logf("  RHash: %x", invoice.RHash)

		// The invoice should be valid (we won't pay it in this test)
		require.True(t, len(invoice.PaymentRequest) > 50)
	})
}

func setupBitcoindForLnd(ctx context.Context, network testcontainers.Network) (testcontainers.Container, error) {
	req := testcontainers.ContainerRequest{
		Image:        "bitcoin/bitcoin:28",
		ExposedPorts: []string{"18443/tcp", "28334/tcp", "28335/tcp"},
		Name:         "bitcoind",
		Hostname:     "bitcoind",
		Networks:     []string{"lnd-test-network"},
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
			"-zmqpubrawblock=tcp://0.0.0.0:28334",
			"-zmqpubrawtx=tcp://0.0.0.0:28335",
		},
		WaitingFor: wait.ForLog("init message: Done loading").WithStartupTimeout(2 * time.Minute),
	}

	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		return nil, err
	}

	// Give bitcoind a moment to fully start
	time.Sleep(2 * time.Second)

	return container, nil
}

func setupLndContainer(ctx context.Context, network testcontainers.Network) (testcontainers.Container, error) {
	req := testcontainers.ContainerRequest{
		Image:        "lightninglabs/lnd:v0.18.4-beta",
		ExposedPorts: []string{"10009/tcp", "8080/tcp", "9735/tcp"},
		Name:         "lnd",
		Hostname:     "lnd",
		Networks:     []string{"lnd-test-network"},
		Cmd: []string{
			"--noseedbackup",
			"--trickledelay=5000",
			"--alias=test-lnd",
			"--listen=0.0.0.0:9735",
			"--rpclisten=0.0.0.0:10009",
			"--restlisten=0.0.0.0:8080",
			"--bitcoin.active",
			"--bitcoin.regtest",
			"--bitcoin.node=bitcoind",
			"--bitcoind.rpchost=bitcoind:18443", // Use hostname instead of IP
			"--bitcoind.rpcuser=40swap",
			"--bitcoind.rpcpass=pass",
			"--bitcoind.zmqpubrawblock=tcp://bitcoind:28334", // Use hostname instead of IP
			"--bitcoind.zmqpubrawtx=tcp://bitcoind:28335",    // Use hostname instead of IP
			"--maxpendingchannels=20",
		},
		WaitingFor: wait.ForLog("Waiting for chain backend to finish sync").
			WithStartupTimeout(3 * time.Minute),
	}

	return testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
}
