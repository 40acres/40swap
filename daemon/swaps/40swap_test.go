package swaps

import (
	"testing"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func Test_mapServerNetworkToDaemonNetwork(t *testing.T) {
	tests := []struct {
		name           string
		serverNetwork  string
		expectedResult lightning.Network
		expectError    bool
	}{
		{
			name:           "bitcoin maps to mainnet",
			serverNetwork:  "bitcoin",
			expectedResult: lightning.Mainnet,
			expectError:    false,
		},
		{
			name:           "mainnet maps to mainnet (backward compatibility)",
			serverNetwork:  "mainnet",
			expectedResult: lightning.Mainnet,
			expectError:    false,
		},
		{
			name:           "regtest maps to regtest",
			serverNetwork:  "regtest",
			expectedResult: lightning.Regtest,
			expectError:    false,
		},
		{
			name:           "testnet maps to testnet",
			serverNetwork:  "testnet",
			expectedResult: lightning.Testnet,
			expectError:    false,
		},
		{
			name:           "unsupported network returns error",
			serverNetwork:  "liquidv1",
			expectedResult: "",
			expectError:    true,
		},
		{
			name:           "empty string returns error",
			serverNetwork:  "",
			expectedResult: "",
			expectError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := mapServerNetworkToDaemonNetwork(tt.serverNetwork)

			if tt.expectError {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "unsupported network")
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expectedResult, result)
			}
		})
	}
}
