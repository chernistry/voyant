import type { IrropsOption, UserPreferences } from '../schemas/irrops.js';

interface RankingWeights {
  price: number;
  schedule: number;
  carrier: number;
  disruption: number;
}

const DEFAULT_WEIGHTS: RankingWeights = {
  price: 0.3,
  schedule: 0.4,
  carrier: 0.2,
  disruption: 0.1
};

export function rankOptions(
  options: IrropsOption[],
  preferences: UserPreferences = {},
  weights: RankingWeights = DEFAULT_WEIGHTS
): IrropsOption[] {
  if (options.length === 0) return [];

  const scoredOptions = options.map(option => ({
    ...option,
    score: calculateScore(option, preferences, weights, options)
  }));

  return scoredOptions
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Return top 3 options
}

function calculateScore(
  option: IrropsOption,
  preferences: UserPreferences,
  weights: RankingWeights,
  allOptions: IrropsOption[]
): number {
  const priceScore = calculatePriceScore(option, preferences, allOptions);
  const scheduleScore = calculateScheduleScore(option);
  const carrierScore = calculateCarrierScore(option, preferences);
  const disruptionScore = calculateDisruptionScore(option);

  return (
    priceScore * weights.price +
    scheduleScore * weights.schedule +
    carrierScore * weights.carrier +
    disruptionScore * weights.disruption
  );
}

function calculatePriceScore(
  option: IrropsOption,
  preferences: UserPreferences,
  allOptions: IrropsOption[]
): number {
  const maxIncrease = preferences.maxPriceIncrease || 1000;
  
  if (option.priceChange.amount > maxIncrease) return 0;
  if (option.priceChange.amount <= 0) return 1;

  const maxPrice = Math.max(...allOptions.map(o => o.priceChange.amount));
  return 1 - (option.priceChange.amount / maxPrice);
}

function calculateScheduleScore(option: IrropsOption): number {
  // Prefer options with fewer segments (less complex)
  const segmentPenalty = Math.max(0, option.segments.length - 2) * 0.1;
  return Math.max(0, 1 - segmentPenalty);
}

function calculateCarrierScore(
  option: IrropsOption,
  preferences: UserPreferences
): number {
  if (!preferences.preferredCarriers?.length) return 0.5;
  
  const hasPreferredCarrier = option.segments.some(segment =>
    preferences.preferredCarriers!.includes(segment.carrier)
  );
  
  return hasPreferredCarrier ? 1 : 0.2;
}

function calculateDisruptionScore(option: IrropsOption): number {
  // Higher confidence = less disruption risk
  return option.confidence;
}
