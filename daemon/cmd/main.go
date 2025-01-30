package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/40acres/40swap/daemon/api"
	swapcli "github.com/40acres/40swap/daemon/cli"
	"github.com/40acres/40swap/daemon/daemon"
	"github.com/40acres/40swap/daemon/rpc"
	"github.com/go-openapi/runtime/middleware"
	log "github.com/sirupsen/logrus"
	"github.com/urfave/cli/v3"
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

	err := app.Run(ctx, os.Args)
	if err != nil {
		log.Fatal(err)
	}

	// Swagger UI
	swaggerPath, err := filepath.Abs("api/swagger.json")
	if err != nil {
		log.Fatalf("Error finding swagger.json: %v", err)
	}

	// Imprimir la ruta absoluta para depuración
	log.Infof("Swagger JSON path: %s", swaggerPath)

	http.HandleFunc("/api/swagger.json", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, swaggerPath)
	})
	http.Handle("/docs", middleware.SwaggerUI(middleware.SwaggerUIOpts{
		SpecURL: "/api/swagger.json",
	}, nil))

	log.Infof("Swagger UI available at http://localhost:%d/docs", 8081)
	go func() {
		log.Fatal(http.ListenAndServe(":8081", nil))
	}()

	// API client
	_, clientErr := api.NewClient("http://localhost:8081")
	if clientErr != nil {
		log.Fatalf("Error creating client: %v", clientErr)
	}

	// Keep the main function running
	select {}
}
