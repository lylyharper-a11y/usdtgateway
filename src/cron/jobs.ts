import cron from "node-cron";
import { checkDeposits, processWithdrawals, expireDeposits, updateBalances } from "../services/tron";

export function startCronJobs() {
  // Monitor deposits every 30 seconds
  cron.schedule("*/30 * * * * *", async () => {
    try { await checkDeposits(); }
    catch (err: any) { console.error("[Cron] checkDeposits error:", err.message); }
  });

  // Process approved withdrawals every 10 seconds
  cron.schedule("*/10 * * * * *", async () => {
    try { await processWithdrawals(); }
    catch (err: any) { console.error("[Cron] processWithdrawals error:", err.message); }
  });

  // Expire old deposits every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try { await expireDeposits(); }
    catch (err: any) { console.error("[Cron] expireDeposits error:", err.message); }
  });

  // Update wallet balances every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    try { await updateBalances(); }
    catch (err: any) { console.error("[Cron] updateBalances error:", err.message); }
  });

  console.log("[Cron] All jobs started");
}
