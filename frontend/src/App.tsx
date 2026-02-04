import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const EXPLORER_BASE = 'https://suiexplorer.com';

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

type TabType = 'dashboard' | 'swap' | 'create' | 'manage';

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

function formatAmount(raw: string | number, decimals = 6): string {
  const num = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (isNaN(num)) return '0.00';
  return (num / Math.pow(10, decimals)).toFixed(2);
}

function parseAmount(human: string, decimals = 6): string {
  const num = parseFloat(human);
  if (isNaN(num)) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
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
  },
  {
    title: 'DeepBook v3 Swaps',
    text: 'Trade on Sui\'s native CLOB. Slippage protection built-in. No AccountCap needed.',
    color: '#C084FC',
  },
  {
    title: 'Intent to Constraints',
    text: '"Spend $100/day max" becomes enforceable smart contract parameters.',
    color: '#84CC16',
  },
  {
    title: 'Real Autonomy',
    text: 'Shared objects let agents act without owner signatures. Trust the code, not the agent.',
    color: '#F59E0B',
  },
];

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  // Wallet state
  const account = useCurrentAccount();
  const { mutate: signAndExecute, isPending: isExecuting } = useSignAndExecuteTransaction();

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
  const [depositForm, setDepositForm] = useState({ coinObjectId: '' });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '' });

  // Transaction history
  const [txHistory, setTxHistory] = useState<Array<{ digest: string; type: string; amount: string; timestamp: number }>>([]);

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
            setTimeout(loadVaultStatus, 2000);
          },
          onError: (error) => {
            notify(`Transaction failed: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Failed to execute: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }, [swapBuild, account?.address, swapForm.amount, signAndExecute, notify, loadVaultStatus]);

  const executeCreateVault = useCallback(async () => {
    if (!intentResult?.parsed || !account?.address) {
      notify('Parse intent and connect wallet first', 'error');
      return;
    }

    if (!createForm.coinObjectId || !createForm.agentAddress) {
      notify('Enter agent address and coin object ID', 'error');
      return;
    }

    try {
      const result = await fetchJson<{ transaction: string }>(`${API_BASE}/api/vault/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: account.address,
          agent: createForm.agentAddress,
          dailyLimit: intentResult.parsed.dailyLimit || 100_000_000,
          perTxLimit: intentResult.parsed.perTxLimit || 25_000_000,
          alertThreshold: intentResult.parsed.alertThreshold || 80_000_000,
          yieldEnabled: intentResult.parsed.yieldEnabled || false,
          minBalance: intentResult.parsed.minBalance || 10_000_000,
          coinObjectId: createForm.coinObjectId,
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
  }, [intentResult, account?.address, createForm, signAndExecute, notify, loadUserVaults]);

  const executeDeposit = useCallback(async () => {
    if (!vaultId || !account?.address || !depositForm.coinObjectId) {
      notify('Enter coin object ID to deposit', 'error');
      return;
    }

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${import.meta.env.VITE_PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434'}::vault::deposit`,
        typeArguments: ['0x2::sui::SUI'], // Default to SUI, can be made dynamic
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
            setDepositForm({ coinObjectId: '' });
            setTimeout(loadVaultStatus, 2000);
          },
          onError: (error) => {
            notify(`Deposit failed: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [vaultId, account?.address, depositForm, signAndExecute, notify, loadVaultStatus]);

  const executeWithdraw = useCallback(async () => {
    if (!vaultId || !account?.address || !withdrawForm.amount) {
      notify('Enter amount to withdraw', 'error');
      return;
    }

    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${import.meta.env.VITE_PACKAGE_ID || '0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434'}::vault::withdraw`,
        typeArguments: ['0x2::sui::SUI'], // Default to SUI, can be made dynamic
        arguments: [
          tx.object(vaultId),
          tx.pure.u64(BigInt(parseAmount(withdrawForm.amount))),
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
            setTimeout(loadVaultStatus, 2000);
          },
          onError: (error) => {
            notify(`Withdrawal failed: ${error.message}`, 'error');
          },
        }
      );
    } catch (error) {
      notify(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
    }
  }, [vaultId, account?.address, withdrawForm, signAndExecute, notify, loadVaultStatus]);

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

  // Auto-refresh vault status
  useEffect(() => {
    if (!vaultId) return;
    const interval = setInterval(loadVaultStatus, 15000);
    return () => clearInterval(interval);
  }, [vaultId, loadVaultStatus]);

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
    if (!status?.status) return null;
    const s = status.status;
    return {
      daily: s.limits.dailyFormatted,
      perTx: s.limits.perTxFormatted,
      spent: s.spending.todayFormatted,
      remaining: s.limits.remainingDailyFormatted,
      usage: s.limits.dailyUsagePercent ?? 0,
      balance: s.balance.formatted,
      txCount: s.spending.txCount,
    };
  }, [status]);

  const usageColor = useMemo(() => {
    if (!stats) return '#0e0e10';
    if (stats.usage >= 90) return '#ef4444';
    if (stats.usage >= 70) return '#f59e0b';
    return '#22c55e';
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
          <span className="network-badge">Sui Testnet</span>
        </div>
        <div className="header-right">
          <ConnectButton />
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">Constrained Agent Spending on Sui</span>
          <h1>
            Give your AI a wallet.
            <br />
            <span className="highlight">With limits.</span>
          </h1>
          <p className="lead">
            AgentVault lets autonomous agents trade and spend within hard, on-chain constraints.
            Daily caps. Per-transaction limits. No exceptions. No trust required.
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
              <button className="btn-icon" onClick={loadVaultStatus} disabled={loading.status}>
                {loading.status ? '...' : '↻'}
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
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </div>
          </article>
        ))}
      </section>

      {/* Navigation Tabs */}
      <nav className="tabs">
        {(['dashboard', 'swap', 'create', 'manage'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                    <span className="detail-value">{formatAmount(vault.balance)}</span>
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
                    <select
                      value={swapForm.poolId}
                      onChange={(e) => setSwapForm((f) => ({ ...f, poolId: e.target.value }))}
                      className="select-input"
                    >
                      <option value="">Select a pool...</option>
                      {availablePools.map((pool) => (
                        <option key={pool.id} value={pool.id}>
                          {pool.baseName}/{pool.quoteName} ({pool.pair})
                        </option>
                      ))}
                    </select>
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
                    DEEP Coin ID (for fees)
                    <input
                      value={swapForm.deepCoinId}
                      onChange={(e) => setSwapForm((f) => ({ ...f, deepCoinId: e.target.value }))}
                      placeholder="0x..."
                    />
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
            </div>
          </section>
        )}

        {/* ==================== CREATE TAB ==================== */}
        {activeTab === 'create' && (
          <section className="grid">
            <div className="grid-card">
              <div className="card-head">
                <h2>Define Constraints</h2>
              </div>
              <label className="field">
                Describe your spending limits in plain English
                <textarea
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  rows={3}
                  placeholder="e.g., Spend up to $100 per day, max $25 per trade, keep $10 minimum"
                />
              </label>
              <button className="btn" onClick={parseIntent} disabled={loading.intent}>
                {loading.intent ? 'Parsing...' : 'Parse Intent'}
              </button>

              {intentResult && (
                <div className="intent-result">
                  <div className="meta-label">Parsed Constraints</div>
                  <pre className="code">{intentResult.formatted}</pre>
                  <div className="confidence-badge" data-level={intentResult.confidence}>
                    Confidence: {intentResult.confidence}
                  </div>
                </div>
              )}
            </div>

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
                  <p>Parse your intent first to set constraints</p>
                </div>
              ) : (
                <>
                  <label className="field">
                    Agent Address (who can spend)
                    <input
                      value={createForm.agentAddress}
                      onChange={(e) => setCreateForm((f) => ({ ...f, agentAddress: e.target.value }))}
                      placeholder="0x..."
                    />
                    <span className="field-hint">
                      Use your own address to test, or another wallet for real agent
                    </span>
                  </label>

                  <label className="field">
                    Initial Deposit Coin Object ID
                    <input
                      value={createForm.coinObjectId}
                      onChange={(e) => setCreateForm((f) => ({ ...f, coinObjectId: e.target.value }))}
                      placeholder="0x... (USDC or SUI coin object)"
                    />
                    <span className="field-hint">
                      Find coin objects in your wallet on Sui Explorer
                    </span>
                  </label>

                  <button
                    className="btn primary"
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

        {/* ==================== MANAGE TAB ==================== */}
        {activeTab === 'manage' && (
          <section className="grid">
            <div className="grid-card">
              <div className="card-head">
                <h2>Vault Controls</h2>
              </div>

              {!vault ? (
                <div className="warning-banner">
                  <p>Load a vault from Dashboard to manage it</p>
                  <button className="btn small" onClick={() => setActiveTab('dashboard')}>
                    Go to Dashboard
                  </button>
                </div>
              ) : (
                <>
                  <div className="control-section">
                    <h4>Current Settings</h4>
                    <div className="settings-grid">
                      <div>
                        <span className="meta-label">Daily Limit</span>
                        <span>{formatAmount(vault.constraints.dailyLimit)}</span>
                      </div>
                      <div>
                        <span className="meta-label">Per-TX Limit</span>
                        <span>{formatAmount(vault.constraints.perTxLimit)}</span>
                      </div>
                      <div>
                        <span className="meta-label">Min Balance</span>
                        <span>{formatAmount(vault.constraints.minBalance)}</span>
                      </div>
                      <div>
                        <span className="meta-label">Alert At</span>
                        <span>{formatAmount(vault.constraints.alertThreshold)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="control-section">
                    <h4>Status</h4>
                    <div className={`status-badge ${vault.constraints.paused ? 'paused' : 'active'}`}>
                      {vault.constraints.paused ? 'PAUSED' : 'ACTIVE'}
                    </div>
                  </div>

                  <div className="control-section">
                    <h4>Quick Actions</h4>
                    <div className="btn-group vertical">
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
                  <div className="action-card">
                    <h4><span className="icon">+</span> Deposit Funds</h4>
                    <div className="action-row">
                      <label className="field">
                        Coin Object ID
                        <input
                          value={depositForm.coinObjectId}
                          onChange={(e) => setDepositForm({ coinObjectId: e.target.value })}
                          placeholder="0x... (coin object to deposit)"
                        />
                      </label>
                      <button
                        className="btn primary"
                        onClick={executeDeposit}
                        disabled={isExecuting || !depositForm.coinObjectId}
                      >
                        {isExecuting ? '...' : 'Deposit'}
                      </button>
                    </div>
                    <span className="field-hint">
                      Find your coin objects on Sui Explorer under your wallet
                    </span>
                  </div>

                  <div className="action-card">
                    <h4><span className="icon">-</span> Withdraw Funds</h4>
                    <div className="action-row">
                      <label className="field">
                        Amount
                        <input
                          type="number"
                          value={withdrawForm.amount}
                          onChange={(e) => setWithdrawForm({ amount: e.target.value })}
                          placeholder="10.00"
                        />
                      </label>
                      <button
                        className="btn"
                        onClick={executeWithdraw}
                        disabled={isExecuting || !withdrawForm.amount}
                      >
                        {isExecuting ? '...' : 'Withdraw'}
                      </button>
                    </div>
                    <span className="field-hint">
                      Current balance: {formatAmount(vault.balance)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div>AgentVault · HackMoney 2026 · Built on Sui with DeepBook v3</div>
        <div className="footer-links">
          <a href="https://docs.sui.io/standards/deepbookv3" target="_blank" rel="noreferrer" className="btn small ghost">
            DeepBook Docs
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
