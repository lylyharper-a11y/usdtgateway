/**
 * USDT Gateway Setup Script
 * - Tạo ví TRC20 mới cho hệ thống
 * - Hiển thị address + private key
 * - Hướng dẫn nạp TRX + USDT
 */
const tw = require("tronweb");
const TronWeb = tw.TronWeb || tw.default || tw;

async function main() {
  console.log("\n💎 USDT Gateway — Setup\n");
  console.log("=".repeat(50));
  
  // 1. Tạo ví mới
  console.log("\n📌 Bước 1: Tạo ví hệ thống mới...\n");
  const tronWeb = new TronWeb({ fullHost: "https://api.trongrid.io" });
  const account = await tronWeb.createAccount();
  
  console.log("✅ Ví đã tạo thành công!\n");
  console.log("┌─────────────────────────────────────────────────┐");
  console.log("│  ADDRESS (công khai — dùng để nhận tiền):       │");
  console.log(`│  ${account.address.base58}`);
  console.log("│                                                 │");
  console.log("│  PRIVATE KEY (BÍ MẬT — KHÔNG chia sẻ):         │");
  console.log(`│  ${account.privateKey}`);
  console.log("└─────────────────────────────────────────────────┘");
  
  console.log("\n⚠️  LƯU Ý BẢO MẬT:");
  console.log("   - Private key CHỈ hiện 1 LẦN DUY NHẤT");
  console.log("   - Copy và lưu vào nơi an toàn NGAY");
  console.log("   - KHÔNG gửi private key qua chat/email\n");
  
  // 2. Hướng dẫn
  console.log("=".repeat(50));
  console.log("\n📌 Bước 2: Anh cần làm tiếp:\n");
  console.log(`   a) Mở TrustWallet → Gửi ~100 TRX vào địa chỉ:`);
  console.log(`      ${account.address.base58}`);
  console.log(`      (TRX dùng làm phí gas, ~$10)\n`);
  console.log(`   b) Gửi USDT (TRC20) vào cùng địa chỉ trên`);
  console.log(`      (Số lượng USDT tuỳ anh, dùng làm vốn rút)\n`);
  
  console.log("=".repeat(50));
  console.log("\n📌 Bước 3: Cập nhật file .env\n");
  console.log("   Mở file: C:\\Antigravity\\Congthanhtoan\\usdt\\.env");
  console.log("   Sửa 2 dòng sau:\n");
  console.log(`   HOT_WALLET_ADDRESS=${account.address.base58}`);
  console.log(`   HOT_WALLET_PRIVATE_KEY=${account.privateKey}\n`);
  console.log("   Đồng thời điền TRONGRID_API_KEY=<key từ trongrid.io>\n");
  
  console.log("=".repeat(50));
  console.log("\n📌 Bước 4: Thêm ví vào Admin Panel\n");
  console.log("   Mở http://localhost:3001/admin/");
  console.log("   Tab 'Ví' → Thêm ví:");
  console.log(`   - Tên ví: Ví TRC20 chính`);
  console.log(`   - Địa chỉ: ${account.address.base58}`);
  console.log(`   - Private Key: ${account.privateKey}`);
  console.log(`   - Network: TRC20\n`);
  
  console.log("✅ Sau khi hoàn tất 4 bước → hệ thống sẵn sàng!\n");
}

main().catch(console.error);
