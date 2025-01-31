package database

import (
	"database/sql"
	"fmt"

	log "github.com/sirupsen/logrus"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
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
	connection *embeddedpostgres.EmbeddedPostgres
	orm        *gorm.DB
}

func NewDatabase(username, password, database string, port uint32, host ...string) *Database {
	var dbHost string = "localhost"
	if len(host) > 0 {
		dbHost = host[0]
	}
	db := &Database{
		host:     dbHost,
		username: username,
		password: password,
		database: database,
		port:     port,
	}
	db.GetConnection()
	db.StartDatabase()
	db.orm = db.GetGorm()

	return db
}

func (d *Database) GetConnection() *embeddedpostgres.EmbeddedPostgres {
	db := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			Username(d.username).
			Password(d.password).
			Database(d.database).
			Port(d.port),
	)
	d.connection = db

	return db
}

func (d *Database) StartDatabase() {
	if err := d.connection.Start(); err != nil {
		log.Fatalf("Error starting database: %v", err)
	}
	connStr := fmt.Sprintf("host=localhost port=%d user=%s password=%s database=%s sslmode=disable", d.port, d.username, d.password, d.database)
	conn, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Error conectando a la base de datos: %v", err)
	}
	defer conn.Close()
	if err := conn.Ping(); err != nil {
		log.Fatalf("No se pudo conectar a la base de datos: %v", err)
	}

	log.Println("✅ DB started")
}

func (d *Database) GetGorm() *gorm.DB {
	dsn := fmt.Sprintf("host=localhost port=%d user=%s password=%s database=%s sslmode=disable", d.port, d.username, d.password, d.database)
	gormDB, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Error connecting GORM: %v", err)
	}

	return gormDB
}

func (d *Database) ORM() *gorm.DB {
	return d.orm
}

func (d *Database) Stop() {
	if err := d.connection.Stop(); err != nil {
		log.Fatalf("Error stopping database: %v", err)
	}
}

func (d *Database) MigrateDatabase(models ...interface{}) {
	err := d.orm.AutoMigrate(models...)
	if err != nil {
		log.Fatalf("Error migrating models: %v", err)
	}
}
