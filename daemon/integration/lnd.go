package integration

import (
	"context"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"time"

	"github.com/lightningnetwork/lnd/lnrpc"
	"github.com/testcontainers/testcontainers-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"gopkg.in/macaroon.v2"
)

// Lnd represents an LND instance for integration tests
type Lnd struct {
	container testcontainers.Container
	client    lnrpc.LightningClient
	conn      *grpc.ClientConn
	pubkey    string
	address   string
}

// NewLnd creates a new Lnd helper from a testcontainers container
func NewLnd(container testcontainers.Container) (*Lnd, error) {
	ctx := context.Background()

	// Get connection details
	host, err := container.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get container host: %w", err)
	}

	mappedPort, err := container.MappedPort(ctx, "10009")
	if err != nil {
		return nil, fmt.Errorf("failed to get mapped port: %w", err)
	}

	// Read macaroon
	macaroonReader, err := container.CopyFileFromContainer(ctx, "/root/.lnd/data/chain/bitcoin/regtest/admin.macaroon")
	if err != nil {
		return nil, fmt.Errorf("failed to read macaroon: %w", err)
	}
	defer macaroonReader.Close()

	macaroonBytes, err := io.ReadAll(macaroonReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read macaroon data: %w", err)
	}

	// Parse macaroon
	mac := &macaroon.Macaroon{}
	if err := mac.UnmarshalBinary(macaroonBytes); err != nil {
		return nil, fmt.Errorf("failed to unmarshal macaroon: %w", err)
	}

	// Create TLS config that accepts any certificate (for testing)
	tlsConfig := &tls.Config{
		InsecureSkipVerify: true, // For regtest testing
	}

	// Create gRPC connection
	address := fmt.Sprintf("%s:%s", host, mappedPort.Port())
	conn, err := grpc.Dial(address,
		grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)),
		grpc.WithPerRPCCredentials(newMacaroonCredential(mac)),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create gRPC connection: %w", err)
	}

	client := lnrpc.NewLightningClient(conn)

	// Get node info
	info, err := client.GetInfo(ctx, &lnrpc.GetInfoRequest{})
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to get node info: %w", err)
	}

	// Get a new address
	addrResp, err := client.NewAddress(ctx, &lnrpc.NewAddressRequest{
		Type: lnrpc.AddressType_WITNESS_PUBKEY_HASH,
	})
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to get new address: %w", err)
	}

	return &Lnd{
		container: container,
		client:    client,
		conn:      conn,
		pubkey:    info.IdentityPubkey,
		address:   addrResp.Address,
	}, nil
}

// Close closes the gRPC connection
func (l *Lnd) Close() error {
	if l.conn != nil {
		return l.conn.Close()
	}
	return nil
}

// GetInfo returns node information
func (l *Lnd) GetInfo() (*lnrpc.GetInfoResponse, error) {
	return l.client.GetInfo(context.Background(), &lnrpc.GetInfoRequest{})
}

// GetBalance returns the wallet balance
func (l *Lnd) GetBalance() (*lnrpc.WalletBalanceResponse, error) {
	return l.client.WalletBalance(context.Background(), &lnrpc.WalletBalanceRequest{})
}

// CreateInvoice creates a new lightning invoice
func (l *Lnd) CreateInvoice(amount int64) (*lnrpc.AddInvoiceResponse, error) {
	return l.client.AddInvoice(context.Background(), &lnrpc.Invoice{
		Value: amount,
		Memo:  "Integration test invoice",
	})
}

// SendPayment sends a lightning payment
func (l *Lnd) SendPayment(paymentRequest string) (*lnrpc.SendResponse, error) {
	return l.client.SendPaymentSync(context.Background(), &lnrpc.SendRequest{
		PaymentRequest: paymentRequest,
	})
}

// OpenChannel opens a channel to another node
func (l *Lnd) OpenChannel(nodePubkey string, localAmount int64) error {
	pubkeyBytes, err := hex.DecodeString(nodePubkey)
	if err != nil {
		return fmt.Errorf("failed to decode pubkey: %w", err)
	}

	stream, err := l.client.OpenChannel(context.Background(), &lnrpc.OpenChannelRequest{
		NodePubkey:         pubkeyBytes,
		LocalFundingAmount: localAmount,
	})
	if err != nil {
		return fmt.Errorf("failed to open channel: %w", err)
	}

	// Wait for channel to be opened
	for {
		update, err := stream.Recv()
		if err != nil {
			return fmt.Errorf("failed to receive channel update: %w", err)
		}

		if update.GetChanOpen() != nil {
			break // Channel opened
		}
	}

	return nil
}

// ConnectPeer connects to another LND node
func (l *Lnd) ConnectPeer(pubkey, host string) error {
	_, err := l.client.ConnectPeer(context.Background(), &lnrpc.ConnectPeerRequest{
		Addr: &lnrpc.LightningAddress{
			Pubkey: pubkey,
			Host:   host,
		},
	})
	return err
}

// GetPubkey returns the node's public key
func (l *Lnd) GetPubkey() string {
	return l.pubkey
}

// GetAddress returns a wallet address
func (l *Lnd) GetAddress() string {
	return l.address
}

// NewAddress generates a new wallet address
func (l *Lnd) NewAddress() (string, error) {
	resp, err := l.client.NewAddress(context.Background(), &lnrpc.NewAddressRequest{
		Type: lnrpc.AddressType_WITNESS_PUBKEY_HASH,
	})
	if err != nil {
		return "", err
	}
	return resp.Address, nil
}

// WaitForSync waits for the node to sync with the blockchain
func (l *Lnd) WaitForSync() error {
	timeout := time.After(60 * time.Second)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for node to sync")
		case <-ticker.C:
			info, err := l.GetInfo()
			if err != nil {
				continue
			}
			if info.SyncedToChain {
				return nil
			}
		}
	}
}

// macaroonCredential implements credentials.PerRPCCredentials
type macaroonCredential struct {
	mac *macaroon.Macaroon
}

func newMacaroonCredential(mac *macaroon.Macaroon) *macaroonCredential {
	return &macaroonCredential{mac: mac}
}

func (mc *macaroonCredential) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	macBytes, err := mc.mac.MarshalBinary()
	if err != nil {
		return nil, err
	}
	return map[string]string{
		"macaroon": hex.EncodeToString(macBytes),
	}, nil
}

func (mc *macaroonCredential) RequireTransportSecurity() bool {
	return true
}
