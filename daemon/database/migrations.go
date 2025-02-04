package database

import (
	"gorm.io/gorm"
)

func CreateEnumStatus(db *gorm.DB) error {
	return db.Exec("CREATE TYPE status_enum AS ENUM ('pending', 'completed', 'failed')").Error
}
