package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	swapcli "github.com/40acres/40swap/daemon/cli"
	"github.com/40acres/40swap/daemon/daemon"
	"github.com/40acres/40swap/daemon/rpc"
	log "github.com/sirupsen/logrus"
	"github.com/urfave/cli/v3"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	port := "50051"

	// gRPC server
	server := rpc.NewRPCServer()
	go func() {
		err := server.ListenAndServe(port)
		if err != nil {
			log.Fatalf("couldn't start server: %v", err)
		}
	}()

	// gRPC client
	client := rpc.NewRPCClient("localhost", port)
	testRequest := &rpc.SwapOutRequest{
		Chain:       rpc.Chain_BITCOIN,
		InputAmount: 100000,
	}
	res, err := client.SwapOut(ctx, testRequest)
	if err != nil {
		log.Fatalf("could not swap out: %v", err)
	}
	log.Printf("SwapOut response: %v", res)

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
		Commands: []*cli.Command{
			{
				Name:  "start",
				Usage: "Start the 40wapd daemon",
				Action: func(ctx context.Context, c *cli.Command) error {
					err := daemon.Start(ctx)
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

	err = app.Run(ctx, os.Args)
	if err != nil {
		log.Fatal(err)
	}
}
