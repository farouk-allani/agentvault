import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { env, getSuiRpcUrl } from '../config/index.js';

// DeepBook v3 pool IDs (update with actual values from DeepBook v3 docs)
// Mainnet: Check https://docs.sui.io/standards/deepbookv3/contract-information for latest pool IDs
const DEEPBOOK_POOLS: Record<string, string> = {
  'SUI_USDC': env.DEEPBOOK_SUI_USDC_POOL || '0x0', // Placeholder - update with actual v3 pool ID
  'DEEP_SUI': env.DEEPBOOK_DEEP_SUI_POOL || '0x0', // DEEP/SUI pool for convenience
};

// Type addresses for common assets
const ASSET_TYPES = {
  SUI: '0x2::sui::SUI',
  USDC: env.USDC_TYPE,
  // DEEP token type - mainnet address
  // Testnet may differ; update via env variable if needed
  DEEP: env.DEEP_TYPE || '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
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
   * Get available DeepBook pools
   */
  getAvailablePools(): Record<string, string> {
    return { ...DEEPBOOK_POOLS };
  }

  /**
   * Validate if a pool ID exists in our configured pools
   */
  isValidPool(poolId: string): boolean {
    return Object.values(DEEPBOOK_POOLS).includes(poolId);
  }

  /**
   * Get pool ID by trading pair name
   */
  getPoolByPair(pair: string): string | undefined {
    return DEEPBOOK_POOLS[pair.toUpperCase()];
  }

  /**
   * Get asset type addresses
   */
  getAssetTypes(): typeof ASSET_TYPES {
    return { ...ASSET_TYPES };
  }

  /**
   * Get a quote for a potential swap (optional - implement if time permits)
   * This would query DeepBook v3's order book to estimate output
   *
   * For DeepBook v3, consider using the @mysten/deepbook-v3 SDK:
   * - dbClient.midPrice(poolKey) for current price
   * - dbClient.getLevel2Range() for order book data
   */
  async getQuote(
    poolId: string,
    quantity: string,
    isBid: boolean
  ): Promise<{ estimatedOutput: string; priceImpact: string; estimatedFee: string } | null> {
    // TODO: Implement DeepBook v3 order book query using @mysten/deepbook-v3 SDK
    // Example with SDK:
    // const dbClient = new DeepBookClient({ address, env: 'mainnet', client: this.client });
    // const price = await dbClient.midPrice(poolKey);
    // const level2 = await dbClient.getLevel2Range(poolKey, lowPrice, highPrice, isBid);
    console.log('Quote endpoint not yet implemented for DeepBook v3:', { poolId, quantity, isBid });
    return null;
  }
}

export const swapService = new SwapService();
