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
	log "github.com/sirupsen/logrus"
	"github.com/urfave/cli/v3"

	_ "github.com/lib/pq"
)

type User struct {
	ID   uint   `gorm:"primaryKey"`
	Name string `gorm:"not null"`
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// DB
	db := database.NewDatabase("myuser", "mypassword", "postgres", 5433)
	defer db.Stop()
	db.MigrateDatabase(&User{})

	// Insertar un usuario
	user := User{Name: "Juan Pérez"}
	if err := db.ORM().Create(&user).Error; err != nil {
		log.Fatalf("Error insertando usuario: %v", err)
	}

	// Consultar usuarios
	var users []User
	if err := db.ORM().Find(&users).Error; err != nil {
		log.Fatalf("Error consultando usuarios: %v", err)
	}

	// Imprimir usuarios
	fmt.Println("📋 Usuarios en la base de datos:")
	for _, u := range users {
		fmt.Printf("- ID: %d, Nombre: %s\n", u.ID, u.Name)
	}

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

	app_err := app.Run(ctx, os.Args)
	if app_err != nil {
		log.Fatal(app_err)
	}
}
