/**
 * Get DBUSDC via two-step swap: SUI → DEEP → DBUSDC
 * Or try direct market order
 * 
 * Usage:
 *   SUI_PRIVATE_KEY="..." npx tsx get-dbusdc-v2.ts
 */

import { deepbook, testnetPools, testnetCoins, testnetPackageIds } from '@mysten/deepbook-v3';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config();

const RPC_URL = 'https://fullnode.testnet.sui.io:443';

console.log('='.repeat(70));
console.log('DeepBook v3 - Get DBUSDC (Testnet) - v2');
console.log('='.repeat(70));

// Helper to get keypair from private key
function getKeypairFromPrivateKey(privateKey: string): Ed25519Keypair {
  // Try different formats
  try {
    // Handle Sui bech32 format (suiprivkey1...)
    if (privateKey.startsWith('suiprivkey')) {
      const { scheme, secretKey } = decodeSuiPrivateKey(privateKey);
      if (scheme !== 'ED25519') {
        throw new Error(`Unsupported key scheme: ${scheme}`);
      }
      return Ed25519Keypair.fromSecretKey(secretKey);
    }
    
    // Handle base64 format (from keystore)
    const decoded = Buffer.from(privateKey, 'base64');
    // First byte is the scheme flag (0 = ED25519)
    if (decoded[0] === 0 && decoded.length === 33) {
      return Ed25519Keypair.fromSecretKey(decoded.slice(1));
    }
    
    // Try raw 32-byte secret key
    if (decoded.length === 32) {
      return Ed25519Keypair.fromSecretKey(decoded);
    }
    
    throw new Error(`Unknown private key format`);
  } catch (err) {
    throw new Error(`Failed to parse private key: ${err instanceof Error ? err.message : err}`);
  }
}

// Try to get private key from Sui keystore
function tryGetPrivateKeyFromKeystore(): string | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');

  console.log(`   Looking for keystore at: ${keystorePath}`);
  
  try {
    if (fs.existsSync(keystorePath)) {
      const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));
      if (Array.isArray(keystore) && keystore.length > 0) {
        console.log(`   Found ${keystore.length} key(s) in keystore`);
        return keystore[0];
      }
    } else {
      console.log(`   Keystore not found at ${keystorePath}`);
    }
  } catch (err) {
    console.log(`   Error reading keystore: ${err instanceof Error ? err.message : err}`);
  }
  return null;
}

async function main() {
  let privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    privateKey = tryGetPrivateKeyFromKeystore();
  }
  if (!privateKey) {
    console.error('❌ No private key found!');
    return;
  }

  try {
    const keypair = getKeypairFromPrivateKey(privateKey);
    const address = keypair.toSuiAddress();
    console.log(`\n🔑 Wallet Address: ${address}`);

    const grpcClient = new SuiGrpcClient({
      network: 'testnet',
      baseUrl: RPC_URL,
    }).$extend(
      deepbook({
        address,
      }),
    );

    // Check current balances
    console.log('\n📊 Current Balances:');
    
    const suiBalance = await grpcClient.core.getBalance({
      owner: address,
      coinType: testnetCoins.SUI.type,
    });
    const suiAmount = Number(suiBalance.balance?.balance || suiBalance.balance?.coinBalance || '0') / 1e9;
    console.log(`   SUI:    ${suiAmount.toFixed(4)} SUI`);

    const deepBalance = await grpcClient.core.getBalance({
      owner: address,
      coinType: testnetCoins.DEEP.type,
    });
    const deepAmount = Number(deepBalance.balance?.balance || deepBalance.balance?.coinBalance || '0') / 1e6;
    console.log(`   DEEP:   ${deepAmount.toFixed(4)} DEEP`);

    const dbUsdcBalance = await grpcClient.core.getBalance({
      owner: address,
      coinType: testnetCoins.DBUSDC.type,
    });
    const dbUsdcAmount = Number(dbUsdcBalance.balance?.balance || dbUsdcBalance.balance?.coinBalance || '0') / 1e6;
    console.log(`   DBUSDC: ${dbUsdcAmount.toFixed(4)} DBUSDC`);

    // Step 1: Swap SUI for DEEP (DEEP_SUI pool usually has more liquidity)
    console.log('\n🔄 Step 1: Swapping 2 SUI for DEEP...');
    console.log(`   Pool: DEEP_SUI (${testnetPools.DEEP_SUI.address})`);

    const tx1 = new Transaction();
    
    // For DEEP_SUI pool: DEEP is base, SUI is quote
    // To buy DEEP with SUI = swapExactQuoteForBase
    const [baseCoin1, quoteCoin1, deepCoin1] = grpcClient.deepbook.deepBook.swapExactQuoteForBase({
      poolKey: 'DEEP_SUI',
      amount: 2, // 2 SUI
      deepAmount: 0,
      minOut: 0,
    })(tx1);

    tx1.transferObjects([baseCoin1, quoteCoin1, deepCoin1], address);

    console.log('   Executing...');
    const result1 = await grpcClient.core.signAndExecuteTransaction({
      transaction: tx1,
      signer: keypair,
      include: { effects: true, events: true },
    });

    if (result1.$kind === 'Transaction') {
      console.log(`   ✅ Success! TX: ${result1.Transaction.digest}`);
    } else {
      console.log('   ❌ Failed:', result1);
      return;
    }

    // Wait for indexing
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check DEEP balance
    const newDeepBalance = await grpcClient.core.getBalance({
      owner: address,
      coinType: testnetCoins.DEEP.type,
    });
    const newDeepAmount = Number(newDeepBalance.balance?.balance || newDeepBalance.balance?.coinBalance || '0') / 1e6;
    console.log(`   New DEEP balance: ${newDeepAmount.toFixed(4)} DEEP`);

    if (newDeepAmount < 1) {
      console.log('\n⚠️  Not enough DEEP received. The DEEP_SUI pool might have low liquidity.');
      console.log('   Try asking in Sui Discord for testnet DBUSDC tokens.');
      return;
    }

    // Step 2: Swap DEEP for DBUSDC
    console.log('\n🔄 Step 2: Swapping DEEP for DBUSDC...');
    console.log(`   Pool: DEEP_DBUSDC (${testnetPools.DEEP_DBUSDC.address})`);

    const tx2 = new Transaction();
    
    // For DEEP_DBUSDC pool: DEEP is base, DBUSDC is quote
    // To sell DEEP for DBUSDC = swapExactBaseForQuote
    const deepToSwap = Math.floor(newDeepAmount * 0.9); // Use 90% of DEEP
    const [baseCoin2, quoteCoin2, deepCoin2] = grpcClient.deepbook.deepBook.swapExactBaseForQuote({
      poolKey: 'DEEP_DBUSDC',
      amount: deepToSwap,
      deepAmount: 0,
      minOut: 0,
    })(tx2);

    tx2.transferObjects([baseCoin2, quoteCoin2, deepCoin2], address);

    console.log(`   Swapping ${deepToSwap} DEEP...`);
    const result2 = await grpcClient.core.signAndExecuteTransaction({
      transaction: tx2,
      signer: keypair,
      include: { effects: true, events: true },
    });

    if (result2.$kind === 'Transaction') {
      console.log(`   ✅ Success! TX: ${result2.Transaction.digest}`);
    } else {
      console.log('   ❌ Failed:', result2);
      return;
    }

    // Wait and check final balances
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n📊 Final Balances:');
    
    const finalSui = await grpcClient.core.getBalance({ owner: address, coinType: testnetCoins.SUI.type });
    console.log(`   SUI:    ${(Number(finalSui.balance?.balance || '0') / 1e9).toFixed(4)} SUI`);

    const finalDeep = await grpcClient.core.getBalance({ owner: address, coinType: testnetCoins.DEEP.type });
    console.log(`   DEEP:   ${(Number(finalDeep.balance?.balance || '0') / 1e6).toFixed(4)} DEEP`);

    const finalDbusdc = await grpcClient.core.getBalance({ owner: address, coinType: testnetCoins.DBUSDC.type });
    console.log(`   DBUSDC: ${(Number(finalDbusdc.balance?.balance || '0') / 1e6).toFixed(4)} DBUSDC`);

    console.log('\n🎉 Done! You can now create a vault with DBUSDC.');
    console.log(`\n   DBUSDC Type: ${testnetCoins.DBUSDC.type}`);

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.log('\nFull error:', error);
  }
}

main().catch(console.error);
