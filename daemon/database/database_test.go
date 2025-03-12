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
			expected: "host=localhost port=5433 user=testuser password=testpass database=testdb sslmode=disable",
		},
		{
			name:     "External database connection string",
			host:     "test.host",
			expected: "host=test.host port=5433 user=testuser password=testpass database=testdb sslmode=disable",
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

			connStr := db.getConnection()
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

	db, err := NewDatabase("testuser", "testpass", "testdb", 5434, tempDir, "embedded")
	require.NoError(t, err)
	t.Cleanup(func() {
		db.Close()
	})

	t.Run("Database connection and ORM", func(t *testing.T) {
		// Test ORM accessor
		orm := db.ORM()
		require.NotNil(t, orm)
	})

	t.Run("Database migration", func(t *testing.T) {
		err := db.MigrateDatabase()
		require.NoError(t, err)
	})
}
