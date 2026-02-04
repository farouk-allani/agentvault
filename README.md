# AgentVault

**Constrained Autonomous Agent Spending on Sui**

> Give your AI a wallet. With limits.

AgentVault enables autonomous AI agents to execute transactions and trades within hard, on-chain spending constraints. Daily caps, per-transaction limits, minimum balances - all enforced by Move smart contracts on Sui blockchain.

## The Problem

AI agents need to interact with DeFi protocols autonomously - executing trades, making payments, managing positions. But giving an AI unlimited access to funds is risky. Traditional solutions require human co-signing for every transaction, defeating the purpose of autonomy.

## The Solution

AgentVault creates **shared object vaults** on Sui that agents can spend from without owner signatures, but within strict on-chain limits:

- **Daily spending caps** - Agent can't exceed X amount per 24 hours
- **Per-transaction limits** - No single trade can exceed Y amount
- **Minimum balance enforcement** - Vault must retain Z minimum at all times
- **Alert thresholds** - Events emitted when spending exceeds threshold
- **Emergency pause** - Owner can halt all activity instantly

The constraints are enforced by the Move VM itself - not a backend, not a multisig, but actual smart contract logic that cannot be bypassed.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AgentVault Architecture                         │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
    │    Owner     │         │    Agent     │         │   DeepBook   │
    │   (Human)    │         │    (AI)      │         │     v3       │
    └──────┬───────┘         └──────┬───────┘         └──────┬───────┘
           │                        │                        │
           │ create_vault()         │                        │
           │ deposit()              │ execute_swap()         │
           │ withdraw()             │ execute_payment()      │
           │ update_constraints()   │                        │
           │ set_paused()           │                        │
           ▼                        ▼                        ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                         Sui Blockchain                           │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │                    Vault<T> (Shared Object)                │  │
    │  │  ┌─────────────────────────────────────────────────────┐  │  │
    │  │  │  Constraints:                                        │  │  │
    │  │  │  • daily_limit: 100 USDC                            │  │  │
    │  │  │  • per_tx_limit: 25 USDC                            │  │  │
    │  │  │  • min_balance: 10 USDC                             │  │  │
    │  │  │  • alert_threshold: 80 USDC                         │  │  │
    │  │  │  • paused: false                                    │  │  │
    │  │  └─────────────────────────────────────────────────────┘  │  │
    │  │  ┌─────────────────────────────────────────────────────┐  │  │
    │  │  │  State:                                              │  │  │
    │  │  │  • balance: 500 USDC                                │  │  │
    │  │  │  • spent_today: 45 USDC                             │  │  │
    │  │  │  • tx_count: 3                                      │  │  │
    │  │  └─────────────────────────────────────────────────────┘  │  │
    │  └───────────────────────────────────────────────────────────┘  │
    │                              │                                   │
    │                              ▼                                   │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │              Constraint Enforcement (Move VM)              │  │
    │  │  assert!(sender == vault.agent)                           │  │
    │  │  assert!(!vault.constraints.paused)                       │  │
    │  │  assert!(amount <= vault.constraints.per_tx_limit)        │  │
    │  │  assert!(spent_today + amount <= daily_limit)             │  │
    │  │  assert!(balance - amount >= min_balance)                 │  │
    │  └───────────────────────────────────────────────────────────┘  │
    │                              │                                   │
    │                              ▼                                   │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │                   DeepBook v3 Pool                         │  │
    │  │         swap_exact_quote_for_base(pool, coin, ...)        │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘

                              Flow Summary:
    ┌─────────────────────────────────────────────────────────────────┐
    │  1. Owner creates vault with constraints + deposits funds       │
    │  2. Agent calls execute_swap() or execute_payment()            │
    │  3. Move VM validates ALL constraints before execution          │
    │  4. If valid: execute on DeepBook, update spent_today          │
    │  5. If invalid: transaction aborts, no funds lost              │
    │  6. Daily counter resets every 24 hours automatically          │
    └─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Smart Contracts | Move (Sui) |
| DEX Integration | DeepBook v3 |
| Backend API | Express.js + TypeScript |
| Frontend | React 18 + Vite + Sui dapp-kit |
| Wallet | Sui Wallet / Suiet / Martian |

## Project Structure

```
agentvault2/
├── contracts/           # Move smart contracts
│   ├── sources/
│   │   ├── vault.move   # Core vault + constraint logic
│   │   └── events.move  # Event definitions
│   └── Move.toml
├── backend/             # Express API server
│   └── src/
│       ├── routes/      # API endpoints
│       ├── services/    # Business logic
│       └── config/      # Configuration
├── frontend/            # React web app
│   └── src/
│       ├── App.tsx      # Main application
│       └── styles.css   # Styling
└── scripts/             # Utility scripts
    └── demo-agent.ts    # Agent demo
```

## Quick Start

### Prerequisites

- Node.js 18+
- Sui CLI (optional, for contract deployment)
- A Sui wallet with testnet SUI

### 1. Clone and Install

```bash
git clone https://github.com/your-repo/agentvault2.git
cd agentvault2

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
# Backend (.env)
cd backend
cp .env.example .env
# Edit .env with your settings:
# PACKAGE_ID=0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434
# SUI_NETWORK=testnet

# Frontend (.env)
cd ../frontend
cp .env.example .env
# VITE_API_BASE=http://localhost:3001
```

### 3. Run the Application

```bash
# Terminal 1: Start backend
cd backend && npm run dev

# Terminal 2: Start frontend
cd frontend && npm run dev
```

Open http://localhost:5173 in your browser.

### 4. Create Your First Vault

1. Connect your Sui wallet
2. Go to the "Create" tab
3. Enter your spending constraints in plain English:
   > "Spend up to $100 per day, max $25 per trade, keep $10 minimum"
4. Click "Parse Intent" to convert to contract parameters
5. Enter your agent address (can be your own wallet for testing)
6. Enter a coin object ID for the initial deposit
7. Click "Create Vault"

### 5. Execute a Swap (as Agent)

1. Go to the "Dashboard" tab and load your vault
2. Switch to the "Swap" tab
3. Select a DeepBook pool
4. Enter amount and minimum output
5. Provide a DEEP coin ID for trading fees
6. Build and execute the transaction

## Smart Contract API

### Vault Creation

```move
public entry fun create_vault<T>(
    initial_deposit: Coin<T>,
    agent: address,
    daily_limit: u64,
    per_tx_limit: u64,
    alert_threshold: u64,
    yield_enabled: bool,
    min_balance: u64,
    clock: &Clock,
    ctx: &mut TxContext
)
```

### Agent Operations

```move
// Execute payment to recipient
public entry fun execute_payment<T>(
    vault: &mut Vault<T>,
    recipient: address,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext
)

// Execute swap on DeepBook v3
public entry fun execute_swap<BaseAsset, QuoteAsset>(
    vault: &mut Vault<QuoteAsset>,
    pool: &mut Pool<BaseAsset, QuoteAsset>,
    quantity: u64,
    min_base_out: u64,
    deep_in: Coin<DEEP>,
    is_bid: bool,
    clock: &Clock,
    ctx: &mut TxContext
)
```

### Owner Management

```move
public entry fun deposit<T>(vault: &mut Vault<T>, deposit: Coin<T>, ctx: &mut TxContext)
public entry fun withdraw<T>(vault: &mut Vault<T>, amount: u64, ctx: &mut TxContext)
public entry fun update_constraints<T>(vault: &mut Vault<T>, ..., ctx: &mut TxContext)
public entry fun set_paused<T>(vault: &mut Vault<T>, paused: bool, ctx: &mut TxContext)
public entry fun set_agent<T>(vault: &mut Vault<T>, new_agent: address, ctx: &mut TxContext)
```

## REST API Endpoints

### Vault Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vault/create` | POST | Build vault creation transaction |
| `/api/vault/:id` | GET | Get vault details |
| `/api/vault/:id/status` | GET | Get vault status with spending summary |
| `/api/vault/:id/can-spend?amount=X` | GET | Check if amount can be spent |
| `/api/vault/parse-intent` | POST | Parse natural language to constraints |

### Swap Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/swap/build` | POST | Build swap transaction |
| `/api/swap/pools` | GET | Get available DeepBook pools |
| `/api/swap/quote` | GET | Get price quote |
| `/api/swap/validate/:vaultId` | GET | Validate swap feasibility |

## DeepBook v3 Integration

AgentVault integrates with DeepBook v3, Sui's native central limit order book:

- **No AccountCap required** - Simplified trading flow
- **DEEP token fees** - Pay trading fees in DEEP tokens
- **Slippage protection** - Built-in via `min_base_out` parameter
- **Multiple pools** - SUI/USDC, DEEP/SUI, DEEP/USDC

### Available Testnet Pools

| Pair | Pool ID |
|------|---------|
| DEEP/SUI | `0x0064034cf7f797e298bd9cd506f0e127ce511a798b3d9113e2f0cdb7e2c049f6` |
| SUI/USDC | `0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407` |
| DEEP/USDC | `0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce` |

## Intent Parsing

Convert natural language to contract parameters:

**Input:**
> "Trade up to $50 per day, max $10 per transaction, alert me at $40, keep $5 minimum"

**Output:**
```json
{
  "dailyLimit": 50000000,
  "perTxLimit": 10000000,
  "alertThreshold": 40000000,
  "minBalance": 5000000,
  "confidence": 0.85
}
```

## Events

The contract emits events for all significant actions:

- `VaultCreated` - New vault deployed
- `PaymentExecuted` - Agent made a payment
- `SwapExecuted` - Agent executed a swap
- `AlertTriggered` - Spending exceeded alert threshold
- `ConstraintsUpdated` - Owner changed limits
- `VaultPaused` - Owner paused/unpaused vault
- `FundsDeposited` - Owner added funds
- `FundsWithdrawn` - Owner removed funds

## Security Model

1. **On-chain enforcement** - Constraints checked by Move VM, not backend
2. **Shared objects** - Agents can transact without owner signature
3. **Daily reset** - Spending limits reset every 24 hours automatically
4. **Emergency pause** - Owner can halt all activity instantly
5. **No key sharing** - Agent uses its own keypair, never has owner's keys

## Deployed Contracts

| Network | Package ID |
|---------|------------|
| Testnet | `0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434` |

## Demo Agent

Run the demo agent script to see autonomous trading in action:

```bash
cd scripts
npm install
npm run agent-demo
```

See [scripts/demo-agent.ts](scripts/demo-agent.ts) for implementation details.

## Future Roadmap

- [ ] Yield routing integration (Scallop, Navi)
- [ ] Multi-agent vaults
- [ ] Time-based constraints
- [ ] Whitelist/blacklist for recipients
- [ ] Mainnet deployment

## Built For

**ETHGlobal HackMoney 2026** - Sui Track

## License

MIT

---

Built with Move on Sui
