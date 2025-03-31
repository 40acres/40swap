package database

import (
	"os"
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
			expected: "postgres://testuser:testpass@localhost:5433/testdb?sslmode=disable&search_path=public",
		},
		{
			name:     "External database connection string",
			host:     "test.host",
			expected: "postgres://testuser:testpass@test.host:5433/testdb?sslmode=disable&search_path=public",
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

	db, close, err := New("testuser", "testpass", "testdb", 5434, tempDir, "embedded", false)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, close())
	})

	t.Run("Database connection and ORM", func(t *testing.T) {
		// Test ORM accessor
		orm := db.ORM()
		require.NotNil(t, orm)
	})
}
