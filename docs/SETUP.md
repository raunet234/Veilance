# Local Development Setup

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.9+ | `brew install python@3.12` or [python.org](https://python.org) |
| Node.js | 18+ | `brew install node` or [nodejs.org](https://nodejs.org) |
| Noir (nargo) | 1.0.0-beta.9 | `noirup -v 1.0.0-beta.9` ([docs](https://noir-lang.org/docs/getting_started/installation)) |
| Barretenberg (bb) | 0.87.0 | `bbup -v 0.87.0` ([docs](https://github.com/AztecProtocol/aztec-packages)) |
| Rust | stable + `wasm32v1-none` | `rustup target add wasm32v1-none` |
| Stellar CLI | ≥ 3.2.0 | `cargo install stellar-cli` or `brew install stellar-cli` |
| just | any | `brew install just` (task runner for the smoke-test workspace) |
| Freighter Wallet | latest | [Chrome Web Store](https://www.freighter.app/) |

> **Noir + BB are only needed if you want to recompile the ZK circuit or regenerate proof artifacts.** The pre-compiled circuit bytecode is bundled in the dashboard and the proof artifacts are in `smoke-test/circuits/target/`.

## Project Structure

```
Veilance/
├── smoke-test/                 # ZK circuit + Soroban verifier contract
│   ├── circuits/               # Noir circuit source + compiled artifacts
│   │   ├── src/main.nr         # Circuit: assert(balance >= spend_amount)
│   │   └── target/             # vk, proof, public_inputs, bytecode JSON
│   ├── contracts/              # Soroban verifier contract (Rust)
│   │   └── src/lib.rs          # __constructor, verify_proof, vk_bytes
│   ├── crates/                 # ultrahonk-soroban-verifier (pure Rust)
│   ├── justfile                # Build/deploy/test commands
│   └── Cargo.toml              # Workspace manifest
│
├── veilance-app/               # Application code
│   ├── backend/                # FastAPI backend
│   │   ├── src/
│   │   │   ├── main.py         # Routes, schemas, webhook handler
│   │   │   ├── config.py       # Pydantic Settings (.env loader)
│   │   │   ├── models.py       # SQLModel ORM (VirtualCard)
│   │   │   └── services/
│   │   │       ├── stellar.py  # ZK proof verification via Soroban RPC
│   │   │       └── lithic.py   # Virtual card creation via Lithic API
│   │   ├── requirements.txt
│   │   └── .env                # Environment variables (not in git)
│   │
│   ├── dashboard/              # React frontend
│   │   ├── src/pages/
│   │   │   ├── Landing.jsx     # Marketing landing page
│   │   │   └── Dashboard.jsx   # Wallet + proof + card UI
│   │   └── package.json
│   │
│   └── extension/              # Chrome extension (Manifest V3)
│       ├── manifest.json
│       └── content.js          # Checkout detection + card auto-fill
│
├── docs/                       # Documentation (you are here)
├── CLAUDE.md                   # AI assistant guidelines
└── README.md                   # Project overview
```

## 1. Backend Setup

```bash
cd veilance-app/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Environment Variables

Copy the example and fill in values:

```bash
cp ../. env.example .env
```

Edit `backend/.env`:

```env
# Required
API_KEY=sk_stellar_pay_dev_b03352ef1d68164c675023b82538ea3d1d1902f69bc408b7
LITHIC_API_KEY=<your-lithic-sandbox-key>
LITHIC_ENVIRONMENT=sandbox

# Stellar (defaults work for testnet)
VERIFIER_CONTRACT_ID=CD5MQ4EP23KKSCWZ3ZBX673BFV4OHJEOA3XQBBWG4VDAYECM34U6EZYL
STELLAR_RPC_URL=https://soroban-testnet.stellar.org

# Optional (needed for refunds — leave blank for demo)
STELLAR_PLATFORM_SECRET=
LITHIC_WEBHOOK_SECRET=

# Database (SQLite by default)
DATABASE_URL=sqlite:///./stellar_pay.db
```

| Variable | Required | Description |
|----------|----------|-------------|
| `API_KEY` | Yes | API key for authenticating dashboard → backend requests |
| `LITHIC_API_KEY` | Yes | Lithic sandbox API key ([get one](https://lithic.com)) |
| `LITHIC_ENVIRONMENT` | Yes | `sandbox` for testing, `production` for real cards |
| `VERIFIER_CONTRACT_ID` | Yes | Deployed Soroban verifier contract ID |
| `STELLAR_RPC_URL` | Yes | Soroban RPC endpoint |
| `STELLAR_PLATFORM_SECRET` | No | Stellar secret key for sending USDC refunds |
| `LITHIC_WEBHOOK_SECRET` | No | HMAC secret for verifying Lithic webhook signatures |
| `DATABASE_URL` | No | Database connection string (defaults to SQLite) |

### Start the Backend

```bash
uvicorn src.main:app --reload --port 8000
```

Verify: http://localhost:8000/health → `{"status": "ok"}`

Swagger docs: http://localhost:8000/docs

## 2. Dashboard Setup

```bash
cd veilance-app/dashboard

# Install dependencies
npm install

# Start dev server
npm run dev
```

Dashboard runs at http://localhost:3001

> The dashboard expects the backend at `localhost:8000` in development mode. This is configured in `Dashboard.jsx`.

### Requirements

- **Freighter wallet** browser extension must be installed and connected to Stellar testnet
- The wallet account needs some XLM balance (for the demo, XLM balance is used as a proxy for USDC)
- Fund a testnet account at https://friendbot.stellar.org

## 3. Chrome Extension Setup

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `veilance-app/extension/` folder
5. The extension icon appears in the toolbar

The extension runs automatically on all pages. When the dashboard issues a card, the extension receives the details via `postMessage` and can auto-fill checkout forms.

## 4. ZK Circuit (Optional)

Only needed if you want to modify the circuit or regenerate artifacts.

```bash
cd smoke-test

# Verify toolchain
just check-tools

# Compile circuit + generate VK, proof, and public inputs
just build-circuits

# Build Soroban contract WASM
just build-contract

# Run integration tests
just test

# Full pipeline: circuits → contract → tests
just e2e
```

### Deploy to Stellar Testnet

```bash
# Fund a testnet account (one-time)
just fund

# Deploy contract with VK → verify proof on-chain
just testnet
```

The contract ID is saved to `smoke-test/.contract_id`.

## Running the Full Stack

Open three terminals:

```bash
# Terminal 1: Backend
cd veilance-app/backend
source venv/bin/activate
uvicorn src.main:app --reload --port 8000

# Terminal 2: Dashboard
cd veilance-app/dashboard
npm run dev

# Terminal 3: (optional) Watch backend logs
tail -f veilance-app/backend/stellar_pay.db  # or just watch the uvicorn output
```

Then:
1. Open http://localhost:3001 in Chrome (with Freighter installed)
2. Click **Connect Wallet** and approve in Freighter
3. Enter a spend amount and click **Verify proof & get card**
4. Wait ~30–60 seconds for ZK proof generation (runs in browser WASM)
5. Card details appear on screen

## Testing

### Backend API (curl)

```bash
# Health check
curl http://localhost:8000/health

# Submit a pre-generated proof (using on-disk artifacts)
PROOF_HEX=$(xxd -p smoke-test/circuits/target/proof | tr -d '\n')
PUB_HEX=$(xxd -p smoke-test/circuits/target/public_inputs | tr -d '\n')

curl -X POST http://localhost:8000/api/v1/payment/submit \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk_stellar_pay_dev_b03352ef1d68164c675023b82538ea3d1d1902f69bc408b7" \
  -d "{
    \"proof\": \"$PROOF_HEX\",
    \"public_inputs\": \"$PUB_HEX\",
    \"stellar_address\": \"GABC...\",
    \"amount_cents\": 1000
  }"
```

### Soroban Contract (CLI)

```bash
cd smoke-test

# Verify proof against deployed contract
just verify CD5MQ4EP23KKSCWZ3ZBX673BFV4OHJEOA3XQBBWG4VDAYECM34U6EZYL
```

### Integration Tests (Rust)

```bash
cd smoke-test
cargo test --workspace --all-features --release
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Lithic API key not configured` | Set `LITHIC_API_KEY` in `backend/.env` and restart the backend |
| `ZK proof verification failed` | Ensure proof is exactly 14,592 bytes. Check that the verifier contract ID is correct and the contract is deployed on testnet. |
| `Freighter not detected` | Install the [Freighter wallet](https://www.freighter.app/) extension and switch to testnet |
| `CORS errors` | Backend CORS is set to `allow_origins=["*"]`. Make sure the backend is running on port 8000. |
| `Port already in use` | `lsof -ti:8000 \| xargs kill -9` and `lsof -ti:3001 \| xargs kill -9` |
| Proof generation takes forever | Normal — UltraHonk proof generation in WASM takes 30–60 seconds in the browser. |
