import { useState, useEffect } from 'react'
import { isConnected, setAllowed, getPublicKey } from '@stellar/freighter-api'
import { useNavigate } from 'react-router-dom'

export default function Landing() {
  const [walletAddress, setWalletAddress] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (walletAddress) setTimeout(() => navigate('/app'), 400)
  }, [walletAddress, navigate])

  const connectWallet = async () => {
    try {
      const connected = await isConnected()
      if (!connected) {
        await setAllowed()
      }
      const pubkey = await getPublicKey()
      setWalletAddress(pubkey)
    } catch (err) {
      console.error('Wallet connection failed:', err)
    }
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white font-['Inter',sans-serif] overflow-x-hidden">

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 md:px-12 h-[72px] bg-[#080808]/80 backdrop-blur-xl border-b border-white/[0.06]">
        {/* Logo */}
        <a href="/" className="text-xl font-bold tracking-tight text-white select-none">
          Vei<span className="text-[#4ade80]">lance</span>
        </a>

        {/* Nav Links + Connect Wallet (grouped right) */}
        <div className="flex items-center gap-8">
          <a href="#features" className="hidden md:inline text-[15px] font-medium text-[#888] hover:text-white transition-colors duration-200">Features</a>
          <a href="#developers" className="hidden md:inline text-[15px] font-medium text-[#888] hover:text-white transition-colors duration-200">Developers</a>
          <a href="#docs" className="hidden md:inline text-[15px] font-medium text-[#888] hover:text-white transition-colors duration-200">Docs</a>
          <div className="nav-pill-wrap">
            <button onClick={connectWallet}>
              {walletAddress
                ? `${walletAddress.substring(0, 6)}...${walletAddress.slice(-4)}`
                : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-[72px] relative">
        {/* Grid background */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }} />
        {/* Center glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-[radial-gradient(ellipse,rgba(74,222,128,0.05)_0%,transparent_70%)] pointer-events-none" />

        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 border border-white/[0.1] rounded-full px-5 py-2 mb-10 bg-white/[0.03] relative z-10">
          <span className="w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_10px_#22c55e] flex-shrink-0" />
          <span className="text-[13px] font-medium text-[#999] tracking-wide">Powered by Stellar &amp; ZK Proofs</span>
        </div>

        {/* Heading */}
        <h1 className="text-[clamp(44px,7vw,88px)] font-black leading-[0.95] tracking-[-0.04em] max-w-[900px] mb-7 relative z-10">
          Spend your crypto<br className="hidden sm:block" />
          anywhere online<br className="hidden sm:block" />
          with <span className="text-[#4ade80]">cards.</span>
        </h1>

        {/* Subtext */}
        <p className="text-[clamp(15px,1.6vw,18px)] font-normal text-[#777] max-w-[560px] leading-[1.65] mb-14 relative z-10">
          Turn your XLM into a virtual card and pay at any online checkout.
          No bank account needed—just connect your Stellar wallet and spend
          crypto like cash.
        </p>

        {/* CTA Buttons */}
        <div className="flex gap-4 items-center justify-center flex-wrap relative z-10">
          {/* Primary — white pill */}
          <div className="hero-primary-wrap">
            <button onClick={connectWallet}>Connect Wallet →</button>
          </div>

          {/* Secondary — dark bordered pill */}
          <a
            href="https://github.com/raunet234/payzee"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 bg-white/[0.06] text-white border border-white/[0.12] rounded-full font-semibold text-base px-8 py-4 hover:bg-white/[0.1] hover:border-white/[0.2] transition-all duration-200"
          >
            {/* GitHub Icon */}
            <svg className="w-[18px] h-[18px] fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            View Documentation
          </a>
        </div>

        {/* Built With */}
        <div className="mt-20 flex flex-col items-center gap-4 relative z-10">
          <span className="text-[11px] font-semibold text-[#444] tracking-[2px] uppercase">Built with</span>
          <div className="flex items-center gap-8 flex-wrap justify-center">
            <span className="text-[14px] font-semibold text-[#3a3a3a]">Stellar Network</span>
            <span className="text-[#333]">·</span>
            <span className="text-[14px] font-semibold text-[#3a3a3a]">XLM</span>
            <span className="text-[#333]">·</span>
            <span className="text-[14px] font-semibold text-[#3a3a3a]">Lithic Cards</span>
            <span className="text-[#333]">·</span>
            <span className="text-[14px] font-semibold text-[#3a3a3a]">Soroban Contracts</span>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-white/[0.08]" />

      {/* ── SCROLLING USE-CASE CARDS ── */}
      <section className="py-20 md:py-28 overflow-hidden">
        <h2 className="text-[clamp(28px,4vw,44px)] font-extrabold tracking-[-0.03em] leading-[1.05] text-center mb-14">
          What will you buy first?
        </h2>

        {/* Marquee Row 1 — scrolls left */}
        <div className="marquee-row mb-4">
          <div className="marquee-track animate-marquee">
            {[...Array(2)].map((_, dup) => [
              { icon: 'U', color: '#888', name: 'Uber', desc: '6am airport ride locked in. Already tipped 20% for you.' },
              { icon: 'O', color: '#fff', name: 'OpenAI', desc: 'Burned through your API credits. Loaded another $50. Again.' },
              { icon: 'V', color: '#fff', name: 'Vercel', desc: 'Pro plan renewed moments before it lapsed. We\'re online.' },
              { icon: 'D', color: '#4ade80', name: 'DigitalOcean', desc: 'Last droplet was running hot. Spun up a new one in Dallas.' },
              { icon: 'A', color: '#f97316', name: 'AWS', desc: 'Reserved another m5.large. Latency back under 40ms.' },
              { icon: 'G', color: '#60a5fa', name: 'Google Cloud', desc: 'Auto-scaled your cluster. Peak traffic handled seamlessly.' },
            ].map((c, i) => (
              <div key={`${dup}-${i}`} className="flex-shrink-0 w-[340px] bg-[#111] border border-white/[0.08] rounded-2xl p-6 mx-2 hover:border-white/[0.15] transition-colors duration-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center text-sm font-bold" style={{ color: c.color }}>{c.icon}</div>
                  <span className="text-[15px] font-semibold">{c.name}</span>
                </div>
                <p className="text-sm text-[#777] leading-relaxed">{c.desc}</p>
              </div>
            ))).flat()}
          </div>
        </div>

        {/* Marquee Row 2 — scrolls right */}
        <div className="marquee-row">
          <div className="marquee-track animate-marquee-reverse">
            {[...Array(2)].map((_, dup) => [
              { icon: 'S', color: '#f472b6', name: 'Shopify', desc: 'Restocked 200 units of your best seller before it went to zero.' },
              { icon: 'F', color: '#818cf8', name: 'Figma', desc: 'Team plan auto-renewed. Design files safe for another year.' },
              { icon: 'N', color: '#22d3ee', name: 'Notion', desc: 'Upgraded workspace to business. Unlimited blocks unlocked.' },
              { icon: 'T', color: '#f59e0b', name: 'Twilio', desc: 'Topped up SMS credits. 10,000 messages ready to send.' },
              { icon: 'H', color: '#a78bfa', name: 'Heroku', desc: 'Scaled dynos for the launch. Zero downtime deployment.' },
              { icon: 'R', color: '#fb923c', name: 'Railway', desc: 'New project deployed. CI/CD pipeline configured automatically.' },
            ].map((c, i) => (
              <div key={`${dup}-${i}`} className="flex-shrink-0 w-[340px] bg-[#111] border border-white/[0.08] rounded-2xl p-6 mx-2 hover:border-white/[0.15] transition-colors duration-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center text-sm font-bold" style={{ color: c.color }}>{c.icon}</div>
                  <span className="text-[15px] font-semibold">{c.name}</span>
                </div>
                <p className="text-sm text-[#777] leading-relaxed">{c.desc}</p>
              </div>
            ))).flat()}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="h-px bg-white/[0.08]" />

      {/* ── HOW IT WORKS ── */}
      <div id="developers">
        <div className="max-w-[1100px] mx-auto px-8 md:px-10 py-28 md:py-32">
          <p className="text-[13px] font-semibold text-[#4ade80] tracking-[1.5px] uppercase text-center mb-4">Process</p>
          <h2 className="text-[clamp(32px,4.5vw,52px)] font-extrabold tracking-[-0.03em] leading-[1.05] text-center mb-16">
            How Veilance works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { n: '01', icon: '🔗', title: 'Connect wallet', body: 'Link your Stellar wallet via Freighter in seconds.' },
              { n: '02', icon: '🔒', title: 'Deposit XLM', body: 'Send XLM to the Stellar escrow address and save the transaction hash.' },
              { n: '03', icon: '🔐', title: 'Generate ZK proof', body: 'Prove your balance ≥ spend amount without revealing it. Paste the proof into the dashboard.' },
              { n: '04', icon: '💳', title: 'Get a virtual card', body: 'Veilance verifies your proof on-chain and instantly issues a single-use Visa card.' },
            ].map(s => (
              <div key={s.n} className="p-8 bg-[#111] border border-white/[0.08] rounded-2xl hover:bg-[#161616] hover:border-[#4ade80]/30 transition-all duration-300 group">
                <div className="text-xs font-semibold text-[#4ade80] tracking-[1.5px] font-mono mb-5">{s.n}</div>
                <span className="text-[26px] mb-4 block">{s.icon}</span>
                <div className="text-[17px] font-bold tracking-tight mb-2.5">{s.title}</div>
                <p className="text-sm text-[#777] leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.08]" />

      {/* ── FEATURES ── */}
      <div id="features" className="bg-[#080808]">
        <div className="max-w-[1100px] mx-auto px-8 md:px-10 py-28 md:py-32">
          <p className="text-[13px] font-semibold text-[#4ade80] tracking-[1.5px] uppercase text-center mb-4">Why Veilance</p>
          <h2 className="text-[clamp(32px,4.5vw,52px)] font-extrabold tracking-[-0.03em] leading-[1.05] text-center mb-16">
            Built for real payments
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { n: '01', title: 'No merchant integration', body: 'Works at any existing checkout. If they accept cards, Veilance works.' },
              { n: '02', title: 'ZK-verified balance', body: 'A Noir UltraHonk proof verified on Stellar proves you have the funds — without revealing your balance.' },
              { n: '03', title: 'Auto buffer refund', body: 'Cards carry a 5% buffer for tax. Every unspent cent comes back to your wallet.' },
              { n: '04', title: 'Single-use security', body: 'Each card closes after its first charge. A leaked number is already worthless.' },
              { n: '05', title: 'Under 3 second cards', body: 'From proof submission to a spendable card in under 3 seconds.' },
              { n: '06', title: 'Zero KYC', body: 'Connect your wallet and go. No email, no ID, no wait. Your wallet is your identity.' },
            ].map(f => (
              <div key={f.n} className="p-9 bg-[#111] border border-white/[0.08] rounded-2xl hover:bg-[#161616] hover:border-[#4ade80]/25 transition-all duration-300">
                <div className="text-[11px] font-semibold text-[#444] tracking-[2px] uppercase mb-5">{f.n}</div>
                <div className="text-lg font-bold tracking-tight mb-2.5">{f.title}</div>
                <p className="text-sm text-[#777] leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.08]" />

      {/* ── DOCS / TECH FLOW ── */}
      <div id="docs" className="bg-[#080808]">
        <div className="max-w-[1100px] mx-auto px-8 md:px-10 py-28 md:py-32">
          <p className="text-[13px] font-semibold text-[#4ade80] tracking-[1.5px] uppercase text-center mb-4">Architecture</p>
          <h2 className="text-[clamp(32px,4.5vw,52px)] font-extrabold tracking-[-0.03em] leading-[1.05] text-center mb-16">
            Under the hood
          </h2>
          <div className="bg-[#0e0e0e] border border-white/[0.08] rounded-2xl p-8 md:p-12">
            {/* Flow nodes */}
            <div className="flex items-center gap-0 flex-wrap justify-center">
              {[
                { label: 'Your Wallet', sub: 'Stellar XLM', icon: '⬡' },
                { label: 'ZK Circuit', sub: 'Noir UltraHonk', icon: '◈' },
                { label: 'Soroban Contract', sub: 'On-chain Verifier', icon: '▣' },
                { label: 'Virtual Card', sub: 'Single-use VISA', icon: '▤' },
                { label: 'Merchant', sub: 'Any Online Store', icon: '◉' },
              ].map((node, i, arr) => (
                <div key={node.label} className="flex items-center" style={{ flex: i < arr.length - 1 ? '1 1 auto' : undefined }}>
                  <div className="text-center min-w-[100px] md:min-w-[120px]">
                    <div className="w-12 h-12 rounded-xl mx-auto mb-2.5 bg-[#4ade80]/10 border border-[#4ade80]/20 flex items-center justify-center text-xl text-[#4ade80]">
                      {node.icon}
                    </div>
                    <div className="text-[13px] font-bold mb-1">{node.label}</div>
                    <div className="text-[11px] text-[#555] font-mono tracking-wide">{node.sub}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="flex-1 h-px bg-gradient-to-r from-[#4ade80]/40 to-transparent mx-2 md:mx-3 min-w-[16px] relative -top-3.5 opacity-50" />
                  )}
                </div>
              ))}
            </div>
            {/* Flow description */}
            <div className="mt-8 p-4 md:px-6 bg-[#4ade80]/[0.06] border border-[#4ade80]/[0.12] rounded-lg font-mono text-xs text-[#777] leading-relaxed">
              <span className="text-[#4ade80]">// Flow: </span>
              User deposits XLM → Generates Noir ZK proof (balance ≥ spend) → Backend verifies proof on Stellar →
              Lithic issues single-use card → User pays merchant → Unused buffer auto-refunded
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.08]" />

      {/* ── BOTTOM CTA ── */}
      <section className="py-32 md:py-40 px-6 text-center relative overflow-hidden">
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] rounded-full bg-[radial-gradient(ellipse,rgba(74,222,128,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="relative z-10">
          <p className="text-[13px] font-semibold text-[#4ade80] tracking-[1.5px] uppercase mb-5">Ready to Start</p>
          <h2 className="text-[clamp(40px,6vw,72px)] font-black tracking-[-0.04em] leading-[0.95] mb-6">
            Spend crypto.<br />
            Pay like <span className="text-[#4ade80]">everyone.</span>
          </h2>
          <p className="text-[17px] text-[#777] leading-relaxed max-w-[440px] mx-auto mb-12">
            Connect your Stellar wallet and make your first ZK-verified payment in under a minute.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <div className="cta-primary-wrap">
              <button onClick={connectWallet}>Connect Wallet →</button>
            </div>
            {walletAddress && (
              <button
                onClick={() => navigate('/app')}
                className="inline-flex items-center gap-2.5 bg-white/[0.06] text-white border border-white/[0.12] rounded-full font-semibold text-base px-8 py-4 hover:bg-white/[0.1] hover:border-white/[0.2] transition-all duration-200 cursor-pointer"
              >
                Open Dashboard
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.08] px-8 md:px-10 py-7 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-base font-bold text-white">Vei<span className="text-[#4ade80]">lance</span></div>
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <a href="#features" className="text-sm text-[#555] hover:text-white transition-colors duration-200">Features</a>
          <a href="#developers" className="text-sm text-[#555] hover:text-white transition-colors duration-200">Developers</a>
          <a href="#docs" className="text-sm text-[#555] hover:text-white transition-colors duration-200">Docs</a>
          <a href="https://github.com/raunet234/payzee" target="_blank" rel="noreferrer" className="text-sm text-[#555] hover:text-white transition-colors duration-200">GitHub</a>
        </div>
        <div className="text-[13px] text-[#444]">© 2025 Veilance · Powered by Stellar</div>
      </footer>

      {/* ── Button style overrides ── */}
      <style>{`
        /* Nav pill */
        .nav-pill-wrap button {
          background: #fff !important;
          color: #080808 !important;
          border: none !important;
          border-radius: 100px !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          padding: 10px 24px !important;
          cursor: pointer !important;
          transition: opacity 0.2s !important;
          letter-spacing: 0 !important;
          text-transform: none !important;
        }
        .nav-pill-wrap button:hover { opacity: 0.85 !important; }

        /* Hero primary CTA */
        .hero-primary-wrap button {
          background: #fff !important;
          color: #080808 !important;
          border: none !important;
          border-radius: 100px !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          padding: 18px 36px !important;
          cursor: pointer !important;
          transition: opacity 0.2s, transform 0.2s !important;
          letter-spacing: 0 !important;
          text-transform: none !important;
        }
        .hero-primary-wrap button:hover {
          opacity: 0.88 !important;
          transform: translateY(-1px) !important;
        }

        /* Bottom CTA primary */
        .cta-primary-wrap button {
          background: #fff !important;
          color: #080808 !important;
          border: none !important;
          border-radius: 100px !important;
          font-family: 'Inter', sans-serif !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          padding: 18px 40px !important;
          cursor: pointer !important;
          transition: opacity 0.2s !important;
          letter-spacing: 0 !important;
          text-transform: none !important;
        }
        .cta-primary-wrap button:hover { opacity: 0.85 !important; }

        /* Marquee animations */
        .marquee-row {
          width: 100%;
          overflow: hidden;
        }
        .marquee-track {
          display: flex;
          width: max-content;
        }
        .animate-marquee {
          animation: marquee-scroll 40s linear infinite;
        }
        .animate-marquee-reverse {
          animation: marquee-scroll-reverse 40s linear infinite;
        }
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-scroll-reverse {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
