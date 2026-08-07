/**
 * Thin HTTP client for the OpenWA endpoints a blast needs: a session-ready
 * preflight check and the bulk-send call. Deliberately not a generic OpenWA
 * SDK — just the surface this feature uses. See docs/integration-openwa-
 * whatsapp.md for the full integration design.
 */

export type OpenWaConfig = { baseUrl: string; apiKey: string; sessionId: string };

export function getOpenWaConfig(): OpenWaConfig | null {
  const baseUrl = process.env.OPENWA_BASE_URL;
  const apiKey = process.env.OPENWA_API_KEY;
  const sessionId = process.env.OPENWA_SESSION_ID;
  if (!baseUrl || !apiKey || !sessionId) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, sessionId };
}

export async function checkSessionReady(cfg: OpenWaConfig): Promise<{ ready: boolean; status?: string; error?: string }> {
  try {
    const res = await fetch(`${cfg.baseUrl}/api/sessions/${cfg.sessionId}`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return { ready: false, error: `OpenWA ${res.status}` };
    const json = (await res.json()) as { status?: string };
    return { ready: json.status === "ready", status: json.status };
  } catch (e) {
    return { ready: false, error: (e as Error).message };
  }
}

export type BulkItem = {
  chatId: string;
  type: "text" | "image";
  content: { text?: string; caption?: string; image?: { url: string } };
};

export type BulkSendResult =
  | { ok: true; batchId: string; totalMessages: number }
  | { ok: false; error: string };

/**
 * One call = one OpenWA send-bulk batch (max 100 items, enforced by
 * OpenWA's own DTO — callers must chunk before calling this). OpenWA paces
 * and sequences delivery server-side; delayBetweenMessages/randomizeDelay
 * defaults here are deliberately conservative (OpenWA's own default is
 * 3000ms — we go a little slower) since this is unsolicited marketing
 * traffic to real customers, not transactional replies.
 */
export async function sendBulkBatch(
  cfg: OpenWaConfig,
  messages: BulkItem[],
  opts?: { delayBetweenMessages?: number; randomizeDelay?: boolean }
): Promise<BulkSendResult> {
  try {
    const res = await fetch(`${cfg.baseUrl}/api/sessions/${cfg.sessionId}/messages/send-bulk`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        options: {
          delayBetweenMessages: opts?.delayBetweenMessages ?? 4000,
          randomizeDelay: opts?.randomizeDelay ?? true,
          stopOnError: false,
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return { ok: false, error: `OpenWA ${res.status}: ${detail.slice(0, 500)}` };
    }
    const json = (await res.json()) as { batchId: string; totalMessages: number };
    return { ok: true, batchId: json.batchId, totalMessages: json.totalMessages };
  } catch (e) {
    return { ok: false, error: `OpenWA unreachable: ${(e as Error).message}` };
  }
}
