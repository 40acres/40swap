-- reverse: create index "idx_swap_outs_deleted_at" to table: "swap_outs"
DROP INDEX IF EXISTS "public"."idx_swap_outs_deleted_at";
-- reverse: create "swap_outs" table
DROP TABLE IF EXISTS "public"."swap_outs";
-- reverse: create "swap_ins" table
DROP TABLE IF EXISTS "public"."swap_ins";
-- reverse: create enum type "chain_enum"
DROP TYPE IF EXISTS "public"."chain_enum";
-- reverse: create enum type "swap_status"
DROP TYPE IF EXISTS "public"."swap_status";
-- reverse: Add new schema named "public"
DROP SCHEMA IF EXISTS "public" CASCADE;
