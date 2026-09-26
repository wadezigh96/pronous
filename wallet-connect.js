import React,{useEffect,useState} from 'https://esm.sh/react@18.3.1';
import {createRoot} from 'https://esm.sh/react-dom@18.3.1/client';
import {PrivyProvider,usePrivy,useWallets} from 'https://esm.sh/@privy-io/react-auth@1.98.4?deps=react@18.3.1,react-dom@18.3.1';
import {bsc} from 'https://esm.sh/viem@2.37.0/chains';

const PRIVY_APP_ID='cmuhzdouv000i0cl2u6q438gf';
let privyConnect=null;
let privyDisconnect=null;
let privyReady=false;
let privyAuthenticated=false;
let privyError=null;

function setConnectState(text,error=false){
  window.__pronousPrivyStatus=text;
  const el=document.getElementById('walletStatus');
  if(el&&!window.__pronousPrivyConnected)el.textContent=text;
  const btn=document.getElementById('connectWalletBtn');
  if(btn){btn.disabled=false;btn.textContent=window.__pronousPrivyConnected?'Disconnect':error?'Connect Wallet':'Connect Wallet';}
}

function exposePrivyProvider(provider,address,chainId){
  try{Object.defineProperty(window,'ethereum',{value:provider,writable:true,configurable:true})}catch(e){window.ethereum=provider}
  window.__pronousPrivyConnected=true;
  window.__pronousPrivyAddress=address;
  window.__pronousPrivyProvider=provider;
  window.walletProvider=provider;
  window.walletAddress=address;
  if(typeof window.initInjectedWallet==='function')window.initInjectedWallet();
  window.dispatchEvent(new CustomEvent('pronous:privy-wallet-connected',{detail:{provider,address,chainId}}));
  const status=document.getElementById('walletStatus');if(status)status.textContent='WALLET CONNECTED';
  const btn=document.getElementById('connectWalletBtn');if(btn)btn.textContent='Disconnect';
}

function PrivyBridge(){
  const {ready,authenticated,login,logout,createWallet}=usePrivy();
  const {wallets}=useWallets();
  const [,force]=useState(0);

  useEffect(()=>{
    privyReady=ready;privyAuthenticated=authenticated;
    if(!ready){setConnectState('PRIVY LOADING');return}
    if(!authenticated){setConnectState('WALLET NOT CONNECTED');return}
    setConnectState('PRIVY AUTHENTICATED');
    force(v=>v+1);
  },[ready,authenticated]);

  useEffect(()=>{
    const connect=async()=>{
      try{
        if(!ready){setConnectState('PRIVY LOADING');return}
        if(!authenticated){setConnectState('OPENING PRIVY');await login();return}
        let wallet=wallets?.find(w=>w.walletClientType==='privy')||wallets?.[0];
        if(!wallet){setConnectState('CREATING WALLET');wallet=await createWallet();}
        if(!wallet){throw new Error('PRIVY_WALLET_NOT_AVAILABLE')}
        const provider=await wallet.getEthereumProvider();
        if(!provider)throw new Error('PRIVY_EVM_PROVIDER_NOT_AVAILABLE');
        let chain=await provider.request({method:'eth_chainId'});
        if(String(chain).toLowerCase()!=='0x38'){
          try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]})}catch(e){throw new Error('Please switch Privy wallet to BSC Mainnet (chain 56).')}
          chain=await provider.request({method:'eth_chainId'});
        }
        const accounts=await provider.request({method:'eth_accounts'});
        const address=wallet.address||accounts?.[0];
        if(!address)throw new Error('PRIVY_WALLET_ADDRESS_NOT_AVAILABLE');
        exposePrivyProvider(provider,address,chain);
      }catch(e){
        privyError=e?.message||String(e);setConnectState('WALLET NOT CONNECTED',true);
        console.error('PRONOUS Privy connect:',e);
        window.dispatchEvent(new CustomEvent('pronous:privy-error',{detail:{message:privyError}}));
      }
    };
    privyConnect=connect;
    privyDisconnect=async()=>{try{if(authenticated)await logout()}finally{window.__pronousPrivyConnected=false;window.__pronousPrivyAddress=null;window.__pronousPrivyProvider=null;setConnectState('WALLET NOT CONNECTED');window.dispatchEvent(new CustomEvent('pronous:privy-wallet-disconnected'))}};
    window.dispatchEvent(new CustomEvent('pronous:privy-ready',{detail:{ready,authenticated,address:wallets?.[0]?.address||null}}));
    if(window.__pronousPrivyPending&&ready){window.__pronousPrivyPending=false;connect()}
  },[ready,authenticated,login,logout,createWallet,wallets]);

  useEffect(()=>{
    if(!ready||!authenticated)return;
    (async()=>{try{
      const wallet=wallets?.find(w=>w.walletClientType==='privy')||wallets?.[0];
      if(!wallet)return;
      const provider=await wallet.getEthereumProvider();
      const chain=await provider.request({method:'eth_chainId'});
      exposePrivyProvider(provider,wallet.address,chain);
    }catch(e){console.warn('Privy wallet sync:',e)}})();
  },[ready,authenticated,wallets]);
  return null;
}

function mount(){
  let el=document.getElementById('privy-root');
  if(!el){el=document.createElement('div');el.id='privy-root';document.body.appendChild(el)}
  try{
    createRoot(el).render(React.createElement(PrivyProvider,{appId:PRIVY_APP_ID,defaultChain:bsc,supportedChains:[bsc],config:{embeddedWallets:{createOnLogin:'all-users',requireUserOwnedRecoveryOnCreate:false}}},React.createElement(PrivyBridge)));
  }catch(e){privyError=e?.message||String(e);setConnectState('WALLET NOT CONNECTED',true);console.error('PRONOUS Privy mount:',e)}
}

function injectMobileDeskUX(){
  if(document.getElementById('pronous-mobile-ux'))return;
  const style=document.createElement('style');
  style.id='pronous-mobile-ux';
  style.textContent=`
    @media(max-width:900px){
      .topbar{height:auto;min-height:58px;padding:8px 0;display:grid;grid-template-columns:1fr auto;gap:7px;align-items:center}
      .topbar-title{font-size:10px}.topbar-sub{font-size:8px;margin-left:5px}.health{font-size:8px;padding:5px 7px;grid-column:2;grid-row:1}
      .wallet-bar{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:0}
      .wallet-status{font:700 9px 'IBM Plex Mono',monospace;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;color:#9d9788}
      #connectWalletBtn{width:auto;min-width:132px;padding:8px 11px;font-size:10px;border-radius:9px}
      .ticker{gap:20px;padding:7px 13px;font-size:9px}
      .dashboard-head{padding:18px 0 5px}.dashboard-head h1{font-size:27px;line-height:1.02}.dashboard-head p{font-size:11px;margin:8px 0}
      .eyebrow{font-size:8px}.kpis{gap:7px;margin:11px 0}.kpi{padding:10px;border-radius:11px}.kpi-label{font-size:8px}.kpi-value{font-size:17px;margin-top:5px}.kpi-note{font-size:9px}
      .card{padding:13px;border-radius:14px}.card h2{font-size:12px}.terminal-head{margin-bottom:8px}.terminal-head small{font-size:8px}
      .chart-box{padding:7px}.chart-box canvas{height:130px}.gap-chart canvas{height:150px}.result{font-size:10px;line-height:1.5}
      .metric{font-size:22px}.tag{font-size:8px;padding:5px 7px}
      .exec-pipeline{gap:5px}.exec-step{min-height:54px;padding:7px;border-radius:8px}.exec-step b{font-size:8px}.exec-step span{font-size:9px}.exec-step em{font-size:8px}
      .mobile-nav{height:52px;left:8px;right:8px;bottom:8px}.mobile-nav a{font-size:8px}
    }
  `;
  document.head.appendChild(style);
}

window.connectWallet=async function(){
  const btn=document.getElementById('connectWalletBtn');if(btn)btn.disabled=false;
  if(window.__pronousPrivyConnected){await privyDisconnect?.();return}
  if(privyConnect){await privyConnect();return}
  window.__pronousPrivyPending=true;
  setConnectState(privyReady?'OPENING PRIVY':'PRIVY LOADING');
  for(let i=0;i<20&&!privyConnect;i++)await new Promise(r=>setTimeout(r,250));
  if(privyConnect){window.__pronousPrivyPending=false;await privyConnect()}
  else {setConnectState('PRIVY NOT READY',true);console.error('PRONOUS: Privy bridge did not initialize',privyError)}
};
window.addEventListener('pronous:privy-disconnect-request',()=>privyDisconnect?.());
window.addEventListener('error',e=>{if(String(e?.message||'').toLowerCase().includes('privy'))console.error('PRONOUS Privy error:',e.error||e.message)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{injectMobileDeskUX();mount()},{once:true});else{injectMobileDeskUX();mount()}
