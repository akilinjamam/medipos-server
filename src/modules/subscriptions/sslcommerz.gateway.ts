import { createHash } from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

/**
 * SSLCommerz payment gateway adapter (design doc §4). Handles three things:
 *  1. Initiating a hosted payment session (returns the GatewayPageURL).
 *  2. Verifying an IPN's `verify_sign` MD5 hash (proves it carries our passwd).
 *  3. Server-to-server validation of a transaction via its `val_id`.
 *
 * Disabled gracefully when store credentials are absent (local/dev).
 */

const SANDBOX_BASE = 'https://sandbox.sslcommerz.com';
const LIVE_BASE = 'https://securepay.sslcommerz.com';

function baseUrl(): string {
  return env.SSLCOMMERZ_SANDBOX ? SANDBOX_BASE : LIVE_BASE;
}

function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

export function isConfigured(): boolean {
  return Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWD);
}

export interface InitSessionParams {
  tranId: string;
  amount: number;
  plan: string;
  tenantId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
}

export interface InitSessionResult {
  gatewayUrl: string;
  sessionkey: string;
  tranId: string;
}

/** SSLCommerz validation API response (subset we care about). */
export interface ValidationResult {
  status: string; // VALID | VALIDATED | INVALID_TRANSACTION | ...
  tranId: string;
  amount: number;
  currency: string;
  valueA?: string; // tenantId passthrough
  valueB?: string; // plan passthrough
}

export const sslcommerzGateway = {
  isConfigured,

  /** Create a hosted checkout session and return its GatewayPageURL. */
  async initSession(params: InitSessionParams): Promise<InitSessionResult> {
    const form = new URLSearchParams({
      store_id: env.SSLCOMMERZ_STORE_ID!,
      store_passwd: env.SSLCOMMERZ_STORE_PASSWD!,
      total_amount: String(params.amount),
      currency: 'BDT',
      tran_id: params.tranId,
      success_url: params.successUrl,
      fail_url: params.failUrl,
      cancel_url: params.cancelUrl,
      ipn_url: params.ipnUrl,
      // Passthroughs come back on the IPN so we know who/what was paid for.
      value_a: params.tenantId,
      value_b: params.plan,
      shipping_method: 'NO',
      product_name: `MediPOS ${params.plan} subscription`,
      product_category: 'subscription',
      product_profile: 'non-physical-goods',
      num_of_item: '1',
      cus_name: params.customerName,
      cus_phone: params.customerPhone,
      cus_email: params.customerEmail ?? 'noreply@medipos.app',
      cus_add1: 'N/A',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
    });

    const res = await fetch(`${baseUrl()}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    const data = (await res.json()) as {
      status?: string;
      GatewayPageURL?: string;
      sessionkey?: string;
      failedreason?: string;
    };

    if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
      logger.error(`SSLCommerz session init failed: ${data.failedreason ?? data.status}`);
      throw new Error(data.failedreason ?? 'Failed to initiate payment session');
    }

    return {
      gatewayUrl: data.GatewayPageURL,
      sessionkey: data.sessionkey ?? '',
      tranId: params.tranId,
    };
  },

  /**
   * Verify the IPN's `verify_sign` hash (SSLCommerz docs): build `key=value`
   * pairs for every field listed in `verify_key`, append `store_passwd` as its
   * MD5, sort, join with `&`, and MD5 the result — it must equal `verify_sign`.
   */
  verifySignature(body: Record<string, string>): boolean {
    const sign = body.verify_sign;
    const keyList = body.verify_key;
    if (!sign || !keyList || !env.SSLCOMMERZ_STORE_PASSWD) return false;

    const pairs = keyList.split(',').map((k) => `${k}=${body[k] ?? ''}`);
    pairs.push(`store_passwd=${md5(env.SSLCOMMERZ_STORE_PASSWD)}`);
    pairs.sort();

    return md5(pairs.join('&')) === sign;
  },

  /** Server-to-server confirmation that a transaction really succeeded. */
  async validate(valId: string): Promise<ValidationResult> {
    const url = new URL(`${baseUrl()}/validator/api/validationserverAPI.php`);
    url.searchParams.set('val_id', valId);
    url.searchParams.set('store_id', env.SSLCOMMERZ_STORE_ID!);
    url.searchParams.set('store_passwd', env.SSLCOMMERZ_STORE_PASSWD!);
    url.searchParams.set('format', 'json');

    const res = await fetch(url, { method: 'GET' });
    const data = (await res.json()) as {
      status?: string;
      tran_id?: string;
      amount?: string;
      currency?: string;
      value_a?: string;
      value_b?: string;
    };

    return {
      status: data.status ?? 'UNKNOWN',
      tranId: data.tran_id ?? '',
      amount: Number(data.amount ?? 0),
      currency: data.currency ?? '',
      valueA: data.value_a,
      valueB: data.value_b,
    };
  },
};
