package bitcoin

import (
	"encoding/base64"
	"errors"
	"testing"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/btcsuite/btcd/wire"
	"github.com/stretchr/testify/require"
)

func TestBuildPSBT(t *testing.T) {
	type args struct {
		spendingTxHex *wire.MsgTx
		redeemScript  string
		outpoint      string
		outputAddress string
		feeRate       int64
		minRelayFee   int64
		network       lightning.Network
	}
	tests := []struct {
		name    string
		args    args
		want    string
		wantErr bool
		err     error
	}{
		{
			name: "invalid outpoint",
			args: args{
				outpoint: "invalid_outpoint",
			},
			wantErr: true,
			err:     errors.New("failed to parse outpoint:"),
		},
		{
			name: "invalid destination address",
			args: args{
				outpoint:      "cc73da238f66f2eef0b937038e771a04011bd14d12aed06e64b05d267cec7ee5:0",
				outputAddress: "invalid_address",
			},
			wantErr: true,
			err:     errors.New("failed to decode destination address:"),
		},
		{
			name: "invalid outpoint index",
			args: args{
				spendingTxHex: &wire.MsgTx{},
				outpoint:      "cc73da238f66f2eef0b937038e771a04011bd14d12aed06e64b05d267cec7ee5:0",
				outputAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
				network:       lightning.Mainnet,
			},
			wantErr: true,
			err:     errors.New("invalid outpoint index"),
		},
		{
			name: "failed to decode redeem script",
			args: args{
				spendingTxHex: &wire.MsgTx{
					TxOut: []*wire.TxOut{
						{
							Value:    50000000,
							PkScript: []byte("this is the spending output"),
						},
					},
				},
				redeemScript:  "invalid_redeem_script",
				outpoint:      "cc73da238f66f2eef0b937038e771a04011bd14d12aed06e64b05d267cec7ee5:0",
				outputAddress: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
				network:       lightning.Mainnet,
			},
			wantErr: true,
			err:     errors.New("failed to decode lock script:"),
		},
		{
			name: "valid case",
			args: args{
				spendingTxHex: func() *wire.MsgTx {
					pkScript, err := base64.StdEncoding.DecodeString("ACD0eSVnAdPXC8uHrdVwg1v+IEHugVisyVW5dk3PlyfdxQ==")
					require.NoError(t, err)

					return &wire.MsgTx{
						TxOut: []*wire.TxOut{
							{
								Value:    2949776895,
								PkScript: []byte("this is the change output"),
							},
							{
								Value:    50000000,
								PkScript: pkScript,
							},
						},
					}
				}(),
				redeemScript: "a914dc26c0d3f0ddfc60443297ad32aa11f46e6f7e7487632102b211173518f8817c" +
					"61e40a238a94ac5c02e474dae5c05c76aec1c66299b12e0b67024702b1752102e44f10a620d39d" +
					"f460c6368fbb96fd2315cc77c37e371b5145146b68669c1e7f68ac",
				outpoint:      "24fa4350789d24a63c943a53976ece7c68662ce8185599f977d43886f4c84b12:1",
				outputAddress: "bcrt1qeuk89y2fuq3k6t936xwnzvv6zvzp2k2cnyfjpp",
				feeRate:       1,
				minRelayFee:   1000,
				network:       lightning.Regtest,
			},
			want: "cHNidP8BAFICAAAAARJLyPSGONR3+ZlVGOgsZmh8zm6XUzqUPKYknXhQQ/okAQAAAAD9////AZjs+gIA" +
				"AAAAFgAUzyxykUngI20ssdGdMTGaEwQVWVgAAAAAAAEBK4Dw+gIAAAAAIgAg9HklZwHT1wvLh63VcINb/i" +
				"BB7oFYrMlVuXZNz5cn3cUBBWSpFNwmwNPw3fxgRDKXrTKqEfRub350h2MhArIRFzUY+IF8YeQKI4qUrFwC" +
				"5HTa5cBcdq7BxmKZsS4LZwJHArF1IQLkTxCmINOd9GDGNo+7lv0jFcx3w343G1FFFGtoZpwef2isAAA=",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pkt, err := BuildPSBT(tt.args.spendingTxHex, tt.args.redeemScript, tt.args.outpoint, tt.args.outputAddress, tt.args.feeRate, tt.args.minRelayFee, tt.args.network)
			if tt.wantErr {
				require.Error(t, err)
				require.Contains(t, err.Error(), tt.err.Error())

				return
			}
			require.NoError(t, err)
			data, err := pkt.B64Encode()
			require.NoError(t, err)
			require.Equal(t, tt.want, data)
		})
	}
}
