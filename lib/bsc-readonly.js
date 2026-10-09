'use strict';

const DEFAULT_BSC_RPC_URL = 'https://bsc-dataseed.binance.org';
const ALLOWED_RPC_HOSTS = new Set(['bsc-dataseed.binance.org']);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_RE = /^0x(?:[a-fA-F0-9]{2})*$/;

function validateRpcUrl(value = DEFAULT_BSC_RPC_URL) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error('INVALID_BSC_RPC_URL');
  }
  if (url.protocol !== 'https:' || !ALLOWED_RPC_HOSTS.has(url.hostname.toLowerCase()) ||
      url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('BSC_RPC_HOST_NOT_ALLOWED');
  }
  return url.toString().replace(/\/$/, '');
}

async function rpcCall(rpcUrl, method, params, fetchImpl) {
  const response = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(8000)
  });
  const type = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (!response.ok || !type.includes('application/json')) throw new Error('BSC_RPC_REQUEST_FAILED');
  const body = await response.json();
  if (body?.error || !Object.prototype.hasOwnProperty.call(body || {}, 'result')) {
    throw new Error('BSC_RPC_RESPONSE_INVALID');
  }
  return body.result;
}

/**
 * Read-only BSC mainnet verification. Uses only eth_chainId and eth_getCode;
 * it cannot sign, approve, construct, or broadcast transactions.
 * A non-empty code result proves only that code exists at the address, not
 * that the address implements a particular protocol or has a safe ABI.
 */
async function verifyBscMainnetContracts(addresses, options = {}) {
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 30) {
    throw new Error('ADDRESSES_MUST_BE_ARRAY_OF_1_TO_30');
  }
  const normalized = addresses.map((entry) => {
    const address = typeof entry === 'string' ? entry : entry?.address;
    const label = typeof entry === 'string' ? '' : String(entry?.label || '').slice(0, 80);
    if (!ADDRESS_RE.test(String(address || ''))) throw new Error('INVALID_CONTRACT_ADDRESS');
    return { address: String(address), label };
  });
  const rpcUrl = validateRpcUrl(options.rpcUrl || DEFAULT_BSC_RPC_URL);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_UNAVAILABLE');

  const chainId = await rpcCall(rpcUrl, 'eth_chainId', [], fetchImpl);
  if (String(chainId).toLowerCase() !== '0x38') {
    throw new Error('WRONG_CHAIN_ID_EXPECTED_BSC_MAINNET_56');
  }

  const contracts = [];
  for (const item of normalized) {
    const code = await rpcCall(rpcUrl, 'eth_getCode', [item.address, 'latest'], fetchImpl);
    if (typeof code !== 'string' || !HEX_RE.test(code)) throw new Error('INVALID_BYTECODE_RESPONSE');
    contracts.push({
      ...item,
      chainId: 56,
      hasCode: code !== '0x' && code !== '0x0',
      bytecodeBytes: code === '0x' || code === '0x0' ? 0 : (code.length - 2) / 2
    });
  }
  return {
    network: 'BSC Mainnet',
    chainId: 56,
    mode: 'read-only',
    transactionBroadcast: false,
    note: 'Code presence is not protocol identity, ABI verification, or an audit.',
    contracts
  };
}

module.exports = { DEFAULT_BSC_RPC_URL, validateRpcUrl, verifyBscMainnetContracts };
