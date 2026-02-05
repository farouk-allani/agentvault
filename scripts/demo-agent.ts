/**
 * AgentVault Demo Agent
 *
 * This script demonstrates an autonomous agent that:
 * 1. Loads a vault and checks its constraints
 * 2. Validates if a swap is within limits
 * 3. Builds and executes a swap transaction
 * 4. Shows the constraint enforcement in action
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=... VAULT_ID=... npm run agent-demo
 */

import { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// OFFICIAL DEEPBOOK V3 ADDRESSES (from @mysten/deepbook-v3 SDK)
// ============================================================================
const NETWORK = process.env.SUI_NETWORK || 'testnet';
const IS_MAINNET = NETWORK === 'mainnet';

// Testnet tokens
const TESTNET = {
  DEEP: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  SUI: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  DBUSDC: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
  DEEP_SUI_POOL: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
  SUI_DBUSDC_POOL: '0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5',
  DEEP_DBUSDC_POOL: '0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622',
};

// Mainnet tokens
const MAINNET = {
  DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  SUI: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  DEEP_SUI_POOL: '0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22',
  SUI_USDC_POOL: '0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407',
  DEEP_USDC_POOL: '0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce',
};

const TOKENS = IS_MAINNET ? MAINNET : TESTNET;

// Configuration
const CONFIG = {
  RPC_URL: process.env.SUI_RPC_URL || (IS_MAINNET 
    ? 'https://fullnode.mainnet.sui.io:443' 
    : 'https://fullnode.testnet.sui.io:443'),
  PACKAGE_ID: process.env.PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434',
  VAULT_ID: process.env.VAULT_ID || '',
  AGENT_PRIVATE_KEY: process.env.AGENT_PRIVATE_KEY || '',
  // DeepBook v3 pool (DEEP/SUI) - using correct testnet/mainnet address
  POOL_ID: process.env.POOL_ID || TOKENS.DEEP_SUI_POOL,
  DEEP_COIN_ID: process.env.DEEP_COIN_ID || '',
};

// Asset types
const ASSET_TYPES = {
  SUI: TOKENS.SUI,
  DEEP: TOKENS.DEEP,
};

interface VaultConstraints {
  daily_limit: string;
  per_tx_limit: string;
  alert_threshold: string;
  yield_enabled: boolean;
  min_balance: string;
  paused: boolean;
}

interface VaultData {
  owner: string;
  agent: string;
  balance: string;
  constraints: VaultConstraints;
  spent_today: string;
  last_reset_timestamp: string;
  total_spent: string;
  tx_count: string;
}

class AgentVaultDemo {
  private client: SuiClient;
  private keypair: Ed25519Keypair | null = null;

  constructor() {
    this.client = new SuiClient({ url: CONFIG.RPC_URL });
  }

  /**
   * Initialize the agent with a keypair
   */
  initialize(): boolean {
    if (!CONFIG.AGENT_PRIVATE_KEY) {
      console.log('\n[!] No AGENT_PRIVATE_KEY provided.');
      console.log('    Generate one with: sui client new-address ed25519');
      console.log('    Then export: sui keytool export --key-identity <address>');
      return false;
    }

    try {
      // Support both raw hex and base64 encoded keys
      let secretKey: Uint8Array;
      if (CONFIG.AGENT_PRIVATE_KEY.startsWith('suiprivkey')) {
        // Bech32 encoded key
        const decoded = fromBase64(CONFIG.AGENT_PRIVATE_KEY.slice(11)); // Remove 'suiprivkey1' prefix
        secretKey = decoded;
      } else if (CONFIG.AGENT_PRIVATE_KEY.length === 64) {
        // Hex encoded
        secretKey = Uint8Array.from(Buffer.from(CONFIG.AGENT_PRIVATE_KEY, 'hex'));
      } else {
        // Assume base64
        secretKey = fromBase64(CONFIG.AGENT_PRIVATE_KEY);
      }

      this.keypair = Ed25519Keypair.fromSecretKey(secretKey);
      console.log(`[+] Agent initialized: ${this.keypair.getPublicKey().toSuiAddress()}`);
      return true;
    } catch (error) {
      console.error('[!] Failed to initialize keypair:', error);
      return false;
    }
  }

  /**
   * Fetch and parse vault data from chain
   */
  async getVault(vaultId: string): Promise<VaultData | null> {
    try {
      const response: SuiObjectResponse = await this.client.getObject({
        id: vaultId,
        options: { showContent: true, showType: true },
      });

      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        console.error('[!] Vault not found or invalid');
        return null;
      }

      const fields = response.data.content.fields as Record<string, unknown>;
      const constraints = (fields.constraints as { fields: VaultConstraints }).fields;

      return {
        owner: fields.owner as string,
        agent: fields.agent as string,
        balance: this.extractBalance(fields.balance),
        constraints,
        spent_today: fields.spent_today as string,
        last_reset_timestamp: fields.last_reset_timestamp as string,
        total_spent: fields.total_spent as string,
        tx_count: fields.tx_count as string,
      };
    } catch (error) {
      console.error('[!] Error fetching vault:', error);
      return null;
    }
  }

  private extractBalance(balanceField: unknown): string {
    if (balanceField && typeof balanceField === 'object') {
      const record = balanceField as Record<string, unknown>;
      if (record.value) return record.value as string;
    }
    return balanceField as string || '0';
  }

  /**
   * Format amount from base units to human readable
   */
  formatAmount(raw: string | number, decimals = 9): string {
    const num = typeof raw === 'string' ? parseInt(raw, 10) : raw;
    return (num / Math.pow(10, decimals)).toFixed(4);
  }

  /**
   * Display vault status
   */
  displayVaultStatus(vault: VaultData): void {
    console.log('\n' + '='.repeat(60));
    console.log('                    VAULT STATUS');
    console.log('='.repeat(60));
    console.log(`  Owner:          ${vault.owner.slice(0, 20)}...`);
    console.log(`  Agent:          ${vault.agent.slice(0, 20)}...`);
    console.log(`  Balance:        ${this.formatAmount(vault.balance)} SUI`);
    console.log(`  Spent Today:    ${this.formatAmount(vault.spent_today)} SUI`);
    console.log(`  Total Spent:    ${this.formatAmount(vault.total_spent)} SUI`);
    console.log(`  TX Count:       ${vault.tx_count}`);
    console.log('');
    console.log('  CONSTRAINTS:');
    console.log(`  Daily Limit:    ${this.formatAmount(vault.constraints.daily_limit)} SUI`);
    console.log(`  Per-TX Limit:   ${this.formatAmount(vault.constraints.per_tx_limit)} SUI`);
    console.log(`  Min Balance:    ${this.formatAmount(vault.constraints.min_balance)} SUI`);
    console.log(`  Alert At:       ${this.formatAmount(vault.constraints.alert_threshold)} SUI`);
    console.log(`  Paused:         ${vault.constraints.paused ? 'YES' : 'NO'}`);
    console.log('='.repeat(60));
  }

  /**
   * Validate if a swap can be executed within constraints
   */
  validateSwap(vault: VaultData, amount: bigint): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const balance = BigInt(vault.balance);
    const spentToday = BigInt(vault.spent_today);
    const dailyLimit = BigInt(vault.constraints.daily_limit);
    const perTxLimit = BigInt(vault.constraints.per_tx_limit);
    const minBalance = BigInt(vault.constraints.min_balance);

    console.log('\n[*] Validating swap constraints...');

    // Check paused
    if (vault.constraints.paused) {
      errors.push('Vault is paused');
    } else {
      console.log('    [OK] Vault is active');
    }

    // Check per-tx limit
    if (amount > perTxLimit) {
      errors.push(`Amount ${this.formatAmount(amount.toString())} exceeds per-tx limit ${this.formatAmount(perTxLimit.toString())}`);
    } else {
      console.log(`    [OK] Amount within per-tx limit (${this.formatAmount(amount.toString())} <= ${this.formatAmount(perTxLimit.toString())})`);
    }

    // Check daily limit
    if (spentToday + amount > dailyLimit) {
      errors.push(`Would exceed daily limit. Spent: ${this.formatAmount(spentToday.toString())}, Limit: ${this.formatAmount(dailyLimit.toString())}`);
    } else {
      console.log(`    [OK] Within daily limit (${this.formatAmount((spentToday + amount).toString())} <= ${this.formatAmount(dailyLimit.toString())})`);
    }

    // Check sufficient balance
    if (amount > balance) {
      errors.push('Insufficient vault balance');
    } else {
      console.log(`    [OK] Sufficient balance (${this.formatAmount(balance.toString())} available)`);
    }

    // Check min balance
    if (balance - amount < minBalance) {
      errors.push(`Would go below min balance of ${this.formatAmount(minBalance.toString())}`);
    } else {
      console.log(`    [OK] Maintains min balance (${this.formatAmount((balance - amount).toString())} >= ${this.formatAmount(minBalance.toString())})`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Build a swap transaction
   */
  buildSwapTransaction(
    vaultId: string,
    poolId: string,
    quantity: bigint,
    minOut: bigint,
    deepCoinId: string
  ): Transaction {
    const tx = new Transaction();
    tx.setGasBudget(200_000_000);

    tx.moveCall({
      target: `${CONFIG.PACKAGE_ID}::vault::execute_swap`,
      typeArguments: [ASSET_TYPES.DEEP, ASSET_TYPES.SUI],
      arguments: [
        tx.object(vaultId),
        tx.object(poolId),
        tx.pure.u64(quantity),
        tx.pure.u64(minOut),
        tx.object(deepCoinId),
        tx.pure.bool(true), // is_bid
        tx.object('0x6'), // Clock
      ],
    });

    return tx;
  }

  /**
   * Execute a swap transaction
   */
  async executeSwap(
    vaultId: string,
    poolId: string,
    quantity: bigint,
    minOut: bigint,
    deepCoinId: string
  ): Promise<boolean> {
    if (!this.keypair) {
      console.error('[!] Agent not initialized');
      return false;
    }

    console.log('\n[*] Building swap transaction...');
    const tx = this.buildSwapTransaction(vaultId, poolId, quantity, minOut, deepCoinId);

    console.log('[*] Signing and executing...');
    try {
      const result = await this.client.signAndExecuteTransaction({
        transaction: tx,
        signer: this.keypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (result.effects?.status?.status === 'success') {
        console.log(`\n[SUCCESS] Swap executed!`);
        console.log(`    TX Digest: ${result.digest}`);
        console.log(`    Explorer: https://suiexplorer.com/txblock/${result.digest}?network=testnet`);

        // Check for events
        const swapEvent = result.events?.find(e => e.type.includes('SwapExecuted'));
        if (swapEvent) {
          console.log(`    Event: SwapExecuted`);
        }

        const alertEvent = result.events?.find(e => e.type.includes('AlertTriggered'));
        if (alertEvent) {
          console.log(`    [!] ALERT: Spending threshold exceeded!`);
        }

        return true;
      } else {
        console.error(`\n[FAILED] Transaction failed: ${result.effects?.status?.error}`);
        return false;
      }
    } catch (error) {
      console.error('\n[FAILED] Execution error:', error);
      return false;
    }
  }

  /**
   * Run the demo
   */
  async runDemo(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('           AGENTVAULT AUTONOMOUS AGENT DEMO');
    console.log('='.repeat(60));

    // Validate config
    if (!CONFIG.VAULT_ID) {
      console.log('\n[!] No VAULT_ID provided. Set it in your .env file.');
      console.log('    Example: VAULT_ID=0x...');
      this.showUsage();
      return;
    }

    // Initialize agent
    if (!this.initialize()) {
      this.showUsage();
      return;
    }

    // Fetch vault
    console.log(`\n[*] Fetching vault: ${CONFIG.VAULT_ID.slice(0, 20)}...`);
    const vault = await this.getVault(CONFIG.VAULT_ID);
    if (!vault) {
      console.log('[!] Failed to fetch vault. Check the VAULT_ID.');
      return;
    }

    // Display status
    this.displayVaultStatus(vault);

    // Verify agent authorization
    const agentAddress = this.keypair!.getPublicKey().toSuiAddress();
    if (vault.agent.toLowerCase() !== agentAddress.toLowerCase()) {
      console.log('\n[!] WARNING: This keypair is not the authorized agent for this vault!');
      console.log(`    Expected: ${vault.agent}`);
      console.log(`    Got:      ${agentAddress}`);
      console.log('\n    Transactions will fail with ENotAgent error.');
    } else {
      console.log('\n[OK] Agent authorized for this vault');
    }

    // Demo: Validate a potential swap
    const swapAmount = BigInt(100_000_000); // 0.1 SUI
    console.log(`\n[*] Simulating swap of ${this.formatAmount(swapAmount.toString())} SUI...`);

    const validation = this.validateSwap(vault, swapAmount);
    if (!validation.valid) {
      console.log('\n[!] Swap would fail due to constraints:');
      validation.errors.forEach(e => console.log(`    - ${e}`));
      console.log('\n    This is the constraint system working as intended!');
    } else {
      console.log('\n[OK] Swap would pass all constraint checks');

      // If we have all required config, offer to execute
      if (CONFIG.DEEP_COIN_ID) {
        console.log('\n[?] Execute swap? (Set EXECUTE_SWAP=true in .env to auto-execute)');
        if (process.env.EXECUTE_SWAP === 'true') {
          await this.executeSwap(
            CONFIG.VAULT_ID,
            CONFIG.POOL_ID,
            swapAmount,
            BigInt(1), // Minimal min_out for demo
            CONFIG.DEEP_COIN_ID
          );
        }
      } else {
        console.log('\n[!] To execute swaps, provide DEEP_COIN_ID in .env');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('                    DEMO COMPLETE');
    console.log('='.repeat(60) + '\n');
  }

  showUsage(): void {
    console.log(`
Usage:
  AGENT_PRIVATE_KEY=<key> VAULT_ID=<id> npm run agent-demo

Environment Variables:
  AGENT_PRIVATE_KEY  - Ed25519 private key (hex, base64, or suiprivkey format)
  VAULT_ID           - The vault object ID to operate on
  POOL_ID            - DeepBook v3 pool ID (optional, defaults to DEEP/SUI)
  DEEP_COIN_ID       - DEEP token coin object for fees (required for execution)
  EXECUTE_SWAP       - Set to 'true' to actually execute swaps

Example:
  AGENT_PRIVATE_KEY=abc123... VAULT_ID=0x1234... npm run agent-demo
`);
  }
}

// Run demo
const agent = new AgentVaultDemo();
agent.runDemo().catch(console.error);
