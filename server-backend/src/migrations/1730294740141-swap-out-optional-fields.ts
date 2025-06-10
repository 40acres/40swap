import { MigrationInterface, QueryRunner } from 'typeorm';

export class SwapOutOptionalFields1730294740141 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "swap_out" ALTER COLUMN "contractAddress" DROP NOT NULL');
        await queryRunner.query('ALTER TABLE "swap_out" ALTER COLUMN "lockScript" DROP NOT NULL');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {}
}
