package rpc

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

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
			name: "Valid request with provided invoic",
			setup: func() *Server {
				amtDecimal := decimal.NewFromUint64(amt)
				defaultExpiry := 3 * 24 * 60 * 60 * time.Second
				lightningClient.EXPECT().GenerateInvoice(ctx, amtDecimal, defaultExpiry, "").Return(invoice, []byte{}, nil)
				swapClient.EXPECT().CreateSwapIn(ctx, gomock.Any()).Return(&swaps.SwapInResponse{
					SwapId:             swapId,
					InputAmount:        0.00200105,
					OutputAmount:       0.00200000,
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
				swapClient.EXPECT().CreateSwapIn(ctx, gomock.Any()).Return(&swaps.SwapInResponse{
					SwapId:             swapId,
					InputAmount:        0.00200105,
					OutputAmount:       0.00200000,
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
