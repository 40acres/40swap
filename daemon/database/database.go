package database

import (
	"database/sql"
	"fmt"

	"github.com/40acres/40swap/daemon/swap"
	log "github.com/sirupsen/logrus"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Database struct {
	host       string
	username   string
	password   string
	database   string
	port       uint32
	dataPath   string
	connection interface{}
	orm        *gorm.DB
}

func NewDatabase(username, password, database string, port int, dataPath string, host ...string) *Database {

	var dbHost string = "embedded"
	if len(host) > 0 && host[0] != "embedded" {
		dbHost = host[0]
	}

	db := &Database{
		host:     dbHost,
		username: username,
		password: password,
		database: database,
		port:     uint32(port),
		dataPath: dataPath,
	}
	db.Connect()
	db.StartDatabase()
	db.orm = db.GetGorm()

	return db
}

func (d *Database) Connect() interface{} {
	if d.host != "embedded" {
		db, err := sqlx.Connect("postgres", d.GetConnection())
		if err != nil {
			log.Fatalf("Error connecting to database with sqlx: %v", err)
		}
		d.connection = db
		return db
	}
	db := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			DataPath(d.dataPath).
			Username(d.username).
			Password(d.password).
			Database(d.database).
			Port(d.port),
	)

	d.connection = db
	return db
}

func (d *Database) GetConnection() string {
	host := "localhost"
	if d.host != "embedded" {
		host = d.host
	}
	return fmt.Sprintf("host=%s port=%d user=%s password=%s database=%s sslmode=disable", host, d.port, d.username, d.password, d.database)
}

func (d *Database) StartDatabase() {
	_, isEmbedded := d.connection.(*embeddedpostgres.EmbeddedPostgres)
	if isEmbedded {
		if err := d.connection.(*embeddedpostgres.EmbeddedPostgres).Start(); err != nil {
			log.Fatalf("Error starting database: %v", err)
		}
	}

	conn, err := sql.Open("postgres", d.GetConnection())
	if err != nil {
		log.Fatalf("Error conecting to db: %v", err)
	}
	defer conn.Close()
	if err := conn.Ping(); err != nil {
		log.Fatalf("Could not ping db: %v", err)
	}

	log.Println("✅ DB started")
}

func (d *Database) GetGorm() *gorm.DB {
	gormDB, err := gorm.Open(postgres.Open(d.GetConnection()), &gorm.Config{})
	if err != nil {
		log.Fatalf("Error connecting GORM: %v", err)
	}

	return gormDB
}

func (d *Database) ORM() *gorm.DB {
	return d.orm
}

func (d *Database) Stop() {
	switch conn := d.connection.(type) {
	case *embeddedpostgres.EmbeddedPostgres:
		if err := conn.Stop(); err != nil {
			log.Fatalf("Error stopping embedded database: %v", err)
		}
	case *sqlx.DB:
		if err := conn.Close(); err != nil {
			log.Fatalf("Error closing sqlx database connection: %v", err)
		}
	}
}

func (d *Database) MigrateDatabase() error {
	if enumErr := CreateEnumStatus(d.orm); enumErr != nil {
		log.Fatalln("failed to create enum status:", enumErr)

		return enumErr
	}
	err := d.orm.AutoMigrate(&swap.SwapOut{})
	if err != nil {
		log.Fatalf("Error migrating models: %v", err)
		return err
	}

	return nil
}
