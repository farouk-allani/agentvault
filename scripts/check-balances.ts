/**
 * Check SUI and DEEP balances on testnet
 *
 * Usage:
 *   cd scripts
 *   npm install
 *   npx tsx check-balances.ts
 *
 * Or with address argument:
 *   npx tsx check-balances.ts 0xYourAddress
 */

import { SuiGrpcClient } from '@mysten/sui/grpc';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as fs from 'fs';
import * as path from 'path';

// Using gRPC client for Sui SDK v2.x

// Token types on testnet
const TOKENS = {
  SUI: {
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    decimals: 9,
    symbol: 'SUI',
  },
  DEEP: {
    type: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
    decimals: 6,
    symbol: 'DEEP',
  },
  DBUSDC: {
    type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
    decimals: 6,
    symbol: 'DBUSDC',
  },
  DBTC: {
    type: '0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86::dbtc::DBTC',
    decimals: 8,
    symbol: 'DBTC',
  },
};

// Try to get address from Sui keystore
function getAddressFromKeystore(): string | null {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');

  try {
    if (fs.existsSync(keystorePath)) {
      const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));
      if (Array.isArray(keystore) && keystore.length > 0) {
        const { scheme, secretKey } = decodeSuiPrivateKey(keystore[0]);
        if (scheme === 'ED25519') {
          const keypair = Ed25519Keypair.fromSecretKey(secretKey);
          return keypair.toSuiAddress();
        }
      }
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

async function checkBalances(address: string) {
  const client = new SuiGrpcClient({
    network: 'testnet',
    baseUrl: 'https://fullnode.testnet.sui.io:443',
  });

  console.log('='.repeat(60));
  console.log('Sui Testnet Balance Checker');
  console.log('='.repeat(60));
  console.log(`\nAddress: ${address}`);
  console.log(`Explorer: https://suiexplorer.com/address/${address}?network=testnet\n`);

  console.log('Token Balances:');
  console.log('-'.repeat(40));

  for (const [name, token] of Object.entries(TOKENS)) {
    try {
      const result = await client.core.getBalance({
        owner: address,
        coinType: token.type,
      });

      // v2.x API returns nested balance object
      const balanceValue = result.balance?.balance || result.balance?.coinBalance || '0';
      const amount = Number(balanceValue) / Math.pow(10, token.decimals);
      const formatted = amount.toFixed(token.decimals > 6 ? 8 : 4);

      console.log(`${token.symbol.padEnd(8)} ${formatted.padStart(20)}`);
    } catch (e) {
      console.log(`${token.symbol.padEnd(8)} ${'Error'.padStart(20)}`);
    }
  }

  // Note: In SDK v2.x, getCoins is not available on client.core
  // Use getAllCoins from the client if detailed coin objects are needed

  console.log('='.repeat(60));
  console.log('\nTo get SUI: sui client faucet');
  console.log('To swap SUI→DEEP: npm run swap');
}

async function main() {
  // Get address from args, env private key, or keystore
  let address = process.argv[2];

  if (!address && process.env.SUI_PRIVATE_KEY) {
    try {
      const { scheme, secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY);
      if (scheme === 'ED25519') {
        const keypair = Ed25519Keypair.fromSecretKey(secretKey);
        address = keypair.toSuiAddress();
      }
    } catch (e) {
      // Ignore error, try keystore next
    }
  }

  if (!address) {
    address = getAddressFromKeystore();
  }

  if (!address) {
    console.log(`
Usage: npx tsx check-balances.ts [address]

If no address provided, will try to read from ~/.sui/sui_config/sui.keystore

Example:
  npx tsx check-balances.ts 0x1234...
    `);
    process.exit(1);
  }

  await checkBalances(address);
}

main().catch(console.error);
