const PRIVY_APP_ID = 'cmuhzdouv000i0cl2u6q438gf';
const BSC = {
  id: 56,
  name: 'BNB Smart Chain',
  network: 'bsc',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://bsc-dataseed.binance.org'] }, public: { http: ['https://bsc-dataseed.binance.org'] } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://bscscan.com' } }
};

let privyConnect = null;
let privyDisconnect = null;
let privyReady = false;
let bridgeError = null;

function setStatus(text) {
  window.__pronousPrivyStatus = text;
  const status = document.getElementById('walletStatus');
  if (status && !window.__pronousPrivyConnected) status.textContent = text;
}
function setButton(label, disabled) {
  const btn = document.getElementById('connectWalletBtn');
  if (!btn) return;
  btn.disabled = !!disabled;
  btn.textContent = label;
}
function exposeWallet(provider, address, chainId) {
  if (!provider || !address) throw new Error('Wallet provider/address unavailable');
  window.__pronousPrivyConnected = true;
  window.__pronousPrivyAddress = address;
  window.__pronousPrivyProvider = provider;
  window.__pronousChainId = chainId;
  window.dispatchEvent(new CustomEvent('pronous:privy-wallet-connected', { detail: { provider, address, chainId } }));
  setStatus('WALLET CONNECTED');
  setButton('Disconnect', false);
}
function clearWallet() {
  window.__pronousPrivyConnected = false;
  window.__pronousPrivyAddress = null;
  window.__pronousPrivyProvider = null;
  window.dispatchEvent(new CustomEvent('pronous:privy-wallet-disconnected'));
  setStatus('WALLET NOT CONNECTED');
  setButton('Connect Wallet', false);
}
async function switchToBsc(wallet, provider) {
  if (typeof wallet?.switchChain === 'function') {
    try { await wallet.switchChain(56); return; } catch (e) { console.warn('Privy switchChain', e); }
  }
  if (!provider?.request) return;
  const chain = await provider.request({ method: 'eth_chainId' }).catch(() => null);
  if (String(chain).toLowerCase() === '0x38') return;
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x38' }] });
}
async function bindWallet(wallet) {
  const provider = await wallet.getEthereumProvider();
  await switchToBsc(wallet, provider);
  const accounts = await provider.request({ method: 'eth_accounts' }).catch(() => []);
  const address = wallet.address || accounts?.[0];
  if (!address) throw new Error('Privy wallet has no address yet');
  const chainId = await provider.request({ method: 'eth_chainId' }).catch(() => '0x38');
  exposeWallet(provider, address, chainId);
}
function pickWallet(wallets) {
  return wallets?.find(w => w.walletClientType === 'privy') || wallets?.find(w => w.chainType === 'ethereum') || wallets?.[0] || null;
}
function getInjectedProvider() {
  const eth = window.ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length) {
    return eth.providers.find(p => p.isBinance || p.isBinanceWallet || p.isMetaMask) || eth.providers[0];
  }
  return eth;
}
async function connectInjectedPreferred() {
  const provider = getInjectedProvider();
  if (!provider?.request) throw new Error('No injected wallet found');
  setStatus('REQUESTING INJECTED WALLET');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('No account returned from wallet');
  await switchToBsc(null, provider);
  exposeWallet(provider, accounts[0], await provider.request({ method: 'eth_chainId' }).catch(() => '0x38'));
}

async function bootPrivy() {
  setStatus('PRIVY LOADING');
  const ReactMod = await import('https://esm.sh/react@18.3.1?target=es2022');
  const RD = await import('https://esm.sh/react-dom@18.3.1/client?target=es2022');
  const PrivyMod = await import('https://esm.sh/@privy-io/react-auth@2.13.0?deps=react@18.3.1,react-dom@18.3.1&target=es2022');
  const React = ReactMod.default || ReactMod;
  const { useEffect } = ReactMod;
  const { createRoot } = RD;
  const { PrivyProvider, usePrivy, useWallets, useConnectOrCreateWallet } = PrivyMod;
  if (!PrivyProvider || !usePrivy || !useWallets || !useConnectOrCreateWallet) throw new Error('Privy SDK wallet-connect exports missing');

  function Bridge() {
    const privy = usePrivy();
    const { wallets } = useWallets();
    const { connectOrCreateWallet } = useConnectOrCreateWallet();
    const ready = !!privy.ready;
    const authenticated = !!privy.authenticated;
    const logout = privy.logout;

    useEffect(() => {
      privyReady = ready;
      if (!ready) setStatus('PRIVY LOADING');
      else if (!authenticated && !window.__pronousPrivyConnected) setStatus('WALLET NOT CONNECTED');
    }, [ready, authenticated]);

    useEffect(() => {
      privyConnect = async () => {
        if (!ready) { setStatus('PRIVY LOADING'); return; }
        if (window.__pronousPrivyConnected) return;
        setStatus('OPENING PRIVY');
        setButton('Connecting…', true);
        await connectOrCreateWallet();
      };
      privyDisconnect = async () => {
        try { if (authenticated && logout) await logout(); } finally { clearWallet(); }
      };
      window.dispatchEvent(new CustomEvent('pronous:privy-ready', { detail: { ready, authenticated } }));
    }, [ready, authenticated, connectOrCreateWallet, logout]);

    useEffect(() => {
      if (!ready || !authenticated) return;
      const wallet = pickWallet(wallets);
      if (!wallet) { setStatus('CREATING EMBEDDED WALLET'); return; }
      bindWallet(wallet).catch(err => {
        bridgeError = err?.message || String(err);
        setStatus('PRIVY ERROR: ' + bridgeError);
        setButton('Connect Wallet', false);
        console.error('PRONOUS Privy bind:', err);
      });
    }, [ready, authenticated, wallets]);

    return null;
  }

  let el = document.getElementById('privy-root');
  if (!el) { el = document.createElement('div'); el.id = 'privy-root'; document.body.appendChild(el); }
  createRoot(el).render(React.createElement(PrivyProvider, {
    appId: PRIVY_APP_ID,
    config: {
      defaultChain: BSC,
      supportedChains: [BSC],
      loginMethods: ['email', 'google', 'wallet'],
      appearance: { theme: 'dark', accentColor: '#E2B714', walletChainType: 'ethereum-only' },
      embeddedWallets: { createOnLogin: 'all-users', requireUserOwnedRecoveryOnCreate: false }
    }
  }, React.createElement(Bridge)));
  setStatus('WALLET NOT CONNECTED');
}

window.connectWallet = async function connectWallet() {
  try {
    if (window.__pronousPrivyConnected) {
      if (privyDisconnect) await privyDisconnect(); else clearWallet();
      return;
    }
    setButton('Connecting…', true);
    const injected = getInjectedProvider();
    if (injected) {
      try { await connectInjectedPreferred(); return; }
      catch (injErr) { console.warn('Injected wallet failed, trying Privy:', injErr); }
    }
    if (privyConnect) { await privyConnect(); return; }
    const deadline = Date.now() + 15000;
    while (!privyConnect && !bridgeError && Date.now() < deadline) await new Promise(r => setTimeout(r, 120));
    if (privyConnect) { await privyConnect(); return; }
    throw new Error(bridgeError || 'Privy bridge did not initialize');
  } catch (e) {
    const message = e?.message || String(e);
    setStatus('WALLET ERROR: ' + message);
    setButton('Connect Wallet', false);
    console.error('PRONOUS connectWallet:', e);
  } finally {
    if (!window.__pronousPrivyConnected) setButton('Connect Wallet', false);
  }
};
window.addEventListener('pronous:privy-disconnect-request', () => privyDisconnect?.());
bootPrivy().catch(err => {
  bridgeError = err?.message || String(err);
  setStatus('PRIVY UNAVAILABLE: ' + bridgeError);
  console.error('PRONOUS Privy boot failed:', err);
});
