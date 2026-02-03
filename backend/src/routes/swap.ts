import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { swapService } from '../services/swapService.js';
import { suiClient } from '../services/suiClient.js';

const router = Router();

// Request validation schemas
const swapRequestSchema = z.object({
  vaultId: z.string().min(1, 'Vault ID is required'),
  poolId: z.string().min(1, 'Pool ID is required'),
  quantity: z.string().min(1, 'Quantity is required'),
  minOut: z.string().min(1, 'Minimum output is required'),
  isBid: z.boolean(),
  agentAddress: z.string().min(1, 'Agent address is required'),
  deepCoinId: z.string().min(1, 'DEEP coin ID is required'),
  baseAssetType: z.string().optional(),
  quoteAssetType: z.string().optional(),
});

const quoteRequestSchema = z.object({
  poolId: z.string().min(1),
  quantity: z.string().min(1),
  isBid: z.boolean(),
});

/**
 * POST /api/swap/build
 * Build a swap transaction for the agent to sign
 */
router.post('/build', async (req: Request, res: Response): Promise<void> => {
  try {
    const request = swapRequestSchema.parse(req.body);

    // Validate vault exists and get its data
    const vault = await suiClient.getVault(request.vaultId);
    if (!vault) {
      res.status(404).json({
        success: false,
        error: 'Vault not found',
        errorCode: 'VAULT_NOT_FOUND',
      });
      return;
    }

    // Verify the caller is the authorized agent
    if (vault.agent.toLowerCase() !== request.agentAddress.toLowerCase()) {
      res.status(401).json({
        success: false,
        error: 'Not authorized agent for this vault',
        errorCode: 'NOT_AGENT',
      });
      return;
    }

    // Check if vault is paused
    if (vault.constraints.paused) {
      res.status(400).json({
        success: false,
        error: 'Vault is paused',
        errorCode: 'VAULT_PAUSED',
      });
      return;
    }

    // Validate pool ID against configured DeepBook v3 pools
    if (!swapService.isValidPool(request.poolId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid or unsupported pool ID',
        errorCode: 'INVALID_POOL',
      });
      return;
    }

    // Pre-validate constraints (agent will also validate on-chain)
    const quantity = BigInt(request.quantity);
    const perTxLimit = BigInt(vault.constraints.perTxLimit);
    const dailyLimit = BigInt(vault.constraints.dailyLimit);
    const spentToday = BigInt(vault.spentToday);
    const balance = BigInt(vault.balance);
    const minBalance = BigInt(vault.constraints.minBalance);

    if (quantity > perTxLimit) {
      res.status(400).json({
        success: false,
        error: `Quantity ${quantity} exceeds per-transaction limit ${perTxLimit}`,
        errorCode: 'EXCEEDS_PER_TX_LIMIT',
      });
      return;
    }

    if (spentToday + quantity > dailyLimit) {
      res.status(400).json({
        success: false,
        error: `Would exceed daily limit. Spent: ${spentToday}, Limit: ${dailyLimit}`,
        errorCode: 'EXCEEDS_DAILY_LIMIT',
      });
      return;
    }

    if (quantity > balance) {
      res.status(400).json({
        success: false,
        error: 'Insufficient vault balance',
        errorCode: 'INSUFFICIENT_BALANCE',
      });
      return;
    }

    if (balance - quantity < minBalance) {
      res.status(400).json({
        success: false,
        error: `Would go below minimum balance of ${minBalance}`,
        errorCode: 'BELOW_MIN_BALANCE',
      });
      return;
    }

    // Build the transaction
    const tx = swapService.buildSwapTransaction(
      request,
      request.baseAssetType,
      request.quoteAssetType
    );

    // Serialize transaction for client-side signing
    const txBytes = await tx.build({ client: suiClient.getClient() });

    res.json({
      success: true,
      transaction: Buffer.from(txBytes).toString('base64'),
      message: 'Transaction built successfully. Agent must sign and submit.',
      vaultState: {
        currentBalance: vault.balance,
        spentToday: vault.spentToday,
        dailyLimit: vault.constraints.dailyLimit,
        perTxLimit: vault.constraints.perTxLimit,
        remainingDaily: (dailyLimit - spentToday).toString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors,
      });
      return;
    }
    console.error('Swap build error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error building transaction',
    });
  }
});

/**
 * POST /api/swap/execute
 * Execute a swap (requires agent keypair - for demo purposes only)
 * In production, agents should sign transactions client-side
 */
router.post('/execute', async (req: Request, res: Response): Promise<void> => {
  try {
    const request = swapRequestSchema.parse(req.body);

    // Validate vault exists
    const vault = await suiClient.getVault(request.vaultId);
    if (!vault) {
      res.status(404).json({
        success: false,
        error: 'Vault not found',
      });
      return;
    }

    // Verify agent authorization
    if (vault.agent.toLowerCase() !== request.agentAddress.toLowerCase()) {
      res.status(401).json({
        success: false,
        error: 'Not authorized agent',
        errorCode: 'NOT_AGENT',
      });
      return;
    }

    // Validate pool ID against configured DeepBook v3 pools
    if (!swapService.isValidPool(request.poolId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid or unsupported pool ID',
        errorCode: 'INVALID_POOL',
      });
      return;
    }

    // Build transaction for client-side signing
    // Note: For security, we don't accept private keys over the network
    // The agent must sign the transaction client-side
    const tx = swapService.buildSwapTransaction(
      request,
      request.baseAssetType,
      request.quoteAssetType
    );
    const txBytes = await tx.build({ client: suiClient.getClient() });

    res.json({
      success: true,
      transaction: Buffer.from(txBytes).toString('base64'),
      message: 'Transaction built. Sign and submit client-side for security.',
      note: 'Direct execution with server-side keys disabled for security.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: error.errors,
      });
      return;
    }
    console.error('Swap execute error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
});

/**
 * GET /api/swap/pools
 * Get available DeepBook pools
 */
router.get('/pools', (_req: Request, res: Response): void => {
  const pools = swapService.getAvailablePools();
  res.json({
    success: true,
    pools,
    note: 'Pool IDs are for testnet. Update for mainnet deployment.',
  });
});

/**
 * GET /api/swap/quote
 * Get a price quote for a potential swap
 */
router.get('/quote', async (req: Request, res: Response): Promise<void> => {
  try {
    const { poolId, quantity, isBid } = quoteRequestSchema.parse({
      poolId: req.query.poolId,
      quantity: req.query.quantity,
      isBid: req.query.isBid === 'true',
    });

    const quote = await swapService.getQuote(poolId, quantity, isBid);

    if (quote) {
      res.json({
        success: true,
        quote,
      });
    } else {
      res.json({
        success: true,
        message: 'Quote endpoint not yet implemented. Coming soon.',
        note: 'For now, use DeepBook UI or SDK directly for quotes.',
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Error fetching quote',
    });
  }
});

/**
 * GET /api/swap/validate/:vaultId
 * Validate if a swap can be executed for a vault
 */
router.get('/validate/:vaultId', async (req: Request<{ vaultId: string }>, res: Response): Promise<void> => {
  try {
    const { vaultId } = req.params;
    const quantity = req.query.quantity as string;

    if (!quantity) {
      res.status(400).json({
        success: false,
        error: 'Quantity query parameter required',
      });
      return;
    }

    const vault = await suiClient.getVault(vaultId);
    if (!vault) {
      res.status(404).json({
        success: false,
        error: 'Vault not found',
      });
      return;
    }

    const quantityBigInt = BigInt(quantity);
    const balance = BigInt(vault.balance);
    const perTxLimit = BigInt(vault.constraints.perTxLimit);
    const dailyLimit = BigInt(vault.constraints.dailyLimit);
    const spentToday = BigInt(vault.spentToday);
    const minBalance = BigInt(vault.constraints.minBalance);

    const validations = {
      vaultNotPaused: !vault.constraints.paused,
      withinPerTxLimit: quantityBigInt <= perTxLimit,
      withinDailyLimit: spentToday + quantityBigInt <= dailyLimit,
      sufficientBalance: quantityBigInt <= balance,
      aboveMinBalance: balance - quantityBigInt >= minBalance,
    };

    const canExecute = Object.values(validations).every(Boolean);

    res.json({
      success: true,
      canExecute,
      validations,
      vault: {
        balance: vault.balance,
        spentToday: vault.spentToday,
        dailyLimit: vault.constraints.dailyLimit,
        perTxLimit: vault.constraints.perTxLimit,
        minBalance: vault.constraints.minBalance,
        paused: vault.constraints.paused,
        remainingDaily: (dailyLimit - spentToday).toString(),
      },
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Error validating swap',
    });
  }
});

export default router;
