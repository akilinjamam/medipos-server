import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * SMS gateway adapter (design doc §4 — a local BD provider like Alpha SMS /
 * SSL Wireless). Posts to `SMS_API_URL` with a simple `api_key`/`to`/`msg` form
 * (the common shape for BD HTTP SMS APIs). When credentials are absent it falls
 * back to logging, so dev/test never sends real messages. Intended to be driven
 * from the cron scheduler (design doc §10), not the request path.
 */
export const smsGateway = {
  async send(message: SmsMessage): Promise<{ queued: boolean }> {
    if (!env.SMS_API_URL || !env.SMS_API_KEY) {
      logger.info(`[sms] (stub) -> ${message.to}: ${message.body}`);
      return { queued: true };
    }

    try {
      const form = new URLSearchParams({
        api_key: env.SMS_API_KEY,
        to: message.to,
        msg: message.body,
        ...(env.SMS_SENDER_ID ? { senderid: env.SMS_SENDER_ID } : {}),
      });

      const res = await fetch(env.SMS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });

      if (!res.ok) {
        logger.error(`[sms] gateway responded ${res.status} for ${message.to}`);
        return { queued: false };
      }
      return { queued: true };
    } catch (err) {
      logger.error(`[sms] send to ${message.to} failed`, err);
      return { queued: false };
    }
  },

  async sendMany(messages: SmsMessage[]): Promise<{ queued: number }> {
    const results = await Promise.all(messages.map((m) => this.send(m)));
    return { queued: results.filter((r) => r.queued).length };
  },
};
