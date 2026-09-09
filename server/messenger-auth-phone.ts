/** A messenger supplies the verified phone; older clients may also require a match. */
export function matchesMessengerPhone(
  verifiedPhone: string | null,
  expectedPhone: string | null,
): boolean {
  return Boolean(
    verifiedPhone &&
      /^\+79\d{9}$/u.test(verifiedPhone) &&
      (expectedPhone === null || verifiedPhone === expectedPhone),
  );
}
