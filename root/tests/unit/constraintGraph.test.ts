import {
  buildConstraintGraph,
  getCombinationKey,
  CONSTRAINT_TYPES,
} from '../../src/core/constraintGraph.js';

describe('constraint graph coverage', () => {
  test('covers all combinations', () => {
    const g = buildConstraintGraph();
    expect(g.size).toBe(1 << CONSTRAINT_TYPES.length);
  });

  test('classifies complexity by size', () => {
    const g = buildConstraintGraph();
    expect(g.get('none')).toBe('simple');
    expect(g.get(getCombinationKey(['budget']))).toBe('simple');
    expect(g.get(getCombinationKey(['budget', 'group']))).toBe('moderate');
    expect(
      g.get(getCombinationKey(['budget', 'group', 'special', 'time']))
    ).toBe('complex');
  });
});
