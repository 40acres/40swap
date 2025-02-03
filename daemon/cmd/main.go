package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	swapcli "github.com/40acres/40swap/daemon/cli"
	"github.com/40acres/40swap/daemon/daemon"
	"github.com/40acres/40swap/daemon/database"
	"github.com/40acres/40swap/daemon/rpc"
	log "github.com/sirupsen/logrus"
	"github.com/urfave/cli/v3"

	_ "github.com/lib/pq"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// gRPC server
	port := 50051
	server := rpc.NewRPCServer(port)
	go func() {
		err := server.ListenAndServe()
		if err != nil {
			log.Fatalf("couldn't start server: %v", err)
		}
	}()

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
				Usage: "Database username",
				Value: "localhost",
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
			},
		},
		Commands: []*cli.Command{
			{
				Name:  "start",
				Usage: "Start the 40wapd daemon",
				Action: func(ctx context.Context, c *cli.Command) error {
					db := database.NewDatabase(
						c.String("db-user"),
						c.String("db-password"),
						c.String("db-name"),
						int(c.Int("db-port")),
						c.String("db-data-path"),
						c.String("db-host"),
					)
					defer db.Stop()

					if c.String("db-data-path") == "" {
						dbErr := db.MigrateDatabase()
						if dbErr != nil {
							return dbErr
						}
					}

					err := daemon.Start(ctx, db)
					if err != nil {
						return err
					}

					return nil
				},
			},
			{
				Name:  "migrate",
				Usage: "Migrate the 40wapd daemon database",
				Action: func(ctx context.Context, c *cli.Command) error {
					db := database.NewDatabase(
						c.String("db-user"),
						c.String("db-password"),
						c.String("db-name"),
						int(c.Int("db-port")),
						c.String("db-data-path"),
						c.String("db-host"),
					)
					defer db.Stop()
					dbErr := db.MigrateDatabase()
					if dbErr != nil {
						return dbErr
					}

					return nil
				},
			},
			{
				Name:  "swap",
				Usage: "Swap operations",
				Commands: []*cli.Command{
					{
						Name:  "out",
						Usage: "Perform an  swap out",
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
