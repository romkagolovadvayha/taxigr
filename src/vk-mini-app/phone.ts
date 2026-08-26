export type VkPhoneResponse = {
  phone_number?: unknown;
  sign?: unknown;
};

export function extractSignedVkPhone(response: VkPhoneResponse): {
  phoneNumber: string;
  sign: string;
} | null {
  const phoneNumber = typeof response.phone_number === 'string'
    ? response.phone_number.trim()
    : '';
  const sign = typeof response.sign === 'string' ? response.sign.trim() : '';
  if (!phoneNumber || !sign) return null;
  return { phoneNumber, sign };
}
