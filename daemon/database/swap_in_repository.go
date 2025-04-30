//nolint:dupl
package database

import (
	"context"

	"github.com/40acres/40swap/daemon/database/models"
)

type SwapInRepository interface {
	SaveSwapIn(ctx context.Context, swapIn *models.SwapIn) error
	GetPendingSwapIns(ctx context.Context) ([]*models.SwapIn, error)
	GetSwapIn(ctx context.Context, swapID string) (*models.SwapIn, error)
	GetSwapInByClaimAddress(ctx context.Context, address string) (*models.SwapIn, error)
}

func (d *Database) SaveSwapIn(ctx context.Context, swapIn *models.SwapIn) error {
	return d.query.WithContext(ctx).SwapIn.Save(swapIn)
}

func (d *Database) GetPendingSwapIns(ctx context.Context) ([]*models.SwapIn, error) {
	var swapIns []*models.SwapIn
	swap := d.query.SwapIn

	err := swap.WithContext(ctx).
		Where(swap.Status.Eq(models.StatusDone)).
		Scan(&swapIns)

	if err != nil {
		return nil, err
	}

	return swapIns, nil
}

func (d *Database) GetSwapIn(ctx context.Context, swapID string) (*models.SwapIn, error) {
	return d.query.WithContext(ctx).SwapIn.
		Where(d.query.SwapIn.SwapID.Eq(swapID)).
		First()
}

func (d *Database) GetSwapInByClaimAddress(ctx context.Context, address string) (*models.SwapIn, error) {
	return d.query.WithContext(ctx).SwapIn.
		Where(d.query.SwapIn.ClaimAddress.Eq(address)).
		First()
}
