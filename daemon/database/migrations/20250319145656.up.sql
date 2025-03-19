-- Add new schema named "public"
CREATE SCHEMA IF NOT EXISTS "public";
-- create enum type "swap_status"
CREATE TYPE "public"."swap_status" AS ENUM ('pending', 'in_progress', 'completed', 'failed');
-- create enum type "chain_enum"
CREATE TYPE "public"."chain_enum" AS ENUM ('bitcoin', 'liquid');
-- create "swap_ins" table
CREATE TABLE "public"."swap_ins" ("id" bigserial NOT NULL, "swap_id" text NOT NULL, "amount_sats" bigint NOT NULL, "status" "public"."swap_status" NOT NULL, "source_chain" "public"."chain_enum" NOT NULL, "claim_address" text NULL, "claim_tx_id" text NULL, "timeout_block_height" bigint NULL, "refund_address" text NULL, "refund_tx_id" text NULL, "refund_privatekey" text NOT NULL, "redeem_script" text NULL, "payment_request" text NOT NULL, "pre_image" text NULL, "on_chain_fee_sats" bigint NOT NULL, "service_fee_sats" bigint NOT NULL, "created_at" timestamptz NULL, "updated_at" timestamptz NULL, PRIMARY KEY ("id"));
-- create "swap_outs" table
CREATE TABLE "public"."swap_outs" ("id" bigserial NOT NULL, "created_at" timestamptz NULL, "updated_at" timestamptz NULL, "deleted_at" timestamptz NULL, "status" "public"."swap_status" NOT NULL, "amount_sats" bigint NOT NULL, "destination_address" text NOT NULL, "service_fee_sats" bigint NOT NULL, "onchain_fee_sats" bigint NOT NULL, "offchain_fee_sats" bigint NOT NULL, "destination_chain" "public"."chain_enum" NOT NULL, "claim_pubkey" text NOT NULL, "payment_request" text NOT NULL, "description" text NOT NULL, "max_routing_fee_ratio" numeric NOT NULL, PRIMARY KEY ("id"));
-- create index "idx_swap_outs_deleted_at" to table: "swap_outs"
CREATE INDEX "idx_swap_outs_deleted_at" ON "public"."swap_outs" ("deleted_at");
