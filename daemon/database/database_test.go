package database

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGetConnection(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		expected string
	}{
		{
			name:     "Embedded database connection string",
			host:     "embedded",
			expected: "postgres://testuser:testpass@localhost:5433/testdb?sslmode=disable",
		},
		{
			name:     "External database connection string",
			host:     "test.host",
			expected: "postgres://testuser:testpass@test.host:5433/testdb?sslmode=disable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := &Database{
				host:     tt.host,
				username: "testuser",
				password: "testpass",
				database: "testdb",
				port:     5433,
			}

			connStr := db.GetConnectionURL()
			require.Equal(t, tt.expected, connStr)
		})
	}
}

func TestDatabaseOperations(t *testing.T) {
	// Create a temporary directory for database files
	tempDir, err := os.MkdirTemp("", "db_test")
	require.NoErrorf(t, err, "Failed to create temp dir")
	t.Cleanup(func() {
		os.RemoveAll(tempDir)
	})

	db, close, err := NewDatabase("testuser", "testpass", "testdb", 5434, tempDir, "embedded")
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, close())
	})

	t.Run("Database connection and ORM", func(t *testing.T) {
		// Test ORM accessor
		orm := db.ORM()
		require.NotNil(t, orm)
	})

	t.Run("Database migration", func(t *testing.T) {
		// Run migrations from the root directory to be able to find the atlas.hcl file
		currentDir, err := os.Getwd()
		require.NoError(t, err)
		rootDir := filepath.Dir(currentDir)
		err = os.Chdir(rootDir)
		require.NoError(t, err)
		defer func() {
			_ = os.Chdir(currentDir)
		}()
		
		err = db.MigrateDatabase()
		require.NoError(t, err)
	})
}
