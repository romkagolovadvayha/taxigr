import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

import {
  legalDocuments,
  type DriverLegalAcceptance,
  type InitialLegalAcceptance,
} from '../src/legal/documents';

export const initialLegalAcceptanceSchema = z.object({
  termsAccepted: z.literal(true),
  personalDataAccepted: z.literal(true),
  termsVersion: z.literal(legalDocuments.terms.version),
  passengerRulesVersion: z.literal(legalDocuments.passengerRules.version),
  privacyVersion: z.literal(legalDocuments.privacy.version),
  personalDataConsentVersion: z.literal(legalDocuments.personalDataConsent.version),
});

export const initialLegalQuerySchema = z.object({
  terms_accepted: z.literal('1'),
  personal_data_accepted: z.literal('1'),
  terms_version: z.literal(legalDocuments.terms.version),
  passenger_rules_version: z.literal(legalDocuments.passengerRules.version),
  privacy_version: z.literal(legalDocuments.privacy.version),
  personal_data_consent_version: z.literal(legalDocuments.personalDataConsent.version),
});

export const driverLegalAcceptanceSchema = z.object({
  driverTermsAccepted: z.literal(true),
  driverDataAccepted: z.literal(true),
  driverTermsVersion: z.literal(legalDocuments.driverTerms.version),
  driverDataConsentVersion: z.literal(legalDocuments.driverDataConsent.version),
});

type ConsentMeta = {
  source: 'phone_auth' | 'order_confirmation' | 'driver_application';
  ip?: string;
  userAgent?: string;
};

function cleanMeta(meta: ConsentMeta) {
  return {
    source: meta.source,
    ip: meta.ip?.slice(0, 64) || null,
    userAgent: meta.userAgent?.slice(0, 255) || null,
  };
}

async function recordDocuments(
  connection: PoolConnection,
  userId: string,
  documents: { type: string; version: string }[],
  meta: ConsentMeta,
): Promise<void> {
  const normalized = cleanMeta(meta);
  for (const document of documents) {
    await connection.execute(
      `INSERT INTO user_consents
        (user_id, document_type, document_version, source, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         revoked_at = NULL,
         source = VALUES(source),
         ip_address = VALUES(ip_address),
         user_agent = VALUES(user_agent),
         accepted_at = UTC_TIMESTAMP(3)`,
      [
        userId,
        document.type,
        document.version,
        normalized.source,
        normalized.ip,
        normalized.userAgent,
      ],
    );
  }
}

export async function recordInitialConsents(
  connection: PoolConnection,
  userId: string,
  acceptance: InitialLegalAcceptance,
  meta: ConsentMeta,
): Promise<void> {
  await recordDocuments(
    connection,
    userId,
    [
      { type: legalDocuments.terms.type, version: acceptance.termsVersion },
      { type: legalDocuments.passengerRules.type, version: acceptance.passengerRulesVersion },
      { type: legalDocuments.privacy.type, version: acceptance.privacyVersion },
      {
        type: legalDocuments.personalDataConsent.type,
        version: acceptance.personalDataConsentVersion,
      },
    ],
    meta,
  );
}

export async function recordDriverConsents(
  connection: PoolConnection,
  userId: string,
  acceptance: DriverLegalAcceptance,
  meta: ConsentMeta,
): Promise<void> {
  await recordDocuments(
    connection,
    userId,
    [
      { type: legalDocuments.driverTerms.type, version: acceptance.driverTermsVersion },
      {
        type: legalDocuments.driverDataConsent.type,
        version: acceptance.driverDataConsentVersion,
      },
    ],
    meta,
  );
}

export async function hasCurrentInitialConsents(
  connection: PoolConnection,
  userId: string,
): Promise<boolean> {
  const required = [
    [legalDocuments.terms.type, legalDocuments.terms.version],
    [legalDocuments.passengerRules.type, legalDocuments.passengerRules.version],
    [legalDocuments.privacy.type, legalDocuments.privacy.version],
    [legalDocuments.personalDataConsent.type, legalDocuments.personalDataConsent.version],
  ] as const;
  const [rows] = await connection.query<(RowDataPacket & { document_type: string; document_version: string })[]>(
    `SELECT document_type, document_version
     FROM user_consents
     WHERE user_id = ? AND revoked_at IS NULL`,
    [userId],
  );
  const accepted = new Set(rows.map((row) => `${row.document_type}:${row.document_version}`));
  return required.every(([type, version]) => accepted.has(`${type}:${version}`));
}

export function initialAcceptanceFromQuery(input: z.infer<typeof initialLegalQuerySchema>): InitialLegalAcceptance {
  return {
    termsAccepted: true,
    personalDataAccepted: true,
    termsVersion: input.terms_version,
    passengerRulesVersion: input.passenger_rules_version,
    privacyVersion: input.privacy_version,
    personalDataConsentVersion: input.personal_data_consent_version,
  };
}
