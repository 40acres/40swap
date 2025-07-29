package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"strings" // Add this import
	"syscall"
	"time"

	bitcoinutils "github.com/40acres/40swap/daemon/bitcoin"
	"github.com/40acres/40swap/daemon/bitcoin/mempool"
	"github.com/40acres/40swap/daemon/daemon"
	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/lightning/lnd"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
	"github.com/urfave/cli/v3"

	_ "github.com/40acres/40swap/daemon/logging"
	_ "github.com/lib/pq"
)

const indent = "  "

func validatePort(port int64) (uint32, error) {
	if port < 0 || port > 65535 {
		return 0, fmt.Errorf("port number %d is invalid: must be between 0 and 65535", port)
	}

	return uint32(port), nil
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Setup signal handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-sigChan
		log.Info("Received signal, shutting down")
		cancel()

		// Wait for the daemon to shutdown
	}()

	app := &cli.Command{
		Name:  "40swapd",
		Usage: "Manage 40swap daemon and perform swaps",
		Description: `The 40swap daemon supports two database modes:
  1. Embedded: Uses an embedded PostgreSQL database. This is the default mode and requires no additional configuration. You can specify the following parameters:
	   - db-data-path: Path to the database data directory 			
  2. External: Connects to an external PostgreSQL database. In this mode, you must provide the following parameters:
     - db-host: Database host
     - db-user: Database username
     - db-password: Database password
     - db-name: Database name
     - db-port: Database port`,
		Flags: []cli.Flag{
			&cli.StringFlag{
				Name:  "db-host",
				Usage: "Database host",
				Value: "embedded",
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("40SWAPD_DB_HOST")),
			},
			&cli.StringFlag{
				Name:  "db-user",
				Usage: "Database username",
				Value: "40swap",
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("40SWAPD_DB_USER")),
			},
			&cli.StringFlag{
				Name:  "db-password",
				Usage: "Database password",
				Value: "40swap",
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("40SWAPD_DB_PASSWORD")),
			},
			&cli.StringFlag{
				Name:  "db-name",
				Usage: "Database name",
				Value: "40swap",
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("40SWAPD_DB_NAME")),
			},
			&cli.IntFlag{
				Name:  "db-port",
				Usage: "Database port",
				Value: 5433,
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("40SWAPD_DB_PORT")),
			},
			&cli.StringFlag{
				Name:  "db-data-path",
				Usage: "Database path (NOTE: This is only used for embedded databases)",
				Value: "./.data",
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("40SWAPD_DB_DATA_PATH")),
			},
			&cli.BoolFlag{
				Name:  "db-keep-alive",
				Usage: "Keep the database running after the daemon stops for embedded databases",
				Value: false,
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("40SWAPD_DB_KEEP_ALIVE")),
			},
			&cli.StringFlag{
				Name:  "lndconnect",
				Usage: "LND connect URI (NOTE: This is mutually exclusive with tls-cert, macaroon, and lnd-host)",
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("40SWAPD_LNDCONNECT")),
			},
			&grpcPort,
			&serverUrl,
			&tlsCert,
			&macaroon,
			&lndHost,
			&testnet,
			&regtest,
			&cli.IntFlag{
				Name:  "minrelayfee",
				Usage: "Minimum relay fee in satoshis per kB",
				Value: 1000,
			},
			&cli.StringFlag{
				Name:  "mempool-endpoint",
				Usage: "Url to the mempool space API",
				Value: "https://mempool.space/api",
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("MEMPOOL_ENDPOINT")),
			},
			&cli.StringFlag{
				Name:  "mempool-token",
				Usage: "Token for the mempool space API",
				Value: "",
				Sources: cli.NewValueSourceChain(
					cli.EnvVar("MEMPOOL_TOKEN")),
			},
			&cli.BoolFlag{
				Name:    "auto-swap-enabled",
				Usage:   "Enable or disable auto swap out feature",
				Value:   false,
				Sources: cli.NewValueSourceChain(cli.EnvVar("40SWAPD_AUTO_SWAP_ENABLED")),
			},
			&cli.DurationFlag{
				Name:    "auto-swap-interval",
				Usage:   "Interval to check for auto swap out",
				Value:   10 * time.Minute,
				Sources: cli.NewValueSourceChain(cli.EnvVar("40SWAPD_AUTO_SWAP_INTERVAL")),
			},
			&cli.FloatFlag{
				Name:    "auto-swap-target-balance",
				Usage:   "Target outbound liquidity in BTC",
				Value:   1.0,
				Sources: cli.NewValueSourceChain(cli.EnvVar("40SWAPD_AUTO_SWAP_TARGET_BALANCE")),
			},
			&cli.FloatFlag{
				Name:    "auto-swap-backoff-factor",
				Usage:   "Backoff factor to reduce swap size on failure",
				Value:   0.8,
				Sources: cli.NewValueSourceChain(cli.EnvVar("40SWAPD_AUTO_SWAP_BACKOFF_FACTOR")),
			},
			&cli.IntFlag{
				Name:    "auto-swap-max-attempts",
				Usage:   "Maximum attempts per auto swap out",
				Value:   3,
				Sources: cli.NewValueSourceChain(cli.EnvVar("40SWAPD_AUTO_SWAP_MAX_ATTEMPTS")),
			},
			&cli.IntFlag{
				Name:    "auto-swap-routing-fee-limit",
				Usage:   "Routing fee limit in parts per million (ppm)",
				Value:   1000,
				Sources: cli.NewValueSourceChain(cli.EnvVar("40SWAPD_AUTO_SWAP_ROUTING_FEE_LIMIT")),
			},
			&cli.FloatFlag{
				Name:    "auto-swap-min-size",
				Usage:   "Minimum size per auto swap out (BTC)",
				Value:   0.001,
				Sources: cli.NewValueSourceChain(cli.EnvVar("40SWAPD_AUTO_SWAP_MIN_SIZE")),
			},
			&cli.FloatFlag{
				Name:    "auto-swap-max-size",
				Usage:   "Maximum size per auto swap out (BTC)",
				Value:   0.1,
				Sources: cli.NewValueSourceChain(cli.EnvVar("40SWAPD_AUTO_SWAP_MAX_SIZE")),
			},
		},
		Commands: []*cli.Command{
			{
				Name:  "start",
				Usage: "Start the 40swapd daemon",
				Action: func(ctx context.Context, c *cli.Command) error {
					grpcPort, err := validatePort(c.Int("grpc-port"))
					if err != nil {
						return err
					}

					port, err := validatePort(c.Int("db-port"))
					if err != nil {
						return err
					}

					db, closeDb, err := database.New(
						c.String("db-user"),
						c.String("db-password"),
						c.String("db-name"),
						port,
						c.String("db-data-path"),
						c.String("db-host"),
						c.Bool("db-keep-alive"),
					)
					if err != nil {
						return fmt.Errorf("❌ Could not connect to database: %w", err)
					}
					defer func() {
						if err := closeDb(); err != nil {
							log.Errorf("❌ Could not close database: %v", err)
						}
					}()

					dbErr := db.MigrateDatabase()
					if dbErr != nil {
						log.Errorf("❌ Could not migrate database: %v", err)
					}

					// Get the network
					network := rpc.Network_MAINNET
					if c.Bool("regtest") {
						network = rpc.Network_REGTEST
					} else if c.Bool("testnet") {
						network = rpc.Network_TESTNET
					}

					// Create auto swap config from CLI flags
					autoSwapConfig := daemon.NewAutoSwapConfigFromFlags(
						c.Bool("auto-swap-enabled"),
						int(c.Duration("auto-swap-interval").Minutes()),
						c.Float("auto-swap-target-balance"),
						c.Float("auto-swap-backoff-factor"),
						int(c.Int("auto-swap-max-attempts")),
						int(c.Int("auto-swap-routing-fee-limit")),
						c.Float("auto-swap-min-size"),
						c.Float("auto-swap-max-size"),
					)

					// Validate auto swap config
					if err := autoSwapConfig.Validate(); err != nil {
						return fmt.Errorf("invalid auto swap config: %w", err)
					}

					swapClient, err := swaps.NewClient(c.String("server-url"))
					if err != nil {
						return fmt.Errorf("❌ Could not connect to swap server: %w", err)
					}

					options := []lnd.Option{
						lnd.WithNetwork(rpc.ToLightningNetworkType(network)),
					}
					lndConnect := c.String("lndconnect")
					if lndConnect != "" {
						options = append(options, lnd.WithLNDConnectURI(lndConnect))
					} else {
						options = append(options,
							lnd.WithLndEndpoint(c.String("lnd-host")),
							lnd.WithMacaroonFilePath(c.String("macaroon")),
							lnd.WithTLSCertFilePath(c.String("tls-cert")))
					}

					lnClient, err := lnd.NewClient(ctx, options...)
					if err != nil {
						return fmt.Errorf("❌ Could not connect to LND: %w", err)
					}

					mempool := mempool.New(c.String("mempool-token"), mempool.WithURL(c.String("mempool-endpoint")))

					server := rpc.NewRPCServer(grpcPort, db, swapClient, lnClient, mempool, c.Int("minrelayfee"), network)
					defer server.Stop()

					// Create auto swap service if enabled
					var autoSwapService *daemon.AutoSwapService
					if autoSwapConfig.IsEnabled() {
						rpcClient := rpc.NewRPCClient("localhost", grpcPort)
						autoSwapService = daemon.NewAutoSwapService(swapClient, rpcClient, lnClient, db, autoSwapConfig)
					}

					err = daemon.Start(ctx, server, db, swapClient, lnClient, mempool, rpc.ToLightningNetworkType(network), autoSwapService)
					if err != nil {
						return err
					}

					return nil
				},
			},
			{
				Name:  "swap",
				Usage: "Swap operations",
				Commands: []*cli.Command{
					{
						Name:  "in",
						Usage: "Perform a swap in",
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:    "payreq",
								Usage:   "The Lightning invoice where the swap will be paid to",
								Aliases: []string{"p"},
							},
							&cli.UintFlag{
								Name:    "expiry",
								Usage:   "The expiry time in seconds",
								Aliases: []string{"e"},
							},
							&cli.StringFlag{
								Name:    "refund-to",
								Usage:   "The address where the swap will be refunded to",
								Aliases: []string{"r"},
							},
							&cli.UintFlag{
								Name:    "amt",
								Usage:   "Amount in sats to swap",
								Aliases: []string{"a"},
							},
							&grpcPort,
							&chain,
						},
						Action: func(ctx context.Context, cmd *cli.Command) error {

							chainArg := cmd.String("chain")
							if chainArg != rpc.Chain_BITCOIN.String() && chainArg != rpc.Chain_LIQUID.String() {
								return fmt.Errorf("invalid chain: %s (must be %s or %s, case insensitive)", chainArg, rpc.Chain_BITCOIN.String(), rpc.Chain_LIQUID.String())
							}
							chain := rpc.Chain_BITCOIN
							switch chainArg {
							case rpc.Chain_BITCOIN.String():
								chain = rpc.Chain_BITCOIN
							case rpc.Chain_LIQUID.String():
								chain = rpc.Chain_LIQUID
							}

							grpcPort, err := validatePort(cmd.Int("grpc-port"))
							if err != nil {
								return err
							}

							client := rpc.NewRPCClient("localhost", grpcPort)

							swapInRequest := rpc.SwapInRequest{
								Chain:    chain,
								RefundTo: cmd.String("refund-to"),
							}
							payreq := cmd.String("payreq")
							if payreq == "" && cmd.Uint("amt") == 0 {
								return fmt.Errorf("either payreq or amt must be provided")
							}

							if payreq != "" {
								swapInRequest.Invoice = &payreq
							}

							if cmd.Uint("amt") != 0 {
								amt := cmd.Uint("amt")
								swapInRequest.AmountSats = &amt
							}

							if cmd.Uint("expiry") != 0 {
								expiry := uint32(cmd.Uint("expiry")) // nolint:gosec
								swapInRequest.Expiry = &expiry
							}

							swap, err := client.SwapIn(ctx, &swapInRequest)
							if err != nil {
								return err
							}

							// Marshal response into json
							resp, err := json.MarshalIndent(swap, "", indent)
							if err != nil {
								return err
							}

							fmt.Printf("%s\n", resp)

							return nil
						},
					},
					{
						Name:      "out",
						Usage:     "Perform a swap out",
						ArgsUsage: "<amount in sats> <address>",
						Flags: []cli.Flag{
							&cli.StringFlag{
								Name:  "address",
								Usage: "Address to swap to. If not provided, a new address will be generated from the LND wallet",
							},
							&cli.FloatFlag{
								Name:  "max-routing-fee-percent",
								Usage: "The maximum routing fee in percentage for the lightning networ",
								Value: 0.5,
							},
							&grpcPort,
						},
						Action: func(ctx context.Context, cmd *cli.Command) error {
							if cmd.Args().Len() == 0 {
								return fmt.Errorf("amount in sats is required as the first argument")
							}

							amtStr := cmd.Args().Get(0)
							amt, err := strconv.ParseUint(amtStr, 10, 64)
							if err != nil {
								return fmt.Errorf("invalid amount: %v", err)
							}

							grpcPort, err := validatePort(cmd.Int("grpc-port"))
							if err != nil {
								return err
							}

							client := rpc.NewRPCClient("localhost", grpcPort)

							maxRoutingFeePercent := cmd.Float("max-routing-fee-percent")
							if maxRoutingFeePercent < 0 || maxRoutingFeePercent > 100 {
								return fmt.Errorf("max-routing-fee-percent must be between 0 and 100")
							}
							mrfp := float32(maxRoutingFeePercent)

							swapOutRequest := rpc.SwapOutRequest{
								Chain:                rpc.Chain_BITCOIN,
								AmountSats:           amt,
								Address:              cmd.String("address"),
								MaxRoutingFeePercent: &mrfp,
							}

							swap, err := client.SwapOut(ctx, &swapOutRequest)
							if err != nil {
								return err
							}
							// Marshal response into json
							resp, err := json.MarshalIndent(swap, "", indent)
							if err != nil {
								return err
							}

							fmt.Printf("%s\n", resp)

							return nil
						},
					},
					{
						Name:  "status",
						Usage: "Check the status of a swap",
						Flags: []cli.Flag{
							&grpcPort,
						},
						Action: func(ctx context.Context, cmd *cli.Command) error {
							if cmd.Args().Len() < 2 {
								return fmt.Errorf("type and id are required as positional arguments: 40swapd swap status <type> <id>")
							}

							swapType := strings.ToUpper(cmd.Args().Get(0)) // Convert to uppercase
							swapId := cmd.Args().Get(1)

							if swapType != "IN" && swapType != "OUT" {
								return fmt.Errorf("invalid swap type: %s (must be IN or OUT, case insensitive)", cmd.Args().Get(0))
							}

							grpcPort, err := validatePort(cmd.Int("grpc-port"))
							if err != nil {
								return err
							}
							client := rpc.NewRPCClient("localhost", grpcPort)

							var resp []byte

							switch swapType {
							case "IN":
								status, err := client.GetSwapIn(ctx, &rpc.GetSwapInRequest{
									Id: swapId,
								})
								if err != nil {
									return err
								}
								// Marshal response into json
								resp, err = json.MarshalIndent(status, "", indent)
								if err != nil {
									return err
								}
							case "OUT":
								status, err := client.GetSwapOut(ctx, &rpc.GetSwapOutRequest{
									Id: swapId,
								})
								if err != nil {
									return err
								}
								// Marshal response into json
								resp, err = json.MarshalIndent(status, "", indent)
								if err != nil {
									return err
								}
							}

							fmt.Printf("%s\n", resp)

							return nil
						},
					},
					{
						Name:  "recover",
						Usage: "Recover a swap that was paid more than once",
						Flags: []cli.Flag{
							&grpcPort,
							&cli.StringFlag{
								Name:  "refund-to",
								Usage: "The address where the recovery will be refunded to",
							},
						},
						Action: func(ctx context.Context, cmd *cli.Command) error {
							if cmd.Args().Len() == 0 {
								return fmt.Errorf("outpoint is required as the first argument in the format txid:index")
							}

							outpoint := cmd.Args().Get(0)

							grpcPort, err := validatePort(cmd.Int("grpc-port"))
							if err != nil {
								return err
							}

							client := rpc.NewRPCClient("localhost", grpcPort)

							isValid := bitcoinutils.IsValidOutpoint(outpoint)
							if !isValid {
								return fmt.Errorf("invalid outpoint: %s", outpoint)
							}

							refundAddress := cmd.String("refund-to")
							recoveryRequest := rpc.RecoverReusedSwapAddressRequest{
								Outpoint: outpoint,
								RefundTo: &refundAddress,
							}

							swap, err := client.RecoverReusedSwapAddress(ctx, &recoveryRequest)
							if err != nil {
								return err
							}

							resp, err := json.MarshalIndent(swap, "", indent)
							if err != nil {
								return err
							}

							fmt.Printf("%s\n", resp)

							return nil
						},
					},
				},
			},
			{
				Name:  "help",
				Usage: "Show help",
				Action: func(ctx context.Context, cmd *cli.Command) error {
					if err := cli.ShowAppHelp(cmd); err != nil {
						return err
					}

					return nil
				},
			},
		},
	}

	app_err := app.Run(ctx, os.Args)
	if app_err != nil {
		log.Fatal(app_err)
	}
}

// Lightnig networks
var regtest = cli.BoolFlag{
	Name:  "regtest",
	Usage: "Use regtest network",
	Sources: cli.NewValueSourceChain(
		cli.EnvVar("40SWAPD_REGTEST")),
}
var testnet = cli.BoolFlag{
	Name:  "testnet",
	Usage: "Use testnet network",
	Sources: cli.NewValueSourceChain(
		cli.EnvVar("40SWAPD_TESTNET")),
}

// Chains
var chain = cli.StringFlag{
	Name:    "chain",
	Usage:   "Chain to use. Default: Bitcoin. One of Bitcoin or Liquid",
	Value:   rpc.Chain_BITCOIN.String(),
	Aliases: []string{"c"},
}

// Ports and hosts
var grpcPort = cli.IntFlag{
	Name:  "grpc-port",
	Usage: "Grpc port where the daemon is listening",
	Value: 50051,
	Sources: cli.NewValueSourceChain(
		cli.EnvVar("40SWAPD_GRPC_PORT")),
}

var serverUrl = cli.StringFlag{
	Name:  "server-url",
	Usage: "Server URL",
	Value: "https://app.40swap.com",
	Sources: cli.NewValueSourceChain(
		cli.EnvVar("40SWAPD_SERVER_URL")),
}

// config files
var tlsCert = cli.StringFlag{
	Name:  "tls-cert",
	Usage: "TLS certificate file",
	Value: "/root/.lnd/tls.cert",
	Sources: cli.NewValueSourceChain(
		cli.EnvVar("40SWAPD_TLS_CERT")),
}
var macaroon = cli.StringFlag{
	Name:  "macaroon",
	Usage: "Macaroon file",
	Value: "/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon",
	Sources: cli.NewValueSourceChain(
		cli.EnvVar("40SWAPD_MACAROON")),
}
var lndHost = cli.StringFlag{
	Name:  "lnd-host",
	Usage: "LND host",
	Value: "localhost:10009",
	Sources: cli.NewValueSourceChain(
		cli.EnvVar("40SWAPD_LND_HOST")),
}
