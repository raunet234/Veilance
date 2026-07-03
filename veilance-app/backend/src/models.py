"""
Database Models

SQLModel definitions for virtual card and transaction state management.
These models define the schema for tracking the complete payment lifecycle.
"""
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlmodel import Field, SQLModel


# =============================================================================
# Utility Functions
# =============================================================================


def utc_now() -> datetime:
    """Return the current UTC datetime with timezone info."""
    return datetime.now(timezone.utc)


# =============================================================================
# Virtual Card Model
# =============================================================================


class VirtualCard(SQLModel, table=True):
    """
    Virtual card database model.

    Represents a Lithic virtual card linked to a blockchain transaction.
    Tracks the complete payment lifecycle from creation through clearing,
    including authorization, settlement, and refund states.

    Attributes:
        id: Unique card identifier (UUID)
        stellar_transaction_id: Blockchain transaction hash (Stellar)
        user_stellar_address: User's wallet address for refunds
        amount_cents: Original payment amount in cents
        spend_limit_cents: Card spend limit including buffer
        lithic_card_token: Lithic's card identifier
        authorization_token: Lithic authorization transaction token
        cleared: Whether the transaction has settled
    """

    __tablename__ = "virtual_cards"

    # Primary key
    id: str = Field(
        default_factory=lambda: str(uuid4()),
        primary_key=True,
        index=True,
        description="Unique card identifier (UUID)",
    )

    # Stellar-side tracking
    stellar_transaction_id: str = Field(
        index=True,
        description="Stellar transaction hash or unique identifier",
    )
    user_stellar_address: Optional[str] = Field(
        default=None,
        index=True,
        description="User's Stellar wallet address for refunds",
    )
    amount_cents: int = Field(
        description="Amount in minor currency units (cents)",
    )
    spend_limit_cents: Optional[int] = Field(
        default=None,
        description="Spend limit set on card (including slippage buffer)",
    )
    merchant_name: Optional[str] = Field(
        default=None,
        description="Expected merchant name for this payment",
    )

    # Lithic card details
    lithic_card_token: Optional[str] = Field(
        default=None,
        index=True,
        description="Lithic card token (identifier)",
    )
    last_four: Optional[str] = Field(
        default=None,
        description="Last 4 digits of card number",
    )
    exp_month: Optional[str] = Field(
        default=None,
        description="Expiration month (MM)",
    )
    exp_year: Optional[str] = Field(
        default=None,
        description="Expiration year (YYYY)",
    )
    card_state: Optional[str] = Field(
        default=None,
        description="Lithic card state (OPEN, CLOSED, PAUSED, etc.)",
    )

    # Sensitive data (sandbox only - for testing/simulation)
    card_pan: Optional[str] = Field(
        default=None,
        description="Full card number (PAN) - sandbox only",
    )
    card_cvv: Optional[str] = Field(
        default=None,
        description="Card CVV - sandbox only",
    )

    # Transaction lifecycle
    authorization_token: Optional[str] = Field(
        default=None,
        description="Lithic authorization transaction token",
    )
    authorization_amount_cents: Optional[int] = Field(
        default=None,
        description="Authorized amount in cents",
    )
    authorized_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp of authorization",
    )
    
    cleared: bool = Field(
        default=False,
        description="Whether the transaction has been cleared",
    )
    cleared_amount_cents: Optional[int] = Field(
        default=None,
        description="Cleared amount in cents",
    )
    cleared_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp of clearing",
    )
    clearing_debug_id: Optional[str] = Field(
        default=None,
        description="Lithic debugging request ID for clearing",
    )

    # Refund tracking (Buffer & Refund strategy)
    actual_charged_cents: Optional[int] = Field(
        default=None,
        description="Actual amount charged by merchant (from webhook)",
    )
    refund_amount_cents: Optional[int] = Field(
        default=None,
        description="Amount refunded to user in cents (unused buffer)",
    )
    refund_stellar_tx: Optional[str] = Field(
        default=None,
        description="Stellar transaction hash for refund payment",
    )
    refunded_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when refund was sent to user's wallet",
    )

    # Audit timestamps
    created_at: datetime = Field(
        default_factory=utc_now,
        description="Record creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        description="Record last update timestamp",
    )

    def mark_authorized(
        self,
        authorization_token: str,
        amount_cents: int,
    ) -> None:
        """Mark card as authorized with transaction details."""
        self.authorization_token = authorization_token
        self.authorization_amount_cents = amount_cents
        self.authorized_at = utc_now()
        self.updated_at = utc_now()

    def mark_cleared(
        self,
        amount_cents: int,
        clearing_debug_id: Optional[str] = None,
    ) -> None:
        """Mark card transaction as cleared."""
        self.cleared = True
        self.cleared_amount_cents = amount_cents
        self.cleared_at = utc_now()
        if clearing_debug_id:
            self.clearing_debug_id = clearing_debug_id
        self.updated_at = utc_now()
