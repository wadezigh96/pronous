const PRIVY_APP_ID = 'cmuhzdouv000i0cl2u6q438gf';
const BSC = {
  id: 56,
  name: 'BNB Smart Chain',
  network: 'bsc',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://bsc-dataseed.binance.org'] }, public: { http: ['https://bsc-dataseed.binance.org'] } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://bscscan.com' } }
};
const BSC_HEX = '0x38';
const PREF_KEY = 'pronous.wallet.source.v1';
const STATE = window.PRONOUS_WALLET_STATE || null;

let privyConnect = null;
let privyDisconnect = null;
let privyReady = false;
let bridgeError = null;
let activeWallet = null;
let activeProvider = null;
let providerCleanup = null;
let connecting = false;

function normalizeChainId(value) {
  if (STATE?.normalizeChainId) return STATE.normalizeChainId(value);
  const s = String(value || '').toLowerCase();
  if (s.startsWith('0x')) return Number.parseInt(s, 16);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function getPreference() {
  try { return localStorage.getItem(PREF_KEY) || ''; } catch (_) { return ''; }
}
function setPreference(source) {
  try { localStorage.setItem(PREF_KEY, source); } catch (_) {}
}
function clearPreference() {
  try { localStorage.removeItem(PREF_KEY); } catch (_) {}
}
function setStatus(text) {
  window.__pronousPrivyStatus = text;
  const status = document.getElementById('walletStatus');
  if (status) status.textContent = text;
}
function setWalletDisplay(wallet) {
  const source = document.getElementById('walletSource');
  const addr = document.getElementById('walletAddress');
  if (source) source.textContent = wallet ? (wallet.source === 'privy' ? 'PRIVY' : 'BROWSER WALLET') : 'NO WALLET';
  if (addr) addr.textContent = wallet ? shortAddress(wallet.address) : 'Not connected';
}
function shortAddress(address) {
  const a = String(address || '');
  return a.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a || 'Not connected';
}
function setButton(label, disabled) {
  const btn = document.getElementById('connectWalletBtn');
  if (!btn) return;
  btn.disabled = !!disabled;
  btn.textContent = label;
}
function resetExecution(reason) {
  if (typeof window.__pronousResetExecutionState === 'function') {
    window.__pronousResetExecutionState(reason);
    return;
  }
  window.__pronousSimulated = false;
  window.__pronousConfirmed = false;
  window.__pronousBuiltTx = null;
  window.__pronousSimulation = null;
  window.__pronousSimTxHash = null;
  window.__pronousParamsHash = null;
  window.latestQuote = null;
  window.preflightReady = false;
}
function emitWalletChanged(next, reason) {
  const prev = activeWallet;
  const changed = !prev ||
    prev.source !== next?.source ||
    String(prev.address || '').toLowerCase() !== String(next?.address || '').toLowerCase() ||
    normalizeChainId(prev.chainId) !== normalizeChainId(next?.chainId);
  if (!changed) return false;
  resetExecution(reason || 'wallet changed');
  const detail = next ? {
    source: next.source,
    address: next.address,
    chainId: normalizeChainId(next.chainId)
  } : null;
  window.dispatchEvent(new CustomEvent(next ? 'pronous:privy-wallet-connected' : 'pronous:privy-wallet-disconnected', {
    detail: detail || {}
  }));
  setWalletDisplay(next);
  return true;
}
function detachProviderListeners() {
  if (providerCleanup) {
    try { providerCleanup(); } catch (_) {}
    providerCleanup = null;
  }
}
function attachProviderListeners(provider, source) {
  detachProviderListeners();
  if (!provider?.on) return;
  const accountsChanged = (accounts) => {
    const address = Array.isArray(accounts) ? accounts[0] : accounts;
    if (!address) {
      clearWallet(source, 'account disconnected');
      return;
    }
    if (!activeWallet || activeWallet.source !== source) return;
    const next = { ...activeWallet, address };
    if (STATE) {
      const result = STATE.providerEvent(activeWallet, source, 'accountsChanged', accounts);
      if (!result.changed) return;
      if (!result.state) { clearWallet(source, 'account disconnected'); return; }
      next.address = result.state.address;
    }
    activeWallet = next;
    emitWalletChanged(next, 'account changed');
    setStatus(source === 'privy' ? 'PRIVY WALLET CONNECTED' : 'BROWSER WALLET CONNECTED');
  };
  const chainChanged = (chainId) => {
    if (!activeWallet || activeWallet.source !== source) return;
    const next = { ...activeWallet, chainId: normalizeChainId(chainId) };
    if (STATE) {
      const result = STATE.providerEvent(activeWallet, source, 'chainChanged', chainId);
      if (!result.changed) return;
      next.chainId = result.state?.chainId ?? null;
    }
    activeWallet = next;
    emitWalletChanged(next, 'chain changed');
    setStatus('WALLET CHAIN CHANGED · ' + String(next.chainId || 'unknown'));
  };
  provider.on('accountsChanged', accountsChanged);
  provider.on('chainChanged', chainChanged);
  providerCleanup = () => {
    if (typeof provider.removeListener === 'function') {
      provider.removeListener('accountsChanged', accountsChanged);
      provider.removeListener('chainChanged', chainChanged);
    } else if (typeof provider.off === 'function') {
      provider.off('accountsChanged', accountsChanged);
      provider.off('chainChanged', chainChanged);
    }
  };
}
function exposeWalletApi() {
  if (window.PRONOUS_WALLET) return;
  window.PRONOUS_WALLET = Object.freeze({
    getAddress: () => activeWallet?.address || null,
    getChainId: () => activeWallet?.chainId || null,
    getSource: () => activeWallet?.source || null,
    isConnected: () => Boolean(activeWallet?.address && activeProvider),
    request: async (method, params = [], caller = '') => {
      if (!activeProvider?.request || !activeWallet?.address) throw new Error('No active wallet');
      if (caller !== 'pronous-desk') throw new Error('Wallet request caller rejected');
      if (method !== 'eth_sendTransaction' && method !== 'eth_signTypedData_v4') {
        throw new Error('Wallet request method blocked');
      }
      if (method === 'eth_sendTransaction') {
        const tx = Array.isArray(params) ? params[0] : null;
        if (!tx || String(tx.from || '').toLowerCase() !== activeWallet.address.toLowerCase()) {
          throw new Error('Transaction sender does not match active wallet');
        }
      }
      if (method === 'eth_signTypedData_v4') {
        const signer = Array.isArray(params) ? params[0] : '';
        if (String(signer || '').toLowerCase() !== activeWallet.address.toLowerCase()) {
          throw new Error('Typed-data signer does not match active wallet');
        }
      }
      return activeProvider.request({ method, params });
    },
    ensureBsc: async () => ensureBsc(activeProvider)
  });
}
async function ensureBsc(provider = activeProvider) {
  if (!provider?.request) throw new Error('Active wallet provider unavailable');
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (String(chainId).toLowerCase() === BSC_HEX) {
    if (activeWallet) activeWallet = { ...activeWallet, chainId: 56 };
    return 56;
  }
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_HEX }] });
  } catch (e) {
    if (e && (e.code === 4902 || String(e.message || '').toLowerCase().includes('unrecognized'))) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: BSC_HEX,
          chainName: BSC.name,
          nativeCurrency: BSC.nativeCurrency,
          rpcUrls: ['https://bsc-dataseed.binance.org'],
          blockExplorerUrls: ['https://bscscan.com']
        }]
      });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_HEX }] });
    } else {
      throw e;
    }
  }
  const after = await provider.request({ method: 'eth_chainId' });
  if (String(after).toLowerCase() !== BSC_HEX) throw new Error('Wallet did not switch to BSC Mainnet');
  if (activeWallet) {
    activeWallet = { ...activeWallet, chainId: 56 };
    emitWalletChanged(activeWallet, 'switched to BSC');
  }
  return 56;
}
function setActiveWallet(source, provider, address, chainId) {
  if (!provider || !address) throw new Error('Wallet provider/address unavailable');
  const next = { source, address, chainId: normalizeChainId(chainId) };
  if (activeWallet && activeWallet.source !== source) {
    detachProviderListeners();
    resetExecution('wallet source changed');
  }
  activeProvider = provider;
  activeWallet = next;
  attachProviderListeners(provider, source);
  emitWalletChanged(next, source === 'privy' ? 'privy wallet connected' : 'browser wallet connected');
  setStatus(source === 'privy' ? 'PRIVY WALLET CONNECTED' : 'BROWSER WALLET CONNECTED');
  setButton('Disconnect', false);
}
function clearWallet(source, reason = 'wallet disconnected') {
  if (source && activeWallet && activeWallet.source !== source) return;
  detachProviderListeners();
  activeProvider = null;
  activeWallet = null;
  resetExecution(reason);
  window.dispatchEvent(new CustomEvent('pronous:privy-wallet-disconnected', { detail: { source: source || null } }));
  setWalletDisplay(null);
  setStatus('WALLET NOT CONNECTED');
  setButton('Connect Wallet', false);
}
function getInjectedProvider() {
  const eth = window.ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length) {
    return eth.providers.find(p => p.isBinance || p.isBinanceWallet || p.isMetaMask) || eth.providers[0];
  }
  return eth;
}
async function connectInjected() {
  const provider = getInjectedProvider();
  if (!provider?.request) throw new Error('No browser wallet detected');
  setPreference('injected');
  setStatus('REQUESTING BROWSER WALLET');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('Browser wallet returned no account');
  try {
    await ensureBsc(provider);
  } catch (e) {
    throw new Error('BSC switch rejected by browser wallet. Privy fallback is disabled: ' + (e?.message || e));
  }
  const chainId = await provider.request({ method: 'eth_chainId' });
  setActiveWallet('injected', provider, accounts[0], chainId);
  closeWalletChooser();
}
function pickWallet(wallets, user) {
  const list = Array.isArray(wallets) ? wallets : [];
  const selectedAddress =
    user?.wallet?.address ||
    (Array.isArray(user?.linkedAccounts) ? user.linkedAccounts.find(a => a.type === 'wallet' && a.address)?.address : null);
  if (selectedAddress) {
    const match = list.find(w => String(w.address || '').toLowerCase() === String(selectedAddress).toLowerCase());
    if (match) return match;
  }
  if (list.length === 1) return list[0];
  return null;
}
async function bindPrivyWallet(wallet) {
  if (!wallet) throw new Error('No Privy wallet selected');
  const provider = await wallet.getEthereumProvider();
  await ensureBsc(provider);
  const accounts = await provider.request({ method: 'eth_accounts' }).catch(() => []);
  const address = wallet.address || accounts?.[0];
  if (!address) throw new Error('Privy wallet has no address yet');
  const chainId = await provider.request({ method: 'eth_chainId' });
  setActiveWallet('privy', provider, address, chainId);
}
function openWalletChooser() {
  const modal = document.getElementById('walletChooser');
  if (modal) modal.hidden = false;
  setStatus('CHOOSE WALLET');
  setButton('Choose wallet…', true);
}
function closeWalletChooser() {
  const modal = document.getElementById('walletChooser');
  if (modal) modal.hidden = true;
  if (!activeWallet) setButton('Connect Wallet', false);
}
async function connectPrivy() {
  setPreference('privy');
  if (!privyConnect) throw new Error(bridgeError || 'Privy is still loading');
  setStatus('OPENING PRIVY');
  setButton('Connecting…', true);
  await privyConnect();
  closeWalletChooser();
}
async function disconnectActive() {
  const source = activeWallet?.source;
  if (source === 'privy' && privyDisconnect) await privyDisconnect();
  else clearWallet(source, 'wallet disconnected');
  clearPreference();
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
    const { connectOrCreateWallet } = useConnectOrCreateWallet({
      onSuccess: async ({ wallet }) => {
        try {
          await bindPrivyWallet(wallet);
          closeWalletChooser();
        } catch (e) {
          bridgeError = e?.message || String(e);
          setStatus('PRIVY ERROR: ' + bridgeError);
          setButton('Connect Wallet', false);
        }
      },
      onError: async (error) => {
        bridgeError = error?.message || String(error);
        if (error?.code === 'user_rejected' || /cancel|closed|dismiss/i.test(bridgeError)) {
          setStatus('WALLET NOT CONNECTED');
        } else {
          setStatus('PRIVY ERROR: ' + bridgeError);
        }
        setButton('Connect Wallet', false);
      }
    });
    const ready = !!privy.ready;
    const authenticated = !!privy.authenticated;
    const logout = privy.logout;

    useEffect(() => {
      privyReady = ready;
      if (!ready) setStatus('PRIVY LOADING');
      else if (!authenticated && !activeWallet) setStatus('WALLET NOT CONNECTED');
    }, [ready, authenticated]);

    useEffect(() => {
      privyConnect = async () => {
        if (!ready) throw new Error('Privy is still loading');
        if (activeWallet) return;
        setStatus('OPENING PRIVY');
        await connectOrCreateWallet();
      };
      privyDisconnect = async () => {
        try { if (authenticated && logout) await logout(); }
        finally { clearWallet('privy', 'privy disconnected'); }
      };
      window.dispatchEvent(new CustomEvent('pronous:privy-ready', { detail: { ready, authenticated } }));
    }, [ready, authenticated, connectOrCreateWallet, logout]);

    useEffect(() => {
      const preference = getPreference();
      if (preference !== 'privy' || !ready || !authenticated || activeWallet) return;
      const wallet = pickWallet(wallets, privy.user);
      if (!wallet) {
        setStatus(wallets?.length > 1 ? 'SELECT YOUR PRIVY WALLET' : 'PRIVY WALLET NOT READY');
        return;
      }
      bindPrivyWallet(wallet).catch(err => {
        bridgeError = err?.message || String(err);
        setStatus('PRIVY ERROR: ' + bridgeError);
        setButton('Connect Wallet', false);
      });
    }, [ready, authenticated, wallets, privy.user]);

    return null;
  }

  let el = document.getElementById('privy-root');
  if (!el) { el = document.createElement('div'); el.id = 'privy-root'; document.body.appendChild(el); }
  createRoot(el).render(React.createElement(PrivyProvider, {
    appId: PRIVY_APP_ID,
    config: {
      defaultChain: BSC,
      supportedChains: [BSC],
      loginMethods: ['email', 'google'],
      showWalletUIs: true,
      appearance: { theme: 'dark', accentColor: '#E2B714', walletChainType: 'ethereum-only' },
      embeddedWallets: { createOnLogin: 'users-without-wallets', requireUserOwnedRecoveryOnCreate: false }
    }
  }, React.createElement(Bridge)));
  if (getPreference() !== 'privy') setStatus('WALLET NOT CONNECTED');
}
window.openWalletChooser = openWalletChooser;
window.closeWalletChooser = closeWalletChooser;
window.connectBrowserWallet = async function () {
  if (connecting) return;
  connecting = true;
  try { await connectInjected(); }
  catch (e) {
    const message = e?.message || String(e);
    setStatus('BROWSER WALLET ERROR: ' + message);
    setButton('Connect Wallet', false);
  }
  finally { connecting = false; }
};
window.connectPrivyWallet = async function () {
  if (connecting) return;
  connecting = true;
  try { await connectPrivy(); }
  catch (e) {
    const message = e?.message || String(e);
    if (/cancel|closed|dismiss|rejected/i.test(message)) setStatus('WALLET NOT CONNECTED');
    else setStatus('PRIVY ERROR: ' + message);
    setButton('Connect Wallet', false);
  }
  finally { connecting = false; }
};
window.connectWallet = async function connectWallet() {
  if (activeWallet) { await disconnectActive(); return; }
  if (getPreference() === 'injected') return window.connectBrowserWallet();
  if (getPreference() === 'privy' && privyConnect) return window.connectPrivyWallet();
  openWalletChooser();
};
window.addEventListener('pronous:privy-disconnect-request', () => disconnectActive());
exposeWalletApi();
bootPrivy().catch(err => {
  bridgeError = err?.message || String(err);
  setStatus('PRIVY UNAVAILABLE: ' + bridgeError);
  console.error('PRONOUS Privy boot failed:', err);
});
