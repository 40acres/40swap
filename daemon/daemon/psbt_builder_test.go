package daemon

import (
	"context"
	"errors"
	"testing"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/lightningnetwork/lnd/lntypes"
	log "github.com/sirupsen/logrus"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestNewPSBTBuilder(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	bitcoinClient := bitcoin.NewMockClient(ctrl)
	network := lightning.Regtest
	builder := NewPSBTBuilder(bitcoinClient, network)

	require.NotNilf(t, builder, "Expected PSBTBuilder to be created, got nil")
	require.Equal(t, bitcoinClient, builder.bitcoin, "Expected bitcoin client to be set correctly")
	require.Equal(t, network, builder.network, "Expected network to be set correctly")
}

func TestPSBTBuilder_BuildRefundPSBT(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	bitcoinClient := bitcoin.NewMockClient(ctrl)
	network := lightning.Regtest
	builder := NewPSBTBuilder(bitcoinClient, network)

	ctx := context.Background()
	logger := log.WithField("test", "BuildRefundPSBT")

	tests := []struct {
		name    string
		swap    *models.SwapIn
		feeRate int64
		setup   func()
		wantErr bool
	}{
		{
			name: "invalid redeem script",
			swap: &models.SwapIn{
				SwapID:       "test-swap",
				LockTxID:     "valid-tx-id",
				RedeemScript: "invalid-hex",
			},
			feeRate: 10,
			setup:   func() {},
			wantErr: true,
		},
		{
			name: "failed to get lock transaction",
			swap: &models.SwapIn{
				SwapID:       "test-swap",
				LockTxID:     "missing-tx-id",
				RedeemScript: "76a914000000000000000000000000000000000000000088ac",
			},
			feeRate: 10,
			setup: func() {
				bitcoinClient.EXPECT().GetTxFromTxID(ctx, "missing-tx-id").Return(nil, errors.New("transaction not found"))
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()

			_, err := builder.BuildRefundPSBT(ctx, tt.swap, tt.feeRate, logger)

			if (err != nil) != tt.wantErr {
				t.Errorf("BuildRefundPSBT() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestPSBTBuilder_BuildClaimPSBT(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	bitcoinClient := bitcoin.NewMockClient(ctrl)
	network := lightning.Regtest
	builder := NewPSBTBuilder(bitcoinClient, network)

	ctx := context.Background()
	logger := log.WithField("test", "BuildClaimPSBT")

	tests := []struct {
		name     string
		swap     *models.SwapOut
		swapInfo *swaps.SwapOutResponse
		feeRate  int64
		setup    func()
		wantErr  bool
	}{
		{
			name: "missing contract address",
			swap: &models.SwapOut{
				SwapID:          "test-swap",
				ClaimPrivateKey: "valid-private-key-hex",
				PreImage:        &lntypes.Preimage{},
				ContractAddress: "",
				RefundPublicKey: "deadbeef",
			},
			swapInfo: &swaps.SwapOutResponse{
				LockTx: stringPtr("valid-tx-id"),
			},
			feeRate: 10,
			setup:   func() {},
			wantErr: true,
		},
		{
			name: "missing refund public key",
			swap: &models.SwapOut{
				SwapID:          "test-swap",
				ClaimPrivateKey: "valid-private-key-hex",
				PreImage:        &lntypes.Preimage{},
				ContractAddress: "bc1qtest123",
				RefundPublicKey: "",
			},
			swapInfo: &swaps.SwapOutResponse{
				LockTx: stringPtr("valid-tx-id"),
			},
			feeRate: 10,
			setup:   func() {},
			wantErr: true,
		},
		{
			name: "missing preimage",
			swap: &models.SwapOut{
				SwapID:          "test-swap",
				ClaimPrivateKey: "valid-private-key-hex",
				PreImage:        nil,
				ContractAddress: "bc1qtest123",
				RefundPublicKey: "deadbeef",
			},
			swapInfo: &swaps.SwapOutResponse{
				LockTx: stringPtr("valid-tx-id"),
			},
			feeRate: 10,
			setup:   func() {},
			wantErr: true,
		},
		{
			name: "failed to get lock transaction",
			swap: &models.SwapOut{
				SwapID:          "test-swap",
				ClaimPrivateKey: "valid-private-key-hex",
				PreImage:        &lntypes.Preimage{},
				ContractAddress: "bc1qtest123",
				RefundPublicKey: "deadbeef",
			},
			swapInfo: &swaps.SwapOutResponse{
				LockTx: stringPtr("abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"),
			},
			feeRate: 10,
			setup: func() {
				bitcoinClient.EXPECT().GetTxFromTxID(gomock.Any(), "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890").Return(nil, errors.New("transaction not found"))
			},
			wantErr: true,
		},
		{
			name: "invalid claim private key",
			swap: &models.SwapOut{
				SwapID:          "test-swap",
				ClaimPrivateKey: "invalid-private-key",
				PreImage:        &lntypes.Preimage{},
				ContractAddress: "bc1qtest123",
				RefundPublicKey: "deadbeef",
			},
			swapInfo: &swaps.SwapOutResponse{
				LockTx: stringPtr("fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321"),
			},
			feeRate: 10,
			setup: func() {
				bitcoinClient.EXPECT().GetTxFromTxID(gomock.Any(), "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321").Return(nil, nil)
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()

			_, err := builder.BuildClaimPSBT(ctx, tt.swap, tt.swapInfo, tt.feeRate, logger)

			if (err != nil) != tt.wantErr {
				t.Errorf("BuildClaimPSBT() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestPSBTBuilder_SignAndBroadcastPSBT(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	bitcoinClient := bitcoin.NewMockClient(ctrl)
	network := lightning.Regtest
	builder := NewPSBTBuilder(bitcoinClient, network)

	ctx := context.Background()
	logger := log.WithField("test", "SignAndBroadcastPSBT")

	tests := []struct {
		name       string
		privateKey string
		preimage   *lntypes.Preimage
		setup      func()
		wantErr    bool
	}{
		{
			name:       "invalid private key",
			privateKey: "invalid-hex",
			preimage:   &lntypes.Preimage{},
			setup:      func() {},
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()

			_, err := builder.SignAndBroadcastPSBT(ctx, nil, tt.privateKey, tt.preimage, logger)

			if (err != nil) != tt.wantErr {
				t.Errorf("SignAndBroadcastPSBT() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
