# Veilance Smoke Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-step end-to-end smoke test that proves a trivial Noir circuit (`a >= b`) locally and verifies the proof via a Soroban contract on Stellar testnet.

**Architecture:** Cargo workspace under `smoke-test/` containing three members: the verifier crate (`crates/ultrahonk-soroban-verifier/`), the Soroban contract (`contracts/`), and circuit artifacts (`circuits/`). Integration tests live inside the contract package (`contracts/tests/`), importing the contract type directly so no WASM build is needed for unit testing. A `justfile` at `smoke-test/` drives all build, test, and deploy steps.

**Tech Stack:** Noir 1.0.0-beta.9, Barretenberg 0.87.0, Rust/Soroban SDK 26.0.1, `wasm32v1-none`, Stellar CLI ≥ 3.2.0.

## Global Constraints

- Noir version must be exactly `1.0.0-beta.9` — `nargo --version` must confirm
- Barretenberg (bb) version must be exactly `0.87.0` — `bb --version` must confirm
- Stellar CLI must be ≥ 3.2.0 — `stellar --version` must confirm
- Rust WASM target `wasm32v1-none` must be installed
- `soroban-sdk = "26.0.1"` (crates.io, not git) — do NOT change this pin
- `--oracle_hash keccak` flag is passed to `bb prove` and `bb write_vk` — NOT to `nargo compile`
- **STOP AND FLAG** any version mismatch or unexpected toolchain error — do NOT silently work around it
- Commit source files at end of each task; do not commit build artifacts (`circuits/target/`, `target/`)

---

## File Map

```
smoke-test/
├── circuits/
│   ├── Nargo.toml                             # Circuit project config (create)
│   ├── Prover.toml                            # Input: a=50, b=18 (create)
│   └── src/
│       └── main.nr                            # Circuit: a >= b (create)
├── contracts/
│   ├── Cargo.toml                             # Contract crate manifest (create)
│   ├── src/
│   │   └── lib.rs                             # Soroban verifier contract (create)
│   └── tests/
│       └── verify.rs                          # Integration tests (create)
├── crates/
│   └── ultrahonk-soroban-verifier/
│       ├── Cargo.toml                         # Verifier crate manifest (create)
│       └── src/
│           ├── lib.rs                         # Re-exports + constants (copy from yugocabrio)
│           ├── debug.rs                       # (copy from yugocabrio)
│           ├── ec.rs                          # (copy from yugocabrio)
│           ├── field.rs                       # (copy from yugocabrio)
│           ├── hash.rs                        # (copy from yugocabrio)
│           ├── relations.rs                   # (copy from yugocabrio)
│           ├── shplemini.rs                   # (copy from yugocabrio)
│           ├── sumcheck.rs                    # (copy from yugocabrio)
│           ├── transcript.rs                  # (copy from yugocabrio)
│           ├── types.rs                       # (copy from yugocabrio)
│           ├── utils.rs                       # (copy from yugocabrio)
│           └── verifier.rs                    # (copy from yugocabrio)
├── Cargo.toml                                 # Workspace root (create)
└── justfile                                   # Build/test/deploy commands (create)
```

---

## Task 1: Workspace Scaffold + Tool Verification

**Files:**
- Create: `smoke-test/Cargo.toml`
- Create: `smoke-test/.gitignore`

**Interfaces:**
- Produces: Cargo workspace with two members (`contracts`, `crates/ultrahonk-soroban-verifier`), soroban-sdk 26.0.1 pinned as workspace dep

- [ ] **Step 1: Verify tool versions**

```bash
nargo --version
bb --version
stellar --version
rustup target list --installed | grep wasm32v1-none
```

Expected output (exact):
```
nargo version = 1.0.0-beta.9
bb version = 0.87.0
stellar <version ≥ 3.2.0>
wasm32v1-none (installed)
```

**If any check fails: STOP. Do not proceed. Report the mismatch.**

To install the WASM target if missing:
```bash
rustup target add wasm32v1-none
```

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p smoke-test/circuits/src
mkdir -p smoke-test/contracts/src
mkdir -p smoke-test/contracts/tests
mkdir -p smoke-test/crates/ultrahonk-soroban-verifier/src
```

- [ ] **Step 3: Create workspace Cargo.toml**

Create `smoke-test/Cargo.toml`:

```toml
[workspace]
members = [
    "contracts",
    "crates/ultrahonk-soroban-verifier",
]
resolver = "2"

[workspace.dependencies]
soroban-sdk = { version = "26.0.1", default-features = false }
```

- [ ] **Step 4: Create .gitignore**

Create `smoke-test/.gitignore`:

```
/target/
circuits/target/
```

- [ ] **Step 5: Verify workspace parses**

```bash
cd smoke-test && cargo metadata --no-deps --format-version 1 2>&1 | head -5
```

Expected: JSON output (may warn about missing members — that's fine for now, they'll be added in later tasks).

- [ ] **Step 6: Commit**

```bash
cd smoke-test && git add Cargo.toml .gitignore
git commit -m "chore: initialize smoke-test workspace"
```

---

## Task 2: Noir Circuit + Artifact Generation

**Files:**
- Create: `smoke-test/circuits/Nargo.toml`
- Create: `smoke-test/circuits/Prover.toml`
- Create: `smoke-test/circuits/src/main.nr`

**Interfaces:**
- Produces: `circuits/target/vk`, `circuits/target/proof`, `circuits/target/public_inputs` (binary files embedded in tests via `include_bytes!`)

- [ ] **Step 1: Create Nargo.toml**

Create `smoke-test/circuits/Nargo.toml`:

```toml
[package]
name = "smoke_test"
type = "bin"
authors = [""]
compiler_version = ">=1.0.0-beta.9"

[dependencies]
```

- [ ] **Step 2: Create circuit source**

Create `smoke-test/circuits/src/main.nr`:

```noir
fn main(a: Field, b: pub Field) {
    assert(a as u64 >= b as u64);
}
```

- `a` is the private witness (prover knows it, verifier does not).
- `b` is the public input (visible to the verifier on-chain).

- [ ] **Step 3: Create Prover.toml**

Create `smoke-test/circuits/Prover.toml`:

```toml
a = "50"
b = "18"
```

- [ ] **Step 4: Compile the circuit**

```bash
cd smoke-test/circuits && nargo compile
```

Expected: creates `circuits/target/smoke_test.json` (bytecode).
If `--oracle_hash` errors appear, ignore — that flag is NOT for nargo compile.

- [ ] **Step 5: Execute to generate witness**

```bash
cd smoke-test/circuits && nargo execute
```

Expected: creates `circuits/target/smoke_test.gz` (witness file).

- [ ] **Step 6: Generate verification key**

```bash
cd smoke-test/circuits && bb write_vk \
  --scheme ultra_honk \
  --oracle_hash keccak \
  --bytecode_path ./target/smoke_test.json \
  --output_path ./target \
  --output_format bytes_and_fields
```

Expected: creates `circuits/target/vk`.

- [ ] **Step 7: Generate proof**

```bash
cd smoke-test/circuits && bb prove \
  --scheme ultra_honk \
  --oracle_hash keccak \
  --bytecode_path ./target/smoke_test.json \
  --witness_path ./target/smoke_test.gz \
  --output_path ./target \
  --output_format bytes_and_fields
```

Expected: creates `circuits/target/proof` and `circuits/target/public_inputs`.

- [ ] **Step 8: Verify artifacts exist and check proof size**

```bash
ls -la smoke-test/circuits/target/vk smoke-test/circuits/target/proof smoke-test/circuits/target/public_inputs
wc -c smoke-test/circuits/target/proof
```

Expected: `proof` is exactly **14592 bytes** (`456 fields × 32 bytes = PROOF_BYTES`). If it's a different size, STOP and report.

- [ ] **Step 9: Verify locally with bb**

```bash
cd smoke-test/circuits && bb verify \
  --scheme ultra_honk \
  --oracle_hash keccak \
  --proof_path ./target/proof \
  --vk_path ./target/vk
```

Expected: `Proof verified successfully`.

- [ ] **Step 10: Commit circuit source**

```bash
cd smoke-test && git add circuits/Nargo.toml circuits/Prover.toml circuits/src/main.nr
git commit -m "feat: add trivial a>=b Noir circuit"
```

(Do NOT commit `circuits/target/` — it's in `.gitignore`.)

---

## Task 3: Vendor ultrahonk-soroban-verifier Crate

**Files:**
- Create: `smoke-test/crates/ultrahonk-soroban-verifier/Cargo.toml`
- Create: `smoke-test/crates/ultrahonk-soroban-verifier/src/*.rs` (12 files)

**Interfaces:**
- Produces: `ultrahonk_soroban_verifier` crate exposing `UltraHonkVerifier`, `VkLoadError`, `PROOF_BYTES = 14592`
- Consumed by: `contracts/src/lib.rs` and `contracts/tests/verify.rs`

- [ ] **Step 1: Clone reference repo to a temp location**

```bash
git clone --depth 1 https://github.com/yugocabrio/rs-soroban-ultrahonk /tmp/rs-soroban-ultrahonk
```

- [ ] **Step 2: Copy verifier source files**

```bash
cp -r /tmp/rs-soroban-ultrahonk/crates/ultrahonk-soroban-verifier/src/* \
  smoke-test/crates/ultrahonk-soroban-verifier/src/
```

This copies 12 files: `lib.rs`, `debug.rs`, `ec.rs`, `field.rs`, `hash.rs`, `relations.rs`, `shplemini.rs`, `sumcheck.rs`, `transcript.rs`, `types.rs`, `utils.rs`, `verifier.rs`.

Verify:
```bash
ls smoke-test/crates/ultrahonk-soroban-verifier/src/
```

Expected: 12 `.rs` files listed.

- [ ] **Step 3: Create verifier crate Cargo.toml**

Create `smoke-test/crates/ultrahonk-soroban-verifier/Cargo.toml`:

```toml
[package]
name = "ultrahonk_soroban_verifier"
version = "0.1.0"
edition = "2021"
license = "MIT"

[features]
std = []
trace = []

[dependencies]
soroban-sdk = { workspace = true }
```

- [ ] **Step 4: Check crate compiles**

```bash
cd smoke-test && cargo check -p ultrahonk_soroban_verifier
```

Expected: `Finished` with no errors.
If there are errors about missing `soroban-sdk` features, check that the workspace `Cargo.toml` has `soroban-sdk = { version = "26.0.1", default-features = false }`.

- [ ] **Step 5: Commit**

```bash
cd smoke-test && git add crates/
git commit -m "feat: vendor ultrahonk-soroban-verifier crate from yugocabrio/rs-soroban-ultrahonk"
```

---

## Task 4: Write Failing Integration Tests (TDD)

**Files:**
- Create: `smoke-test/contracts/Cargo.toml` (minimal, enough for test to compile)
- Create: `smoke-test/contracts/src/lib.rs` (stub — just `#![no_std]`)
- Create: `smoke-test/contracts/tests/verify.rs`

**Interfaces:**
- Consumes: `circuits/target/vk`, `circuits/target/proof`, `circuits/target/public_inputs` (must exist from Task 2)
- Consumes: `ultrahonk_soroban_verifier::PROOF_BYTES` (from Task 3)
- Produces: two tests — `verify_valid_proof_passes` and `verify_mutated_proof_fails` — that compile and FAIL until the contract is implemented

- [ ] **Step 1: Create contracts Cargo.toml**

Create `smoke-test/contracts/Cargo.toml`:

```toml
[package]
name = "veilance-verifier"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
soroban-sdk = { workspace = true, features = ["alloc"] }
ultrahonk_soroban_verifier = { path = "../crates/ultrahonk-soroban-verifier", default-features = false }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils", "alloc"] }
soroban-env-host = "26.1.3"
ultrahonk_soroban_verifier = { path = "../crates/ultrahonk-soroban-verifier", default-features = false }

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
```

- [ ] **Step 2: Create stub contract lib.rs**

Create `smoke-test/contracts/src/lib.rs`:

```rust
#![no_std]
// Stub — implementation added in Task 5
```

- [ ] **Step 3: Create test file**

Create `smoke-test/contracts/tests/verify.rs`:

```rust
use soroban_sdk::{Bytes, Env};
use ultrahonk_soroban_verifier::PROOF_BYTES;
use veilance_verifier::{Error, UltraHonkVerifierContract, UltraHonkVerifierContractClient};

fn setup_client<'a>(env: &'a Env, vk_raw: &[u8]) -> UltraHonkVerifierContractClient<'a> {
    let vk = Bytes::from_slice(env, vk_raw);
    let contract_id = env.register(UltraHonkVerifierContract, (vk,));
    UltraHonkVerifierContractClient::new(env, &contract_id)
}

fn mutate_byte(bytes: &[u8], offset: usize, mask: u8) -> Vec<u8> {
    let mut v = bytes.to_vec();
    v[offset] ^= mask;
    v
}

#[test]
fn verify_valid_proof_passes() {
    let vk_raw: &[u8] = include_bytes!("../../circuits/target/vk");
    let proof_raw: &[u8] = include_bytes!("../../circuits/target/proof");
    let pub_inputs_raw: &[u8] = include_bytes!("../../circuits/target/public_inputs");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    assert_eq!(proof_raw.len(), PROOF_BYTES, "proof size mismatch — re-run bb prove");

    let client = setup_client(&env, vk_raw);
    let proof = Bytes::from_slice(&env, proof_raw);
    let pub_inputs = Bytes::from_slice(&env, pub_inputs_raw);

    client.verify_proof(&pub_inputs, &proof);
}

#[test]
fn verify_mutated_proof_fails() {
    let vk_raw: &[u8] = include_bytes!("../../circuits/target/vk");
    let proof_raw: &[u8] = include_bytes!("../../circuits/target/proof");
    let pub_inputs_raw: &[u8] = include_bytes!("../../circuits/target/public_inputs");

    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let contract_id = env.register(
        UltraHonkVerifierContract,
        (Bytes::from_slice(&env, vk_raw),),
    );

    let bad_proof = Bytes::from_slice(&env, &mutate_byte(proof_raw, 100, 0x01));
    let pub_inputs = Bytes::from_slice(&env, pub_inputs_raw);

    let err = env
        .as_contract(&contract_id, || {
            UltraHonkVerifierContract::verify_proof(
                env.clone(),
                pub_inputs.clone(),
                bad_proof.clone(),
            )
        })
        .expect_err("expected VerificationFailed");

    assert_eq!(err as u32, Error::VerificationFailed as u32);
}
```

- [ ] **Step 4: Run tests — expect compilation failure**

```bash
cd smoke-test && cargo test -p veilance-verifier 2>&1 | head -30
```

Expected failure: `error[E0433]: failed to resolve: use of undeclared type UltraHonkVerifierContract` (or similar — the contract types don't exist yet). This confirms the test is correctly written and wired up.

- [ ] **Step 5: Commit**

```bash
cd smoke-test && git add contracts/
git commit -m "test: add failing integration tests for UltraHonk verifier"
```

---

## Task 5: Implement Soroban Verifier Contract → Tests Pass

**Files:**
- Modify: `smoke-test/contracts/src/lib.rs` (replace stub with full implementation)

**Interfaces:**
- Consumes: `UltraHonkVerifier`, `VkLoadError`, `PROOF_BYTES` from `ultrahonk_soroban_verifier`
- Produces: `UltraHonkVerifierContract` with `__constructor`, `verify_proof`, `vk_bytes` entry points; `Error` enum with 6 variants

- [ ] **Step 1: Implement lib.rs**

Replace `smoke-test/contracts/src/lib.rs` with:

```rust
#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, symbol_short, Bytes, Env, Symbol};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, VkLoadError, PROOF_BYTES};

/// On-chain UltraHonk proof verifier.
///
/// Trust model: no admin key, no upgrade path. The VK is set once at deploy time.
/// Callers MUST independently verify the stored VK (via `vk_bytes`) against a
/// known-good circuit before trusting any proof. The contract address alone is
/// NOT a trust anchor.
#[contract]
pub struct UltraHonkVerifierContract;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    VkInvalidLength = 1,
    VkInvalidParameters = 2,
    ProofParseError = 3,
    VerificationFailed = 4,
    VkNotSet = 5,
    AlreadyInitialized = 6,
}

#[contractimpl]
impl UltraHonkVerifierContract {
    fn key_vk() -> Symbol {
        symbol_short!("vk")
    }

    pub fn __constructor(env: Env, vk_bytes: Bytes) -> Result<(), Error> {
        if env.storage().instance().has(&Self::key_vk()) {
            return Err(Error::AlreadyInitialized);
        }
        let _ = UltraHonkVerifier::new(&env, &vk_bytes).map_err(|e| match e {
            VkLoadError::WrongLength => Error::VkInvalidLength,
            VkLoadError::InvalidParameters => Error::VkInvalidParameters,
        })?;
        env.storage().instance().set(&Self::key_vk(), &vk_bytes);
        Ok(())
    }

    pub fn vk_bytes(env: Env) -> Result<Bytes, Error> {
        env.storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(Error::VkNotSet)
    }

    pub fn verify_proof(env: Env, public_inputs: Bytes, proof_bytes: Bytes) -> Result<(), Error> {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return Err(Error::ProofParseError);
        }
        let vk_bytes: Bytes = env
            .storage()
            .instance()
            .get(&Self::key_vk())
            .ok_or(Error::VkNotSet)?;
        let verifier = UltraHonkVerifier::new(&env, &vk_bytes).map_err(|e| match e {
            VkLoadError::WrongLength => Error::VkInvalidLength,
            VkLoadError::InvalidParameters => Error::VkInvalidParameters,
        })?;
        verifier
            .verify(&env, &proof_bytes, &public_inputs)
            .map_err(|_| Error::VerificationFailed)
    }
}
```

- [ ] **Step 2: Check it compiles**

```bash
cd smoke-test && cargo check -p veilance-verifier
```

Expected: `Finished` with no errors.

- [ ] **Step 3: Run tests**

```bash
cd smoke-test && cargo test -p veilance-verifier --release -- --nocapture
```

Expected output:
```
test verify_valid_proof_passes ... ok
test verify_mutated_proof_fails ... ok

test result: ok. 2 passed; 0 failed
```

If `verify_valid_proof_passes` fails with a panic, the proof or VK was not generated correctly — re-run Task 2 steps 6–9. **Do not move on until both tests pass.**

- [ ] **Step 4: Commit**

```bash
cd smoke-test && git add contracts/src/lib.rs
git commit -m "feat: implement UltraHonk Soroban verifier contract"
```

---

## Task 6: justfile + e2e

**Files:**
- Create: `smoke-test/justfile`

**Interfaces:**
- Consumes: all build artifacts from Tasks 2 and 5
- Produces: `just e2e` runs the full local pipeline; `just testnet` drives on-chain deployment and verification

- [ ] **Step 1: Create justfile**

Create `smoke-test/justfile`:

```just
set dotenv-load := true

CIRCUIT_DIR := "circuits"
CONTRACT_WASM := "target/wasm32v1-none/release/veilance_verifier.wasm"
NETWORK := env_var_or_default("STELLAR_NETWORK", "testnet")
ACCOUNT := env_var_or_default("STELLAR_ACCOUNT", "veilance-smoke")
CONTRACT_ID_FILE := ".contract_id"

# Show available commands
default:
    @just --list

# Verify toolchain versions
check-tools:
    @echo "nargo: $(nargo --version)"
    @echo "bb: $(bb --version)"
    @echo "stellar: $(stellar --version)"
    @rustup target list --installed | grep wasm32v1-none || echo "MISSING: wasm32v1-none"

# Compile Noir circuit + generate vk, proof, public_inputs
build-circuits:
    cd {{CIRCUIT_DIR}} && nargo compile
    cd {{CIRCUIT_DIR}} && nargo execute
    cd {{CIRCUIT_DIR}} && bb write_vk \
        --scheme ultra_honk \
        --oracle_hash keccak \
        --bytecode_path ./target/smoke_test.json \
        --output_path ./target \
        --output_format bytes_and_fields
    cd {{CIRCUIT_DIR}} && bb prove \
        --scheme ultra_honk \
        --oracle_hash keccak \
        --bytecode_path ./target/smoke_test.json \
        --witness_path ./target/smoke_test.gz \
        --output_path ./target \
        --output_format bytes_and_fields
    @echo "Artifacts: $(ls circuits/target/vk circuits/target/proof circuits/target/public_inputs)"

# Build Soroban contract WASM
build-contract:
    stellar contract build --manifest-path contracts/Cargo.toml

# Run integration tests
test:
    cargo test -p veilance-verifier --release -- --nocapture

# Full local end-to-end: circuits → contract → tests
e2e: build-circuits build-contract test

# Fund a new testnet account (run once)
fund:
    stellar keys generate {{ACCOUNT}} --network testnet || true
    stellar keys address {{ACCOUNT}}
    @echo "Funding via Friendbot..."
    stellar friendbot --network testnet $(stellar keys address {{ACCOUNT}})

# Deploy contract to testnet with VK from circuits/target/vk
deploy:
    stellar contract deploy \
        --wasm {{CONTRACT_WASM}} \
        --source {{ACCOUNT}} \
        --network {{NETWORK}} \
        -- \
        --vk_bytes-file-path circuits/target/vk \
    | tee {{CONTRACT_ID_FILE}}
    @echo "Contract deployed: $(cat {{CONTRACT_ID_FILE}})"

# Invoke verify_proof on a deployed contract
verify contract_id=`cat .contract_id 2>/dev/null || echo ""`:
    stellar contract invoke \
        --id {{contract_id}} \
        --source {{ACCOUNT}} \
        --network {{NETWORK}} \
        --send yes \
        -- \
        verify_proof \
        --public_inputs-file-path circuits/target/public_inputs \
        --proof_bytes-file-path circuits/target/proof
    @echo "Proof verified on-chain!"

# Full testnet pipeline: fund (if needed) → deploy → verify
testnet: build-circuits build-contract deploy verify
```

- [ ] **Step 2: Run just e2e**

```bash
cd smoke-test && just e2e
```

Expected: builds circuits, compiles WASM, runs both tests — all green.

If `build-contract` fails with a linker error about `wasm32v1-none`, run:
```bash
rustup target add wasm32v1-none
```

- [ ] **Step 3: Commit**

```bash
cd smoke-test && git add justfile
git commit -m "feat: add justfile with e2e and testnet targets"
```

---

## Task 7: Testnet Deploy + On-Chain Verification

**Interfaces:**
- Consumes: funded testnet account, circuit artifacts from Task 2, WASM from Task 6
- Produces: `CONTRACT_ID` stored in `.contract_id`; on-chain transaction confirming valid proof passes and (manually) invalid proof would fail

- [ ] **Step 1: Fund testnet account**

```bash
cd smoke-test && just fund
```

Expected: prints a Stellar public key and "Success" from Friendbot.

If you already have a funded account, set it via `STELLAR_ACCOUNT=<your-key-name>` in a `.env` file at `smoke-test/.env`.

- [ ] **Step 2: Deploy contract**

```bash
cd smoke-test && just deploy
```

Expected: prints and saves a contract address like `CXXXX...` to `.contract_id`.

If deployment fails with a budget error, add `--fee 10000000` to the deploy command.

- [ ] **Step 3: Submit valid proof on-chain**

```bash
cd smoke-test && just verify
```

Expected output:
```
Proof verified on-chain!
```

The Stellar CLI will print a transaction hash. Record it.

- [ ] **Step 4: Confirm the transaction on testnet explorer**

Open the transaction hash at `https://stellar.expert/explorer/testnet/tx/<TX_HASH>` and confirm the result is `success`.

- [ ] **Step 5: Verify vk_bytes accessor works**

```bash
CONTRACT_ID=$(cat smoke-test/.contract_id)
stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source veilance-smoke \
    --network testnet \
    -- \
    vk_bytes
```

Expected: prints the hex-encoded VK bytes (same content as `circuits/target/vk`).

- [ ] **Step 6: Commit testnet result**

```bash
cd smoke-test && git add .contract_id
git commit -m "chore: record testnet contract ID from smoke test deployment"
```

---

## Self-Review Checklist (pre-commit)

- [ ] `just e2e` passes locally (both tests green, WASM builds clean)
- [ ] `just testnet` produces a successful on-chain transaction
- [ ] No hardcoded secrets or private keys committed
- [ ] All toolchain versions verified at Task 1 Step 1
- [ ] `.contract_id` committed (not `.gitignore`d)
- [ ] `circuits/target/` and `target/` are gitignored (not committed)
