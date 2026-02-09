import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { DecimalTransformer } from './DecimalTransformer.js';
import Decimal from 'decimal.js';

export type LiquiditySwapStatus = 'CREATED' | 'IN_PROGRESS' | 'DONE';

export type LiquiditySwapOutcome = 'SUCCESS' | 'ERROR';

@Entity()
export class LiquiditySwap {
    @PrimaryColumn({ type: 'text' })
    id!: string;

    @Column({ type: 'text' })
    channelId!: string;

    @Column({ type: 'text' })
    peerAlias!: string;

    @Column({ type: 'text' })
    remotePubkey!: string;

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer() })
    amount!: Decimal;

    @Column({ type: 'text' })
    strategy!: string;

    @Column({ type: 'text' })
    status!: LiquiditySwapStatus;

    @Column({ type: 'text', nullable: true })
    outcome: LiquiditySwapOutcome | null = null;

    @Column({ type: 'text', nullable: true })
    providerTxId: string | null = null;

    @Column({ type: 'text', nullable: true })
    lightningInvoice: string | null = null;

    @Column({ type: 'text', nullable: true })
    address: string | null = null;

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer(), nullable: true })
    cost: Decimal | null = null;

    @Column({ type: 'text', nullable: true })
    errorMessage: string | null = null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt!: Date;

    @Column({ type: 'timestamptz', nullable: true })
    completedAt: Date | null = null;
}
