"""
Stellar Network Service

Service for interacting with the Stellar network.

Handles:
- ZK proof verification via the deployed Soroban verifier contract
- XLM refund transactions back to user wallets (Buffer & Refund strategy)
"""
import logging
from decimal import Decimal
from typing import Optional

from stellar_sdk import (
    Account,
    Address,
    Asset,
    Keypair,
    Network,
    Server,
    SorobanServer,
    TransactionBuilder,
    scval,
    xdr as stellar_xdr,
)
from stellar_sdk.exceptions import (
    BadRequestError,
    BadResponseError,
    NotFoundError,
)
from stellar_sdk.operation.invoke_host_function import InvokeHostFunction

from ..config import settings

logger = logging.getLogger(__name__)


class StellarService:
    """
    Service for interacting with Stellar network.
    
    Handles XLM refund transactions back to user wallets.
    """

    # Not used in testnet demo (native XLM is used instead)
    USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
    USDC_ASSET_CODE = "USDC"
    
    # For testnet (development)
    TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

    def __init__(
        self,
        network: str = "testnet",
        platform_secret: Optional[str] = None,
    ) -> None:
        """
        Initialize Stellar service.
        
        Args:
            network: 'testnet' or 'public' (mainnet)
            platform_secret: Platform's Stellar secret key for signing transactions
        """
        self.network = network
        self.platform_secret = platform_secret or settings.stellar_platform_secret
        
        # Set up Stellar Server (Horizon)
        if network == "public":
            self.server = Server("https://horizon.stellar.org")
            self.network_passphrase = Network.PUBLIC_NETWORK_PASSPHRASE
            self.usdc_issuer = self.USDC_ISSUER
        else:
            self.server = Server("https://horizon-testnet.stellar.org")
            self.network_passphrase = Network.TESTNET_NETWORK_PASSPHRASE
            self.usdc_issuer = self.TESTNET_USDC_ISSUER
        
        # Load platform keypair
        if self.platform_secret:
            try:
                self.platform_keypair = Keypair.from_secret(self.platform_secret)
                logger.info(f"Stellar service initialized with platform address: {self.platform_keypair.public_key}")
            except Exception as e:
                logger.error(f"Failed to load platform keypair: {e}")
                self.platform_keypair = None
        else:
            logger.warning("Platform secret key not configured - refunds will not work")
            self.platform_keypair = None

    def send_usdc_refund(
        self,
        destination_address: str,
        amount_cents: int,
        memo: Optional[str] = None,
    ) -> dict:
        """
        Send XLM refund to user's Stellar wallet.
        
        Args:
            destination_address: User's Stellar public key (G...)
            amount_cents: Amount in cents to refund (e.g., 250 = $2.50)
            memo: Optional memo for the transaction
            
        Returns:
            dict with transaction details:
            {
                "success": True,
                "tx_hash": "abc123...",
                "amount_usdc": "2.50",
                "destination": "GABC..."
            }
            
        Raises:
            ValueError: If platform keypair not configured
            BadRequestError: If transaction is malformed
            NotFoundError: If destination account doesn't exist
        """
        if not self.platform_keypair:
            raise ValueError("Platform secret key not configured")
        
        # Convert cents to XLM amount
        # Example: 250 cents = 2.50 XLM
        amount_usdc = Decimal(amount_cents) / Decimal(100)
        amount_str = str(amount_usdc)
        
        logger.info(f"Sending {amount_str} XLM refund to {destination_address}")
        
        try:
            # Load platform account
            platform_account = self.server.load_account(
                self.platform_keypair.public_key
            )
            
            # Create native XLM asset for refund
            usdc = Asset.native()
            
            # Build transaction
            transaction_builder = TransactionBuilder(
                source_account=platform_account,
                network_passphrase=self.network_passphrase,
                base_fee=100,  # 0.00001 XLM
            )
            
            # Add payment operation
            transaction_builder.append_payment_op(
                destination=destination_address,
                asset=usdc,
                amount=amount_str,
            )
            
            # Add memo if provided
            if memo:
                transaction_builder.add_text_memo(memo[:28])  # Max 28 chars
            
            # Set timeout and build
            transaction = transaction_builder.set_timeout(30).build()
            
            # Sign transaction
            transaction.sign(self.platform_keypair)
            
            # Submit to network
            response = self.server.submit_transaction(transaction)
            
            logger.info(f"Refund successful: {response['hash']}")
            
            return {
                "success": True,
                "tx_hash": response["hash"],
                "amount_usdc": amount_str,
                "destination": destination_address,
                "ledger": response.get("ledger"),
            }
            
        except NotFoundError as e:
            logger.error(f"Destination account not found: {destination_address}")
            raise ValueError(f"Destination account does not exist: {destination_address}")
            
        except BadRequestError as e:
            logger.error(f"Bad request error: {e}")
            raise ValueError(f"Transaction failed: {str(e)}")
            
        except BadResponseError as e:
            logger.error(f"Stellar network error: {e}")
            raise RuntimeError(f"Stellar network error: {str(e)}")
            
        except Exception as e:
            logger.error(f"Unexpected error sending refund: {e}")
            raise RuntimeError(f"Failed to send refund: {str(e)}")

    def verify_zk_proof(self, proof_hex: str, public_inputs_hex: str) -> bool:
        """
        Verify a Noir UltraHonk ZK proof on-chain via the Soroban verifier contract.

        Calls verify_proof(public_inputs, proof_bytes) on the deployed contract
        using simulateTransaction — no fees required, no account needed.

        Args:
            proof_hex: Proof bytes as a hex string (raw file output from bb)
            public_inputs_hex: Public inputs bytes as a hex string (raw file output)

        Returns:
            True if the proof is valid, False otherwise.
        """
        proof_hex_clean = proof_hex[2:] if proof_hex.startswith("0x") else proof_hex
        pub_hex_clean = public_inputs_hex[2:] if public_inputs_hex.startswith("0x") else public_inputs_hex
        proof_bytes = bytes.fromhex(proof_hex_clean)
        pub_bytes = bytes.fromhex(pub_hex_clean)

        logger.info(
            f"Verifying ZK proof on-chain: contract={settings.verifier_contract_id}, "
            f"proof_len={len(proof_bytes)}, pub_len={len(pub_bytes)}"
        )

        # Build InvokeHostFunction operation targeting verify_proof
        contract_address = Address(settings.verifier_contract_id).to_xdr_sc_address()

        invoke_args = stellar_xdr.InvokeContractArgs(
            contract_address=contract_address,
            function_name=stellar_xdr.SCSymbol(b"verify_proof"),
            args=[
                scval.to_bytes(pub_bytes),
                scval.to_bytes(proof_bytes),
            ],
        )

        host_function = stellar_xdr.HostFunction(
            type=stellar_xdr.HostFunctionType.HOST_FUNCTION_TYPE_INVOKE_CONTRACT,
            invoke_contract=invoke_args,
        )

        invoke_op = InvokeHostFunction(host_function=host_function, auth=[])

        # Synthetic source account — simulation does not require a funded account
        source_kp = Keypair.random()
        source_acc = Account(source_kp.public_key, 0)

        soroban_server = SorobanServer(settings.stellar_rpc_url)

        tx = (
            TransactionBuilder(source_acc, Network.TESTNET_NETWORK_PASSPHRASE, base_fee=100)
            .append_operation(invoke_op)
            .set_timeout(300)
            .build()
        )

        sim = soroban_server.simulate_transaction(tx)

        if sim.error:
            logger.warning(f"ZK proof verification failed: {sim.error}")
            return False

        logger.info("ZK proof verified successfully on-chain")
        return True

    def validate_address(self, address: str) -> bool:
        """
        Validate a Stellar address format.
        
        Args:
            address: Stellar public key to validate
            
        Returns:
            True if valid format, False otherwise
        """
        try:
            # Check if it's a valid Stellar public key
            Keypair.from_public_key(address)
            return True
        except Exception:
            return False

    def check_account_exists(self, address: str) -> bool:
        """
        Check if a Stellar account exists on the network.
        
        Args:
            address: Stellar public key
            
        Returns:
            True if account exists, False otherwise
        """
        try:
            self.server.load_account(address)
            return True
        except NotFoundError:
            return False
        except Exception as e:
            logger.error(f"Error checking account: {e}")
            return False


# Global instance
stellar_service = StellarService()
