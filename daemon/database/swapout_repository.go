package database

import "github.com/40acres/40swap/daemon/database/models"

type SwapOutRepository interface {
	SaveSwapOut(swapOut *models.SwapOut) error
}

func (d *Database) SaveSwapOut(swapOut *models.SwapOut) error {
	return d.orm.Save(swapOut).Error
}
