"""
Application Configuration

Centralized configuration management using Pydantic Settings.
All environment variables are loaded and validated here.
"""
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# =============================================================================
# Path Configuration
# =============================================================================

BACKEND_DIR = Path(__file__).parent.parent  # Parent of src/ directory
ENV_FILE = BACKEND_DIR / ".env"


# =============================================================================
# Settings Class
# =============================================================================


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    All configuration values can be overridden via environment variables
    or a .env file in the backend directory.
    """

    # -------------------------------------------------------------------------
    # API Security
    # -------------------------------------------------------------------------
    api_key: str = "changeme"

    # -------------------------------------------------------------------------
    # Lithic Configuration (Virtual Card Provider)
    # -------------------------------------------------------------------------
    lithic_api_key: str = ""
    lithic_environment: Literal["sandbox", "production"] = "sandbox"
    lithic_webhook_secret: str = ""  # Used for webhook signature verification

    # -------------------------------------------------------------------------
    # Stellar / Soroban Configuration
    # -------------------------------------------------------------------------
    verifier_contract_id: str = "CD5MQ4EP23KKSCWZ3ZBX673BFV4OHJEOA3XQBBWG4VDAYECM34U6EZYL"
    stellar_rpc_url: str = "https://soroban-testnet.stellar.org"
    stellar_platform_secret: str = ""  # Platform keypair for USDC refunds
    stellar_escrow_contract: str = ""  # Escrow contract (not yet deployed)

    # -------------------------------------------------------------------------
    # Database
    # -------------------------------------------------------------------------
    database_url: str = "sqlite:///./stellar_pay.db"

    # -------------------------------------------------------------------------
    # Server
    # -------------------------------------------------------------------------
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


# =============================================================================
# Global Settings Instance
# =============================================================================

settings = Settings()
