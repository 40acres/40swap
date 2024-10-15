import { Column, Entity } from 'typeorm';
import { SwapInStatus } from '@40swap/shared';
import { Swap } from './Swap.js';

@Entity()
export class SwapIn extends Swap {
    @Column({ type: 'text' })
    status!: SwapInStatus;
}