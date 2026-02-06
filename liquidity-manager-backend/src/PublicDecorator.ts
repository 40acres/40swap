import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './AuthGuard.js';

export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
