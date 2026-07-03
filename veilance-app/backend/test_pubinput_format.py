"""
Capture the actual browser proof and test it against the verifier.
This intercepts the /api/v1/payment/submit endpoint data.
"""
import sys
import json
sys.path.insert(0, '.')

from src.services.stellar import StellarService

# Read on-disk proof for comparison
with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/proof', 'rb') as f:
    ondisk_proof = f.read()
with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/public_inputs', 'rb') as f:
    ondisk_pub = f.read()

svc = StellarService()

# What the dashboard sends vs what the verifier expects
print("=== ON-DISK PROOF (known good) ===")
print(f"Proof size: {len(ondisk_proof)} bytes")
print(f"Public inputs: {ondisk_pub.hex()}")
print()

# The Soroban verifier's verify_proof(public_inputs, proof_bytes)
# From the contract test:
#   pub_inputs = include_bytes!("circuit/target/public_inputs")  // 32 bytes raw
#   proof_bin = include_bytes!("circuit/target/proof")           // 14592 bytes full proof
# 
# So the contract expects:
#   arg[0] = public_inputs = raw 32-byte file (just the value 0x03e8 padded to 32 bytes)
#   arg[1] = proof_bytes = full 14592-byte proof file (which contains embedded public inputs at start)
#
# IMPORTANT: The public_inputs file (32 bytes) contains the RAW public input value (0x03e8)
# but the proof file's first 32 bytes contain a DIFFERENT value (a field element in the proof transcript).
# These are NOT the same thing!
#
# So for the browser proof:
#   We need to send:
#   - proof: the full proofWithPublicInputs (which bb.js splitHonkProof split apart)
#   - public_inputs: the RAW public input value (which bb.js deflattenFields computed from the proof's embedded bytes)
#
# BUT WAIT: the publicInputs from bb.js deflattenFields are the proof-embedded values, 
# NOT the raw circuit public input values! 
# Look at deflattenFields: it just takes the first N*32 bytes from the proof and converts to hex strings.
# So publicInputs[0] = "0x...42ab5d6d1986846cf" (the proof-embedded value), NOT "0x...03e8" (the raw value).

# The raw public input value (0x03e8 = 1000 = spend_amount) is what the contract ACTUALLY wants.
# Let's verify: does the contract succeed with the proof-embedded value instead of the raw value?

print("=== TEST 1: On-disk proof + raw public inputs (should PASS) ===")
r1 = svc.verify_zk_proof(ondisk_proof.hex(), ondisk_pub.hex())
print(f"Result: {'PASS' if r1 else 'FAIL'}")
print()

print("=== TEST 2: On-disk proof + proof-embedded public input bytes (should ???) ===")
embedded_pub = ondisk_proof[:32]  # First 32 bytes of proof  
r2 = svc.verify_zk_proof(ondisk_proof.hex(), embedded_pub.hex())
print(f"Result: {'PASS' if r2 else 'FAIL'}")
print()

# If test 2 fails but test 1 passes, then the dashboard is sending the wrong public_inputs.
# The dashboard should send the RAW public input value, not the proof-embedded value.
print("=== CONCLUSION ===")
if r1 and not r2:
    print("The contract expects RAW public input values, not proof-embedded values.")
    print("Dashboard fix: send raw public_inputs (spend_amount as 32-byte big-endian)")
elif r1 and r2:
    print("Both work — the contract accepts either format.")
