import { ConstraintValidator } from './constraint_validator.js';
import { rankOptions } from './option_ranker.js';
import { searchAlternatives } from '../tools/amadeus_flights.js';
import { observeIrrops } from '../util/metrics.js';
import type { PNR, DisruptionEvent, IrropsOption, UserPreferences } from '../schemas/irrops.js';

export async function processIrrops(
  pnr: PNR,
  disruption: DisruptionEvent,
  preferences: UserPreferences = {},
  signal?: AbortSignal
): Promise<IrropsOption[]> {
  const startTime = Date.now();
  signal?.throwIfAborted();
  
  console.log('🔧 IRROPS: Starting processing', { pnr, disruption });
  
  const validator = new ConstraintValidator();
  const options: IrropsOption[] = [];

  try {
    // Process each affected segment
    for (const segmentIndex of disruption.affectedSegments) {
      const segment = pnr.segments[segmentIndex];
      if (!segment) continue;

      console.log('🔧 IRROPS: Processing segment', segmentIndex, segment);

      try {
        // Generate future date for search (tomorrow or later)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const futureDate = tomorrow.toISOString().split('T')[0]!;
        
        console.log('🔧 IRROPS: Searching alternatives with date', futureDate);
        
        // Search for alternatives using existing Amadeus integration
        const alternatives = await searchAlternatives(
          pnr.segments,
          segmentIndex,
          {
            origin: segment.origin,
            destination: segment.destination,
            departureDate: futureDate,
            cabin: segment.cabin,
            passengers: pnr.passengers.length
          },
          signal
        );

        console.log('🔧 IRROPS: Found alternatives', alternatives.length, alternatives);

        // Validate each alternative
        for (const alt of alternatives.slice(0, 5)) { // Limit to 5 alternatives per segment
          console.log('🔧 IRROPS: Processing alternative', alt);
          
          const newSegments = [...pnr.segments];
          newSegments[segmentIndex] = {
            ...segment,
            departure: alt.departure,
            arrival: alt.arrival,
            carrier: alt.carrier,
            flightNumber: alt.flightNumber
          };

          // Validate constraints
          const mctValid = await validateConnections(newSegments, validator);
          const fareResult = await validator.validateFareRules(
            segment.carrier + segment.flightNumber,
            newSegments,
            'partial'
          );
          const carrierResult = await validator.validateCarrierChange(
            segment.carrier,
            alt.carrier
          );

          console.log('🔧 IRROPS: Validation results', { mctValid, fareResult, carrierResult });

          if (mctValid && fareResult.valid && carrierResult.allowed) {
            const option: IrropsOption = {
              id: `${pnr.recordLocator}-${segmentIndex}-${alt.flightNumber}`,
              type: segmentIndex === 0 ? 'keep_partial' : 'full_reroute',
              segments: newSegments,
              priceChange: {
                amount: fareResult.fee + (alt.price || 0),
                currency: 'USD'
              },
              rulesApplied: [
                `MCT validated for ${segment.origin}`,
                ...fareResult.restrictions,
                ...carrierResult.conditions
              ],
              citations: [
                `Alternative flight ${alt.flightNumber}`,
                `Fare rule: ${fareResult.restrictions[0] || 'Standard change fee'}`
              ],
              confidence: calculateConfidence(alt, segment, disruption)
            };
            
            console.log('🔧 IRROPS: Adding valid option', option);
            options.push(option);
          }
        }
      } catch (error) {
        console.error(`Failed to process segment ${segmentIndex}:`, error);
      }
    }

    console.log('🔧 IRROPS: Total options before ranking', options.length);

    // Rank and return top options
    const rankedOptions = rankOptions(options, preferences);
    
    console.log('🔧 IRROPS: Final ranked options', rankedOptions.length, rankedOptions);
    
    // Record metrics
    const durationMs = Date.now() - startTime;
    observeIrrops(disruption.type, rankedOptions.length, durationMs, true);
    
    return rankedOptions;
  } catch (error) {
    console.error('🔧 IRROPS: Processing failed', error);
    // Record error metrics
    const durationMs = Date.now() - startTime;
    observeIrrops(disruption.type, 0, durationMs, false);
    throw error;
  }
}

async function validateConnections(
  segments: PNR['segments'],
  validator: ConstraintValidator
): Promise<boolean> {
  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i];
    const next = segments[i + 1];
    
    if (!current || !next) continue;
    
    if (current.destination === next.origin) {
      const result = await validator.validateMCT(
        current.origin,
        current.destination,
        new Date(current.arrival),
        new Date(next.departure)
      );
      
      if (!result.valid) return false;
    }
  }
  return true;
}

function calculateConfidence(
  alternative: any,
  originalSegment: PNR['segments'][0],
  disruption: DisruptionEvent
): number {
  let confidence = 0.8; // Base confidence
  
  // Same carrier bonus
  if (alternative.carrier === originalSegment.carrier) {
    confidence += 0.1;
  }
  
  // Disruption severity penalty
  if (disruption.severity === 'high') {
    confidence -= 0.2;
  } else if (disruption.severity === 'low') {
    confidence += 0.1;
  }
  
  return Math.min(1, Math.max(0, confidence));
}
