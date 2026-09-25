import { describe, expect, it } from 'vitest';
import { DEFAULT_PORTFOLIO_FILTERS, getActivePortfolioFilterNames } from '../../src/domain/portfolioFilters';

describe('getActivePortfolioFilterNames', () => {
  it('lists the panel filters that differ from their defaults, in panel order', () => {
    expect(getActivePortfolioFilterNames(DEFAULT_PORTFOLIO_FILTERS)).toEqual([]);
    expect(getActivePortfolioFilterNames({
      ...DEFAULT_PORTFOLIO_FILTERS, effort: 'L', archive: 'all', priority: 'high'
    })).toEqual(['archive', 'priority', 'effort']);
  });

  it('ignores the search text, which lives outside the panel', () => {
    expect(getActivePortfolioFilterNames({ ...DEFAULT_PORTFOLIO_FILTERS, search: 'beta' })).toEqual([]);
  });

  it('treats missing or invalid values as defaults', () => {
    expect(getActivePortfolioFilterNames(null)).toEqual([]);
    expect(getActivePortfolioFilterNames({ priority: 'urgent', blocked: 'blocked' } as never)).toEqual(['blocked']);
  });
});
