"""
Understand the proof format by analyzing the on-disk proof.
The on-disk proof (14592 bytes) is the output of `bb prove`.
splitHonkProof splits at numPublicInputs * 32 bytes.
Our circuit has 1 public input (spend_amount).
So first 32 bytes should be the public input in the proof.
"""

# Read on-disk proof
with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/proof', 'rb') as f:
    proof = f.read()

with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/public_inputs', 'rb') as f:
    pub = f.read()

# Check VK to get numPublicInputs
# From bb.js: PAIRING_POINTS_SIZE = 16
# numPublicInputs = Number(vkAsFields[1].toString()) - 16
# But we can also just check the proof structure

# If numPublicInputs = 1, then:
# publicInputsBytes = proof[:32]
# proofBytes = proof[32:]

print(f"On-disk proof: {len(proof)} bytes")
print(f"First 32 bytes (public inputs in proof): 0x{proof[:32].hex()}")
print(f"Public inputs file: 0x{pub.hex()}")

# These DON'T match! So what does splitHonkProof really split?
# Let me check if maybe numPublicInputs is different...

# Actually, let me check the VK fields
with open('/Users/rauneetraj/Desktop/projects/Veilance/smoke-test/circuits/target/vk_fields.json', 'r') as f:
    import json
    vk_fields = json.load(f)

# vkAsFields[1] is the circuit_size or num_public_inputs
print(f"\nVK fields (first 5): {vk_fields[:5]}")
# PAIRING_POINTS_SIZE = 16 
pairing_size = 16
if len(vk_fields) > 1:
    val = int(vk_fields[1], 16) if vk_fields[1].startswith('0x') else int(vk_fields[1])
    num_pub = val - pairing_size
    print(f"vkAsFields[1] = {val}, minus PAIRING_POINTS_SIZE({pairing_size}) = {num_pub} public inputs")
    print(f"Split point = {num_pub} * 32 = {num_pub * 32} bytes")
    print(f"Proof prefix ({num_pub * 32} bytes): 0x{proof[:num_pub * 32].hex()[:128]}...")
