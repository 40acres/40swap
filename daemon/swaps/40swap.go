package swaps

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/40acres/40swap/daemon/api"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/shopspring/decimal"
)

type Client struct {
	client *api.Client
}

func NewClient(endpoint string) (*Client, error) {
	client, err := api.NewClient(endpoint)
	if err != nil {
		return nil, err
	}

	return &Client{
		client: client,
	}, nil
}

func chainToDtoChain(chain models.Chain) (api.ChainDtoChain, error) {
	switch chain {
	case models.Bitcoin:
		return api.ChainDtoChainBITCOIN, nil
	case models.Liquid:
		return api.ChainDtoChainLIQUID, nil
	default:
		return api.ChainDtoChainBITCOIN, fmt.Errorf("invalid chain: %s", chain)
	}
}

func parseErr(response *http.Response) error {
	if response.StatusCode >= http.StatusBadRequest {
		body := map[string]any{}
		err := json.NewDecoder(response.Body).Decode(&body)
		if err != nil {
			return err
		}

		if response.StatusCode == http.StatusNotFound {
			return ErrSwapNotFound
		}
		if response.StatusCode >= http.StatusInternalServerError {
			return fmt.Errorf("failed to get swap: %d - %s: %s", response.StatusCode, response.Status, body["error"])
		}

		return fmt.Errorf("failed to get swap: %d - %s: %s", response.StatusCode, response.Status, body["message"])
	}

	return nil
}

// mapServerNetworkToDaemonNetwork maps the server's network string to daemon's lightning.Network.
// This function handles the network nomenclature mismatch between server-backend and daemon:
// - server-backend uses: "bitcoin", "regtest", "testnet"
// - daemon expects: "mainnet", "regtest", "testnet"
// The critical mapping is "bitcoin" -> "mainnet" for production networks.
func mapServerNetworkToDaemonNetwork(serverNetwork string) (lightning.Network, error) {
	switch serverNetwork {
	case "bitcoin":
		return lightning.Mainnet, nil
	case "mainnet":
		return lightning.Mainnet, nil
	case "regtest":
		return lightning.Regtest, nil
	case "testnet":
		return lightning.Testnet, nil
	default:
		return "", fmt.Errorf("unsupported network: %s", serverNetwork)
	}
}

func (f *Client) GetConfiguration(ctx context.Context) (*ConfigurationResponse, error) {
	response, err := f.client.ConfigurationControllerGetConfiguration(ctx)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	err = parseErr(response)
	if err != nil {
		return nil, err
	}

	// First decode to a temporary struct to handle network mapping
	var rawConfig struct {
		BitcoinNetwork string          `json:"bitcoinNetwork"`
		FeePercentage  decimal.Decimal `json:"feePercentage"`
		MinimumAmount  decimal.Decimal `json:"minimumAmount"`
		MaximumAmount  decimal.Decimal `json:"maximumAmount"`
	}

	err = json.NewDecoder(response.Body).Decode(&rawConfig)
	if err != nil {
		return nil, err
	}

	// Map the server's network string to daemon's lightning.Network
	mappedNetwork, err := mapServerNetworkToDaemonNetwork(rawConfig.BitcoinNetwork)
	if err != nil {
		return nil, fmt.Errorf("failed to map network from server response: %w", err)
	}

	// Create the final response with mapped network
	config := &ConfigurationResponse{
		BitcoinNetwork: mappedNetwork,
		FeePercentage:  rawConfig.FeePercentage,
		MinimumAmount:  rawConfig.MinimumAmount,
		MaximumAmount:  rawConfig.MaximumAmount,
	}

	return config, nil
}

func (f *Client) CreateSwapOut(ctx context.Context, swapReq CreateSwapOutRequest) (*SwapOutResponse, error) {
	chain, err := chainToDtoChain(swapReq.Chain)
	if err != nil {
		return nil, err
	}

	body := api.SwapOutControllerCreateSwapJSONRequestBody{
		Chain:        api.SwapOutRequestDtoChain(chain),
		ClaimPubKey:  swapReq.ClaimPubKey,
		InputAmount:  float32(swapReq.Amount.ToBtc().InexactFloat64()),
		PreImageHash: swapReq.PreImageHash,
	}

	response, err := f.client.SwapOutControllerCreateSwap(ctx, body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	err = parseErr(response)
	if err != nil {
		return nil, err
	}

	// Marshal response into a struct
	var swapOutResponse SwapOutResponse
	err = json.NewDecoder(response.Body).Decode(&swapOutResponse)
	if err != nil {
		return nil, err
	}

	return &swapOutResponse, nil
}

func (f *Client) GetSwapOut(ctx context.Context, swapId string) (*SwapOutResponse, error) {
	response, err := f.client.SwapOutControllerGetSwap(ctx, swapId)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	err = parseErr(response)
	if err != nil {
		return nil, err
	}

	// Marshal response into a struct
	var swapOutResponse SwapOutResponse
	err = json.NewDecoder(response.Body).Decode(&swapOutResponse)
	if err != nil {
		return nil, err
	}

	return &swapOutResponse, nil
}

func (f *Client) GetClaimPSBT(ctx context.Context, swapId, address string) (*GetClaimPSBTResponse, error) {
	params := api.SwapOutControllerGetClaimPsbtParams{
		Address: address,
	}
	response, err := f.client.SwapOutControllerGetClaimPsbt(ctx, swapId, &params)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	err = parseErr(response)
	if err != nil {
		return nil, err
	}

	var getClaimPSBTResponse GetClaimPSBTResponse
	err = json.NewDecoder(response.Body).Decode(&getClaimPSBTResponse)
	if err != nil {
		return nil, err
	}

	return &getClaimPSBTResponse, nil
}

func (f *Client) PostClaim(ctx context.Context, swapId, tx string) error {
	body := api.SwapOutControllerClaimSwapJSONRequestBody{
		Tx: tx,
	}
	response, err := f.client.SwapOutControllerClaimSwap(ctx, swapId, body)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	return parseErr(response)
}

func (f *Client) CreateSwapIn(ctx context.Context, swapReq *CreateSwapInRequest) (*SwapInResponse, error) {
	chain, err := chainToDtoChain(swapReq.Chain)
	if err != nil {
		return nil, err
	}

	body := api.SwapInControllerCreateSwapJSONRequestBody{
		Chain:           api.SwapInRequestDtoChain(chain),
		Invoice:         swapReq.Invoice,
		RefundPublicKey: swapReq.RefundPublicKey,
	}

	response, err := f.client.SwapInControllerCreateSwap(ctx, body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	err = parseErr(response)
	if err != nil {
		return nil, err
	}

	// Marshal response into a struct
	var swapInResponse SwapInResponse
	err = json.NewDecoder(response.Body).Decode(&swapInResponse)
	if err != nil {
		return nil, err
	}

	return &swapInResponse, nil
}

func (f *Client) GetSwapIn(ctx context.Context, swapId string) (*SwapInResponse, error) {
	response, err := f.client.SwapInControllerGetSwap(ctx, swapId)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	err = parseErr(response)
	if err != nil {
		return nil, err
	}

	// Marshal response into a struct
	var swapInResponse SwapInResponse
	err = json.NewDecoder(response.Body).Decode(&swapInResponse)
	if err != nil {
		return nil, err
	}

	return &swapInResponse, nil
}

func (f *Client) GetRefundPSBT(ctx context.Context, swapId, address string) (*RefundPSBTResponse, error) {
	response, err := f.client.SwapInControllerGetRefundPsbt(ctx, swapId, &api.SwapInControllerGetRefundPsbtParams{
		Address: address,
	})
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	err = parseErr(response)
	if err != nil {
		return nil, err
	}

	var refundPSBTResponse RefundPSBTResponse
	err = json.NewDecoder(response.Body).Decode(&refundPSBTResponse)
	if err != nil {
		return nil, err
	}

	return &refundPSBTResponse, nil
}

func (f *Client) PostRefund(ctx context.Context, swapId, tx string) error {
	response, err := f.client.SwapInControllerSendRefundTx(ctx, swapId, api.SwapInControllerSendRefundTxJSONRequestBody{
		Tx: tx,
	})
	if err != nil {
		return err
	}

	defer response.Body.Close()

	return parseErr(response)
}
