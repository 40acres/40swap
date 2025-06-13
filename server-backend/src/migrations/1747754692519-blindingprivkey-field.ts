import { MigrationInterface, QueryRunner } from 'typeorm';

export class BlindingPrivKeyField1747754692519 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "swap_in"
            ADD COLUMN "blindingPrivKey" bytea NULL DEFAULT NULL;
        `);

        await queryRunner.query(`
            ALTER TABLE "swap_out"
            ADD COLUMN "blindingPrivKey" bytea NULL DEFAULT NULL;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "swap_in"
            DROP COLUMN "blindingPrivKey";
        `);

        await queryRunner.query(`
            ALTER TABLE "swap_out"
            DROP COLUMN "blindingPrivKey";
        `);
    }

}
