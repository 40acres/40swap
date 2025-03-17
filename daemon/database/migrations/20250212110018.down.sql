-- reverse: create index "idx_swap_outs_deleted_at" to table: "swap_outs"
DROP INDEX IF EXISTS "public"."idx_swap_outs_deleted_at";
-- reverse: create "swap_outs" table
DROP TABLE IF EXISTS "public"."swap_outs";
-- reverse: create enum type "destination_chain"
DROP TYPE IF EXISTS "public"."destination_chain";
-- reverse: create enum type "swap_status"
DROP TYPE IF EXISTS "public"."swap_status";
