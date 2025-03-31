package rpc

import (
	"context"
	"testing"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
	gomock "go.uber.org/mock/gomock"
)

func TestStatus_SwapIn(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockSwapClient := swaps.NewMockClientInterface(ctrl)

	ctx := context.Background()
	req := &GetSwapInRequest{
		Id: "swap-in-id",
	}

	mockSwapClient.EXPECT().GetSwapIn(ctx, "swap-in-id").Return(&swaps.SwapInResponse{
		SwapId:             "swap-in-id",
		Status:             models.StatusCreated,
		ContractAddress:    "dummy-contract-address",
		CreatedAt:          time.Now(),
		InputAmount:        decimal.NewFromFloat(100),
		LockTx:             new(string),
		Outcome:            "dummy-outcome",
		OutputAmount:       decimal.NewFromFloat(90),
		RedeemScript:       "dummy-redeem-script",
		TimeoutBlockHeight: 12345,
	}, nil)

	server := NewRPCServer(8080, nil, mockSwapClient, nil, Network_REGTEST)

	res, err := server.GetSwapIn(ctx, req)
	require.NoError(t, err)
	require.NotNil(t, res)
	require.Equal(t, "swap-in-id", res.Id)
	require.Equal(t, Status_CREATED, res.Status)
	require.Equal(t, "dummy-contract-address", res.ContractAddress)
	require.NotZero(t, res.CreatedAt)
	require.Equal(t, 100.0, res.InputAmount)
	require.NotNil(t, res.LockTx)
	require.Equal(t, "dummy-outcome", *res.Outcome)
	require.Equal(t, 90.0, res.OutputAmount)
	require.Equal(t, "dummy-redeem-script", res.RedeemScript)
	require.Equal(t, uint32(12345), res.TimeoutBlockHeight)
}

func TestStatus_SwapOut(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockSwapClient := swaps.NewMockClientInterface(ctrl)
	server := &Server{
		swapClient: mockSwapClient,
	}

	ctx := context.Background()
	req := &GetSwapOutRequest{
		Id: "swap-out-id",
	}

	mockSwapClient.EXPECT().GetSwapOut(ctx, "swap-out-id").Return(&swaps.SwapOutResponse{
		SwapId:             "swap-out-id",
		Status:             models.StatusCreated,
		TimeoutBlockHeight: 12345,
		Invoice:            "dummy-invoice",
		InputAmount:        decimal.NewFromInt(1000),
		OutputAmount:       decimal.NewFromInt(900),
		CreatedAt:          time.Now(),
	}, nil)

	res, err := server.GetSwapOut(ctx, req)
	require.NoError(t, err)
	require.NotNil(t, res)
	require.Equal(t, "swap-out-id", res.Id)
	require.Equal(t, Status_CREATED, res.Status)
	require.Equal(t, uint32(12345), res.TimeoutBlockHeight)
	require.Equal(t, "dummy-invoice", res.Invoice)
	require.Equal(t, 1000.0, res.InputAmount)
	require.Equal(t, 900.0, res.OutputAmount)
	require.NotZero(t, res.CreatedAt)
}

func TestConvertStatus(t *testing.T) {
	tests := []struct {
		name           string
		inputStatus    models.SwapStatus
		expectedStatus Status
		expectError    bool
	}{
		{
			name:           "StatusCreated",
			inputStatus:    models.StatusCreated,
			expectedStatus: Status_CREATED,
			expectError:    false,
		},
		{
			name:           "StatusInvoicePaymentIntentReceived",
			inputStatus:    models.StatusInvoicePaymentIntentReceived,
			expectedStatus: Status_INVOICE_PAYMENT_INTENT_RECEIVED,
			expectError:    false,
		},
		{
			name:           "StatusFundedUnconfirmed",
			inputStatus:    models.StatusFundedUnconfirmed,
			expectedStatus: Status_CONTRACT_FUNDED_UNCONFIRMED,
			expectError:    false,
		},
		{
			name:           "StatusFunded",
			inputStatus:    models.StatusFunded,
			expectedStatus: Status_CONTRACT_FUNDED,
			expectError:    false,
		},
		{
			name:           "StatusInvoicePaid",
			inputStatus:    models.StatusInvoicePaid,
			expectedStatus: Status_INVOICE_PAID,
			expectError:    false,
		},
		{
			name:           "StatusContractClaimedUnconfirmed",
			inputStatus:    models.StatusContractClaimedUnconfirmed,
			expectedStatus: Status_CONTRACT_CLAIMED_UNCONFIRMED,
			expectError:    false,
		},
		{
			name:           "StatusDone",
			inputStatus:    models.StatusDone,
			expectedStatus: Status_DONE,
			expectError:    false,
		},
		{
			name:           "StatusContractRefundedUnconfirmed",
			inputStatus:    models.StatusContractRefundedUnconfirmed,
			expectedStatus: Status_CONTRACT_REFUNDED_UNCONFIRMED,
			expectError:    false,
		},
		{
			name:           "StatusContractExpired",
			inputStatus:    models.StatusContractExpired,
			expectedStatus: Status_CONTRACT_EXPIRED,
			expectError:    false,
		},
		{
			name:           "InvalidStatus",
			inputStatus:    models.SwapStatus("invalid"),
			expectedStatus: 0,
			expectError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, err := mapStatus(tt.inputStatus)
			if tt.expectError {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.Equal(t, tt.expectedStatus, status)
			}
		})
	}
}
