import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/crypto";
import { alertDepositConfirmed, alertWithdrawalSent, alertWithdrawalFailed, alertLowTRX, alertUnmatched } from "./telegram";

const TRONGRID_API = "https://api.trongrid.io";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT TRC20 mainnet
const _lowTrxAlerted = new Map<string, number>(); // debounce alerts

async function getApiKey(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: "trongrid_api_key" } });
  return setting?.value || process.env.TRONGRID_API_KEY || "";
}

function makeHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { "TRON-PRO-API-KEY": apiKey } : {};
}

// =============================================
// MONITOR: Check for new TRC20 deposits
// =============================================
export async function checkDeposits() {
  const wallets = await prisma.wallet.findMany({
    where: { status: "ACTIVE", network: "TRC20", walletType: { in: ["DEPOSIT", "BOTH"] } },
  });

  if (wallets.length === 0) return;

  const apiKey = await getApiKey();

  for (const wallet of wallets) {
    try {
      const url = `${TRONGRID_API}/v1/accounts/${wallet.address}/transactions/trc20?only_to=true&limit=20&contract_address=${USDT_CONTRACT}`;
      const res = await fetch(url, {
        headers: makeHeaders(apiKey) as any,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.log(`[Tron] API error for ${wallet.address}: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const txs = data.data || [];

      for (const tx of txs) {
        const txHash = tx.transaction_id;
        const toAddr = tx.to;
        const fromAddr = tx.from;
        const rawAmount = parseInt(tx.value || "0");
        const amountUsdt = rawAmount / 1e6;

        if (toAddr !== wallet.address || amountUsdt <= 0) continue;

        // Already processed this txHash?
        const exists = await prisma.deposit.findFirst({ where: { txHash } });
        if (exists) continue;

        // Also check admin logs to avoid re-logging unmatched
        const logged = await prisma.adminLog.findFirst({ where: { target: txHash } });
        if (logged) continue;

        // Find THE pending deposit for this wallet (1 wallet = 1 pending at a time)
        const deposit = await prisma.deposit.findFirst({
          where: {
            walletId: wallet.id,
            status: "PENDING",
            txHash: null,
          },
          include: { partner: true },
          orderBy: { createdAt: "asc" },
        });

        if (!deposit) {
          // No pending order on this wallet — log as unmatched for manual review
          await prisma.adminLog.create({
            data: {
              action: "UNMATCHED_DEPOSIT",
              target: txHash,
              detail: JSON.stringify({ wallet: wallet.address, from: fromAddr, amount: amountUsdt, timestamp: new Date().toISOString() }),
            },
          });
          console.log(`[Tron] ⚠️ Unmatched TX ${txHash.slice(0, 12)}... ${amountUsdt} USDT to ${wallet.address} (no pending order)`);
          alertUnmatched(txHash, amountUsdt, fromAddr, wallet.address).catch(() => {});
          continue;
        }

        // Check amount match
        if (deposit.amountUsdt !== amountUsdt) {
          // Amount mismatch — log for manual review but DON'T auto-confirm
          await prisma.adminLog.create({
            data: {
              action: "AMOUNT_MISMATCH",
              target: txHash,
              detail: JSON.stringify({
                orderCode: deposit.orderCode,
                expected: deposit.amountUsdt,
                received: amountUsdt,
                wallet: wallet.address,
                from: fromAddr,
              }),
            },
          });
          console.log(`[Tron] ⚠️ Amount mismatch: order ${deposit.orderCode} expects ${deposit.amountUsdt} USDT, received ${amountUsdt} USDT (TX: ${txHash.slice(0, 12)}...)`);
          continue;
        }

        // Fetch rate and confirm
        const { getDepositWithdrawRates } = await import("./rate");
        const rates = await getDepositWithdrawRates(deposit.partner.buySpread, deposit.partner.sellSpread);
        const depositRate = rates.depositRate;
        const amountVnd = Math.round(amountUsdt * depositRate);

        await prisma.deposit.update({
          where: { id: deposit.id },
          data: {
            status: "CONFIRMED",
            txHash,
            fromAddress: fromAddr,
            walletId: wallet.id, // re-link to current wallet
            exchangeRate: depositRate,
            amountVnd,
          },
        });

        console.log(`[Tron] ✅ Deposit ${deposit.orderCode} confirmed: ${amountUsdt} USDT = ${amountVnd.toLocaleString()} VND (tx: ${txHash})`);

        // Send callback
        if (deposit.partner.callbackUrl) {
          const { sendCallback } = await import("./callback");
          const result = await sendCallback(deposit.partner.callbackUrl, deposit.partner.secretKey, {
            event: "deposit.confirmed",
            orderCode: deposit.orderCode,
            amountUsdt,
            amountVnd,
            txHash,
            status: "CONFIRMED",
            timestamp: new Date().toISOString(),
          });
          if (result.success) {
            await prisma.deposit.update({ where: { id: deposit.id }, data: { callbackSent: true } });
          }
        }
        alertDepositConfirmed(deposit.orderCode, amountUsdt, txHash).catch(() => {});
      }
    } catch (err: any) {
      console.error(`[Tron] Monitor error for ${wallet.address}:`, err.message);
    }
  }
}

// =============================================
// SEND: Auto-send USDT for approved withdrawals
// =============================================
export async function processWithdrawals() {
  // ALWAYS use wallet table as source of truth for withdraw key
  const withdrawWallet = await prisma.wallet.findFirst({
    where: { status: "ACTIVE", walletType: { in: ["WITHDRAW", "BOTH"] } },
  });
  if (!withdrawWallet?.privateKey) {
    console.log("[Tron] No active WITHDRAW/BOTH wallet with private key found");
    return;
  }

  let hotWalletPK = "";
  try { hotWalletPK = decrypt(withdrawWallet.privateKey); } catch { hotWalletPK = withdrawWallet.privateKey; }
  if (!hotWalletPK) return;

  const apiKey = await getApiKey();

  const pending = await prisma.withdrawal.findMany({
    where: { status: "APPROVED" },
    include: { partner: true },
  });

  for (const wd of pending) {
    try {
      // Mark as SENDING to prevent double-processing
      await prisma.withdrawal.update({ where: { id: wd.id }, data: { status: "SENDING" } });

      console.log(`[Tron] Sending ${wd.amountUsdt} USDT from ${withdrawWallet.address} to ${wd.toAddress}`);

      // Dynamic import TronWeb
      const tronwebModule = await import("tronweb");
      const TronWeb = (tronwebModule as any).TronWeb || (tronwebModule as any).default?.TronWeb || (tronwebModule as any).default;
      const tronWeb = new TronWeb({
        fullHost: TRONGRID_API,
        headers: makeHeaders(apiKey),
        privateKey: hotWalletPK,
      });

      // Send TRC20 USDT transfer
      const contract = await tronWeb.contract().at(USDT_CONTRACT);
      const amount = Math.round(wd.amountUsdt * 1e6); // 6 decimals
      const result = await contract.methods.transfer(wd.toAddress, amount).send({
        feeLimit: 100_000_000, // 100 TRX max fee
      });

      const txHash = result || "";
      await prisma.withdrawal.update({
        where: { id: wd.id },
        data: { status: "SENT", txHash },
      });

      console.log(`[Tron] 💸 Withdrawal ${wd.orderCode} sent: ${wd.amountUsdt} USDT to ${wd.toAddress} (tx: ${txHash})`);

      // Send callback
      if (wd.partner.callbackUrl) {
        const { sendCallback } = await import("./callback");
        const cbResult = await sendCallback(wd.partner.callbackUrl, wd.partner.secretKey, {
          event: "withdrawal.completed",
          orderCode: wd.orderCode,
          amountUsdt: wd.amountUsdt,
          amountVnd: wd.amountVnd,
          txHash,
          status: "SENT",
          timestamp: new Date().toISOString(),
        });
        if (cbResult.success) {
          await prisma.withdrawal.update({ where: { id: wd.id }, data: { callbackSent: true } });
        }
      }
      alertWithdrawalSent(wd.orderCode, wd.amountUsdt, wd.toAddress, txHash).catch(() => {});
    } catch (err: any) {
      console.error(`[Tron] Withdrawal ${wd.orderCode} failed:`, err.message);
      await prisma.withdrawal.update({
        where: { id: wd.id },
        data: { status: "FAILED" },
      });
      alertWithdrawalFailed(wd.orderCode, wd.amountUsdt, err.message).catch(() => {});
    }
  }
}

// =============================================
// EXPIRE: Mark old pending deposits as expired
// =============================================
export async function expireDeposits() {
  const result = await prisma.deposit.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
  if (result.count > 0) {
    console.log(`[Tron] Expired ${result.count} deposits`);
  }
}

// =============================================
// BALANCE: Update wallet balances from chain
// Uses smart contract balanceOf() for accurate USDT balance
// =============================================

// Convert TRON base58 address to hex (41-prefix) for contract calls
function addressToHex(base58Addr: string): string {
  // TronWeb-free conversion: decode base58check
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const c of base58Addr) {
    num = num * 58n + BigInt(ALPHABET.indexOf(c));
  }
  let hex = num.toString(16);
  // Pad to at least 50 chars (25 bytes = 1 version + 20 addr + 4 checksum)
  while (hex.length < 50) hex = "0" + hex;
  // Return 21 bytes (version + address), skip checksum (last 4 bytes = 8 hex)
  return hex.slice(0, hex.length - 8);
}

export async function updateBalances() {
  const wallets = await prisma.wallet.findMany({ where: { status: "ACTIVE", network: "TRC20" } });
  const apiKey = await getApiKey();

  for (const w of wallets) {
    try {
      let usdtBalance = 0;
      let trxBalance = 0;

      // 1. Get TRX balance from account API (may be 0 for unactivated)
      try {
        const accRes = await fetch(`${TRONGRID_API}/v1/accounts/${w.address}`, {
          headers: makeHeaders(apiKey) as any,
          signal: AbortSignal.timeout(5000),
        });
        if (accRes.ok) {
          const accData = await accRes.json();
          const acct = accData.data?.[0];
          if (acct) {
            trxBalance = (acct.balance || 0) / 1e6;
          }
        }
      } catch { /* TRX balance stays 0 */ }

      // 2. Get USDT balance via smart contract balanceOf() — works even for unactivated accounts
      try {
        const addrHex = addressToHex(w.address);
        // balanceOf(address) parameter: pad address to 32 bytes (64 hex chars)
        const parameter = addrHex.slice(2).padStart(64, "0"); // remove 41 prefix, pad left

        const contractRes = await fetch(`${TRONGRID_API}/wallet/triggerconstantcontract`, {
          method: "POST",
          headers: { ...makeHeaders(apiKey), "Content-Type": "application/json" } as any,
          body: JSON.stringify({
            owner_address: w.address,
            contract_address: USDT_CONTRACT,
            function_selector: "balanceOf(address)",
            parameter,
            visible: true,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (contractRes.ok) {
          const contractData = await contractRes.json();
          const result = contractData.constant_result?.[0];
          if (result) {
            const rawBalance = BigInt("0x" + result);
            usdtBalance = Number(rawBalance) / 1e6;
          }
        }
      } catch (err: any) {
        console.error(`[Balance] Contract call failed for ${w.address}:`, err.message);
      }

      await prisma.wallet.update({ where: { id: w.id }, data: { balance: usdtBalance } });
      console.log(`[Balance] ${w.label || w.address.slice(0,8)}: ${usdtBalance} USDT, ${trxBalance} TRX`);

      // Alert if TRX low (debounced: 1 alert per wallet per 30 min)
      if (trxBalance > 0 && trxBalance < 30 && (w.walletType === "WITHDRAW" || w.walletType === "BOTH")) {
        const key = `low_trx_${w.id}`;
        if (!_lowTrxAlerted.has(key) || Date.now() - (_lowTrxAlerted.get(key) || 0) > 30 * 60 * 1000) {
          _lowTrxAlerted.set(key, Date.now());
          alertLowTRX(w.label || w.address.slice(0, 8), w.address, trxBalance).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }
}

