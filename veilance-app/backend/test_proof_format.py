"""
Debug the proof format difference between browser and on-disk proofs.
Instrument the verify_zk_proof to log sizes before sending to chain.
"""
import sys
sys.path.insert(0, '.')

from src.services.stellar import StellarService

# Simulate what the browser sends after our fix:
# browser proof = pubInputBytes + proof (from bb.js generateProof)
# 
# But bb.js splitHonkProof does:
#   publicInputs = proofWithPublicInputs.slice(0, numPublicInputs * 32)
#   proof = proofWithPublicInputs.slice(numPublicInputs * 32)
#
# Then in dashboard we reconstruct: fullProof = pubInputBytes + proof
# This should give back the original proofWithPublicInputs!
#
# Let's verify with the on-disk proof:

with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/proof', 'rb') as f:
    ondisk_proof = f.read()
with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/public_inputs', 'rb') as f:
    ondisk_pub = f.read()

# The on-disk proof IS proofWithPublicInputs (14592 bytes)
# First 32 bytes should be the public input
print(f"On-disk proof total: {len(ondisk_proof)} bytes")
print(f"On-disk proof first 32 bytes (should be public input): 0x{ondisk_proof[:32].hex()}")
print(f"On-disk public_inputs file: 0x{ondisk_pub.hex()}")
print(f"Match? {ondisk_proof[:32] == ondisk_pub}")
print()

# So if bb.js splitHonkProof splits at numPublicInputs * 32:
#   publicInputsBytes = ondisk_proof[:32]  (the public input)
#   proof = ondisk_proof[32:]              (the rest)
# Then our dashboard reconstructs: pubInputBytes + proof = original. Should be identical.

# But wait — the browser generates a DIFFERENT proof for DIFFERENT inputs!
# User has balance=1000000 (10000.00 USD) and spend_amount=500 (5.00 USD)
# The proof is for those specific values, not for balance=1000, spend_amount=1000

# The question is: does the verifier contract check the public inputs?
# verify_proof(public_inputs, proof_bytes) — the public_inputs are passed separately.
# The on-disk proof's first 32 bytes happen to equal the pub_inputs file.
# But the browser proof's first 32 bytes will be different (500 cents = 0x1f4)

print("Testing: what happens if we pass DIFFERENT public inputs but same proof?")
# Simulate wrong public inputs
wrong_pub = b'\x00' * 31 + b'\x01'  # spend_amount = 1
svc = StellarService()
result = svc.verify_zk_proof(ondisk_proof.hex(), wrong_pub.hex())
wrong_result = "VERIFIED" if result else "FAILED (expected)"
print(f"Wrong public inputs result: {wrong_result}")
