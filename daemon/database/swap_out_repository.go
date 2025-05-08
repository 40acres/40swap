//nolint:dupl
package database

import (
	"context"

	"github.com/40acres/40swap/daemon/database/models"
)

type SwapOutRepository interface {
	SaveSwapOut(ctx context.Context, swapOut *models.SwapOut) error
	GetPendingSwapOuts(ctx context.Context) ([]*models.SwapOut, error)
	GetSwapOut(ctx context.Context, swapID string) (*models.SwapOut, error)
}

func (d *Database) SaveSwapOut(ctx context.Context, swapOut *models.SwapOut) error {
	return d.query.WithContext(ctx).SwapOut.Save(swapOut)
}

func (d *Database) GetPendingSwapOuts(ctx context.Context) ([]*models.SwapOut, error) {
	var swapOuts []*models.SwapOut
	swap := d.query.SwapOut

	err := swap.WithContext(ctx).
		Where(swap.Status.Neq(models.StatusDone)).
		Scan(&swapOuts)

	if err != nil {
		return nil, err
	}

	return swapOuts, nil
}

func (d *Database) GetSwapOut(ctx context.Context, swapID string) (*models.SwapOut, error) {
	return d.query.WithContext(ctx).SwapOut.
		Where(d.query.SwapOut.SwapID.Eq(swapID)).
		First()
}
