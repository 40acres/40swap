package daemon

import (
	"context"
	"testing"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func Test_MonitorSwapIns(t *testing.T) {
	ctrl := gomock.NewController(t)
	t.Cleanup(ctrl.Finish)

	repository := rpc.NewMockRepository(ctrl)
	swapClient := swaps.NewMockClientInterface(ctrl)
	now := func() time.Time {
		return time.Date(2023, 10, 1, 0, 0, 0, 0, time.UTC)
	}
	ctx := context.Background()
	swapMonitor := SwapMonitor{
		repository: repository,
		swapClient: swapClient,
		now:        now,
	}

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
				swapClient.EXPECT().GetSwapIn(ctx, "abc").Return(nil, swaps.ErrSwapNotFound)
			},
			req: models.SwapIn{
				SwapID: "abc",
			},
			want: &models.SwapIn{
				SwapID:  "abc",
				Outcome: &outcomeFailed,
			},
		},
		{
			name: "Swap didn't changed status",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, "abc").Return(&swaps.SwapInResponse{
					Status: models.StatusCreated,
				}, nil)
			},
			req: models.SwapIn{
				SwapID: "abc",
				Status: models.StatusCreated,
			},
		},
		{
			name: "Swap in changed status",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, "abc").Return(&swaps.SwapInResponse{
					Status: models.StatusContractFunded,
				}, nil)
			},
			req: models.SwapIn{
				SwapID: "abc",
				Status: models.StatusCreated,
			},
			want: &models.SwapIn{
				SwapID: "abc",
				Status: models.StatusContractFunded,
			},
		},
		{
			name: "Swap in refunded",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, "abc").Return(&swaps.SwapInResponse{
					Status:  models.StatusDone,
					Outcome: outcomeRefunded.String(),
				}, nil)
			},
			req: models.SwapIn{
				SwapID: "abc",
				Status: models.StatusContractRefundedUnconfirmed,
			},
			want: &models.SwapIn{
				SwapID:  "abc",
				Status:  models.StatusDone,
				Outcome: &outcomeRefunded,
			},
		},
		{
			name: "Swap in expired",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, "abc").Return(&swaps.SwapInResponse{
					Status:  models.StatusDone,
					Outcome: outcomeExpired.String(),
				}, nil)
			},
			req: models.SwapIn{
				SwapID: "abc",
				Status: models.StatusContractRefundedUnconfirmed,
			},
			want: &models.SwapIn{
				SwapID:  "abc",
				Status:  models.StatusDone,
				Outcome: &outcomeExpired,
			},
		},
		{
			name: "Swap in successful",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, "abc").Return(&swaps.SwapInResponse{
					Status:  models.StatusDone,
					Outcome: outcomeSuccess.String(),
				}, nil)
			},
			req: models.SwapIn{
				SwapID: "abc",
				Status: models.StatusContractRefundedUnconfirmed,
			},
			want: &models.SwapIn{
				SwapID:  "abc",
				Status:  models.StatusDone,
				Outcome: &outcomeSuccess,
			},
		},
		{
			name: "Swap in contract expired, initiatiig refund",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, "abc").Return(&swaps.SwapInResponse{
					Status: models.StatusContractExpired,
				}, nil)
				// TODO: Test that the refund is initiated
			},
			req: models.SwapIn{
				SwapID: "abc",
				Status: models.StatusContractFunded,
			},
			want: &models.SwapIn{
				SwapID:            "abc",
				Status:            models.StatusContractExpired,
				RefundRequestedAt: now(),
			},
		},
		{
			name: "Swap in refund in progress",
			setup: func() {
				swapClient.EXPECT().GetSwapIn(ctx, "abc").Return(&swaps.SwapInResponse{
					Status: models.StatusContractExpired,
				}, nil)
			},
			req: models.SwapIn{
				SwapID:            "abc",
				Status:            models.StatusContractExpired,
				RefundRequestedAt: now(),
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()
			if tt.want != nil {
				repository.EXPECT().SaveSwapIn(tt.want).Return(nil)
			}

			err := swapMonitor.MonitorSwapIn(ctx, tt.req)
			require.NoError(t, err)
		})
	}
}
