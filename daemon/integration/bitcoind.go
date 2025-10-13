package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/testcontainers/testcontainers-go"
)

// Bitcoind represents a bitcoind instance for integration tests
type Bitcoind struct {
	container testcontainers.Container
	rpcURL    string
	rpcAuth   string
}

// NewBitcoind creates a new Bitcoind helper from a testcontainers container
func NewBitcoind(container testcontainers.Container) (*Bitcoind, error) {
	host, err := container.Host(context.Background())
	if err != nil {
		return nil, err
	}

	mappedPort, err := container.MappedPort(context.Background(), "18443")
	if err != nil {
		return nil, err
	}

	return &Bitcoind{
		container: container,
		rpcURL:    fmt.Sprintf("http://%s:%s", host, mappedPort.Port()),
		rpcAuth:   "40swap:pass", // From docker-compose
	}, nil
}

// RPCRequest represents a JSON-RPC request to bitcoind
type RPCRequest struct {
	JsonRPC string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params,omitempty"`
}

// RPCResponse represents a JSON-RPC response from bitcoind
type RPCResponse struct {
	Result interface{} `json:"result"`
	Error  *RPCError   `json:"error"`
	ID     int         `json:"id"`
}

// RPCError represents an error in a JSON-RPC response
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// rpcCall makes a JSON-RPC call to bitcoind
func (b *Bitcoind) rpcCall(method string, params ...interface{}) (*RPCResponse, error) {
	request := RPCRequest{
		JsonRPC: "1.0",
		ID:      1,
		Method:  method,
		Params:  params,
	}

	reqBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", b.rpcURL, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth("40swap", "pass")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	var rpcResp RPCResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if rpcResp.Error != nil {
		return nil, fmt.Errorf("RPC error: %s", rpcResp.Error.Message)
	}

	return &rpcResp, nil
}

// Mine mines the specified number of blocks (default 1)
func (b *Bitcoind) Mine(blocks ...int) error {
	numBlocks := 1
	if len(blocks) > 0 && blocks[0] > 0 {
		numBlocks = blocks[0]
	}

	// Ensure we have a wallet
	err := b.ensureWallet()
	if err != nil {
		return err
	}

	// Get a new address for mining rewards
	resp, err := b.rpcCall("getnewaddress", "", "legacy")
	if err != nil {
		return fmt.Errorf("failed to get new address: %w", err)
	}

	address, ok := resp.Result.(string)
	if !ok {
		return fmt.Errorf("unexpected address type: %T", resp.Result)
	}

	// Mine blocks to that address
	_, err = b.rpcCall("generatetoaddress", numBlocks, address)
	if err != nil {
		return fmt.Errorf("failed to mine blocks: %w", err)
	}

	return nil
}

// SendToAddress sends bitcoin to the specified address
func (b *Bitcoind) SendToAddress(address string, amount float64) (string, error) {
	// Ensure we have a wallet
	err := b.ensureWallet()
	if err != nil {
		return "", err
	}

	resp, err := b.rpcCall("sendtoaddress", address, amount)
	if err != nil {
		return "", fmt.Errorf("failed to send to address: %w", err)
	}

	txid, ok := resp.Result.(string)
	if !ok {
		return "", fmt.Errorf("unexpected txid type: %T", resp.Result)
	}

	return txid, nil
}

// GetNewAddress generates a new address
func (b *Bitcoind) GetNewAddress() (string, error) {
	// First, ensure we have a wallet
	err := b.ensureWallet()
	if err != nil {
		return "", err
	}

	resp, err := b.rpcCall("getnewaddress", "", "bech32")
	if err != nil {
		return "", fmt.Errorf("failed to get new address: %w", err)
	}

	address, ok := resp.Result.(string)
	if !ok {
		return "", fmt.Errorf("unexpected address type: %T", resp.Result)
	}

	return address, nil
}

// ensureWallet creates a default wallet if none exists
func (b *Bitcoind) ensureWallet() error {
	// Check if we already have wallets loaded
	resp, err := b.rpcCall("listwallets")
	if err == nil {
		if wallets, ok := resp.Result.([]interface{}); ok && len(wallets) > 0 {
			return nil // We already have a wallet loaded
		}
	}

	// Try to create a new wallet with a specific name
	walletName := "testwallet"
	_, err = b.rpcCall("createwallet", walletName)
	if err != nil {
		// If creation failed, try to load it (maybe it already exists)
		_, err = b.rpcCall("loadwallet", walletName)
		if err != nil {
			return fmt.Errorf("failed to create or load wallet: %w", err)
		}
	}

	return nil
}

// GetBlockHeight returns the current block height
func (b *Bitcoind) GetBlockHeight() (int, error) {
	resp, err := b.rpcCall("getblockcount")
	if err != nil {
		return 0, fmt.Errorf("failed to get block count: %w", err)
	}

	// JSON numbers are decoded as float64
	height, ok := resp.Result.(float64)
	if !ok {
		return 0, fmt.Errorf("unexpected height type: %T", resp.Result)
	}

	return int(height), nil
}

// GetBalance returns the wallet balance
func (b *Bitcoind) GetBalance() (float64, error) {
	// Ensure we have a wallet
	err := b.ensureWallet()
	if err != nil {
		return 0, err
	}

	resp, err := b.rpcCall("getbalance")
	if err != nil {
		return 0, fmt.Errorf("failed to get balance: %w", err)
	}

	balance, ok := resp.Result.(float64)
	if !ok {
		return 0, fmt.Errorf("unexpected balance type: %T", resp.Result)
	}

	return balance, nil
}
