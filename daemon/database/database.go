package database

import (
	"errors"
	"fmt"
	"os/exec"
	"strings"

	"github.com/40acres/40swap/daemon/database/models"
	log "github.com/sirupsen/logrus"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	_ "github.com/lib/pq"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type errorOnlyWriter struct {
	logger *log.Logger
}

func (w *errorOnlyWriter) Write(p []byte) (n int, err error) {
	msg := string(p)
	if strings.Contains(strings.ToLower(msg), "error") {
		w.logger.Error(msg)
	}

	return len(p), nil
}

type Database struct {
	host     string
	username string
	password string
	database string
	port     uint32
	dataPath string
	orm      *gorm.DB
}

func NewDatabase(username, password, database string, port uint32, dataPath string, host string) (*Database, func() error, error) {
	db := Database{
		host:     host,
		username: username,
		password: password,
		database: database,
		port:     port,
		dataPath: dataPath,
	}

	close := db.close
	if host == "embedded" {
		postgres, err := newEmbeddedDatabase(
			username,
			password,
			database,
			port,
			dataPath)
		if err != nil {
			return nil, nil, fmt.Errorf("could not connect to embedded database: %w", err)
		}

		close = func() error {
			if err := db.close(); err != nil {
				return fmt.Errorf("Could not close database connection: %w", err)
			}

			if err := postgres.Stop(); err != nil {
				if errors.Is(err, embeddedpostgres.ErrServerNotStarted) && isPostgresRunning(port) {
					killPostgres(port)

					return nil
				}

				return fmt.Errorf("Could not stop embedded database: %w", err)
			}

			return nil
		}
	}

	orm, err := db.getGorm()
	if err != nil {
		if closeErr := close(); closeErr != nil {
			return nil, nil, fmt.Errorf("could not close database: %w", closeErr)
		}

		return nil, nil, fmt.Errorf("could not get GORM: %w", err)
	}
	db.orm = orm

	models.RegisterPreimageSerializer()

	return &db, close, nil
}

func (d *Database) getHost() string {
	host := "localhost"
	if d.host != "embedded" {
		host = d.host
	}

	return host
}

func (d *Database) GetConnectionURL() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=disable",
		d.username, d.password, d.getHost(), d.port, d.database)
}

func (d *Database) getGorm() (*gorm.DB, error) {
	gormDB, err := gorm.Open(postgres.Open(d.GetConnectionURL()), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("Could not connect GORM: %w", err)
	}

	log.Info("✅ DB connected")

	return gormDB, nil
}

func (d *Database) ORM() *gorm.DB {
	return d.orm
}

func (d *Database) MigrateDatabase() error {
	dbURL := d.GetConnectionURL()
	statusCmd := exec.Command("cd", "..", "&&", "atlas", "migrate", "status", "--env", "gorm", "--url", dbURL)
	statusOutput, err := statusCmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("error checking migration status: %w, output: %s", err, string(statusOutput))
	}

	if !strings.Contains(string(statusOutput), "Already at latest version") {
		applyCmd := exec.Command("cd", "..", "&&", "atlas", "migrate", "apply", "--env", "gorm", "--url", dbURL)
		applyOutput, err := applyCmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("error applying migrations: %w, output: %s", err, string(applyOutput))
		}
		log.Info("✅ Migrations applied successfully")
	} else {
		log.Info("✅ Database is up to date with migrations")
	}

	return nil
}

func (d *Database) close() error {
	db, err := d.orm.DB()
	if err != nil {
		return fmt.Errorf("Could not get database connection: %w", err)
	}

	if err := db.Close(); err != nil {
		return fmt.Errorf("Could not close database connection: %w", err)
	}

	return nil
}

func newEmbeddedDatabase(username, password, database string, port uint32, dataPath string) (*embeddedpostgres.EmbeddedPostgres, error) {
	postgres := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			DataPath(dataPath).
			Username(username).
			Password(password).
			Database(database).
			Port(port).
			Logger(&errorOnlyWriter{logger: log.New()}),
	)

	if err := postgres.Start(); err != nil {
		if strings.Contains(err.Error(), "process already listening on port") {
			log.Info("✅ DB already started, skipping")

			return postgres, nil
		}

		return nil, fmt.Errorf("❌ Could not start embedded database: %w", err)
	}

	log.Info("✅ DB started")

	return postgres, nil
}

func isPostgresRunning(port uint32) bool {
	if port < 1 || port > 65535 {
		return false
	}
	//nolint:gosec
	out, err := exec.Command("lsof", "-i", fmt.Sprintf(":%d", port), "-t").Output()
	if err != nil {
		return false
	}

	return len(out) > 0
}

func killPostgres(port uint32) {
	if port < 1 || port > 65535 {
		return
	}
	//nolint:gosec
	out, err := exec.Command("lsof", "-i", fmt.Sprintf(":%d", port), "-t").Output()
	if err == nil {
		pid := strings.TrimSpace(string(out))
		_ = exec.Command("kill", "-9", pid).Run()
	}
}
