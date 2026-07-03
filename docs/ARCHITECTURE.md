# Architecture

## System Overview

Veilance lets users spend XLM at any online checkout by converting it into a single-use virtual Visa card. The user proves they have sufficient balance using a zero-knowledge proof, the proof is verified on-chain via a Soroban smart contract on Stellar, and a virtual card is issued through Lithic. No merchant integration is required — if a website accepts Visa, Veilance works.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                              │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────┐    ┌───────────────┐  │
│  │   Freighter   │◄──►│   React Dashboard    │◄──►│    Chrome     │  │
│  │   Wallet      │    │  (Vite + noir_js +   │    │   Extension   │  │
│  │              │    │   bb.js WASM)         │    │  (Manifest V3)│  │
│  └──────────────┘    └──────────┬───────────┘    └───────────────┘  │
│                                 │                                    │
│            ZK proof generated entirely in-browser                    │
│            (balance never leaves the client)                         │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │ POST /api/v1/payment/submit
                                  │ { proof, public_inputs, amount_cents }
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FASTAPI BACKEND                              │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────┐    ┌───────────────┐  │
│  │  Stellar      │    │    main.py            │    │   Lithic      │  │
│  │  Service      │◄───│  (routing, schemas,   │───►│   Service     │  │
│  │              │    │   webhook handler)    │    │              │  │
│  └──────┬───────┘    └──────────┬───────────┘    └──────┬────────┘  │
│         │                       │                       │           │
│         │ simulateTransaction   │ SQLite                │ cards.create │
│         ▼                       ▼                       ▼           │
│  ┌──────────────┐    ┌──────────────────────┐    ┌───────────────┐  │
│  │  Soroban RPC  │    │     SQLModel DB       │    │  Lithic API   │  │
│  │  (Testnet)    │    │  (virtual_cards)      │    │  (Sandbox)    │  │
│  └──────┬───────┘    └──────────────────────┘    └───────────────┘  │
└─────────┼───────────────────────────────────────────────────────────┘
          │ invoke verify_proof(public_inputs, proof_bytes)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                STELLAR TESTNET (Soroban)                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Verifier Contract (CD5MQ4EP...EZYL)                         │   │
│  │                                                              │   │
│  │  __constructor(vk_bytes)     — stores VK, immutable          │   │
│  │  verify_proof(pub, proof)    — UltraHonk verification        │   │
│  │  vk_bytes()                  — returns stored VK for audit   │   │
│  │                                                              │   │
│  │  Uses BN254 host functions (g1_add, g1_mul, pairing_check)   │   │
│  │  from Stellar Protocol 26+ (CAP-80)                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Noir ZK Circuit (`smoke-test/circuits/`)

A minimal Noir circuit that proves `balance >= spend_amount` without revealing `balance`.

```noir
fn main(balance: u64, spend_amount: pub u64) {
    assert(balance >= spend_amount);
}
```

- **Private witness**: `balance` — the user's actual XLM balance. Never leaves the browser.
- **Public input**: `spend_amount` — the amount the user wants to spend. Visible to the verifier.
- **Compiled with**: `nargo compile` → `bb write_vk --scheme ultra_honk --oracle_hash keccak`
- **Proof scheme**: UltraHonk (Keccak variant), required for Soroban's BN254 host functions.

### 2. Soroban Verifier Contract (`smoke-test/contracts/`)

A `no_std` Rust smart contract deployed to Stellar testnet. It wraps the `ultrahonk-soroban-verifier` crate, which is a pure-Rust port of Barretenberg's UltraHonk verifier that uses Soroban's BN254 cryptographic host functions (CAP-80).

**Trust model**: The verification key (VK) is set once at deploy time via the constructor. There is no admin key and no upgrade path. Callers must independently verify the stored VK matches the expected circuit before trusting any proof result.

**Key constants**:
- `PROOF_FIELDS = 456` → `PROOF_BYTES = 14,592` (456 × 32-byte field elements)
- `PAIRING_POINTS_SIZE = 16` (appended to public inputs internally)

**Proof layout** (14,592 bytes total):
```
[pairing_point_object: 512B]
[8 G1 commitments: 1024B]          w1, w2, w3, lookup_read_counts/tags, w4, lookup_inverses, z_perm
[sumcheck_univariates: variable]
[sumcheck_evaluations: variable]
[gemini_fold_comms: variable]
[gemini_a_evaluations: variable]
[shplonk_q + kzg_quotient: 256B]
```

### 3. FastAPI Backend (`veilance-app/backend/`)

Python backend that orchestrates the payment flow:

| Module | Responsibility |
|--------|---------------|
| `main.py` | FastAPI app, route definitions, request/response schemas, webhook handler |
| `config.py` | Pydantic Settings — loads `.env`, validates types |
| `models.py` | SQLModel ORM — `VirtualCard` table with full lifecycle tracking |
| `services/stellar.py` | Soroban RPC calls (`simulateTransaction` for proof verification), XLM refunds |
| `services/lithic.py` | Lithic SDK wrapper — card creation, authorization/clearing simulation |

**Proof verification** uses `simulateTransaction` (read-only, no fees, no funded account needed). This invokes the on-chain verifier contract without submitting an actual transaction.

### 4. React Dashboard (`veilance-app/dashboard/`)

Single-page app built with React 18 + Vite + Tailwind CSS. Two pages:

- **Landing** (`/`) — marketing page with wallet connection
- **Dashboard** (`/app`) — the main payment interface

**In-browser proof generation** is the most critical design choice. The dashboard loads the compiled Noir circuit bytecode and uses `@noir-lang/noir_js` + `@aztec/bb.js` (WASM) to generate UltraHonk proofs entirely in the browser. The user's balance (private witness) never leaves the client.

**Proof flow in the browser**:
1. `Noir.init()` → `UltraHonkBackend.init()` with circuit bytecode
2. Generate witness: `noir.execute({ balance, spend_amount })`
3. Generate proof: `backend.generateProof(witness, { keccak: true })`
4. `proof` (14,592 bytes) is sent to the backend as hex
5. `spend_amount` is sent as a 32-byte big-endian field element (raw public input)

### 5. Chrome Extension (`veilance-app/extension/`)

Manifest V3 content script that runs on all pages. It:

1. Listens for `postMessage` events from the dashboard containing card details
2. Detects checkout pages by scanning for payment form fields
3. Auto-fills card number, CVV, and expiry into the detected form fields
4. Falls back to a copy-paste panel when auto-fill is blocked (cross-origin iframes)

## Data Flow: End-to-End Payment

```
Step 1: User connects Freighter wallet on the dashboard
         └→ Dashboard fetches XLM balance from Horizon API

Step 2: User enters spend amount (e.g., $5.00 = 500 cents)
         └→ Dashboard auto-generates ZK proof in WASM:
            • Private input: balance (e.g., 1,000,000 stroops)
            • Public input: spend_amount (500)
            • Output: 14,592-byte UltraHonk proof

Step 3: Dashboard POSTs to /api/v1/payment/submit:
         { proof: "hex...", public_inputs: "hex...", amount_cents: 500 }

Step 4: Backend calls stellar_service.verify_zk_proof():
         └→ Builds Soroban InvokeHostFunction operation
         └→ simulateTransaction against testnet RPC
         └→ Contract returns Ok(()) or Error(VerificationFailed)

Step 5: Backend calls lithic_service.create_virtual_card():
         └→ Creates SINGLE_USE card with spend_limit = amount × 1.05
         └→ Returns PAN, CVV, expiry (available in sandbox mode)

Step 6: Backend returns card details to Dashboard
         └→ Dashboard displays card with copy buttons
         └→ postMessage sends details to Chrome extension

Step 7: Extension auto-fills checkout form OR shows copy panel
```

## Tech Stack Justifications

| Choice | Why |
|--------|-----|
| **Noir + UltraHonk** | First-class Soroban support via `ultrahonk-soroban-verifier`. UltraHonk proofs are compact (14.5 KB) and leverage Stellar's native BN254 host functions for efficient on-chain verification. |
| **Keccak oracle hash** | Required by Soroban's BN254 host functions. Poseidon is also supported but Keccak was chosen for compatibility with the existing verifier crate. |
| **Stellar / Soroban** | Native BN254 cryptographic primitives (CAP-80) make on-chain ZK verification feasible without excessive compute costs. XLM is the native asset on Stellar — no token trust lines needed for the demo. |
| **Lithic** | Purpose-built API for programmatic virtual card issuance. Supports SINGLE_USE cards with per-transaction spend limits — exactly what a payment bridge needs. |
| **FastAPI** | Async-ready Python framework with auto-generated OpenAPI docs. Fast to develop, integrates well with `stellar-sdk` and `lithic` Python packages. |
| **In-browser proof gen** | Privacy-critical: the user's actual balance (private witness) never leaves the browser. The backend only sees the proof and the public spend amount. |
| **SQLite** | Sufficient for hackathon demo. The `VirtualCard` model tracks the full lifecycle (creation → authorization → clearing → refund) for the Buffer & Refund strategy. |
| **simulateTransaction** | Allows proof verification without paying fees or requiring a funded account. Read-only execution on the Soroban VM is free. |

## Key Design Decisions

### Buffer & Refund Strategy

Online checkout totals are unpredictable — tax, shipping, and tips get added after the card number is entered. Instead of trying to predict the exact total:

1. The card is created with a **5% buffer** above the requested amount (e.g., $100 → $105 limit)
2. The merchant charges the actual amount (e.g., $102.40)
3. A Lithic webhook (`transaction.settled`) fires with the actual charged amount
4. The backend calculates `$105 - $102.40 = $2.60` and refunds unused buffer as XLM to the user's Stellar wallet

This approach avoids declined transactions from unexpected surcharges while automatically returning unused funds.

### SINGLE_USE Cards

Each card self-destructs after its first authorization. This means:
- A compromised card number is worthless (already closed)
- One proof = one card = one payment (clean 1:1 mapping)
- The card can still receive refunds after closing (Lithic handles this)

### Immutable Verification Key

The Soroban contract stores the VK at deploy time with no update mechanism. This means the verification logic is fixed and auditable. Anyone can call `vk_bytes()` to retrieve and independently verify the stored VK matches the expected Noir circuit.

### No KYC Requirement

The only identity in the system is the user's Stellar public key (from Freighter). There is no email, phone number, or government ID in the flow. The ZK proof replaces traditional balance verification — the blockchain itself is the source of truth.
