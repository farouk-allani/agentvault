/**
 * Print DeepBook v3 Official Addresses
 * 
 * This script prints all the correct addresses from the official @mysten/deepbook-v3 SDK.
 * Use these addresses in your application to ensure compatibility.
 * 
 * Usage:
 *   npx ts-node scripts/print-deepbook-addresses.ts
 */

import { 
  testnetCoins, 
  testnetPools, 
  testnetPackageIds,
  testnetMarginPools,
  mainnetCoins, 
  mainnetPools, 
  mainnetPackageIds,
  mainnetMarginPools,
} from '@mysten/deepbook-v3';

console.log('='.repeat(80));
console.log('DEEPBOOK V3 OFFICIAL ADDRESSES');
console.log('Source: @mysten/deepbook-v3 SDK');
console.log('='.repeat(80));

// ============================================================================
// TESTNET
// ============================================================================
console.log('\n' + '═'.repeat(80));
console.log('TESTNET CONFIGURATION');
console.log('═'.repeat(80));

console.log('\n📦 Package IDs:');
console.log(JSON.stringify(testnetPackageIds, null, 2));

console.log('\n🪙 Token Types (Coins):');
Object.entries(testnetCoins).forEach(([name, coin]) => {
  console.log(`\n  ${name}:`);
  console.log(`    Address: ${coin.address}`);
  console.log(`    Type:    ${coin.type}`);
  console.log(`    Scalar:  ${coin.scalar} (${Math.log10(coin.scalar)} decimals)`);
});

console.log('\n🏊 Pool Addresses:');
Object.entries(testnetPools).forEach(([name, pool]) => {
  console.log(`\n  ${name}:`);
  console.log(`    Address:    ${pool.address}`);
  console.log(`    Base Coin:  ${pool.baseCoin}`);
  console.log(`    Quote Coin: ${pool.quoteCoin}`);
});

console.log('\n💰 Margin Pools:');
Object.entries(testnetMarginPools).forEach(([name, pool]) => {
  console.log(`\n  ${name}:`);
  console.log(`    Address: ${pool.address}`);
  console.log(`    Type:    ${pool.type}`);
});

// ============================================================================
// MAINNET
// ============================================================================
console.log('\n\n' + '═'.repeat(80));
console.log('MAINNET CONFIGURATION');
console.log('═'.repeat(80));

console.log('\n📦 Package IDs:');
console.log(JSON.stringify(mainnetPackageIds, null, 2));

console.log('\n🪙 Token Types (Coins):');
Object.entries(mainnetCoins).forEach(([name, coin]) => {
  console.log(`\n  ${name}:`);
  console.log(`    Address: ${coin.address}`);
  console.log(`    Type:    ${coin.type}`);
  console.log(`    Scalar:  ${coin.scalar} (${Math.log10(coin.scalar)} decimals)`);
});

console.log('\n🏊 Pool Addresses:');
Object.entries(mainnetPools).forEach(([name, pool]) => {
  console.log(`\n  ${name}:`);
  console.log(`    Address:    ${pool.address}`);
  console.log(`    Base Coin:  ${pool.baseCoin}`);
  console.log(`    Quote Coin: ${pool.quoteCoin}`);
});

console.log('\n💰 Margin Pools:');
Object.entries(mainnetMarginPools).forEach(([name, pool]) => {
  console.log(`\n  ${name}:`);
  console.log(`    Address: ${pool.address}`);
  console.log(`    Type:    ${pool.type}`);
});

// ============================================================================
// IMPORTANT NOTES
// ============================================================================
console.log('\n\n' + '═'.repeat(80));
console.log('IMPORTANT NOTES');
console.log('═'.repeat(80));

console.log(`
⚠️  KEY DIFFERENCES BETWEEN TESTNET AND MAINNET:

1. USDC Tokens:
   - TESTNET uses "DBUSDC" (DeepBook USDC) - a testnet-only token
     Type: 0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC
   
   - MAINNET uses native USDC
     Type: 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC

2. DEEP Token:
   - TESTNET: 0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP
   - MAINNET: 0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP

3. Pool IDs are completely different between networks!
   Always use the correct pool ID for your target network.

4. Getting Testnet Tokens:
   - SUI: sui client faucet
   - DEEP/DBUSDC: Swap from SUI using DeepBook pools or ask in Discord

💡 COMMON ISSUES:

- "Invalid coin type" → You're using mainnet token addresses on testnet (or vice versa)
- "Pool not found" → Wrong pool address for the network
- "InsufficientCoinBalance" → You don't have enough of the input token
- "Slippage exceeded" → Try a smaller amount or adjust minOut parameter
`);

console.log('='.repeat(80));
