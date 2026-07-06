/** SG mobile/local numbers start 3/6/8/9 and are 8 digits. Returns E.164 +65…. */
export function normalizePhone(
  raw: string,
): { ok: true; phone: string } | { ok: false } {
  const digits = raw.replace(/[^\d]/g, "");
  const local =
    digits.startsWith("65") && digits.length === 10 ? digits.slice(2) : digits;
  if (!/^[3689]\d{7}$/.test(local)) return { ok: false };
  return { ok: true, phone: `+65${local}` };
}
