import { Column, Entity, PrimaryColumn } from 'typeorm';
import { DecimalTransformer } from './DecimalTransformer.js';
import Decimal from 'decimal.js';
import { SwapOutStatus } from '@40swap/shared';

@Entity()
export class SwapOut {
    @PrimaryColumn({ type: 'text' })
    id!: string;

    @Column({ type: 'text' })
    contractAddress!: string;

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer() })
    inputAmount: Decimal = new Decimal(0);

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer(), nullable: true })
    outputAmount: Decimal = new Decimal(0);

    @Column({ type: 'bytea'})
    lockScript!: Buffer;

    @Column({ type: 'integer' })
    timeoutBlockHeight!: number;

    @Column({ type: 'text', nullable: true })
    invoice!: string;

    @Column({ type: 'bytea'})
    preImageHash!: Buffer;

    @Column({ type: 'bytea', nullable: true })
    preImage: Buffer|null = null;

    @Column({ type: 'bytea', nullable: true })
    lockTx: Buffer|null  = null;

    @Column({ type: 'text', nullable: true })
    claimTxId: string|null  = null;

    @Column({ type: 'text' })
    refundAddress!: string;

    @Column({ type: 'bytea' })
    refundKey!: Buffer;

    @Column({ type: 'text' })
    status!: SwapOutStatus;
}