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
  const addr = document.getElementById('walletAddressTop');
  const btn = document.getElementById('connectWalletBtn');
  if (source) source.textContent = wallet ? (wallet.source === 'privy' ? 'PRIVY' : 'BROWSER WALLET') : 'NO WALLET';
  if (addr) addr.textContent = wallet ? shortAddress(wallet.address) : 'Not connected';
  if (btn) {
    btn.disabled = false;
    btn.textContent = wallet
      ? (normalizeChainId(wallet.chainId) === 56 ? 'Disconnect' : 'Switch to BSC')
      : 'Connect Wallet';
  }
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
function emitWalletChanged(next, reason, previous = activeWallet) {
  const prev = previous;
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
    const previous = activeWallet;
    activeWallet = next;
    emitWalletChanged(next, 'account changed', previous);
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
    const previous = activeWallet;
    activeWallet = next;
    emitWalletChanged(next, 'chain changed', previous);
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
async function syncActiveWalletState() {
  if (!activeProvider?.request || !activeWallet?.source) return null;
  const accounts = await activeProvider.request({ method: 'eth_accounts' }).catch(() => []);
  const address = Array.isArray(accounts) && accounts[0] ? accounts[0] : null;
  if (!address) return null;
  const chainRaw = await activeProvider.request({ method: 'eth_chainId' }).catch(() => null);
  const chainId = normalizeChainId(chainRaw);
  if (activeWallet && activeWallet.source) {
    const previous = activeWallet;
    const next = { ...activeWallet, address, chainId };
    activeWallet = next;
    if (previous.address !== next.address || normalizeChainId(previous.chainId) !== chainId) {
      emitWalletChanged(next, 'wallet state synchronized', previous);
      setStatus(next.source === 'privy' ? 'PRIVY WALLET CONNECTED' : 'BROWSER WALLET CONNECTED');
    }
  }
  return activeWallet;
}
function exposeWalletApi() {
  if (window.PRONOUS_WALLET) return;
  window.PRONOUS_WALLET = Object.freeze({
    getAddress: () => activeWallet?.address || null,
    getChainId: () => activeWallet?.chainId || null,
    getSource: () => activeWallet?.source || null,
    isConnected: () => Boolean(activeWallet?.address && activeProvider),
    sync: async () => {
      const state = await syncActiveWalletState();
      return state ? {
        source: state.source,
        address: state.address,
        chainId: normalizeChainId(state.chainId)
      } : null;
    },
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
  if (normalizeChainId(chainId) === 56) {
    if (activeWallet && normalizeChainId(activeWallet.chainId) !== 56) {
      const previous = activeWallet;
      activeWallet = { ...activeWallet, chainId: 56 };
      emitWalletChanged(activeWallet, 'switched to BSC', previous);
    } else if (activeWallet) {
      activeWallet = { ...activeWallet, chainId: 56 };
    }
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
  if (normalizeChainId(after) !== 56) throw new Error('Wallet did not switch to BSC Mainnet');
  if (activeWallet) {
    const previous = activeWallet;
    activeWallet = { ...activeWallet, chainId: 56 };
    emitWalletChanged(activeWallet, 'switched to BSC', previous);
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
  const previous = activeWallet;
  activeProvider = provider;
  activeWallet = next;
  attachProviderListeners(provider, source);
  emitWalletChanged(next, source === 'privy' ? 'privy wallet connected' : 'browser wallet connected', previous);
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
async function restoreInjectedWallet() {
  const provider = getInjectedProvider();
  if (!provider?.request || getPreference() !== 'injected' || activeWallet) return false;
  const accounts = await provider.request({ method: 'eth_accounts' }).catch(() => []);
  if (!Array.isArray(accounts) || !accounts[0]) return false;
  const chainId = await provider.request({ method: 'eth_chainId' }).catch(() => null);
  if (normalizeChainId(chainId) !== 56) {
    try { await ensureBsc(provider); } catch (_) { return false; }
  }
  const finalChain = await provider.request({ method: 'eth_chainId' }).catch(() => null);
  if (normalizeChainId(finalChain) !== 56) return false;
  setActiveWallet('injected', provider, accounts[0], finalChain);
  return true;
}
const eip6963Providers = [];
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event?.detail;
    if (!detail?.info || !detail?.provider) return;
    const exists = eip6963Providers.some(p => p.info?.uuid === detail.info.uuid);
    if (!exists) eip6963Providers.push(detail);
  });
  try { window.dispatchEvent(new Event('eip6963:requestProvider')); } catch (_) {}
}

function scoreProvider(p) {
  if (!p) return -1;
  if (p.isBinance || p.isBinanceWallet) return 100;
  if (p.isMetaMask) return 80;
  if (p.isCoinbaseWallet || p.isCoinbase) return 60;
  if (p.isTrust || p.isTrustWallet) return 50;
  return 10;
}

function getInjectedProvider() {
  if (eip6963Providers.length) {
    const ranked = [...eip6963Providers].sort((a, b) => scoreProvider(b.provider) - scoreProvider(a.provider));
    return ranked[0].provider;
  }
  const eth = window.ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length) {
    return [...eth.providers].sort((a, b) => scoreProvider(b) - scoreProvider(a))[0];
  }
  return eth;
}

function listAvailableWallets() {
  const list = [];
  for (const item of eip6963Providers) {
    list.push({
      name: item.info?.name || 'Browser Wallet',
      rdns: item.info?.rdns || '',
      icon: item.info?.icon || '',
      provider: item.provider
    });
  }
  if (!list.length && window.ethereum) {
    list.push({ name: 'Browser Wallet', rdns: '', icon: '', provider: getInjectedProvider() });
  }
  return list;
}
async function connectInjected(preferredProvider) {
  const provider = preferredProvider || getInjectedProvider();
  if (!provider?.request) throw new Error('No browser wallet detected. Install MetaMask or Binance Wallet.');
  setPreference('injected');
  setStatus('REQUESTING BROWSER WALLET');
  setButton('Connecting…', true);
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('Browser wallet returned no account');
  try {
    await ensureBsc(provider);
  } catch (e) {
    throw new Error('Please switch to BNB Smart Chain (BSC). ' + (e?.message || e));
  }
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (normalizeChainId(chainId) !== 56) throw new Error('Wallet is not on BSC Mainnet (chain 56)');
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
function setChooserMessage(text) {
  const box = document.getElementById('walletChooserMessage');
  if (box) box.textContent = String(text || '');
}
function renderWalletChooser() {
  const list = document.getElementById('walletList');
  if (!list) return;
  list.replaceChildren();
  const wallets = listAvailableWallets();
  const addChoice = (titleText, detailText, onChoose) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary wallet-choice-button';
    button.style.width = '100%';
    button.style.display = 'flex';
    button.style.flexDirection = 'column';
    button.style.alignItems = 'flex-start';
    button.style.gap = '4px';
    button.style.margin = '6px 0';
    const title = document.createElement('strong');
    title.textContent = titleText;
    const detail = document.createElement('span');
    detail.className = 'muted small';
    detail.textContent = detailText;
    button.append(title, detail);
    button.addEventListener('click', () => {
      setChooserMessage('');
      onChoose();
    });
    list.appendChild(button);
  };

  if (wallets.length) {
    wallets.forEach((wallet) => {
      addChoice(
        wallet.name || 'Browser Wallet',
        'Connect this injected wallet, then confirm BNB Smart Chain (56).',
        () => window.connectBrowserWallet(wallet.provider)
      );
    });
  } else {
    addChoice(
      'Browser wallet (MetaMask / Binance Wallet)',
      'Use a compatible browser extension or open PRONOUS from your wallet DApp browser.',
      () => window.connectBrowserWallet()
    );
  }
  addChoice(
    'Email / Google (Privy)',
    'Connect an existing EVM wallet, or use email/Google to create an embedded wallet.',
    () => window.connectPrivyWallet()
  );
}
function openWalletChooser() {
  const modal = document.getElementById('walletChooser');
  if (modal) {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }
  setChooserMessage('');
  renderWalletChooser();
  // Wallets may announce after the page scripts run; refresh the list once.
  setTimeout(renderWalletChooser, 250);
  setStatus('CHOOSE WALLET');
  setButton('Choose wallet…', true);
}
function closeWalletChooser() {
  const modal = document.getElementById('walletChooser');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
  }
  setChooserMessage('');
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
async function loadPrivyBundle() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const probe = await fetch('/vendor/privy-bundle.js', { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
    if (!probe.ok) throw new Error('Privy vendor bundle not deployed');
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('Privy vendor probe timeout');
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return Promise.race([
    import('/vendor/privy-bundle.js'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Privy import timeout')), 8000))
  ]);
}
async function bootPrivy() {
  setStatus('PRIVY LOADING');
  const ReactMod = await loadPrivyBundle();
  const RD = ReactMod;
  const PrivyMod = ReactMod;
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
  if (getPreference() !== 'privy' && !activeWallet) setStatus('WALLET NOT CONNECTED');
}
window.openWalletChooser = openWalletChooser;
window.closeWalletChooser = closeWalletChooser;
window.listAvailableWallets = listAvailableWallets;
window.connectBrowserWallet = async function (preferredProvider) {
  if (connecting) return;
  connecting = true;
  try { await connectInjected(preferredProvider); }
  catch (e) {
    const message = e?.message || String(e);
    setStatus('BROWSER WALLET ERROR: ' + message);
    setChooserMessage(/no browser wallet detected/i.test(message)
      ? 'No injected wallet was detected. Open this page in your wallet DApp browser, or choose Email / Google (Privy).'
      : 'Browser wallet connection failed: ' + message);
    setButton('Connect Wallet', false);
    console.warn('PRONOUS browser wallet connect failed:', e);
  }
  finally { connecting = false; }
};
window.connectPrivyWallet = async function () {
  if (connecting) return;
  connecting = true;
  try { await connectPrivy(); }
  catch (e) {
    const message = e?.message || String(e);
    if (/cancel|closed|dismiss|rejected/i.test(message)) {
      setStatus('WALLET NOT CONNECTED');
      setChooserMessage('Connection cancelled. Choose a wallet method to try again.');
    } else {
      setStatus('PRIVY ERROR: ' + message);
      setChooserMessage('Privy connection failed: ' + message);
    }
    setButton('Connect Wallet', false);
  }
  finally { connecting = false; }
};
window.connectWallet = async function connectWallet() {
  if (activeWallet) {
    if (normalizeChainId(activeWallet.chainId) !== 56) {
      try {
        await ensureBsc(activeProvider);
        const chainId = await activeProvider.request({ method: 'eth_chainId' });
        activeWallet = { ...activeWallet, chainId: normalizeChainId(chainId) };
        setWalletDisplay(activeWallet);
        setStatus(activeWallet.source === 'privy' ? 'PRIVY WALLET CONNECTED · BSC' : 'BROWSER WALLET CONNECTED · BSC');
      } catch (e) {
        const message = e?.message || String(e);
        setStatus('WALLET CHAIN SWITCH FAILED: ' + message);
        setChooserMessage('Could not switch to BNB Smart Chain (56): ' + message);
      }
      return;
    }
    await disconnectActive();
    return;
  }
  if (getPreference() === 'injected') return window.connectBrowserWallet();
  if (getPreference() === 'privy' && privyConnect) return window.connectPrivyWallet();
  openWalletChooser();
};
window.addEventListener('pronous:privy-disconnect-request', () => disconnectActive());
window.addEventListener('pronous:wallet-replay-request', () => {
  if (!activeWallet?.address) return;
  window.dispatchEvent(new CustomEvent('pronous:privy-wallet-connected', {
    detail: {
      source: activeWallet.source,
      address: activeWallet.address,
      chainId: normalizeChainId(activeWallet.chainId)
    }
  }));
});
exposeWalletApi();
restoreInjectedWallet().catch(() => false);
bootPrivy().catch(err => {
  bridgeError = err?.message || String(err);
  if (!activeWallet) {
    setStatus('WALLET NOT CONNECTED');
    setButton('Connect Wallet', false);
  }
  console.warn('PRONOUS Privy optional boot skipped:', err);
});
