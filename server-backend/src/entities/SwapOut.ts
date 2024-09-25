import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DecimalTransformer } from './DecimalTransformer.js';
import Decimal from 'decimal.js';
import { SwapOutStatus } from '@40swap/shared';

@Entity()
export class SwapOut {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'text' })
    contractAddress!: string;

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer() })
    inputAmount: Decimal = new Decimal(0);

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer(), nullable: true })
    outputAmount: Decimal|null = null;

    @Column({ type: 'bytea'})
    lockScript!: Buffer;

    @Column({ type: 'text' })
    status!: SwapOutStatus;

    @Column({ type: 'bytea'})
    preImageHash!: Buffer;

    @Column({ type: 'bytea', nullable: true })
    preImage: Buffer|null = null;

    @Column({ type: 'bytea', nullable: true })
    lockTx: Buffer|null  = null;

    @Column({ type: 'text', nullable: true })
    invoice!: string;

    @Column({ type: 'text', nullable: true })
    claimTxId: string|null  = null;
}