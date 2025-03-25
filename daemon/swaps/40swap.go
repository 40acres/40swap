package swaps

import (
	"context"
	"encoding/json"
	"fmt"

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

func chainToDtoChain(chain models.Chain) (api.SwapOutRequestDtoChain, error) {
	switch chain {
	case models.Bitcoin:
		return api.BITCOIN, nil
	case models.Liquid:
		return api.LIQUID, nil
	default:
		return api.BITCOIN, fmt.Errorf("invalid chain: %s", chain)
	}
}

type clientError struct {
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
}

func (f *Client) CreateSwapOut(ctx context.Context, swapReq CreateSwapOutRequest) (*SwapOutResponse, error) {
	chain, err := chainToDtoChain(swapReq.Chain)
	if err != nil {
		return nil, err
	}

	body := api.SwapOutControllerCreateSwapJSONRequestBody{
		Chain:        chain,
		ClaimPubKey:  swapReq.ClaimPubKey,
		InputAmount:  float32(swapReq.Amount.ToBtc().InexactFloat64()),
		PreImageHash: swapReq.PreImageHash,
	}

	response, err := f.client.SwapOutControllerCreateSwap(ctx, body)
	if err != nil {
		return nil, err
	}

	if response.StatusCode >= 400 {
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

	if response.StatusCode >= 400 {
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
