import { connectDatabase, disconnectDatabase } from '../config/db';
import { Tenant } from '../modules/tenants/tenant.model';
import { generateTenantCode } from '../modules/tenants/tenantCode';
import { logger } from '../utils/logger';

/**
 * One-off: assign a login code to every tenant created before the `code`
 * field existed. Safe to re-run — tenants that already have a code are
 * skipped. Run with: npm run backfill:tenant-codes
 */
async function main(): Promise<void> {
  await connectDatabase();

  const tenants = await Tenant.find({ code: { $exists: false } });
  logger.info(`${tenants.length} tenant(s) missing a code`);

  for (const tenant of tenants) {
    for (let attempt = 0; ; attempt++) {
      tenant.code = generateTenantCode();
      try {
        await tenant.save();
        break;
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || attempt >= 4) throw err;
      }
    }
    logger.info(`${tenant.name}: ${tenant.code}`);
  }

  await disconnectDatabase();
}

main().catch((err) => {
  logger.error('Backfill failed', err);
  process.exit(1);
});
