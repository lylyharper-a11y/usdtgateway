import { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";
import { alertLogin } from "../services/telegram";

// Extract real client IP
function getClientIP(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(xff) ? xff[0] : xff;
  const raw = forwarded?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress || "";
  // Strip IPv6-mapped IPv4 prefix
  return raw.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");
}
// Cache for settings to avoid DB hit on every request
let _settingsCache: Record<string, string> = {};
let _settingsCacheTime = 0;
const CACHE_TTL = 30000; // 30s

async function getSettings(): Promise<Record<string, string>> {
  if (Date.now() - _settingsCacheTime < CACHE_TTL) return _settingsCache;
  const settings = await prisma.setting.findMany();
  _settingsCache = {};
  for (const s of settings) _settingsCache[s.key] = s.value;
  _settingsCacheTime = Date.now();
  return _settingsCache;
}

export function clearSettingsCache() {
  _settingsCacheTime = 0;
}

// Middleware: verify partner API key
export async function verifyApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    res.status(401).json({ error: "Missing x-api-key header" });
    return;
  }

  const partner = await prisma.partner.findUnique({ where: { apiKey } });
  if (!partner || !partner.isActive) {
    res.status(403).json({ error: "Invalid or inactive API key" });
    return;
  }

  (req as any).partner = partner;
  next();
}

// Middleware: verify admin session (basic auth) + IP whitelist + login alert
const _loginAlerted = new Map<string, number>(); // Debounce: 1 alert per IP per 10 min

export async function verifyAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // IP whitelist check
  const settings = await getSettings();
  const ipWhitelistEnabled = settings["admin_ip_whitelist_enabled"] === "true";
  if (ipWhitelistEnabled) {
    const whitelist = (settings["admin_ip_whitelist"] || "").split(",").map(s => s.trim()).filter(Boolean);
    const clientIP = getClientIP(req);
    if (whitelist.length > 0 && !whitelist.some(ip => clientIP.includes(ip))) {
      res.status(403).json({ error: "IP not allowed" });
      return;
    }
  }

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
  const [username, password] = decoded.split(":");

  if (
    username !== (process.env.ADMIN_USERNAME || "admin") ||
    password !== (process.env.ADMIN_PASSWORD || "changeme123")
  ) {
    res.status(403).json({ error: "Invalid credentials" });
    return;
  }

  // Login alert (debounced per IP — 1 lần / 2 giờ)
  const clientIP = getClientIP(req);
  const lastAlert = _loginAlerted.get(clientIP) || 0;
  if (Date.now() - lastAlert > 2 * 60 * 60 * 1000) {
    _loginAlerted.set(clientIP, Date.now());
    alertLogin(clientIP, req.headers["user-agent"] || "").catch(() => {});
  }

  next();
}

// Middleware: API rate limiting (in-memory)
const _rateLimits = new Map<string, { count: number; resetAt: number }>();

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const settings = await getSettings();
  const limit = parseInt(settings["api_rate_limit"] || "60") || 60;

  const key = getClientIP(req) || "unknown";
  const now = Date.now();
  let entry = _rateLimits.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + 60000 };
    _rateLimits.set(key, entry);
  }

  entry.count++;

  if (entry.count > limit) {
    res.status(429).json({ error: "Too many requests. Try again later." });
    return;
  }

  // Cleanup old entries every 100 requests
  if (Math.random() < 0.01) {
    for (const [k, v] of _rateLimits) {
      if (v.resetAt < now) _rateLimits.delete(k);
    }
  }

  next();
}
