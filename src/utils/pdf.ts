import PDFDocument from 'pdfkit';
import { TenantBranding } from '../modules/tenants/tenant.model';

export interface InvoiceLine {
  name: string;
  batchNo: string;
  qty: number;
  unitPrice: number;
  discount: number;
}

export interface InvoiceData {
  invoiceNo: string;
  date: Date;
  tenantName: string;
  branding?: TenantBranding;
  customerName?: string;
  lines: InvoiceLine[];
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
}

const money = (n: number): string => n.toFixed(2);

/**
 * Render a sale invoice as a PDF buffer (design doc §4). White-label branding
 * (business name, address, accent colour, footer) is applied when present —
 * otherwise the tenant name and neutral styling are used.
 */
export function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = data.branding?.primaryColor ?? '#0d9488';
    const title = data.branding?.businessName || data.tenantName;

    // Header
    doc.fillColor(accent).fontSize(20).text(title, { align: 'left' });
    doc.fillColor('#444').fontSize(10);
    if (data.branding?.addressLine) doc.text(data.branding.addressLine);
    if (data.branding?.phone) doc.text(`Tel: ${data.branding.phone}`);
    doc.moveDown();

    doc.fillColor('#000').fontSize(14).text('INVOICE', { align: 'right' });
    doc
      .fontSize(10)
      .fillColor('#444')
      .text(`No: ${data.invoiceNo}`, { align: 'right' })
      .text(`Date: ${data.date.toISOString().slice(0, 10)}`, { align: 'right' });
    if (data.customerName) doc.text(`Customer: ${data.customerName}`, { align: 'right' });
    doc.moveDown();

    // Table header
    const top = doc.y + 10;
    const cols = { item: 50, batch: 250, qty: 330, price: 380, disc: 450, total: 500 };
    doc.fillColor(accent).fontSize(10);
    doc.text('Item', cols.item, top);
    doc.text('Batch', cols.batch, top);
    doc.text('Qty', cols.qty, top);
    doc.text('Price', cols.price, top);
    doc.text('Disc', cols.disc, top);
    doc.text('Total', cols.total, top);
    doc
      .moveTo(50, top + 14)
      .lineTo(545, top + 14)
      .strokeColor(accent)
      .stroke();

    // Rows
    doc.fillColor('#000');
    let y = top + 22;
    for (const line of data.lines) {
      const lineTotal = line.qty * line.unitPrice - line.discount;
      doc.text(line.name, cols.item, y, { width: 190 });
      doc.text(line.batchNo, cols.batch, y, { width: 70 });
      doc.text(String(line.qty), cols.qty, y);
      doc.text(money(line.unitPrice), cols.price, y);
      doc.text(money(line.discount), cols.disc, y);
      doc.text(money(lineTotal), cols.total, y);
      y = doc.y + 6;
    }

    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ccc').stroke();
    y += 10;

    // Totals
    const totalsLabel = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(label, cols.disc - 60, y, { width: 110, align: 'right' });
      doc.text(value, cols.total, y, { width: 45, align: 'left' });
      y = doc.y + 4;
    };
    totalsLabel('Total', money(data.totalAmount), true);
    totalsLabel('Paid', money(data.paidAmount));
    totalsLabel('Due', money(data.dueAmount));
    doc.font('Helvetica').fillColor('#444').text(`Payment: ${data.paymentMethod}`, 50, y + 6);

    // Footer
    if (data.branding?.invoiceFooter) {
      doc
        .fontSize(9)
        .fillColor('#888')
        .text(data.branding.invoiceFooter, 50, 760, { align: 'center', width: 495 });
    }

    doc.end();
  });
}

export interface ReportRow {
  date: Date;
  revenue: number;
  cost: number;
  profit: number;
  due: number;
  transactions: number;
}

export interface ReportPdfData {
  title: string;
  tenantName: string;
  branding?: TenantBranding;
  from: Date;
  to: Date;
  rows: ReportRow[];
  totals: Omit<ReportRow, 'date'>;
}

/**
 * Render a pre-aggregated sales/profit report (one row per day) as a PDF buffer
 * (design doc §11). Reads from the same `DailySummary`-backed numbers the JSON
 * report uses, so the export never re-scans raw sales.
 */
export function generateReportPdf(data: ReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = data.branding?.primaryColor ?? '#0d9488';
    const day = (d: Date) => new Date(d).toISOString().slice(0, 10);

    doc.fillColor(accent).fontSize(18).text(data.branding?.businessName || data.tenantName);
    doc.fillColor('#000').fontSize(13).text(data.title);
    doc
      .fontSize(10)
      .fillColor('#444')
      .text(`Period: ${day(data.from)} → ${day(data.to)}`);
    doc.moveDown();

    const cols = { date: 50, rev: 170, cost: 260, profit: 350, due: 440, txn: 510 };
    const top = doc.y + 6;
    doc.fillColor(accent).fontSize(10);
    doc.text('Date', cols.date, top);
    doc.text('Revenue', cols.rev, top);
    doc.text('Cost', cols.cost, top);
    doc.text('Profit', cols.profit, top);
    doc.text('Due', cols.due, top);
    doc.text('Txns', cols.txn, top);
    doc.moveTo(50, top + 14).lineTo(545, top + 14).strokeColor(accent).stroke();

    doc.fillColor('#000');
    let y = top + 22;
    for (const r of data.rows) {
      if (y > 760) {
        doc.addPage();
        y = 50;
      }
      doc.text(day(r.date), cols.date, y);
      doc.text(money(r.revenue), cols.rev, y);
      doc.text(money(r.cost), cols.cost, y);
      doc.text(money(r.profit), cols.profit, y);
      doc.text(money(r.due), cols.due, y);
      doc.text(String(r.transactions), cols.txn, y);
      y = doc.y + 6;
    }

    doc.moveTo(50, y).lineTo(545, y).strokeColor('#ccc').stroke();
    y += 8;
    doc.font('Helvetica-Bold');
    doc.text('Total', cols.date, y);
    doc.text(money(data.totals.revenue), cols.rev, y);
    doc.text(money(data.totals.cost), cols.cost, y);
    doc.text(money(data.totals.profit), cols.profit, y);
    doc.text(money(data.totals.due), cols.due, y);
    doc.text(String(data.totals.transactions), cols.txn, y);
    doc.font('Helvetica');

    doc.end();
  });
}
