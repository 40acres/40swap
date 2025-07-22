package daemon

import (
	"context"
	"encoding/hex"
	"errors"
	"testing"
	"time"

	"github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/lightning"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/btcsuite/btcd/wire"
	"github.com/lightningnetwork/lnd/lntypes"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

const (
	testSwapId = "abc"
	testPsbt   = "cHNidP8BAF4CAAAAAebcw2XfHoopKx18ULWF0I7AnoofStu5fYK6Gw/h3N5KAQAA" +
		"AAD9////Adp25zsAAAAAIgAg9q16iQ9ibL8Qh2iOsKXARie3hM32ui9Fp3bAj86aq9PiAAA" +
		"AAAEBK2Z35zsAAAAAIgAg3xr4GtUMUHo8/3EiFNMfpTb/WlTc4YeVqtm78aDSWtsBBWSpFI" +
		"Kk4PsTu5sqL5J8ju/Onlbd4kF5h2MhAqnfNT0ODvVOmREaPFRsvVAzcNw/ILgASvJMDvL9F" +
		"qN/ZwLiALF1IQMi5J5CowMrFZslrnQxnk8UJZRTdEHxgASs69YHnhzcHmisAAA="
	invalidPsbt              = "invalidpsbt"
	invalidRefundAddress     = "bcrt1qjhly8vx6mks9rqmuja9g92dw4yg4jfr3hdlhf9"
	validRefundAddress       = "bcrt1q76kh4zg0vfkt7yy8dz8tpfwqgcnm0pxd76az73d8wmqgln5640fsdy0mjx"
	invalidHexPrivateKey     = "invalidprivatekey"
	invalidPrivateKeyForPsbt = "cad79019e89c2b2f066fe0789880a33cad3aeb8aeb4c6323bf6550f583e7112b"
	validPrivateKeyForPsbt   = "bcd373971104b42b624a5675e759b014b7a59b2707419e6de8ddb02ba4456566"
	testRefundTxId           = "90714c7bbd14440c4120ef62f9353e893164fdc942dcbc860103440ab6d23697"
)

// Helper function for tests
func stringPtr(s string) *string {
	return &s
}

func Test_MonitorSwapIns(t *testing.T) {
	ctrl := gomock.NewController(t)
	t.Cleanup(ctrl.Finish)

	repository := rpc.NewMockRepository(ctrl)
	swapClient := swaps.NewMockClientInterface(ctrl)
	lightningClient := lightning.NewMockClient(ctrl)
	bitcoinClient := bitcoin.NewMockClient(ctrl)
	now := func() time.Time {
		return time.Date(2023, 10, 1, 0, 0, 0, 0, time.UTC)
	}
	ctx := context.Background()
	swapMonitor := SwapMonitor{
		repository:      repository,
		swapClient:      swapClient,
		lightningClient: lightningClient,
		bitcoin:         bitcoinClient,
		network:         lightning.Regtest,
		now:             now,
	}

	mockInvoice := lightning.CreateMockInvoice(t, 100)
	lnPreimage, err := lntypes.MakePreimage(lightning.TestPreimage[:])
	require.NoError(t, err)

	outcomeFailed := models.OutcomeFailed
	outcomeRefunded := models.OutcomeRefunded
	outcomeExpired := models.OutcomeExpired
	outcomeSuccess := models.OutcomeSuccess
	tests := []struct {
		name  string
		setup func()
		req   models.SwapIn
		want  *models.SwapIn
	}{
		{
			name: "Swap in not found in server",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(nil, swaps.ErrSwapNotFound)
			},
			req: models.SwapIn{
				SwapID: testSwapId,
			},
			want: &models.SwapIn{
				SwapID:  testSwapId,
				Outcome: &outcomeFailed,
				Status:  models.StatusDone,
			},
		},
		{
			name: "Swap didn't changed status",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					Status: models.StatusCreated,
				}, nil)
			},
			req: models.SwapIn{
				SwapID: testSwapId,
				Status: models.StatusCreated,
			},
		},
		{
			name: "Swap in changed status",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					Status: models.StatusContractFunded,
				}, nil)
			},
			req: models.SwapIn{
				SwapID: testSwapId,
				Status: models.StatusCreated,
			},
			want: &models.SwapIn{
				SwapID: testSwapId,
				Status: models.StatusContractFunded,
			},
		},
		{
			name: "Swap in refunded",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					Status:  models.StatusDone,
					Outcome: outcomeRefunded,
				}, nil)
			},
			req: models.SwapIn{
				SwapID: testSwapId,
				Status: models.StatusContractRefundedUnconfirmed,
			},
			want: &models.SwapIn{
				SwapID:  testSwapId,
				Status:  models.StatusDone,
				Outcome: &outcomeRefunded,
			},
		},
		{
			name: "Swap in expired",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					Status:  models.StatusDone,
					Outcome: outcomeExpired,
				}, nil)
			},
			req: models.SwapIn{
				SwapID: testSwapId,
				Status: models.StatusContractRefundedUnconfirmed,
			},
			want: &models.SwapIn{
				SwapID:  testSwapId,
				Status:  models.StatusDone,
				Outcome: &outcomeExpired,
			},
		},
		{
			name: "Swap in successful",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					Status:  models.StatusDone,
					Outcome: outcomeSuccess,
				}, nil)
				lightningClient.EXPECT().MonitorPaymentReception(ctx, lightning.TestPaymentHash[:]).Return(hex.EncodeToString(lightning.TestPreimage[:]), nil)
			},
			req: models.SwapIn{
				SwapID:         testSwapId,
				Status:         models.StatusContractRefundedUnconfirmed,
				PaymentRequest: mockInvoice,
			},
			want: &models.SwapIn{
				SwapID:         testSwapId,
				Status:         models.StatusDone,
				Outcome:        &outcomeSuccess,
				PaymentRequest: mockInvoice,
				PreImage:       &lnPreimage,
			},
		},
		{
			name: "Swap in contract expired, initiating refund",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					Status: models.StatusContractExpired,
				}, nil)
				// Set up bitcoin client mock expectations for fee rate check
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Simulate that getting lock transaction fails, so it falls back to API approach
				bitcoinClient.EXPECT().GetTxFromTxID(ctx, "some-tx-id").Return(nil, errors.New("transaction not found"))
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
				bitcoinClient.EXPECT().PostRefund(ctx, gomock.Any()).Return(nil)
			},
			req: models.SwapIn{
				SwapID:           testSwapId,
				Status:           models.StatusContractFunded,
				RefundAddress:    validRefundAddress,
				RefundPrivatekey: validPrivateKeyForPsbt,
				LockTxID:         "some-tx-id", // Add LockTxID to trigger local construction attempt
			},
			want: &models.SwapIn{
				SwapID:            testSwapId,
				Status:            models.StatusContractExpired,
				RefundRequestedAt: now(),
				RefundAddress:     validRefundAddress,
				RefundPrivatekey:  validPrivateKeyForPsbt,
				LockTxID:          "some-tx-id",
				RefundTxID:        testRefundTxId,
			},
		},
		{
			name: "Swap in refund in progress",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					Status: models.StatusContractExpired,
				}, nil)
			},
			req: models.SwapIn{
				SwapID:            testSwapId,
				Status:            models.StatusContractExpired,
				RefundRequestedAt: now(),
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()
			if tt.want != nil {
				repository.EXPECT().SaveSwapIn(ctx, tt.want).Return(nil)
			}

			err := swapMonitor.MonitorSwapIn(ctx, &tt.req)
			require.NoError(t, err)
		})
	}
}

func Test_Refund(t *testing.T) {
	ctrl := gomock.NewController(t)
	t.Cleanup(ctrl.Finish)

	repository := rpc.NewMockRepository(ctrl)
	swapClient := swaps.NewMockClientInterface(ctrl)
	bitcoinClient := bitcoin.NewMockClient(ctrl)
	now := func() time.Time {
		return time.Date(2023, 10, 1, 0, 0, 0, 0, time.UTC)
	}
	ctx := context.Background()

	swapMonitor := SwapMonitor{
		repository: repository,
		swapClient: swapClient,
		bitcoin:    bitcoinClient,
		network:    lightning.Regtest,
		now:        now,
	}

	tests := []struct {
		name    string
		setup   func()
		req     models.SwapIn
		wantErr bool
		err     error
	}{
		{
			name: "Invalid psbt",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: invalidPsbt,
				}, nil)
			},
			req: models.SwapIn{
				SwapID:        testSwapId,
				RefundAddress: validRefundAddress,
				// Don't set LockTxID to force fallback to API approach
			},
			wantErr: true,
			err:     errors.New("failed to decode psbt"),
		},
		{
			name: "Invalid refund address in PSBT",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, invalidRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
			},
			req: models.SwapIn{
				SwapID:        testSwapId,
				RefundAddress: invalidRefundAddress,
			},
			wantErr: true,
			err:     errors.New("invalid refund tx"),
		},
		{
			name: "failed to decode refund private key",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
			},
			req: models.SwapIn{
				SwapID:           testSwapId,
				RefundAddress:    validRefundAddress,
				RefundPrivatekey: invalidHexPrivateKey,
			},
			wantErr: true,
			err:     errors.New("failed to decode refund private key"),
		},
		{
			name: "trying to sign PSBT with incorrect refund key",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
			},
			req: models.SwapIn{
				SwapID:           testSwapId,
				RefundAddress:    validRefundAddress,
				RefundPrivatekey: invalidPrivateKeyForPsbt,
			},
			wantErr: true,
			err:     errors.New("failed to verify inputs: input 0: error executing script: signature not empty on failed checksig"),
		},
		{
			name: "correct signing of PSBT",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
				bitcoinClient.EXPECT().PostRefund(ctx, gomock.Any()).Return(nil)
			},
			req: models.SwapIn{
				SwapID:           testSwapId,
				RefundAddress:    validRefundAddress,
				RefundPrivatekey: validPrivateKeyForPsbt,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()
			_, err := swapMonitor.InitiateRefund(ctx, &tt.req)
			if tt.wantErr {
				require.Error(t, err)
				require.Contains(t, err.Error(), tt.err.Error())
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func Test_RefundLocalConstruction(t *testing.T) {
	ctrl := gomock.NewController(t)
	t.Cleanup(ctrl.Finish)

	repository := rpc.NewMockRepository(ctrl)
	swapClient := swaps.NewMockClientInterface(ctrl)
	bitcoinClient := bitcoin.NewMockClient(ctrl)
	now := func() time.Time {
		return time.Date(2023, 10, 1, 0, 0, 0, 0, time.UTC)
	}
	ctx := context.Background()

	swapMonitor := SwapMonitor{
		repository: repository,
		swapClient: swapClient,
		bitcoin:    bitcoinClient,
		network:    lightning.Regtest,
		now:        now,
	}

	// Mock empty transaction - will cause fallback to API for most tests

	tests := []struct {
		name    string
		setup   func()
		req     models.SwapIn
		wantErr bool
		err     error
	}{
		{
			name: "local construction fails due to empty transaction - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Return empty transaction which will cause local construction to fail
				bitcoinClient.EXPECT().GetTxFromTxID(ctx, "valid-lock-tx-id").Return(&wire.MsgTx{}, nil)
				// Expect fallback to API
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
				bitcoinClient.EXPECT().PostRefund(ctx, gomock.Any()).Return(nil)
			},
			req: models.SwapIn{
				SwapID:             testSwapId,
				LockTxID:           "valid-lock-tx-id",
				RedeemScript:       "76a914000000000000000000000000000000000000000088ac", // valid hex
				ClaimAddress:       validRefundAddress,
				RefundAddress:      validRefundAddress,
				RefundPrivatekey:   validPrivateKeyForPsbt,
				TimeoutBlockHeight: 123456,
			},
			wantErr: false, // Should succeed via fallback
		},
		{
			name: "local construction fails due to invalid redeem script - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Local construction will fail due to invalid redeem script, so fallback to API
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
				bitcoinClient.EXPECT().PostRefund(ctx, gomock.Any()).Return(nil)
			},
			req: models.SwapIn{
				SwapID:           testSwapId,
				LockTxID:         "valid-lock-tx-id",
				RedeemScript:     "invalid-hex",
				RefundAddress:    validRefundAddress,
				RefundPrivatekey: validPrivateKeyForPsbt,
			},
			wantErr: false, // Should succeed via fallback
		},
		{
			name: "local construction fails due to missing lock transaction - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				bitcoinClient.EXPECT().GetTxFromTxID(ctx, "missing-lock-tx-id").Return(nil, errors.New("transaction not found"))
				// Fallback to API
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
				bitcoinClient.EXPECT().PostRefund(ctx, gomock.Any()).Return(nil)
			},
			req: models.SwapIn{
				SwapID:           testSwapId,
				LockTxID:         "missing-lock-tx-id",
				RedeemScript:     "76a914000000000000000000000000000000000000000088ac",
				RefundAddress:    validRefundAddress,
				RefundPrivatekey: validPrivateKeyForPsbt,
			},
			wantErr: false, // Should succeed via fallback
		},
		{
			name: "no LockTxID - direct fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Should go directly to API fallback since no LockTxID
				swapClient.EXPECT().GetRefundPSBT(ctx, testSwapId, validRefundAddress).Return(&swaps.RefundPSBTResponse{
					PSBT: testPsbt,
				}, nil)
				bitcoinClient.EXPECT().PostRefund(ctx, gomock.Any()).Return(nil)
			},
			req: models.SwapIn{
				SwapID:           testSwapId,
				LockTxID:         "", // Empty LockTxID
				RefundAddress:    validRefundAddress,
				RefundPrivatekey: validPrivateKeyForPsbt,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()
			_, err := swapMonitor.InitiateRefund(ctx, &tt.req)
			if tt.wantErr {
				require.Error(t, err)
				require.Contains(t, err.Error(), tt.err.Error())
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func Test_ClaimSwapOutLocalConstruction(t *testing.T) {
	ctrl := gomock.NewController(t)
	t.Cleanup(ctrl.Finish)

	repository := rpc.NewMockRepository(ctrl)
	swapClient := swaps.NewMockClientInterface(ctrl)
	bitcoinClient := bitcoin.NewMockClient(ctrl)
	now := func() time.Time {
		return time.Date(2023, 10, 1, 0, 0, 0, 0, time.UTC)
	}
	ctx := context.Background()

	swapMonitor := SwapMonitor{
		repository: repository,
		swapClient: swapClient,
		bitcoin:    bitcoinClient,
		network:    lightning.Regtest,
		now:        now,
	}

	// Mock preimage for tests
	mockPreimage := &lntypes.Preimage{}
	copy(mockPreimage[:], make([]byte, 32)) // Valid preimage

	tests := []struct {
		name    string
		setup   func()
		req     models.SwapOut
		wantErr bool
		err     error
	}{
		{
			name: "local claim construction fails due to empty transaction - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Use a proper 64-character transaction ID
				validTxId := "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
				swapClient.EXPECT().GetSwapOut(ctx, testSwapId).Return(&swaps.SwapOutResponse{
					LockTx:             stringPtr(validTxId),
					TimeoutBlockHeight: 123456,
				}, nil)
				// Return empty transaction which will cause local construction to fail
				bitcoinClient.EXPECT().GetTxFromTxID(gomock.Any(), validTxId).Return(&wire.MsgTx{}, nil)
				// Expect fallback to API to fail as well (simpler for testing)
				swapClient.EXPECT().GetClaimPSBT(ctx, testSwapId, "bcrt1qtest123destination").Return(nil, errors.New("API also failed"))
			},
			req: models.SwapOut{
				SwapID:             testSwapId,
				ClaimPrivateKey:    validPrivateKeyForPsbt,
				DestinationAddress: "bcrt1qtest123destination",
				PreImage:           mockPreimage,
				ContractAddress:    stringPtr("bcrt1qcontract123"),
				RefundPublicKey:    stringPtr("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"), // Valid compressed pubkey
			},
			wantErr: true, // Both local and API fallback fail
			err:     errors.New("API also failed"),
		},
		{
			name: "missing contract address - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Use a proper 64-character transaction ID
				validTxId := "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
				swapClient.EXPECT().GetSwapOut(ctx, testSwapId).Return(&swaps.SwapOutResponse{
					LockTx: stringPtr(validTxId),
				}, nil)
				// No GetTxFromTxID call expected - fails before reaching that point
				// Fallback to API also fails (simpler for testing)
				swapClient.EXPECT().GetClaimPSBT(ctx, testSwapId, "bcrt1qtest123destination").Return(nil, errors.New("API also failed"))
			},
			req: models.SwapOut{
				SwapID:             testSwapId,
				ClaimPrivateKey:    validPrivateKeyForPsbt,
				DestinationAddress: "bcrt1qtest123destination",
				PreImage:           mockPreimage,
				ContractAddress:    nil, // Missing contract address
				RefundPublicKey:    stringPtr("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
			},
			wantErr: true, // Both local and API fallback fail
		},
		{
			name: "missing refund public key - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				swapClient.EXPECT().GetSwapOut(ctx, testSwapId).Return(&swaps.SwapOutResponse{
					LockTx: stringPtr("valid-lock-tx-id"),
				}, nil)
				// No GetTxFromTxID call expected - fails before reaching that point
				// Fallback to API also fails (simpler for testing)
				swapClient.EXPECT().GetClaimPSBT(ctx, testSwapId, "bcrt1qtest123destination").Return(nil, errors.New("API also failed"))
			},
			req: models.SwapOut{
				SwapID:             testSwapId,
				ClaimPrivateKey:    validPrivateKeyForPsbt,
				DestinationAddress: "bcrt1qtest123destination",
				PreImage:           mockPreimage,
				ContractAddress:    stringPtr("bcrt1qcontract123"),
				RefundPublicKey:    nil, // Missing refund public key
			},
			wantErr: true, // Both local and API fallback fail
		},
		{
			name: "missing preimage - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				swapClient.EXPECT().GetSwapOut(ctx, testSwapId).Return(&swaps.SwapOutResponse{
					LockTx: stringPtr("valid-lock-tx-id"),
				}, nil)
				// No GetTxFromTxID call expected - fails before reaching that point
				// Fallback to API also fails (simpler for testing)
				swapClient.EXPECT().GetClaimPSBT(ctx, testSwapId, "bcrt1qtest123destination").Return(nil, errors.New("API also failed"))
			},
			req: models.SwapOut{
				SwapID:             testSwapId,
				ClaimPrivateKey:    validPrivateKeyForPsbt,
				DestinationAddress: "bcrt1qtest123destination",
				PreImage:           nil, // Missing preimage
				ContractAddress:    stringPtr("bcrt1qcontract123"),
				RefundPublicKey:    stringPtr("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
			},
			wantErr: true, // Both local and API fallback fail
		},
		{
			name: "failed to get swap info - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				swapClient.EXPECT().GetSwapOut(ctx, testSwapId).Return(nil, errors.New("error getting swap info"))
				// Fallback to API also fails (simpler for testing)
				swapClient.EXPECT().GetClaimPSBT(ctx, testSwapId, "bcrt1qtest123destination").Return(nil, errors.New("API also failed"))
			},
			req: models.SwapOut{
				SwapID:             testSwapId,
				ClaimPrivateKey:    validPrivateKeyForPsbt,
				DestinationAddress: "bcrt1qtest123destination",
				PreImage:           mockPreimage,
				ContractAddress:    stringPtr("bcrt1qcontract123"),
				RefundPublicKey:    stringPtr("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
			},
			wantErr: true, // Both local and API fallback fail
		},
		{
			name: "invalid refund public key hex - fallback to API",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Use a proper 64-character transaction ID
				validTxId := "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
				swapClient.EXPECT().GetSwapOut(ctx, testSwapId).Return(&swaps.SwapOutResponse{
					LockTx:             stringPtr(validTxId),
					TimeoutBlockHeight: 123456,
				}, nil)
				bitcoinClient.EXPECT().GetTxFromTxID(gomock.Any(), validTxId).Return(&wire.MsgTx{}, nil)
				// Fallback to API also fails (simpler for testing)
				swapClient.EXPECT().GetClaimPSBT(ctx, testSwapId, "bcrt1qtest123destination").Return(nil, errors.New("API also failed"))
			},
			req: models.SwapOut{
				SwapID:             testSwapId,
				ClaimPrivateKey:    validPrivateKeyForPsbt,
				DestinationAddress: "bcrt1qtest123destination",
				PreImage:           mockPreimage,
				ContractAddress:    stringPtr("bcrt1qcontract123"),
				RefundPublicKey:    stringPtr("invalid-hex"), // Invalid hex
			},
			wantErr: true, // Both local and API fallback fail
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()
			_, err := swapMonitor.ClaimSwapOut(ctx, &tt.req)
			if tt.wantErr {
				require.Error(t, err)
				if tt.err != nil {
					require.Contains(t, err.Error(), tt.err.Error())
				}
			} else {
				require.NoError(t, err)
			}
		})
	}
}
