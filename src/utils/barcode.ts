/** EAN-13 check digit for a 12-digit numeric string. */
function ean13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(digits12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generate an internal EAN-13 barcode for a product that ships without one.
 * Uses the GS1 "restricted distribution" prefix 20–29 (reserved for in-store /
 * own-use numbering — never a real manufacturer product), so generated codes
 * can't clash with scanned manufacturer barcodes. Returns 13 numeric digits,
 * scannable like any EAN-13. Uniqueness per tenant is still enforced by the
 * `Product` index; the service regenerates on the rare collision.
 */
export function generateInternalBarcode(): string {
  const body = '20' + Math.floor(Math.random() * 1e10).toString().padStart(10, '0');
  return body + String(ean13CheckDigit(body));
}
