import { prisma } from "./lib/prisma";
import { generateApiKey, generateSecretKey } from "./lib/crypto";

async function main() {
  console.log("🌱 Seeding USDT Gateway database...\n");

  // Create demo partner
  const partner = await prisma.partner.upsert({
    where: { apiKey: "ugw_demo_test_key_12345" },
    update: {},
    create: {
      name: "Demo Partner",
      apiKey: "ugw_demo_test_key_12345",
      secretKey: "demo_secret_key_for_testing",
      callbackUrl: null,
      buySpread: 1,
      sellSpread: 1,
    },
  });
  console.log(`✅ Partner: ${partner.name} (apiKey: ${partner.apiKey})`);

  // Create demo wallet (placeholder address)
  const wallet = await prisma.wallet.upsert({
    where: { address: "TDemoWalletAddressForTestingOnly33" },
    update: {},
    create: {
      label: "Demo Wallet (test only)",
      address: "TDemoWalletAddressForTestingOnly33",
      privateKey: "encrypted_placeholder",
      network: "TRC20",
      status: "ACTIVE",
      balance: 0,
    },
  });
  console.log(`✅ Wallet: ${wallet.label} (${wallet.address})`);

  console.log("\n🎉 Seed complete!\n");
  console.log("📌 Test API key: ugw_demo_test_key_12345");
  console.log("📌 Admin auth:   admin / changeme123\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
