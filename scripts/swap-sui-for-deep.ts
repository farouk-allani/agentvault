/**
 * Swap SUI for DEEP tokens using DeepBook v3 SDK
 *
 * Prerequisites:
 * 1. Get SUI from faucet: `sui client faucet`
 * 2. Install deps: `npm install @mysten/deepbook-v3 @mysten/sui dotenv`
 *
 * Usage:
 *   npx ts-node scripts/swap-sui-for-deep.ts
 */

import { deepbook, testnetPools, mainnetPools, type DeepBookClient } from '@mysten/deepbook-v3';
import type { ClientWithExtensions } from '@mysten/sui/client';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config();

// ============================================================================
// OFFICIAL DEEPBOOK V3 ADDRESSES (from @mysten/deepbook-v3 SDK)
// ============================================================================
const NETWORK = (process.env.SUI_NETWORK as 'testnet' | 'mainnet') || 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';

// Use the correct addresses from the SDK
const DEEP_TYPE = IS_MAINNET 
  ? '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP'
  : '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP';

const SUI_TYPE = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

// Pool addresses from SDK
const POOLS = IS_MAINNET ? mainnetPools : testnetPools;

console.log(`\n🌐 Network: ${NETWORK.toUpperCase()}`);
console.log(`📊 DEEP_SUI Pool: ${POOLS.DEEP_SUI.address}`);

class DeepBookSwapper {
  client: ClientWithExtensions<{ deepbook: DeepBookClient }>;
  keypair: Ed25519Keypair;
  network: 'testnet' | 'mainnet';

  constructor(privateKey: string) {
    this.network = NETWORK;
    this.keypair = this.getSignerFromPK(privateKey);
    this.client = new SuiGrpcClient({
      network: this.network,
      baseUrl: IS_MAINNET 
        ? 'https://fullnode.mainnet.sui.io:443'
        : 'https://fullnode.testnet.sui.io:443',
    }).$extend(
      deepbook({
        address: this.getActiveAddress(),
      }),
    );
  }

  getSignerFromPK(privateKey: string): Ed25519Keypair {
    const { scheme, secretKey } = decodeSuiPrivateKey(privateKey);
    if (scheme === 'ED25519') return Ed25519Keypair.fromSecretKey(secretKey);
    throw new Error(`Unsupported scheme: ${scheme}`);
  }

  getActiveAddress(): string {
    return this.keypair.toSuiAddress();
  }

  async getBalances() {
    const address = this.getActiveAddress();

    // Get SUI balance (v2.x API returns nested balance)
    const suiResult = await this.client.core.getBalance({
      owner: address,
      coinType: SUI_TYPE,
    });
    const suiBalance = suiResult.balance?.balance || suiResult.balance?.coinBalance || '0';

    // Get DEEP balance
    const deepResult = await this.client.core.getBalance({
      owner: address,
      coinType: DEEP_TYPE,
    });
    const deepBalance = deepResult.balance?.balance || deepResult.balance?.coinBalance || '0';

    return {
      sui: Number(suiBalance) / 1e9,
      deep: Number(deepBalance) / 1e6,
    };
  }

  async swapSuiForDeep(suiAmount: number) {
    const tx = new Transaction();

    console.log(`\nSwapping ${suiAmount} SUI for DEEP...`);
    console.log(`Pool: DEEP_SUI`);

    // Use DeepBook SDK's swap function
    // For DEEP_SUI pool: DEEP is base, SUI is quote
    // To buy DEEP with SUI, we swap exact quote (SUI) for base (DEEP)
    // SDK expects decimal amounts, not raw units (it multiplies by scalar internally)
    const [baseCoin, quoteCoin, deepCoin] = this.client.deepbook.deepBook.swapExactQuoteForBase({
      poolKey: 'DEEP_SUI',
      amount: suiAmount, // 0.5 = 0.5 SUI
      deepAmount: 0, // No DEEP fee coins (will be created from swap output)
      minOut: 0, // Accept any amount (market order)
    })(tx);

    // Transfer all output coins to the sender
    const address = this.getActiveAddress();
    tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);

    try {
      const result = await this.client.core.signAndExecuteTransaction({
        transaction: tx,
        signer: this.keypair,
        include: { effects: true, events: true },
      });

      if (result.$kind === 'FailedTransaction') {
        throw new Error(`Transaction failed: ${JSON.stringify(result)}`);
      }

      console.log('\n✅ Swap successful!');
      console.log(`Transaction digest: ${result.Transaction?.digest}`);

      return result;
    } catch (error) {
      console.error('\n❌ Swap failed:', error);
      throw error;
    }
  }
}

// Try to read private key from Sui keystore
function getPrivateKeyFromKeystore(): string | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');

  try {
    if (fs.existsSync(keystorePath)) {
      const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));
      if (Array.isArray(keystore) && keystore.length > 0) {
        return keystore[0]; // Return first key
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

async function main() {
  console.log('='.repeat(60));
  console.log('DeepBook v3 - Swap SUI for DEEP (Testnet)');
  console.log('='.repeat(60));

  // Get private key
  let privateKey = process.env.SUI_PRIVATE_KEY;

  if (!privateKey) {
    privateKey = getPrivateKeyFromKeystore();
  }

  if (!privateKey) {
    console.log(`
❌ No private key found!

Please provide your Sui private key in one of these ways:

1. Set environment variable:
   export SUI_PRIVATE_KEY="suiprivkey1..."

2. Or the script will try to read from:
   ~/.sui/sui_config/sui.keystore

To export your key from Sui CLI:
   sui keytool export --key-identity <your-alias>
    `);
    process.exit(1);
  }

  try {
    const swapper = new DeepBookSwapper(privateKey);
    const address = swapper.getActiveAddress();

    console.log(`\nWallet Address: ${address}`);

    // Check balances
    console.log('\nChecking balances...');
    const balances = await swapper.getBalances();
    console.log(`SUI Balance: ${balances.sui.toFixed(4)} SUI`);
    console.log(`DEEP Balance: ${balances.deep.toFixed(4)} DEEP`);

    if (balances.sui < 1) {
      console.log('\n⚠️  You need more SUI! Run: sui client faucet');
      process.exit(1);
    }

    // Swap 0.5 SUI for DEEP (adjust as needed)
    const swapAmount = 0.5;
    console.log(`\nAttempting to swap ${swapAmount} SUI for DEEP...`);

    await swapper.swapSuiForDeep(swapAmount);

    // Check new balances
    console.log('\nNew balances:');
    const newBalances = await swapper.getBalances();
    console.log(`SUI Balance: ${newBalances.sui.toFixed(4)} SUI`);
    console.log(`DEEP Balance: ${newBalances.deep.toFixed(4)} DEEP`);

    console.log('\n✅ Done! You now have DEEP tokens for DeepBook v3 swaps.');

  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  }
}

main();
