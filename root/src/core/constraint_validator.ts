import type { PNR } from '../schemas/irrops.js';

interface MCTResult {
  valid: boolean;
  mctMinutes: number;
  bufferMinutes: number;
}

interface FareResult {
  valid: boolean;
  fee: number;
  restrictions: string[];
}

interface CarrierResult {
  allowed: boolean;
  conditions: string[];
}

// Minimal MCT table for major airports
const MCT_TABLE: Record<string, { domestic: number; international: number }> = {
  'JFK': { domestic: 60, international: 90 },
  'LAX': { domestic: 45, international: 75 },
  'LHR': { domestic: 60, international: 90 },
  'CDG': { domestic: 60, international: 90 },
  'DXB': { domestic: 60, international: 90 },
  'SIN': { domestic: 45, international: 75 }
};

export class ConstraintValidator {
  async validateMCT(
    origin: string,
    connection: string,
    arrival: Date,
    departure: Date
  ): Promise<MCTResult> {
    const mctData = MCT_TABLE[connection] || { domestic: 60, international: 90 };
    const isInternational = this.isInternationalConnection(origin, connection);
    const requiredMCT = isInternational ? mctData.international : mctData.domestic;
    
    const connectionTime = (departure.getTime() - arrival.getTime()) / (1000 * 60);
    const bufferMinutes = connectionTime - requiredMCT;
    
    return {
      valid: connectionTime >= requiredMCT,
      mctMinutes: requiredMCT,
      bufferMinutes: Math.round(bufferMinutes)
    };
  }

  async validateFareRules(
    originalFare: string,
    newSegments: PNR['segments'],
    changeType: 'partial' | 'full'
  ): Promise<FareResult> {
    // Simplified fare validation - in production would integrate with fare rules engine
    const baseFee = changeType === 'partial' ? 150 : 300;
    const cabinUpgradeFee = this.calculateCabinUpgrade(newSegments);
    
    return {
      valid: true,
      fee: baseFee + cabinUpgradeFee,
      restrictions: ['Same day changes only', 'No refund for downgrades']
    };
  }

  async validateCarrierChange(
    originalCarrier: string,
    newCarrier: string,
    policyReceipts: string[] = []
  ): Promise<CarrierResult> {
    // Same carrier - no conditions needed
    if (originalCarrier === newCarrier) {
      return {
        allowed: true,
        conditions: []
      };
    }
    
    const isAlliance = this.checkAlliance(originalCarrier, newCarrier);
    const hasPolicy = policyReceipts.some(r => r.includes('carrier_change_allowed'));
    
    return {
      allowed: isAlliance || hasPolicy,
      conditions: isAlliance ? ['Alliance partner rules apply'] : []
    };
  }

  private isInternationalConnection(origin: string, connection: string): boolean {
    // Simplified country mapping - in production would use proper airport database
    const usAirports = ['JFK', 'LAX', 'ORD', 'DFW', 'ATL'];
    return !usAirports.includes(origin) || !usAirports.includes(connection);
  }

  private calculateCabinUpgrade(segments: PNR['segments']): number {
    // Simplified cabin upgrade calculation
    return segments.some(s => s.cabin === 'J' || s.cabin === 'F') ? 200 : 0;
  }

  private checkAlliance(carrier1: string, carrier2: string): boolean {
    const starAlliance = ['UA', 'LH', 'SG', 'AC', 'TK'];
    const oneWorld = ['AA', 'BA', 'QF', 'JL', 'CX'];
    const skyTeam = ['DL', 'AF', 'KL', 'AZ', 'VS'];
    
    return [starAlliance, oneWorld, skyTeam].some(alliance => 
      alliance.includes(carrier1) && alliance.includes(carrier2)
    );
  }
}
