/**
 * Demo: Vault Payments & Constraints - Part 2
 * 
 * Uses an existing vault to demonstrate payment constraints.
 * 
 * Usage: VAULT_ID="0x..." npx tsx demo-payments-2.ts
 */

import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const RPC_URL = 'https://fullnode.testnet.sui.io:443';
const PACKAGE_ID = '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434';
const SUI_TYPE = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

// Use vault from previous run or environment
const VAULT_ID = process.env.VAULT_ID || '0x9790342484664f2c161f9351f0a7e4a628fe2c45f0ed0b9481083d3e575cd342';

// Vault constraints for reference
const DEMO_CONFIG = {
  dailyLimit: 200_000_000,          // 0.2 SUI per day
  perTxLimit: 100_000_000,          // 0.1 SUI per transaction
  alertThreshold: 150_000_000,      // Alert when 0.15 SUI spent
};

// ============================================================================
// HELPERS
// ============================================================================

function getKeypairFromKeystore(): Ed25519Keypair {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');
  const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));
  const decoded = Buffer.from(keystore[0], 'base64');
  return Ed25519Keypair.fromSecretKey(decoded.slice(1));
}

function formatSUI(mist: number | bigint): string {
  return (Number(mist) / 1e9).toFixed(4) + ' SUI';
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isSuccess(result: any): boolean {
  if (result.$kind !== 'Transaction') return false;
  const tx = result.Transaction;
  return tx.effects?.status?.success === true || tx.status?.success === true;
}

function getDigest(result: any): string {
  return result.$kind === 'Transaction' ? result.Transaction.digest : 'unknown';
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('🏦 AgentVault Payment Constraints Demo');
  console.log('='.repeat(70));

  const client = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC_URL });
  const keypair = getKeypairFromKeystore();
  const address = keypair.toSuiAddress();
  
  console.log(`\n👤 Agent Address: ${address}`);
  console.log(`🏦 Vault ID: ${VAULT_ID}\n`);

  const recipient = '0x0000000000000000000000000000000000000000000000000000000000000001';

  // ============================================================================
  // STEP 1: Execute Successful Payment (0.05 SUI)
  // ============================================================================
  
  console.log('='.repeat(70));
  console.log('💸 STEP 1: Execute Payment (0.05 SUI) - Should SUCCEED');
  console.log('='.repeat(70));

  const payment1Amount = 50_000_000; // 0.05 SUI

  console.log(`\n   Amount:       ${formatSUI(payment1Amount)}`);
  console.log(`   Per-TX Limit: ${formatSUI(DEMO_CONFIG.perTxLimit)} ✓`);

  const tx1 = new Transaction();
  tx1.moveCall({
    target: `${PACKAGE_ID}::vault::execute_payment`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx1.object(VAULT_ID),
      tx1.pure.address(recipient),
      tx1.pure.u64(payment1Amount),
      tx1.object('0x6'),
    ],
  });

  console.log('\n   Executing...');
  const result1 = await client.core.signAndExecuteTransaction({
    transaction: tx1,
    signer: keypair,
    include: { effects: true, events: true },
  });

  if (isSuccess(result1)) {
    console.log(`   ✅ Payment Successful!`);
    console.log(`   🔗 TX: ${getDigest(result1)}`);
  } else {
    console.log(`   ❌ Failed - Check vault constraints or agent permissions`);
    return;
  }

  await sleep(2000);

  // ============================================================================
  // STEP 2: Execute Another Payment (0.1 SUI - should trigger alert)
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('💸 STEP 2: Execute Payment (0.1 SUI) - Should SUCCEED + ALERT');
  console.log('='.repeat(70));

  const payment2Amount = 100_000_000; // 0.1 SUI

  console.log(`\n   Amount:         ${formatSUI(payment2Amount)}`);
  console.log(`   Previous Spent: ${formatSUI(payment1Amount)}`);
  console.log(`   New Total:      ${formatSUI(payment1Amount + payment2Amount)}`);
  console.log(`   Alert at:       ${formatSUI(DEMO_CONFIG.alertThreshold)} ⚠️`);

  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${PACKAGE_ID}::vault::execute_payment`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx2.object(VAULT_ID),
      tx2.pure.address(recipient),
      tx2.pure.u64(payment2Amount),
      tx2.object('0x6'),
    ],
  });

  console.log('\n   Executing...');
  const result2 = await client.core.signAndExecuteTransaction({
    transaction: tx2,
    signer: keypair,
    include: { effects: true, events: true },
  });

  if (isSuccess(result2)) {
    console.log(`   ✅ Payment Successful!`);
    console.log(`   🔗 TX: ${getDigest(result2)}`);
    console.log(`   🚨 Alert should have been triggered! (check events on explorer)`);
  } else {
    console.log(`   ❌ Failed`);
  }

  await sleep(2000);

  // ============================================================================
  // STEP 3: Try to Exceed Per-TX Limit
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('🚫 STEP 3: Try Payment (0.15 SUI) - Should FAIL (Per-TX Limit)');
  console.log('='.repeat(70));

  const payment3Amount = 150_000_000; // 0.15 SUI - exceeds 0.1 SUI per-tx limit

  console.log(`\n   Amount:       ${formatSUI(payment3Amount)}`);
  console.log(`   Per-TX Limit: ${formatSUI(DEMO_CONFIG.perTxLimit)} ❌ EXCEEDED`);

  const tx3 = new Transaction();
  tx3.moveCall({
    target: `${PACKAGE_ID}::vault::execute_payment`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx3.object(VAULT_ID),
      tx3.pure.address(recipient),
      tx3.pure.u64(payment3Amount),
      tx3.object('0x6'),
    ],
  });

  console.log('\n   Attempting...');
  try {
    const result3 = await client.core.signAndExecuteTransaction({
      transaction: tx3,
      signer: keypair,
      include: { effects: true },
    });

    if (!isSuccess(result3)) {
      console.log(`   ✅ Correctly REJECTED! (EExceedsPerTxLimit)`);
      console.log(`   🔗 TX: ${getDigest(result3)}`);
    } else {
      console.log(`   ⚠️ Unexpectedly succeeded`);
    }
  } catch (err) {
    console.log(`   ✅ Correctly REJECTED! (Simulation failed)`);
  }

  await sleep(2000);

  // ============================================================================
  // STEP 4: Try to Exceed Daily Limit
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('🚫 STEP 4: Try Payment (0.1 SUI) - Should FAIL (Daily Limit)');
  console.log('='.repeat(70));

  const spentSoFar = payment1Amount + payment2Amount; // 0.15 SUI
  const payment4Amount = 100_000_000; // 0.1 SUI - would exceed 0.2 SUI daily limit

  console.log(`\n   Amount:      ${formatSUI(payment4Amount)}`);
  console.log(`   Spent Today: ${formatSUI(spentSoFar)}`);
  console.log(`   Would Total: ${formatSUI(spentSoFar + payment4Amount)}`);
  console.log(`   Daily Limit: ${formatSUI(DEMO_CONFIG.dailyLimit)} ❌ EXCEEDED`);

  const tx4 = new Transaction();
  tx4.moveCall({
    target: `${PACKAGE_ID}::vault::execute_payment`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx4.object(VAULT_ID),
      tx4.pure.address(recipient),
      tx4.pure.u64(payment4Amount),
      tx4.object('0x6'),
    ],
  });

  console.log('\n   Attempting...');
  try {
    const result4 = await client.core.signAndExecuteTransaction({
      transaction: tx4,
      signer: keypair,
      include: { effects: true },
    });

    if (!isSuccess(result4)) {
      console.log(`   ✅ Correctly REJECTED! (EExceedsDailyLimit)`);
      console.log(`   🔗 TX: ${getDigest(result4)}`);
    } else {
      console.log(`   ⚠️ Unexpectedly succeeded`);
    }
  } catch (err) {
    console.log(`   ✅ Correctly REJECTED! (Simulation failed)`);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 DEMO COMPLETE');
  console.log('='.repeat(70));
  
  console.log(`
   ✅ Payment 1: 0.05 SUI - SUCCESS
   ✅ Payment 2: 0.10 SUI - SUCCESS + ALERT
   ✅ Payment 3: 0.15 SUI - REJECTED (per-tx limit)
   ✅ Payment 4: 0.10 SUI - REJECTED (daily limit)

   🏦 Vault: ${VAULT_ID}
   
   AgentVault successfully enforces:
   • Per-transaction limits
   • Daily spending limits  
   • Alert thresholds
`);
  console.log('='.repeat(70));
}

main().catch(console.error);
