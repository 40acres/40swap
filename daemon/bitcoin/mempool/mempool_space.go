package mempool

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/btcsuite/btcd/wire"
)

const BaseURL = "https://mempool.space/api"

var ErrUnexpectedStatus = fmt.Errorf("unexpected status code")

type Option func(*Options)

func WithURL(url string) func(*Options) {
	return func(s *Options) {
		s.baseURL = url
	}
}

type Options struct {
	baseURL string
}

type MempoolSpace struct {
	client    *http.Client
	baseURL   string
	authToken string
}

// New creates a new MempoolSpace client
func New(token string, options ...Option) *MempoolSpace {
	mempoolSpace := MempoolSpace{
		client:    &http.Client{},
		authToken: token,
	}
	opts := Options{
		baseURL: BaseURL,
	}
	for _, option := range options {
		option(&opts)
	}

	mempoolSpace.baseURL = opts.baseURL

	return &mempoolSpace
}

// GetTxFromOutpoint retrieves the Transaction from an outpoint
func (m *MempoolSpace) GetTxFromOutpoint(ctx context.Context, outpoint string) (*wire.MsgTx, error) {
	txId, _, err := bitcoin.ParseOutpoint(outpoint)
	if err != nil {
		return nil, err
	}

	return m.GetTxFromTxID(ctx, txId)
}

// GetTxFromTxID retrieves the Transaction from a transaction ID
func (m *MempoolSpace) GetTxFromTxID(ctx context.Context, txID string) (*wire.MsgTx, error) {
	req, err := m.makeRequest(ctx, "/tx/"+txID+"/hex", "GET", nil)
	if err != nil {
		return nil, err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("unexpected status code: %d: %w", resp.StatusCode, ErrUnexpectedStatus)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	txHex := string(bodyBytes)

	// MempoolSpace /raw is broken, so we have to use /hex
	raw, err := hex.DecodeString(txHex)
	if err != nil {
		return nil, err
	}

	tx := wire.NewMsgTx(1)
	err = tx.Deserialize(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}

	return tx, nil
}

func (m *MempoolSpace) PostRefund(ctx context.Context, tx string) error {
	req, err := m.makeRequest(ctx, "/tx/", "POST", &tx)
	if err != nil {
		return err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}

	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		// use readAll to get the error message
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return err
		}

		return fmt.Errorf("unexpected status code: %d: %w, err: %s", resp.StatusCode, ErrUnexpectedStatus, bodyBytes)
	}

	return nil
}

func (m *MempoolSpace) GetRecommendedFees(ctx context.Context, speed bitcoin.Speed) (int64, error) {
	req, err := m.makeRequest(ctx, "/v1/fees/recommended", "GET", nil)
	if err != nil {
		return 0, err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return 0, err
	}

	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return 0, fmt.Errorf("unexpected status code: %d: %w", resp.StatusCode, ErrUnexpectedStatus)
	}

	fees := make(map[string]int64)
	if err := json.NewDecoder(resp.Body).Decode(&fees); err != nil {
		return 0, err
	}

	return fees[string(speed)], nil
}

func (m *MempoolSpace) GetFeeFromTxId(ctx context.Context, txId string) (int64, error) {
	req, err := m.makeRequest(ctx, "/tx/"+txId, "GET", nil)
	if err != nil {
		return 0, err
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return 0, fmt.Errorf("failed to get transaction from mempool: %s", resp.Status)
	}

	var txInfo struct {
		Fee int64 `json:"fee"`
	}
	err = json.NewDecoder(resp.Body).Decode(&txInfo)
	if err != nil {
		return 0, fmt.Errorf("failed to decode transaction info: %w", err)
	}
	// Get the fee from the transaction info
	onchainFees := txInfo.Fee

	return onchainFees, nil
}

func (m *MempoolSpace) makeRequest(ctx context.Context, path string, method string, body *string) (*http.Request, error) {
	var req *http.Request
	var err error
	if method == "GET" {
		req, err = http.NewRequestWithContext(ctx, method, m.baseURL+path, nil)
	} else {
		bodyBytes := bytes.NewBuffer([]byte(*body))
		req, err = http.NewRequestWithContext(ctx, method, m.baseURL+path, bodyBytes)
		req.Header.Set("Content-Type", "text/plain")
	}
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", m.authToken)

	return req, nil
}
