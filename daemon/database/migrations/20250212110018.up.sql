-- create enum type "swap_status"
CREATE TYPE "public"."swap_status" AS ENUM ('pending', 'in_progress', 'completed', 'failed');
-- create enum type "destination_chain"
CREATE TYPE "public"."destination_chain" AS ENUM ('bitcoin', 'litecoin', 'dogecoin');
-- create "swap_outs" table
CREATE TABLE "public"."swap_outs" ("id" bigserial NOT NULL, "created_at" timestamptz NULL, "updated_at" timestamptz NULL, "deleted_at" timestamptz NULL, "status" "public"."swap_status" NOT NULL DEFAULT 'pending', "amount_sats" bigint NOT NULL DEFAULT 0, "destination_address" text NOT NULL DEFAULT '', "service_fee_sats" bigint NOT NULL DEFAULT 0, "onchain_fee_sats" bigint NOT NULL DEFAULT 0, "offchain_fee_sats" bigint NOT NULL DEFAULT 0, "destination_chain" "public"."destination_chain" NOT NULL DEFAULT 'bitcoin', "claim_pubkey" text NOT NULL DEFAULT '', "payment_request" text NOT NULL DEFAULT '', "description" text NULL, "max_routing_fee_ratio" numeric NOT NULL DEFAULT 0, PRIMARY KEY ("id"));
-- create index "idx_swap_outs_deleted_at" to table: "swap_outs"
CREATE INDEX "idx_swap_outs_deleted_at" ON "public"."swap_outs" ("deleted_at");
