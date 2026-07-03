"""Test the Soroban verifier with the known-good on-disk proof artifacts."""
import sys
sys.path.insert(0, '.')

from src.services.stellar import StellarService

svc = StellarService()

# Read on-disk proof artifacts
with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/proof', 'rb') as f:
    proof_bytes = f.read()
with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/public_inputs', 'rb') as f:
    pub_bytes = f.read()

proof_hex = proof_bytes.hex()
pub_hex = pub_bytes.hex()

print(f"Proof size: {len(proof_bytes)} bytes ({len(proof_hex)} hex chars)")
print(f"Public inputs size: {len(pub_bytes)} bytes ({len(pub_hex)} hex chars)")
print(f"Public inputs value: 0x{pub_hex}")
print()
print("Testing on-chain verification...")

result = svc.verify_zk_proof(proof_hex, pub_hex)
print(f"Result: {'✅ VERIFIED' if result else '❌ FAILED'}")
