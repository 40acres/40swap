package swaps

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/40acres/40swap/daemon/api"
	"github.com/40acres/40swap/daemon/database/models"
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

type clientError struct {
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
}

func (f *Client) GetConfiguration(ctx context.Context) (*ConfigurationResponse, error) {
	response, err := f.client.ConfigurationControllerGetConfiguration(ctx)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	if response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("failed to get configuration: %d - %s", response.StatusCode, response.Status)
	}

	// Marshal response into a struct
	var config ConfigurationResponse
	err = json.NewDecoder(response.Body).Decode(&config)
	if err != nil {
		return nil, err
	}

	return &config, nil
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

	if response.StatusCode >= http.StatusBadRequest {
		var bodyResponse clientError
		err = json.NewDecoder(response.Body).Decode(&bodyResponse)
		if err != nil {
			return nil, err
		}

		return nil, fmt.Errorf("failed to create swap: swap: %d - %s: %s", bodyResponse.StatusCode, response.Status, bodyResponse.Message)
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

	if response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("failed to get swap: %d - %s", response.StatusCode, response.Status)
	}

	// Marshal response into a struct
	var swapOutResponse SwapOutResponse
	err = json.NewDecoder(response.Body).Decode(&swapOutResponse)
	if err != nil {
		return nil, err
	}

	return &swapOutResponse, nil
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

	if response.StatusCode >= http.StatusBadRequest {
		body := map[string]any{}
		err = json.NewDecoder(response.Body).Decode(&body)
		if err != nil {
			return nil, err
		}
		if response.StatusCode == http.StatusBadRequest {
			return nil, fmt.Errorf("Failed to create swap: %s", body["message"])
		}

		return nil, fmt.Errorf("failed to create swap: swap: %d - %s: %s", response.StatusCode, response.Status, body["error"])
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

	if response.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("failed to get swap: %d - %s", response.StatusCode, response.Status)
	}

	// Marshal response into a struct
	var swapInResponse SwapInResponse
	err = json.NewDecoder(response.Body).Decode(&swapInResponse)
	if err != nil {
		return nil, err
	}

	return &swapInResponse, nil
}
