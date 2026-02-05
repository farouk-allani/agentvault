import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient } from '../services/suiClient.js';
import { parseIntent, validateIntent, formatIntent } from '../services/intentParser.js';
import { env } from '../config/index.js';

const router = Router();

// ============================================================================
// CREATE VAULT
// ============================================================================

const createVaultSchema = z.object({
  owner: z.string().min(1, 'Owner address is required'),
  agent: z.string().min(1, 'Agent address is required'),
  dailyLimit: z.number().min(1).max(1_000_000_000_000_000), // Allow any positive number
  perTxLimit: z.number().min(1).max(1_000_000_000_000_000), // Allow any positive number
  alertThreshold: z.number().min(0),
  yieldEnabled: z.boolean(),
  minBalance: z.number().min(0),
  coinObjectId: z.string().min(1, 'Coin object ID is required'),
  assetType: z.string().optional(),
});

/**
 * POST /api/vault/create
 * Build a transaction to create a new vault
 */
router.post('/create', async (req: Request, res: Response): Promise<void> => {
  try {
    const params = createVaultSchema.parse(req.body);

    // Validate per-tx limit doesn't exceed daily limit
    if (params.perTxLimit > params.dailyLimit) {
      res.status(400).json({
        success: false,
        error: 'Per-transaction limit cannot exceed daily limit',
      });
      return;
    }

    const assetType = params.assetType || env.USDC_TYPE || '0x2::sui::SUI';

    const tx = new Transaction();
    tx.setGasBudget(100_000_000);

    tx.moveCall({
      target: `${env.PACKAGE_ID}::vault::create_vault`,
      typeArguments: [assetType],
      arguments: [
        tx.object(params.coinObjectId),     // initial_deposit: Coin<T>
        tx.pure.address(params.agent),       // agent: address
        tx.pure.u64(BigInt(params.dailyLimit)),    // daily_limit: u64
        tx.pure.u64(BigInt(params.perTxLimit)),    // per_tx_limit: u64
        tx.pure.u64(BigInt(params.alertThreshold)), // alert_threshold: u64
        tx.pure.bool(params.yieldEnabled),   // yield_enabled: bool
        tx.pure.u64(BigInt(params.minBalance)),    // min_balance: u64
        tx.object('0x6'),                    // clock: &Clock
      ],
    });

    tx.setSender(params.owner);
    const txBytes = await tx.build({ client: suiClient.getClient() });

    res.json({
      success: true,
      transaction: Buffer.from(txBytes).toString('base64'),
      message: 'Vault creation transaction built. Sign and submit to create vault.',
      params: {
        owner: params.owner,
        agent: params.agent,
        dailyLimit: params.dailyLimit,
        perTxLimit: params.perTxLimit,
        alertThreshold: params.alertThreshold,
        yieldEnabled: params.yieldEnabled,
        minBalance: params.minBalance,
        assetType,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors,
      });
      return;
    }
    console.error('Error building create vault transaction:', error);
    res.status(500).json({
      success: false,
      error: 'Error building transaction',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/vault/:id
 * Get vault details by ID
 */
router.get('/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vault = await suiClient.getVault(id);
    if (!vault) {
      res.status(404).json({
        success: false,
        error: 'Vault not found',
      });
      return;
    }

    res.json({
      success: true,
      vault,
    });
  } catch (error) {
    console.error('Error fetching vault:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching vault',
    });
  }
});

/**
 * GET /api/vault/owner/:address
 * Get all vaults owned by an address
 */
router.get('/owner/:address', async (req: Request<{ address: string }>, res: Response): Promise<void> => {
  try {
    const { address } = req.params;

    const vaults = await suiClient.getVaultsByOwner(address);
    res.json({
      success: true,
      vaults,
      count: vaults.length,
    });
  } catch (error) {
    console.error('Error fetching vaults by owner:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching vaults',
    });
  }
});

/**
 * POST /api/vault/parse-intent
 * Parse a natural language intent into vault constraints
 */
const parseIntentSchema = z.object({
  intent: z.string().min(1, 'Intent text is required'),
});

router.post('/parse-intent', (req: Request, res: Response): void => {
  try {
    const { intent } = parseIntentSchema.parse(req.body);

    const parsed = parseIntent(intent);
    const validation = validateIntent(parsed);
    const formatted = formatIntent(parsed);

    res.json({
      success: true,
      parsed,
      validation,
      formatted,
      suggestedConstraints: validation.valid
        ? {
            dailyLimit: parsed.dailyLimit,
            perTxLimit: parsed.perTxLimit || Math.floor((parsed.dailyLimit || 0) / 2),
            alertThreshold: parsed.alertThreshold || Math.floor((parsed.dailyLimit || 0) * 0.8),
            minBalance: parsed.minBalance || 0,
            yieldEnabled: parsed.yieldEnabled ?? false,
          }
        : null,
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
    res.status(500).json({
      success: false,
      error: 'Error parsing intent',
    });
  }
});

/**
 * GET /api/vault/:id/status
 * Get vault status including spending summary
 */
router.get('/:id/status', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vault = await suiClient.getVault(id);
    if (!vault) {
      res.status(404).json({
        success: false,
        error: 'Vault not found',
      });
      return;
    }

    const balance = BigInt(vault.balance);
    const dailyLimit = BigInt(vault.constraints.dailyLimit);
    const spentToday = BigInt(vault.spentToday);
    const totalSpent = BigInt(vault.totalSpent);

    res.json({
      success: true,
      status: {
        vaultId: id,
        owner: vault.owner,
        agent: vault.agent,
        paused: vault.constraints.paused,
        balance: {
          current: vault.balance,
          formatted: `$${(Number(balance) / 1_000_000).toFixed(2)}`,
        },
        spending: {
          today: vault.spentToday,
          todayFormatted: `$${(Number(spentToday) / 1_000_000).toFixed(2)}`,
          total: vault.totalSpent,
          totalFormatted: `$${(Number(totalSpent) / 1_000_000).toFixed(2)}`,
          txCount: vault.txCount,
        },
        limits: {
          daily: vault.constraints.dailyLimit,
          dailyFormatted: `$${(Number(dailyLimit) / 1_000_000).toFixed(2)}`,
          perTx: vault.constraints.perTxLimit,
          perTxFormatted: `$${(Number(BigInt(vault.constraints.perTxLimit)) / 1_000_000).toFixed(2)}`,
          remainingDaily: (dailyLimit - spentToday).toString(),
          remainingDailyFormatted: `$${(Number(dailyLimit - spentToday) / 1_000_000).toFixed(2)}`,
          dailyUsagePercent: Number((spentToday * BigInt(100)) / dailyLimit),
        },
        alerts: {
          threshold: vault.constraints.alertThreshold,
          thresholdFormatted: `$${(Number(BigInt(vault.constraints.alertThreshold)) / 1_000_000).toFixed(2)}`,
          triggered: spentToday >= BigInt(vault.constraints.alertThreshold),
        },
        yield: {
          enabled: vault.constraints.yieldEnabled,
          positionId: vault.yieldPositionId,
          earned: vault.yieldEarned,
          earnedFormatted: `$${(Number(BigInt(vault.yieldEarned)) / 1_000_000).toFixed(2)}`,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching vault status:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching vault status',
    });
  }
});

/**
 * GET /api/vault/:id/can-spend
 * Check if a specific amount can be spent
 */
router.get('/:id/can-spend', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const amount = req.query.amount as string;

    if (!amount) {
      res.status(400).json({
        success: false,
        error: 'Amount query parameter required',
      });
      return;
    }

    const vault = await suiClient.getVault(id);
    if (!vault) {
      res.status(404).json({
        success: false,
        error: 'Vault not found',
      });
      return;
    }

    const amountBigInt = BigInt(amount);
    const balance = BigInt(vault.balance);
    const perTxLimit = BigInt(vault.constraints.perTxLimit);
    const dailyLimit = BigInt(vault.constraints.dailyLimit);
    const spentToday = BigInt(vault.spentToday);
    const minBalance = BigInt(vault.constraints.minBalance);

    const checks = {
      notPaused: !vault.constraints.paused,
      withinPerTxLimit: amountBigInt <= perTxLimit,
      withinDailyLimit: spentToday + amountBigInt <= dailyLimit,
      hasSufficientBalance: amountBigInt <= balance,
      aboveMinBalance: balance - amountBigInt >= minBalance,
    };

    const canSpend = Object.values(checks).every(Boolean);

    const reasons: string[] = [];
    if (!checks.notPaused) reasons.push('Vault is paused');
    if (!checks.withinPerTxLimit) reasons.push('Exceeds per-transaction limit');
    if (!checks.withinDailyLimit) reasons.push('Would exceed daily limit');
    if (!checks.hasSufficientBalance) reasons.push('Insufficient balance');
    if (!checks.aboveMinBalance) reasons.push('Would go below minimum balance');

    res.json({
      success: true,
      canSpend,
      checks,
      reasons: canSpend ? [] : reasons,
      maxAllowed: {
        byPerTxLimit: vault.constraints.perTxLimit,
        byDailyLimit: (dailyLimit - spentToday).toString(),
        byBalance: vault.balance,
        byMinBalance: (balance - minBalance).toString(),
        effective: Math.min(
          Number(perTxLimit),
          Number(dailyLimit - spentToday),
          Number(balance),
          Number(balance - minBalance)
        ).toString(),
      },
    });
  } catch (error) {
    console.error('Error checking spend ability:', error);
    res.status(500).json({
      success: false,
      error: 'Error checking spend ability',
    });
  }
});

export default router;
