/**
 * Swap SUI for DBUSDC on DeepBook v3 Testnet
 * 
 * This script swaps SUI for DBUSDC so you can create vaults with DBUSDC.
 * 
 * Usage:
 *   SUI_PRIVATE_KEY="suiprivkey1..." npx tsx get-dbusdc.ts
 */

import { deepbook, testnetPools, testnetCoins } from '@mysten/deepbook-v3';
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
console.log('DeepBook v3 - Swap SUI for DBUSDC (Testnet)');
console.log('='.repeat(70));

console.log('\n📊 Pool Info:');
console.log(`   SUI_DBUSDC Pool: ${testnetPools.SUI_DBUSDC.address}`);
console.log(`   Base: ${testnetPools.SUI_DBUSDC.baseCoin} (SUI)`);
console.log(`   Quote: ${testnetPools.SUI_DBUSDC.quoteCoin} (DBUSDC)`);

console.log('\n🪙 Token Types:');
console.log(`   SUI: ${testnetCoins.SUI.type}`);
console.log(`   DBUSDC: ${testnetCoins.DBUSDC.type}`);

// Helper to get keypair from private key
function getKeypairFromPrivateKey(privateKey: string): Ed25519Keypair {
  const { scheme, secretKey } = decodeSuiPrivateKey(privateKey);
  if (scheme !== 'ED25519') {
    throw new Error(`Unsupported key scheme: ${scheme}`);
  }
  return Ed25519Keypair.fromSecretKey(secretKey);
}

// Try to get private key from Sui keystore
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

async function main() {
  // Get private key
  let privateKey = process.env.SUI_PRIVATE_KEY;
  
  if (!privateKey) {
    privateKey = tryGetPrivateKeyFromKeystore();
  }
  
  if (!privateKey) {
    console.error('\n❌ No private key found!');
    console.log('\nProvide your private key:');
    console.log('   SUI_PRIVATE_KEY="suiprivkey1..." npx tsx get-dbusdc.ts');
    return;
  }

  try {
    const keypair = getKeypairFromPrivateKey(privateKey);
    const address = keypair.toSuiAddress();
    console.log(`\n🔑 Wallet Address: ${address}`);

    // Create clients
    const grpcClient = new SuiGrpcClient({
      network: 'testnet',
      baseUrl: RPC_URL,
    }).$extend(
      deepbook({
        address,
      }),
    );

    // Check balances before
    console.log('\n📊 Current Balances:');
    
    const suiBalance = await grpcClient.core.getBalance({
      owner: address,
      coinType: testnetCoins.SUI.type,
    });
    const suiAmount = Number(suiBalance.balance?.balance || suiBalance.balance?.coinBalance || '0') / 1e9;
    console.log(`   SUI:    ${suiAmount.toFixed(4)} SUI`);

    const dbUsdcBalance = await grpcClient.core.getBalance({
      owner: address,
      coinType: testnetCoins.DBUSDC.type,
    });
    const dbUsdcAmount = Number(dbUsdcBalance.balance?.balance || dbUsdcBalance.balance?.coinBalance || '0') / 1e6;
    console.log(`   DBUSDC: ${dbUsdcAmount.toFixed(4)} DBUSDC`);

    // Check if user has enough SUI
    if (suiAmount < 0.5) {
      console.log('\n⚠️  Low SUI balance! Get more from faucet:');
      console.log('   sui client faucet');
      return;
    }

    // Amount to swap (in SUI)
    const swapAmountSui = 1.0; // Swap 1 SUI for DBUSDC
    console.log(`\n🔄 Swapping ${swapAmountSui} SUI for DBUSDC...`);

    // Build swap transaction
    // For SUI_DBUSDC pool: SUI is base, DBUSDC is quote
    // To get DBUSDC (quote) we sell SUI (base) = swapExactBaseForQuote
    const tx = new Transaction();

    const [baseCoin, quoteCoin, deepCoin] = grpcClient.deepbook.deepBook.swapExactBaseForQuote({
      poolKey: 'SUI_DBUSDC',
      amount: swapAmountSui, // Amount of SUI to swap
      deepAmount: 0, // Will use input tokens for fees
      minOut: 0, // Accept any output (for demo - in production use proper slippage)
    })(tx);

    // Transfer resulting coins back to the user
    tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);

    console.log('📤 Executing swap transaction...');

    const result = await grpcClient.core.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      include: { effects: true, events: true },
    });

    if (result.$kind === 'Transaction') {
      console.log('\n✅ Swap successful!');
      console.log(`   Transaction: ${result.Transaction.digest}`);
      console.log(`   Explorer: https://suiscan.xyz/testnet/tx/${result.Transaction.digest}`);

      // Wait a moment for the transaction to be indexed
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check new balances
      console.log('\n📊 New Balances:');
      
      const newSuiBalance = await grpcClient.core.getBalance({
        owner: address,
        coinType: testnetCoins.SUI.type,
      });
      console.log(`   SUI:    ${(Number(newSuiBalance.balance?.balance || newSuiBalance.balance?.coinBalance || '0') / 1e9).toFixed(4)} SUI`);

      const newDbUsdcBalance = await grpcClient.core.getBalance({
        owner: address,
        coinType: testnetCoins.DBUSDC.type,
      });
      console.log(`   DBUSDC: ${(Number(newDbUsdcBalance.balance?.balance || newDbUsdcBalance.balance?.coinBalance || '0') / 1e6).toFixed(4)} DBUSDC`);

      console.log('\n🎉 You now have DBUSDC! You can create a vault with it.');
      console.log(`\n   DBUSDC Type for vault creation:`);
      console.log(`   ${testnetCoins.DBUSDC.type}`);
    } else {
      console.log('\n❌ Swap failed!');
      console.log(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    
    if (error instanceof Error) {
      if (error.message.includes('InsufficientCoinBalance')) {
        console.log('\n💡 You need more SUI. Get some from the faucet:');
        console.log('   sui client faucet');
      }
      if (error.message.includes('pool') || error.message.includes('Pool')) {
        console.log('\n💡 Pool error. The pool might not have enough liquidity.');
      }
      // Print full error for debugging
      console.log('\nFull error:', error);
    }
  }
}

main().catch(console.error);
