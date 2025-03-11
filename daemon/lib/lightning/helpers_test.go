package lightning

import (
	"fmt"
	"testing"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/stretchr/testify/assert"
)

func TestParsePubKey(t *testing.T) {
	type args struct {
		pubKeyStr string
	}
	tests := []struct {
		name    string
		args    args
		want    *btcec.PublicKey
		wantErr bool
	}{
		{
			name: "Invalid public key (wrong length))",
			args: args{
				pubKeyStr: "02c5544a361bfe1f025f29e83d092e4c83feaf5f750af59a0b1ff0591ebc0beedcX",
			},
			want:    nil,
			wantErr: true,
		},
		{
			name: "Invalid public key (wrong header))",
			args: args{
				pubKeyStr: "04c5544a361bfe1f025f29e83d092e4c83feaf5f750af59a0b1ff0591ebc0beedc",
			},
			want:    nil,
			wantErr: true,
		},
		{
			name: "Valid public key",
			args: args{
				pubKeyStr: "02c5544a361bfe1f025f29e83d092e4c83feaf5f750af59a0b1ff0591ebc0beedc",
			},
			wantErr: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ParsePubKey(tt.args.pubKeyStr)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParsePubKey() error = %v, wantErr %v", err, tt.wantErr)

				return
			}
		})
	}
}

func TestValidatePreimage(t *testing.T) {
	validPreimage := "01da5d7d740ac57fcdc15fd47b9c8c0c3ba3b7b762d126df10fab4ad95d98400"
	validPaymentHash := "d78a8ba8b6251027f37fd6febff0315f2d45be831ba313fb23c6e03a2abe3ca5"

	type args struct {
		preimage    string
		paymentHash string
	}
	tests := []struct {
		name string
		args args
		want error
	}{
		{
			name: "Invalid preimage (empty)",
			args: args{
				preimage:    "",
				paymentHash: "123",
			},
			want: fmt.Errorf("preimage is empty"),
		},
		{
			name: "Invalid payment hash (empty)",
			args: args{
				preimage:    "123",
				paymentHash: "",
			},
			want: fmt.Errorf("payment hash is empty"),
		},
		{
			name: "Invalid preimage (not hex)",
			args: args{
				preimage:    "not hex",
				paymentHash: validPaymentHash,
			},
			want: fmt.Errorf("preimage is not a valid hex string"),
		},
		{
			name: "Invalid preimage (does not match payment hash)",
			args: args{
				preimage:    "5dc1f0d161a089fa7fb1e864f64b1543a592284614c48346c9de61c59c37edc1",
				paymentHash: validPaymentHash,
			},
			want: fmt.Errorf("preimage does not match bolt11 payment hash"),
		},
		{
			name: "Valid preimage",
			args: args{
				preimage:    validPreimage,
				paymentHash: validPaymentHash,
			},
			want: nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePreimage(tt.args.preimage, tt.args.paymentHash)
			assert.Equal(t, tt.want, err)
		})
	}
}
