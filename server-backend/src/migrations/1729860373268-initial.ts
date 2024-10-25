import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1729860373268 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "application_state" (
                "key" character varying(128) NOT NULL,
                "value" json NOT NULL,
                CONSTRAINT "PK_520d347bc3cd9ea4f290d4ee7cd" PRIMARY KEY ("key")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "swap_in" (
                "id" text NOT NULL,
                "contractAddress" text NOT NULL,
                "inputAmount" numeric(15,8) NOT NULL,
                "outputAmount" numeric(15,8) NOT NULL,
                "lockScript" bytea NOT NULL,
                "timeoutBlockHeight" integer NOT NULL,
                "invoice" text NOT NULL,
                "preImage" bytea,
                "lockTx" bytea,
                "lockTxHeight" integer NOT NULL,
                "unlockTx" bytea,
                "unlockTxHeight" integer NOT NULL,
                "sweepAddress" text NOT NULL,
                "unlockPrivKey" bytea NOT NULL,
                "outcome" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "modifiedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "status" text NOT NULL,
                CONSTRAINT "PK_d4751beb57c7a559af959b4f6c7" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "swap_out" (
                "id" text NOT NULL,
                "contractAddress" text NOT NULL,
                "inputAmount" numeric(15,8) NOT NULL,
                "outputAmount" numeric(15,8) NOT NULL,
                "lockScript" bytea NOT NULL,
                "timeoutBlockHeight" integer NOT NULL,
                "invoice" text NOT NULL,
                "preImage" bytea,
                "lockTx" bytea,
                "lockTxHeight" integer NOT NULL,
                "unlockTx" bytea,
                "unlockTxHeight" integer NOT NULL,
                "sweepAddress" text NOT NULL,
                "unlockPrivKey" bytea NOT NULL,
                "outcome" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "modifiedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "preImageHash" bytea NOT NULL,
                "status" text NOT NULL,
                CONSTRAINT "PK_a5fbc29138f78e65c79b6d536bb" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }

}
