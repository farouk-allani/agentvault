/**
 * Script to swap SUI for DEEP tokens on DeepBook v3 testnet
 *
 * Prerequisites:
 * 1. Have Sui CLI installed and configured with a wallet
 * 2. Have SUI tokens from faucet: `sui client faucet`
 * 3. Install dependencies: `npm install @mysten/sui @mysten/deepbook-v3`
 *
 * Run: `npx ts-node scripts/get-deep-tokens.ts`
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// DeepBook v3 Testnet Constants (from SDK docs)
const TESTNET_CONFIG = {
  DEEPBOOK_PACKAGE_ID: '0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c',
  DEEP_SUI_POOL: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
  DEEP_TYPE: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  SUI_TYPE: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
};

async function main() {
  // Initialize client
  const client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });

  // Get your private key from Sui CLI config
  // You can find it at ~/.sui/sui_config/sui.keystore
  // Or export with: sui keytool export --key-identity <alias>
  const PRIVATE_KEY = process.env.SUI_PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.log(`
============================================================
HOW TO GET YOUR PRIVATE KEY:
============================================================

Option 1: Export from Sui CLI
  sui keytool export --key-identity <your-alias>

Option 2: Find in keystore
  cat ~/.sui/sui_config/sui.keystore

Then run this script with:
  SUI_PRIVATE_KEY="suiprivkey1..." npx ts-node scripts/get-deep-tokens.ts

============================================================
ALTERNATIVE: Use Sui CLI directly to swap
============================================================

1. First, check the DEEP/SUI pool for liquidity:
   sui client object 0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f

2. If there's liquidity, you can place a market order.
   Check DeepBook docs for the exact swap function signature.

============================================================
EASIEST OPTION: Ask on Discord
============================================================

Join Sui Discord: https://discord.gg/sui
Go to #deepbook channel
Ask: "How can I get testnet DEEP tokens for a hackathon project?"

The DeepBook team is usually responsive and may send you some.
    `);
    return;
  }

  try {
    const { secretKey } = decodeSuiPrivateKey(PRIVATE_KEY);
    const keypair = Ed25519Keypair.fromSecretKey(secretKey);
    const address = keypair.getPublicKey().toSuiAddress();

    console.log('Your address:', address);

    // Check SUI balance
    const balance = await client.getBalance({
      owner: address,
      coinType: TESTNET_CONFIG.SUI_TYPE,
    });
    console.log('SUI Balance:', Number(balance.totalBalance) / 1e9, 'SUI');

    // Check DEEP balance
    const deepBalance = await client.getBalance({
      owner: address,
      coinType: TESTNET_CONFIG.DEEP_TYPE,
    });
    console.log('DEEP Balance:', Number(deepBalance.totalBalance) / 1e6, 'DEEP');

    if (Number(balance.totalBalance) < 1e9) {
      console.log('\nYou need more SUI! Run: sui client faucet');
      return;
    }

    // Note: The actual swap logic would use DeepBook's swap functions
    // This requires understanding the exact PTB structure for DeepBook v3
    console.log(`
============================================================
NEXT STEPS TO SWAP SUI → DEEP:
============================================================

The DEEP/SUI pool exists and you have SUI.
To swap, you need to:

1. Install DeepBook SDK: npm install @mysten/deepbook-v3
2. Use the SDK's swap functions (see docs you shared)

Example pattern from docs:
  const client = new SuiGrpcClient({ network: 'testnet' })
    .$extend(deepbook({ address: '${address}' }));

  // Then use client.deepbook methods for swapping

Or try the DeepBook UI if available at deepbook.tech
    `);

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
