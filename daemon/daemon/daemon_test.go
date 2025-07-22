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
				// For local construction only, if getting lock transaction fails, the whole operation fails
				bitcoinClient.EXPECT().GetTxFromTxID(ctx, "some-tx-id").Return(nil, errors.New("transaction not found"))
				// No more fallback calls to GetRefundPSBT or PostRefund
			},
			req: models.SwapIn{
				SwapID:           testSwapId,
				Status:           models.StatusContractFunded,
				RefundAddress:    validRefundAddress,
				RefundPrivatekey: validPrivateKeyForPsbt,
				LockTxID:         "some-tx-id", // Add LockTxID to trigger local construction attempt
			},
			// Since local construction fails, no want expectation - the test should expect an error
			want: nil,
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
			if tt.want == nil && tt.name == "Swap in contract expired, initiating refund" {
				// This test expects an error due to failed local construction
				require.Error(t, err)
				require.Contains(t, err.Error(), "failed to initiate refund")
			} else {
				require.NoError(t, err)
			}
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
			name: "No LockTxID - local construction fails",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Mock the GetSwapIn call that will be made when LockTxID is missing
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					SwapId: testSwapId,
					// Return empty LockTx to simulate that backend also doesn't have it
				}, nil)
			},
			req: models.SwapIn{
				SwapID:        testSwapId,
				RefundAddress: validRefundAddress,
				// Don't set LockTxID to trigger backend lookup
			},
			wantErr: true,
			err:     errors.New("lock transaction ID not available for local construction (not found in backend either)"),
		},
		{
			name: "No LockTxID - successfully retrieved from backend",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(10), nil)
				// Mock the GetSwapIn call that returns a valid simple transaction
				swapClient.EXPECT().GetSwapIn(ctx, testSwapId).Return(&swaps.SwapInResponse{
					SwapId: testSwapId,
					// This is a valid Bitcoin transaction in hex format
					LockTx: stringPtr("020000000001010a8c9a4185c21121bbfce347638fd537a221d9c7509870c62c835e43471324470100000000fdffffff0267789ad0000000002251207334a2da5532326422535efcb08a3383f8aa0f0be9628f36bae448a327f246da2d1103000000000022002025f32afca1be933158d98b3ee76a1d128ca236712207d2c9b622b921946f47f5024730440220020eb2facf317185921a371c89515541c74fe62f09cacfe30e9a3cfaa813599702202e26e063c153a7f2843f54e82d93cb01202c385827a1e399674d3d04dcb78ee2012103b4a60e3f2a977725a3348b4182c0fb6fff1f22eb5b4d46284c9982c02dd323097e000000"),
				}, nil)
				// Mock the GetTxFromTxID call that PSBTBuilder will make
				bitcoinClient.EXPECT().GetTxFromTxID(ctx, "fa44086e23eabeb3413b61cbc78e056c9c9712185262712db1841bb14643af6a").Return(nil, errors.New("failed to get transaction"))
			},
			req: models.SwapIn{
				SwapID:        testSwapId,
				RefundAddress: validRefundAddress,
				// Don't set LockTxID to trigger backend lookup
			},
			wantErr: true,                                      // Still expecting error because GetTxFromTxID fails
			err:     errors.New("failed to build refund PSBT"), // Expected error from PSBTBuilder
		},
		{
			name: "High fee rate",
			setup: func() {
				bitcoinClient.EXPECT().GetRecommendedFees(ctx, bitcoin.HalfHourFee).Return(int64(250), nil)
			},
			req: models.SwapIn{
				SwapID:        testSwapId,
				RefundAddress: validRefundAddress,
				LockTxID:      "some-tx-id",
			},
			wantErr: true,
			err:     errors.New("recommended fee rate is too high"),
		},
		// NOTE: More comprehensive tests with actual PSBT building would need proper mocking of PSBTBuilder
		// For now, these basic tests verify the main error paths
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
