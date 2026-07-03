# API Reference

Base URL: `http://localhost:8000` (dev) · Swagger UI at `/docs`

All endpoints except `/health` and `/webhooks/lithic` require the `X-API-Key` header.

---

## Health

### `GET /health`

Returns server status. No authentication required.

**Response** `200`
```json
{
  "status": "ok",
  "timestamp": "2026-07-03T00:04:09.325337",
  "environment": "sandbox"
}
```

---

## Payment

### `POST /api/v1/payment/initiate`

Initiate a new payment session. Returns details needed to build the Stellar deposit transaction.

**Headers**: `X-API-Key: <api_key>`

**Request**
```json
{
  "amount": 5.00,
  "user_public_key": "GBCJ...",
  "merchant_name": "Example Store"
}
```

**Response** `200`
```json
{
  "session_id": "uuid",
  "escrow_account": "CD5MQ4EP...",
  "amount_usdc": 5.25,
  "expires_at": "2026-07-03T00:14:09Z",
  "merchant_address": "GBCJ..."
}
```

> **Note**: `amount_usdc` includes a 5% buffer (e.g., $5.00 → $5.25).

---

### `POST /api/v1/payment/submit`

**The primary endpoint.** Verifies a ZK proof on-chain via the Soroban verifier contract, then issues a Lithic virtual card.

**Headers**: `X-API-Key: <api_key>`, `Content-Type: application/json`

**Request**
```json
{
  "proof": "hex-encoded proof bytes (14592 bytes = 29184 hex chars)",
  "public_inputs": "hex-encoded public inputs (32 bytes = 64 hex chars)",
  "stellar_address": "GBCJ...",
  "amount_cents": 500,
  "tx_hash": "optional stellar tx hash"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `proof` | string | UltraHonk proof bytes as hex. Must be exactly 14,592 bytes (29,184 hex chars). |
| `public_inputs` | string | Raw public input (spend_amount) as 32-byte big-endian hex. |
| `stellar_address` | string | User's Stellar public key for future refunds. |
| `amount_cents` | integer | Spend amount in cents (must match the public input value). |
| `tx_hash` | string | Optional Stellar deposit transaction hash. |

**Response** `200` — proof verified, card issued
```json
{
  "id": "lithic_card_token",
  "pan": "4111111111111234",
  "cvv": "123",
  "exp_month": "07",
  "exp_year": "2027",
  "last_four": "1234",
  "amount_cents": 500,
  "state": "OPEN",
  "tx_hash": "",
  "verified": true
}
```

**Response** `400` — proof verification failed
```json
{
  "detail": "ZK proof verification failed"
}
```

**Response** `500` — card creation failed
```json
{
  "detail": "Card creation failed: <error message>"
}
```

---

## Cards

### `POST /api/v1/cards/create`

Create a virtual card directly (without ZK proof verification). Useful for testing.

**Headers**: `X-API-Key: <api_key>`

**Request**
```json
{
  "stellar_transaction_id": "tx_hash_or_id",
  "user_stellar_address": "GBCJ...",
  "amount_cents": 1000,
  "merchant_name": "Test Merchant"
}
```

**Response** `200` — `VirtualCardResponse` (see schema below)

---

### `GET /api/v1/cards/{card_id}`

Retrieve details for a specific virtual card by its UUID.

**Headers**: `X-API-Key: <api_key>`

**Response** `200` — `VirtualCardResponse`

---

### `GET /api/v1/cards`

List all virtual cards with pagination.

**Headers**: `X-API-Key: <api_key>`

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | 100 | Max results to return |
| `offset` | int | 0 | Pagination offset |
| `session_id` | string | — | Filter by session ID |
| `stellar_transaction_id` | string | — | Filter by Stellar tx hash |

**Response** `200` — `VirtualCardResponse[]`

---

### `GET /api/v1/cards/by-transaction/{transaction_id}`

Retrieve a card by its Stellar transaction ID. Used by the extension to poll for card creation after deposit.

**Headers**: `X-API-Key: <api_key>`

**Response** `200` — `VirtualCardResponse`

---

### `POST /api/v1/cards/test-payment`

Simulate a full authorization + clearing cycle using Lithic sandbox.

**Headers**: `X-API-Key: <api_key>`

**Request**
```json
{
  "pan": "4111111111111234",
  "amount_cents": 500
}
```

**Response** `200`
```json
{
  "success": true,
  "message": "Test payment of $5.00 authorized successfully",
  "transaction_token": "txn_abc123",
  "status": "AUTHORIZED",
  "note": "Card is now CLOSED (single-use)."
}
```

---

## Testing (Sandbox Only)

### `POST /api/v1/cards/{card_id}/simulate/authorize`

Simulate a merchant authorization against a card.

**Headers**: `X-API-Key: <api_key>`

**Request**
```json
{
  "amount_cents": 500,
  "descriptor": "AMAZON.COM",
  "mcc": "5999"
}
```

**Response** `200`
```json
{
  "transaction_token": "txn_abc123",
  "debugging_request_id": "debug_xyz"
}
```

---

### `POST /api/v1/cards/{card_id}/simulate/clear`

Simulate transaction settlement. Must be called after `simulate/authorize`.

**Headers**: `X-API-Key: <api_key>`

**Request**
```json
{
  "amount_cents": 500
}
```

**Response** `200`
```json
{
  "cleared": true,
  "debugging_request_id": "debug_xyz"
}
```

---

## Webhooks

### `POST /webhooks/lithic`

Receives real-time events from Lithic. Not listed in Swagger (hidden from public docs).

**Signature verification**: `X-Lithic-Signature` header, HMAC-SHA256 with `LITHIC_WEBHOOK_SECRET`.

**Handled events**:

| Event | Action |
|-------|--------|
| `transaction.settled` | Calculates unused buffer, sends USDC refund to user's Stellar wallet |
| `transaction.authorization` | Logged |
| `card.state_changed` | Logged |

---

## Response Schemas

### VirtualCardResponse

```json
{
  "id": "uuid",
  "stellar_transaction_id": "tx_hash",
  "amount_cents": 1000,
  "spend_limit_cents": 1050,
  "merchant_name": "Test",
  "card": {
    "token": "lithic_token",
    "last_four": "1234",
    "exp_month": "07",
    "exp_year": "2027",
    "state": "OPEN",
    "pan": "4111...",
    "cvv": "123"
  },
  "authorization": {
    "token": "auth_token",
    "amount_cents": 500,
    "authorized_at": "2026-07-03T00:00:00Z"
  },
  "clearing": {
    "cleared": false,
    "amount_cents": null,
    "cleared_at": null,
    "debug_id": null
  },
  "created_at": "2026-07-03T00:00:00Z",
  "updated_at": "2026-07-03T00:00:00Z"
}
```

---

## Authentication

All protected endpoints require the `X-API-Key` header:

```
X-API-Key: sk_stellar_pay_dev_b03352ef1d68164c675023b82538ea3d1d1902f69bc408b7
```

The key is configured in `backend/.env` as the `API_KEY` variable.

## Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Bad request — missing fields or ZK proof verification failed |
| `401` | Invalid or missing API key |
| `404` | Card or resource not found |
| `500` | Internal error — card creation failed, Stellar network error, etc. |
| `501` | Not implemented (e.g., `build-tx` endpoint) |
