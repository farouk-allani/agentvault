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
  assetType: string; // The coin type this vault holds (e.g., 0x2::sui::SUI)
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

// Extract asset type from vault's Move type string
// e.g., "0x...::vault::Vault<0x2::sui::SUI>" -> "0x2::sui::SUI"
function extractAssetType(vaultType: string | null | undefined): string {
  if (!vaultType) return '0x2::sui::SUI'; // Default to SUI
  const match = vaultType.match(/<(.+)>$/);
  return match ? match[1] : '0x2::sui::SUI';
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
      const assetType = extractAssetType(response.data.type);

      return {
        id: vaultId,
        owner: fields.owner as string,
        agent: fields.agent as string,
        balance: extractBalanceValue(fields.balance),
        assetType,
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
      // Vaults are shared objects, so we need to query VaultCreated events
      // to find vaults where the owner matches
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${env.PACKAGE_ID}::events::VaultCreated`,
        },
        limit: 50,
        order: 'descending',
      });

      const vaults: VaultData[] = [];
      const seenVaults = new Set<string>();

      for (const event of events.data) {
        const parsedJson = event.parsedJson as {
          vault_id: string;
          owner: string;
          agent: string;
          initial_balance: string;
          daily_limit: string;
          per_tx_limit: string;
        };

        // Filter by owner and skip duplicates
        if (parsedJson.owner !== ownerAddress || seenVaults.has(parsedJson.vault_id)) {
          continue;
        }
        seenVaults.add(parsedJson.vault_id);

        // Fetch the full vault data to get current state
        const vaultData = await this.getVault(parsedJson.vault_id);
        if (vaultData) {
          vaults.push(vaultData);
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
