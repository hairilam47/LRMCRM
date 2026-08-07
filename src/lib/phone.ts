/**
 * Normalizes a free-text phone number — LRMCRM's `contacts.phone` has no
 * format constraint (seed/UI data looks like "+6012 3000000", "012-3000000")
 * — into an OpenWA WhatsApp chatId ("<digits>@c.us"). OpenWA does not
 * normalize numbers itself (confirmed: SendTextMessageDto.chatId expects the
 * literal `628123456789@c.us` shape), so this has to happen on our side
 * before any send.
 *
 * Returns null if too few digits remain to plausibly be a real number —
 * callers should treat that as "unreachable", not attempt a send, and
 * exclude the recipient from audience counts.
 */
export function toWhatsAppChatId(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${digits}@c.us`;
}
