package database

import (
	"fmt"
	"os"

	"github.com/40acres/40swap/daemon/swap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func LoadSchema() *gorm.DB {
	dialector := postgres.New(postgres.Config{
		DSN: "postgres://40swap:40swap@localhost:5432/40swap?sslmode=disable",
	})

	db, err := gorm.Open(dialector, &gorm.Config{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create gorm instance: %v\n", err)
		os.Exit(1)
	}

	// Register all your models here
	if err := db.AutoMigrate(&swap.SwapOut{}); err != nil {
		fmt.Fprintf(os.Stderr, "failed to automigrate: %v\n", err)
		os.Exit(1)
	}

	return db
}

func main() {
	fmt.Fprintf(os.Stderr, "Starting schema generation...\n")
	// To be implemented
	fmt.Fprintf(os.Stderr, "Schema generation completed\n")
}
