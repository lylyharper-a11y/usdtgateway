import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { encrypt, generateApiKey, generateSecretKey } from "../lib/crypto";
import { fetchRate, getDepositWithdrawRates } from "../services/rate";
import { send2FA, verify2FA } from "../services/telegram";
import { clearSettingsCache } from "../lib/auth";

const router = Router();

// ==================== DASHBOARD ====================
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalDeposits,
      todayDeposits,
      pendingDeposits,
      totalWithdrawals,
      todayWithdrawals,
      pendingWithdrawals,
      wallets,
    ] = await Promise.all([
      prisma.deposit.aggregate({ _sum: { amountUsdt: true }, where: { status: "CONFIRMED" } }),
      prisma.deposit.aggregate({ _sum: { amountUsdt: true }, where: { status: "CONFIRMED", createdAt: { gte: today } } }),
      prisma.deposit.count({ where: { status: "PENDING" } }),
      prisma.withdrawal.aggregate({ _sum: { amountUsdt: true }, where: { status: "SENT" } }),
      prisma.withdrawal.aggregate({ _sum: { amountUsdt: true }, where: { status: "SENT", createdAt: { gte: today } } }),
      prisma.withdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
      prisma.wallet.findMany({ where: { status: "ACTIVE" }, select: { id: true, label: true, balance: true, address: true } }),
    ]);

    const rates = await getDepositWithdrawRates(0, 0);

    // Fetch on-chain TRX + USDT balances for active wallets
    const apiKeyS = await prisma.setting.findUnique({ where: { key: "trongrid_api_key" } });
    const tronApiKey = apiKeyS?.value || process.env.TRONGRID_API_KEY || "";
    const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const hdrs: any = tronApiKey ? { "TRON-PRO-API-KEY": tronApiKey } : {};

    const onChainBalances: any[] = [];
    for (const w of wallets) {
      try {
        let trxBalance = 0;
        let usdtBalance = 0;

        // TRX balance from account API
        try {
          const trxRes = await fetch(`https://api.trongrid.io/v1/accounts/${w.address}`, {
            headers: hdrs, signal: AbortSignal.timeout(5000),
          });
          if (trxRes.ok) {
            const trxData = await trxRes.json();
            trxBalance = (trxData?.data?.[0]?.balance || 0) / 1e6;
          }
        } catch { /* stays 0 */ }

        // USDT balance via smart contract balanceOf() — accurate for ALL accounts
        try {
          let num = BigInt(0);
          for (const c of w.address) num = num * 58n + BigInt(ALPHABET.indexOf(c));
          let hex = num.toString(16);
          while (hex.length < 50) hex = "0" + hex;
          const addrHex = hex.slice(0, hex.length - 8);
          const parameter = addrHex.slice(2).padStart(64, "0");

          const cRes = await fetch(`https://api.trongrid.io/wallet/triggerconstantcontract`, {
            method: "POST",
            headers: { ...hdrs, "Content-Type": "application/json" },
            body: JSON.stringify({
              owner_address: w.address,
              contract_address: USDT_CONTRACT,
              function_selector: "balanceOf(address)",
              parameter,
              visible: true,
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (cRes.ok) {
            const cData = await cRes.json();
            const result = cData.constant_result?.[0];
            if (result) usdtBalance = Number(BigInt("0x" + result)) / 1e6;
          }
        } catch { /* stays 0 */ }

        onChainBalances.push({
          address: w.address,
          label: w.label,
          trx: Math.round(trxBalance * 100) / 100,
          usdt: Math.round(usdtBalance * 100) / 100,
          lowGas: trxBalance < 30,
        });
      } catch {
        onChainBalances.push({ address: w.address, label: w.label, trx: -1, usdt: -1, lowGas: true });
      }
    }

    res.json({
      success: true,
      data: {
        deposits: {
          total: totalDeposits._sum.amountUsdt || 0,
          today: todayDeposits._sum.amountUsdt || 0,
          pending: pendingDeposits,
        },
        withdrawals: {
          total: totalWithdrawals._sum.amountUsdt || 0,
          today: todayWithdrawals._sum.amountUsdt || 0,
          pending: pendingWithdrawals,
        },
        wallets,
        onChainBalances,
        rate: rates,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== WALLETS ====================
router.get("/wallets", async (_req: Request, res: Response) => {
  const wallets = await prisma.wallet.findMany({ orderBy: { createdAt: "desc" } });
  // Don't expose private keys
  res.json({ success: true, data: wallets.map(w => ({ ...w, privateKey: "***" })) });
});

router.post("/wallets", async (req: Request, res: Response) => {
  try {
    const { label, address, privateKey, network = "TRC20", walletType = "BOTH" } = req.body;
    if (!label || !address || !privateKey) {
      res.status(400).json({ success: false, error: "label, address, privateKey required" });
      return;
    }

    const wallet = await prisma.wallet.create({
      data: { label, address, privateKey: encrypt(privateKey), network, walletType },
    });
    res.json({ success: true, data: { ...wallet, privateKey: "***" } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/wallets/:id", async (req: Request, res: Response) => {
  try {
    const { label, status } = req.body;
    const wallet = await prisma.wallet.update({
      where: { id: req.params.id },
      data: { ...(label && { label }), ...(status && { status }) },
    });
    res.json({ success: true, data: { ...wallet, privateKey: "***" } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/wallets/:id", async (req: Request, res: Response) => {
  try {
    // Detach deposits referencing this wallet
    await prisma.deposit.updateMany({ where: { walletId: req.params.id }, data: { walletId: null } });
    await prisma.wallet.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== PARTNERS ====================
router.get("/partners", async (_req: Request, res: Response) => {
  const partners = await prisma.partner.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ success: true, data: partners });
});

router.post("/partners", async (req: Request, res: Response) => {
  try {
    const { name, callbackUrl, buySpread = 1, sellSpread = 1 } = req.body;
    if (!name) { res.status(400).json({ success: false, error: "name required" }); return; }

    const partner = await prisma.partner.create({
      data: {
        name,
        apiKey: generateApiKey(),
        secretKey: generateSecretKey(),
        callbackUrl: callbackUrl || null,
        buySpread,
        sellSpread,
      },
    });
    res.json({ success: true, data: partner });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/partners/:id", async (req: Request, res: Response) => {
  try {
    const { name, callbackUrl, buySpread, sellSpread, isActive } = req.body;
    const partner = await prisma.partner.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(callbackUrl !== undefined && { callbackUrl }),
        ...(buySpread !== undefined && { buySpread }),
        ...(sellSpread !== undefined && { sellSpread }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, data: partner });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== DEPOSITS ====================
router.get("/deposits", async (req: Request, res: Response) => {
  const { status, walletId, search, limit = "100" } = req.query;
  const where: any = {};
  if (status) where.status = status as string;
  if (walletId) where.walletId = walletId as string;
  if (search) {
    where.OR = [
      { orderCode: { contains: search as string, mode: "insensitive" } },
      { txHash: { contains: search as string, mode: "insensitive" } },
      { fromAddress: { contains: search as string, mode: "insensitive" } },
    ];
  }
  const deposits = await prisma.deposit.findMany({
    where,
    include: { partner: { select: { name: true } }, wallet: { select: { label: true, address: true } } },
    orderBy: { createdAt: "desc" },
    take: parseInt(limit as string),
  });
  res.json({ success: true, data: deposits });
});

// Manual confirm deposit (fallback if cron doesn't catch)
router.post("/deposits/:id/confirm", async (req: Request, res: Response) => {
  try {
    const { txHash } = req.body;
    const deposit = await prisma.deposit.findUnique({ where: { id: req.params.id }, include: { partner: true } });
    if (!deposit) { res.status(404).json({ success: false, error: "Not found" }); return; }
    if (deposit.status !== "PENDING") { res.status(400).json({ success: false, error: "Not pending" }); return; }

    const rates = await getDepositWithdrawRates(deposit.partner.buySpread, deposit.partner.sellSpread);
    const depositRate = rates.depositRate;
    const amountVnd = Math.round(deposit.amountUsdt * depositRate);

    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: "CONFIRMED", txHash: txHash || null, exchangeRate: depositRate, amountVnd },
    });

    // Send callback
    if (deposit.partner.callbackUrl) {
      const { sendCallback } = await import("../services/callback");
      const result = await sendCallback(deposit.partner.callbackUrl, deposit.partner.secretKey, {
        event: "deposit.confirmed",
        orderCode: deposit.orderCode,
        amountUsdt: deposit.amountUsdt,
        amountVnd,
        txHash: txHash || undefined,
        status: "CONFIRMED",
        timestamp: new Date().toISOString(),
      });
      if (result.success) {
        await prisma.deposit.update({ where: { id: deposit.id }, data: { callbackSent: true } });
      }
    }

    res.json({ success: true, message: "Deposit confirmed" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== WITHDRAWALS ====================
router.get("/withdrawals", async (req: Request, res: Response) => {
  const { status, search, limit = "100" } = req.query;
  const where: any = {};
  if (status) where.status = status as string;
  if (search) {
    where.OR = [
      { orderCode: { contains: search as string, mode: "insensitive" } },
      { txHash: { contains: search as string, mode: "insensitive" } },
      { toAddress: { contains: search as string, mode: "insensitive" } },
    ];
  }
  const withdrawals = await prisma.withdrawal.findMany({
    where,
    include: { partner: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: parseInt(limit as string),
  });
  res.json({ success: true, data: withdrawals });
});

// ==================== ADMIN LOGS (Unmatched TXs) ====================
router.get("/admin-logs", async (req: Request, res: Response) => {
  const { action, limit = "50" } = req.query;
  const where: any = {};
  if (action) where.action = action as string;
  else where.action = { in: ["UNMATCHED_DEPOSIT", "AMOUNT_MISMATCH"] };
  const logs = await prisma.adminLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: parseInt(limit as string),
  });
  res.json({ success: true, data: logs.map(l => ({ ...l, detail: l.detail ? JSON.parse(l.detail) : null })) });
});

// Request OTP for withdrawal approval
router.post("/withdrawals/:id/request-otp", async (req: Request, res: Response) => {
  try {
    const wd = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!wd) { res.status(404).json({ success: false, error: "Not found" }); return; }
    if (wd.status !== "PENDING") { res.status(400).json({ success: false, error: "Not pending" }); return; }

    await send2FA("approve_withdrawal", wd.id,
      `Duyệt rút ${wd.amountUsdt} USDT → ${wd.toAddress.slice(0, 8)}...${wd.toAddress.slice(-4)}`);
    res.json({ success: true, message: "OTP đã gửi về Telegram" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Approve withdrawal → with 2FA check
router.post("/withdrawals/:id/approve", async (req: Request, res: Response) => {
  try {
    const wd = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!wd) { res.status(404).json({ success: false, error: "Not found" }); return; }
    if (wd.status !== "PENDING") { res.status(400).json({ success: false, error: "Not pending" }); return; }

    // Check if 2FA enabled
    const s2fa = await prisma.setting.findUnique({ where: { key: "2fa_enabled" } });
    if (s2fa?.value === "true") {
      const { otp } = req.body || {};
      if (!otp) {
        res.status(400).json({ success: false, error: "2FA enabled — OTP required", require2FA: true });
        return;
      }
      if (!verify2FA(otp, wd.id)) {
        res.status(403).json({ success: false, error: "OTP không đúng hoặc đã hết hạn" });
        return;
      }
    }

    await prisma.withdrawal.update({ where: { id: wd.id }, data: { status: "APPROVED" } });
    res.json({ success: true, message: "Withdrawal approved, will be sent automatically" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reject withdrawal
router.post("/withdrawals/:id/reject", async (req: Request, res: Response) => {
  try {
    const wd = await prisma.withdrawal.findUnique({ where: { id: req.params.id }, include: { partner: true } });
    if (!wd) { res.status(404).json({ success: false, error: "Not found" }); return; }
    if (!["PENDING", "APPROVED"].includes(wd.status)) { res.status(400).json({ success: false, error: "Cannot reject" }); return; }

    await prisma.withdrawal.update({ where: { id: wd.id }, data: { status: "REJECTED" } });

    // Callback
    if (wd.partner.callbackUrl) {
      const { sendCallback } = await import("../services/callback");
      await sendCallback(wd.partner.callbackUrl, wd.partner.secretKey, {
        event: "withdrawal.rejected",
        orderCode: wd.orderCode,
        amountUsdt: wd.amountUsdt,
        amountVnd: wd.amountVnd,
        status: "REJECTED",
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: "Withdrawal rejected" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

// ==================== SETTINGS ====================
router.get("/settings", async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value;
    res.json({
      success: true,
      data: {
        rateMode: map.rate_mode || "auto",
        depositRate: map.deposit_rate || "25500",
        withdrawRate: map.withdraw_rate || "25500",
        trongridApiKey: map.trongrid_api_key || process.env.TRONGRID_API_KEY || "",
        hotWalletAddress: map.hot_wallet_address || process.env.HOT_WALLET_ADDRESS || "",
        hotWalletPrivateKey: (map.hot_wallet_pk || process.env.HOT_WALLET_PRIVATE_KEY) ? "***configured***" : "",
        depositExpiryMinutes: map.deposit_expiry_minutes || "30",
        withdrawMode: map.withdraw_mode || "manual",
        autoWithdrawMax: map.auto_withdraw_max || "200",
        // Security settings
        telegramBotToken: map.telegram_bot_token ? "***configured***" : "",
        telegramChatId: map.telegram_chat_id || "",
        twoFaEnabled: map["2fa_enabled"] || "false",
        dailyWithdrawLimit: map.daily_withdraw_limit || "0",
        adminIpWhitelistEnabled: map.admin_ip_whitelist_enabled || "false",
        adminIpWhitelist: map.admin_ip_whitelist || "",
        apiRateLimit: map.api_rate_limit || "60",
        withdrawCooldown: map.withdraw_cooldown || "0",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/settings", async (req: Request, res: Response) => {
  try {
    const b = req.body;
    const upserts: any[] = [];
    const upsert = (key: string, value: string) => {
      upserts.push(prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }));
    };

    // Rate settings
    if (b.rateMode !== undefined) upsert("rate_mode", b.rateMode);
    if (b.depositRate !== undefined) upsert("deposit_rate", String(b.depositRate));
    if (b.withdrawRate !== undefined) upsert("withdraw_rate", String(b.withdrawRate));
    if (b.trongridApiKey !== undefined) upsert("trongrid_api_key", b.trongridApiKey);
    if (b.hotWalletAddress !== undefined) upsert("hot_wallet_address", b.hotWalletAddress);
    if (b.hotWalletPrivateKey !== undefined && b.hotWalletPrivateKey !== "***configured***") {
      upsert("hot_wallet_pk", b.hotWalletPrivateKey);
    }
    if (b.depositExpiryMinutes !== undefined) upsert("deposit_expiry_minutes", String(b.depositExpiryMinutes));
    if (b.withdrawMode !== undefined) upsert("withdraw_mode", b.withdrawMode);
    if (b.autoWithdrawMax !== undefined) upsert("auto_withdraw_max", String(b.autoWithdrawMax));

    // Security settings
    if (b.telegramBotToken !== undefined && b.telegramBotToken !== "***configured***") upsert("telegram_bot_token", b.telegramBotToken);
    if (b.telegramChatId !== undefined) upsert("telegram_chat_id", b.telegramChatId);
    if (b.twoFaEnabled !== undefined) upsert("2fa_enabled", b.twoFaEnabled);
    if (b.dailyWithdrawLimit !== undefined) upsert("daily_withdraw_limit", String(b.dailyWithdrawLimit));
    if (b.adminIpWhitelistEnabled !== undefined) upsert("admin_ip_whitelist_enabled", b.adminIpWhitelistEnabled);
    if (b.adminIpWhitelist !== undefined) upsert("admin_ip_whitelist", b.adminIpWhitelist);
    if (b.apiRateLimit !== undefined) upsert("api_rate_limit", String(b.apiRateLimit));
    if (b.withdrawCooldown !== undefined) upsert("withdraw_cooldown", String(b.withdrawCooldown));

    await Promise.all(upserts);
    clearSettingsCache();
    res.json({ success: true, message: "Settings saved" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Derive TRON private key from seed phrase
router.post("/derive-key", async (req: Request, res: Response) => {
  try {
    const { seedPhrase } = req.body;
    if (!seedPhrase) {
      res.status(400).json({ success: false, error: "seedPhrase required" });
      return;
    }

    const bip39 = await import("bip39");
    const { HDKey } = await import("@scure/bip32");
    const tw = await import("tronweb");
    const TronWeb = (tw as any).TronWeb || (tw as any).default || tw;

    const mnemonic = seedPhrase.trim().toLowerCase();
    if (!bip39.validateMnemonic(mnemonic)) {
      res.status(400).json({ success: false, error: "Seed phrase không hợp lệ" });
      return;
    }

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const master = HDKey.fromMasterSeed(new Uint8Array(seed));
    const child = master.derive("m/44'/195'/0'/0/0");
    const privateKey = Buffer.from(child.privateKey!).toString("hex").toUpperCase();

    const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });
    const address = tronWeb.address.fromPrivateKey(privateKey);

    res.json({
      success: true,
      data: { address, privateKey },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
