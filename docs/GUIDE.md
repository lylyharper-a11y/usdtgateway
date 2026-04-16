# USDT Gateway — Hướng dẫn hệ thống

## 1. Tổng quan

USDT Gateway là hệ thống cổng thanh toán USDT (TRC20) tự động, cho phép đối tác (partner) tích hợp nạp/rút USDT thông qua API. Hệ thống bao gồm:

- **Partner API** — REST API cho đối tác tích hợp nạp/rút/tra cứu
- **Admin CMS** — Bảng điều khiển quản trị
- **Telegram Bot** — Thông báo real-time + OTP bảo mật
- **Blockchain Monitor** — Tự động phát hiện giao dịch on-chain
- **Auto Withdrawal** — Tự động gửi USDT khi lệnh được duyệt

## 2. Yêu cầu hệ thống

| Thành phần | Yêu cầu |
|------------|---------|
| Node.js | >= 18.x |
| PostgreSQL | >= 14 |
| RAM | >= 1GB |
| Disk | >= 5GB |
| OS | Ubuntu 20.04+ / Windows Server |

## 3. Cài đặt

```bash
# Clone repo
git clone https://github.com/lylyharper-a11y/usdtgateway.git
cd usdtgateway

# Cài dependencies
npm install

# Cấu hình .env
cp .env.example .env
# Sửa DATABASE_URL, ADMIN_PASSWORD, ENCRYPTION_KEY,...

# Khởi tạo database
npx prisma db push
npx prisma generate

# Seed data mẫu (tạo partner demo)
npm run db:seed

# Chạy development
npm run dev

# Build & chạy production
npm run build
npm start
```

## 4. Biến môi trường (.env)

| Biến | Bắt buộc | Mô tả | Ví dụ |
|------|----------|-------|-------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/usdt_gateway` |
| `PORT` | | Cổng server (mặc định 3001) | `3001` |
| `ADMIN_USERNAME` | ✅ | Tên đăng nhập admin CMS | `admin` |
| `ADMIN_PASSWORD` | ✅ | Mật khẩu admin CMS | `StrongP@ss123` |
| `ENCRYPTION_KEY` | ✅ | Key mã hóa private key (32 ký tự) | `my_super_secret_key_32_chars!!` |
| `TRONGRID_API_KEY` | ✅ | API key từ trongrid.io | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

## 5. Các chức năng chính

### 5.1 Admin CMS (`/admin/`)

Truy cập qua trình duyệt, đăng nhập bằng Basic Auth.

**Dashboard:**
- Tổng nạp/rút USDT (hôm nay + tổng)
- Số dư ví on-chain (real-time từ blockchain)
- Tỷ giá hiện tại

**Tab Nạp USDT:**
- Danh sách tất cả lệnh nạp
- Tìm kiếm theo mã đơn, TX Hash, địa chỉ ví
- Lọc theo ví nạp
- Phân trang (10/trang)
- Xác nhận thủ công cho giao dịch không khớp
- Bảng "Giao dịch không khớp" — hiển thị TX nhận được nhưng không match đơn nào

**Tab Rút USDT:**
- Danh sách lệnh rút với trạng thái (Chờ duyệt / Đã duyệt / Đang gửi / Đã gửi / Thất bại / Từ chối)
- Duyệt / Từ chối lệnh rút
- 2FA OTP qua Telegram (nếu bật)
- Tìm kiếm và lọc

**Tab Ví:**
- Quản lý ví nạp/rút riêng biệt
- Thêm ví mới (địa chỉ + private key encrypted)
- Import từ seed phrase (12 từ → tự derive private key)
- Xem số dư USDT + TRX (gas) real-time
- Bật/tắt/xóa ví

**Tab Đối tác:**
- Quản lý partner: tên, API key, secret key, callback URL
- Cấu hình spread (chênh lệch giá) mua/bán cho từng partner

**Tab Cài đặt:**

*Tỷ giá:*
- Tự động (lấy từ Binance P2P) hoặc thủ công
- Thời gian hiệu lực QR (phút)

*Cấu hình rút:*
- Chế độ rút: Thủ công (admin duyệt) hoặc Tự động (dưới ngưỡng X USDT)
- Mức tối đa tự động rút

*TronGrid API:*
- API key cho truy vấn blockchain

*Bảo mật:*
- Telegram Bot Token + Chat Group ID
- 2FA OTP cho duyệt rút (bật/tắt)
- Giới hạn rút/ngày (USDT)
- Cooldown rút (phút)
- Rate limit API (request/phút)
- IP Whitelist Admin (bật/tắt + danh sách IP)

### 5.2 Demo Page (`/demo/`)

Trang test thử nạp/rút không cần code:
- Tạo đơn nạp → hiện QR + địa chỉ ví → polling tự động chờ xác nhận
- Tạo đơn rút → nhập ví nhận → theo dõi trạng thái
- Tra cứu đơn theo mã
- Lịch sử giao dịch

### 5.3 Telegram Bot

**Thông báo tự động:**
- 🔐 Admin đăng nhập CMS (IP, thiết bị, thời gian)
- 📥 Lệnh nạp mới
- ✅ Nạp thành công (kèm TX hash)
- 📤 Lệnh rút mới
- ⚠️ Lệnh rút chờ duyệt (kèm OTP nếu 2FA bật)
- 💸 Rút thành công
- ❌ Rút thất bại
- 🔋 TRX (gas) thấp < 30 TRX
- ⚡ Giao dịch không khớp (chuyển nhầm)

**Lệnh bot:**
- `/xem` — Xem tổng quan: số ví, số dư, giao dịch hôm nay, quỹ

### 5.4 Cơ chế tự động

| Cron Job | Chu kỳ | Chức năng |
|----------|--------|-----------|
| `checkDeposits` | 30 giây | Quét blockchain phát hiện giao dịch nạp USDT |
| `processWithdrawals` | 10 giây | Gửi USDT cho lệnh rút đã duyệt |
| `expireDeposits` | 5 phút | Hết hạn đơn nạp quá thời gian |
| `updateBalances` | 2 phút | Cập nhật số dư ví on-chain |

### 5.5 Bảo mật

- **Private Key** mã hóa AES-256-CBC trong database
- **API Key** xác thực mỗi partner
- **HMAC Signature** cho webhook callback
- **2FA OTP** (Telegram) cho duyệt rút
- **Rate Limiting** API (cấu hình được)
- **IP Whitelist** cho admin (bật/tắt)
- **Giới hạn rút/ngày** + **Cooldown** chống rút ồ ạt

## 6. Flow hoạt động

### Nạp USDT
```
Partner gọi POST /deposit → Hệ thống tạo đơn + gán ví
  → Partner hiển thị QR cho user
  → User chuyển USDT vào ví
  → Cron phát hiện TX on-chain
  → Khớp số tiền → CONFIRMED
  → Webhook callback về partner
  → Telegram alert
```

### Rút USDT
```
Partner gọi POST /withdraw → Hệ thống tạo đơn PENDING
  → [Auto mode] Dưới ngưỡng → auto APPROVED
  → [Manual mode] Admin duyệt (kèm OTP nếu 2FA)
  → Cron gửi USDT on-chain → SENT
  → Webhook callback về partner
  → Telegram alert
```

## 7. Trạng thái giao dịch

**Nạp:** `PENDING` → `CONFIRMED` / `EXPIRED`
**Rút:** `PENDING` → `APPROVED` → `SENDING` → `SENT` / `FAILED` / `REJECTED`

## 8. Lưu ý production

1. **Đổi ADMIN_PASSWORD** — không dùng mật khẩu mặc định
2. **Đổi ENCRYPTION_KEY** — key mã hóa private key, 32 ký tự, không được thay đổi sau khi đã có ví
3. **TRX gas** — Ví rút cần ≥ 30 TRX để trả phí giao dịch TRC20
4. **Backup database** — Định kỳ backup PostgreSQL
5. **SSL/HTTPS** — Dùng nginx reverse proxy + Let's Encrypt cho production
6. **Firewall** — Chỉ mở port cần thiết (80, 443)
