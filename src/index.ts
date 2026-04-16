import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import apiRoutes from "./routes/api";
import adminRoutes from "./routes/admin";
import { verifyApiKey, verifyAdmin, rateLimitMiddleware } from "./lib/auth";
import { startCronJobs } from "./cron/jobs";
import { startTelegramBot } from "./services/telegram";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");

// Middleware
app.use(cors());
app.use(express.json());

// Static files
app.use("/admin", express.static(path.join(__dirname, "../public/admin")));
app.use("/demo", express.static(path.join(__dirname, "../public/demo")));

// Partner API (protected by API key + rate limit)
app.use("/api/v1", rateLimitMiddleware, verifyApiKey, apiRoutes);

// Admin API (protected by basic auth)
app.use("/admin/api", verifyAdmin, adminRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "1.1.0" });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 USDT Gateway running on port ${PORT}`);
  console.log(`   📡 Partner API: http://localhost:${PORT}/api/v1/`);
  console.log(`   🔧 Admin Panel: http://localhost:${PORT}/admin/`);
  console.log(`   🧪 Demo Page:   http://localhost:${PORT}/demo/`);
  console.log(`   ❤️  Health:      http://localhost:${PORT}/health\n`);

  // Start cron jobs
  startCronJobs();

  // Start Telegram bot
  startTelegramBot();
});
