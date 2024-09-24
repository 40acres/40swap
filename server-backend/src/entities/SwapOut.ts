import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DecimalTransformer } from './DecimalTransformer.js';
import Decimal from 'decimal.js';

type SwapOutState = 'CREATED'|'INVOICE_PAYMENT_INTENT_RECEIVED'|'CONTRACT_FUNDED'|'CLAIMED';

@Entity()
export class SwapOut {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'text' })
    contractAddress!: string;

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer() })
    inputAmount: Decimal = new Decimal(0);

    @Column({ type: 'decimal', precision: 15, scale: 8, transformer: new DecimalTransformer() })
    outputAmount: Decimal = new Decimal(0);

    @Column({ type: 'bytea'})
    lockScript!: Buffer;

    @Column({ type: 'text' })
    state!: SwapOutState;

    @Column({ type: 'bytea'})
    preImageHash!: Buffer;

    @Column({ type: 'bytea', nullable: true })
    preImage: Buffer|null = null;

    @Column({ type: 'text', nullable: true })
    lockTxId: string|null  = null;

    @Column({ type: 'text', nullable: true })
    claimTxId: string|null  = null;
}