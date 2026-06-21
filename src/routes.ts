/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from 'express';
import tenantRoutes from './modules/tenants/tenant.routes';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import branchRoutes from './modules/branches/branch.routes';
import productRoutes from './modules/products/product.routes';
import batchRoutes from './modules/batches/batch.routes';
import supplierRoutes from './modules/suppliers/supplier.routes';
import customerRoutes from './modules/customers/customer.routes';
import purchaseRoutes from './modules/purchases/purchase.routes';
import saleRoutes from './modules/sales/sale.routes';
import reportRoutes from './modules/reports/report.routes';
import subscriptionRoutes from './modules/subscriptions/subscription.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import apiTokenRoutes from './modules/apiTokens/apiToken.routes';
import transferRoutes from './modules/transfers/transfer.routes';

/**
 * Central API router. Mount each feature module here as it is built out
 * (auth, branches, users, products, batches, suppliers, purchases, sales,
 * customers, reports, subscriptions, notifications — design doc §6).
 */
const api = Router();

type TRoutes = {
  route: string;
  modules: any;
};

const routes: TRoutes[] = [
  {
    route: '/auth',
    modules: authRoutes,
  },
  {
    route: '/tenants',
    modules: tenantRoutes,
  },
  {
    route: '/users',
    modules: userRoutes,
  },
  {
    route: '/branches',
    modules: branchRoutes,
  },
  {
    route: '/products',
    modules: productRoutes,
  },
  {
    route: '/batches',
    modules: batchRoutes,
  },
  {
    route: '/suppliers',
    modules: supplierRoutes,
  },
  {
    route: '/customers',
    modules: customerRoutes,
  },
  {
    route: '/purchases',
    modules: purchaseRoutes,
  },
  {
    route: '/sales',
    modules: saleRoutes,
  },
  {
    route: '/reports',
    modules: reportRoutes,
  },
  {
    route: '/subscriptions',
    modules: subscriptionRoutes,
  },
  {
    route: '/notifications',
    modules: notificationRoutes,
  },
  {
    route: '/api-tokens',
    modules: apiTokenRoutes,
  },
  {
    route: '/transfers',
    modules: transferRoutes,
  },
];

routes.forEach((module: TRoutes) => api.use(module.route, module.modules));

export default api;
