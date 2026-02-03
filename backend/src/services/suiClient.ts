import { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import { getSuiRpcUrl, env } from '../config/index.js';

// Helper to extract value from Move Option type
function extractOptionValue(optionField: unknown): string | null {
  if (!optionField || typeof optionField !== 'object') return null;
  const opt = optionField as { vec?: unknown[] };
  if (opt.vec && Array.isArray(opt.vec) && opt.vec.length > 0) {
    return opt.vec[0] as string;
  }
  return null;
}

function extractBalanceValue(balanceField: unknown): string {
  if (balanceField && typeof balanceField === 'object') {
    const record = balanceField as Record<string, unknown>;
    const value = record.value;
    if (typeof value === 'string') return value;
  }
  if (typeof balanceField === 'string') return balanceField;
  return '0';
}

function extractConstraints(constraintsField: unknown): Record<string, unknown> {
  if (constraintsField && typeof constraintsField === 'object') {
    const record = constraintsField as Record<string, unknown>;
    if (record.fields && typeof record.fields === 'object') {
      return record.fields as Record<string, unknown>;
    }
  }
  return (constraintsField as Record<string, unknown>) || {};
}

export interface VaultData {
  id: string;
  owner: string;
  agent: string;
  balance: string;
  constraints: {
    dailyLimit: string;
    perTxLimit: string;
    alertThreshold: string;
    yieldEnabled: boolean;
    minBalance: string;
    paused: boolean;
  };
  spentToday: string;
  lastResetTimestamp: string;
  totalSpent: string;
  txCount: string;
  yieldPositionId: string | null;
  yieldEarned: string;
}

class SuiClientService {
  private client: SuiClient;

  constructor() {
    this.client = new SuiClient({ url: getSuiRpcUrl() });
  }

  getClient(): SuiClient {
    return this.client;
  }

  async getVault(vaultId: string): Promise<VaultData | null> {
    try {
      const response: SuiObjectResponse = await this.client.getObject({
        id: vaultId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
        return null;
      }

      const fields = response.data.content.fields as Record<string, unknown>;
      const constraints = extractConstraints(fields.constraints);

      return {
        id: vaultId,
        owner: fields.owner as string,
        agent: fields.agent as string,
        balance: extractBalanceValue(fields.balance),
        constraints: {
          dailyLimit: constraints.daily_limit as string,
          perTxLimit: constraints.per_tx_limit as string,
          alertThreshold: constraints.alert_threshold as string,
          yieldEnabled: constraints.yield_enabled as boolean,
          minBalance: constraints.min_balance as string,
          paused: constraints.paused as boolean,
        },
        spentToday: fields.spent_today as string,
        lastResetTimestamp: fields.last_reset_timestamp as string,
        totalSpent: fields.total_spent as string,
        txCount: fields.tx_count as string,
        yieldPositionId: extractOptionValue(fields.yield_position_id),
        yieldEarned: fields.yield_earned as string,
      };
    } catch (error) {
      console.error('Error fetching vault:', error);
      return null;
    }
  }

  async getVaultsByOwner(ownerAddress: string): Promise<VaultData[]> {
    try {
      const response = await this.client.getOwnedObjects({
        owner: ownerAddress,
        filter: {
          StructType: `${env.PACKAGE_ID}::vault::Vault`,
        },
        options: {
          showContent: true,
          showType: true,
        },
      });

      const vaults: VaultData[] = [];
      for (const obj of response.data) {
        if (obj.data?.content && obj.data.content.dataType === 'moveObject') {
          const fields = obj.data.content.fields as Record<string, unknown>;
          const constraints = extractConstraints(fields.constraints);

          vaults.push({
            id: obj.data.objectId,
            owner: fields.owner as string,
            agent: fields.agent as string,
            balance: extractBalanceValue(fields.balance),
            constraints: {
              dailyLimit: constraints.daily_limit as string,
              perTxLimit: constraints.per_tx_limit as string,
              alertThreshold: constraints.alert_threshold as string,
              yieldEnabled: constraints.yield_enabled as boolean,
              minBalance: constraints.min_balance as string,
              paused: constraints.paused as boolean,
            },
            spentToday: fields.spent_today as string,
            lastResetTimestamp: fields.last_reset_timestamp as string,
            totalSpent: fields.total_spent as string,
            txCount: fields.tx_count as string,
            yieldPositionId: extractOptionValue(fields.yield_position_id),
            yieldEarned: fields.yield_earned as string,
          });
        }
      }
      return vaults;
    } catch (error) {
      console.error('Error fetching vaults by owner:', error);
      return [];
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.client.getBalance({
        owner: address,
      });
      return balance.totalBalance;
    } catch (error) {
      console.error('Error fetching balance:', error);
      return '0';
    }
  }
}

export const suiClient = new SuiClientService();
