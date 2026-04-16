# USDT Gateway — API Documentation

**Base URL:** `https://your-domain.com/api/v1`
**Authentication:** Header `x-api-key: <your_api_key>`

---

## 1. Lấy tỷ giá

```
GET /api/v1/rate
```

**Response:**
```json
{
  "success": true,
  "data": {
    "baseRate": 25800,
    "depositRate": 25542,
    "withdrawRate": 26058,
    "source": "binance_p2p",
    "timestamp": "2026-04-16T02:00:00.000Z"
  }
}
```

| Field | Mô tả |
|-------|--------|
| `baseRate` | Tỷ giá gốc VND/USDT |
| `depositRate` | Tỷ giá nạp (đã áp dụng spread) |
| `withdrawRate` | Tỷ giá rút (đã áp dụng spread) |
| `source` | Nguồn tỷ giá (binance_p2p / manual) |

---

## 2. Tạo đơn nạp

```
POST /api/v1/deposit
Content-Type: application/json
```

**Body:**
```json
{
  "amount": 100,
  "orderId": "ORDER-001"
}
```

| Param | Type | Required | Mô tả |
|-------|------|----------|--------|
| `amount` | number | ✅ | Số USDT cần nạp |
| `orderId` | string | | Mã đơn phía partner (để đối soát) |

**Response:**
```json
{
  "success": true,
  "data": {
    "orderCode": "UDEP-A1B2C3D4-E5F6",
    "walletAddress": "TCYYWbxUpDB2DZqWaE4LM24XEA139yr9Hf",
    "qrCodeUrl": "https://api.qrserver.com/v1/create-qr-code/?data=TCYYWb...",
    "network": "TRC20",
    "amount": 100,
    "exchangeRate": 25542,
    "estimatedVnd": 2554200,
    "expiresAt": "2026-04-16 09:30:00 (GMT+7)",
    "expiryMinutes": 30,
    "status": "PENDING"
  }
}
```

### Lưu ý:
- User phải chuyển **đúng** số USDT. Sai số tiền không tự động xác nhận.
- Đơn hết hạn sau `expiryMinutes` phút.

---

## 3. Tạo đơn rút

```
POST /api/v1/withdraw
Content-Type: application/json
```

**Body:**
```json
{
  "amount": 50,
  "toAddress": "TVhCRWuqbEiDFKGtiqXYJLmoh9iiZsA6j4",
  "network": "TRC20",
  "orderId": "WD-001"
}
```

| Param | Type | Required | Mô tả |
|-------|------|----------|--------|
| `amount` | number | ✅ | Số USDT rút |
| `toAddress` | string | ✅ | Địa chỉ ví TRC20 nhận |
| `network` | string | | Mạng (mặc định TRC20) |
| `orderId` | string | | Mã đơn phía partner |

**Response:**
```json
{
  "success": true,
  "data": {
    "orderCode": "UWD-X1Y2Z3W4-A5B6",
    "amount": 50,
    "exchangeRate": 26058,
    "amountVnd": 1302900,
    "toAddress": "TVhCRWuqbEiDFKGtiqXYJLmoh9iiZsA6j4",
    "network": "TRC20",
    "status": "PENDING"
  }
}
```

### Trạng thái rút:
`PENDING` → `APPROVED` → `SENDING` → `SENT` / `FAILED` / `REJECTED`

---

## 4. Tra cứu đơn

```
GET /api/v1/status/:orderCode
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderCode": "UDEP-A1B2C3D4-E5F6",
    "type": "deposit",
    "status": "CONFIRMED",
    "amountUsdt": 100,
    "amountVnd": 2554200,
    "exchangeRate": 25542,
    "txHash": "abc123...",
    "createdAt": "2026-04-16T02:00:00.000Z"
  }
}
```

---

## 5. Lịch sử giao dịch

```
GET /api/v1/history?type=all&page=1&limit=20
```

| Param | Default | Mô tả |
|-------|---------|--------|
| `type` | `all` | `all` / `deposit` / `withdrawal` |
| `status` | | Lọc theo trạng thái |
| `page` | `1` | Trang |
| `limit` | `20` | Số dòng/trang |

---

## 6. Webhook Callback

Khi trạng thái thay đổi, hệ thống POST đến `callbackUrl` của partner.

**Headers:**
```
x-signature: <HMAC-SHA256>
x-timestamp: <ISO timestamp>
```

**Body:**
```json
{
  "event": "deposit.confirmed",
  "orderCode": "UDEP-...",
  "amountUsdt": 100,
  "amountVnd": 2554200,
  "txHash": "abc123...",
  "status": "CONFIRMED",
  "timestamp": "2026-04-16T02:00:00.000Z"
}
```

### Events:
| Event | Mô tả |
|-------|--------|
| `deposit.confirmed` | Nạp thành công |
| `withdrawal.completed` | Rút thành công |
| `withdrawal.rejected` | Rút bị từ chối |

### Xác thực Signature:
```javascript
const crypto = require('crypto');
function verifySignature(body, signature, secretKey) {
  const expected = crypto.createHmac('sha256', secretKey)
    .update(JSON.stringify(body)).digest('hex');
  return expected === signature;
}
```

---

## 7. Mã lỗi

| HTTP | Error | Mô tả |
|------|-------|--------|
| 400 | Invalid amount | Số tiền không hợp lệ |
| 400 | Invalid TRC20 address | Sai format ví |
| 400 | Vượt giới hạn rút/ngày | Quá daily limit |
| 401 | Missing x-api-key | Thiếu API key |
| 403 | Invalid API key | Key sai/bị vô hiệu |
| 404 | Order not found | Không tìm thấy đơn |
| 429 | Too many requests | Rate limit |
| 429 | Cooldown | Chờ cooldown rút |
| 503 | No wallet available | Không có ví trống |

---

## 8. Ví dụ tích hợp

### Node.js
```javascript
const API = 'https://your-domain.com/api/v1';
const KEY = 'ugw_your_api_key';
const headers = { 'Content-Type': 'application/json', 'x-api-key': KEY };

// Nạp
const dep = await fetch(`${API}/deposit`, {
  method: 'POST', headers,
  body: JSON.stringify({ amount: 100, orderId: 'MY-001' })
}).then(r => r.json());
console.log('Ví:', dep.data.walletAddress);

// Rút
const wd = await fetch(`${API}/withdraw`, {
  method: 'POST', headers,
  body: JSON.stringify({ amount: 50, toAddress: 'TVhCRW...' })
}).then(r => r.json());
```

### PHP
```php
$ch = curl_init("$apiUrl/deposit");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ['Content-Type: application/json', "x-api-key: $key"],
  CURLOPT_POSTFIELDS => json_encode(['amount' => 100]),
]);
$result = json_decode(curl_exec($ch), true);
```

### Python
```python
import requests
r = requests.post(f'{API}/deposit', headers=headers, json={'amount': 100})
print(r.json()['data']['walletAddress'])
```

---

## 9. Checklist tích hợp

- [ ] Lấy API key + Secret key từ admin
- [ ] Test trên trang Demo (`/demo/`)
- [ ] Implement callback endpoint + xác thực signature
- [ ] Implement polling status (backup)
- [ ] Test full flow nạp + rút
- [ ] Deploy callback lên production
