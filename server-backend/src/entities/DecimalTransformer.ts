import Decimal from 'decimal.js';
import { ValueTransformer } from 'typeorm';

export class DecimalTransformer implements ValueTransformer {
    /**
     * Used to marshal Decimal when writing to the database.
     */
    to(decimal?: Decimal): string | null {
        return decimal ? decimal.toString() : null;
    }
    /**
     * Used to unmarshal Decimal when reading from the database.
     */
    from(decimal?: string): Decimal | null {
        return decimal ? new Decimal(decimal) : null;
    }
}
