/**
 * Derive TRON Private Key from 12-word Seed Phrase
 * Chạy LOCAL — không gửi dữ liệu ra ngoài
 */
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('\n🔑 Nhập 12 từ seed phrase (cách nhau bằng dấu cách):\n> ', async (phrase) => {
  rl.close();
  
  try {
    const bip39 = require('bip39');
    const { HDKey } = require('@scure/bip32');
    const tw = require('tronweb');
    const TronWeb = tw.TronWeb || tw.default || tw;
    
    const mnemonic = phrase.trim().toLowerCase();
    
    // Validate
    if (!bip39.validateMnemonic(mnemonic)) {
      console.error('\n❌ Seed phrase không hợp lệ! Kiểm tra lại 12 từ.\n');
      return;
    }
    
    // Derive seed → master key → TRON path
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const master = HDKey.fromMasterSeed(seed);
    
    // TRON BIP44 path: m/44'/195'/0'/0/0
    const child = master.derive("m/44'/195'/0'/0/0");
    const privateKey = Buffer.from(child.privateKey).toString('hex').toUpperCase();
    
    // Get address from private key
    const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });
    const address = tronWeb.address.fromPrivateKey(privateKey);
    
    console.log('\n' + '='.repeat(55));
    console.log('✅ Kết quả:\n');
    console.log('📍 ADDRESS:     ' + address);
    console.log('🔐 PRIVATE KEY: ' + privateKey);
    console.log('\n' + '='.repeat(55));
    console.log('\n⚠️  Copy private key → paste vào Admin Panel → tab Cài đặt');
    console.log('⚠️  Xoá terminal history sau khi xong\n');
    
  } catch (err) {
    console.error('\n❌ Lỗi:', err.message, '\n');
  }
});
