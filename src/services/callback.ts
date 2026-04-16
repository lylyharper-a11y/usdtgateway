import { signHmac } from "../lib/crypto";
import { sendAlert } from "./telegram";

interface CallbackPayload {
  event: string;
  orderCode: string;
  amountUsdt: number;
  amountVnd: number;
  txHash?: string;
  status: string;
  timestamp: string;
}

// Send webhook callback to partner
export async function sendCallback(
  callbackUrl: string,
  secretKey: string,
  payload: CallbackPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const body = JSON.stringify(payload);
    const signature = signHmac(body, secretKey);

    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature": signature,
        "x-timestamp": payload.timestamp,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    return { success: res.ok, statusCode: res.status };
  } catch (err: any) {
    console.error(`[Callback] Failed to ${callbackUrl}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Re-export sendTelegram as alias for backward compatibility
export { sendAlert as sendTelegram };
