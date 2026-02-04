import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1738670000000 implements MigrationInterface {
    name = 'Initial1738670000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "liquidity_swap" (
                "id" text NOT NULL,
                "strategy" text NOT NULL,
                "channelId" text NOT NULL,
                "peerAlias" text NOT NULL,
                "remotePubkey" text NOT NULL,
                "amount" numeric(15,8) NOT NULL,
                "status" text NOT NULL,
                "outcome" text,
                "providerTxId" text,
                "lightningInvoice" text,
                "address" text,
                "cost" numeric(15,8),
                "errorMessage" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "completedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_liquidity_swap" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }
}
