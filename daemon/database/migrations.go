package database

import (
	"errors"
	"time"

	"github.com/40acres/40swap/daemon/database/models"
	"github.com/go-gormigrate/gormigrate/v2"
	"github.com/lightningnetwork/lnd/lntypes"
	"gorm.io/gorm"
)

func CreateSwapsTables() *gormigrate.Migration {
	const ID = "1_create_swap_tables"

	type swapOut struct {
		ID uint `gorm:"primaryKey;autoIncrement"`

		SwapId             string  `gorm:"not null;unique"`
		Status             int     `gorm:"type:swap_status;not null"`
		AmountSATS         uint64  `gorm:"not null"`
		DestinationAddress string  `gorm:"not null"`
		ServiceFeeSATS     uint64  `gorm:"not null"`
		OnchainFeeSATS     uint64  `gorm:"not null"`
		OffchainFeeSATS    uint64  `gorm:"not null"`
		DestinationChain   int     `gorm:"type:chain_enum;not null"`
		ClaimPubkey        string  `gorm:"not null"`
		PaymentRequest     string  `gorm:"not null"`
		Description        *string `gorm:"not null"`
		MaxRoutingFeeRatio float64 `gorm:"not null"`
		Outcome            int     `gorm:"type:swap_outcome;not null"`
	}

	type swapIn struct {
		ID                 uint   `gorm:"primaryKey;autoIncrement"`
		SwapID             string `gorm:"not null"`
		AmountSATS         uint64 `gorm:"not null"`
		Status             int    `gorm:"type:swap_status;not null"`
		Outcome            int    `gorm:"type:swap_outcome;not null"`
		SourceChain        int    `gorm:"type:chain_enum;not null"`
		ClaimAddress       string
		ClaimTxId          string
		TimeoutBlockHeight uint64
		RefundAddress      string
		RefundTxId         string
		RefundPrivatekey   string `gorm:"not null"`
		RedeemScript       string
		PaymentRequest     string            `gorm:"not null"`
		PreImage           *lntypes.Preimage `gorm:"serializer:preimage"`
		OnChainFeeSATS     uint64            `gorm:"not null"`
		ServiceFeeSATS     uint64            `gorm:"not null"`
		CreatedAt          time.Time         `gorm:"autoCreateTime"`
		UpdatedAt          time.Time         `gorm:"autoUpdateTime"`
	}

	return &gormigrate.Migration{
		ID: ID,
		Migrate: func(tx *gorm.DB) error {
			if err := tx.Exec(models.CreateChainEnumSQL()); err.Error != nil {
				return err.Error
			}

			if err := tx.Exec(models.CreateSwapStatusEnumSQL()); err.Error != nil {
				return err.Error
			}

			if err := tx.Exec(models.CreateSwapOutcomeEnumSQL()); err.Error != nil {
				return err.Error
			}

			if err := tx.Migrator().CreateTable(&swapOut{}); err != nil {
				return err
			}

			return tx.Migrator().CreateTable(&swapIn{})
		},
		Rollback: func(tx *gorm.DB) error {
			if err := tx.Migrator().DropTable(&swapIn{}); err != nil {
				return err
			}

			if err := tx.Migrator().DropTable(&swapOut{}); err != nil {
				return err
			}

			if err := tx.Exec(models.DropSwapOutcomeEnumSQL()); err.Error != nil {
				return err.Error
			}

			if err := tx.Exec(models.DropSwapStatusEnumSQL()); err.Error != nil {
				return err.Error
			}

			return tx.Exec(models.DropChainEnumSQL()).Error
		},
	}
}

func RemoveNotNullSwapOut() *gormigrate.Migration {
	const ID = "2_remove_not_null_constraints_swap_out"

	type swapOut struct {
		Description     *string
		Outcome         int `gorm:"type:swap_outcome"`
		OnchainFeeSATS  uint64
		OffchainFeeSATS uint64

		OldDescription     *string `gorm:"not null"`
		OldOutcome         int     `gorm:"type:swap_outcome;not null"`
		OldOnchainFeeSATS  uint64  `gorm:"not null"`
		OldOffchainFeeSATS uint64  `gorm:"not null"`
	}

	return &gormigrate.Migration{
		ID: ID,
		Migrate: func(tx *gorm.DB) error {
			if err := tx.Migrator().AlterColumn(&swapOut{}, "Description"); err != nil {
				return err
			}
			if err := tx.Migrator().AlterColumn(&swapOut{}, "Outcome"); err != nil {
				return err
			}
			if err := tx.Migrator().AlterColumn(&swapOut{}, "OnchainFeeSATS"); err != nil {
				return err
			}
			if err := tx.Migrator().AlterColumn(&swapOut{}, "OffchainFeeSATS"); err != nil {
				return err
			}
			return nil
		},
		Rollback: func(tx *gorm.DB) error {
			if err := tx.Migrator().AlterColumn(&swapOut{}, "OldDescription"); err != nil {
				return err
			}
			if err := tx.Migrator().AlterColumn(&swapOut{}, "OldOutcome"); err != nil {
				return err
			}
			if err := tx.Migrator().AlterColumn(&swapOut{}, "OldOnchainFeeSATS"); err != nil {
				return err
			}
			if err := tx.Migrator().AlterColumn(&swapOut{}, "OldOffchainFeeSATS"); err != nil {
				return err
			}
			return nil
		},
	}
}

var migrations = []*gormigrate.Migration{
	CreateSwapsTables(),
	RemoveNotNullSwapOut(),
}

type Migrator struct {
	db   *gorm.DB
	opts *gormigrate.Options
}

func NewMigrator(db *gorm.DB) *Migrator {
	opts := gormigrate.DefaultOptions

	// We Usetransaction to make sure that the migration is atomic.
	// This is that a single migration will either succeed or fail, and it will
	// rollback on failure.
	opts.UseTransaction = true

	return &Migrator{
		db:   db,
		opts: gormigrate.DefaultOptions,
	}
}

func (m *Migrator) Migrate() error {
	return gormigrate.New(m.db, m.opts, migrations).Migrate()
}

func (m *Migrator) MigrateTo(id string) error {
	return gormigrate.New(m.db, m.opts, migrations).MigrateTo(id)
}

func (m *Migrator) Rollback() error {
	return gormigrate.New(m.db, m.opts, migrations).RollbackLast()
}

// Reset will only rollback the DB to its initial state, this is no tables.
func (m *Migrator) Reset() error {
	// We will only rollback if the `migrations` table exists.
	// So first we need to check for the table existence.
	var exists bool
	tx := m.db.Raw(`SELECT EXISTS (
		SELECT FROM information_schema.tables
		WHERE table_name = $1
	)`, m.opts.TableName).Scan(&exists)
	if err := tx.Error; err != nil {
		return err
	}

	// If the table `migrations` does not exist, it means that migrations have
	// not been initialized so no Rollback needed.
	if !exists {
		return nil
	}

	// Migrations were created so we can safely rollback.
	// We will migrate one step at a time until no mire migrations to run
	// are available.
	for {
		if err := gormigrate.New(m.db, m.opts, migrations).RollbackLast(); err != nil {
			if errors.Is(err, gormigrate.ErrNoRunMigration) {
				return nil
			}

			return err
		}
	}
}
