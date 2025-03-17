package main

import (
	"fmt"
	"io"
	"os"

	"ariga.io/atlas-provider-gorm/gormschema"
	"github.com/40acres/40swap/daemon/database/models"
)

func main() {
	stmts, err := gormschema.New("postgres").Load(&models.SwapOut{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load gorm schema: %v\n", err)
		os.Exit(1)
	}

	// Add schema selection and enum types creation
	enumStmts := models.SwapStatusEnumSQL() + "\n" + models.ChainEnumSQL() + "\n"
	stmts = enumStmts + stmts

	if _, err := io.WriteString(os.Stdout, stmts); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write to stdout: %v\n", err)
		os.Exit(1)
	}
}
