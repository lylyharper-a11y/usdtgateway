import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { generateOrderCode } from "../lib/crypto";
import { fetchRate, applySpread, getDepositWithdrawRates } from "../services/rate";
import { alertNewDeposit, alertNewWithdrawal, alertWithdrawalPending } from "../services/telegram";

const router = Router();

// GET /api/v1/rate — Realtime USDT rate
router.get("/rate", async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const rates = await getDepositWithdrawRates(partner.buySpread, partner.sellSpread);

    // Save to history
    await prisma.rateHistory.create({ data: { rate: rates.baseRate, source: rates.source } }).catch(() => {});

    res.json({
      success: true,
      data: {
        baseRate: rates.baseRate,
        depositRate: rates.depositRate,
        withdrawRate: rates.withdrawRate,
        source: rates.source,
        timestamp: rates.timestamp,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/deposit — Create deposit order
router.post("/deposit", async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const { amount, orderId } = req.body;

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, error: "Invalid amount" });
      return;
    }

    // Pick DEPOSIT/BOTH wallet with NO pending deposits (1 wallet = 1 pending order)
    const walletsWithPending = await prisma.deposit.findMany({
      where: { status: "PENDING" },
      select: { walletId: true },
    });
    const lockedWalletIds = walletsWithPending.map(d => d.walletId).filter(Boolean) as string[];

    let wallet = await prisma.wallet.findFirst({
      where: {
        status: "ACTIVE",
        network: "TRC20",
        walletType: { in: ["DEPOSIT", "BOTH"] },
        id: { notIn: lockedWalletIds },
      },
      orderBy: { usageCount: "asc" },
    });

    // Fallback: use hot_wallet_address from settings
    if (!wallet) {
      const settingAddr = await prisma.setting.findUnique({ where: { key: "hot_wallet_address" } });
      const addr = settingAddr?.value || process.env.HOT_WALLET_ADDRESS;
      if (addr) {
        wallet = await prisma.wallet.upsert({
          where: { address: addr },
          update: { status: "ACTIVE", walletType: "BOTH" },
          create: { label: "Hot Wallet (auto)", address: addr, privateKey: "from_settings", network: "TRC20", walletType: "BOTH" },
        });
      }
    }

    if (!wallet) {
      res.status(503).json({ success: false, error: "No active wallet available" });
      return;
    }

    // Increment usage
    await prisma.wallet.update({ where: { id: wallet.id }, data: { usageCount: { increment: 1 } } });

    // Get rate for estimation
    const rates = await getDepositWithdrawRates(partner.buySpread, partner.sellSpread);
    const depositRate = rates.depositRate;
    const estimatedVnd = Math.round(amount * depositRate);

    const orderCode = generateOrderCode("deposit");

    // Configurable expiry (default 30 min)
    const expirySetting = await prisma.setting.findUnique({ where: { key: "deposit_expiry_minutes" } });
    const expiryMinutes = parseInt(expirySetting?.value || "30");
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const deposit = await prisma.deposit.create({
      data: {
        orderCode,
        externalId: orderId || null,
        partnerId: partner.id,
        walletId: wallet.id,
        amountUsdt: amount,
        exchangeRate: depositRate,
        amountVnd: estimatedVnd,
        expiresAt,
      },
    });

    const qrData = encodeURIComponent(wallet.address);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${qrData}&size=300x300&margin=10`;

    // Format time in GMT+7
    const expiresGmt7 = new Date(expiresAt.getTime() + 7 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19) + " (GMT+7)";

    // Alert
    alertNewDeposit(deposit.orderCode, amount, wallet.address).catch(() => {});

    res.json({
      success: true,
      data: {
        orderCode: deposit.orderCode,
        walletAddress: wallet.address,
        qrCodeUrl,
        network: wallet.network,
        amount: deposit.amountUsdt,
        exchangeRate: depositRate,
        estimatedVnd,
        expiresAt: expiresGmt7,
        expiryMinutes,
        status: "PENDING",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/withdraw — Create withdrawal order
router.post("/withdraw", async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const { amount, toAddress, network = "TRC20", orderId } = req.body;

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, error: "Invalid amount" });
      return;
    }
    if (!toAddress || toAddress.length < 20) {
      res.status(400).json({ success: false, error: "Invalid toAddress" });
      return;
    }

    // Validate TRC20 address format
    if (network === "TRC20" && !/^T[a-zA-Z0-9]{33}$/.test(toAddress)) {
      res.status(400).json({ success: false, error: "Invalid TRC20 address format" });
      return;
    }

    // Daily withdrawal limit check
    const limitSetting = await prisma.setting.findUnique({ where: { key: "daily_withdraw_limit" } });
    const dailyLimit = parseFloat(limitSetting?.value || "0");
    if (dailyLimit > 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayTotal = await prisma.withdrawal.aggregate({
        _sum: { amountUsdt: true },
        where: {
          createdAt: { gte: today },
          status: { in: ["PENDING", "APPROVED", "SENDING", "SENT"] },
        },
      });
      const used = todayTotal._sum.amountUsdt || 0;
      if (used + amount > dailyLimit) {
        res.status(400).json({
          success: false,
          error: `V\u01b0\u1ee3t gi\u1edbi h\u1ea1n r\u00fat/ng\u00e0y. \u0110\u00e3 r\u00fat: ${used} USDT, gi\u1edbi h\u1ea1n: ${dailyLimit} USDT`,
        });
        return;
      }
    }

    // Cooldown check
    const cooldownSetting = await prisma.setting.findUnique({ where: { key: "withdraw_cooldown" } });
    const cooldownMin = parseInt(cooldownSetting?.value || "0");
    if (cooldownMin > 0) {
      const since = new Date(Date.now() - cooldownMin * 60 * 1000);
      const recent = await prisma.withdrawal.findFirst({
        where: { partnerId: partner.id, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      });
      if (recent) {
        const waitSec = Math.ceil((recent.createdAt.getTime() + cooldownMin * 60000 - Date.now()) / 1000);
        res.status(429).json({
          success: false,
          error: `Cooldown: ch\u1edd ${waitSec}s tr\u01b0\u1edbc khi t\u1ea1o l\u1ec7nh r\u00fat ti\u1ebfp`,
        });
        return;
      }
    }

    const rates = await getDepositWithdrawRates(partner.buySpread, partner.sellSpread);
    const withdrawRate = rates.withdrawRate;
    const amountVnd = Math.round(amount * withdrawRate);

    const orderCode = generateOrderCode("withdrawal");

    const withdrawal = await prisma.withdrawal.create({
      data: {
        orderCode,
        externalId: orderId || null,
        partnerId: partner.id,
        amountUsdt: amount,
        exchangeRate: withdrawRate,
        amountVnd,
        toAddress,
        toNetwork: network,
      },
    });

    // Check auto-approve setting
    const modeSetting = await prisma.setting.findUnique({ where: { key: "withdraw_mode" } });
    const maxSetting = await prisma.setting.findUnique({ where: { key: "auto_withdraw_max" } });
    const mode = modeSetting?.value || "manual";
    const autoMax = parseFloat(maxSetting?.value || "0");

    let finalStatus = "PENDING";
    if (mode === "auto" && autoMax > 0 && amount <= autoMax) {
      await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: "APPROVED" } });
      finalStatus = "APPROVED";
      console.log(`[Withdraw] Auto-approved ${orderCode}: ${amount} USDT <= ${autoMax} USDT threshold`);
    }

    // Alerts
    alertNewWithdrawal(orderCode, amount, toAddress).catch(() => {});
    if (finalStatus === "PENDING") {
      alertWithdrawalPending(orderCode, amount, toAddress).catch(() => {});
    }

    res.json({
      success: true,
      data: {
        orderCode: withdrawal.orderCode,
        amount: withdrawal.amountUsdt,
        exchangeRate: withdrawRate,
        amountVnd,
        toAddress,
        network,
        status: finalStatus,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/status/:orderCode — Check order status
router.get("/status/:orderCode", async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const { orderCode } = req.params;

    // Try deposit first
    const deposit = await prisma.deposit.findFirst({
      where: { orderCode, partnerId: partner.id },
    });
    if (deposit) {
      res.json({
        success: true,
        data: {
          orderCode: deposit.orderCode,
          type: "deposit",
          status: deposit.status,
          amountUsdt: deposit.amountUsdt,
          amountVnd: deposit.amountVnd,
          exchangeRate: deposit.exchangeRate,
          txHash: deposit.txHash,
          createdAt: deposit.createdAt,
        },
      });
      return;
    }

    // Try withdrawal
    const withdrawal = await prisma.withdrawal.findFirst({
      where: { orderCode, partnerId: partner.id },
    });
    if (withdrawal) {
      res.json({
        success: true,
        data: {
          orderCode: withdrawal.orderCode,
          type: "withdrawal",
          status: withdrawal.status,
          amountUsdt: withdrawal.amountUsdt,
          amountVnd: withdrawal.amountVnd,
          exchangeRate: withdrawal.exchangeRate,
          toAddress: withdrawal.toAddress,
          txHash: withdrawal.txHash,
          createdAt: withdrawal.createdAt,
        },
      });
      return;
    }

    res.status(404).json({ success: false, error: "Order not found" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/history — Transaction history
router.get("/history", async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const { type = "all", status, page = "1", limit = "20" } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    let deposits: any[] = [];
    let withdrawals: any[] = [];

    if (type === "all" || type === "deposit") {
      deposits = await prisma.deposit.findMany({
        where: {
          partnerId: partner.id,
          ...(status ? { status: status as string } : {}),
        },
        orderBy: { createdAt: "desc" },
        skip: type === "deposit" ? skip : 0,
        take: type === "deposit" ? take : take,
        select: {
          orderCode: true, externalId: true, amountUsdt: true, amountVnd: true,
          exchangeRate: true, txHash: true, status: true, createdAt: true,
        },
      });
    }

    if (type === "all" || type === "withdrawal") {
      withdrawals = await prisma.withdrawal.findMany({
        where: {
          partnerId: partner.id,
          ...(status ? { status: status as string } : {}),
        },
        orderBy: { createdAt: "desc" },
        skip: type === "withdrawal" ? skip : 0,
        take: type === "withdrawal" ? take : take,
        select: {
          orderCode: true, externalId: true, amountUsdt: true, amountVnd: true,
          exchangeRate: true, toAddress: true, txHash: true, status: true, createdAt: true,
        },
      });
    }

    // Merge and sort by date
    const history = [
      ...deposits.map(d => ({ ...d, type: "deposit" })),
      ...withdrawals.map(w => ({ ...w, type: "withdrawal" })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Counts
    const [totalDeposits, totalWithdrawals] = await Promise.all([
      prisma.deposit.count({ where: { partnerId: partner.id } }),
      prisma.withdrawal.count({ where: { partnerId: partner.id } }),
    ]);

    res.json({
      success: true,
      data: {
        history: type === "all" ? history.slice(0, take) : history,
        pagination: {
          page: parseInt(page as string),
          limit: take,
          totalDeposits,
          totalWithdrawals,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
