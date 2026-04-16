import { prisma } from "../lib/prisma";

// In-memory OTP store: { code, expiresAt, action, targetId }
const otpStore = new Map<string, { code: string; expiresAt: number; action: string; targetId: string }>();

// Get Telegram config from Settings table
async function getTelegramConfig(): Promise<{ token: string; chatId: string }> {
  const [tokenS, chatS] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "telegram_bot_token" } }),
    prisma.setting.findUnique({ where: { key: "telegram_chat_id" } }),
  ]);
  return {
    token: tokenS?.value || process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: chatS?.value || process.env.TELEGRAM_CHAT_ID || "",
  };
}

// Send message to Telegram group
export async function sendAlert(text: string) {
  const { token, chatId } = await getTelegramConfig();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err: any) {
    console.error("[Telegram] Send failed:", err.message);
  }
}

// Generate and send 2FA OTP
export async function send2FA(action: string, targetId: string, detail: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(code, { code, expiresAt, action, targetId });

  // Clean expired
  for (const [k, v] of otpStore) {
    if (v.expiresAt < Date.now()) otpStore.delete(k);
  }

  await sendAlert(
    `🔐 <b>Mã OTP xác thực rút tiền</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 ${detail}\n` +
    `🔑 Mã OTP: <code>${code}</code>\n` +
    `⏱️ Hiệu lực: 5 phút\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⚠️ Không chia sẻ mã này với bất kỳ ai!`
  );

  return code;
}

// Verify 2FA OTP
export function verify2FA(otp: string, targetId?: string): boolean {
  const entry = otpStore.get(otp);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    otpStore.delete(otp);
    return false;
  }
  if (targetId && entry.targetId !== targetId) return false;
  otpStore.delete(otp); // One-time use
  return true;
}

// Build /xem summary
async function buildSummary(): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    wallets,
    totalDep, todayDep, pendingDep,
    totalWd, todayWd, pendingWd,
  ] = await Promise.all([
    prisma.wallet.findMany({ where: { status: "ACTIVE" } }),
    prisma.deposit.aggregate({ _sum: { amountUsdt: true }, where: { status: "CONFIRMED" } }),
    prisma.deposit.aggregate({ _sum: { amountUsdt: true }, _count: true, where: { status: "CONFIRMED", createdAt: { gte: today } } }),
    prisma.deposit.count({ where: { status: "PENDING" } }),
    prisma.withdrawal.aggregate({ _sum: { amountUsdt: true }, where: { status: "SENT" } }),
    prisma.withdrawal.aggregate({ _sum: { amountUsdt: true }, _count: true, where: { status: "SENT", createdAt: { gte: today } } }),
    prisma.withdrawal.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
  ]);

  const depW = wallets.filter(w => w.walletType === "DEPOSIT" || w.walletType === "BOTH").length;
  const wdW = wallets.filter(w => w.walletType === "WITHDRAW" || w.walletType === "BOTH").length;
  const totalBal = wallets.reduce((s, w) => s + w.balance, 0);

  const td = todayDep._sum.amountUsdt || 0;
  const tw = todayWd._sum.amountUsdt || 0;
  const allD = totalDep._sum.amountUsdt || 0;
  const allW = totalWd._sum.amountUsdt || 0;

  return (
    `📊 <b>USDT Gateway — Tổng quan</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💼 Ví: ${wallets.length} active (${depW} nạp, ${wdW} rút)\n` +
    `💰 Số dư: <b>${totalBal.toFixed(2)} USDT</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📅 <b>Hôm nay:</b>\n` +
    `  📥 Nạp: ${todayDep._count || 0} đơn = ${td.toFixed(2)} USDT\n` +
    `  📤 Rút: ${todayWd._count || 0} đơn = ${tw.toFixed(2)} USDT\n` +
    `  📈 Quỹ: ${(td - tw) >= 0 ? "+" : ""}${(td - tw).toFixed(2)} USDT\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>Tổng cộng:</b>\n` +
    `  📥 Nạp: ${allD.toFixed(2)} USDT\n` +
    `  📤 Rút: ${allW.toFixed(2)} USDT\n` +
    `  📈 Quỹ: ${(allD - allW) >= 0 ? "+" : ""}${(allD - allW).toFixed(2)} USDT\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⏳ Chờ: ${pendingDep} nạp | ${pendingWd} rút`
  );
}

// Start Telegram bot polling for /xem command
let botRunning = false;
let lastUpdateId = 0;

export async function startTelegramBot() {
  if (botRunning) return;
  botRunning = true;

  const poll = async () => {
    const { token, chatId } = await getTelegramConfig();
    if (!token || !chatId) {
      setTimeout(poll, 30000);
      return;
    }

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.result) {
          for (const update of data.result) {
            lastUpdateId = update.update_id;
            const msg = update.message;
            if (!msg?.text) continue;

            const cmd = msg.text.trim().toLowerCase();
            if (cmd === "/xem" || cmd === "/xem@" + (await getBotUsername(token))) {
              const summary = await buildSummary();
              await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: msg.chat.id, text: summary, parse_mode: "HTML" }),
              });
            } else if (cmd === "/start") {
              await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: msg.chat.id,
                  text: "💎 <b>USDT Gateway Bot</b>\n\nLệnh:\n/xem — Xem tổng quan hệ thống",
                  parse_mode: "HTML",
                }),
              });
            }
          }
        }
      }
    } catch { /* timeout is normal */ }

    if (botRunning) setTimeout(poll, 2000);
  };

  console.log("[Telegram] Bot polling started");
  poll();
}

let _botUsername = "";
async function getBotUsername(token: string): Promise<string> {
  if (_botUsername) return _botUsername;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const d = await res.json();
    _botUsername = d.result?.username || "";
  } catch {}
  return _botUsername;
}

// Alert helpers
export async function alertLogin(ip: string, userAgent: string) {
  await sendAlert(
    `🔐 <b>Admin đăng nhập CMS</b>\n` +
    `🌐 IP: <code>${ip}</code>\n` +
    `📱 Thiết bị: ${userAgent?.slice(0, 80) || "N/A"}\n` +
    `🕐 ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`
  );
}

export async function alertNewDeposit(orderCode: string, amount: number, wallet: string) {
  await sendAlert(
    `📥 <b>Lệnh nạp mới</b>\n` +
    `📋 Mã: <code>${orderCode}</code>\n` +
    `💰 ${amount} USDT\n` +
    `💼 Ví: <code>${wallet}</code>`
  );
}

export async function alertDepositConfirmed(orderCode: string, amount: number, txHash: string) {
  await sendAlert(
    `✅ <b>Nạp thành công</b>\n` +
    `📋 Mã: <code>${orderCode}</code>\n` +
    `💰 ${amount} USDT\n` +
    `🔗 TX: <code>${txHash}</code>`
  );
}

export async function alertNewWithdrawal(orderCode: string, amount: number, toAddress: string) {
  await sendAlert(
    `📤 <b>Lệnh rút mới</b>\n` +
    `📋 Mã: <code>${orderCode}</code>\n` +
    `💰 ${amount} USDT\n` +
    `📤 Tới: <code>${toAddress}</code>`
  );
}

export async function alertWithdrawalPending(orderCode: string, amount: number, toAddress: string) {
  // Check if 2FA enabled
  const s = await prisma.setting.findUnique({ where: { key: "2fa_enabled" } });
  const has2FA = s?.value === "true";

  let text =
    `⚠️ <b>Lệnh rút chờ duyệt</b>\n` +
    `📋 Mã: <code>${orderCode}</code>\n` +
    `💰 ${amount} USDT\n` +
    `📤 Tới: <code>${toAddress}</code>\n`;

  if (has2FA) {
    const code = await send2FA("approve_withdrawal", orderCode,
      `Duyệt rút ${amount} USDT → ${toAddress.slice(0, 8)}...${toAddress.slice(-4)}`);
    text += `\n🔑 OTP: <code>${code}</code> (5 phút)`;
  }

  await sendAlert(text);
}

export async function alertWithdrawalSent(orderCode: string, amount: number, toAddress: string, txHash: string) {
  await sendAlert(
    `💸 <b>Rút thành công</b>\n` +
    `📋 Mã: <code>${orderCode}</code>\n` +
    `💰 ${amount} USDT\n` +
    `📤 Tới: <code>${toAddress}</code>\n` +
    `🔗 TX: <code>${txHash}</code>`
  );
}

export async function alertWithdrawalFailed(orderCode: string, amount: number, error: string) {
  await sendAlert(
    `❌ <b>Rút thất bại</b>\n` +
    `📋 Mã: <code>${orderCode}</code>\n` +
    `💰 ${amount} USDT\n` +
    `❗ Lỗi: ${error}`
  );
}

export async function alertLowTRX(walletLabel: string, address: string, trxBalance: number) {
  await sendAlert(
    `🔋 <b>TRX thấp — Cần nạp gas!</b>\n` +
    `💼 Ví: ${walletLabel}\n` +
    `📍 <code>${address}</code>\n` +
    `⚡ TRX còn: <b>${trxBalance}</b> (cần ≥ 30 TRX)`
  );
}

export async function alertUnmatched(txHash: string, amount: number, from: string, wallet: string) {
  await sendAlert(
    `⚡ <b>Giao dịch không khớp</b>\n` +
    `💰 ${amount} USDT\n` +
    `📤 Từ: <code>${from}</code>\n` +
    `💼 Ví: <code>${wallet}</code>\n` +
    `🔗 TX: <code>${txHash}</code>\n` +
    `⚠️ Cần kiểm tra thủ công!`
  );
}
