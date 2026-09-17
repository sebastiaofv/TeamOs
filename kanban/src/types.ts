// Compatibility facade for the type surface.
//
// New code should import domain values from domain/types and portfolio
// session/view values from features/portfolio/types. Keeping this facade lets
// transitional callers move without changing the type contracts at once.

export type * from './domain/types';
export type * from './features/portfolio/types';
export type * from './infrastructure/browser/types';
export type * from './app/types';
export type * from './shared/types/ui';
