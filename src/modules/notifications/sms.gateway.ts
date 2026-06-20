import { logger } from '../../utils/logger';

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * SMS gateway adapter (design doc §4 — a local BD provider like Alpha SMS /
 * SSL Wireless). Stubbed to log only; swap the body for a real HTTP call and
 * drive it from a BullMQ worker (design doc §10) rather than the request path.
 */
export const smsGateway = {
  async send(message: SmsMessage): Promise<{ queued: boolean }> {
    logger.info(`[sms] -> ${message.to}: ${message.body}`);
    return { queued: true };
  },

  async sendMany(messages: SmsMessage[]): Promise<{ queued: number }> {
    await Promise.all(messages.map((m) => this.send(m)));
    return { queued: messages.length };
  },
};
