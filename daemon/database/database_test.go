package database

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
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

			connStr := db.GetConnection()
			assert.Equal(t, tt.expected, connStr)
		})
	}
}

func TestDatabaseOperations(t *testing.T) {
	// Create a temporary directory for database files
	tempDir, err := os.MkdirTemp("", "db_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	db := NewDatabase("testuser", "testpass", "testdb", 5434, tempDir)
	defer db.Stop()

	t.Run("Database connection and ORM", func(t *testing.T) {
		assert.NotNil(t, db.connection)
		assert.NotNil(t, db.orm)

		// Test ORM accessor
		orm := db.ORM()
		assert.NotNil(t, orm)
		assert.Equal(t, db.orm, orm)
	})

	t.Run("Database migration", func(t *testing.T) {
		err := db.MigrateDatabase()
		assert.NoError(t, err)
	})
}
