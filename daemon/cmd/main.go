package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	swapcli "github.com/40acres/40swap/daemon/cli"
	"github.com/40acres/40swap/daemon/daemon"
	"github.com/40acres/40swap/daemon/rpc"
	log "github.com/sirupsen/logrus"
	"github.com/urfave/cli/v3"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	_ "github.com/lib/pq"
)

func main() {
	// Crear una instancia de Embedded Postgres con configuración por defecto
	db := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			Username("myuser").
			Password("mypassword").
			Database("postgres").
			Port(5433),
	)

	// Iniciar el servidor de PostgreSQL embebido
	if err := db.Start(); err != nil {
		log.Fatalf("Error iniciando la base de datos: %v", err)
	}
	defer func() {
		// Detener el servidor cuando termine el programa
		if err := db.Stop(); err != nil {
			log.Fatalf("Error deteniendo la base de datos: %v", err)
		}
	}()

	// Conectar a la base de datos
	connStr := "host=localhost port=5433 user=myuser password=mypassword dbname=postgres sslmode=disable"
	conn, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Error conectando a la base de datos: %v", err)
	}
	defer conn.Close()

	// Verificar conexión
	if err := conn.Ping(); err != nil {
		log.Fatalf("No se pudo conectar a la base de datos: %v", err)
	}

	fmt.Println("✅ Base de datos embebida en funcionamiento")

	// Crear una tabla de ejemplo
	_, err = conn.Exec("CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)")
	if err != nil {
		log.Fatalf("Error creando tabla: %v", err)
	}

	// Insertar datos
	_, err = conn.Exec("INSERT INTO users (name) VALUES ($1)", "Juan Pérez")
	if err != nil {
		log.Fatalf("Error insertando datos: %v", err)
	}

	// Consultar datos
	rows, err := conn.Query("SELECT id, name FROM users")
	if err != nil {
		log.Fatalf("Error consultando datos: %v", err)
	}
	defer rows.Close()

	fmt.Println("📋 Usuarios en la base de datos:")
	for rows.Next() {
		var id int
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			log.Fatalf("Error escaneando fila: %v", err)
		}
		fmt.Printf("- ID: %d, Nombre: %s\n", id, name)
	}

	if err := rows.Err(); err != nil {
		log.Fatalf("Error en iteración de filas: %v", err)
	}
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

	app_err := app.Run(ctx, os.Args)
	if app_err != nil {
		log.Fatal(app_err)
	}
}
