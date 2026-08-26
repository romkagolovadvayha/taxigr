import { createECDH, createHmac } from 'node:crypto';

import { config } from './config';

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

let cached: VapidConfig | null = null;

export function getVapidConfig(): VapidConfig {
  if (cached) return cached;
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
    cached = {
      publicKey: config.VAPID_PUBLIC_KEY,
      privateKey: config.VAPID_PRIVATE_KEY,
      subject: config.VAPID_SUBJECT,
    };
    return cached;
  }
  const privateKey = createHmac('sha256', config.JWT_SECRET)
    .update('taxigr:web-push:v1')
    .digest();
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(privateKey);
  cached = {
    publicKey: ecdh.getPublicKey(undefined, 'uncompressed').toString('base64url'),
    privateKey: privateKey.toString('base64url'),
    subject: config.VAPID_SUBJECT,
  };
  return cached;
}
