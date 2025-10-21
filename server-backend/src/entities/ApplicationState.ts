import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class ApplicationState {
    @PrimaryColumn({ length: 128 })
    key!: string;

    @Column({ type: 'json' })
    value!: object | string | number | boolean;
}
