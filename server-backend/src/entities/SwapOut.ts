import { Column, Entity } from 'typeorm';
import { SwapOutStatus } from '@40swap/shared';
import { Swap } from './Swap.js';

@Entity()
export class SwapOut extends Swap {
    @Column({ type: 'text' })
    contractAddress: string | null = null;

    @Column({ type: 'bytea', nullable: true })
    lockScript: Buffer | null = null;

    @Column({ type: 'bytea' })
    preImageHash!: Buffer;

    @Column({ type: 'text' })
    status!: SwapOutStatus;
}
