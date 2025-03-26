package lnd

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"testing"

	"github.com/spf13/afero"
	"github.com/stretchr/testify/require"
	"gopkg.in/macaroon.v2"
)

func TestNewClient_WithLndConnectURI(t *testing.T) {
	ctx := context.Background()

	uri := "lndconnect://127.0.0.1:10009?cert=MIICJTCCAcygAwIBAgIQLYfp6m1vP9wFBXOcE-UsaDAKBggqhkjOPQQDAjAxMR8wHQYDVQQKExZsbmQgYXV0b2dlbmVyYXRlZCBjZXJ0MQ4wDAYDVQQDEwVjYXJvbDAeFw0yMzAzMjkxNTM4MjBaFw0yNDA1MjMxNTM4MjBaMDExHzAdBgNVBAoTFmxuZCBhdXRvZ2VuZXJhdGVkIGNlcnQxDjAMBgNVBAMTBWNhcm9sMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcXT4dekJnAiZWd8Pk3FgL1BSFXMRwLGSAlk7Di5hIJnIA1B_o8RWKzlPz7u3Aw5mmWHhN8B2MWMylWlWB2130KOBxTCBwjAOBgNVHQ8BAf8EBAMCAqQwEwYDVR0lBAwwCgYIKwYBBQUHAwEwDwYDVR0TAQH_BAUwAwEB_zAdBgNVHQ4EFgQUDOS-19_0LFGf62WRyaaUSLc3j98wawYDVR0RBGQwYoIFY2Fyb2yCCWxvY2FsaG9zdIIFY2Fyb2yCDnBvbGFyLW4xLWNhcm9sggR1bml4ggp1bml4cGFja2V0ggdidWZjb25uhwR_AAABhxAAAAAAAAAAAAAAAAAAAAABhwSsFQAFMAoGCCqGSM49BAMCA0cAMEQCHxYe59PCXrTtSmGsOjfQo6V-sS8j73cqWOzTQbvgI3gCIQCj7sOxnZWBwilec7t8bBXjwPgX9frv8408JW4QhNFOUg&macaroon=AgEDbG5kAvgBAwoQHsW2NwwWb2yOKFMWQQkUWhIBMBoWCgdhZGRyZXNzEgRyZWFkEgV3cml0ZRoTCgRpbmZvEgRyZWFkEgV3cml0ZRoXCghpbnZvaWNlcxIEcmVhZBIFd3JpdGUaIQoIbWFjYXJvb24SCGdlbmVyYXRlEgRyZWFkEgV3cml0ZRoWCgdtZXNzYWdlEgRyZWFkEgV3cml0ZRoXCghvZmZjaGFpbhIEcmVhZBIFd3JpdGUaFgoHb25jaGFpbhIEcmVhZBIFd3JpdGUaFAoFcGVlcnMSBHJlYWQSBXdyaXRlGhgKBnNpZ25lchIIZ2VuZXJhdGUSBHJlYWQAAAYgjpV-eOw554EPrSXPxDhQuOnnwHmEO47Hu1Uiu6EiMNY"

	client, err := NewClient(ctx, WithLNDConnectURI(uri))
	defer client.CloseConnection()

	require.NoError(t, err)
}

func TestNewClient_WithFSMacaroonAndCert(t *testing.T) {
	ctx := context.Background()

	// Create a memory file system
	memFs := afero.NewMemMapFs()

	// Generate a dummy TLS certificate
	cert := &x509.Certificate{}
	certBytes := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw})
	tlsCertPath := "/tls.cert"
	err := afero.WriteFile(memFs, tlsCertPath, certBytes, 0644)
	require.NoError(t, err)

	// Generate a dummy macaroon
	macaroon, err := macaroon.New([]byte("dummy-id"), []byte("dummy-location"), "dummy-root", macaroon.LatestVersion)
	require.NoError(t, err)
	macaroonBytes, err := macaroon.MarshalBinary()
	require.NoError(t, err)
	macaroonPath := "/admin.macaroon"
	err = afero.WriteFile(memFs, macaroonPath, macaroonBytes, 0644)
	require.NoError(t, err)

	// Create the client using the memory file system
	client, err := NewClient(ctx,
		WithLndEndpoint("localhost:10009"),
		WithTLSCertFilePath(tlsCertPath),
		WithMacaroonFilePath(macaroonPath),
		WithNetwork(Mainnet),
		func(o *Options) { o.FS = memFs },
	)
	defer client.CloseConnection()

	require.NoError(t, err)
}

func TestNewClient_WithInvalidLndConnectURI(t *testing.T) {
	ctx := context.Background()

	_, err := NewClient(ctx, WithLNDConnectURI("invalidURI"))
	require.Error(t, err)
}

func TestNewClient_MutuallyExclusiveLndConnectError(t *testing.T) {
	ctx := context.Background()

	uri := "lndconnect://127.0.0.1:10009?cert=MIICJTCCAcygAwIBAgIQLYfp6m1vP9wFBXOcE-UsaDAKBggqhkjOPQQDAjAxMR8wHQYDVQQKExZsbmQgYXV0b2dlbmVyYXRlZCBjZXJ0MQ4wDAYDVQQDEwVjYXJvbDAeFw0yMzAzMjkxNTM4MjBaFw0yNDA1MjMxNTM4MjBaMDExHzAdBgNVBAoTFmxuZCBhdXRvZ2VuZXJhdGVkIGNlcnQxDjAMBgNVBAMTBWNhcm9sMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcXT4dekJnAiZWd8Pk3FgL1BSFXMRwLGSAlk7Di5hIJnIA1B_o8RWKzlPz7u3Aw5mmWHhN8B2MWMylWlWB2130KOBxTCBwjAOBgNVHQ8BAf8EBAMCAqQwEwYDVR0lBAwwCgYIKwYBBQUHAwEwDwYDVR0TAQH_BAUwAwEB_zAdBgNVHQ4EFgQUDOS-19_0LFGf62WRyaaUSLc3j98wawYDVR0RBGQwYoIFY2Fyb2yCCWxvY2FsaG9zdIIFY2Fyb2yCDnBvbGFyLW4xLWNhcm9sggR1bml4ggp1bml4cGFja2V0ggdidWZjb25uhwR_AAABhxAAAAAAAAAAAAAAAAAAAAABhwSsFQAFMAoGCCqGSM49BAMCA0cAMEQCHxYe59PCXrTtSmGsOjfQo6V-sS8j73cqWOzTQbvgI3gCIQCj7sOxnZWBwilec7t8bBXjwPgX9frv8408JW4QhNFOUg"

	_, err := NewClient(ctx, WithLNDConnectURI(uri), WithLndEndpoint("localhost:10009"))
	require.Error(t, err)
	require.ErrorIs(t, err, ErrMutuallyExclusiveOptions)
}
