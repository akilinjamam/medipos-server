import { describe, it, expect } from 'vitest';
import { PLAN_FEATURES } from '../src/config/planFeatures';

describe('PLAN_FEATURES gating map', () => {
  it('keeps premium features off the silver plan', () => {
    expect(PLAN_FEATURES.silver).toMatchObject({
      offlineMode: false,
      smsAlerts: false,
      apiAccess: false,
      whiteLabeling: false,
      prescriptionHistory: false,
      branches: 1,
    });
  });

  it('enables offline + SMS on gold but not apiAccess/whiteLabeling', () => {
    expect(PLAN_FEATURES.gold.offlineMode).toBe(true);
    expect(PLAN_FEATURES.gold.smsAlerts).toBe(true);
    expect(PLAN_FEATURES.gold.apiAccess).toBe(false);
    expect(PLAN_FEATURES.gold.whiteLabeling).toBe(false);
  });

  it('unlocks everything on platinum', () => {
    expect(PLAN_FEATURES.platinum.apiAccess).toBe(true);
    expect(PLAN_FEATURES.platinum.whiteLabeling).toBe(true);
    expect(PLAN_FEATURES.platinum.prescriptionHistory).toBe(true);
    expect(PLAN_FEATURES.platinum.branches).toBe(Infinity);
  });
});
