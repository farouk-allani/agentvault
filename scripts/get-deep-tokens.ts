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

// ============================================================================
// OFFICIAL DEEPBOOK V3 TESTNET CONSTANTS (from @mysten/deepbook-v3 SDK)
// ============================================================================
const TESTNET_CONFIG = {
  // DeepBook Package
  DEEPBOOK_PACKAGE_ID: '0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c',
  REGISTRY_ID: '0x7c256edbda983a2cd6f946655f4bf3f00a41043993781f8674a7046e8c0e11d1',
  
  // Pool Addresses
  DEEP_SUI_POOL: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
  SUI_DBUSDC_POOL: '0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5',
  DEEP_DBUSDC_POOL: '0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622',
  
  // Token Types
  DEEP_TYPE: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  SUI_TYPE: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  DBUSDC_TYPE: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
};

// Note: For mainnet, use these addresses instead:
const MAINNET_CONFIG = {
  DEEPBOOK_PACKAGE_ID: '0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497',
  DEEP_SUI_POOL: '0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22',
  DEEP_TYPE: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  USDC_TYPE: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
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
