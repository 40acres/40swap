package database

import "github.com/40acres/40swap/daemon/database/models"

type SwapOutRepository interface {
	SaveSwapOut(swapOut *models.SwapOut) error
	GetSwapOut(id string) (*models.SwapOut, error)
}

func (d *Database) SaveSwapOut(swapOut *models.SwapOut) error {
	return d.orm.Save(swapOut).Error
}

func (d *Database) GetSwapOut(id string) (*models.SwapOut, error) {
	var swapOut models.SwapOut
	err := d.orm.First(&swapOut, "id = ?", id).Error

	return &swapOut, err
}
