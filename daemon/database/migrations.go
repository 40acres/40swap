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

// This migration removes the `not null` from the `Outcome` field
func RemoveNotNullInOutcome() *gormigrate.Migration {
	const ID = "2_remove_not_null_in_outcome"

	return &gormigrate.Migration{
		ID: ID,
		Migrate: func(tx *gorm.DB) error {
			type swapIn struct {
				Outcome *int `gorm:"type:swap_outcome"`
			}
			type swapOut struct {
				Outcome *int `gorm:"type:swap_outcome"`
			}

			if err := tx.Migrator().AlterColumn(&swapOut{}, "outcome"); err != nil {
				return err
			}

			return tx.Migrator().AlterColumn(&swapIn{}, "outcome")
		},
		Rollback: func(tx *gorm.DB) error {
			type swapIn struct {
				Outcome int `gorm:"type:swap_outcome;not null"`
			}
			type swapOut struct {
				Outcome int `gorm:"type:swap_outcome;not null"`
			}

			if err := tx.Migrator().AlterColumn(&swapIn{}, "outcome"); err != nil {
				return err
			}

			return tx.Migrator().AlterColumn(&swapOut{}, "outcome")
		},
	}
}

// This migration adds the `RefundRequestedAt` column to the `SwapIn` table
func AddColumnRefundRequested() *gormigrate.Migration {
	const ID = "3_add_column_refund_requested"

	type swapIn struct {
		RefundRequestedAt *time.Time
	}

	return &gormigrate.Migration{
		ID: ID,
		Migrate: func(tx *gorm.DB) error {
			return tx.Migrator().AddColumn(&swapIn{}, "RefundRequestedAt")
		},
		Rollback: func(tx *gorm.DB) error {
			return tx.Migrator().DropColumn(&swapIn{}, "RefundRequestedAt")
		},
	}
}

func RemoveNotNullSwapOut() *gormigrate.Migration {
	const ID = "4_remove_not_null_constraints_swap_out"

	return &gormigrate.Migration{
		ID: ID,
		Migrate: func(tx *gorm.DB) error {
			type swapOut struct {
				Description     *string
				OnchainFeeSATS  uint64
				OffchainFeeSATS uint64
			}

			if err := tx.Migrator().AlterColumn(&swapOut{}, "Description"); err != nil {
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
			type swapOut struct {
				Description     *string `gorm:"not null"`
				OnchainFeeSATS  uint64  `gorm:"not null"`
				OffchainFeeSATS uint64  `gorm:"not null"`
			}

			if err := tx.Migrator().AlterColumn(&swapOut{}, "Description"); err != nil {
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
	}
}

func AddPreimageTxIdTimeoutBlockHeightToSwapOut() *gormigrate.Migration {
	const ID = "5_add_preimage_tx_id_timeout_block_height_to_swap_out"

	type swapOut struct {
		PreImage           *lntypes.Preimage `gorm:"serializer:preimage"`
		TxId               string
		TimeoutBlockHeight uint64
	}

	return &gormigrate.Migration{
		ID: ID,
		Migrate: func(tx *gorm.DB) error {
			if err := tx.Migrator().AddColumn(&swapOut{}, "PreImage"); err != nil {
				return err
			}

			if err := tx.Migrator().AddColumn(&swapOut{}, "TimeoutBlockHeight"); err != nil {
				return err
			}

			return tx.Migrator().AddColumn(&swapOut{}, "TxId")
		},
		Rollback: func(tx *gorm.DB) error {
			if err := tx.Migrator().DropColumn(&swapOut{}, "PreImage"); err != nil {
				return err
			}

			if err := tx.Migrator().DropColumn(&swapOut{}, "TimeoutBlockHeight"); err != nil {
				return err
			}

			return tx.Migrator().DropColumn(&swapOut{}, "TxId")
		},
	}
}

func ChangeNameClaimPubkey() *gormigrate.Migration {
	const ID = "6_change_name_claim_pubkey"

	type swapOut struct {
		ClaimPrivateKey string `gorm:"column:private_key"`
	}

	return &gormigrate.Migration{
		ID: ID,
		Migrate: func(tx *gorm.DB) error {
			if err := tx.Migrator().RenameColumn(&swapOut{}, "claim_pubkey", "claim_private_key"); err != nil {
				return err
			}

			return nil
		},
		Rollback: func(tx *gorm.DB) error {
			if err := tx.Migrator().RenameColumn(&swapOut{}, "claim_private_key", "claim_pubkey"); err != nil {
				return err
			}

			return nil
		},
	}
}

func DropClaimTxForSwapIns() *gormigrate.Migration {
	const ID = "7_drop_claim_tx_for_swap_ins"

	type swapIn struct {
		ClaimTxID string
	}

	return &gormigrate.Migration{
		ID: ID,
		Migrate: func(tx *gorm.DB) error {
			return tx.Migrator().DropColumn(&swapIn{}, "ClaimTxID")
		},
		Rollback: func(tx *gorm.DB) error {
			return tx.Migrator().AddColumn(&swapIn{}, "ClaimTxID")
		},
	}
}

var migrations = []*gormigrate.Migration{
	CreateSwapsTables(),
	RemoveNotNullInOutcome(),
	AddColumnRefundRequested(),
	RemoveNotNullSwapOut(),
	AddPreimageTxIdTimeoutBlockHeightToSwapOut(),
	ChangeNameClaimPubkey(),
	DropClaimTxForSwapIns(),
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
