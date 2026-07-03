
Here's the complete user journey of Veilance from start to finish:
1. User opens the dashboard
Connects their Stellar wallet via Freighter browser extension.
2. User deposits XLM
Pastes a Stellar transaction hash confirming they've deposited XLM into the escrow contract. Dashboard shows their deposit is recorded.
3. User enters spend amount
Types how much they want to spend — say $50.
4. Proof is generated
The app runs the Noir circuit locally in the browser — takes their private balance and the public spend amount, and produces a ZK proof that says "balance >= spend amount" without revealing the actual balance.
5. User submits the proof
Dashboard sends the proof + public inputs + spend amount to the FastAPI backend.
6. Backend verifies on Stellar
Backend calls the deployed verifier contract on Stellar testnet. Contract checks the proof using BN254 host functions. Returns true or false.
7. Card gets issued
If true — backend calls Lithic API, which generates a one-time-use virtual Visa card with a $50 limit. Card number, CVV, and expiry come back.
8. Card appears on dashboard
User sees the card details. They can copy them manually or use the Chrome extension to autofill at any online checkout.
9. Card expires after one use
Lithic marks the card as used after the first transaction. It can never be charged again.

now can you run frontend and backend so that i can check everything
