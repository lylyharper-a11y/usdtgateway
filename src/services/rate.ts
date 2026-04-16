import { prisma } from "../lib/prisma";

export interface RateResult {
  rate: number;
  source: string;
  timestamp: string;
}

// Fetch USDT/VND rate — prioritize manual settings, then Binance P2P
export async function fetchRate(): Promise<RateResult> {
  // Check manual rate setting first
  const manualRate = await prisma.setting.findUnique({ where: { key: "rate_mode" } });
  if (manualRate?.value === "manual") {
    const depositRate = await prisma.setting.findUnique({ where: { key: "deposit_rate" } });
    const rate = parseFloat(depositRate?.value || "25500");
    return { rate, source: "manual", timestamp: new Date().toISOString() };
  }

  // Auto: Try Binance P2P (USDT → VND, Buy ads = giá bán ra)
  try {
    const res = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "USDT",
        fiat: "VND",
        tradeType: "BUY",
        page: 1,
        rows: 5,
        payTypes: [],
        publisherType: null,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const ads = data?.data || [];
      if (ads.length > 0) {
        // Lấy trung bình top 5 quảng cáo
        const prices = ads.map((a: any) => parseFloat(a.adv?.price || 0)).filter((p: number) => p > 0);
        if (prices.length > 0) {
          const avgRate = Math.round(prices.reduce((s: number, p: number) => s + p, 0) / prices.length);
          return { rate: avgRate, source: "binance_p2p", timestamp: new Date().toISOString() };
        }
      }
    }
  } catch { /* fallthrough */ }

  // Fallback: Binance spot USDT/TRY or other
  try {
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=USDTBIDR",
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      const bidrPrice = parseFloat(data?.price || "0"); // BIDR ≈ IDR
      if (bidrPrice > 0) {
        // Convert IDR to VND (1 IDR ≈ 1.6 VND)
        const vndRate = Math.round(bidrPrice * 1.6);
        return { rate: vndRate, source: "binance_bidr", timestamp: new Date().toISOString() };
      }
    }
  } catch { /* fallthrough */ }

  // Static fallback
  return { rate: 25800, source: "static", timestamp: new Date().toISOString() };
}

// Get deposit and withdrawal rates (may differ in manual mode)
export async function getDepositWithdrawRates(buySpread: number, sellSpread: number) {
  const rateMode = await prisma.setting.findUnique({ where: { key: "rate_mode" } });

  if (rateMode?.value === "manual") {
    const depSetting = await prisma.setting.findUnique({ where: { key: "deposit_rate" } });
    const wdSetting = await prisma.setting.findUnique({ where: { key: "withdraw_rate" } });
    const depositRate = parseFloat(depSetting?.value || "25500");
    const withdrawRate = parseFloat(wdSetting?.value || "25500");
    return {
      baseRate: depositRate,
      depositRate,
      withdrawRate,
      source: "manual",
      timestamp: new Date().toISOString(),
    };
  }

  // Auto mode: fetch market rate + apply spread
  const { rate, source, timestamp } = await fetchRate();
  const { buyRate, sellRate } = applySpread(rate, buySpread, sellSpread);
  return {
    baseRate: rate,
    depositRate: sellRate,
    withdrawRate: buyRate,
    source,
    timestamp,
  };
}

// Apply partner spread (used in auto mode)
export function applySpread(baseRate: number, buySpread: number, sellSpread: number) {
  return {
    buyRate: Math.round(baseRate * (1 + buySpread / 100)),
    sellRate: Math.round(baseRate * (1 - sellSpread / 100)),
  };
}
