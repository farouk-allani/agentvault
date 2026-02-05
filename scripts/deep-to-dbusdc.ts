/**
 * Swap existing DEEP for DBUSDC
 */

import { deepbook, testnetPools, testnetCoins } from '@mysten/deepbook-v3';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = 'https://fullnode.testnet.sui.io:443';

function getKeypairFromKeystore(): Ed25519Keypair {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const keystorePath = path.join(homeDir, '.sui', 'sui_config', 'sui.keystore');
  const keystore = JSON.parse(fs.readFileSync(keystorePath, 'utf-8'));
  const decoded = Buffer.from(keystore[0], 'base64');
  return Ed25519Keypair.fromSecretKey(decoded.slice(1));
}

async function main() {
  const keypair = getKeypairFromKeystore();
  const address = keypair.toSuiAddress();
  console.log(`\n🔑 Wallet: ${address}`);

  const grpcClient = new SuiGrpcClient({
    network: 'testnet',
    baseUrl: RPC_URL,
  }).$extend(deepbook({ address }));

  // Check DEEP balance
  const deepBalance = await grpcClient.core.getBalance({
    owner: address,
    coinType: testnetCoins.DEEP.type,
  });
  const deepAmount = Number(deepBalance.balance?.balance || '0') / 1e6;
  console.log(`💰 DEEP balance: ${deepAmount.toFixed(4)} DEEP`);

  if (deepAmount < 0.5) {
    console.log('❌ Not enough DEEP to swap');
    return;
  }

  // Swap all DEEP for DBUSDC
  const deepToSwap = Math.floor(deepAmount * 0.95); // Use 95%
  console.log(`\n🔄 Swapping ${deepToSwap} DEEP for DBUSDC...`);

  const tx = new Transaction();
  const [baseCoin, quoteCoin, deepCoin] = grpcClient.deepbook.deepBook.swapExactBaseForQuote({
    poolKey: 'DEEP_DBUSDC',
    amount: deepToSwap,
    deepAmount: 0,
    minOut: 0,
  })(tx);
  tx.transferObjects([baseCoin, quoteCoin, deepCoin], address);

  const result = await grpcClient.core.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    include: { effects: true },
  });

  if (result.$kind === 'Transaction') {
    console.log(`✅ Success! TX: ${result.Transaction.digest}`);
  }

  await new Promise(r => setTimeout(r, 2000));

  // Check new DBUSDC balance
  const dbUsdcBalance = await grpcClient.core.getBalance({
    owner: address,
    coinType: testnetCoins.DBUSDC.type,
  });
  console.log(`\n💵 DBUSDC balance: ${(Number(dbUsdcBalance.balance?.balance || '0') / 1e6).toFixed(4)} DBUSDC`);
}

main().catch(console.error);
