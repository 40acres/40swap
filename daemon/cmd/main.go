package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	swapcli "github.com/40acres/40swap/daemon/cli"
	"github.com/40acres/40swap/daemon/daemon"
	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/40acres/40swap/daemon/swaps"
	log "github.com/sirupsen/logrus"
	"github.com/urfave/cli/v3"

	_ "ariga.io/atlas-provider-gorm/gormschema"
	_ "github.com/lib/pq"
)

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
		Name:  "40swap",
		Usage: "A CLI for 40swap daemon",
		Flags: []cli.Flag{
			&cli.StringFlag{
				Name:  "db-host",
				Usage: "Database host",
				Value: "embedded",
			},
			&cli.StringFlag{
				Name:  "db-user",
				Usage: "Database username",
				Value: "myuser",
			},
			&cli.StringFlag{
				Name:  "db-password",
				Usage: "Database password",
				Value: "mypassword",
			},
			&cli.StringFlag{
				Name:  "db-name",
				Usage: "Database name",
				Value: "postgres",
			},
			&cli.IntFlag{
				Name:  "db-port",
				Usage: "Database port",
				Value: 5433,
			},
			&cli.StringFlag{
				Name:  "db-data-path",
				Usage: "Database path",
				Value: "./.data",
			},
			&cli.BoolFlag{
				Name:  "db-keep-alive",
				Usage: "Keep the database running after the daemon stops for embedded databases",
				Value: false,
			},
			&grpcPort,
			&serverUrl,
		},
		Commands: []*cli.Command{
			{
				Name:  "start",
				Usage: "Start the 40swapd daemon",
				Action: func(ctx context.Context, c *cli.Command) error {
					port, err := validatePort(c.Int("db-port"))
					if err != nil {
						return err
					}

					grpcPort, err := validatePort(c.Int("grpc-port"))
					if err != nil {
						return err
					}

					db, closeDb, err := database.NewDatabase(
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

					if c.String("db-host") == "embedded" {
						dbErr := db.MigrateDatabase()
						if dbErr != nil {
							return dbErr
						}
					} else {
						log.Info("🔍 Skipping database migration")
					}

					swapClient, err := swaps.NewClient(c.String("server-url"))
					if err != nil {
						return fmt.Errorf("❌ Could not connect to swap server: %w", err)
					}

					server := rpc.NewRPCServer(grpcPort, db, swapClient)
					defer server.Stop()

					err = daemon.Start(ctx, server)
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
								Name:     "payreq",
								Usage:    "The Lightning invoice where the swap will be paid to",
								Aliases:  []string{"p"},
								Required: true,
							},
							&grpcPort,
							&regtest,
							&testnet,
							&bitcoin,
							&liquid,
						},
						Action: func(ctx context.Context, c *cli.Command) error {
							chain := rpc.Chain_BITCOIN
							switch {
							case c.Bool("bitcoin"):
								chain = rpc.Chain_BITCOIN
							case c.Bool("liquid"):
								chain = rpc.Chain_LIQUID
							}

							network := rpc.Network_MAINNET
							switch {
							case c.Bool("regtest"):
								network = rpc.Network_REGTEST
							case c.Bool("testnet"):
								network = rpc.Network_TESTNET
							}

							grpcPort, err := validatePort(c.Int("grpc-port"))
							if err != nil {
								return err
							}

							client := rpc.NewRPCClient("localhost", grpcPort)
							_, err = client.SwapIn(ctx, &rpc.SwapInRequest{
								Chain:   chain,
								Network: network,
								Invoice: c.String("payreq"),
							})
							if err != nil {
								return err
							}

							return nil
						},
					},
					{
						Name:  "out",
						Usage: "Perform a swap out",
						Action: func(ctx context.Context, cmd *cli.Command) error {
							// TODO
							swapcli.SwapOut()

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
}
var testnet = cli.BoolFlag{
	Name:  "testnet",
	Usage: "Use testnet network",
}

// Chains
var bitcoin = cli.BoolFlag{
	Name:  "bitcoin",
	Usage: "Use Bitcoin chain",
}
var liquid = cli.BoolFlag{
	Name:  "liquid",
	Usage: "Use Liquid chain",
}

// Ports and hosts
var grpcPort = cli.IntFlag{
	Name:  "grpc-port",
	Usage: "Grpc port for client to daemon communication",
	Value: 50051,
}
var serverUrl = cli.StringFlag{
	Name:  "server-url",
	Usage: "Server URL",
	Value: "https://app.40swap.com",
}
