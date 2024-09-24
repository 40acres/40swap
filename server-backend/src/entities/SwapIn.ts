import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import Decimal from 'decimal.js';
import { DecimalTransformer } from './DecimalTransformer.js';

type SwapInState = 'CREATED'|'CONTRACT_FUNDED'|'INVOICE_PAID'|'CLAIMED';

@Entity()
export class SwapIn {
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
    invoice!: string;

    @Column({ type: 'bytea'})
    privKey!: Buffer;

    @Column({ type: 'text' })
    sweepAddress!: string;

    @Column({ type: 'bytea', nullable: true })
    preImage: Buffer|null = null;

    @Column({ type: 'text' })
    state!: SwapInState;
}