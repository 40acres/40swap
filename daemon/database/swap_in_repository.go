package database

import "github.com/40acres/40swap/daemon/database/models"

type SwapInRepository interface {
	SaveSwapIn(swapIn *models.SwapIn) error
	GetPendingSwapIns() ([]models.SwapIn, error)
}

func (d *Database) SaveSwapIn(swapIn *models.SwapIn) error {
	return d.orm.Save(swapIn).Error
}

func (d *Database) GetPendingSwapIns() ([]models.SwapIn, error) {
	var swapIns []models.SwapIn
	err := d.orm.Where("status != ?", models.StatusDone).Find(&swapIns).Error

	return swapIns, err
}
