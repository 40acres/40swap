package database

import "github.com/40acres/40swap/daemon/database/models"

type SwapInRepository interface {
	SaveSwapIn(swapIn *models.SwapIn) error
}

func (d *Database) SaveSwapIn(swapIn *models.SwapIn) error {
	return d.orm.Save(swapIn).Error
}
