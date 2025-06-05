export const jsonEquals = (prev: object|undefined, next: object|undefined): boolean => JSON.stringify(prev) === JSON.stringify(next);
