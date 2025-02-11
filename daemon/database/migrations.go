package database

import (
	"fmt"
	"os/exec"
)

func GenerateMigration(name string) error {
	cmd := exec.Command("atlas", "migrate", "diff", name,
		"--dir", "file://database/migrations",
		"--to", "file://atlas.hcl",
		"--dev-url", "postgres://40swap:40swap@localhost:5432/40swap?sslmode=disable")

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to generate migration: %v, output: %s", err, output)
	}

	return nil
}
