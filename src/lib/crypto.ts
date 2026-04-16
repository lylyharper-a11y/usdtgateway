import CryptoJS from "crypto-js";
import crypto from "crypto";

const ENC_KEY = process.env.ENCRYPTION_KEY || "default_key_change_me_32chars!!";

// Encrypt private key before storing in DB
export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, ENC_KEY).toString();
}

// Decrypt private key from DB
export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENC_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// HMAC-SHA256 for callback signing
export function signHmac(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

// Generate random API key
export function generateApiKey(): string {
  return `ugw_${crypto.randomBytes(24).toString("hex")}`;
}

// Generate random secret key
export function generateSecretKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Generate order code
export function generateOrderCode(type: "deposit" | "withdrawal"): string {
  const prefix = type === "deposit" ? "UDEP" : "UWD";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}
