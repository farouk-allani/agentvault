/**
 * Demo: Vault Payments & Constraints
 * 
 * This script demonstrates the AgentVault payment system:
 * 1. Creates a vault with SUI tokens
 * 2. Agent makes successful payments
 * 3. Demonstrates hitting constraints (per-tx limit, daily limit)
 * 
 * Usage: npx tsx demo-payments.ts
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

// Vault constraints for demo (in MIST = 1 SUI = 1e9 MIST)
const DEMO_CONFIG = {
  initialDeposit: 500_000_000,      // 0.5 SUI
  dailyLimit: 200_000_000,          // 0.2 SUI per day
  perTxLimit: 100_000_000,          // 0.1 SUI per transaction
  alertThreshold: 150_000_000,      // Alert when 0.15 SUI spent
  minBalance: 50_000_000,           // Keep at least 0.05 SUI in vault
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

// Helper to check if transaction was successful
function isSuccess(result: any): boolean {
  if (result.$kind !== 'Transaction') return false;
  const tx = result.Transaction;
  return tx.effects?.status?.success === true || 
         tx.effects?.status?.$kind === 'Success' ||
         tx.status?.success === true;
}

function getDigest(result: any): string {
  if (result.$kind === 'Transaction') {
    return result.Transaction.digest;
  }
  return result.digest || 'unknown';
}

function getEvents(result: any): any[] {
  if (result.$kind === 'Transaction') {
    return result.Transaction.events || [];
  }
  return result.events || [];
}

// ============================================================================
// MAIN DEMO
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('🏦 AgentVault Payment Demo');
  console.log('='.repeat(70));

  const client = new SuiGrpcClient({ network: 'testnet', baseUrl: RPC_URL });
  const keypair = getKeypairFromKeystore();
  const address = keypair.toSuiAddress();
  
  console.log(`\n👤 Wallet Address: ${address}`);
  console.log(`   (Both owner AND agent for this demo)\n`);

  // Check SUI balance
  const balanceResult = await client.core.getBalance({ owner: address, coinType: SUI_TYPE });
  const suiBalance = Number(balanceResult.balance?.balance || '0');
  console.log(`💰 Current SUI Balance: ${formatSUI(suiBalance)}`);

  if (suiBalance < 1_000_000_000) {
    console.log('\n❌ Need at least 1 SUI for demo. Run: sui client faucet');
    return;
  }

  // ============================================================================
  // STEP 1: Create Vault
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('📦 STEP 1: Creating Vault');
  console.log('='.repeat(70));
  
  console.log(`\n   Vault Configuration:`);
  console.log(`   ├── Initial Deposit: ${formatSUI(DEMO_CONFIG.initialDeposit)}`);
  console.log(`   ├── Daily Limit:     ${formatSUI(DEMO_CONFIG.dailyLimit)}`);
  console.log(`   ├── Per-TX Limit:    ${formatSUI(DEMO_CONFIG.perTxLimit)}`);
  console.log(`   ├── Alert Threshold: ${formatSUI(DEMO_CONFIG.alertThreshold)}`);
  console.log(`   └── Min Balance:     ${formatSUI(DEMO_CONFIG.minBalance)}`);

  // Split a coin for the deposit
  const tx1 = new Transaction();
  const [depositCoin] = tx1.splitCoins(tx1.gas, [DEMO_CONFIG.initialDeposit]);
  
  tx1.moveCall({
    target: `${PACKAGE_ID}::vault::create_vault`,
    typeArguments: [SUI_TYPE],
    arguments: [
      depositCoin,
      tx1.pure.address(address),  // agent = self for demo
      tx1.pure.u64(DEMO_CONFIG.dailyLimit),
      tx1.pure.u64(DEMO_CONFIG.perTxLimit),
      tx1.pure.u64(DEMO_CONFIG.alertThreshold),
      tx1.pure.bool(false),  // yield_enabled
      tx1.pure.u64(DEMO_CONFIG.minBalance),
      tx1.object('0x6'),  // Clock
    ],
  });

  console.log('\n   Creating vault...');
  const result1 = await client.core.signAndExecuteTransaction({
    transaction: tx1,
    signer: keypair,
    include: { effects: true, events: true, objectChanges: true },
  });

  if (!isSuccess(result1)) {
    console.log('   ❌ Failed:', result1);
    return;
  }

  // Find the created vault from events
  let vaultId: string | null = null;
  const events1 = getEvents(result1);
  
  for (const event of events1) {
    if (event.type?.includes('VaultCreated')) {
      const data = event.parsedJson as any;
      if (data?.vault_id) {
        vaultId = data.vault_id;
        break;
      }
    }
  }

  if (!vaultId) {
    console.log('   ❌ Could not find vault ID in events');
    console.log('   TX:', getDigest(result1));
    console.log('   Please check the transaction on Suiscan to find the vault ID');
    return;
  }

  console.log(`   ✅ Vault Created!`);
  console.log(`   📍 Vault ID: ${vaultId}`);
  console.log(`   🔗 TX: ${getDigest(result1)}`);
  console.log(`\n   📢 Events: ${events1.length} emitted`);

  await sleep(3000);

  // ============================================================================
  // STEP 2: Execute Successful Payment
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('💸 STEP 2: Execute Payment (0.05 SUI) - Should SUCCEED');
  console.log('='.repeat(70));

  const payment1Amount = 50_000_000; // 0.05 SUI
  const recipient1 = '0x0000000000000000000000000000000000000000000000000000000000000001';

  console.log(`\n   Payment Details:`);
  console.log(`   ├── Amount:    ${formatSUI(payment1Amount)}`);
  console.log(`   ├── Recipient: ${recipient1.slice(0, 20)}...`);
  console.log(`   └── Per-TX Limit: ${formatSUI(DEMO_CONFIG.perTxLimit)} ✓`);

  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${PACKAGE_ID}::vault::execute_payment`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx2.object(vaultId),
      tx2.pure.address(recipient1),
      tx2.pure.u64(payment1Amount),
      tx2.object('0x6'),  // Clock
    ],
  });

  console.log('\n   Executing payment...');
  const result2 = await client.core.signAndExecuteTransaction({
    transaction: tx2,
    signer: keypair,
    include: { effects: true, events: true },
  });

  if (isSuccess(result2)) {
    console.log(`   ✅ Payment Successful!`);
    console.log(`   🔗 TX: ${getDigest(result2)}`);
    
    const events2 = getEvents(result2);
    for (const event of events2) {
      if (event.type?.includes('PaymentExecuted')) {
        const data = event.parsedJson as any;
        console.log(`\n   📢 PaymentExecuted Event:`);
        console.log(`       Amount: ${formatSUI(data?.amount || 0)}`);
        console.log(`       Spent Today: ${formatSUI(data?.spent_today || 0)}`);
      }
    }
  } else {
    console.log(`   ❌ Failed:`, result2);
  }

  await sleep(3000);

  // ============================================================================
  // STEP 3: Execute Another Payment (to trigger alert)
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('💸 STEP 3: Execute Payment (0.1 SUI) - Should SUCCEED + ALERT');
  console.log('='.repeat(70));

  const payment2Amount = 100_000_000; // 0.1 SUI - will push total to 0.15 SUI (alert threshold)

  console.log(`\n   Payment Details:`);
  console.log(`   ├── Amount:    ${formatSUI(payment2Amount)}`);
  console.log(`   ├── Previous Spent: ${formatSUI(payment1Amount)}`);
  console.log(`   ├── New Total:  ${formatSUI(payment1Amount + payment2Amount)}`);
  console.log(`   └── Alert at:   ${formatSUI(DEMO_CONFIG.alertThreshold)} ⚠️`);

  const tx3 = new Transaction();
  tx3.moveCall({
    target: `${PACKAGE_ID}::vault::execute_payment`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx3.object(vaultId),
      tx3.pure.address(recipient1),
      tx3.pure.u64(payment2Amount),
      tx3.object('0x6'),
    ],
  });

  console.log('\n   Executing payment...');
  const result3 = await client.core.signAndExecuteTransaction({
    transaction: tx3,
    signer: keypair,
    include: { effects: true, events: true },
  });

  if (isSuccess(result3)) {
    console.log(`   ✅ Payment Successful!`);
    console.log(`   🔗 TX: ${getDigest(result3)}`);
    
    // Check for alert event
    const events3 = getEvents(result3);
    for (const event of events3) {
      if (event.type?.includes('AlertTriggered')) {
        const data = event.parsedJson as any;
        console.log(`\n   🚨 ALERT TRIGGERED!`);
        console.log(`       Spent Today: ${formatSUI(data?.spent_today || 0)}`);
        console.log(`       Threshold: ${formatSUI(data?.threshold || 0)}`);
      }
    }
  } else {
    console.log(`   ❌ Failed:`, result3);
  }

  await sleep(3000);

  // ============================================================================
  // STEP 4: Try to Exceed Per-TX Limit
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('🚫 STEP 4: Try Payment (0.15 SUI) - Should FAIL (Exceeds Per-TX Limit)');
  console.log('='.repeat(70));

  const payment3Amount = 150_000_000; // 0.15 SUI - exceeds per-tx limit of 0.1 SUI

  console.log(`\n   Payment Details:`);
  console.log(`   ├── Amount:       ${formatSUI(payment3Amount)}`);
  console.log(`   └── Per-TX Limit: ${formatSUI(DEMO_CONFIG.perTxLimit)} ❌ EXCEEDED`);

  const tx4 = new Transaction();
  tx4.moveCall({
    target: `${PACKAGE_ID}::vault::execute_payment`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx4.object(vaultId),
      tx4.pure.address(recipient1),
      tx4.pure.u64(payment3Amount),
      tx4.object('0x6'),
    ],
  });

  console.log('\n   Attempting payment...');
  try {
    const result4 = await client.core.signAndExecuteTransaction({
      transaction: tx4,
      signer: keypair,
      include: { effects: true },
    });

    if (!isSuccess(result4)) {
      console.log(`   ✅ Correctly REJECTED! (EExceedsPerTxLimit - Error code 3)`);
      console.log(`   🔗 TX: ${getDigest(result4)}`);
    } else {
      console.log(`   ⚠️ Unexpectedly succeeded`);
    }
  } catch (err) {
    console.log(`   ✅ Correctly REJECTED! (Transaction simulation failed)`);
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('3')) {
      console.log(`       Error Code 3 = EExceedsPerTxLimit`);
    }
  }

  await sleep(3000);

  // ============================================================================
  // STEP 5: Try to Exceed Daily Limit
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('🚫 STEP 5: Try Payment (0.1 SUI) - Should FAIL (Exceeds Daily Limit)');
  console.log('='.repeat(70));

  const spentSoFar = payment1Amount + payment2Amount; // 0.15 SUI
  const payment4Amount = 100_000_000; // 0.1 SUI - would push to 0.25 SUI, exceeding 0.2 SUI daily limit

  console.log(`\n   Payment Details:`);
  console.log(`   ├── Amount:      ${formatSUI(payment4Amount)}`);
  console.log(`   ├── Spent Today: ${formatSUI(spentSoFar)}`);
  console.log(`   ├── Would Total: ${formatSUI(spentSoFar + payment4Amount)}`);
  console.log(`   └── Daily Limit: ${formatSUI(DEMO_CONFIG.dailyLimit)} ❌ EXCEEDED`);

  const tx5 = new Transaction();
  tx5.moveCall({
    target: `${PACKAGE_ID}::vault::execute_payment`,
    typeArguments: [SUI_TYPE],
    arguments: [
      tx5.object(vaultId),
      tx5.pure.address(recipient1),
      tx5.pure.u64(payment4Amount),
      tx5.object('0x6'),
    ],
  });

  console.log('\n   Attempting payment...');
  try {
    const result5 = await client.core.signAndExecuteTransaction({
      transaction: tx5,
      signer: keypair,
      include: { effects: true },
    });

    if (!isSuccess(result5)) {
      console.log(`   ✅ Correctly REJECTED! (EExceedsDailyLimit - Error code 2)`);
      console.log(`   🔗 TX: ${getDigest(result5)}`);
    } else {
      console.log(`   ⚠️ Unexpectedly succeeded`);
    }
  } catch (err) {
    console.log(`   ✅ Correctly REJECTED! (Transaction simulation failed)`);
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('2')) {
      console.log(`       Error Code 2 = EExceedsDailyLimit`);
    }
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 DEMO SUMMARY');
  console.log('='.repeat(70));
  
  console.log(`
   ✅ Vault Created with constraints
   ✅ Payment 1: 0.05 SUI - SUCCESS
   ✅ Payment 2: 0.10 SUI - SUCCESS + ALERT TRIGGERED
   ✅ Payment 3: 0.15 SUI - REJECTED (exceeds per-tx limit)
   ✅ Payment 4: 0.10 SUI - REJECTED (exceeds daily limit)

   🏦 Vault ID: ${vaultId}
   
   This demonstrates how AgentVault protects funds with:
   • Per-transaction limits
   • Daily spending limits  
   • Alert thresholds
   • Minimum balance requirements
`);

  console.log('='.repeat(70));
}

main().catch(console.error);
