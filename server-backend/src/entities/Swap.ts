import { Column, CreateDateColumn, PrimaryColumn } from 'typeorm';
import { DecimalTransformer } from './DecimalTransformer.js';
import Decimal from 'decimal.js';
import { SwapOutcome } from '@40swap/shared';

export class Swap {
    @PrimaryColumn({ type: 'text' })
    id!: string;

    @Column({ type: 'text' })
    contractAddress!: string;

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer() })
    inputAmount: Decimal = new Decimal(0);

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer() })
    outputAmount: Decimal = new Decimal(0);

    @Column({ type: 'bytea'})
    lockScript!: Buffer;

    @Column({ type: 'integer' })
    timeoutBlockHeight!: number;

    @Column({ type: 'text' })
    invoice!: string;

    @Column({ type: 'bytea', nullable: true })
    preImage: Buffer|null = null;

    @Column({ type: 'bytea', nullable: true })
    lockTx: Buffer|null  = null;

    @Column({ type: 'integer' })
    lockTxHeight!: number;

    @Column({ type: 'bytea', nullable: true })
    unlockTx: Buffer|null  = null;

    @Column({ type: 'integer' })
    unlockTxHeight!: number;

    @Column({ type: 'text' })
    sweepAddress!: string;

    @Column({ type: 'bytea'})
    unlockPrivKey!: Buffer;

    @Column({ type: 'text', nullable: true })
    outcome: SwapOutcome|null = null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @CreateDateColumn({ type: 'timestamptz' })
    modifiedAt!: Date;
}