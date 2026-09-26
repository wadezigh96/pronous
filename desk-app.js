
// Agent Studio UX helpers — source contract: agent/AGENT_STUDIO_PROMPT.md
const PRONOUS_AGENT_STUDIO_PROMPT='Create and deploy a BSC mainnet autonomous agent named PRONOUS. Monitor tokenized equities through Binance Web3 API; search tickers; read token/reference prices; calculate spread; check market status; create transparent execution plans. Enforce scoped wallet policy, spend caps, contract allowlists, spot-only execution, simulation before broadcast, structured intents, and explicit user confirmation. Expose market, price, portfolio, quote, simulation and execution tools with secrets server-side. Register ERC-8004 identity, expose ERC-8183 tasks, enable x402 self-funding, and keep read-only/demo mode available when unfunded.';
function copyAgentStudioPrompt(){const f=document.getElementById('studioFeedback');const done=()=>{if(f)f.textContent='Deploy prompt copied.'};if(navigator.clipboard?.writeText)navigator.clipboard.writeText(PRONOUS_AGENT_STUDIO_PROMPT).then(done).catch(()=>fallbackCopyAgentStudioPrompt(done));else fallbackCopyAgentStudioPrompt(done)}
function fallbackCopyAgentStudioPrompt(done){const ta=document.createElement('textarea');ta.value=PRONOUS_AGENT_STUDIO_PROMPT;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){const f=document.getElementById('studioFeedback');if(f)f.textContent='Copy unavailable — use agent/AGENT_STUDIO_PROMPT.md'}ta.remove()}
function openAgentStudioDocs(){window.open('https://www.bnbchain.org/en/bnb-agent-studio','_blank','noopener,noreferrer')}
let walletAddress=null, walletProvider=null;
function shortAddress(a){a=String(a||'');return a&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):a||'Not connected'}
function setWalletUI(address){
 walletAddress=address||null;
 const label=document.getElementById('walletStatus'),addr=document.getElementById('walletAddress'),btn=document.getElementById('connectWalletBtn');
 if(label)label.textContent=address?'WALLET CONNECTED':'WALLET NOT CONNECTED';
 if(addr)addr.textContent=address?shortAddress(address):'Not connected';
 if(btn)btn.textContent=address?'Disconnect':'Connect Wallet';
}
window.addEventListener('pronous:privy-wallet-connected',event=>{
 const detail=event?.detail||{};
 walletProvider=detail.provider||window.walletProvider||null;
 walletAddress=detail.address||window.walletAddress||null;
 setWalletUI(walletAddress);
});
window.addEventListener('pronous:privy-wallet-disconnected',()=>{
 walletProvider=null;
 walletAddress=null;
 setWalletUI(null);
});
let discoveredProvider=null;
function rememberProvider(provider){
 if(!provider)return;
 discoveredProvider=provider;
 if(provider.isMetaMask || !walletProvider) walletProvider=provider;
}
window.addEventListener('eip6963:announceProvider',event=>rememberProvider(event.detail?.provider));
try{window.dispatchEvent(new Event('eip6963:requestProvider'));}catch(e){}
function openMetaMaskDapp(){
 const url='https://metamask.app.link/dapp/pronous.vercel.app';
 window.location.href=url;
}
async function legacyConnectWallet(){
 if(walletAddress){walletAddress=null;walletProvider=null;setWalletUI(null);return;}
 const provider=walletProvider||discoveredProvider||window.ethereum;
 if(!provider){
  const go=confirm('Wallet tidak terdeteksi di browser ini. Buka PRONOUS di MetaMask agar wallet bisa terhubung?');
  if(go)openMetaMaskDapp();
  return;
 }
 try{
  const accounts=await provider.request({method:'eth_requestAccounts'});
  let chain=await provider.request({method:'eth_chainId'});
  if(String(chain).toLowerCase()!=='0x38'){
   try{
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});
    chain=await provider.request({method:'eth_chainId'});
   }catch(e){alert('Please switch your wallet to BSC Mainnet (chain 56).');return;}
  }
  if(String(chain).toLowerCase()!=='0x38'){alert('Wallet is not on BSC Mainnet (chain 56).');return;}
  walletProvider=provider;setWalletUI(accounts?.[0]||null);
 }catch(e){alert('Wallet connection failed: '+(e?.message||e));}
}
function initInjectedWallet(){
 const provider=window.ethereum||discoveredProvider;
 if(!provider)return;
 rememberProvider(provider);
 provider.on?.('accountsChanged',a=>setWalletUI(a?.[0]||null));
 provider.on?.('chainChanged',()=>window.location.reload());
 provider.request?.({method:'eth_accounts'}).then(a=>setWalletUI(a?.[0]||null)).catch(()=>{});