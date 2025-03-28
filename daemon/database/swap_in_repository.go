package database

import "github.com/40acres/40swap/daemon/database/models"

type SwapInRepository interface {
	SaveSwapIn(swapIn *models.SwapIn) error
	GetSwapIn(id string) (*models.SwapIn, error)
}

func (d *Database) SaveSwapIn(swapIn *models.SwapIn) error {
	return d.orm.Save(swapIn).Error
}

func (d *Database) GetSwapIn(id string) (*models.SwapIn, error) {
	var swapIn models.SwapIn
	err := d.orm.First(&swapIn, "id = ?", id).Error
	
	return &swapIn, err
}
