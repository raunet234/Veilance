# Veilance

**Spend XLM at any online checkout — without revealing your balance.**

Veilance generates a zero-knowledge proof that your Stellar wallet holds enough XLM, verifies it on-chain via a Soroban smart contract, and issues a single-use virtual Visa card. No merchant integration, no KYC, no bank account.

---

## The Problem

Crypto holders can't easily pay at regular online stores. Current solutions either require merchants to integrate crypto payments (limiting where you can shop) or use centralized custodians that need full KYC and can see your entire balance. There's no way to prove "I have enough" without revealing "I have exactly this much."

## How Veilance Solves It

Veilance uses a Noir ZK circuit to prove `balance ≥ spend_amount` without disclosing the actual balance. The proof is verified on Stellar's blockchain using native BN254 cryptographic primitives (no off-chain verifier trust assumptions). Once verified, a disposable Visa card is issued through Lithic — usable at any checkout that accepts cards.

```
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────┐     ┌──────────┐
│ Freighter │────►│  ZK Proof  │────►│  Soroban    │────►│  Lithic   │────►│ Merchant  │
│  Wallet   │     │ (in-browser│     │  Verifier   │     │  Virtual  │     │ Checkout  │
│           │     │  noir_js)  │     │ (on-chain)  │     │   Card    │     │           │
└──────────┘     └───────────┘     └────────────┘     └──────────┘     └──────────┘
  Connect          Prove             Verify             Issue             Pay
  wallet         balance ≥ $X      on Stellar        single-use        anywhere
                (private: balance)                    Visa card
```

**Key insight**: The user's actual balance never leaves the browser. The backend only sees the ZK proof and the spend amount.

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **ZK Circuit** | [Noir](https://noir-lang.org/) 1.0.0-beta.9 + [Barretenberg](https://github.com/AztecProtocol/barretenberg) 0.87.0 | `assert(balance >= spend_amount)` — compiled to UltraHonk |
| **On-chain Verifier** | [Soroban](https://soroban.stellar.org/) (Rust) on Stellar Testnet | Verifies 14.5 KB UltraHonk proofs using native BN254 host functions |
| **Backend** | Python [FastAPI](https://fastapi.tiangolo.com/) + [stellar-sdk](https://github.com/StellarCN/py-stellar-base) | Orchestrates proof verification and card issuance |
| **Card Issuer** | [Lithic](https://lithic.com/) API | Programmatic SINGLE_USE virtual Visa cards with spend limits |
| **Frontend** | React 18 + Vite + [@noir-lang/noir_js](https://www.npmjs.com/package/@noir-lang/noir_js) + [@aztec/bb.js](https://www.npmjs.com/package/@aztec/bb.js) | In-browser proof generation via WASM |
| **Wallet** | [Freighter](https://www.freighter.app/) | Stellar wallet connection |
| **Extension** | Chrome Manifest V3 | Auto-fills card details at merchant checkouts |

## How It Works

1. **Connect** — User connects their Freighter wallet on the Veilance dashboard
2. **Prove** — Browser generates a Noir UltraHonk ZK proof in WASM proving `balance ≥ spend_amount` (balance stays private)
3. **Verify** — Backend calls the Soroban verifier contract via `simulateTransaction` (read-only, no fees)
4. **Issue** — Lithic creates a SINGLE_USE virtual Visa card with a 5% spending buffer
5. **Pay** — Chrome extension auto-fills card details at checkout, or user copies them manually
6. **Refund** — After the merchant charges, unused buffer is automatically refunded as XLM to the user's Stellar wallet

## Screenshots

> *TODO: Add screenshots of the landing page, dashboard, and card issuance flow*

## Quick Start

### Prerequisites

- Python 3.9+, Node.js 18+, Chrome with [Freighter wallet](https://www.freighter.app/)
- A [Lithic sandbox API key](https://lithic.com/)

### 1. Backend

```bash
cd veilance-app/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp ../.env.example .env
# Edit .env — set LITHIC_API_KEY

uvicorn src.main:app --reload --port 8000
```

### 2. Dashboard

```bash
cd veilance-app/dashboard
npm install
npm run dev    # → http://localhost:3001
```

### 3. Chrome Extension

1. `chrome://extensions/` → Enable Developer mode
2. **Load unpacked** → select `veilance-app/extension/`

### 4. Use It

1. Open http://localhost:3001 and connect your Freighter wallet
2. Enter a spend amount and click **Verify proof & get card**
3. Wait ~30–60s for proof generation (in-browser WASM)
4. Card details appear — use at any online checkout

> See [docs/SETUP.md](docs/SETUP.md) for detailed setup including ZK circuit compilation and Soroban contract deployment.

## What Makes This Different

| Approach | Limitation | Veilance |
|----------|-----------|----------|
| Crypto debit cards (Coinbase, Crypto.com) | Require KYC, custodial, centralized balance check | ZK proof — no KYC, non-custodial, balance stays private |
| Merchant crypto payments (BitPay, Flexa) | Merchant must integrate; limited acceptance | Works at **any** checkout that accepts Visa |
| Wrapped stablecoins / bridges | Trust assumptions in the bridge; still can't pay at regular stores | On-chain verification via Stellar's native BN254 primitives |
| Other ZK payment projects | Off-chain verifiers or L2-only | Proof verified **on Stellar mainnet** using protocol-level host functions |

**Core innovation**: On-chain ZK proof verification on Stellar using native BN254 cryptographic host functions (CAP-80), combined with programmatic virtual card issuance. The user's balance is never revealed to any party — not the backend, not Lithic, not the merchant.

## Project Structure

```
Veilance/
├── smoke-test/          # ZK circuit + Soroban verifier contract + tests
├── veilance-app/
│   ├── backend/         # FastAPI — proof verification, card issuance, webhooks
│   ├── dashboard/       # React — wallet UI, in-browser proof generation
│   └── extension/       # Chrome — checkout detection, card auto-fill
└── docs/
    ├── ARCHITECTURE.md  # System design, component diagram, design decisions
    ├── API.md           # Full API reference with request/response shapes
    └── SETUP.md         # Detailed local development setup
```

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** — System overview, component diagram, tech stack justifications, design decisions
- **[API Reference](docs/API.md)** — Every endpoint with request/response schemas
- **[Setup Guide](docs/SETUP.md)** — Local development setup, environment variables, troubleshooting

## Smart Contract

The verifier contract is deployed on Stellar Testnet:

```
Contract ID: CD5MQ4EP23KKSCWZ3ZBX673BFV4OHJEOA3XQBBWG4VDAYECM34U6EZYL
```

It exposes three functions:
- `__constructor(vk_bytes)` — stores the verification key (immutable, set once at deploy)
- `verify_proof(public_inputs, proof_bytes)` — verifies an UltraHonk proof
- `vk_bytes()` — returns stored VK for independent audit

Trust model: no admin key, no upgrade path. The VK is immutable.

## License

MIT
