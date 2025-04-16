package database

import "github.com/40acres/40swap/daemon/database/models"

type SwapOutRepository interface {
	SaveSwapOut(swapOut *models.SwapOut) error
	GetPendingSwapOuts() ([]models.SwapOut, error)
}

func (d *Database) SaveSwapOut(swapOut *models.SwapOut) error {
	return d.orm.Save(swapOut).Error
}

func (d *Database) GetPendingSwapOuts() ([]models.SwapOut, error) {
	var swapOuts []models.SwapOut
	err := d.orm.Where("status != ?", models.StatusDone).Find(&swapOuts).Error

	return swapOuts, err
}
