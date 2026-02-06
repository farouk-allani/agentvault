<p align="center">
  <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR-X_xAESEu--eipBkRWlj07HCZaEEtwLankg&s" width="60" alt="Sui" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://ens.domains/assets/brand/mark/ens-mark-Blue.svg" width="60" alt="ENS" />
</p>

<h1 align="center">AgentVault</h1>

<p align="center">
  <strong>Constrained Autonomous Agent Spending on Sui + ENS Integration</strong>
</p>

<p align="center">
  <a href="#sui-prize">
    <img src="https://img.shields.io/badge/Sui-DeepBook_v3-4DA2FF?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgo" alt="Sui Prize" />
  </a>
  &nbsp;
  <a href="#ens-integration">
    <img src="https://img.shields.io/badge/ENS-Constraint_Profiles-5298FF?style=for-the-badge" alt="ENS Prize"  />
  </a>
</p>

<p align="center">
  <em>Give your AI a wallet. With limits.</em>
</p>

---

## Overview

AgentVault enables **autonomous AI agents** to execute transactions and trades within **hard, on-chain spending constraints**. Built on **Sui blockchain** with **DeepBook v3** integration, and featuring a novel **ENS-powered constraint profile system**.

<img width="627" height="auto" alt="overview" src="https://github.com/user-attachments/assets/b41f1259-95c8-4189-8ca8-fd46ac5c35fc" />

---

## Hackathon Prizes

<table>
<tr>
<td width="50%">

### 🔵 Sui Prize

**DeepBook v3 Integration**

- Native CLOB trading
- On-chain constraint enforcement
- Shared object vault architecture
- Real autonomous agent spending

</td>
<td width="50%">

### 🔷 ENS Prize

**Most Creative Use of ENS for DeFi**

- Constraint profiles stored in ENS text records
- Pay to ENS names (alice.eth → 0x...)
- Agent identity via ENS resolution
- Decentralized DeFi configuration

</td>
</tr>
</table>

---

## Key Features

### 🛡️ On-Chain Constraints

```
┌──────────────────────────────────────────────────────────────────┐
│                    VAULT CONSTRAINTS                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Daily Limit        │████████████████░░░░│  $100/day           │
│   Per-TX Limit       │████████░░░░░░░░░░░░│  $25/transaction    │
│   Alert Threshold    │████████████████░░░░│  $80 (triggers event)│
│   Min Balance        │██░░░░░░░░░░░░░░░░░░│  $10 (floor)        │
│   Emergency Pause    │ ○ OFF               │  Owner can halt     │
│                                                                  │
│   ✓ Enforced by Move VM - Cannot be bypassed                    │
│   ✓ No backend, no multisig, pure smart contract               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 🔷 ENS Constraint Profiles (Novel Feature!)

Instead of manually entering constraints, **load pre-configured profiles from ENS names**:

<img width="633" height="581" alt="ens profile" src="https://github.com/user-attachments/assets/5dbc6cf2-331c-4d85-a21c-259093ea53e5" />


**Why this is creative:**
- Goes beyond name→address mapping
- Uses ENS as a **decentralized DeFi configuration store**
- Profiles are **shareable and composable**
- Your risk tolerance, stored on-chain!

### 🔄 ENS Name Resolution

<img width="541" height="559" alt="ens resolution flow" src="https://github.com/user-attachments/assets/04940078-a992-4cba-a9a1-00f111c1e937" />

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          AGENTVAULT ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│    ETHEREUM MAINNET                         SUI BLOCKCHAIN                      │
│    ─────────────────                        ──────────────                      │
│                                                                                 │
│    ┌───────────────┐                        ┌───────────────────────────────┐   │
│    │               │                        │                               │   │
│    │   ENS        │  ──── Resolve ────────▶ │      AgentVault Contract     │   │
│    │   Registry    │       Names            │                               │   │
│    │               │                        │   ┌───────────────────────┐   │   │
│    └───────────────┘                        │   │   Vault<T>            │   │   │
│           │                                 │   │                       │   │   │
│           │ Text Records                    │   │   owner: 0x...        │   │   │
│           ▼                                 │   │   agent: 0x...        │   │   │
│    ┌───────────────┐                        │   │   balance: 500 USDC   │   │   │
│    │  Constraint   │  ──── Load ──────────▶ │   │   constraints: {...}  │   │   │
│    │   Profiles    │      Profiles          │   │   spent_today: 45     │   │   │
│    │               │                        │   │                       │   │   │
│    │ daily: 100    │                        │   └───────────────────────┘   │   │
│    │ perTx: 25     │                        │              │                │   │
│    │ alert: 80     │                        │              ▼                │   │
│    └───────────────┘                        │   ┌───────────────────────┐   │   │
│                                             │   │  Constraint Check     │   │   │
│                                             │   │  (Move VM)            │   │   │
│    ┌───────────────┐                        │   └───────────────────────┘   │   │
│    │               │                        │              │                │   │
│    │    Owner      │  ──── Create ────────▶ │              ▼                │   │
│    │   (Human)     │       Manage           │   ┌───────────────────────┐   │   │
│    │               │                        │   │  DeepBook v3          │   │   │
│    └───────────────┘                        │   │  (CLOB Trading)       │   │   │
│                                             │   └───────────────────────┘   │   │
│    ┌───────────────┐                        │              │                │   │
│    │               │                        │              ▼                │   │
│    │    Agent      │  ──── Execute ───────▶ │   ┌───────────────────────┐   │   │
│    │    (AI)       │       Trades           │   │  Trade Executed       │   │   │
│    │               │                        │   │  or Rejected          │   │   │
│    └───────────────┘                        │   └───────────────────────┘   │   │
│                                             │                               │   │
│                                             └───────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Smart Contracts** | Move (Sui) | Vault logic, constraint enforcement |
| **DEX** | DeepBook v3 | On-chain CLOB trading |
| **Name Resolution** | ENS (Ethereum) | Human-readable names, constraint profiles |
| **Backend** | Express.js + TypeScript | Transaction building, intent parsing |
| **Frontend** | React 18 + Vite | User interface |
| **Wallet** | Sui dapp-kit | Wallet connection |
| **ENS Library** | viem | ENS resolution |

---

## Project Structure

```
agentvault2/
├── contracts/                    # Move smart contracts
│   ├── sources/
│   │   ├── vault.move           # Core vault + constraint logic
│   │   └── events.move          # Event definitions
│   └── Move.toml
│
├── backend/                      # Express API server
│   └── src/
│       ├── routes/              # API endpoints
│       │   ├── vault.ts         # Vault operations
│       │   └── swap.ts          # DeepBook swaps
│       ├── services/
│       │   ├── suiClient.ts     # Sui SDK wrapper
│       │   ├── intentParser.ts  # NLP to constraints
│       │   └── swapService.ts   # DeepBook integration
│       └── config/
│
├── frontend/                     # React web app
│   └── src/
│       ├── App.tsx              # Main application
│       ├── styles.css           # Brutalist styling
│       ├── services/
│       │   └── ensService.ts    # 🔷 ENS resolution
│       └── hooks/
│           └── useENS.ts        # 🔷 ENS React hooks
│
└── scripts/
    └── demo-agent.ts            # Autonomous agent demo
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Sui wallet with testnet SUI
- (Optional) DEEP tokens for trading fees

### Installation

```bash
# Clone repository
git clone https://github.com/your-repo/agentvault2.git
cd agentvault2

# Install backend
cd backend && npm install

# Install frontend
cd ../frontend && npm install
```

### Configuration

```bash
# Backend (.env)
PACKAGE_ID=0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434
SUI_NETWORK=testnet

# Frontend (.env)
VITE_API_BASE=http://localhost:3001
VITE_PACKAGE_ID=0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434
```

### Run

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open http://localhost:5173

---

## Usage Guide

### 1️⃣ Create a Vault with ENS Profile

```
┌────────────────────────────────────────────────────────────┐
│  CREATE TAB                                                │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  🔷 Load ENS Profile                                       │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ┌────────────┐ ┌────────────┐ ┌────────────┐        │ │
│  │ │Conservative│ │ Moderate   │ │ Aggressive │ ← Click │ │
│  │ │   $50/day  │ │  $200/day  │ │ $1000/day  │        │ │
│  │ └────────────┘ └────────────┘ └────────────┘        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Or enter custom ENS: [myprofile.eth        ] [Load]      │
│                                                            │
│  ─────────────── OR ───────────────                       │
│                                                            │
│  📝 Manual: "Spend $100/day, max $25 per trade"           │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 2️⃣ Set Agent via ENS Name

```
┌────────────────────────────────────────────────────────────┐
│  AGENT ADDRESS                                  ENS ✓      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  [trading-bot.eth                              ]           │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ 🖼️  trading-bot.eth                                │   │
│  │     0x742d35Cc6634C0532925a3b...                   │   │
│  │                                         ✅ Verified │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 3️⃣ Pay to ENS Names

```
┌────────────────────────────────────────────────────────────┐
│  💸 EXECUTE PAYMENT                                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Recipient: [vitalik.eth                       ]           │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ 🖼️  vitalik.eth                                    │   │
│  │     0xd8dA6BF26964aF9D7eEd9e03...                  │   │
│  │                                         ✅ Verified │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  Amount: [10.00                ] SUI                       │
│                                                            │
│  [        Send Payment        ]                            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Smart Contract API

### Vault Operations

```move
// Create vault with constraints
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

// Agent executes payment (checked against constraints)
public entry fun execute_payment<T>(
    vault: &mut Vault<T>,
    recipient: address,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext
)

// Agent executes swap on DeepBook v3
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
public entry fun update_constraints<T>(vault, daily_limit, per_tx_limit, ...)
public entry fun set_paused<T>(vault, paused: bool, ...)
public entry fun set_agent<T>(vault, new_agent: address, ...)
public entry fun deposit<T>(vault, coin, ...)
public entry fun withdraw<T>(vault, amount, ...)
```

---

## ENS Integration Details

### Text Record Schema

Store constraint profiles in ENS text records:

| Key | Value | Description |
|-----|-------|-------------|
| `agentvault.dailyLimit` | `"100"` | Max daily spending |
| `agentvault.perTxLimit` | `"25"` | Max per transaction |
| `agentvault.alertThreshold` | `"80"` | Alert trigger point |
| `agentvault.minBalance` | `"10"` | Minimum vault balance |
| `agentvault.yieldEnabled` | `"true"` | Enable yield routing |
| `description` | `"..."` | Human-readable description |

### ENS Service Functions

```typescript
// Resolve ENS name to address
await resolveENSName("vitalik.eth") // → "0xd8dA6BF26964aF..."

// Load constraint profile from ENS
await loadENSConstraintProfile("conservative.agentvault.eth")
// → { dailyLimit: 50, perTxLimit: 10, ... }

// Full resolution with avatar
await resolveENSOrAddress("alice.eth")
// → { address: "0x...", ensName: "alice.eth", avatar: "https://..." }
```

---

## Constraint Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CONSTRAINT VALIDATION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Agent calls execute_swap(vault, pool, quantity=30, ...)                       │
│                           │                                                     │
│                           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  1. CHECK: sender == vault.agent?                                        │   │
│  │     └── ❌ Abort: ENotAgent                                              │   │
│  │     └── ✅ Continue                                                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                           │                                                     │
│                           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  2. CHECK: vault.paused == false?                                        │   │
│  │     └── ❌ Abort: EVaultPaused                                           │   │
│  │     └── ✅ Continue                                                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                           │                                                     │
│                           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  3. CHECK: quantity <= per_tx_limit (25)?                                │   │
│  │     └── 30 > 25 ❌ Abort: EExceedsPerTxLimit                             │   │
│  │     └── ✅ Continue                                                       │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                           │                                                     │
│                           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  4. CHECK: spent_today + quantity <= daily_limit (100)?                  │   │
│  │     └── 45 + 30 = 75 ≤ 100 ✅ Continue                                   │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                           │                                                     │
│                           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  5. CHECK: balance - quantity >= min_balance (10)?                       │   │
│  │     └── 500 - 30 = 470 ≥ 10 ✅ Continue                                  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                           │                                                     │
│                           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  6. CHECK: spent_today + quantity >= alert_threshold (80)?               │   │
│  │     └── 75 < 80 → No alert                                               │   │
│  │     └── If ≥ 80 → Emit AlertTriggered event                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                           │                                                     │
│                           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  7. EXECUTE: DeepBook swap                                               │   │
│  │     └── Update spent_today = 75                                          │   │
│  │     └── Emit SwapExecuted event                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Events

| Event | Description |
|-------|-------------|
| `VaultCreated` | New vault deployed |
| `PaymentExecuted` | Agent made a payment |
| `SwapExecuted` | Agent executed a swap |
| `AlertTriggered` | Spending exceeded alert threshold |
| `ConstraintsUpdated` | Owner changed limits |
| `VaultPaused` | Owner paused/unpaused vault |
| `FundsDeposited` | Owner added funds |
| `FundsWithdrawn` | Owner removed funds |

---

## Deployed Contracts

| Network | Package ID |
|---------|------------|
| Sui Testnet | `0x9eb66e8ef73279472ec71d9ff8e07e97e4cb3bca5b526091019c133e24a3b434` |

### DeepBook v3 Testnet Pools

| Pair | Pool ID |
|------|---------|
| DEEP/SUI | `0x0064034cf7f797e298bd9cd506f0e127ce511a798b3d9113e2f0cdb7e2c049f6` |
| SUI/DBUSDC | `0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407` |
| DEEP/DBUSDC | `0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce` |

---

## Security Model

| Feature | Implementation |
|---------|---------------|
| **On-chain enforcement** | Constraints checked by Move VM, not backend |
| **Shared objects** | Agents can transact without owner signature |
| **Daily reset** | Spending limits reset every 24 hours automatically |
| **Emergency pause** | Owner can halt all activity instantly |
| **No key sharing** | Agent uses its own keypair |
| **ENS verification** | Resolved addresses shown with verification badge |

---

## Future Roadmap

- [ ] Real ENS subdomain deployment for profiles
- [ ] Yield routing integration (Scallop, Navi)
- [ ] Multi-agent vaults
- [ ] Time-based constraints
- [ ] Whitelist/blacklist for recipients
- [ ] Mainnet deployment

---

## Demo

```bash
# Run the demo agent
cd scripts
npm install
npm run agent-demo
```

---

## Built For

<p align="center">
  <strong>ETHGlobal HackMoney 2026</strong>
</p>

<!-- <p align="center">
  <img src="https://assets.coingecko.com/coins/images/26375/standard/sui_asset.jpeg" width="40" alt="Sui" />
  <span>&nbsp;&nbsp;Sui Track&nbsp;&nbsp;</span>
  <img src="https://avatars.githubusercontent.com/u/47940724?s=200&v=4" width="40" alt="ENS" />
  <span>&nbsp;&nbsp;ENS Track</span>
</p> -->

---

## License

MIT

---

<p align="center">
  Built with ❤️ on <strong>Move</strong> and <strong>Sui</strong>
</p>
