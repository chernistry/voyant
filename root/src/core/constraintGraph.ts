
export const CONSTRAINT_TYPES = [
  'budget',
  'group',
  'special',
  'accommodation',
  'transport',
  'time',
  'location',
  'person'
] as const;

export type ConstraintType = typeof CONSTRAINT_TYPES[number];
export type Complexity = 'simple' | 'moderate' | 'complex';

/**
 * Build coverage graph for all constraint combinations.
 * Each key is a '+'-joined sorted combo or 'none'.
 */
export function buildConstraintGraph(): Map<string, Complexity> {
  const graph = new Map<string, Complexity>();
  const n = CONSTRAINT_TYPES.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const combo: ConstraintType[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        const constraintType = CONSTRAINT_TYPES[i];
        if (constraintType) combo.push(constraintType);
      }
    }
    const key = combo.length ? combo.join('+') : 'none';
    const complexity: Complexity =
      combo.length <= 1 ? 'simple' : combo.length <= 3 ? 'moderate' : 'complex';
    graph.set(key, complexity);
  }
  return graph;
}

/**
 * Normalize a list of constraint categories to a graph key.
 */
export function getCombinationKey(cats: ConstraintType[]): string {
  return cats.length ? [...cats].sort().join('+') : 'none';
}
