//go:build !no_sql_gen

// The idea behing this is that you might not always want to generate db models
// after each go generate invocation, mainly because model generation requires
// a running and up-to-date database instance.
// By default go generate will try to create/update DB models.
package database

import (
	"fmt"
	"path/filepath"

	"gorm.io/gen"
	"gorm.io/gen/field"
	"gorm.io/gorm"
)

// generate generates Gorm models out of a table schema.
//
//go:generate go run ./cli/main.go generate --path .
func generate(db *gorm.DB, path string) (err error) {
	// The following are helpers to tune the generation.
	// createOnly sets the create only Gorm tag.
	createOnly := func(t field.GormTag) field.GormTag {
		return t.Set("<-", "create")
	}

	// updateOnly sets the update only Gorm tag.
	updateOnly := func(t field.GormTag) field.GormTag {
		return t.Set("<-", "update")
	}

	// Set global rules for field configuration.
	opts := []gen.ModelOpt{
		// Set permission tags.
		// This will set <- or -> tags:
		// https://gorm.io/docs/models.html#Field-Level-Permission
		gen.FieldGORMTag("id", createOnly),
		gen.FieldGORMTag("created_at", createOnly),
		gen.FieldGORMTag("updated_at", updateOnly),
	}

	// g.Execute() panics instead of returning the actual error, so we'll
	// capture it and return it.
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%v", r)
		}
	}()

	// Create the new generator with the right path and settings.
	// Models are generated under the ./models directory and SQL under ./postgres/gen.
	g := gen.NewGenerator(gen.Config{
		OutPath:      filepath.Join(path, "gen"),
		ModelPkgPath: filepath.Join(path, "models"),
		Mode:         gen.WithDefaultQuery | gen.WithQueryInterface,

		// FieldWithType is important for complext types (like []text array).
		FieldWithTypeTag: true,
	})

	// Connect the generator to the DB so that it can extract the schema to
	// build the models.
	g.UseDB(db)
	g.WithOpts(opts...)

	g.ApplyBasic(
		g.GenerateModelAs("swap_ins", "SwapIn",
			gen.FieldType("status", "SwapStatus"),
			gen.FieldType("source_chain", "Chain"),
			gen.FieldType("outcome", "*SwapOutcome"),
			gen.FieldType("pre_image", "*lntypes.Preimage"),
			gen.FieldGORMTag("pre_image", func(tag field.GormTag) field.GormTag {
				return tag.Append("serializer", "preimage")
			}),
		),
		g.GenerateModelAs("swap_outs", "SwapOut",
			gen.FieldType("status", "SwapStatus"),
			gen.FieldType("outcome", "*SwapOutcome"),
			gen.FieldType("destination_chain", "Chain"),
			gen.FieldType("pre_image", "*lntypes.Preimage"),
			gen.FieldGORMTag("pre_image", func(tag field.GormTag) field.GormTag {
				return tag.Set("serializer", "preimage")
			}),
		),
	)

	g.Execute()

	return
}
