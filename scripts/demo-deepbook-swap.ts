/**
 * Demo DeepBook v3 Swap Script
 * 
 * This script demonstrates how to swap tokens using DeepBook v3 SDK.
 * It uses the official SDK with correct testnet/mainnet addresses.
 * 
 * Prerequisites:
 * 1. Get SUI from faucet: `sui client faucet` (testnet)
 * 2. Have @mysten/deepbook-v3 and @mysten/sui installed
 * 
 * Usage:
 *   SUI_PRIVATE_KEY="suiprivkey..." npx ts-node scripts/demo-deepbook-swap.ts
 */

import { deepbook, testnetCoins, testnetPools, mainnetCoins, mainnetPools, testnetPackageIds, mainnetPackageIds } from '@mysten/deepbook-v3';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiClient } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config();

// ============================================================================
// CONFIGURATION - Change 'testnet' to 'mainnet' for production
// ============================================================================
const NETWORK: 'testnet' | 'mainnet' = (process.env.SUI_NETWORK as 'testnet' | 'mainnet') || 'testnet';

// Select correct configs based on network
const coins = NETWORK === 'mainnet' ? mainnetCoins : testnetCoins;
const pools = NETWORK === 'mainnet' ? mainnetPools : testnetPools;
const packageIds = NETWORK === 'mainnet' ? mainnetPackageIds : testnetPackageIds;

// RPC URLs
const RPC_URLS = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
};

console.log('='.repeat(70));
console.log(`DeepBook v3 Demo Swap - ${NETWORK.toUpperCase()}`);
console.log('='.repeat(70));
console.log('\n📦 Official DeepBook v3 Addresses:');
console.log(`   Package ID: ${packageIds.DEEPBOOK_PACKAGE_ID}`);
console.log(`   Registry ID: ${packageIds.REGISTRY_ID}`);
console.log('\n🪙 Token Types:');
console.log(`   DEEP: ${coins.DEEP.type}`);
console.log(`   SUI:  ${coins.SUI.type}`);
if ('DBUSDC' in coins) {
  console.log(`   DBUSDC: ${(coins as typeof testnetCoins).DBUSDC.type}`);
}
if ('USDC' in coins) {
  console.log(`   USDC: ${(coins as typeof mainnetCoins).USDC.type}`);
}
console.log('\n🏊 Available Pools:');
Object.entries(pools).forEach(([name, pool]) => {
  console.log(`   ${name}: ${pool.address} (${pool.baseCoin}/${pool.quoteCoin})`);
});
console.log('='.repeat(70));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getKeypairFromPrivateKey(privateKey: string): Ed25519Keypair {
  const { scheme, secretKey } = decodeSuiPrivateKey(privateKey);
  if (scheme !== 'ED25519') {
    throw new Error(`Unsupported key scheme: ${scheme}. Only ED25519 is supported.`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function tryGetPrivateKeyFromKeystore(): string | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');

  try {
    if (fs.existsSync(keystorePath)) {
      const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));
      if (Array.isArray(keystore) && keystore.length > 0) {
        console.log('📁 Found Sui keystore, using first key...');
        return keystore[0];
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// ============================================================================
// MAIN SWAP LOGIC
// ============================================================================

async function main() {
  // Get private key
  let privateKey = process.env.SUI_PRIVATE_KEY;
  
  if (!privateKey) {
    privateKey = tryGetPrivateKeyFromKeystore();
  }
  
  if (!privateKey) {
    console.error('\n❌ No private key found!');
    console.log('\nOptions to provide a private key:');
    console.log('1. Set SUI_PRIVATE_KEY environment variable:');
    console.log('   SUI_PRIVATE_KEY="suiprivkey..." npx ts-node scripts/demo-deepbook-swap.ts');
    console.log('\n2. Export from Sui CLI:');
    console.log('   sui keytool export --key-identity <your-alias>');
    console.log('\n3. Create a new wallet:');
    console.log('   sui client new-address ed25519');
    return;
  }

  try {
    const keypair = getKeypairFromPrivateKey(privateKey);
    const address = keypair.toSuiAddress();
    console.log(`\n🔑 Wallet Address: ${address}`);

    // Create client with DeepBook extension
    const client = new SuiGrpcClient({
      network: NETWORK,
      baseUrl: RPC_URLS[NETWORK],
    }).$extend(
      deepbook({
        address,
      }),
    );

    // Also create a standard client for balance queries
    const suiClient = new SuiClient({ url: RPC_URLS[NETWORK] });

    // Check balances
    console.log('\n📊 Checking balances...');
    
    const suiBalance = await suiClient.getBalance({
      owner: address,
      coinType: coins.SUI.type,
    });
    console.log(`   SUI:  ${(Number(suiBalance.totalBalance) / 1e9).toFixed(4)} SUI`);

    const deepBalance = await suiClient.getBalance({
      owner: address,
      coinType: coins.DEEP.type,
    });
    console.log(`   DEEP: ${(Number(deepBalance.totalBalance) / 1e6).toFixed(4)} DEEP`);

    // Check if user has enough SUI
    const suiAmount = Number(suiBalance.totalBalance);
    if (suiAmount < 0.1 * 1e9) {
      console.log('\n⚠️  Low SUI balance! Get more from faucet:');
      console.log('   sui client faucet');
      return;
    }

    // ========================================================================
    // DEMO SWAP: Buy DEEP with SUI using DEEP_SUI pool
    // ========================================================================
    console.log('\n🔄 Preparing swap: SUI → DEEP');
    console.log(`   Pool: DEEP_SUI (${pools.DEEP_SUI.address})`);
    
    const swapAmountSui = 0.1; // 0.1 SUI
    console.log(`   Amount: ${swapAmountSui} SUI`);

    // Build the swap transaction using DeepBook SDK
    const tx = new Transaction();

    // The SDK provides convenient swap functions
    // For DEEP_SUI pool: DEEP is base, SUI is quote
    // To buy DEEP with SUI = swapExactQuoteForBase
    const [baseCoin, quoteCoin, deepFeeCoin] = client.deepbook.deepBook.swapExactQuoteForBase({
      poolKey: 'DEEP_SUI',
      amount: swapAmountSui, // Amount in human-readable format (SDK handles conversion)
      deepAmount: 0, // No DEEP for fees (will deduct from swap output)
      minOut: 0, // Accept any amount (for demo - in production use proper slippage)
    })(tx);

    // Transfer resulting coins back to the address
    tx.transferObjects([baseCoin, quoteCoin, deepFeeCoin], address);

    console.log('\n📤 Executing swap...');

    const result = await client.core.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      include: { effects: true, events: true },
    });

    if (result.$kind === 'Transaction') {
      console.log('\n✅ Swap successful!');
      console.log(`   Transaction: ${result.Transaction.digest}`);
      console.log(`   Explorer: https://suiscan.xyz/${NETWORK}/tx/${result.Transaction.digest}`);
      
      // Check new balance
      const newDeepBalance = await suiClient.getBalance({
        owner: address,
        coinType: coins.DEEP.type,
      });
      console.log(`\n   New DEEP balance: ${(Number(newDeepBalance.totalBalance) / 1e6).toFixed(4)} DEEP`);
    } else {
      console.log('\n❌ Swap failed!');
      console.log(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    
    // Provide helpful debugging info
    if (error instanceof Error && error.message.includes('InsufficientCoinBalance')) {
      console.log('\n💡 You need more SUI. Get some from the faucet:');
      console.log('   sui client faucet');
    }
    if (error instanceof Error && error.message.includes('pool')) {
      console.log('\n💡 Pool error. The pool might not have enough liquidity.');
      console.log('   Try a smaller amount or check if the pool exists.');
    }
  }
}

main().catch(console.error);
