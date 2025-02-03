package database

import (
	"database/sql"
	"fmt"

	"github.com/40acres/40swap/daemon/swap"
	log "github.com/sirupsen/logrus"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	_ "github.com/lib/pq"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Database struct {
	host       string `default0:"localhost"`
	username   string
	password   string
	database   string
	port       uint32
	dataPath   string
	connection *embeddedpostgres.EmbeddedPostgres
	orm        *gorm.DB
}

func NewDatabase(username, password, database string, port int, dataPath string, host ...string) *Database {

	var dbHost string = "localhost"
	if len(host) > 0 {
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

func (d *Database) Connect() *embeddedpostgres.EmbeddedPostgres {
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
	return fmt.Sprintf("host=%s port=%d user=%s password=%s database=%s sslmode=disable", d.host, d.port, d.username, d.password, d.database)
}

func (d *Database) StartDatabase() {
	if err := d.connection.Start(); err != nil {
		log.Fatalf("Error starting database: %v", err)
	}
	conn, err := sql.Open("postgres", d.GetConnection())
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
	if err := d.connection.Stop(); err != nil {
		log.Fatalf("Error stopping database: %v", err)
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
