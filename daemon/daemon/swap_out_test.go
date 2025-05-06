package daemon

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	"github.com/lightningnetwork/lnd/lntypes"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

const (
	preimageHex     = "0eb3946ca75520d314068a3f41eb88bec2d1cd8f73f76a77adc578a7cd141c5e"
	validPrivateKey = "bde48e15ae57a00bbf7db477f007061619d7177fd50387d65bcb0f5884c2dc4b"
	validPsbt       = "cHNidP8BAFICAAAAAUTUQqhi4jZ+IYm4I2z9SXwcM4fTFsTg5FmkG10jirupAQAAAAD9////Ac8IAwAAAAAAFgAUfA20aAzorvbl9UnLmcHIbLQKEhYrAQAAAAEBK1gJAwAAAAAAIgAgKlsk+PAa0gJOclmBE+EoInvLFv0ODlOqT6Sqoz6+LQABBWmCASCHY6kUkO16DsaBr8sYpei09eaYcY2634WIIQIbyEJ+n1u1sEnahSXSbWKvnIRFJfKH3HxGYjRWJQ0Jbmd1AisBsXUhA5a4mglS1cVIS9NkYK2gOfwCKP8Qit+3/LajkZ4lMX/faKwAAA=="
)

func TestSwapMonitor_ClaimSwapOut(t *testing.T) {
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
	preimage, err := lntypes.MakePreimageFromStr(preimageHex)
	require.NoError(t, err)

	type args struct {
		ctx  context.Context
		swap *models.SwapOut
	}
	tests := []struct {
		name    string
		setup   func() *SwapMonitor
		args    args
		want    string
		wantErr bool
		err     error
	}{
		{
			name: "error getting claim PSBT",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(nil, errors.New("error getting psbt"))

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				swap: &models.SwapOut{
					SwapID:             "swap_id",
					DestinationAddress: "",
				},
			},
			want:    "",
			wantErr: true,
			err:     errors.New("error getting psbt"),
		},
		{
			name: "bad psbt returned",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(&swaps.GetClaimPSBTResponse{
					PSBT: "bad",
				}, nil)

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				swap: &models.SwapOut{
					SwapID:             "swap_id",
					DestinationAddress: "",
				},
			},
			want:    "",
			wantErr: true,
			err:     errors.New("failed to parse PSBT: unexpected EOF"),
		},
		{
			name: "error decoding key",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(&swaps.GetClaimPSBTResponse{
					PSBT: validPsbt, // valid PSBT
				}, nil)

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				swap: &models.SwapOut{
					SwapID:             "swap_id",
					DestinationAddress: "",
					ClaimPrivateKey:    "bad", // Invalid private key
				},
			},
			want:    "",
			wantErr: true,
			err:     errors.New("failed to decode claim private key"),
		},
		{
			name: "error signing psbt",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(&swaps.GetClaimPSBTResponse{
					PSBT: validPsbt, // valid PSBT
				}, nil)

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				swap: &models.SwapOut{
					SwapID:             "swap_id",
					DestinationAddress: "",
					PreImage:           &lntypes.Preimage{},
					ClaimPrivateKey:    validPrivateKey, // Valid private key
				},
			},
			want:    "",
			wantErr: true,
			err:     errors.New("failed to process PSBT"),
		},
		{
			name: "error posting tx",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(&swaps.GetClaimPSBTResponse{
					PSBT: validPsbt, // valid PSBT
				}, nil)
				swapClient.EXPECT().PostClaim(ctx, gomock.Any(), gomock.Any()).Return(errors.New("failed to post transaction"))

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				swap: &models.SwapOut{
					SwapID:             "swap_id",
					DestinationAddress: "",
					PreImage:           &preimage,
					ClaimPrivateKey:    validPrivateKey, // Valid private key
				},
			},
			want:    "",
			wantErr: true,
			err:     errors.New("failed to post transaction"),
		},
		{
			name: "valid case",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(&swaps.GetClaimPSBTResponse{
					PSBT: validPsbt, // valid PSBT
				}, nil)
				swapClient.EXPECT().PostClaim(ctx, gomock.Any(), gomock.Any()).Return(nil)

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				swap: &models.SwapOut{
					SwapID:             "swap_id",
					DestinationAddress: "",
					PreImage:           &preimage,
					ClaimPrivateKey:    validPrivateKey, // Valid private key
				},
			},
			want:    "612be979a36bd4683f16ada19768dbdcd590e2bba93dc0134c86b0b509ff09d3",
			wantErr: false,
			err:     nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			swapMonitor := tt.setup()
			got, err := swapMonitor.ClaimSwapOut(tt.args.ctx, tt.args.swap)
			if (err != nil) != tt.wantErr {
				t.Errorf("SwapMonitor.ClaimSwapOut() error = %v, wantErr %v", err, tt.wantErr)

				return
			}
			if tt.wantErr {
				require.Contains(t, err.Error(), tt.err.Error())
			}
			if got != tt.want {
				t.Errorf("SwapMonitor.ClaimSwapOut() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSwapMonitor_MonitorSwapOut(t *testing.T) {
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

	preimage, err := lntypes.MakePreimageFromStr(preimageHex)
	require.NoError(t, err)

	type args struct {
		ctx         context.Context
		currentSwap models.SwapOut
	}
	tests := []struct {
		name    string
		setup   func() *SwapMonitor
		args    args
		wantErr bool
		err     error
	}{
		{
			name: "get swap not found",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetSwapOut(ctx, gomock.Any()).Return(nil, swaps.ErrSwapNotFound)
				repository.EXPECT().SaveSwapOut(ctx, gomock.Any()).Return(nil)

				return &swapMonitor
			},
			args: args{
				ctx:         ctx,
				currentSwap: models.SwapOut{},
			},
			wantErr: false,
			err:     swaps.ErrSwapNotFound,
		},
		{
			name: "get swap not found fail saving",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetSwapOut(ctx, gomock.Any()).Return(nil, swaps.ErrSwapNotFound)
				repository.EXPECT().SaveSwapOut(ctx, gomock.Any()).Return(errors.New("error saving swap out"))

				return &swapMonitor
			},
			args: args{
				ctx:         ctx,
				currentSwap: models.SwapOut{},
			},
			wantErr: true,
			err:     errors.New("failed to save swap out: error saving swap out"),
		},
		{
			name: "get swap failed",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetSwapOut(ctx, gomock.Any()).Return(nil, errors.New("error getting swap out"))

				return &swapMonitor
			},
			args: args{
				ctx:         ctx,
				currentSwap: models.SwapOut{},
			},
			wantErr: true,
			err:     errors.New("failed to get swap out: error getting swap out"),
		},
		{
			name: "contract funded error",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetSwapOut(ctx, gomock.Any()).Return(&swaps.SwapOutResponse{
					SwapId: "swap_id",
					Status: models.StatusContractFunded,
				}, nil)
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(&swaps.GetClaimPSBTResponse{}, errors.New("error claiming swap out"))

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				currentSwap: models.SwapOut{
					SwapID: "swap_id",
					Status: models.StatusContractFunded,
				},
			},
			wantErr: true,
			err:     errors.New("failed to claim swap out: error claiming swap out"),
		},
		{
			name: "contract funded error saving db",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetSwapOut(ctx, gomock.Any()).Return(&swaps.SwapOutResponse{
					SwapId: "swap_id",
					Status: models.StatusContractFunded,
				}, nil)
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(&swaps.GetClaimPSBTResponse{
					PSBT: validPsbt, // unfinished psbt
				}, nil)
				swapClient.EXPECT().PostClaim(ctx, gomock.Any(), gomock.Any()).Return(nil)
				repository.EXPECT().SaveSwapOut(ctx, gomock.Any()).Return(errors.New("error saving swap out"))

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				currentSwap: models.SwapOut{
					SwapID:             "swap_id",
					Status:             models.StatusContractFundedUnconfirmed,
					ClaimPrivateKey:    validPrivateKey,
					DestinationAddress: "bc1qv3x5w8g6j5j5j5j5j5j5j5j5j5j5j5j5j5j5",
					PreImage:           &preimage,
				},
			},
			wantErr: true,
			err:     errors.New("failed to save swap out: error saving swap out"),
		},
		{
			name: "valid case",
			setup: func() *SwapMonitor {
				swapClient.EXPECT().GetSwapOut(ctx, gomock.Any()).Return(&swaps.SwapOutResponse{
					SwapId: "swap_id",
					Status: models.StatusContractFunded,
				}, nil)
				swapClient.EXPECT().GetClaimPSBT(ctx, gomock.Any(), gomock.Any()).Return(&swaps.GetClaimPSBTResponse{
					PSBT: validPsbt, // unfinished psbt
				}, nil)
				swapClient.EXPECT().PostClaim(ctx, gomock.Any(), gomock.Any()).Return(nil)
				repository.EXPECT().SaveSwapOut(ctx, gomock.Any()).Return(nil)

				return &swapMonitor
			},
			args: args{
				ctx: ctx,
				currentSwap: models.SwapOut{
					SwapID:             "swap_id",
					Status:             models.StatusContractFundedUnconfirmed,
					ClaimPrivateKey:    validPrivateKey,
					DestinationAddress: "bc1qv3x5w8g6j5j5j5j5j5j5j5j5j5j5j5j5j5j5",
					PreImage:           &preimage,
				},
			},
			wantErr: false,
			err:     nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			swapMonitor := tt.setup()
			err := swapMonitor.MonitorSwapOut(tt.args.ctx, &tt.args.currentSwap)
			if (err != nil) != tt.wantErr {
				t.Errorf("SwapMonitor.MonitorSwapOut() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				require.Equal(t, tt.err.Error(), err.Error())
			}
		})
	}
}
