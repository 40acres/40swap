package swaps

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestClient_GetConfiguration(t *testing.T) {
	tests := []struct {
		name              string
		serverResponse    map[string]interface{}
		serverStatusCode  int
		expectedNetwork   lightning.Network
		expectedFee       string
		expectedMinAmount string
		expectedMaxAmount string
		expectError       bool
		expectedErrorMsg  string
	}{
		{
			name: "bitcoin network maps to mainnet correctly",
			serverResponse: map[string]interface{}{
				"bitcoinNetwork": "bitcoin",
				"feePercentage":  0.5,
				"minimumAmount":  0.001,
				"maximumAmount":  1.0,
			},
			serverStatusCode:  200,
			expectedNetwork:   lightning.Mainnet,
			expectedFee:       "0.5",
			expectedMinAmount: "0.001",
			expectedMaxAmount: "1",
			expectError:       false,
		},
		{
			name: "mainnet network preserved for backward compatibility",
			serverResponse: map[string]interface{}{
				"bitcoinNetwork": "mainnet",
				"feePercentage":  1.0,
				"minimumAmount":  0.002,
				"maximumAmount":  2.0,
			},
			serverStatusCode:  200,
			expectedNetwork:   lightning.Mainnet,
			expectedFee:       "1",
			expectedMinAmount: "0.002",
			expectedMaxAmount: "2",
			expectError:       false,
		},
		{
			name: "regtest network mapped correctly",
			serverResponse: map[string]interface{}{
				"bitcoinNetwork": "regtest",
				"feePercentage":  0.1,
				"minimumAmount":  0.0001,
				"maximumAmount":  0.1,
			},
			serverStatusCode:  200,
			expectedNetwork:   lightning.Regtest,
			expectedFee:       "0.1",
			expectedMinAmount: "0.0001",
			expectedMaxAmount: "0.1",
			expectError:       false,
		},
		{
			name: "testnet network mapped correctly",
			serverResponse: map[string]interface{}{
				"bitcoinNetwork": "testnet",
				"feePercentage":  0.25,
				"minimumAmount":  0.005,
				"maximumAmount":  0.5,
			},
			serverStatusCode:  200,
			expectedNetwork:   lightning.Testnet,
			expectedFee:       "0.25",
			expectedMinAmount: "0.005",
			expectedMaxAmount: "0.5",
			expectError:       false,
		},
		{
			name: "unsupported network returns error",
			serverResponse: map[string]interface{}{
				"bitcoinNetwork": "liquidv1",
				"feePercentage":  0.5,
				"minimumAmount":  0.001,
				"maximumAmount":  1.0,
			},
			serverStatusCode: 200,
			expectError:      true,
			expectedErrorMsg: "failed to map network from server response: unsupported network: liquidv1",
		},
		{
			name:             "server error returns error",
			serverResponse:   nil,
			serverStatusCode: 500,
			expectError:      true,
			expectedErrorMsg: "failed to get swap: 500",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock server
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Verify the request path
				assert.True(t, strings.HasSuffix(r.URL.Path, "/api/configuration"))

				w.WriteHeader(tt.serverStatusCode)

				if tt.serverResponse != nil {
					jsonResponse, err := json.Marshal(tt.serverResponse)
					require.NoError(t, err)
					w.Header().Set("Content-Type", "application/json")
					_, err = w.Write(jsonResponse)
					require.NoError(t, err)
				} else if tt.serverStatusCode >= 400 {
					errorResponse := map[string]string{"error": "Server error"}
					jsonResponse, err := json.Marshal(errorResponse)
					require.NoError(t, err)
					w.Header().Set("Content-Type", "application/json")
					_, err = w.Write(jsonResponse)
					require.NoError(t, err)
				}
			}))
			defer server.Close()

			// Create client pointing to mock server
			client, err := NewClient(server.URL)
			require.NoError(t, err)

			// Call GetConfiguration
			ctx := context.Background()
			config, err := client.GetConfiguration(ctx)

			if tt.expectError {
				require.Error(t, err)
				if tt.expectedErrorMsg != "" {
					assert.Contains(t, err.Error(), tt.expectedErrorMsg)
				}
				assert.Nil(t, config)
			} else {
				require.NoError(t, err)
				require.NotNil(t, config)

				// Verify network mapping worked correctly
				assert.Equal(t, tt.expectedNetwork, config.BitcoinNetwork)

				// Verify other fields are preserved
				assert.Equal(t, tt.expectedFee, config.FeePercentage.String())
				assert.Equal(t, tt.expectedMinAmount, config.MinimumAmount.String())
				assert.Equal(t, tt.expectedMaxAmount, config.MaximumAmount.String())
			}
		})
	}
}
