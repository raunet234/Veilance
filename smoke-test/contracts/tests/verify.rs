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
