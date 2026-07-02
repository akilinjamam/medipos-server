import { describe, it, expect } from 'vitest';
import { generateTenantCode, TENANT_CODE_REGEX } from '../src/modules/tenants/tenantCode';

describe('generateTenantCode', () => {
  it('produces codes in the expected format', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateTenantCode();
      expect(code).toMatch(/^MP-[A-HJ-NP-Z2-9]{6}$/);
      expect(code).toMatch(TENANT_CODE_REGEX);
    }
  });

  it('never contains ambiguous characters (0/O/1/I/L)', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateTenantCode()).not.toMatch(/[0O1IL]/);
    }
  });

  it('is never mistakable for a 24-hex ObjectId', () => {
    // Codes are at most 15 chars (TENANT_CODE_REGEX), so resolveByCodeOrId's
    // ObjectId branch can never swallow one.
    expect(generateTenantCode().length).toBeLessThan(24);
  });

  it('varies between calls', () => {
    const codes = new Set(Array.from({ length: 50 }, generateTenantCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('TENANT_CODE_REGEX (custom vanity codes)', () => {
  it('accepts reasonable custom codes', () => {
    for (const code of ['LAZZ-01', 'MEDI2', 'MP-4K7TQ2']) {
      expect(code).toMatch(TENANT_CODE_REGEX);
    }
  });

  it('rejects codes that could collide with ObjectIds or bad input', () => {
    for (const code of ['ab', '-LEADING', 'A'.repeat(16), 'has space', '665f1a2b3c4d5e6f7a8b9c0d']) {
      expect(code).not.toMatch(TENANT_CODE_REGEX);
    }
  });
});
