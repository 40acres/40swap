package lightning

import (
	"testing"

	"github.com/btcsuite/btcd/btcec/v2"
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
