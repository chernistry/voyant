import { describe, it, expect } from '@jest/globals';
import { ConstraintValidator } from '../../src/core/constraint_validator.js';

describe('ConstraintValidator', () => {
  const validator = new ConstraintValidator();

  describe('validateMCT', () => {
    it('should validate sufficient connection time', async () => {
      const arrival = new Date('2024-12-15T10:00:00Z');
      const departure = new Date('2024-12-15T12:00:00Z'); // 2 hours later
      
      const result = await validator.validateMCT('JFK', 'JFK', arrival, departure);
      
      expect(result.valid).toBe(true);
      expect(result.mctMinutes).toBe(60);
      expect(result.bufferMinutes).toBe(60);
    });

    it('should reject insufficient connection time', async () => {
      const arrival = new Date('2024-12-15T10:00:00Z');
      const departure = new Date('2024-12-15T10:30:00Z'); // 30 minutes later
      
      const result = await validator.validateMCT('JFK', 'JFK', arrival, departure);
      
      expect(result.valid).toBe(false);
      expect(result.bufferMinutes).toBe(-30);
    });

    it('should use international MCT for international connections', async () => {
      const arrival = new Date('2024-12-15T10:00:00Z');
      const departure = new Date('2024-12-15T11:30:00Z'); // 90 minutes later
      
      const result = await validator.validateMCT('LHR', 'CDG', arrival, departure);
      
      expect(result.valid).toBe(true);
      expect(result.mctMinutes).toBe(90);
    });
  });

  describe('validateFareRules', () => {
    it('should calculate change fees for partial changes', async () => {
      const result = await validator.validateFareRules('AA123', [], 'partial');
      
      expect(result.valid).toBe(true);
      expect(result.fee).toBe(150);
      expect(result.restrictions).toContain('Same day changes only');
    });

    it('should calculate higher fees for full changes', async () => {
      const result = await validator.validateFareRules('AA123', [], 'full');
      
      expect(result.valid).toBe(true);
      expect(result.fee).toBe(300);
    });
  });

  describe('validateCarrierChange', () => {
    it('should allow same carrier changes', async () => {
      const result = await validator.validateCarrierChange('AA', 'AA');
      
      expect(result.allowed).toBe(true);
      expect(result.conditions).toHaveLength(0);
    });

    it('should allow alliance partner changes', async () => {
      const result = await validator.validateCarrierChange('UA', 'LH'); // Star Alliance
      
      expect(result.allowed).toBe(true);
      expect(result.conditions).toContain('Alliance partner rules apply');
    });

    it('should reject non-alliance carrier changes', async () => {
      const result = await validator.validateCarrierChange('AA', 'DL');
      
      expect(result.allowed).toBe(false);
    });
  });
});
