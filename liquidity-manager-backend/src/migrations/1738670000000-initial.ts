import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1738670000000 implements MigrationInterface {
    name = 'Initial1738670000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "liquidity_swap" (
                "id" text NOT NULL,
                "channelId" text NOT NULL,
                "peerAlias" text NOT NULL,
                "remotePubkey" text NOT NULL,
                "amountSats" numeric(15,8) NOT NULL,
                "status" text NOT NULL,
                "outcome" text,
                "bitfinexTxId" text,
                "lightningInvoice" text,
                "preimage" text,
                "liquidAddress" text,
                "costSats" numeric(15,8),
                "errorMessage" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "completedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_liquidity_swap" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_liquidity_swap_channelId" ON "liquidity_swap" ("channelId")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_liquidity_swap_status" ON "liquidity_swap" ("status")
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_liquidity_swap_createdAt" ON "liquidity_swap" ("createdAt")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_liquidity_swap_createdAt"`);
        await queryRunner.query(`DROP INDEX "IDX_liquidity_swap_status"`);
        await queryRunner.query(`DROP INDEX "IDX_liquidity_swap_channelId"`);
        await queryRunner.query(`DROP TABLE "liquidity_swap"`);
    }
}
