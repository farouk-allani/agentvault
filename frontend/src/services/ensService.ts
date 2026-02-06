/**
 * ENS Integration Service for AgentVault
 *
 * This service provides ENS (Ethereum Name Service) resolution capabilities:
 * - Forward resolution: ENS name -> Ethereum address
 * - Reverse resolution: Ethereum address -> ENS name
 * - Text record retrieval: Get arbitrary data stored in ENS names
 * - Avatar resolution: Get profile pictures from ENS
 * - Constraint Profile loading: Load AgentVault constraint presets from ENS text records
 *
 * ENS Constraint Profile Schema (stored as text records):
 * - agentvault.dailyLimit: "100" (in human-readable units)
 * - agentvault.perTxLimit: "25"
 * - agentvault.alertThreshold: "80"
 * - agentvault.minBalance: "10"
 * - agentvault.yieldEnabled: "true" | "false"
 * - agentvault.description: "Conservative trading profile for beginners"
 */

import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

// ============================================================================
// TYPES
// ============================================================================

export interface ENSProfile {
  name: string;
  address: string | null;
  avatar: string | null;
  description: string | null;
}

export interface ENSConstraintProfile {
  name: string;
  dailyLimit: number | null;
  perTxLimit: number | null;
  alertThreshold: number | null;
  minBalance: number | null;
  yieldEnabled: boolean;
  description: string | null;
  author: string | null;
  isValid: boolean;
}

export interface ENSResolutionResult {
  success: boolean;
  address: string | null;
  ensName: string | null;
  avatar: string | null;
  error: string | null;
}

// ============================================================================
// PUBLIC CLIENT (Ethereum Mainnet for ENS)
// ============================================================================

// Create a public client for Ethereum mainnet (where ENS lives)
// Using multiple RPC endpoints for reliability
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth.llamarpc.com'), // Free, reliable RPC
});

// Fallback clients for redundancy
const fallbackClients = [
  createPublicClient({
    chain: mainnet,
    transport: http('https://rpc.ankr.com/eth'),
  }),
  createPublicClient({
    chain: mainnet,
    transport: http('https://ethereum.publicnode.com'),
  }),
];

// ============================================================================
// CORE ENS FUNCTIONS
// ============================================================================

/**
 * Resolve an ENS name to an Ethereum address
 * @param ensName - The ENS name (e.g., "vitalik.eth")
 * @returns The resolved Ethereum address or null
 */
export async function resolveENSName(ensName: string): Promise<string | null> {
  if (!ensName || !ensName.includes('.')) {
    return null;
  }

  try {
    const normalizedName = normalize(ensName.toLowerCase().trim());

    // Try primary client first
    try {
      const address = await publicClient.getEnsAddress({
        name: normalizedName,
      });
      return address;
    } catch (primaryError) {
      // Try fallback clients
      for (const client of fallbackClients) {
        try {
          const address = await client.getEnsAddress({
            name: normalizedName,
          });
          return address;
        } catch {
          continue;
        }
      }
      throw primaryError;
    }
  } catch (error) {
    console.error('ENS resolution error:', error);
    return null;
  }
}

/**
 * Reverse resolve an Ethereum address to an ENS name
 * @param address - The Ethereum address
 * @returns The primary ENS name or null
 */
export async function reverseResolveENS(address: string): Promise<string | null> {
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    return null;
  }

  try {
    const ensName = await publicClient.getEnsName({
      address: address as `0x${string}`,
    });
    return ensName;
  } catch (error) {
    console.error('ENS reverse resolution error:', error);
    return null;
  }
}

/**
 * Get the avatar URL for an ENS name
 * @param ensName - The ENS name
 * @returns The avatar URL or null
 */
export async function getENSAvatar(ensName: string): Promise<string | null> {
  if (!ensName || !ensName.includes('.')) {
    return null;
  }

  try {
    const normalizedName = normalize(ensName.toLowerCase().trim());
    const avatar = await publicClient.getEnsAvatar({
      name: normalizedName,
    });
    return avatar;
  } catch (error) {
    console.error('ENS avatar error:', error);
    return null;
  }
}

/**
 * Get a text record from an ENS name
 * @param ensName - The ENS name
 * @param key - The text record key
 * @returns The text record value or null
 */
export async function getENSTextRecord(ensName: string, key: string): Promise<string | null> {
  if (!ensName || !ensName.includes('.')) {
    return null;
  }

  try {
    const normalizedName = normalize(ensName.toLowerCase().trim());
    const text = await publicClient.getEnsText({
      name: normalizedName,
      key,
    });
    return text;
  } catch (error) {
    console.error(`ENS text record error for ${key}:`, error);
    return null;
  }
}

// ============================================================================
// AGENTVAULT-SPECIFIC ENS FUNCTIONS
// ============================================================================

/**
 * Load a complete ENS profile with address and avatar
 * @param ensName - The ENS name
 * @returns Complete ENS profile
 */
export async function loadENSProfile(ensName: string): Promise<ENSProfile> {
  const [address, avatar, description] = await Promise.all([
    resolveENSName(ensName),
    getENSAvatar(ensName),
    getENSTextRecord(ensName, 'description'),
  ]);

  return {
    name: ensName,
    address,
    avatar,
    description,
  };
}

/**
 * Load AgentVault constraint profile from ENS text records
 * This is the CREATIVE ENS INTEGRATION - storing DeFi config in ENS!
 *
 * @param ensName - The ENS name containing the constraint profile
 * @returns The parsed constraint profile
 */
export async function loadENSConstraintProfile(ensName: string): Promise<ENSConstraintProfile> {
  const profile: ENSConstraintProfile = {
    name: ensName,
    dailyLimit: null,
    perTxLimit: null,
    alertThreshold: null,
    minBalance: null,
    yieldEnabled: false,
    description: null,
    author: null,
    isValid: false,
  };

  if (!ensName || !ensName.includes('.')) {
    return profile;
  }

  try {
    // Fetch all constraint-related text records in parallel
    const [
      dailyLimit,
      perTxLimit,
      alertThreshold,
      minBalance,
      yieldEnabled,
      description,
      author,
    ] = await Promise.all([
      getENSTextRecord(ensName, 'agentvault.dailyLimit'),
      getENSTextRecord(ensName, 'agentvault.perTxLimit'),
      getENSTextRecord(ensName, 'agentvault.alertThreshold'),
      getENSTextRecord(ensName, 'agentvault.minBalance'),
      getENSTextRecord(ensName, 'agentvault.yieldEnabled'),
      getENSTextRecord(ensName, 'description'),
      resolveENSName(ensName), // Get the owner's address as author
    ]);

    // Parse numeric values
    profile.dailyLimit = dailyLimit ? parseFloat(dailyLimit) : null;
    profile.perTxLimit = perTxLimit ? parseFloat(perTxLimit) : null;
    profile.alertThreshold = alertThreshold ? parseFloat(alertThreshold) : null;
    profile.minBalance = minBalance ? parseFloat(minBalance) : null;
    profile.yieldEnabled = yieldEnabled?.toLowerCase() === 'true';
    profile.description = description;
    profile.author = author;

    // Profile is valid if it has at least a daily limit
    profile.isValid = profile.dailyLimit !== null && profile.dailyLimit > 0;

    return profile;
  } catch (error) {
    console.error('Error loading ENS constraint profile:', error);
    return profile;
  }
}

/**
 * Full ENS resolution with address, name, and avatar
 * Handles both ENS names and raw addresses
 *
 * @param input - Either an ENS name or Ethereum address
 * @returns Complete resolution result
 */
export async function resolveENSOrAddress(input: string): Promise<ENSResolutionResult> {
  const result: ENSResolutionResult = {
    success: false,
    address: null,
    ensName: null,
    avatar: null,
    error: null,
  };

  if (!input) {
    result.error = 'No input provided';
    return result;
  }

  const trimmedInput = input.trim().toLowerCase();

  try {
    // Check if it's an ENS name
    if (trimmedInput.includes('.')) {
      const address = await resolveENSName(trimmedInput);
      if (address) {
        result.success = true;
        result.address = address;
        result.ensName = trimmedInput;
        result.avatar = await getENSAvatar(trimmedInput);
      } else {
        result.error = `Could not resolve ENS name: ${trimmedInput}`;
      }
    }
    // Check if it's an Ethereum address
    else if (trimmedInput.startsWith('0x') && trimmedInput.length === 42) {
      result.success = true;
      result.address = trimmedInput;

      // Try reverse resolution
      const ensName = await reverseResolveENS(trimmedInput);
      if (ensName) {
        result.ensName = ensName;
        result.avatar = await getENSAvatar(ensName);
      }
    }
    // Invalid input
    else {
      result.error = 'Invalid input: must be an ENS name (*.eth) or Ethereum address (0x...)';
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Resolution failed';
  }

  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a string is a valid ENS name
 */
export function isValidENSName(input: string): boolean {
  if (!input) return false;
  const trimmed = input.trim().toLowerCase();
  // Must contain a dot and end with a valid TLD
  return trimmed.includes('.') && (
    trimmed.endsWith('.eth') ||
    trimmed.endsWith('.xyz') ||
    trimmed.endsWith('.luxe') ||
    trimmed.endsWith('.kred') ||
    trimmed.endsWith('.art')
  );
}

/**
 * Check if a string is a valid Ethereum address
 */
export function isValidAddress(input: string): boolean {
  if (!input) return false;
  const trimmed = input.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
}

/**
 * Format address for display (truncate middle)
 */
export function formatAddress(address: string, chars = 6): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Get display name - ENS name if available, otherwise truncated address
 */
export function getDisplayName(address: string, ensName: string | null): string {
  if (ensName) return ensName;
  return formatAddress(address);
}

// ============================================================================
// PREDEFINED CONSTRAINT PROFILES (Demo)
// ============================================================================

// These are example profiles that could be stored in ENS text records
// In production, users would create their own profiles
export const DEMO_CONSTRAINT_PROFILES: Record<string, ENSConstraintProfile> = {
  'conservative': {
    name: 'conservative.agentvault.eth',
    dailyLimit: 50,
    perTxLimit: 10,
    alertThreshold: 40,
    minBalance: 20,
    yieldEnabled: false,
    description: 'Low-risk profile for cautious spending. Small daily limits with tight per-transaction caps.',
    author: null,
    isValid: true,
  },
  'moderate': {
    name: 'moderate.agentvault.eth',
    dailyLimit: 200,
    perTxLimit: 50,
    alertThreshold: 160,
    minBalance: 25,
    yieldEnabled: true,
    description: 'Balanced profile for everyday trading. Moderate limits suitable for most use cases.',
    author: null,
    isValid: true,
  },
  'aggressive': {
    name: 'aggressive.agentvault.eth',
    dailyLimit: 1000,
    perTxLimit: 250,
    alertThreshold: 800,
    minBalance: 50,
    yieldEnabled: true,
    description: 'High-limit profile for active traders. Large daily caps for frequent transactions.',
    author: null,
    isValid: true,
  },
  'daytrader': {
    name: 'daytrader.agentvault.eth',
    dailyLimit: 5000,
    perTxLimit: 1000,
    alertThreshold: 4000,
    minBalance: 100,
    yieldEnabled: true,
    description: 'Professional day trading profile. Maximum flexibility for high-volume operations.',
    author: null,
    isValid: true,
  },
};
