package rpc

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestServer_SwapIn(t *testing.T) {
	ctx := context.Background()
	swapId := "ugJHXnF12dUG"
	amt := uint64(200000)
	contractAddress := "bcrt1qey38yg6kjmtjxr28wrdrdhp22gu064xxj97006"

	ctrl := gomock.NewController(t)
	t.Cleanup(ctrl.Finish)

	lightningClient := lightning.NewMockClient(ctrl)
	swapClient := swaps.NewMockClientInterface(ctrl)
	reposistory := NewMockRepository(ctrl)
	server := Server{
		lightningClient: lightningClient,
		swapClient:      swapClient,
		Repository:      reposistory,
		network:         2, // regtest
	}

	invoice := lightning.CreateMockInvoice(t, int64(amt))

	tests := []struct {
		name    string
		setup   func() *Server
		req     *SwapInRequest
		want    *SwapInResponse
		wantErr bool
		err     error
	}{
		{
			name: "No invoice and no amount provided",
			setup: func() *Server {
				return &server
			},
			req:     &SwapInRequest{},
			want:    nil,
			wantErr: true,
			err:     errors.New("either invoice or amountSats must be provided"),
		},
		{
			name: "Invoice doesn't match network",
			setup: func() *Server {
				serverWithMainnet := server
				serverWithMainnet.network = 0 // mainnet

				return &serverWithMainnet
			},
			req: &SwapInRequest{
				Invoice: &invoice,
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("invalid invoice: invoice not for current active network 'mainnet'"),
		},
		{
			name: "Refund address is not provided",
			setup: func() *Server {
				amtDecimal := decimal.NewFromUint64(amt)
				defaultExpiry := 3 * 24 * 60 * 60 * time.Second
				lightningClient.EXPECT().GenerateInvoice(ctx, amtDecimal, defaultExpiry, "").Return(invoice, []byte{}, nil)

				return &server
			},
			req: &SwapInRequest{
				AmountSats: &amt,
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("refund address is required"),
		},
		{
			name: "Refund address is not valid",
			setup: func() *Server {
				amtDecimal := decimal.NewFromUint64(amt)
				defaultExpiry := 3 * 24 * 60 * 60 * time.Second
				lightningClient.EXPECT().GenerateInvoice(ctx, amtDecimal, defaultExpiry, "").Return(invoice, []byte{}, nil)

				return &server
			},
			req: &SwapInRequest{
				AmountSats: &amt,
				RefundTo:   "abcd",
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("invalid refund address: decoded address is of unknown format"),
		},
		{
			name: "Refund address is not the correct network",
			setup: func() *Server {
				amtDecimal := decimal.NewFromUint64(amt)
				defaultExpiry := 3 * 24 * 60 * 60 * time.Second
				lightningClient.EXPECT().GenerateInvoice(ctx, amtDecimal, defaultExpiry, "").Return(invoice, []byte{}, nil)

				return &server
			},
			req: &SwapInRequest{
				AmountSats: &amt,
				RefundTo:   "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("invalid refund address: address is not for the current active network 'regtest'"),
		},
		{
			name: "Request not between minimum and maximum amount",
			setup: func() *Server {
				amtDecimal := decimal.NewFromUint64(amt)
				defaultExpiry := 3 * 24 * 60 * 60 * time.Second
				swapClient.EXPECT().GetConfiguration(ctx).Return(&swaps.ConfigurationResponse{
					MinimumAmount: decimal.NewFromFloat(0.1),
					MaximumAmount: decimal.NewFromFloat(0.2),
				}, nil)
				lightningClient.EXPECT().GenerateInvoice(ctx, amtDecimal, defaultExpiry, "").Return(invoice, []byte{}, nil)

				return &server
			},
			req: &SwapInRequest{
				AmountSats: &amt,
				RefundTo:   "bcrt1q76kh4zg0vfkt7yy8dz8tpfwqgcnm0pxd76az73d8wmqgln5640fsdy0mjx",
			},
			want:    nil,
			wantErr: true,
			err:     errors.New("amount 0.002 is not in the range [0.1, 0.2]"),
		},
		{
			name: "Valid request with provided invoice",
			setup: func() *Server {
				amtDecimal := decimal.NewFromUint64(amt)
				defaultExpiry := 3 * 24 * 60 * 60 * time.Second
				swapClient.EXPECT().GetConfiguration(ctx).Return(&swaps.ConfigurationResponse{
					MinimumAmount: decimal.NewFromFloat(0.001),
					MaximumAmount: decimal.NewFromFloat(0.01),
				}, nil)
				lightningClient.EXPECT().GenerateInvoice(ctx, amtDecimal, defaultExpiry, "").Return(invoice, []byte{}, nil)
				swapClient.EXPECT().CreateSwapIn(ctx, gomock.Any()).Return(&swaps.SwapInResponse{
					SwapId:             swapId,
					InputAmount:        decimal.NewFromFloat(0.00200105),
					OutputAmount:       decimal.NewFromFloat(0.00200000),
					Status:             "CREATED",
					ContractAddress:    contractAddress,
					TimeoutBlockHeight: 1000,
					RedeemScript:       "test",
				}, nil)
				reposistory.EXPECT().SaveSwapIn(gomock.Any()).Return(nil)

				return &server
			},
			req: &SwapInRequest{
				AmountSats: &amt,
				RefundTo:   "bcrt1q76kh4zg0vfkt7yy8dz8tpfwqgcnm0pxd76az73d8wmqgln5640fsdy0mjx",
			},
			want: &SwapInResponse{
				SwapId:       swapId,
				AmountSats:   200105,
				ClaimAddress: contractAddress,
			},
		},
		{
			name: "Valid request with amount",
			setup: func() *Server {
				swapClient.EXPECT().GetConfiguration(ctx).Return(&swaps.ConfigurationResponse{
					MinimumAmount: decimal.NewFromFloat(0.001),
					MaximumAmount: decimal.NewFromFloat(0.01),
				}, nil)
				swapClient.EXPECT().CreateSwapIn(ctx, gomock.Any()).Return(&swaps.SwapInResponse{
					SwapId:             swapId,
					InputAmount:        decimal.NewFromFloat(0.00200105),
					OutputAmount:       decimal.NewFromFloat(0.00200000),
					Status:             "CREATED",
					ContractAddress:    contractAddress,
					TimeoutBlockHeight: 1000,
					RedeemScript:       "test",
				}, nil)
				reposistory.EXPECT().SaveSwapIn(gomock.Any()).Return(nil)

				return &server
			},
			req: &SwapInRequest{
				Invoice:  &invoice,
				RefundTo: "bcrt1q76kh4zg0vfkt7yy8dz8tpfwqgcnm0pxd76az73d8wmqgln5640fsdy0mjx",
			},
			want: &SwapInResponse{
				SwapId:       swapId,
				AmountSats:   200105,
				ClaimAddress: contractAddress,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := tt.setup()
			got, err := server.SwapIn(ctx, tt.req)
			if (err != nil) != tt.wantErr {
				t.Errorf("Server.SwapIn() error = %v, wantErr %v", err, tt.wantErr)

				return
			}
			if tt.wantErr {
				require.Equal(t, tt.err.Error(), err.Error())
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("Server.SwapIn() = %v, want %v", got, tt.want)
			}
		})
	}
}

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
			inputStatus:    models.StatusContractFundedUnconfirmed,
			expectedStatus: Status_CONTRACT_FUNDED_UNCONFIRMED,
			expectError:    false,
		},
		{
			name:           "StatusFunded",
			inputStatus:    models.StatusContractFunded,
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
