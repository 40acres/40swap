# Postgres Database management

## Introduction

The document provides guidance on how to effectively use Postgres whithin the
40swap daemon. Specifically, we'll cover database migrations and code generation.

## Schema-First approach

To create or modify and later mapping from the Database to our models, the
starting point is the migrations. Models are generated out of the schema so the
flow is as follows:

_create migration > generate models_

### Create a migration

Migrations are defined in
[migrations.go](database/migrations.go) and they are executed in order.
Migrations define the desired state of the database at certain point in time,
every modification to the db schema happen exclusively in this file.

Refer to [gorm migrations](https://gorm.io/docs/migration.html)
to learn how to write migrations.

### Generate models

Model generation is streamlined via `just generate` (which relies on `go
generate`) command.
It's important to notice that in order to run this command you'll need to have
a running instance of the database with the latest migrations applied.
To disable model generation while running go generate you can `just generate -tags=no_sql_gen ./...`.

The models can be customized fully before generating them, generation rules are
defined in [generate.go](postgres/generate.go).
