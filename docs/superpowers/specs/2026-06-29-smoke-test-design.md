# Veilance Smoke Test Design

**Date:** 2026-06-29  
**Status:** Approved

## Goal

Validate the entire Veilance toolchain end-to-end before writing any real circuit logic. The circuit is intentionally trivial — any failure is a toolchain issue, not a logic issue.

## Toolchain Versions (pinned)

- Noir: 1.0.0-beta.9
- Barretenberg (bb): 0.87.0
- Rust target: `wasm32v1-none`
- Stellar CLI: ≥ 3.2.0
- Circuits compiled with: `--oracle_hash keccak`

## File Structure

```
smoke-test/
├── circuits/
│   └── src/main.nr              # Trivial a >= b circuit
├── contracts/
│   └── src/lib.rs               # Soroban verifier contract
├── crates/
│   └── ultrahonk-soroban-verifier/
│       ├── Cargo.toml
│       └── src/lib.rs           # Vendored verifier crate (no_std)
├── tests/
│   └── verify.rs                # Integration tests (embed artifacts)
├── Cargo.toml                   # Workspace root
├── justfile                     # All build/test/deploy commands
└── Nargo.toml                   # Circuit project config
```

Build artifacts (`vk`, `proof`, `public_inputs`) land in `circuits/target/` and are embedded via `include_bytes!` in tests.

## Circuit

```noir
// circuits/src/main.nr
fn main(a: Field, b: pub Field) {
    assert(a as u64 >= b as u64);
}
```

- `a` — private witness
- `b` — public input
- Compile: `nargo compile --oracle_hash keccak`
- Prove: `bb prove` with `a=50, b=18`
- Key gen: `bb write_vk`
- Artifacts written to `circuits/target/`: `vk`, `proof`, `public_inputs`

## Soroban Contract

Three entry points:

| Function | Purpose |
|---|---|
| `__constructor(env, vk_bytes)` | Validates and stores VK in instance storage. Rejects re-init. |
| `verify_proof(env, public_inputs, proof_bytes)` | Loads VK, runs UltraHonk verifier, returns Ok or error. |
| `vk_bytes(env)` | Returns stored VK for auditability. |

### Error Taxonomy

```rust
VkInvalidLength = 1
VkInvalidParameters = 2
ProofParseError = 3
VerificationFailed = 4
VkNotSet = 5
AlreadyInitialized = 6
```

### Dependencies

```toml
ultrahonk_soroban_verifier = { path = "../crates/ultrahonk-soroban-verifier" }
```

Cargo target: `wasm32v1-none`. The verifier crate is `no_std`.

## Tests

Two tests in `tests/verify.rs`, both using `env.budget().reset_unlimited()`:

**Happy path:** Embed `vk`, `proof`, `public_inputs` from `circuits/target/`, register contract with VK, call `verify_proof` with valid `a=50, b=18` proof. Expect `Ok(())`.

**Negative path:** Same setup but submit a corrupted proof (one byte flipped). Expect `Err(VerificationFailed)`.

Run: `cargo test --workspace --all-features --release`

## justfile Commands

| Command | Action |
|---|---|
| `just build-circuits` | `nargo compile` + `bb prove` (a=50,b=18) + `bb write_vk` |
| `just build-contract` | `cargo build --target wasm32v1-none --release` |
| `just test` | `cargo test --workspace --all-features --release` |
| `just e2e` | build-circuits → build-contract → test |
| `just deploy` | `stellar contract deploy --wasm ... --network testnet` |
| `just verify <ID>` | `stellar contract invoke --id <ID> --fn verify_proof ...` |
| `just testnet` | deploy → verify (full on-chain round-trip) |

## Success Criteria

1. `just e2e` passes locally — valid proof verifies, invalid proof rejected
2. `just testnet` deploys and returns a successful transaction for the valid proof
3. Invalid proof is rejected on-chain

## Error Handling Rule

If any toolchain version mismatch or unexpected error occurs: **stop and flag it**. Do not silently work around toolchain issues.
