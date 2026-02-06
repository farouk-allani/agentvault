import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useENSResolution, useENSConstraintProfile } from './hooks/useENS';
import {
  DEMO_CONSTRAINT_PROFILES,
  isValidENSName,
  isValidAddress,
  formatAddress,
  type ENSConstraintProfile,
} from './services/ensService';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const EXPLORER_BASE = 'https://suiexplorer.com';

// Logos
const SUI_LOGO = 'https://assets.coingecko.com/coins/images/26375/standard/sui_asset.jpeg';
const ENS_LOGO = 'https://avatars.githubusercontent.com/u/34167658?s=280&v=4';

// ============================================================================
// TYPES
// ============================================================================

interface VaultConstraints {
  dailyLimit: string;
  perTxLimit: string;
  alertThreshold: string;
  yieldEnabled: boolean;
  minBalance: string;
  paused: boolean;
}

interface VaultData {
  id: string;
  owner: string;
  agent: string;
  balance: string;
  assetType: string; // The coin type this vault holds (e.g., 0x2::sui::SUI)
  constraints: VaultConstraints;
  spentToday: string;
  totalSpent: string;
  txCount: string;
}

interface VaultStatus {
  status: {
    owner: string;
    agent: string;
    balance: { raw: string; formatted: string };
    spending: { today: string; todayFormatted: string; txCount: string };
    limits: {
      daily: string;
      dailyFormatted: string;
      perTx: string;
      perTxFormatted: string;
      remainingDaily: string;
      remainingDailyFormatted: string;
      dailyUsagePercent: number;
    };
  };
}

interface IntentResult {
  success: boolean;
  parsed: {
    dailyLimit?: number;
    perTxLimit?: number;
    alertThreshold?: number;
    minBalance?: number;
    yieldEnabled?: boolean;
  };
  formatted: string;
  confidence: string;
}

interface SwapBuildResult {
  success: boolean;
  transaction: string;
  vaultState: {
    currentBalance: string;
    spentToday: string;
    dailyLimit: string;
    perTxLimit: string;
    remainingDaily: string;
  };
}

interface PoolInfo {
  pair: string;
  id: string;
  baseAsset: string;
  quoteAsset: string;
  baseName: string;
  quoteName: string;
}

interface QuoteResult {
  inputAmount: string;
  estimatedOutput: string;
  midPrice: string;
  priceImpact: string;
  estimatedFee: string;
  direction: 'buy' | 'sell';
  pool: { baseName: string; quoteName: string } | null;
}

type TabType = 'dashboard' | 'swap' | 'create' | 'manage' | 'pay';

interface PaymentForm {
  recipient: string;
  amount: string;
}

interface PaymentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  willTriggerAlert: boolean;
  remainingAfterPayment: string;
  exceedsPerTx: boolean;
  exceedsDaily: boolean;
}

interface UserCoin {
  objectId: string;
  coinType: string;
  balance: string;
  symbol: string;
}

// Known coin types on testnet - maps type to symbol and decimals
const KNOWN_COINS: Record<string, { symbol: string; decimals: number }> = {
  '0x2::sui::SUI': { symbol: 'SUI', decimals: 9 },
  // DEEP token (testnet)
  '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP': { symbol: 'DEEP', decimals: 6 },
  // DBUSDC - DeepBook's testnet stablecoin (THIS IS WHAT DEEPBOOK POOLS USE!)
  '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC': { symbol: 'DBUSDC', decimals: 6 },
  // Testnet USDC variants
  '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC': { symbol: 'USDC', decimals: 6 },
  // Testnet USDC (used in vault transactions) - uses 9 decimals like SUI
  '0xcdd397f2cffb7f5d439f56fc01afe5585c5f06e3bcd2ee3a21753c566de313d9::usdc::USDC': { symbol: 'USDC', decimals: 9 },
};

// Token icons mapping - using known sources
const TOKEN_ICONS: Record<string, string> = {
  SUI: 'https://assets.coingecko.com/coins/images/26375/standard/sui_asset.jpeg',
  USDC: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
  DBUSDC: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png', // Same as USDC
  USDT: 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png',
  DEEP: 'https://s2.coinmarketcap.com/static/img/coins/64x64/33391.png',
  WAL: 'https://faucet.suilearn.io/_next/image?url=%2Fimages%2Ftokens%2Fwal.png&w=96&q=75',
  ETH: 'https://faucet.suilearn.io/_next/image?url=%2Fimages%2Ftokens%2Feth.png&w=96&q=75',
  WETH: 'https://faucet.suilearn.io/_next/image?url=%2Fimages%2Ftokens%2Feth.png&w=96&q=75',
};

function getTokenIcon(symbol: string): string | null {
  // Normalize symbol for matching (handle variations like wUSDC, testUSDC, etc.)
  const normalizedSymbol = symbol.toUpperCase();

  // Direct match
  if (TOKEN_ICONS[normalizedSymbol]) {
    return TOKEN_ICONS[normalizedSymbol];
  }

  // Check if it contains a known token name
  for (const [key, url] of Object.entries(TOKEN_ICONS)) {
    if (normalizedSymbol.includes(key)) {
      return url;
    }
  }

  return null;
}

function getCoinSymbol(coinType: string): string {
  if (KNOWN_COINS[coinType]) {
    return KNOWN_COINS[coinType].symbol;
  }
  // Extract symbol from type path (e.g., 0x...::usdc::USDC -> USDC)
  const parts = coinType.split('::');
  if (parts.length >= 3) {
    return parts[parts.length - 1].toUpperCase();
  }
  return 'UNKNOWN';
}

function getCoinDecimals(coinType: string): number {
  // Check exact match first - only trust known addresses
  if (KNOWN_COINS[coinType]) {
    return KNOWN_COINS[coinType].decimals;
  }

  // IMPORTANT: On Sui testnet, many tokens (including some USDC variants) use 9 decimals
  // like native SUI. Don't assume based on symbol name - only trust exact address matches.
  // Default to 9 decimals (SUI standard) for any unknown token.
  return 9;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error || `Request failed (${res.status})` };
    }
    return { ok: true, data: body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

function formatAmount(raw: string | number, decimals = 9): string {
  try {
    // Use BigInt for precision with large numbers
    const rawBigInt = BigInt(typeof raw === 'string' ? raw : Math.floor(raw));
    const divisor = BigInt(10 ** decimals);
    const wholePart = rawBigInt / divisor;
    const fractionalPart = rawBigInt % divisor;

    // Format fractional part with leading zeros, then take first 2 digits
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 2);

    return `${wholePart}.${fractionalStr}`;
  } catch {
    return '0.00';
  }
}

function parseAmount(human: string, decimals = 9): string {
  const num = parseFloat(human);
  if (isNaN(num)) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// Normalize Sui type addresses for comparison (remove leading zeros after 0x)
function normalizeType(t: string): string {
  return t.replace(/^0x0+/, '0x');
}

function explorerUrl(type: 'object' | 'txblock', id: string): string {
  return `${EXPLORER_BASE}/${type}/${id}?network=testnet`;
}

// ============================================================================
// FEATURE CARDS DATA
// ============================================================================

const featureCards = [
  {
    title: 'Constrained Spending',
    text: 'Set daily limits, per-tx caps, and minimum balances. Agents operate within hard on-chain limits.',
    color: '#FD5A46',
    icon: null,
  },
  {
    title: 'DeepBook v3 Swaps',
    text: 'Trade on Sui\'s native CLOB. Slippage protection built-in. No AccountCap needed.',
    color: '#C084FC',
    icon: "https://img.cryptorank.io/coins/sui1750268474192.png",
  },
  {
    title: 'ENS Profiles',
    text: 'Load constraint presets from ENS. Pay to human-readable names. DeFi config stored on-chain.',
    color: '#5298FF',
    icon: "https://ens.domains/assets/ens_logo_white.svg",
  },
  {
    title: 'Real Autonomy',
    text: 'Shared objects let agents act without owner signatures. Trust the code, not the agent.',
    color: '#84CC16',
    icon: null,
  },
];

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  // Wallet state
  const account = useCurrentAccount();
  const { mutate: signAndExecute, isPending: isExecuting } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  // User's coins state
  const [userCoins, setUserCoins] = useState<UserCoin[]>([]);
  const [loadingCoins, setLoadingCoins] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Vault state
  const [vaultId, setVaultId] = useState('');
  const [vault, setVault] = useState<VaultData | null>(null);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [userVaults, setUserVaults] = useState<string[]>([]);

  // Swap state
  const [swapForm, setSwapForm] = useState({
    amount: '',
    minOut: '',
    direction: 'buy' as 'buy' | 'sell',
    poolId: '',
    deepCoinId: '',
  });
  const [swapBuild, setSwapBuild] = useState<SwapBuildResult | null>(null);
  const [lastTxDigest, setLastTxDigest] = useState<string | null>(null);
  const [availablePools, setAvailablePools] = useState<PoolInfo[]>([]);
  const [quote, setQuote] = useState<QuoteResult | null>(null);

  // Intent / Create state
  const [intent, setIntent] = useState('Spend up to $100 per day, max $25 per trade, keep $10 minimum');
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
  const [createForm, setCreateForm] = useState({
    agentAddress: '',
    initialDeposit: '',
    coinObjectId: '',
  });

  // Deposit/Withdraw state
  const [depositForm, setDepositForm] = useState({ coinObjectId: '', amount: '' });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '' });

  // Constraint editing state
  const [isEditingConstraints, setIsEditingConstraints] = useState(false);
  const [constraintForm, setConstraintForm] = useState({
    dailyLimit: '',
    perTxLimit: '',
    alertThreshold: '',
    minBalance: '',
    yieldEnabled: false,
  });
  const [newAgentAddress, setNewAgentAddress] = useState('');

  // Payment state
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({ recipient: '', amount: '' });
  const [paymentValidation, setPaymentValidation] = useState<PaymentValidation | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Array<{
    digest: string;
    amount: string;
    recipient: string;
    status: 'success' | 'rejected' | 'alert';
    timestamp: number;
  }>>([]);

  // Transaction history
  const [txHistory, setTxHistory] = useState<Array<{ digest: string; type: string; amount: string; timestamp: number }>>([]);

  // ============================================================================
  // ENS INTEGRATION STATE
  // ============================================================================

  // ENS resolution for agent address (Create Vault & Change Agent)
  const agentENSResolution = useENSResolution(createForm.agentAddress, { debounceMs: 600 });
  const newAgentENSResolution = useENSResolution(newAgentAddress, { debounceMs: 600 });

  // ENS resolution for payment recipient
  const recipientENSResolution = useENSResolution(paymentForm.recipient, { debounceMs: 600 });

  // ENS Constraint Profile loading
  const ensConstraintProfile = useENSConstraintProfile();
  const [selectedProfileKey, setSelectedProfileKey] = useState<string>('');
  const [customProfileENS, setCustomProfileENS] = useState('');

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const withLoading = useCallback(async (key: string, task: () => Promise<void>) => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await task();
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied to clipboard', 'success');
    } catch {
      notify('Failed to copy', 'error');
    }
  }, [notify]);

  // Fetch user's coins from wallet
  const fetchUserCoins = useCallback(async () => {
    if (!account?.address) {
      setUserCoins([]);
      return;
    }

    setLoadingCoins(true);
    try {
      const allCoins: UserCoin[] = [];
      let cursor: string | null = null;

      // Fetch all coins (paginated)
      do {
        const response = await suiClient.getAllCoins({
          owner: account.address,
          cursor: cursor ?? undefined,
        });

        for (const coin of response.data) {
          allCoins.push({
            objectId: coin.coinObjectId,
            coinType: coin.coinType,
            balance: coin.balance,
            symbol: getCoinSymbol(coin.coinType),
          });
        }

        cursor = response.nextCursor ?? null;
      } while (cursor);

      // Sort by balance (highest first)
      allCoins.sort((a, b) => {
        const balA = BigInt(a.balance);
        const balB = BigInt(b.balance);
        return balB > balA ? 1 : balB < balA ? -1 : 0;
      });

      setUserCoins(allCoins);
    } catch (err) {
      console.error('Failed to fetch coins:', err);
      notify('Failed to load wallet coins', 'error');
    } finally {
      setLoadingCoins(false);
    }
  }, [account?.address, suiClient, notify]);

  // Load user coins when account changes
  useEffect(() => {
    fetchUserCoins();
  }, [fetchUserCoins]);

  // Auto-select first DEEP coin for swap fees when coins are loaded
  useEffect(() => {
    if (userCoins.length > 0 && !swapForm.deepCoinId) {
      const deepCoin = userCoins.find((c) => c.symbol === 'DEEP');
      if (deepCoin) {
        setSwapForm((f) => ({ ...f, deepCoinId: deepCoin.objectId }));
      }
    }
  }, [userCoins, swapForm.deepCoinId]);

  // ============================================================================
  // API CALLS
  // ============================================================================

  const loadVaultStatus = useCallback(async () => {
    if (!vaultId) return;
    await withLoading('status', async () => {
      const result = await fetchJson<VaultStatus>(`${API_BASE}/api/vault/${vaultId}/status`);
      if (result.ok && result.data) {
        setStatus(result.data);
      } else {
        notify(result.error || 'Failed to load vault status', 'error');
      }
    });
  }, [vaultId, withLoading, notify]);

  const loadVault = useCallback(async () => {
    if (!vaultId) return;
    await withLoading('vault', async () => {
      const result = await fetchJson<{ vault: VaultData }>(`${API_BASE}/api/vault/${vaultId}`);
      if (result.ok && result.data) {
        setVault(result.data.vault);
        await loadVaultStatus();
      } else {
        notify(result.error || 'Failed to load vault', 'error');
      }
    });
  }, [vaultId, withLoading, notify, loadVaultStatus]);

  const loadUserVaults = useCallback(async () => {
    if (!account?.address) return;
    await withLoading('userVaults', async () => {
      const result = await fetchJson<{ vaults: Array<{ id: string }> }>(`${API_BASE}/api/vault/owner/${account.address}`);
      if (result.ok && result.data) {
        setUserVaults(result.data.vaults.map((v) => v.id));
      }
    });
  }, [account?.address, withLoading]);

  const loadAvailablePools = useCallback(async () => {
    const result = await fetchJson<{ pools: PoolInfo[] }>(`${API_BASE}/api/swap/pools`);
    if (result.ok && result.data) {
      setAvailablePools(result.data.pools);
      // Auto-select first pool if none selected
      if (result.data.pools.length > 0 && !swapForm.poolId) {
        setSwapForm((f) => ({ ...f, poolId: result.data!.pools[0].id }));
      }
    }
  }, [swapForm.poolId]);

  const fetchQuote = useCallback(async () => {
    if (!swapForm.poolId || !swapForm.amount) {
      setQuote(null);
      return;
    }
    const result = await fetchJson<{ quote: QuoteResult }>(
      `${API_BASE}/api/swap/quote?poolId=${swapForm.poolId}&quantity=${parseAmount(swapForm.amount)}&isBid=${swapForm.direction === 'buy'}`
    );
    if (result.ok && result.data) {
      setQuote(result.data.quote);
      // Auto-set minOut with 2% slippage
      if (result.data.quote.estimatedOutput) {
        const minOut = Math.floor(parseInt(result.data.quote.estimatedOutput) * 0.98);
        setSwapForm((f) => ({ ...f, minOut: formatAmount(minOut.toString()) }));
      }
    } else {
      setQuote(null);
    }
  }, [swapForm.poolId, swapForm.amount, swapForm.direction]);

  const parseIntent = useCallback(async () => {
    await withLoading('intent', async () => {
      const result = await fetchJson<IntentResult>(`${API_BASE}/api/vault/parse-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent }),
      });
      if (result.ok && result.data) {
        setIntentResult(result.data);
        notify('Intent parsed successfully', 'success');
      } else {
        notify(result.error || 'Failed to parse intent', 'error');
      }
    });
  }, [intent, withLoading, notify]);

  const buildSwap = useCallback(async () => {
    if (!vaultId || !account?.address) {
      notify('Connect wallet and enter vault ID', 'error');
      return;
    }

    await withLoading('buildSwap', async () => {
      const result = await fetchJson<SwapBuildResult>(`${API_BASE}/api/swap/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId,
          poolId: swapForm.poolId,
          quantity: parseAmount(swapForm.amount),
          minOut: parseAmount(swapForm.minOut),
          isBid: swapForm.direction === 'buy',
          agentAddress: account.address,
          deepCoinId: swapForm.deepCoinId,
        }),
      });

      if (result.ok && result.data) {
        setSwapBuild(result.data);
        notify('Transaction built. Ready to execute.', 'success');
      } else {
        notify(result.error || 'Failed to build swap', 'error');
      }
    });
  }, [vaultId, account?.address, swapForm, withLoading, notify]);

  // ============================================================================
  // TRANSACTION EXECUTION
  // ============================================================================

  const executeSwap = useCallback(async () => {
    if (!swapBuild?.transaction || !account?.address) {
      notify('Build transaction first', 'error');
      return;
    }

    try {
      // Decode base64 transaction bytes
      const txBytes = Uint8Array.from(atob(swapBuild.transaction), (c) => c.charCodeAt(0));
      const tx = Transaction.from(txBytes);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            setLastTxDigest(result.digest);
            setTxHistory((prev) => [
              { digest: result.digest, type: 'swap', amount: swapForm.amount, timestamp: Date.now() },
              ...prev.slice(0, 9),
            ]);
            notify(`Swap executed! TX: ${result.digest.slice(0, 16)}...`, 'success');
            setSwapBuild(null);
            setSwapForm((prev) => ({ ...prev, amount: '', minOut: '' }));
            // Refresh vault status after short delay
            setTimeout(loadVault, 2000);
          },
          onError: (error) => {
            notify(`Transaction failed: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Failed to execute: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }, [swapBuild, account?.address, swapForm.amount, signAndExecute, notify, loadVault]);

  const executeCreateVault = useCallback(async () => {
    if (!intentResult?.parsed || !account?.address) {
      notify('Parse intent and connect wallet first', 'error');
      return;
    }

    if (!createForm.coinObjectId || !createForm.agentAddress) {
      notify('Enter agent address and coin object ID', 'error');
      return;
    }

    // Use ENS-resolved address if available
    const agentAddress = agentENSResolution.result?.success && agentENSResolution.result.address
      ? agentENSResolution.result.address
      : createForm.agentAddress;

    if (!isValidAddress(agentAddress)) {
      notify('Enter a valid agent address or ENS name', 'error');
      return;
    }

    // Find the selected coin to get its type
    const selectedCoin = userCoins.find((c) => c.objectId === createForm.coinObjectId);
    if (!selectedCoin) {
      notify('Selected coin not found. Please refresh and try again.', 'error');
      return;
    }

    try {
      const result = await fetchJson<{ transaction: string }>(`${API_BASE}/api/vault/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: account.address,
          agent: agentAddress, // Use resolved ENS address
          dailyLimit: intentResult.parsed.dailyLimit || 100_000_000,
          perTxLimit: intentResult.parsed.perTxLimit || 25_000_000,
          alertThreshold: intentResult.parsed.alertThreshold || 80_000_000,
          yieldEnabled: intentResult.parsed.yieldEnabled || false,
          minBalance: intentResult.parsed.minBalance || 10_000_000,
          coinObjectId: createForm.coinObjectId,
          assetType: selectedCoin.coinType, // Send the actual coin type to match the object
        }),
      });

      if (!result.ok || !result.data?.transaction) {
        notify(result.error || 'Failed to build vault creation', 'error');
        return;
      }

      const txBytes = Uint8Array.from(atob(result.data.transaction), (c) => c.charCodeAt(0));
      const tx = Transaction.from(txBytes);

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (txResult) => {
            notify(`Vault created! TX: ${txResult.digest.slice(0, 16)}...`, 'success');
            setTxHistory((prev) => [
              { digest: txResult.digest, type: 'create_vault', amount: createForm.initialDeposit, timestamp: Date.now() },
              ...prev.slice(0, 9),
            ]);
            setActiveTab('dashboard');
            loadUserVaults();
          },
          onError: (error) => {
            notify(`Failed to create vault: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [intentResult, account?.address, createForm, userCoins, signAndExecute, notify, loadUserVaults, agentENSResolution.result]);

  const executeDeposit = useCallback(async () => {
    if (!vaultId || !account?.address || !depositForm.coinObjectId || !vault) {
      notify('Enter coin object ID to deposit', 'error');
      return;
    }

    // Find the selected coin to get its type (should match vault's asset type)
    const selectedCoin = userCoins.find((c) => c.objectId === depositForm.coinObjectId);
    if (!selectedCoin) {
      notify('Selected coin not found', 'error');
      return;
    }

    // Use vault's asset type (the coin type must match for the deposit to work)
    const assetType = vault.assetType;

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${import.meta.env.VITE_PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434'}::vault::deposit`,
        typeArguments: [assetType],
        arguments: [
          tx.object(vaultId),
          tx.object(depositForm.coinObjectId),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (txResult) => {
            notify(`Deposit successful! TX: ${txResult.digest.slice(0, 16)}...`, 'success');
            setTxHistory((prev) => [
              { digest: txResult.digest, type: 'deposit', amount: 'N/A', timestamp: Date.now() },
              ...prev.slice(0, 9),
            ]);
            setDepositForm({ coinObjectId: '', amount: '' });
            setTimeout(loadVault, 2000);
          },
          onError: (error) => {
            notify(`Deposit failed: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [vaultId, account?.address, depositForm, vault, userCoins, signAndExecute, notify, loadVault]);

  const executeWithdraw = useCallback(async () => {
    if (!vaultId || !account?.address || !withdrawForm.amount || !vault) {
      notify('Enter amount to withdraw', 'error');
      return;
    }

    try {
      const assetType = vault.assetType;
      const decimals = getCoinDecimals(assetType);
      const amountRaw = parseAmount(withdrawForm.amount, decimals);

      const tx = new Transaction();
      tx.moveCall({
        target: `${import.meta.env.VITE_PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434'}::vault::withdraw`,
        typeArguments: [assetType],
        arguments: [
          tx.object(vaultId),
          tx.pure.u64(BigInt(amountRaw)),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (txResult) => {
            notify(`Withdrawal successful! TX: ${txResult.digest.slice(0, 16)}...`, 'success');
            setTxHistory((prev) => [
              { digest: txResult.digest, type: 'withdraw', amount: withdrawForm.amount, timestamp: Date.now() },
              ...prev.slice(0, 9),
            ]);
            setWithdrawForm({ amount: '' });
            setTimeout(loadVault, 2000);
          },
          onError: (error) => {
            notify(`Withdrawal failed: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [vaultId, account?.address, withdrawForm, vault, signAndExecute, notify, loadVault]);

  // Validate payment against constraints in real-time
  const validatePayment = useCallback((amount: string): PaymentValidation => {
    const validation: PaymentValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      willTriggerAlert: false,
      remainingAfterPayment: '0',
      exceedsPerTx: false,
      exceedsDaily: false,
    };

    if (!vault || !status?.status) {
      validation.isValid = false;
      validation.errors.push('No vault loaded');
      return validation;
    }

    const amountNum = parseFloat(amount || '0');
    if (isNaN(amountNum) || amountNum <= 0) {
      validation.isValid = false;
      validation.errors.push('Enter a valid amount');
      return validation;
    }

    const decimals = getCoinDecimals(vault.assetType);
    const amountMist = BigInt(parseAmount(amount, decimals));
    const perTxLimit = BigInt(vault.constraints.perTxLimit);
    const dailyLimit = BigInt(vault.constraints.dailyLimit);
    const spentToday = BigInt(vault.spentToday);
    const remainingDaily = dailyLimit - spentToday;
    const alertThreshold = BigInt(vault.constraints.alertThreshold);
    const balance = BigInt(vault.balance);

    // Check per-transaction limit
    if (amountMist > perTxLimit) {
      validation.isValid = false;
      validation.exceedsPerTx = true;
      validation.errors.push(`Exceeds per-transaction limit (${formatAmount(vault.constraints.perTxLimit, decimals)})`);
    }

    // Check daily remaining
    if (amountMist > remainingDaily) {
      validation.isValid = false;
      validation.exceedsDaily = true;
      validation.errors.push(`Exceeds remaining daily limit (${formatAmount(remainingDaily.toString(), decimals)})`);
    }

    // Check balance
    if (amountMist > balance) {
      validation.isValid = false;
      validation.errors.push(`Insufficient balance (${formatAmount(vault.balance, decimals)})`);
    }

    // Check if it will trigger alert
    if (amountMist >= alertThreshold) {
      validation.willTriggerAlert = true;
      validation.warnings.push(`Will trigger alert (threshold: ${formatAmount(vault.constraints.alertThreshold, decimals)})`);
    }

    // Calculate remaining after payment
    const remainingAfter = remainingDaily - amountMist;
    validation.remainingAfterPayment = remainingAfter > 0n ? formatAmount(remainingAfter.toString(), decimals) : '0';

    return validation;
  }, [vault, status]);

  // Update validation when payment form changes
  useEffect(() => {
    if (paymentForm.amount) {
      const validation = validatePayment(paymentForm.amount);
      setPaymentValidation(validation);
    } else {
      setPaymentValidation(null);
    }
  }, [paymentForm.amount, validatePayment]);

  // Execute payment transaction
  const executePayment = useCallback(async () => {
    if (!vaultId || !account?.address || !paymentForm.recipient || !paymentForm.amount) {
      notify('Fill in all payment details', 'error');
      return;
    }

    // Use ENS-resolved address if available, otherwise use raw input
    const recipientAddress = recipientENSResolution.result?.success && recipientENSResolution.result.address
      ? recipientENSResolution.result.address
      : paymentForm.recipient;

    // Validate that we have a valid address
    if (!isValidAddress(recipientAddress)) {
      notify('Invalid recipient address. Please use a valid address or ENS name.', 'error');
      return;
    }

    const validation = validatePayment(paymentForm.amount);
    if (!validation.isValid) {
      notify(`Payment rejected: ${validation.errors[0]}`, 'error');
      setPaymentHistory((prev) => [{
        digest: 'rejected',
        amount: paymentForm.amount,
        recipient: recipientENSResolution.result?.ensName || paymentForm.recipient,
        status: 'rejected',
        timestamp: Date.now(),
      }, ...prev.slice(0, 9)]);
      return;
    }

    try {
      const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434';
      const assetType = vault?.assetType || '0x2::sui::SUI';
      const decimals = getCoinDecimals(assetType);
      const amountMist = parseAmount(paymentForm.amount, decimals);

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::vault::execute_payment`,
        typeArguments: [assetType],
        arguments: [
          tx.object(vaultId),
          tx.pure.address(recipientAddress), // Use resolved ENS address
          tx.pure.u64(BigInt(amountMist)),
          tx.object('0x6'), // Clock object
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (txResult) => {
            const statusType = validation.willTriggerAlert ? 'alert' : 'success';
            const msg = validation.willTriggerAlert 
              ? `⚠️ Payment sent with ALERT! TX: ${txResult.digest.slice(0, 16)}...`
              : `✓ Payment successful! TX: ${txResult.digest.slice(0, 16)}...`;
            notify(msg, statusType === 'alert' ? 'info' : 'success');
            
            // Show ENS name in history if available
            const displayRecipient = recipientENSResolution.result?.ensName || paymentForm.recipient;

            setPaymentHistory((prev) => [{
              digest: txResult.digest,
              amount: paymentForm.amount,
              recipient: displayRecipient,
              status: statusType as 'success' | 'alert',
              timestamp: Date.now(),
            }, ...prev.slice(0, 9)]);

            setTxHistory((prev) => [
              { digest: txResult.digest, type: 'payment', amount: paymentForm.amount, timestamp: Date.now() },
              ...prev.slice(0, 9),
            ]);

            setPaymentForm({ recipient: '', amount: '' });
            setTimeout(loadVault, 2000);
          },
          onError: (error) => {
            notify(`Payment failed: ${error.message}`, 'error');
            const displayRecipient = recipientENSResolution.result?.ensName || paymentForm.recipient;
            setPaymentHistory((prev) => [{
              digest: 'failed',
              amount: paymentForm.amount,
              recipient: displayRecipient,
              status: 'rejected',
              timestamp: Date.now(),
            }, ...prev.slice(0, 9)]);
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [vaultId, account?.address, paymentForm, vault, signAndExecute, notify, loadVault, validatePayment, recipientENSResolution.result]);

  // Initialize constraint form when vault loads
  useEffect(() => {
    if (vault && !isEditingConstraints) {
      const decimals = getCoinDecimals(vault.assetType);
      setConstraintForm({
        dailyLimit: formatAmount(vault.constraints.dailyLimit, decimals),
        perTxLimit: formatAmount(vault.constraints.perTxLimit, decimals),
        alertThreshold: formatAmount(vault.constraints.alertThreshold, decimals),
        minBalance: formatAmount(vault.constraints.minBalance, decimals),
        yieldEnabled: vault.constraints.yieldEnabled,
      });
    }
  }, [vault, isEditingConstraints]);

  // Execute update constraints transaction
  const executeUpdateConstraints = useCallback(async () => {
    if (!vaultId || !account?.address || !vault) {
      notify('Load vault first', 'error');
      return;
    }

    if (account.address !== vault.owner) {
      notify('Only the vault owner can update constraints', 'error');
      return;
    }

    try {
      const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434';
      const assetType = vault.assetType;
      const decimals = getCoinDecimals(assetType);

      const dailyLimit = parseAmount(constraintForm.dailyLimit, decimals);
      const perTxLimit = parseAmount(constraintForm.perTxLimit, decimals);
      const alertThreshold = parseAmount(constraintForm.alertThreshold, decimals);
      const minBalance = parseAmount(constraintForm.minBalance, decimals);

      // Validation
      if (BigInt(perTxLimit) > BigInt(dailyLimit)) {
        notify('Per-transaction limit cannot exceed daily limit', 'error');
        return;
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::vault::update_constraints`,
        typeArguments: [assetType],
        arguments: [
          tx.object(vaultId),
          tx.pure.u64(BigInt(dailyLimit)),
          tx.pure.u64(BigInt(perTxLimit)),
          tx.pure.u64(BigInt(alertThreshold)),
          tx.pure.bool(constraintForm.yieldEnabled),
          tx.pure.u64(BigInt(minBalance)),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (txResult) => {
            notify(`Constraints updated! TX: ${txResult.digest.slice(0, 16)}...`, 'success');
            setTxHistory((prev) => [
              { digest: txResult.digest, type: 'update_constraints', amount: '', timestamp: Date.now() },
              ...prev.slice(0, 9),
            ]);
            setIsEditingConstraints(false);
            setTimeout(loadVault, 2000);
          },
          onError: (error) => {
            notify(`Failed to update constraints: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [vaultId, account?.address, vault, constraintForm, signAndExecute, notify, loadVault]);

  // Execute pause/unpause transaction
  const executeSetPaused = useCallback(async (paused: boolean) => {
    if (!vaultId || !account?.address || !vault) {
      notify('Load vault first', 'error');
      return;
    }

    if (account.address !== vault.owner) {
      notify('Only the vault owner can pause/unpause', 'error');
      return;
    }

    try {
      const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434';
      const assetType = vault.assetType;

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::vault::set_paused`,
        typeArguments: [assetType],
        arguments: [
          tx.object(vaultId),
          tx.pure.bool(paused),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (txResult) => {
            notify(`Vault ${paused ? 'paused' : 'unpaused'}! TX: ${txResult.digest.slice(0, 16)}...`, 'success');
            setTxHistory((prev) => [
              { digest: txResult.digest, type: paused ? 'pause' : 'unpause', amount: '', timestamp: Date.now() },
              ...prev.slice(0, 9),
            ]);
            setTimeout(loadVault, 2000);
          },
          onError: (error) => {
            notify(`Failed to ${paused ? 'pause' : 'unpause'} vault: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [vaultId, account?.address, vault, signAndExecute, notify, loadVault]);

  // Execute change agent transaction
  const executeSetAgent = useCallback(async () => {
    if (!vaultId || !account?.address || !vault) {
      notify('Load vault first', 'error');
      return;
    }

    if (account.address !== vault.owner) {
      notify('Only the vault owner can change the agent', 'error');
      return;
    }

    // Use ENS-resolved address if available
    const agentAddress = newAgentENSResolution.result?.success && newAgentENSResolution.result.address
      ? newAgentENSResolution.result.address
      : newAgentAddress;

    if (!isValidAddress(agentAddress)) {
      notify('Enter a valid agent address or ENS name', 'error');
      return;
    }

    try {
      const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434';
      const assetType = vault.assetType;

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::vault::set_agent`,
        typeArguments: [assetType],
        arguments: [
          tx.object(vaultId),
          tx.pure.address(agentAddress), // Use resolved ENS address
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (txResult) => {
            notify(`Agent updated! TX: ${txResult.digest.slice(0, 16)}...`, 'success');
            setTxHistory((prev) => [
              { digest: txResult.digest, type: 'set_agent', amount: '', timestamp: Date.now() },
              ...prev.slice(0, 9),
            ]);
            setNewAgentAddress('');
            setTimeout(loadVault, 2000);
          },
          onError: (error) => {
            notify(`Failed to update agent: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [vaultId, account?.address, vault, newAgentAddress, newAgentENSResolution.result, signAndExecute, notify, loadVault]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    if (account?.address) {
      loadUserVaults();
    }
  }, [account?.address, loadUserVaults]);

  useEffect(() => {
    if (vaultId) {
      loadVault();
    }
  }, [vaultId, loadVault]);

  // Auto-refresh vault data
  useEffect(() => {
    if (!vaultId) return;
    const interval = setInterval(loadVault, 15000);
    return () => clearInterval(interval);
  }, [vaultId, loadVault]);

  // Load available pools on mount
  useEffect(() => {
    loadAvailablePools();
  }, [loadAvailablePools]);

  // Debounced quote fetch when swap inputs change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (swapForm.amount && swapForm.poolId) {
        fetchQuote();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [swapForm.amount, swapForm.poolId, swapForm.direction, fetchQuote]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const stats = useMemo(() => {
    if (!status?.status || !vault) return null;
    const s = status.status;
    const decimals = getCoinDecimals(vault.assetType);
    const symbol = getCoinSymbol(vault.assetType);

    return {
      daily: `${formatAmount(vault.constraints.dailyLimit, decimals)} ${symbol}`,
      perTx: `${formatAmount(vault.constraints.perTxLimit, decimals)} ${symbol}`,
      spent: `${formatAmount(vault.spentToday, decimals)} ${symbol}`,
      remaining: `${formatAmount((BigInt(vault.constraints.dailyLimit || '0') - BigInt(vault.spentToday || '0')).toString(), decimals)} ${symbol}`,
      usage: s.limits.dailyUsagePercent ?? 0,
      balance: `${formatAmount(vault.balance, decimals)} ${symbol}`,
      txCount: s.spending.txCount,
    };
  }, [status, vault]);

  const usageColor = useMemo(() => {
    if (!stats) return '#0e0e10';
    if (stats.usage >= 90) return '#ef4444';
    if (stats.usage >= 70) return '#f59e0b';
    return '#84cc16';
  }, [stats]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="page">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <span className="logo">AgentVault</span>
          <div className="powered-by">
            <span className="powered-label">Powered by</span>
            <div className="chain-logos">
              <img src={SUI_LOGO} alt="Sui" className="chain-logo" title="Built on Sui" />
              <span className="chain-plus">+</span>
              <img src={ENS_LOGO} alt="ENS" className="chain-logo" title="ENS Integration" />
            </div>
          </div>
        </div>
        <div className="header-center">
          <span className="network-badge sui-badge">
            <img src={SUI_LOGO} alt="" className="badge-icon" />
            Sui Testnet
          </span>
          <span className="network-badge ens-badge">
            <img src={ENS_LOGO} alt="" className="badge-icon" />
            ENS Mainnet
          </span>
        </div>
        <div className="header-right">
          <ConnectButton />
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          {/* <div className="hero-badges">
            <span className="hero-badge sui">
              <img src={SUI_LOGO} alt="" />
              Sui
            </span>
            <span className="hero-badge ens">
              <img src={ENS_LOGO} alt="" />
              ENS
            </span>
          </div> */}
          <span className="eyebrow">Constrained Agent Spending on Sui + ENS</span>
          <h1>
            Give your AI a wallet.
            <br />
            <span className="highlight">With limits.</span>
          </h1>
          <p className="lead">
            AgentVault lets autonomous agents trade and spend within hard, on-chain constraints.
            Daily caps. Per-transaction limits. <strong>ENS-powered profiles.</strong> No trust required.
          </p>
          {!account && (
            <div className="hero-cta">
              <ConnectButton />
              <span className="cta-hint">Connect wallet to get started</span>
            </div>
          )}
        </div>

        {/* Stats Panel */}
        {stats && (
          <div className="hero-panel">
            <div className="panel-header">
              <span>Vault Status</span>
              <button className="btn-icon" onClick={loadVault} disabled={loading.vault}>
                {loading.vault ? '...' : '↻'}
              </button>
            </div>
            <div className="panel-row">
              <div>
                <div className="meta-label">Daily Limit</div>
                <div className="panel-value">{stats.daily}</div>
              </div>
              <div>
                <div className="meta-label">Per Trade</div>
                <div className="panel-value">{stats.perTx}</div>
              </div>
            </div>
            <div className="panel-row">
              <div>
                <div className="meta-label">Spent Today</div>
                <div className="panel-value">{stats.spent}</div>
              </div>
              <div>
                <div className="meta-label">Remaining</div>
                <div className="panel-value" style={{ color: usageColor }}>{stats.remaining}</div>
              </div>
            </div>
            <div className="panel-bar" style={{ borderColor: usageColor }}>
              <div className="bar-fill" style={{ width: `${stats.usage}%`, background: usageColor }} />
            </div>
            <div className="panel-foot">
              Balance: {stats.balance} · {stats.txCount} transactions
            </div>
          </div>
        )}
      </section>

      {/* Feature Cards */}
      <section className="bento">
        {featureCards.map((card) => (
          <article key={card.title} className="brut-card" style={{ background: card.color }}>
            <div className="card-body">
              <div className="card-title-row">
                {card.icon && <img src={card.icon} alt="" className="card-feature-icon" />}
                <h3>{card.title}</h3>
              </div>
              <p>{card.text}</p>
            </div>
          </article>
        ))}
      </section>

      {/* Navigation Tabs */}
      <nav className="tabs">
        {(['dashboard', 'pay', 'swap', 'create', 'manage'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''} ${tab === 'pay' ? 'tab-primary' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'pay' ? '💸 Pay' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* ==================== DASHBOARD TAB ==================== */}
        {activeTab === 'dashboard' && (
          <section className="grid">
            <div className="grid-card">
              <div className="card-head">
                <h2>Select Vault</h2>
              </div>
              <label className="field">
                Vault ID
                <input
                  value={vaultId}
                  onChange={(e) => setVaultId(e.target.value)}
                  placeholder="0x..."
                />
              </label>
              <button className="btn primary" onClick={loadVault} disabled={loading.vault || !vaultId}>
                {loading.vault ? 'Loading...' : 'Load Vault'}
              </button>

              {userVaults.length > 0 && (
                <div className="vault-list">
                  <div className="meta-label">Your Vaults</div>
                  {userVaults.map((id) => (
                    <button
                      key={id}
                      className="vault-item"
                      onClick={() => setVaultId(id)}
                    >
                      {truncateAddress(id)}
                    </button>
                  ))}
                </div>
              )}

              {vault && (
                <div className="vault-details">
                  <div className="detail-row">
                    <span className="meta-label">Owner</span>
                    <span className="detail-value">{truncateAddress(vault.owner)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="meta-label">Agent</span>
                    <span className="detail-value">{truncateAddress(vault.agent)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="meta-label">Balance</span>
                    <span className="detail-value token-balance">
                      {getTokenIcon(getCoinSymbol(vault.assetType)) && (
                        <img
                          src={getTokenIcon(getCoinSymbol(vault.assetType)) || ''}
                          alt={getCoinSymbol(vault.assetType)}
                          className="token-icon-small"
                        />
                      )}
                      {formatAmount(vault.balance, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="meta-label">Asset Type</span>
                    <span className="detail-value asset-type">{getCoinSymbol(vault.assetType)}</span>
                  </div>
                  <div className="link-row">
                    <a href={explorerUrl('object', vaultId)} target="_blank" rel="noreferrer" className="link">
                      View on Explorer ↗
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="grid-card">
              <div className="card-head">
                <h2>Recent Activity</h2>
              </div>
              {txHistory.length === 0 ? (
                <p className="muted">No transactions yet</p>
              ) : (
                <ul className="activity">
                  {txHistory.map((tx) => (
                    <li key={tx.digest}>
                      <span>
                        <span className={`dot ${tx.type === 'swap' ? 'green' : 'amber'}`} />
                        {tx.type === 'swap' ? 'Swap' : 'Create Vault'}
                      </span>
                      <a href={explorerUrl('txblock', tx.digest)} target="_blank" rel="noreferrer" className="link">
                        {truncateAddress(tx.digest)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {lastTxDigest && (
                <div className="success-banner">
                  <span>Last TX: {truncateAddress(lastTxDigest)}</span>
                  <a href={explorerUrl('txblock', lastTxDigest)} target="_blank" rel="noreferrer" className="btn small">
                    View ↗
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==================== SWAP TAB ==================== */}
        {activeTab === 'swap' && (
          <section className="grid">
            <div className="grid-card">
              <div className="card-head">
                <h2>Execute Swap</h2>
              </div>

              {!account ? (
                <div className="warning-banner">
                  <p>Connect your wallet to execute swaps</p>
                  <ConnectButton />
                </div>
              ) : !vaultId ? (
                <div className="warning-banner">
                  <p>Select a vault first from the Dashboard tab</p>
                  <button className="btn small" onClick={() => setActiveTab('dashboard')}>
                    Go to Dashboard
                  </button>
                </div>
              ) : (
                <>
                  <div className="swap-direction">
                    <button
                      className={`direction-btn ${swapForm.direction === 'buy' ? 'active' : ''}`}
                      onClick={() => setSwapForm((f) => ({ ...f, direction: 'buy' }))}
                    >
                      Buy SUI
                    </button>
                    <button
                      className={`direction-btn ${swapForm.direction === 'sell' ? 'active' : ''}`}
                      onClick={() => setSwapForm((f) => ({ ...f, direction: 'sell' }))}
                    >
                      Sell SUI
                    </button>
                  </div>

                  <label className="field">
                    Amount (USDC)
                    <input
                      type="number"
                      value={swapForm.amount}
                      onChange={(e) => setSwapForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="10.00"
                    />
                  </label>

                  <label className="field">
                    Minimum Output (slippage protection)
                    <input
                      type="number"
                      value={swapForm.minOut}
                      onChange={(e) => setSwapForm((f) => ({ ...f, minOut: e.target.value }))}
                      placeholder="9.50"
                    />
                  </label>

                  <label className="field">
                    DeepBook Pool
                    {(() => {
                      const compatiblePools = availablePools.filter((pool) => {
                        if (!vault?.assetType) return true;
                        return normalizeType(pool.quoteAsset) === normalizeType(vault.assetType);
                      });

                      if (vault?.assetType && compatiblePools.length === 0) {
                        return (
                          <div className="coin-empty">
                            <div>
                              <strong>No compatible pools</strong>
                              <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                                Your vault uses: {getCoinSymbol(vault.assetType)} ({truncateAddress(vault.assetType)})
                              </div>
                              <div style={{ fontSize: '0.75rem', marginTop: '4px', color: '#666' }}>
                                DeepBook pools support: SUI, DBUSDC (0xf7152c05...), DEEP
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <select
                          value={swapForm.poolId}
                          onChange={(e) => setSwapForm((f) => ({ ...f, poolId: e.target.value }))}
                          className="select-input"
                        >
                          <option value="">Select a pool...</option>
                          {compatiblePools.map((pool) => (
                            <option key={pool.id} value={pool.id}>
                              {pool.baseName}/{pool.quoteName} ({pool.pair})
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                    {vault?.assetType && availablePools.some((p) => normalizeType(p.quoteAsset) === normalizeType(vault.assetType)) && (
                      <span className="field-hint">
                        Showing pools compatible with your vault ({getCoinSymbol(vault.assetType)} vault)
                      </span>
                    )}
                  </label>

                  {quote && (
                    <div className="quote-display">
                      <div className="quote-header">Estimated Output</div>
                      <div className="quote-value">{formatAmount(quote.estimatedOutput)} {quote.pool?.baseName}</div>
                      <div className="quote-details">
                        <span>Price: {parseFloat(quote.midPrice).toFixed(6)}</span>
                        <span>Impact: {quote.priceImpact}</span>
                        <span>Fee: ~{formatAmount(quote.estimatedFee)}</span>
                      </div>
                    </div>
                  )}

                  <label className="field">
                    DEEP Coin (for fees)
                    {loadingCoins ? (
                      <div className="coin-loading">Loading...</div>
                    ) : (
                      <select
                        value={swapForm.deepCoinId}
                        onChange={(e) => setSwapForm((f) => ({ ...f, deepCoinId: e.target.value }))}
                        className="coin-select"
                      >
                        <option value="">-- Select DEEP coin --</option>
                        {userCoins
                          .filter((c) => c.symbol === 'DEEP')
                          .map((coin) => (
                            <option key={coin.objectId} value={coin.objectId}>
                              DEEP - {formatAmount(coin.balance, getCoinDecimals(coin.coinType))} ({truncateAddress(coin.objectId)})
                            </option>
                          ))}
                      </select>
                    )}
                    <span className="field-hint">
                      {userCoins.filter((c) => c.symbol === 'DEEP').length === 0
                        ? 'No DEEP tokens found. Get DEEP from a faucet or swap.'
                        : 'Required for DeepBook trading fees'}
                    </span>
                  </label>

                  <div className="btn-group">
                    <button
                      className="btn"
                      onClick={buildSwap}
                      disabled={loading.buildSwap || !swapForm.amount}
                    >
                      {loading.buildSwap ? 'Building...' : '1. Build Transaction'}
                    </button>

                    <button
                      className="btn primary"
                      onClick={executeSwap}
                      disabled={isExecuting || !swapBuild}
                    >
                      {isExecuting ? 'Executing...' : '2. Sign & Execute'}
                    </button>
                  </div>

                  {swapBuild && (
                    <div className="tx-preview">
                      <div className="meta-label">Transaction Ready</div>
                      <div className="preview-stats">
                        <span>Balance: {formatAmount(swapBuild.vaultState.currentBalance)}</span>
                        <span>Remaining Daily: {formatAmount(swapBuild.vaultState.remainingDaily)}</span>
                      </div>
                      <button className="btn small ghost" onClick={() => copyToClipboard(swapBuild.transaction)}>
                        Copy TX Bytes
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid-card">
              <div className="card-head">
                <h2>Swap Info</h2>
              </div>
              <div className="info-block">
                <h4>How it works</h4>
                <ol>
                  <li>Enter amount you want to swap</li>
                  <li>Set minimum output for slippage protection</li>
                  <li>Build the transaction (validates constraints)</li>
                  <li>Sign with your wallet and execute on-chain</li>
                </ol>
              </div>
              <div className="info-block">
                <h4>Requirements</h4>
                <ul>
                  <li>Your wallet must be the vault's agent</li>
                  <li>Amount must be within per-tx limit</li>
                  <li>Must not exceed daily spending limit</li>
                  <li>Must maintain minimum balance</li>
                  <li>Need DEEP tokens for DeepBook fees</li>
                </ul>
              </div>
              <div className="info-block">
                <h4>Supported Assets for Swaps</h4>
                <ul>
                  <li><strong>SUI</strong> - Native Sui token (0x2::sui::SUI)</li>
                  <li><strong>DBUSDC</strong> - DeepBook testnet stablecoin (0xf7152c05...)</li>
                  <li><strong>DEEP</strong> - DeepBook token (0x36dbef86...)</li>
                </ul>
                <p style={{ fontSize: '0.8rem', marginTop: '8px', color: '#666' }}>
                  Create a vault with <strong>SUI</strong> or <strong>DBUSDC</strong> to use DeepBook swaps.
                  Other USDC contracts are NOT compatible with DeepBook pools.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==================== CREATE TAB ==================== */}
        {activeTab === 'create' && (
          <section className="grid create-section">
            {/* Left Column - ENS Profiles + Intent */}
            <div className="grid-card">
              <div className="card-head">
                <h2>
                  <img src={ENS_LOGO} alt="ENS" className="card-head-icon" />
                  Load ENS Profile
                </h2>
                <span className="card-badge ens-badge-small">ENS Powered</span>
              </div>

              {/* ENS Profile Selector */}
              <div className="ens-profile-section">
                <div className="ens-profile-header">
                  <span className="meta-label">Select a Constraint Profile from ENS</span>
                </div>

                {/* Preset Profiles */}
                <div className="ens-profile-grid">
                  {Object.entries(DEMO_CONSTRAINT_PROFILES).map(([key, profile]) => (
                    <button
                      key={key}
                      type="button"
                      className={`ens-profile-card ${selectedProfileKey === key ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedProfileKey(key);
                        setIntentResult({
                          success: true,
                          parsed: {
                            dailyLimit: (profile.dailyLimit || 100) * 1_000_000_000,
                            perTxLimit: (profile.perTxLimit || 25) * 1_000_000_000,
                            alertThreshold: (profile.alertThreshold || 80) * 1_000_000_000,
                            minBalance: (profile.minBalance || 10) * 1_000_000_000,
                            yieldEnabled: profile.yieldEnabled,
                          },
                          formatted: `Daily: ${profile.dailyLimit}\nPer-TX: ${profile.perTxLimit}\nAlert: ${profile.alertThreshold}\nMin Balance: ${profile.minBalance}`,
                          confidence: '100%',
                        });
                        notify(`Loaded "${key}" profile from ENS`, 'success');
                      }}
                    >
                      <div className="ens-profile-name">
                        <img src={ENS_LOGO} alt="" className="ens-mini-icon" />
                        {profile.name}
                      </div>
                      <div className="ens-profile-limits">
                        <span>Daily: {profile.dailyLimit}</span>
                        <span>Per-TX: {profile.perTxLimit}</span>
                      </div>
                      <div className="ens-profile-desc">{profile.description}</div>
                      {selectedProfileKey === key && <span className="ens-profile-check">Loaded</span>}
                    </button>
                  ))}
                </div>

                {/* Custom ENS Profile Input */}
                <div className="ens-custom-profile">
                  <label className="field">
                    Or load from custom ENS name
                    <div className="ens-input-wrapper">
                      <img src={ENS_LOGO} alt="" className="ens-input-icon" />
                      <input
                        type="text"
                        value={customProfileENS}
                        onChange={(e) => setCustomProfileENS(e.target.value)}
                        placeholder="yourprofile.eth"
                        className="ens-input"
                      />
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => ensConstraintProfile.load(customProfileENS)}
                        disabled={ensConstraintProfile.isLoading || !customProfileENS}
                      >
                        {ensConstraintProfile.isLoading ? '...' : 'Load'}
                      </button>
                    </div>
                    <span className="field-hint">
                      Load constraint presets stored in ENS text records
                    </span>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="section-divider">
                <span>OR</span>
              </div>

              {/* Manual Intent Parsing */}
              <div className="manual-intent-section">
                <div className="meta-label">Define constraints manually</div>
                <label className="field">
                  <textarea
                    value={intent}
                    onChange={(e) => {
                      setIntent(e.target.value);
                      setSelectedProfileKey(''); // Clear profile selection
                    }}
                    rows={2}
                    placeholder="e.g., Spend up to $100 per day, max $25 per trade"
                  />
                </label>
                <button className="btn" onClick={parseIntent} disabled={loading.intent}>
                  {loading.intent ? 'Parsing...' : 'Parse Intent'}
                </button>
              </div>

              {/* Result Preview */}
              {intentResult && (
                <div className={`intent-result ${selectedProfileKey ? 'ens-loaded' : ''}`}>
                  <div className="intent-result-header">
                    {selectedProfileKey && <img src={ENS_LOGO} alt="" className="ens-mini-icon" />}
                    <span className="meta-label">
                      {selectedProfileKey ? 'ENS Profile Loaded' : 'Parsed Constraints'}
                    </span>
                  </div>
                  <pre className="code">{intentResult.formatted}</pre>
                  <div className="confidence-badge" data-level={intentResult.confidence}>
                    {selectedProfileKey ? 'From ENS' : `Confidence: ${intentResult.confidence}`}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Create Vault */}
            <div className="grid-card">
              <div className="card-head">
                <h2>Create Vault</h2>
              </div>

              {!account ? (
                <div className="warning-banner">
                  <p>Connect wallet to create a vault</p>
                  <ConnectButton />
                </div>
              ) : !intentResult ? (
                <div className="warning-banner">
                  <p>Load an ENS profile or parse your intent first</p>
                </div>
              ) : (
                <>
                  {/* Agent Address with ENS Resolution */}
                  <label className="field">
                    <span className="field-label">
                      Agent Address
                      <span className="ens-support-badge">
                        <img src={ENS_LOGO} alt="" /> ENS Supported
                      </span>
                    </span>
                    <div className="ens-input-wrapper">
                      <input
                        value={createForm.agentAddress}
                        onChange={(e) => setCreateForm((f) => ({ ...f, agentAddress: e.target.value }))}
                        placeholder="0x... (SUI/ETH) or vitalik.eth"
                        className={agentENSResolution.result?.success ? 'ens-resolved' : ''}
                      />
                      {account?.address && (
                        <button
                          type="button"
                          className="btn-use-wallet"
                          title="Use connected wallet address"
                          onClick={() => setCreateForm((f) => ({ ...f, agentAddress: account.address }))}
                        >
                          My Wallet
                        </button>
                      )}
                      {agentENSResolution.isLoading && <span className="ens-loading">Resolving...</span>}
                    </div>

                    {/* ENS Resolution Result */}
                    {agentENSResolution.result?.success && (
                      <div className="ens-resolution-result success">
                        {agentENSResolution.result.avatar && (
                          <img src={agentENSResolution.result.avatar} alt="" className="ens-avatar" />
                        )}
                        <div className="ens-resolution-info">
                          {agentENSResolution.result.ensName && (
                            <span className="ens-name">{agentENSResolution.result.ensName}</span>
                          )}
                          <span className="ens-address">{formatAddress(agentENSResolution.result.address || '')}</span>
                        </div>
                        <span className="ens-verified">Verified</span>
                      </div>
                    )}
                    {agentENSResolution.error && (
                      <div className="ens-resolution-result error">
                        <span>{agentENSResolution.error}</span>
                      </div>
                    )}

                    <span className="field-hint">
                      Enter a SUI address, ENS name (like vitalik.eth), or Ethereum address
                    </span>
                  </label>

                  <label className="field">
                    Select Coin to Deposit
                    {loadingCoins ? (
                      <div className="coin-loading">Loading your coins...</div>
                    ) : userCoins.length === 0 ? (
                      <div className="coin-empty">
                        <span>No coins found in wallet</span>
                        <button type="button" className="btn small" onClick={fetchUserCoins}>
                          Refresh
                        </button>
                      </div>
                    ) : (
                      <div className="coin-selector-grid">
                        {userCoins.map((coin) => {
                          const isSelected = createForm.coinObjectId === coin.objectId;
                          const icon = getTokenIcon(coin.symbol);
                          return (
                            <button
                              key={coin.objectId}
                              type="button"
                              className={`coin-selector-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => setCreateForm((f) => ({ ...f, coinObjectId: coin.objectId }))}
                            >
                              <div className="coin-selector-icon">
                                {icon ? (
                                  <img src={icon} alt={coin.symbol} />
                                ) : (
                                  <span className="coin-fallback-icon">{coin.symbol.charAt(0)}</span>
                                )}
                              </div>
                              <div className="coin-selector-info">
                                <span className="coin-selector-symbol">{coin.symbol}</span>
                                <span className="coin-selector-balance">
                                  {formatAmount(coin.balance, getCoinDecimals(coin.coinType))}
                                </span>
                              </div>
                              {isSelected && <span className="coin-selector-check">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <span className="field-hint">
                      Choose from your wallet coins • <button type="button" className="link-btn" onClick={fetchUserCoins}>Refresh list</button>
                    </span>
                  </label>

                  {createForm.coinObjectId && (
                    <div className="selected-coin-preview">
                      {(() => {
                        const selectedCoin = userCoins.find((c) => c.objectId === createForm.coinObjectId);
                        if (!selectedCoin) return null;
                        const icon = getTokenIcon(selectedCoin.symbol);
                        return (
                          <div className="selected-coin-info">
                            {icon && <img src={icon} alt={selectedCoin.symbol} className="token-icon-small" />}
                            <span>
                              Creating vault with: <strong>{formatAmount(selectedCoin.balance, getCoinDecimals(selectedCoin.coinType))} {selectedCoin.symbol}</strong>
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <button
                    className="btn primary"
                    style={{marginTop:'8px'}}
                    onClick={executeCreateVault}
                    disabled={isExecuting || !createForm.agentAddress || !createForm.coinObjectId}
                  >
                    {isExecuting ? 'Creating...' : 'Create Vault'}
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {/* ==================== PAY TAB ==================== */}
        {activeTab === 'pay' && (
          <section className="grid pay-section">
            {/* Left Column - Payment Form */}
            <div className="grid-card payment-card">
              <div className="card-head">
                <h2>💸 Execute Payment</h2>
                <span className="card-badge">Agent Action</span>
              </div>

              {!account ? (
                <div className="warning-banner">
                  <p>Connect your wallet to execute payments</p>
                  <ConnectButton />
                </div>
              ) : !vaultId ? (
                <div className="warning-banner">
                  <p>Select a vault first from the Dashboard tab</p>
                  <button className="btn small" onClick={() => setActiveTab('dashboard')}>
                    Go to Dashboard
                  </button>
                </div>
              ) : !vault ? (
                <div className="warning-banner">
                  <p>Loading vault data...</p>
                </div>
              ) : account.address !== vault.agent ? (
                <div className="warning-banner warning-agent">
                  <p>⚠️ Only the vault's agent can execute payments</p>
                  <p className="field-hint">Agent: {truncateAddress(vault.agent)}</p>
                  <p className="field-hint">Your wallet: {truncateAddress(account.address)}</p>
                </div>
              ) : (
                <>
                  {/* Constraint Status Display */}
                  <div className="constraint-status">
                    <div className="constraint-header">
                      <div className="constraint-title-row">
                        {getTokenIcon(getCoinSymbol(vault.assetType)) && (
                          <img
                            src={getTokenIcon(getCoinSymbol(vault.assetType)) || ''}
                            alt={getCoinSymbol(vault.assetType)}
                            className="token-icon-small"
                          />
                        )}
                        <span className="constraint-title">Spending Limits ({getCoinSymbol(vault.assetType)})</span>
                      </div>
                      <button className="btn-icon small" onClick={loadVault} disabled={loading.vault}>
                        {loading.vault ? '...' : '↻'}
                      </button>
                    </div>
                    <div className="constraint-grid">
                      <div className="constraint-item">
                        <span className="constraint-label">Per Transaction</span>
                        <span className="constraint-value">{formatAmount(vault.constraints.perTxLimit, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}</span>
                      </div>
                      <div className="constraint-item">
                        <span className="constraint-label">Daily Limit</span>
                        <span className="constraint-value">{formatAmount(vault.constraints.dailyLimit, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}</span>
                      </div>
                      <div className="constraint-item">
                        <span className="constraint-label">Spent Today</span>
                        <span className="constraint-value spent">{formatAmount(vault.spentToday, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}</span>
                      </div>
                      <div className="constraint-item">
                        <span className="constraint-label">Remaining</span>
                        <span className="constraint-value remaining" style={{
                          color: BigInt(vault.constraints.dailyLimit || '0') - BigInt(vault.spentToday || '0') <= 0n ? '#ef4444' : '#84cc16'
                        }}>
                          {formatAmount((BigInt(vault.constraints.dailyLimit || '0') - BigInt(vault.spentToday || '0')).toString(), getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}
                        </span>
                      </div>
                    </div>
                    <div className="constraint-bar">
                      <div
                        className="constraint-bar-fill"
                        style={{
                          width: `${Math.min(100, Number(BigInt(vault.spentToday || '0') * 100n / BigInt(vault.constraints.dailyLimit || '1')))}%`,
                          background: Number(BigInt(vault.spentToday || '0') * 100n / BigInt(vault.constraints.dailyLimit || '1')) >= 90 ? '#ef4444' :
                                      Number(BigInt(vault.spentToday || '0') * 100n / BigInt(vault.constraints.dailyLimit || '1')) >= 70 ? '#f59e0b' : '#84cc16'
                        }}
                      />
                    </div>
                  </div>

                  {/* Payment Form */}
                  <div className="payment-form">
                    <label className="field">
                      <span className="field-label">
                        Recipient Address
                        <span className="ens-support-badge">
                          <img src={ENS_LOGO} alt="" /> ENS Supported
                        </span>
                      </span>
                      <div className="ens-input-wrapper payment-recipient-input">
                        <input
                          type="text"
                          value={paymentForm.recipient}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, recipient: e.target.value }))}
                          placeholder="0x... or vitalik.eth"
                          className={`input-address ${recipientENSResolution.result?.success ? 'ens-resolved' : ''}`}
                        />
                        {recipientENSResolution.isLoading && <span className="ens-loading-inline">Resolving...</span>}
                      </div>

                      {/* ENS Resolution Result for Recipient */}
                      {recipientENSResolution.result?.success && (
                        <div className="ens-resolution-result success compact">
                          {recipientENSResolution.result.avatar && (
                            <img src={recipientENSResolution.result.avatar} alt="" className="ens-avatar-small" />
                          )}
                          <div className="ens-resolution-info">
                            {recipientENSResolution.result.ensName && (
                              <span className="ens-name">{recipientENSResolution.result.ensName}</span>
                            )}
                            <span className="ens-address">{formatAddress(recipientENSResolution.result.address || '')}</span>
                          </div>
                          <span className="ens-verified-small">Verified</span>
                        </div>
                      )}
                      {recipientENSResolution.error && !recipientENSResolution.isLoading && paymentForm.recipient && (
                        <div className="ens-resolution-result error compact">
                          <span>{recipientENSResolution.error}</span>
                        </div>
                      )}
                    </label>

                    <label className="field amount-field">
                      <span className="field-label">Amount ({getCoinSymbol(vault.assetType)})</span>
                      <div className="amount-input-wrapper">
                        <input
                          type="number"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                          placeholder="0.00"
                          className={`input-amount ${paymentValidation?.isValid === false ? 'input-error' : paymentValidation?.willTriggerAlert ? 'input-warning' : ''}`}
                          step="0.01"
                        />
                        <span className="amount-suffix">{getCoinSymbol(vault.assetType)}</span>
                      </div>
                    </label>

                    {/* Quick Amount Buttons */}
                    <div className="quick-amounts">
                      {[0.01, 0.05, 0.1].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className="quick-amount-btn"
                          onClick={() => setPaymentForm((f) => ({ ...f, amount: amt.toString() }))}
                        >
                          {amt} {getCoinSymbol(vault.assetType)}
                        </button>
                      ))}
                    </div>

                    {/* Real-time Validation Feedback */}
                    {paymentValidation && (
                      <div className={`validation-feedback ${paymentValidation.isValid ? 'valid' : 'invalid'} ${paymentValidation.willTriggerAlert ? 'alert' : ''}`}>
                        {paymentValidation.errors.length > 0 && (
                          <div className="validation-errors">
                            {paymentValidation.errors.map((err, i) => (
                              <div key={i} className="validation-item error">
                                <span className="icon">✕</span> {err}
                              </div>
                            ))}
                          </div>
                        )}
                        {paymentValidation.warnings.length > 0 && (
                          <div className="validation-warnings">
                            {paymentValidation.warnings.map((warn, i) => (
                              <div key={i} className="validation-item warning">
                                <span className="icon">⚠</span> {warn}
                              </div>
                            ))}
                          </div>
                        )}
                        {paymentValidation.isValid && (
                          <div className="validation-success">
                            <div className="validation-item success">
                              <span className="icon">✓</span> Payment within constraints
                            </div>
                            <div className="validation-detail">
                              Remaining after: {paymentValidation.remainingAfterPayment} {getCoinSymbol(vault.assetType)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Execute Button */}
                    <button
                      className={`btn primary execute-btn ${paymentValidation?.willTriggerAlert ? 'btn-warning' : ''}`}
                      onClick={executePayment}
                      disabled={isExecuting || !paymentForm.recipient || !paymentForm.amount || paymentValidation?.isValid === false}
                    >
                      {isExecuting ? (
                        <span className="btn-loading">Executing...</span>
                      ) : paymentValidation?.isValid === false ? (
                        <span>❌ Payment Blocked</span>
                      ) : paymentValidation?.willTriggerAlert ? (
                        <span>⚠️ Send with Alert</span>
                      ) : (
                        <span>Send Payment</span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Right Column - Info & History */}
            <div className="grid-card">
              <div className="card-head">
                <h2>Payment History</h2>
              </div>

              {paymentHistory.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">💳</div>
                  <p>No payments yet</p>
                  <p className="field-hint">Execute a payment to see it here</p>
                </div>
              ) : (
                <ul className="payment-history">
                  {paymentHistory.map((payment, idx) => (
                    <li key={idx} className={`payment-item ${payment.status}`}>
                      <div className="payment-main">
                        <span className={`payment-status-icon ${payment.status}`}>
                          {payment.status === 'success' ? '✓' : payment.status === 'alert' ? '⚠' : '✕'}
                        </span>
                        <div className="payment-details">
                          <span className="payment-amount">{payment.amount} {vault ? getCoinSymbol(vault.assetType) : 'SUI'}</span>
                          <span className="payment-recipient">→ {truncateAddress(payment.recipient)}</span>
                        </div>
                      </div>
                      <div className="payment-meta">
                        <span className={`payment-badge ${payment.status}`}>
                          {payment.status === 'success' ? 'Success' : payment.status === 'alert' ? 'Alert' : 'Rejected'}
                        </span>
                        {payment.digest !== 'rejected' && payment.digest !== 'failed' && (
                          <a href={explorerUrl('txblock', payment.digest)} target="_blank" rel="noreferrer" className="link">
                            View ↗
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="info-block" style={{ marginTop: '20px' }}>
                <h4>How Constraints Work</h4>
                <ul>
                  <li><strong>Per-TX Limit:</strong> Max single payment</li>
                  <li><strong>Daily Limit:</strong> Total spending per 24h</li>
                  <li><strong>Alert Threshold:</strong> Triggers notification</li>
                </ul>
                <p style={{ fontSize: '0.8rem', marginTop: '12px', color: '#666' }}>
                  Payments exceeding limits are <strong>rejected on-chain</strong>. No trust required.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ==================== MANAGE TAB ==================== */}
        {activeTab === 'manage' && (
          <section className="grid manage-section">
            {/* Left Column - Constraint Controls */}
            <div className="grid-card">
              <div className="card-head">
                <h2>Vault Constraints</h2>
                {vault && account?.address === vault.owner && (
                  <button
                    className={`btn small ${isEditingConstraints ? 'ghost' : ''}`}
                    onClick={() => setIsEditingConstraints(!isEditingConstraints)}
                  >
                    {isEditingConstraints ? 'Cancel' : 'Edit'}
                  </button>
                )}
              </div>

              {!vault ? (
                <div className="warning-banner">
                  <p>Load a vault from Dashboard to manage it</p>
                  <button className="btn small" onClick={() => setActiveTab('dashboard')}>
                    Go to Dashboard
                  </button>
                </div>
              ) : !account ? (
                <div className="warning-banner">
                  <p>Connect wallet to manage constraints</p>
                  <ConnectButton />
                </div>
              ) : account.address !== vault.owner ? (
                <div className="warning-banner">
                  <p>Only the vault owner can manage constraints</p>
                  <p className="field-hint">Owner: {truncateAddress(vault.owner)}</p>
                  <p className="field-hint">Your wallet: {truncateAddress(account.address)}</p>
                </div>
              ) : isEditingConstraints ? (
                /* Editing Mode - Show Form */
                <div className="constraint-edit-form">
                  <div className="vault-token-info">
                    {getTokenIcon(getCoinSymbol(vault.assetType)) && (
                      <img
                        src={getTokenIcon(getCoinSymbol(vault.assetType)) || ''}
                        alt={getCoinSymbol(vault.assetType)}
                        className="token-icon-medium"
                      />
                    )}
                    <span className="vault-token-name">{getCoinSymbol(vault.assetType)} Vault</span>
                  </div>

                  <label className="field">
                    <span className="field-label">Daily Limit ({getCoinSymbol(vault.assetType)})</span>
                    <input
                      type="number"
                      value={constraintForm.dailyLimit}
                      onChange={(e) => setConstraintForm((f) => ({ ...f, dailyLimit: e.target.value }))}
                      placeholder="100.00"
                      step="0.01"
                    />
                    <span className="field-hint">Maximum total spending per 24 hours</span>
                  </label>

                  <label className="field">
                    <span className="field-label">Per-Transaction Limit ({getCoinSymbol(vault.assetType)})</span>
                    <input
                      type="number"
                      value={constraintForm.perTxLimit}
                      onChange={(e) => setConstraintForm((f) => ({ ...f, perTxLimit: e.target.value }))}
                      placeholder="25.00"
                      step="0.01"
                    />
                    <span className="field-hint">Maximum single transaction amount</span>
                  </label>

                  <label className="field">
                    <span className="field-label">Alert Threshold ({getCoinSymbol(vault.assetType)})</span>
                    <input
                      type="number"
                      value={constraintForm.alertThreshold}
                      onChange={(e) => setConstraintForm((f) => ({ ...f, alertThreshold: e.target.value }))}
                      placeholder="80.00"
                      step="0.01"
                    />
                    <span className="field-hint">Triggers alert when daily spending reaches this amount</span>
                  </label>

                  <label className="field">
                    <span className="field-label">Minimum Balance ({getCoinSymbol(vault.assetType)})</span>
                    <input
                      type="number"
                      value={constraintForm.minBalance}
                      onChange={(e) => setConstraintForm((f) => ({ ...f, minBalance: e.target.value }))}
                      placeholder="10.00"
                      step="0.01"
                    />
                    <span className="field-hint">Vault must retain at least this amount</span>
                  </label>

                  <label className="field checkbox">
                    <input
                      type="checkbox"
                      checked={constraintForm.yieldEnabled}
                      onChange={(e) => setConstraintForm((f) => ({ ...f, yieldEnabled: e.target.checked }))}
                    />
                    <span>Enable yield routing (future feature)</span>
                  </label>

                  <div className="btn-group">
                    <button
                      className="btn primary"
                      onClick={executeUpdateConstraints}
                      disabled={isExecuting}
                    >
                      {isExecuting ? 'Updating...' : 'Save Constraints'}
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => setIsEditingConstraints(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode - Show Current Settings */
                <>
                  <div className="control-section">
                    <div className="vault-token-info">
                      {getTokenIcon(getCoinSymbol(vault.assetType)) && (
                        <img
                          src={getTokenIcon(getCoinSymbol(vault.assetType)) || ''}
                          alt={getCoinSymbol(vault.assetType)}
                          className="token-icon-medium"
                        />
                      )}
                      <span className="vault-token-name">{getCoinSymbol(vault.assetType)} Vault</span>
                    </div>
                    <div className="settings-grid">
                      <div className="setting-item">
                        <span className="meta-label">Daily Limit</span>
                        <span className="setting-value">{formatAmount(vault.constraints.dailyLimit, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}</span>
                      </div>
                      <div className="setting-item">
                        <span className="meta-label">Per-TX Limit</span>
                        <span className="setting-value">{formatAmount(vault.constraints.perTxLimit, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}</span>
                      </div>
                      <div className="setting-item">
                        <span className="meta-label">Min Balance</span>
                        <span className="setting-value">{formatAmount(vault.constraints.minBalance, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}</span>
                      </div>
                      <div className="setting-item">
                        <span className="meta-label">Alert At</span>
                        <span className="setting-value">{formatAmount(vault.constraints.alertThreshold, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pause/Unpause Control */}
                  <div className="control-section pause-section">
                    <div className="pause-header">
                      <h4>Vault Status</h4>
                      <div className={`status-badge large ${vault.constraints.paused ? 'paused' : 'active'}`}>
                        {vault.constraints.paused ? 'PAUSED' : 'ACTIVE'}
                      </div>
                    </div>
                    <p className="pause-description">
                      {vault.constraints.paused
                        ? 'Agent cannot execute any transactions while vault is paused.'
                        : 'Agent can execute transactions within the defined constraints.'}
                    </p>
                    <button
                      className={`btn ${vault.constraints.paused ? 'primary' : 'btn-danger'}`}
                      onClick={() => executeSetPaused(!vault.constraints.paused)}
                      disabled={isExecuting}
                    >
                      {isExecuting ? 'Processing...' : vault.constraints.paused ? 'Unpause Vault' : 'Pause Vault'}
                    </button>
                  </div>

                  {/* Change Agent */}
                  <div className="control-section agent-section">
                    <h4>Agent Address</h4>
                    <div className="current-agent">
                      <span className="meta-label">Current Agent</span>
                      <div className="agent-address">
                        <span>{truncateAddress(vault.agent)}</span>
                        <button className="btn-icon small" onClick={() => copyToClipboard(vault.agent)}>
                          📋
                        </button>
                      </div>
                    </div>
                    <div className="change-agent-form">
                      <label className="field">
                        <span className="field-label">New Agent Address</span>
                        <div className="ens-input-wrapper">
                          <input
                            type="text"
                            value={newAgentAddress}
                            onChange={(e) => setNewAgentAddress(e.target.value)}
                            placeholder="0x... (SUI/ETH) or vitalik.eth"
                          />
                          {account?.address && (
                            <button
                              type="button"
                              className="btn-use-wallet"
                              title="Use connected wallet address"
                              onClick={() => setNewAgentAddress(account.address)}
                            >
                              My Wallet
                            </button>
                          )}
                        </div>
                      </label>
                      <button
                        className="btn"
                        onClick={executeSetAgent}
                        disabled={isExecuting || !newAgentAddress}
                      >
                        {isExecuting ? 'Updating...' : 'Change Agent'}
                      </button>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="control-section">
                    <h4>Quick Actions</h4>
                    <div className="btn-group">
                      <button className="btn small" onClick={() => copyToClipboard(vaultId)}>
                        Copy Vault ID
                      </button>
                      <a
                        href={explorerUrl('object', vaultId)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn small ghost"
                      >
                        View on Explorer ↗
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="grid-card">
              <div className="card-head">
                <h2>Deposit / Withdraw</h2>
              </div>

              {!vault ? (
                <div className="warning-banner">
                  <p>Load a vault first to deposit or withdraw</p>
                </div>
              ) : !account ? (
                <div className="warning-banner">
                  <p>Connect wallet to manage funds</p>
                  <ConnectButton />
                </div>
              ) : account.address !== vault.owner ? (
                <div className="warning-banner">
                  <p>Only the vault owner can deposit/withdraw</p>
                  <p className="field-hint">Owner: {truncateAddress(vault.owner)}</p>
                </div>
              ) : (
                <div className="deposit-withdraw-section">
                  {/* Vault Balance Display */}
                  <div className="vault-balance-card">
                    <div className="vault-balance-header">
                      <span className="meta-label">Vault Balance</span>
                      <button className="btn-icon small" onClick={loadVault} disabled={loading.vault}>
                        {loading.vault ? '...' : '↻'}
                      </button>
                    </div>
                    <div className="vault-balance-display">
                      {getTokenIcon(getCoinSymbol(vault.assetType)) && (
                        <img
                          src={getTokenIcon(getCoinSymbol(vault.assetType)) || ''}
                          alt={getCoinSymbol(vault.assetType)}
                          className="token-icon-large"
                        />
                      )}
                      <span className="vault-balance-amount">
                        {formatAmount(vault.balance, getCoinDecimals(vault.assetType))}
                      </span>
                      <span className="vault-balance-symbol">{getCoinSymbol(vault.assetType)}</span>
                    </div>
                  </div>

                  <div className="action-card">
                    <h4><span className="icon">+</span> Deposit Funds</h4>
                    <label className="field">
                      Select Coin from Wallet
                      {loadingCoins ? (
                        <div className="coin-loading">Loading your coins...</div>
                      ) : userCoins.length === 0 ? (
                        <div className="coin-empty-inline">
                          <span>No coins in wallet</span>
                          <button type="button" className="btn small" onClick={fetchUserCoins}>↻</button>
                        </div>
                      ) : (
                        <div className="coin-selector-grid">
                          {userCoins.map((coin) => {
                            const isSelected = depositForm.coinObjectId === coin.objectId;
                            const icon = getTokenIcon(coin.symbol);
                            return (
                              <button
                                key={coin.objectId}
                                type="button"
                                className={`coin-selector-item ${isSelected ? 'selected' : ''}`}
                                onClick={() => setDepositForm((f) => ({ ...f, coinObjectId: coin.objectId, amount: '' }))}
                              >
                                <div className="coin-selector-icon">
                                  {icon ? (
                                    <img src={icon} alt={coin.symbol} />
                                  ) : (
                                    <span className="coin-fallback-icon">{coin.symbol.charAt(0)}</span>
                                  )}
                                </div>
                                <div className="coin-selector-info">
                                  <span className="coin-selector-symbol">{coin.symbol}</span>
                                  <span className="coin-selector-balance">
                                    {formatAmount(coin.balance, getCoinDecimals(coin.coinType))}
                                  </span>
                                </div>
                                {isSelected && <span className="coin-selector-check">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <span className="field-hint">
                        <button type="button" className="link-btn" onClick={fetchUserCoins}>Refresh coins</button>
                        {' · '}Deposits the entire coin object to the vault
                      </span>
                    </label>

                    {depositForm.coinObjectId && (
                      <div className="selected-coin-preview">
                        {(() => {
                          const selectedCoin = userCoins.find((c) => c.objectId === depositForm.coinObjectId);
                          if (!selectedCoin) return null;
                          const icon = getTokenIcon(selectedCoin.symbol);
                          return (
                            <>
                              <div className="selected-coin-info">
                                {icon && <img src={icon} alt={selectedCoin.symbol} className="token-icon-small" />}
                                <span>Depositing: <strong>{formatAmount(selectedCoin.balance, getCoinDecimals(selectedCoin.coinType))} {selectedCoin.symbol}</strong></span>
                              </div>
                              <button
                                className="btn primary"
                                onClick={executeDeposit}
                                disabled={isExecuting}
                              >
                                {isExecuting ? 'Depositing...' : `Deposit ${selectedCoin.symbol}`}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="action-card">
                    <h4><span className="icon">-</span> Withdraw Funds</h4>
                    <div className="withdraw-info">
                      {getTokenIcon(getCoinSymbol(vault.assetType)) && (
                        <img
                          src={getTokenIcon(getCoinSymbol(vault.assetType)) || ''}
                          alt={getCoinSymbol(vault.assetType)}
                          className="token-icon-small"
                        />
                      )}
                      <span>Available: <strong>{formatAmount(vault.balance, getCoinDecimals(vault.assetType))} {getCoinSymbol(vault.assetType)}</strong></span>
                    </div>
                    <div className="action-row">
                      <label className="field">
                        Amount to Withdraw
                        <div className="amount-input-wrapper">
                          <input
                            type="number"
                            value={withdrawForm.amount}
                            onChange={(e) => setWithdrawForm({ amount: e.target.value })}
                            placeholder="0.00"
                            className="input-amount"
                          />
                          <span className="amount-suffix">{getCoinSymbol(vault.assetType)}</span>
                        </div>
                      </label>
                      <button
                        className="btn"
                        onClick={executeWithdraw}
                        disabled={isExecuting || !withdrawForm.amount}
                      >
                        {isExecuting ? '...' : 'Withdraw'}
                      </button>
                    </div>
                    <div className="quick-amounts" style={{marginTop:'8px'}}>
                      {[0.1, 0.5, 1].map((pct) => {
                        const maxBalance = parseFloat(formatAmount(vault.balance, getCoinDecimals(vault.assetType)));
                        const amount = (maxBalance * pct).toFixed(2);
                        return (
                          <button
                            key={pct}
                            type="button"
                            className="quick-amount-btn"
                            onClick={() => setWithdrawForm({ amount })}
                          >
                            {pct === 1 ? 'Max' : `${pct * 100}%`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-brand">
          <span className="footer-logo">AgentVault</span>
          <span className="footer-tagline">ETHGlobal HackMoney 2026</span>
          <div className="footer-chains">
            <img src={SUI_LOGO} alt="Sui" className="footer-chain-logo" />
            <span>Sui + DeepBook v3</span>
            <span className="footer-divider">|</span>
            <img src={ENS_LOGO} alt="ENS" className="footer-chain-logo" />
            <span>ENS Integration</span>
          </div>
        </div>
        <div className="footer-links">
          <a href="https://docs.sui.io/standards/deepbookv3" target="_blank" rel="noreferrer" className="btn small ghost">
            <img src={SUI_LOGO} alt="" className="btn-icon-img" /> Sui Docs
          </a>
          <a href="https://docs.ens.domains" target="_blank" rel="noreferrer" className="btn small ghost">
            <img src={ENS_LOGO} alt="" className="btn-icon-img" /> ENS Docs
          </a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="btn small ghost">
            GitHub
          </a>
        </div>
      </footer>

      {/* Toast Notifications */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
