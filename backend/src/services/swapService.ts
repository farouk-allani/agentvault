import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { env, getSuiRpcUrl } from '../config/index.js';

// ============================================================================
// DEEPBOOK V3 CONFIGURATION (from @mysten/deepbook-v3 SDK)
// ============================================================================

const IS_MAINNET = env.SUI_NETWORK === 'mainnet';

// TESTNET Token Types
const TESTNET_TOKENS = {
  DEEP: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  SUI: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  DBUSDC: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
};

// TESTNET Pool Addresses
const TESTNET_POOLS = {
  DEEP_SUI: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
  SUI_DBUSDC: '0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5',
  DEEP_DBUSDC: '0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622',
};

// MAINNET Token Types
const MAINNET_TOKENS = {
  DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  SUI: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
};

// MAINNET Pool Addresses
const MAINNET_POOLS = {
  DEEP_SUI: '0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22',
  SUI_USDC: '0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407',
  DEEP_USDC: '0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce',
};

// Select based on network
const TOKENS = IS_MAINNET ? MAINNET_TOKENS : TESTNET_TOKENS;
const POOLS = IS_MAINNET ? MAINNET_POOLS : TESTNET_POOLS;

// Asset type constants
const DEEP_TYPE = TOKENS.DEEP;
const SUI_TYPE = TOKENS.SUI;
// On testnet: DBUSDC, On mainnet: native USDC
const QUOTE_STABLE_TYPE = IS_MAINNET ? MAINNET_TOKENS.USDC : TESTNET_TOKENS.DBUSDC;

// DeepBook pools with correct addresses from the official SDK
const DEEPBOOK_POOLS: Record<string, { id: string; baseAsset: string; quoteAsset: string; baseName: string; quoteName: string }> = {
  'DEEP_SUI': {
    id: POOLS.DEEP_SUI || env.DEEPBOOK_DEEP_SUI_POOL,
    baseAsset: DEEP_TYPE,
    quoteAsset: SUI_TYPE,
    baseName: 'DEEP',
    quoteName: 'SUI',
  },
  'SUI_DBUSDC': {
    id: (IS_MAINNET ? MAINNET_POOLS.SUI_USDC : TESTNET_POOLS.SUI_DBUSDC) || env.DEEPBOOK_SUI_USDC_POOL,
    baseAsset: SUI_TYPE,
    quoteAsset: QUOTE_STABLE_TYPE,
    baseName: 'SUI',
    quoteName: IS_MAINNET ? 'USDC' : 'DBUSDC',
  },
  'DEEP_DBUSDC': {
    id: (IS_MAINNET ? MAINNET_POOLS.DEEP_USDC : TESTNET_POOLS.DEEP_DBUSDC) || env.DEEPBOOK_DEEP_USDC_POOL,
    baseAsset: DEEP_TYPE,
    quoteAsset: QUOTE_STABLE_TYPE,
    baseName: 'DEEP',
    quoteName: IS_MAINNET ? 'USDC' : 'DBUSDC',
  },
};

// Also add mainnet pool aliases for convenience
if (IS_MAINNET) {
  DEEPBOOK_POOLS['SUI_USDC'] = DEEPBOOK_POOLS['SUI_DBUSDC'];
  DEEPBOOK_POOLS['DEEP_USDC'] = DEEPBOOK_POOLS['DEEP_DBUSDC'];
}

// Type addresses for common assets
const ASSET_TYPES = {
  SUI: SUI_TYPE,
  DEEP: DEEP_TYPE,
  USDC: QUOTE_STABLE_TYPE,
  DBUSDC: TESTNET_TOKENS.DBUSDC,
};

export interface SwapRequest {
  vaultId: string;
  poolId: string;
  quantity: string; // In base units (quote asset amount for buying base)
  minOut: string;   // Minimum output (slippage protection)
  isBid: boolean;   // true = buy base asset, false = sell base asset
  agentAddress: string;
  deepCoinId: string; // DEEP token coin object ID for paying fees
}

export interface SwapResult {
  success: boolean;
  txDigest?: string;
  amountIn?: string;
  amountOut?: string;
  error?: string;
  errorCode?: SwapErrorCode;
}

export type SwapErrorCode =
  | 'EXCEEDS_DAILY_LIMIT'
  | 'EXCEEDS_PER_TX_LIMIT'
  | 'INSUFFICIENT_BALANCE'
  | 'VAULT_PAUSED'
  | 'NOT_AGENT'
  | 'BELOW_MIN_BALANCE'
  | 'DEEPBOOK_ERROR'
  | 'INVALID_POOL'
  | 'MISSING_DEEP_COIN'
  | 'SLIPPAGE_EXCEEDED'
  | 'UNKNOWN';

export class SwapService {
  private client: SuiClient;
  private packageId: string;

  constructor() {
    this.client = new SuiClient({ url: getSuiRpcUrl() });
    this.packageId = env.PACKAGE_ID;
  }

  /**
   * Build a swap transaction for the agent to sign (DeepBook v3)
   * Returns serialized transaction bytes that the agent must sign client-side
   *
   * DeepBook v3 changes:
   * - No longer requires AccountCap
   * - Requires DEEP token for fee payment
   * - Supports slippage protection via min_out parameter
   */
  buildSwapTransaction(
    request: SwapRequest,
    baseAssetType: string = ASSET_TYPES.SUI,
    quoteAssetType: string = ASSET_TYPES.USDC
  ): Transaction {
    const tx = new Transaction();

    // Set an explicit gas budget to avoid dry-run failures during build
    tx.setGasBudget(200_000_000);

    // DeepBook v3 execute_swap signature:
    // execute_swap<BaseAsset, QuoteAsset>(
    //   vault: &mut Vault<QuoteAsset>,
    //   pool: &mut Pool<BaseAsset, QuoteAsset>,
    //   quantity: u64,
    //   min_base_out: u64,
    //   deep_in: Coin<DEEP>,
    //   is_bid: bool,
    //   clock: &Clock,
    //   ctx: &mut TxContext
    // )

    tx.moveCall({
      target: `${this.packageId}::vault::execute_swap`,
      typeArguments: [
        baseAssetType,   // BaseAsset type
        quoteAssetType,  // QuoteAsset type (vault's asset type)
      ],
      arguments: [
        tx.object(request.vaultId),             // Vault object
        tx.object(request.poolId),              // DeepBook v3 Pool
        tx.pure.u64(BigInt(request.quantity)),  // quantity (quote amount to spend)
        tx.pure.u64(BigInt(request.minOut)),    // min_base_out (slippage protection)
        tx.object(request.deepCoinId),          // DEEP coin for fees
        tx.pure.bool(request.isBid),            // is_bid
        tx.object('0x6'),                       // Clock object (shared)
      ],
    });

    return tx;
  }

  /**
   * Execute swap with agent's keypair (for demo/testing purposes)
   * In production, the agent would sign the transaction client-side
   *
   * DeepBook v3: Requires DEEP token coin for fee payment instead of AccountCap
   */
  async executeSwap(
    request: SwapRequest,
    agentKeypair: Ed25519Keypair,
    baseAssetType?: string,
    quoteAssetType?: string
  ): Promise<SwapResult> {
    try {
      // Validate required fields
      if (!request.deepCoinId) {
        return {
          success: false,
          error: 'DEEP coin ID is required for DeepBook v3 swaps (for fee payment)',
          errorCode: 'MISSING_DEEP_COIN',
        };
      }

      const tx = this.buildSwapTransaction(request, baseAssetType, quoteAssetType);

      const result = await this.client.signAndExecuteTransaction({
        transaction: tx,
        signer: agentKeypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (result.effects?.status?.status === 'success') {
        // Parse swap events to get actual amounts
        const swapEvent = result.events?.find(
          (e) => e.type.includes('::events::SwapExecuted')
        );
        const parsedJson = swapEvent?.parsedJson as Record<string, unknown> | undefined;

        return {
          success: true,
          txDigest: result.digest,
          amountIn: request.quantity,
          amountOut: parsedJson?.amount as string | undefined,
        };
      } else {
        return {
          success: false,
          error: result.effects?.status?.error || 'Transaction failed',
          errorCode: this.parseErrorCode(result.effects?.status?.error),
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMsg,
        errorCode: this.parseErrorCode(errorMsg),
      };
    }
  }

  /**
   * Parse Move abort codes into human-readable error codes
   */
  private parseErrorCode(errorMsg?: string): SwapErrorCode {
    if (!errorMsg) return 'UNKNOWN';

    // Match against Move abort codes from the contract
    if (errorMsg.includes('EExceedsDailyLimit') || errorMsg.includes('abort code: 2')) {
      return 'EXCEEDS_DAILY_LIMIT';
    }
    if (errorMsg.includes('EExceedsPerTxLimit') || errorMsg.includes('abort code: 3')) {
      return 'EXCEEDS_PER_TX_LIMIT';
    }
    if (errorMsg.includes('EInsufficientBalance') || errorMsg.includes('abort code: 5')) {
      return 'INSUFFICIENT_BALANCE';
    }
    if (errorMsg.includes('EVaultPaused') || errorMsg.includes('abort code: 4')) {
      return 'VAULT_PAUSED';
    }
    if (errorMsg.includes('ENotAgent') || errorMsg.includes('abort code: 1')) {
      return 'NOT_AGENT';
    }
    if (errorMsg.includes('EBelowMinBalance') || errorMsg.includes('abort code: 9')) {
      return 'BELOW_MIN_BALANCE';
    }
    // DeepBook v3 specific errors
    if (errorMsg.includes('slippage') || errorMsg.includes('min_out')) {
      return 'SLIPPAGE_EXCEEDED';
    }
    if (errorMsg.includes('deepbook') || errorMsg.includes('pool')) {
      return 'DEEPBOOK_ERROR';
    }

    return 'UNKNOWN';
  }

  /**
   * Get available DeepBook pools with full metadata
   */
  getAvailablePools(): Array<{
    pair: string;
    id: string;
    baseAsset: string;
    quoteAsset: string;
    baseName: string;
    quoteName: string;
  }> {
    return Object.entries(DEEPBOOK_POOLS)
      .filter(([, pool]) => pool.id && pool.id !== '0x0')
      .map(([pair, pool]) => ({
        pair,
        id: pool.id,
        baseAsset: pool.baseAsset,
        quoteAsset: pool.quoteAsset,
        baseName: pool.baseName,
        quoteName: pool.quoteName,
      }));
  }

  /**
   * Validate if a pool ID exists in our configured pools
   */
  isValidPool(poolId: string): boolean {
    if (!poolId || poolId === '0x0') return false;
    return Object.values(DEEPBOOK_POOLS).some(pool => pool.id === poolId);
  }

  /**
   * Get pool info by trading pair name
   */
  getPoolByPair(pair: string): typeof DEEPBOOK_POOLS[keyof typeof DEEPBOOK_POOLS] | undefined {
    return DEEPBOOK_POOLS[pair.toUpperCase() as keyof typeof DEEPBOOK_POOLS];
  }

  /**
   * Get pool info by pool ID
   */
  getPoolById(poolId: string): { pair: string; pool: typeof DEEPBOOK_POOLS[keyof typeof DEEPBOOK_POOLS] } | undefined {
    for (const [pair, pool] of Object.entries(DEEPBOOK_POOLS)) {
      if (pool.id === poolId) {
        return { pair, pool };
      }
    }
    return undefined;
  }

  /**
   * Get asset type addresses
   */
  getAssetTypes(): typeof ASSET_TYPES {
    return { ...ASSET_TYPES };
  }

  /**
   * Get a quote for a potential swap
   * Queries the DeepBook v3 pool state to estimate output
   */
  async getQuote(
    poolId: string,
    quantity: string,
    isBid: boolean
  ): Promise<{
    estimatedOutput: string;
    priceImpact: string;
    estimatedFee: string;
    midPrice: string;
    poolInfo: { baseName: string; quoteName: string } | null;
  } | null> {
    try {
      // Get pool metadata
      const poolData = this.getPoolById(poolId);
      if (!poolData) {
        console.warn('Pool not found:', poolId);
        return null;
      }

      // Query pool state from chain
      const poolState = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!poolState.data?.content || poolState.data.content.dataType !== 'moveObject') {
        console.warn('Could not fetch pool state');
        return null;
      }

      const fields = poolState.data.content.fields as Record<string, unknown>;

      // DeepBook v3 pool has mid_price field (in FLOAT format, needs conversion)
      // The price is stored as a fixed-point number
      let midPrice = '0';
      if (fields.mid_price) {
        // DeepBook v3 uses 18 decimal fixed point for prices
        const rawPrice = BigInt(fields.mid_price as string);
        midPrice = (Number(rawPrice) / 1e18).toFixed(9);
      }

      // Calculate estimated output based on mid price
      const inputAmount = BigInt(quantity);
      const price = parseFloat(midPrice) || 0.01; // Fallback price

      let estimatedOutput: string;
      if (isBid) {
        // Buying base with quote: output = input / price
        estimatedOutput = Math.floor(Number(inputAmount) / price).toString();
      } else {
        // Selling base for quote: output = input * price
        estimatedOutput = Math.floor(Number(inputAmount) * price).toString();
      }

      // Estimate trading fee (DeepBook v3 typically charges ~0.1% taker fee)
      const feeRate = 0.001; // 0.1%
      const estimatedFee = Math.floor(Number(inputAmount) * feeRate).toString();

      // Estimate price impact (simplified - would need order book depth for accuracy)
      const impactPercent = Math.min(Number(inputAmount) / 1e12, 5).toFixed(2); // Cap at 5%

      return {
        estimatedOutput,
        priceImpact: `${impactPercent}%`,
        estimatedFee,
        midPrice,
        poolInfo: {
          baseName: poolData.pool.baseName,
          quoteName: poolData.pool.quoteName,
        },
      };
    } catch (error) {
      console.error('Error fetching quote:', error);
      return null;
    }
  }
}

export const swapService = new SwapService();
