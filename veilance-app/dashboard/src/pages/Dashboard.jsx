/**
 * Veilance Dashboard
 *
 * ZK-proof-gated virtual card issuance.
 * Flow: connect Stellar wallet → see balance → enter spend amount → auto-generate ZK proof → get card
 */
import { useState, useEffect } from 'react'
import { isConnected, setAllowed, getPublicKey } from '@stellar/freighter-api'
import "../App.css";

// =============================================================================
// Configuration
// =============================================================================

const BACKEND_URL = import.meta.env.DEV
    ? 'http://localhost:8000'
    : 'https://veilance-production.up.railway.app'
const API_KEY = 'sk_stellar_pay_dev_b03352ef1d68164c675023b82538ea3d1d1902f69bc408b7'
const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org'

// =============================================================================
// Main Dashboard Component
// =============================================================================

function Dashboard() {
    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------

    const [walletAddress, setWalletAddress] = useState('')

    // Balance in stroops (1 XLM = 10,000,000 stroops), displayed as whole XLM
    const [escrowBalance, setEscrowBalance] = useState(null)
    const [isFetchingBalance, setIsFetchingBalance] = useState(false)

    // Spend form
    const [amount, setAmount] = useState('')
    const [merchantName, setMerchantName] = useState('')
    const [merchantDomain, setMerchantDomain] = useState('')
    const [originalAmount, setOriginalAmount] = useState('')

    // UI state
    const [status, setStatus] = useState('')
    const [error, setError] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [isTestingPayment, setIsTestingPayment] = useState(false)
    const [copiedField, setCopiedField] = useState(null)

    // Data state
    const [virtualCard, setVirtualCard] = useState(null)
    const [paymentResult, setPaymentResult] = useState(null)

    // ---------------------------------------------------------------------------
    // Effects
    // ---------------------------------------------------------------------------

    // Check if Freighter is already connected on mount
    useEffect(() => {
        const checkConnection = async () => {
            try {
                const connected = await isConnected()
                if (connected) {
                    const pubkey = await getPublicKey()
                    setWalletAddress(pubkey)
                    setStatus(`Connected: ${pubkey.substring(0, 6)}...${pubkey.slice(-4)}`)
                    fetchBalance(pubkey)
                }
            } catch {
                // not connected, no-op
            }
        }
        checkConnection()
    }, [])

    // Parse URL parameters from browser extension
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const urlAmount = params.get('amount')
        const urlMerchant = params.get('merchant')
        const urlDomain = params.get('domain')
        const urlOriginalAmount = params.get('originalAmount')

        if (urlAmount) setAmount(urlAmount)
        if (urlMerchant) setMerchantName(urlMerchant)
        if (urlDomain) setMerchantDomain(urlDomain)
        if (urlOriginalAmount) {
            setOriginalAmount(urlOriginalAmount)
            setStatus(`Converted ${urlOriginalAmount} to ${parseFloat(urlAmount).toFixed(2)} XLM`)
        } else if (urlMerchant) {
            setStatus(`Payment for ${urlMerchant}`)
        }
    }, [])

    // Listen for messages from browser extension
    useEffect(() => {
        const handleExtensionMessage = (event) => {
            if (event.data.type === 'STELLAR_PAY_CONFIRM_TRANSACTION') {
                if (virtualCard && !isTestingPayment) {
                    handleTestPayment()
                }
            }
        }
        window.addEventListener('message', handleExtensionMessage)
        return () => window.removeEventListener('message', handleExtensionMessage)
    }, [virtualCard, isTestingPayment])

    // ---------------------------------------------------------------------------
    // Balance Fetching
    // ---------------------------------------------------------------------------

    const fetchBalance = async (address) => {
        setIsFetchingBalance(true)
        try {
            const res = await fetch(`${HORIZON_TESTNET}/accounts/${address}`)
            if (!res.ok) throw new Error('Account not found on testnet')
            const data = await res.json()
            const xlmBalance = data.balances.find(b => b.asset_type === 'native')
            const xlmAmount = parseFloat(xlmBalance?.balance || '0')
            // Store raw XLM amount (in cents for internal math: 1 XLM = 100 cents)
            const cents = Math.floor(xlmAmount * 100)
            setEscrowBalance(cents)
        } catch (err) {
            setEscrowBalance(0)
            setError(`Could not fetch balance: ${err.message}`)
        } finally {
            setIsFetchingBalance(false)
        }
    }

    // ---------------------------------------------------------------------------
    // Wallet
    // ---------------------------------------------------------------------------

    const connectWallet = async () => {
        try {
            const connected = await isConnected()
            if (!connected) {
                await setAllowed()
            }
            const pubkey = await getPublicKey()
            setWalletAddress(pubkey)
            setStatus(`Connected: ${pubkey.substring(0, 6)}...${pubkey.slice(-4)}`)
            setError('')
            fetchBalance(pubkey)
        } catch (err) {
            setError(`Wallet connection failed: ${err.message}`)
        }
    }

    const disconnectWallet = () => {
        setWalletAddress('')
        setEscrowBalance(null)
        setVirtualCard(null)
        setPaymentResult(null)
        setStatus('')
        setError('')
    }

    // ---------------------------------------------------------------------------
    // Test Payment (Lithic sandbox simulation — keep exactly as-is)
    // ---------------------------------------------------------------------------

    const handleTestPayment = async () => {
        if (!virtualCard) {
            setError('No card available')
            return
        }

        setIsTestingPayment(true)
        setStatus('Processing payment...')
        setError('')

        try {
            const response = await fetch(`${BACKEND_URL}/api/v1/cards/test-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY,
                },
                body: JSON.stringify({
                    pan: virtualCard.pan,
                    amount_cents: virtualCard.amount_cents,
                }),
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Payment failed')
            }

            const result = await response.json()
            setPaymentResult(result)
            setStatus('Payment successful!')

            if (window.opener) {
                window.opener.postMessage(
                    {
                        type: 'PAYMENT_COMPLETE',
                        success: true,
                        card: {
                            last_four: virtualCard.last_four,
                            exp_month: virtualCard.exp_month,
                            exp_year: virtualCard.exp_year,
                            amount_usd: (virtualCard.amount_cents / 100).toFixed(2),
                            original_amount: originalAmount || null,
                        },
                    },
                    '*'
                )
            }
        } catch (err) {
            setError(`Payment failed: ${err.message}`)
            setStatus('')
            if (window.opener) {
                window.opener.postMessage({ type: 'PAYMENT_ERROR', error: err.message }, '*')
            }
        } finally {
            setIsTestingPayment(false)
        }
    }

    // ---------------------------------------------------------------------------
    // Main Payment Handler — generate ZK proof in browser, get virtual card
    // ---------------------------------------------------------------------------

    const handlePayment = async () => {
        if (!walletAddress) {
            setError('Connect your Stellar wallet first')
            return
        }
        if (!amount) {
            setError('Enter a spend amount')
            return
        }

        const amountCents = Math.ceil(parseFloat(amount) * 100)
        if (isNaN(amountCents) || amountCents <= 0) {
            setError('Invalid amount')
            return
        }

        if (escrowBalance !== null && amountCents > escrowBalance) {
            setError(`Insufficient balance: ${(escrowBalance / 100).toLocaleString()} XLM available`)
            return
        }

        setIsProcessing(true)
        setError('')

        try {
            // Step 1: Load circuit
            setStatus('Loading ZK circuit...')
            const circuit = await fetch('/smoke_test.json').then(r => r.json())

            // Step 2: Init WASM modules
            setStatus('Initializing ZK prover...')
            const { Noir } = await import('@noir-lang/noir_js')
            const { UltraHonkBackend } = await import('@aztec/bb.js')

            const noir = new Noir(circuit)
            await noir.init()

            const backend = new UltraHonkBackend(circuit.bytecode)

            // Step 3: Generate witness
            setStatus('Generating witness...')
            const balanceVal = escrowBalance !== null ? escrowBalance : amountCents + 1
            const inputs = {
                balance: balanceVal.toString(),
                spend_amount: amountCents.toString(),
            }
            const { witness } = await noir.execute(inputs)

            // Step 4: Generate proof
            setStatus('Generating ZK proof... (this may take 30–60s)')
            const { proof, publicInputs } = await backend.generateProof(witness, { keccak: true })

            // bb.js generateProof returns:
            //   proof: Uint8Array — exactly 14592 bytes (PROOF_FIELDS * 32), ready for Soroban verifier
            //   publicInputs: string[] — proof-internal values (already stripped from proof), not needed
            //
            // Soroban verifier expects:
            //   proof_bytes: exactly 14592 bytes (pairing obj + commitments + sumcheck + ...)
            //   public_inputs: RAW public input values (spend_amount as 32-byte big-endian)

            // 1. Proof is already the correct format — just convert to hex
            const proofHex = Array.from(proof).map(b => b.toString(16).padStart(2, '0')).join('')

            // 2. Raw public inputs: spend_amount as 32-byte big-endian field element
            const rawPubInputs = new Uint8Array(32)
            const amountBigInt = BigInt(amountCents)
            for (let i = 0; i < 8; i++) {
                rawPubInputs[31 - i] = Number((amountBigInt >> BigInt(i * 8)) & 0xFFn)
            }
            const publicInputsHex = Array.from(rawPubInputs).map(b => b.toString(16).padStart(2, '0')).join('')

            // Step 5: Submit to backend
            setStatus('Submitting proof for on-chain verification...')
            const response = await fetch(`${BACKEND_URL}/api/v1/payment/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY,
                },
                body: JSON.stringify({
                    proof: proofHex,
                    public_inputs: publicInputsHex,
                    stellar_address: walletAddress,
                    amount_cents: amountCents,
                }),
            })

            if (!response.ok) {
                const errData = await response.json()
                throw new Error(errData.detail || 'Verification failed')
            }

            const cardData = await response.json()
            setVirtualCard(cardData)
            setStatus('Card issued!')

            if (window.opener) {
                window.opener.postMessage(
                    {
                        type: 'CARD_READY',
                        card: {
                            pan: cardData.pan,
                            cvv: cardData.cvv,
                            exp_month: cardData.exp_month,
                            exp_year: cardData.exp_year,
                            last_four: cardData.last_four,
                        },
                    },
                    '*'
                )
            }

            await backend.destroy()
        } catch (err) {
            setError(`Failed: ${err.message}`)
            setStatus('')
        } finally {
            setIsProcessing(false)
        }
    }

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <div className="App">
            <div className="container">
                <div className="header">
                    <h1>💳 Veilance</h1>
                    <p className="tagline">ZK-verified payments on Stellar</p>
                </div>

                {merchantName && (
                    <div className="merchant-info">
                        <h3>Payment to: {merchantName}</h3>
                        {merchantDomain && <p className="domain">{merchantDomain}</p>}
                    </div>
                )}

                {!walletAddress ? (
                    <div className="connect-section">
                        <button className="pay-button" onClick={connectWallet}>
                            Connect Stellar Wallet
                        </button>
                        {error && <div className="error">{error}</div>}
                        <p className="hint">Requires Freighter wallet extension</p>
                    </div>
                ) : (
                    <div className="payment-section">
                        {/* Wallet + Balance */}
                        <div className="wallet-info">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <div className="connected-badge">✓ Stellar wallet connected</div>
                                <button onClick={disconnectWallet} className="disconnect-button">
                                    Disconnect
                                </button>
                            </div>
                            <div className="address">
                                {walletAddress.substring(0, 6)}...{walletAddress.slice(-4)}
                            </div>

                            {/* Balance display */}
                            <div style={{
                                marginTop: '0.75rem',
                                padding: '0.75rem 1rem',
                                background: 'rgba(74,222,128,0.06)',
                                border: '1px solid rgba(74,222,128,0.15)',
                                borderRadius: '10px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}>
                                <span style={{ fontSize: '0.85rem', color: '#888' }}>Your XLM balance</span>
                                {isFetchingBalance ? (
                                    <span style={{ color: '#666', fontSize: '0.85rem' }}>Loading...</span>
                                ) : escrowBalance !== null ? (
                                    <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4ade80' }}>
                                        {(escrowBalance / 100).toLocaleString()} XLM
                                    </span>
                                ) : (
                                    <span style={{ color: '#666', fontSize: '0.85rem' }}>—</span>
                                )}
                            </div>
                        </div>

                        {!virtualCard && (
                            <>
                                {/* Spend amount */}
                                <div className="amount-input">
                                    <label htmlFor="amount">Spend amount (XLM)</label>
                                    <input
                                        id="amount"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        disabled={isProcessing}
                                    />
                                </div>

                                <button
                                    onClick={handlePayment}
                                    disabled={isProcessing || !amount || parseFloat(amount) <= 0}
                                    className="pay-button"
                                >
                                    {isProcessing ? status || 'Working...' : 'Verify proof & get card'}
                                </button>
                            </>
                        )}

                        {virtualCard && (
                            <div style={{ marginTop: '2rem' }}>
                                {/* ── Premium Card Visual ── */}
                                <div style={{ perspective: '1000px', marginBottom: '1.5rem' }}>
                                    <div
                                        style={{
                                            width: '100%',
                                            maxWidth: '420px',
                                            aspectRatio: '1.586',
                                            margin: '0 auto',
                                            borderRadius: '16px',
                                            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 40%, #16213e 70%, #0f3460 100%)',
                                            padding: '28px 28px 24px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(74,222,128,0.08)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
                                            transform: 'rotateX(2deg)',
                                            transition: 'transform 0.4s ease, box-shadow 0.4s ease',
                                            cursor: 'default',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'rotateX(0deg) scale(1.02)'
                                            e.currentTarget.style.boxShadow = '0 30px 80px rgba(0,0,0,0.7), 0 0 60px rgba(74,222,128,0.12)'
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'rotateX(2deg) scale(1)'
                                            e.currentTarget.style.boxShadow = '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(74,222,128,0.08)'
                                        }}
                                    >
                                        {/* Holographic shine overlay */}
                                        <div style={{
                                            position: 'absolute',
                                            top: 0, left: 0, right: 0, bottom: 0,
                                            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 55%, transparent 60%)',
                                            pointerEvents: 'none',
                                        }} />

                                        {/* Card Top Row — Chip + Contactless + Visa */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                {/* EMV Chip */}
                                                <div style={{
                                                    width: '45px', height: '34px',
                                                    borderRadius: '6px',
                                                    background: 'linear-gradient(135deg, #c9a84c 0%, #f0d78c 30%, #c9a84c 60%, #a88734 100%)',
                                                    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.2)',
                                                    position: 'relative',
                                                    overflow: 'hidden',
                                                }}>
                                                    <div style={{ position: 'absolute', top: '8px', left: '4px', right: '4px', height: '1px', background: 'rgba(0,0,0,0.15)' }} />
                                                    <div style={{ position: 'absolute', top: '14px', left: '4px', right: '4px', height: '1px', background: 'rgba(0,0,0,0.15)' }} />
                                                    <div style={{ position: 'absolute', top: '20px', left: '4px', right: '4px', height: '1px', background: 'rgba(0,0,0,0.15)' }} />
                                                    <div style={{ position: 'absolute', top: '4px', bottom: '4px', left: '15px', width: '1px', background: 'rgba(0,0,0,0.1)' }} />
                                                    <div style={{ position: 'absolute', top: '4px', bottom: '4px', left: '30px', width: '1px', background: 'rgba(0,0,0,0.1)' }} />
                                                </div>
                                                {/* Contactless icon */}
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
                                                    <path d="M12 18c3.31 0 6-2.69 6-6s-2.69-6-6-6" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                                    <path d="M12 14c1.1 0 2-0.9 2-2s-0.9-2-2-2" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                                    <path d="M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                                </svg>
                                            </div>
                                            {/* Visa Logo */}
                                            <div style={{ fontSize: '28px', fontWeight: 800, fontStyle: 'italic', color: '#fff', letterSpacing: '-1px', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                                                VISA
                                            </div>
                                        </div>

                                        {/* Card Number */}
                                        <div
                                            style={{
                                                fontSize: '22px',
                                                fontWeight: 500,
                                                letterSpacing: '3px',
                                                color: '#fff',
                                                fontFamily: "'Courier New', 'Monaco', monospace",
                                                textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                                                cursor: 'pointer',
                                                padding: '4px 0',
                                                transition: 'opacity 0.2s',
                                            }}
                                            onClick={() => {
                                                if (virtualCard.pan) {
                                                    navigator.clipboard.writeText(virtualCard.pan)
                                                    setCopiedField('pan')
                                                    setTimeout(() => setCopiedField(null), 1500)
                                                }
                                            }}
                                            title="Click to copy card number"
                                        >
                                            {copiedField === 'pan'
                                                ? '✓ Copied!'
                                                : virtualCard.pan
                                                    ? virtualCard.pan.replace(/(.{4})/g, '$1 ').trim()
                                                    : `•••• •••• •••• ${virtualCard.last_four}`
                                            }
                                        </div>

                                        {/* Card Bottom Row — Expiry, CVV, Amount */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                            <div style={{ display: 'flex', gap: '24px' }}>
                                                {/* Expiry */}
                                                <div
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(`${String(virtualCard.exp_month).padStart(2, '0')}/${virtualCard.exp_year}`)
                                                        setCopiedField('exp')
                                                        setTimeout(() => setCopiedField(null), 1500)
                                                    }}
                                                    title="Click to copy expiry"
                                                >
                                                    <div style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', marginBottom: '3px' }}>
                                                        VALID THRU
                                                    </div>
                                                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', fontFamily: "monospace", letterSpacing: '1px' }}>
                                                        {copiedField === 'exp' ? '✓' : `${String(virtualCard.exp_month).padStart(2, '0')}/${String(virtualCard.exp_year).slice(-2)}`}
                                                    </div>
                                                </div>
                                                {/* CVV */}
                                                <div
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => {
                                                        if (virtualCard.cvv) {
                                                            navigator.clipboard.writeText(virtualCard.cvv)
                                                            setCopiedField('cvv')
                                                            setTimeout(() => setCopiedField(null), 1500)
                                                        }
                                                    }}
                                                    title="Click to copy CVV"
                                                >
                                                    <div style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', marginBottom: '3px' }}>
                                                        CVV
                                                    </div>
                                                    <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff', fontFamily: "monospace", letterSpacing: '1px' }}>
                                                        {copiedField === 'cvv' ? '✓' : (virtualCard.cvv || '•••')}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Amount + Veilance */}
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ade80', letterSpacing: '-0.5px' }}>
                                                    {(virtualCard.amount_cents / 100).toLocaleString()} XLM
                                                </div>
                                                <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', marginTop: '2px' }}>
                                                    VEILANCE
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Click to copy hint */}
                                <p style={{
                                    textAlign: 'center',
                                    fontSize: '0.8rem',
                                    color: '#555',
                                    marginBottom: '1rem',
                                }}>
                                    Click on card number, expiry, or CVV to copy
                                </p>

                                {/* Tip */}
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    background: 'rgba(74,222,128,0.06)',
                                    border: '1px solid rgba(74,222,128,0.15)',
                                    borderRadius: '10px',
                                    fontSize: '0.8rem',
                                    color: '#777',
                                    lineHeight: '1.5',
                                }}>
                                    💡 <strong style={{ color: '#999' }}>Tip:</strong> Use these details at any online checkout. For cardholder name, use <strong style={{ color: '#ccc' }}>Veilance User</strong>.
                                </div>

                                {paymentResult && (
                                    <div className="payment-complete" style={{ marginTop: '1rem' }}>
                                        <h3>🎉 Payment Complete!</h3>
                                        <p>Transaction successful</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {status && !isProcessing && <div className="status">{status}</div>}
                        {isProcessing && status && (
                            <div className="status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                                {status}
                            </div>
                        )}
                        {error && <div className="error">{error}</div>}
                    </div>
                )}

                <div className="footer">
                    <p>Powered by Stellar · ZK proofs via Noir + Barretenberg</p>
                </div>
            </div>
        </div>
    )
}

export default Dashboard
