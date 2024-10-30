import { MigrationInterface, QueryRunner } from 'typeorm';

export class CounterpartyPubKey1730294913323 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "swap_in"
            ADD COLUMN "counterpartyPubKey" bytea NOT NULL DEFAULT ''::bytea;
        `);
        await queryRunner.query(`
            ALTER TABLE "swap_in"
            ALTER COLUMN "counterpartyPubKey" DROP DEFAULT
        `);

        await queryRunner.query(`
            ALTER TABLE "swap_out"
            ADD COLUMN "counterpartyPubKey" bytea NOT NULL DEFAULT ''::bytea;
        `);
        await queryRunner.query(`
            ALTER TABLE "swap_out"
            ALTER COLUMN "counterpartyPubKey" DROP DEFAULT
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }

}
