package lnd

import (
	"context"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/40acres/40swap/daemon/lightning"
	"github.com/Elenpay/liquidator/lndconnect"
	"github.com/lightningnetwork/lnd/lnrpc"
	"github.com/lightningnetwork/lnd/lnrpc/invoicesrpc"
	"github.com/lightningnetwork/lnd/lnrpc/routerrpc"
	"github.com/lightningnetwork/lnd/macaroons"
	"github.com/shopspring/decimal"
	log "github.com/sirupsen/logrus"
	"github.com/spf13/afero"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/status"
	"gopkg.in/macaroon.v2"
)

type Client struct {
	routerClient    routerrpc.RouterClient
	lndClient       lnrpc.LightningClient
	stateClient     lnrpc.StateClient
	invoicesClient  invoicesrpc.InvoicesClient
	closeConnection func()
}

type Option func(*Options)

func WithLndEndpoint(endpoint string) Option {
	return func(o *Options) {
		o.lndEndpoint = endpoint
	}
}

func WithLNDConnectURI(uri string) Option {
	return func(o *Options) {
		o.lndConnectUri = uri
	}
}

func WithMacaroonFilePath(path string) Option {
	return func(o *Options) {
		o.macaroonFilePath = path
	}
}

func WithTLSCertFilePath(path string) Option {
	return func(o *Options) {
		o.tlsCertFilePath = path
	}
}

func WithNetwork(network Network) Option {
	return func(o *Options) {
		o.network = network
	}
}

type Options struct {
	lndEndpoint      string
	macaroonFilePath string
	tlsCertFilePath  string
	network          Network
	// Lndconnect is mutually exclusive with LndEndpoint, MacaroonFilePath and TLSCertFilePath
	lndConnectUri string
	fs            afero.Fs // Add afero file system for mocking
}

type Network string

var (
	Mainnet Network = "mainnet"
	Regtest Network = "regtest"
	Testnet Network = "testnet"
)

var ErrMutuallyExclusiveOptions = errors.New("LNDConnect is mutually exclusive with LndEndpoint, MacaroonFilePath and TLSCertFilePath")

func NewClient(ctx context.Context, opts ...Option) (*Client, error) {
	// Default options
	options := Options{
		fs: afero.NewOsFs(), // Default to OS file system
	}

	// Apply options
	for _, opt := range opts {
		opt(&options)
	}

	// It's mutually exclusive to use LNDConnect or the other options (LndEndpoint, MacaroonFilePath, TLSCertFilePath)
	if options.lndConnectUri != "" && (options.lndEndpoint != "" || options.macaroonFilePath != "" || options.tlsCertFilePath != "") {
		return nil, ErrMutuallyExclusiveOptions
	}

	var macaroonFileBytes []byte
	var err error
	var creds credentials.TransportCredentials

	if options.lndConnectUri != "" {
		lndConnectParams, err := lndconnect.Parse(options.lndConnectUri)
		if err != nil {
			return nil, err
		}

		// Macaroon
		macaroonFileBytes, err = hex.DecodeString(lndConnectParams.Macaroon)
		if err != nil {
			return nil, fmt.Errorf("failed decoding macaroon: %w", err)
		}

		// TLS cert
		creds, err = credentialsFromCertString(lndConnectParams.Cert)
		if err != nil {
			return nil, err
		}

		// Endpoint (host:port)
		options.lndEndpoint = lndConnectParams.Host + ":" + lndConnectParams.Port
	} else {
		options.macaroonFilePath = strings.Replace(options.macaroonFilePath, "{Network}", string(options.network), -1)

		// Read macaroon file from path

		macaroonFileBytes, err = afero.ReadFile(options.fs, options.macaroonFilePath)
		if err != nil {
			return nil, fmt.Errorf("failed reading macaroon file: %w", err)
		}

		// Read TLS cert file from path
		certBytes, err := afero.ReadFile(options.fs, options.tlsCertFilePath)
		if err != nil {
			return nil, fmt.Errorf("failed reading TLS cert file: %w", err)
		}
		creds = credentials.NewClientTLSFromCert(loadCertPool(certBytes), "")
		if err != nil {
			return nil, fmt.Errorf("failed creating TLS credentials: %w", err)
		}
	}

	mac := &macaroon.Macaroon{}
	err = mac.UnmarshalBinary(macaroonFileBytes)
	if err != nil {
		return nil, fmt.Errorf("failed unmarshalling macaroon: %w", err)
	}

	macCred, err := macaroons.NewMacaroonCredential(mac)
	if err != nil {
		return nil, fmt.Errorf("failed creating macaroon credentials: %w", err)
	}

	conn, err := grpc.NewClient(options.lndEndpoint, grpc.WithTransportCredentials(creds), grpc.WithPerRPCCredentials(macCred))
	if err != nil {
		return nil, fmt.Errorf("failed connecting to LND node: %w", err)
	}

	routerClient, lndClient, stateClient, invoicesClient := createInnerLNDClients(conn)

	client := &Client{
		routerClient:   *routerClient,
		lndClient:      *lndClient,
		stateClient:    *stateClient,
		invoicesClient: *invoicesClient,
		closeConnection: func() {
			err := conn.Close()
			if err != nil {
				log.WithError(err).Error("error closing connection")
			}
		},
	}

	return client, nil
}

// credentialsFromCertString generates gRPC credentials from a base64 encoded DER certificate
func credentialsFromCertString(certDer string) (credentials.TransportCredentials, error) {
	base64decoded, err := base64.RawURLEncoding.DecodeString(certDer)
	if err != nil {
		log.Errorf("Failed to decode base64 string")

		return nil, fmt.Errorf("failed to decode base64 string")
	}
	cp := x509.NewCertPool()
	cert, err := x509.ParseCertificate(base64decoded)
	if err != nil {
		log.Errorf("Failed to parse certificate")

		return nil, fmt.Errorf("failed to parse certificate")
	}
	cp.AddCert(cert)

	creds := credentials.NewClientTLSFromCert(cp, "")

	return creds, nil
}

// PayInvoice uses the lnd node to pay the invoice provided by the paymentRequest
func (dc *Client) PayInvoice(ctx context.Context, paymentRequest string) error {
	// Decode payment request
	payReq, err := dc.lndClient.DecodePayReq(ctx, &lnrpc.PayReqString{PayReq: paymentRequest})
	if err != nil {
		err = fmt.Errorf("error decoding payment request: %w", err)

		return err
	}
	// 0.5% is a good max value for Lightning Network
	feeLimitSat := int64(float64(payReq.NumSatoshis) * 0.005)

	sendRequest := &routerrpc.SendPaymentRequest{
		PaymentRequest: paymentRequest,
		FeeLimitSat:    feeLimitSat,
		TimeoutSeconds: int32((time.Minute * 5).Seconds()),
	}

	stream, err := dc.routerClient.SendPaymentV2(ctx, sendRequest)
	if err != nil {
		return err
	}

	// We ignore the stream, we will monitor in the next step
	// if we remove this line, the payment will fail with "payment not initiated"
	// Please read issue: https://github.com/lightningnetwork/lnd/issues/5035#issuecomment-780711315
	_, err = stream.Recv()
	if err != nil {
		return err
	}

	// We ignore the stream, we will monitor in the next step
	err = stream.CloseSend()
	if err != nil {
		log.WithError(err).Error("error closing stream for SendPaymentV2")
	}

	return nil
}

// MonitorPaymentRequest monitors a payment to know its status
func (dc *Client) MonitorPaymentRequest(ctx context.Context, paymentHash string) (lightning.Preimage, lightning.NetworkFeeSats, error) {
	hash, err := hex.DecodeString(paymentHash)
	if err != nil {
		return "", 0, err
	}

	monitorRequest := &routerrpc.TrackPaymentRequest{
		PaymentHash: hash,
	}

	stream, err := dc.routerClient.TrackPaymentV2(ctx, monitorRequest)
	if err != nil {
		return "", 0, err
	}

	defer func() {
		err := stream.CloseSend()
		if err != nil {
			log.WithError(err).Error("error closing stream for SubscribeSingleInvoice")
		}
	}()

	for {
		if ctx.Err() != nil {
			return "", 0, ctx.Err()
		}

		invoice, err := stream.Recv()
		if err != nil {
			return "", 0, err
		}

		log.WithField("invoice", invoice).Debug("New TrackPaymentV2 event")
		switch invoice.Status {
		case lnrpc.Payment_SUCCEEDED:
			return invoice.PaymentPreimage, invoice.FeeSat, nil
		case lnrpc.Payment_FAILED:
			err := fmt.Errorf("payment failed: %w", errors.New(invoice.FailureReason.String()))

			return "", 0, err
		}
	}
}

func checkContextDeadline(err error, prefix string) error {
	if status.Code(err) == codes.DeadlineExceeded {
		return os.ErrDeadlineExceeded
	}

	return fmt.Errorf("%s: %w", prefix, err)
}

func (dc *Client) MonitorPaymentReception(ctx context.Context, rhash []byte) (lightning.Preimage, error) {
	invoiceSubscription := &invoicesrpc.SubscribeSingleInvoiceRequest{
		RHash: rhash,
	}
	stream, err := dc.invoicesClient.SubscribeSingleInvoice(ctx, invoiceSubscription)
	if err != nil {
		return "", checkContextDeadline(err, "subscribing to invoice")
	}

	defer func() {
		if err = stream.CloseSend(); err != nil {
			log.WithError(err).Error("error closing stream for SubscribeSingleInvoice")
		}
	}()

	for {
		invoice, err := stream.Recv()
		if err != nil {
			return "", checkContextDeadline(err, "stream recv")
		}

		log.WithField("invoice", invoice).Debug("New SubscribeSingleInvoice event")
		switch invoice.State {
		case lnrpc.Invoice_SETTLED:
			return hex.EncodeToString(invoice.RPreimage), nil
		case lnrpc.Invoice_CANCELED:
			return "", lightning.ErrInvoiceCanceled
		}
	}
}

func (dc *Client) GenerateInvoice(ctx context.Context, amountSats decimal.Decimal, expiry time.Duration, memo string) (paymentRequest string, rhash []byte, e error) {
	invoiceReq := &lnrpc.Invoice{
		Value:           amountSats.IntPart(),
		Memo:            memo,
		Expiry:          int64(expiry.Seconds()),
		CltvExpiry:      lightning.DefaultCltvExpiry, // Blocks until the invoice expires
		FallbackAddr:    "",                          // Optional fallback Bitcoin address
		DescriptionHash: nil,                         // Optional description hash
	}

	res, err := dc.lndClient.AddInvoice(ctx, invoiceReq)
	if err != nil {
		return "", nil, err
	}

	return res.PaymentRequest, res.RHash, nil
}

// CloseConnection closes the connection with the lnd node
func (dc *Client) CloseConnection() {
	dc.closeConnection()
}

// Generates the gRPC router client
func createInnerLNDClients(conn *grpc.ClientConn) (*routerrpc.RouterClient, *lnrpc.LightningClient, *lnrpc.StateClient, *invoicesrpc.InvoicesClient) {
	lndClient := lnrpc.NewLightningClient(conn)
	routerClient := routerrpc.NewRouterClient(conn)
	stateClient := lnrpc.NewStateClient(conn)
	invoicesClient := invoicesrpc.NewInvoicesClient(conn)

	return &routerClient, &lndClient, &stateClient, &invoicesClient
}

// Helper function to load a certificate pool from cert bytes
func loadCertPool(certBytes []byte) *x509.CertPool {
	cp := x509.NewCertPool()
	cp.AppendCertsFromPEM(certBytes)

	return cp
}
