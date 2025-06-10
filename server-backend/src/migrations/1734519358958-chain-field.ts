import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChainField1734519358958 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "swap_in"
            ADD COLUMN "chain" text NOT NULL DEFAULT 'BITCOIN';
        `);
        await queryRunner.query(`
            ALTER TABLE "swap_in"
            ALTER COLUMN "chain" DROP DEFAULT;
        `);

        await queryRunner.query(`
            ALTER TABLE "swap_out"
            ADD COLUMN "chain" text NOT NULL DEFAULT 'BITCOIN';
        `);
        await queryRunner.query(`
            ALTER TABLE "swap_out"
            ALTER COLUMN "chain" DROP DEFAULT;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {}
}
