import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { deliverPdf } from '../../utils/pdfDelivery';
import { reportService } from './report.service';
import {
  dateRangeSchema,
  moversQuerySchema,
  expiryQuerySchema,
  rebuildSchema,
} from './report.validation';

export const reportController = {
  sales: asyncHandler(async (req: Request, res: Response) => {
    const query = dateRangeSchema.parse(req.query);
    const report = await reportService.salesReport(req.tenantId!, query);
    res.json({ data: report });
  }),

  // Profit/loss draws from the same pre-aggregated source as the sales report.
  profitLoss: asyncHandler(async (req: Request, res: Response) => {
    const query = dateRangeSchema.parse(req.query);
    const report = await reportService.salesReport(req.tenantId!, query);
    res.json({
      data: {
        from: report.from,
        to: report.to,
        totalRevenue: report.totalRevenue,
        totalCost: report.totalCost,
        grossProfit: report.grossProfit,
        days: report.days,
      },
    });
  }),

  salesPdf: asyncHandler(async (req: Request, res: Response) => {
    const query = dateRangeSchema.parse(req.query);
    const pdf = await reportService.salesReportPdf(req.tenantId!, query);
    await deliverPdf(res, pdf);
  }),

  movers: asyncHandler(async (req: Request, res: Response) => {
    const query = moversQuerySchema.parse(req.query);
    const data = await reportService.movers(req.tenantId!, query);
    res.json({ data });
  }),

  dashboard: asyncHandler(async (req: Request, res: Response) => {
    const data = await reportService.dashboard(req.tenantId!);
    res.json({ data });
  }),

  expiry: asyncHandler(async (req: Request, res: Response) => {
    const query = expiryQuerySchema.parse(req.query);
    const data = await reportService.expiry(req.tenantId!, query);
    res.json({ data });
  }),

  rebuild: asyncHandler(async (req: Request, res: Response) => {
    const { date } = rebuildSchema.parse(req.body);
    const branches = await reportService.rebuildDailySummary(req.tenantId!, date ?? new Date());
    res.json({ data: { rebuiltBranches: branches } });
  }),
};
