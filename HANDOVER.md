# 📦 BÀN GIAO HỆ THỐNG — USDT Payment Gateway (TRC20)

> **Ngày bàn giao**: 2026-04-29
> **Phiên bản**: 1.1.0
> **Trạng thái**: ✅ Đang hoạt động Production

---

## 1. Tổng quan hệ thống

Cổng thanh toán USDT (TRC20) tự động — cho phép **nạp/rút USDT** qua blockchain TRON, tích hợp API cho đối tác, quản lý qua Admin CMS và thông báo qua Telegram Bot.

### Tính năng chính
| Module | Mô tả |
|--------|-------|
| 📥 Nạp USDT | Tạo đơn → gán ví → quét blockchain tự động → xác nhận → webhook callback |
| 📤 Rút USDT | Tạo đơn → duyệt (manual/auto) → gửi on-chain tự động → callback |
| 🔧 Admin CMS | Dashboard, quản lý nạp/rút/ví/đối tác, cài đặt, seed phrase derive |
| 🤖 Telegram Bot | Thông báo tự động mọi sự kiện, lệnh /xem tổng quan, 2FA OTP |
| 🔌 Partner API | REST API xác thực API Key, HMAC webhook signature |
| 🧪 Demo Page | Trang test nạp/rút/tra cứu cho đối tác |

---

## 2. Thông tin VPS & Truy cập

### Server
| Key | Value |
|-----|-------|
| VPS IP | `103.161.225.245` |
| SSH | `ssh kohnan999@103.161.225.245` (key-based) |
| SSH Password | `kohnan999` |
| OS | Ubuntu, Node.js 20 |
| App Path | `/home/kohnan999/usdtgateway` |
| PM2 Process | `usdt-gateway` |
| Port | `3002` |

### URLs Production
| Trang | URL |
|-------|-----|
| 🔧 Admin CMS | http://103.161.225.245:3002/admin/ |
| 🧪 Demo Test | http://103.161.225.245:3002/demo/ |
| 📖 Hướng dẫn | http://103.161.225.245:3002/docs/guide |
| 📡 API Docs | http://103.161.225.245:3002/docs/api |
| ❤️ Health | http://103.161.225.245:3002/health |

### Tài khoản Admin CMS
| Key | Value |
|-----|-------|
| Username | `admin` |
| Password | `UsdtAdmin2026!` |

---

## 3. Biến môi trường (.env)

```env
DATABASE_URL="postgresql://usdtgw:UsdtGw2026Pass@localhost:5432/usdt_gateway?schema=public"
PORT=3002
ADMIN_USERNAME=admin
ADMIN_PASSWORD=UsdtAdmin2026!
TRONGRID_API_KEY=4bb7dd6e-9a38-44e9-9f10-b9ac1d1d4c4c
ENCRYPTION_KEY=usdt_gw_enc_key_prod_32chars!!
```

> ⚠️ **ENCRYPTION_KEY** KHÔNG ĐƯỢC thay đổi sau khi đã có ví trong hệ thống. Private key ví được mã hoá bằng key này.

---

## 4. Database

### Thông tin kết nối
| Key | Value |
|-----|-------|
| Engine | PostgreSQL |
| Host | localhost:5432 |
| Database | `usdt_gateway` |
| User | `usdtgw` |
| Password | `UsdtGw2026Pass` |

### Schema (6 bảng)
| Bảng | Mô tả |
|------|-------|
| `partners` | Đối tác API (name, apiKey, secretKey, callback, spread) |
| `wallets` | Ví TRON (address, encrypted privateKey, balance, type) |
| `deposits` | Lệnh nạp USDT (orderCode, amount, txHash, status) |
| `withdrawals` | Lệnh rút USDT (orderCode, amount, toAddress, txHash, status) |
| `settings` | Cấu hình hệ thống (key-value) |
| `rate_history` | Lịch sử tỷ giá |
| `admin_logs` | Log hệ thống |

### Backup & Restore
```bash
# Backup
PGPASSWORD=UsdtGw2026Pass pg_dump -h localhost -U usdtgw -d usdt_gateway --clean --if-exists > backup.sql

# Restore
PGPASSWORD=UsdtGw2026Pass psql -h localhost -U usdtgw -d usdt_gateway < backup.sql
```

File backup hiện tại: `usdt_gateway_backup.sql` (đính kèm)

---

## 5. Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20 + tsx |
| Framework | Express 5 |
| ORM | Prisma 6 |
| Database | PostgreSQL |
| Blockchain | TronWeb (TRC20 USDT) |
| Process Manager | PM2 |
| Crypto | AES-256-CBC (private key), HMAC-SHA256 (webhook) |
| Key Derivation | BIP39 + BIP32 (seed phrase → TRON key) |

---

## 6. Cấu trúc thư mục

```
usdtgateway/
├── src/
│   ├── index.ts              # Entry point, Express setup
│   ├── routes/
│   │   ├── api.ts            # Partner API (POST /deposit, /withdraw, GET /status)
│   │   └── admin.ts          # Admin API (CRUD ví, đối tác, cài đặt, derive key)
│   ├── services/
│   │   ├── telegram.ts       # Telegram bot + alerts + 2FA OTP
│   │   ├── rate.ts           # Tỷ giá USDT/VND (Binance P2P / manual)
│   │   └── blockchain.ts     # TRON blockchain scanner
│   ├── cron/
│   │   ├── checkDeposits.ts  # Quét blockchain phát hiện nạp (30s)
│   │   ├── processWithdrawals.ts  # Gửi USDT on-chain (10s)
│   │   ├── expireDeposits.ts # Hết hạn đơn nạp (5min)
│   │   └── updateBalances.ts # Cập nhật số dư ví (2min)
│   ├── lib/
│   │   ├── prisma.ts         # Prisma client
│   │   ├── crypto.ts         # AES encrypt/decrypt, API key gen
│   │   └── auth.ts           # Admin auth, API key verify, rate limit
│   └── seed.ts               # Seed dữ liệu ban đầu
├── prisma/
│   └── schema.prisma         # Database schema
├── public/
│   ├── admin/index.html      # Admin CMS (SPA)
│   ├── demo/index.html       # Demo page
│   └── docs/
│       ├── guide.html        # Hướng dẫn hệ thống
│       └── api.html          # API documentation
├── derive-key.js             # CLI tool: seed phrase → private key
├── package.json
├── tsconfig.json
└── .env
```

---

## 7. Cron Jobs (Tự động)

| Job | Chu kỳ | Chức năng |
|-----|--------|-----------|
| `checkDeposits` | 30 giây | Quét blockchain phát hiện TX nạp USDT |
| `processWithdrawals` | 10 giây | Gửi USDT on-chain cho lệnh rút đã duyệt |
| `expireDeposits` | 5 phút | Hết hạn đơn nạp quá thời gian |
| `updateBalances` | 2 phút | Cập nhật số dư ví từ blockchain |

---

## 8. Bảo mật

| Feature | Chi tiết |
|---------|----------|
| Private Key | Mã hoá AES-256-CBC trong DB |
| API Auth | API Key header (`x-api-key`) |
| Webhook | HMAC-SHA256 signature |
| 2FA | OTP qua Telegram (bật/tắt trong CMS) |
| Rate Limit | Cấu hình request/phút |
| IP Whitelist | Bật/tắt + danh sách IP cho admin |
| Daily Limit | Giới hạn rút/ngày (USDT) |
| Cooldown | Khoảng cách tối thiểu giữa 2 lệnh rút |
| Alert Toggle | Bật/tắt từng loại thông báo Telegram |

---

## 9. Telegram Bot

| Key | Value |
|-----|-------|
| Bot Token | `8656733773:AAHtdZ8bRHPt6QkeIz6UTOM3-PltVn6lLko` |
| Chat Group ID | `-1003751127133` |
| Lệnh | `/xem` — Xem tổng quan hệ thống |

### Thông báo tự động (bật/tắt trong CMS)
- 🔐 Admin đăng nhập (debounce 2h/IP)
- 📥 Lệnh nạp mới / nạp thành công
- 📤 Lệnh rút / chờ duyệt / rút thành công / thất bại
- 🔋 TRX thấp (debounce 1h/ví)
- ⚡ Giao dịch không khớp (debounce 30min/TX)
- 💼 Thêm/sửa/xoá ví
- 👥 Thêm/sửa/xoá đối tác
- Tất cả TX có link Tronscan để kiểm tra nhanh

---

## 10. Trạng thái giao dịch

### Nạp
`PENDING` → `CONFIRMED` / `EXPIRED`

### Rút
`PENDING` → `APPROVED` → `SENDING` → `SENT` / `FAILED` / `REJECTED`

---

## 11. Vận hành thường ngày

### Khởi động / Dừng
```bash
ssh kohnan999@103.161.225.245
cd /home/kohnan999/usdtgateway

# Restart
pm2 restart usdt-gateway

# Stop
pm2 stop usdt-gateway

# Start
pm2 start npm --name usdt-gateway -- run start:prod

# Xem log
pm2 logs usdt-gateway --lines 50
```

### Thêm ví mới từ Seed Phrase
```bash
cd /home/kohnan999/usdtgateway
node derive-key.js
# Nhập 12 từ → Lấy address + private key
# Paste vào Admin CMS → Tab Ví → Thêm ví
```

Hoặc dùng Admin CMS → Tab Cài đặt → Section "Lấy Private Key từ Seed Phrase"

### Lưu ý quan trọng
1. ⚠️ Hệ thống chạy trên **TRON Mainnet** — mọi giao dịch đều dùng USDT thật
2. Nạp phải chuyển **đúng số USDT** đã tạo đơn
3. Rút kiểm tra kỹ **địa chỉ ví nhận** — sai ví thì USDT mất không lấy lại
4. Ví rút cần ≥ **30 TRX** phí gas
5. **ENCRYPTION_KEY** không được thay đổi sau khi đã có ví
6. Backup database PostgreSQL định kỳ

---

## 12. Danh sách file bàn giao

| File | Mô tả |
|------|-------|
| `HANDOVER.md` | Tài liệu bàn giao (file này) |
| `usdt_gateway_backup.sql` | Backup database PostgreSQL |
| `prisma/schema.prisma` | Database schema |
| `src/` | Toàn bộ source code backend |
| `public/` | Admin CMS + Demo + Docs (HTML) |
| `package.json` | Dependencies |
| `.env.example` | Mẫu biến môi trường |
| `derive-key.js` | CLI tool lấy private key từ seed phrase |

---

## 13. Cài đặt trên server mới

```bash
# 1. Clone source
git clone <repo> usdtgateway && cd usdtgateway

# 2. Install dependencies
npm install

# 3. Cấu hình .env
cp .env.example .env
# Sửa DATABASE_URL, ENCRYPTION_KEY, TRONGRID_API_KEY

# 4. Setup database
npx prisma generate
npx prisma db push

# 5. (Tuỳ chọn) Restore backup
PGPASSWORD=<pass> psql -h localhost -U <user> -d <db> < usdt_gateway_backup.sql

# 6. Seed dữ liệu admin
npx tsx src/seed.ts

# 7. Start
pm2 start npm --name usdt-gateway -- run start:prod
pm2 save

# 8. Verify
curl http://localhost:3002/health
```

---

**Liên hệ hỗ trợ kỹ thuật nếu cần.**
