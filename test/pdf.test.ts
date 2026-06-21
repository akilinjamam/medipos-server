import { describe, it, expect } from 'vitest';
import { generateInvoicePdf } from '../src/utils/pdf';

describe('generateInvoicePdf', () => {
  it('produces a non-empty PDF buffer', async () => {
    const buf = await generateInvoicePdf({
      invoiceNo: 'INV-1',
      date: new Date('2026-06-21T00:00:00Z'),
      tenantName: 'Acme Pharmacy',
      branding: { primaryColor: '#0d9488', invoiceFooter: 'Thank you' },
      customerName: 'John',
      lines: [
        { name: 'Napa 500mg', batchNo: 'B1', qty: 2, unitPrice: 10, discount: 1 },
        { name: 'Seclo 20mg', batchNo: 'B2', qty: 1, unitPrice: 8, discount: 0 },
      ],
      totalAmount: 27,
      paidAmount: 27,
      dueAmount: 0,
      paymentMethod: 'cash',
    });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    // PDF magic header.
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
