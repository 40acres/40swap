package swaps

import (
	"context"
	"testing"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/money"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/mock/gomock"
)

// MockLightningClient is a mock implementation of LightningClient
type MockLightningClient struct {
	mock.Mock
}

func (m *MockLightningClient) GetInfo(ctx context.Context) (*LightningInfo, error) {
	args := m.Called(ctx)
	return args.Get(0).(*LightningInfo), args.Error(1)
}

func TestAutoSwapService(t *testing.T) {
	t.Run("RunAutoSwapCheck with balance above target", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0

		// Setup lightning mock to return balance above target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance: 1.5, // Above target of 1.0
		}, nil)

		// Setup mock client expectations for swap out creation
		mockClient.EXPECT().CreateSwapOut(gomock.Any(), gomock.Any()).Return(&SwapOutResponse{
			SwapId:  "test-swap-id",
			Invoice: "test-invoice",
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck with balance below target", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0

		// Setup lightning mock to return balance below target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance: 0.5, // Below target of 1.0
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck with lightning error", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true

		// Setup lightning mock to return error
		mockLightning.On("GetInfo", mock.Anything).Return((*LightningInfo)(nil), assert.AnError)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.Error(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck creates swap out when balance exceeds target", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)

		// Setup config
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MinSwapSizeBTC = 0.001
		config.MaxSwapSizeBTC = 0.1

		// Setup lightning mock to return balance above target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance: 1.2, // Above target of 1.0, excess of 0.2 BTC
		}, nil)

		// Setup mock client expectations
		expectedAmount, _ := money.NewFromBtc(decimal.NewFromFloat(0.1)) // Should be capped at MaxSwapSizeBTC
		mockClient.EXPECT().CreateSwapOut(gomock.Any(), gomock.Any()).DoAndReturn(
			func(ctx context.Context, req CreateSwapOutRequest) (*SwapOutResponse, error) {
				// Verify the request parameters
				assert.Equal(t, models.Bitcoin, req.Chain)
				assert.Equal(t, expectedAmount, req.Amount)
				assert.NotEmpty(t, req.PreImageHash)
				assert.NotEmpty(t, req.ClaimPubKey)

				// Return a mock response
				return &SwapOutResponse{
					SwapId:  "test-swap-id",
					Invoice: "test-invoice",
				}, nil
			},
		)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
	})

	t.Run("RunAutoSwapCheck skips swap when excess is below minimum", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		defer ctrl.Finish()

		// Create mocks
		mockLightning := new(MockLightningClient)
		mockClient := NewMockClientInterface(ctrl)

		// Setup config with high minimum
		config := NewAutoSwapConfig()
		config.Enabled = true
		config.TargetBalanceBTC = 1.0
		config.MinSwapSizeBTC = 0.1 // High minimum
		config.MaxSwapSizeBTC = 0.5

		// Setup lightning mock to return balance slightly above target
		mockLightning.On("GetInfo", mock.Anything).Return(&LightningInfo{
			LocalBalance: 1.05, // Only 0.05 BTC excess, below minimum of 0.1
		}, nil)

		// Create service
		service := NewAutoSwapService(mockClient, mockLightning, config)

		// Run the check
		err := service.RunAutoSwapCheck(context.Background())

		// Verify
		assert.NoError(t, err)
		mockLightning.AssertExpectations(t)
		// No expectations on mockClient since no swap should be created
	})
}
