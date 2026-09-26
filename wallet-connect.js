import React,{useEffect} from 'https://esm.sh/react@18.3.1';
import {createRoot} from 'https://esm.sh/react-dom@18.3.1/client';
import {PrivyProvider,usePrivy,useWallets} from 'https://esm.sh/@privy-io/react-auth@3.43.0?deps=react@18.3.1,react-dom@18.3.1';
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
  if(btn){btn.disabled=false;btn.textContent=window.__pronousPrivyConnected?'Disconnect':'Connect Wallet'}
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
  const btn=document.getElementById('connectWalletBtn');if(btn){btn.disabled=false;btn.textContent='Disconnect'}
}

function PrivyBridge(){
  const {ready,authenticated,login,logout}=usePrivy();
  const {wallets,ready:walletsReady}=useWallets();

  useEffect(()=>{
    privyReady=Boolean(ready);privyAuthenticated=Boolean(authenticated);
    if(!ready){setConnectState('PRIVY LOADING');return}
    if(!authenticated){setConnectState('WALLET NOT CONNECTED');return}
    setConnectState('PRIVY AUTHENTICATED');
  },[ready,authenticated]);

  useEffect(()=>{
    const connect=async()=>{
      try{
        if(!ready){setConnectState('PRIVY LOADING');return}
        if(!authenticated){setConnectState('OPENING PRIVY');await login();return}
        if(!walletsReady){setConnectState('PRIVY WALLET LOADING');return}
        const wallet=wallets?.find(w=>w.walletClientType==='privy'&&w.chainType==='ethereum')||wallets?.find(w=>w.chainType==='ethereum')||wallets?.[0];
        if(!wallet)throw new Error('PRIVY_WALLET_NOT_AVAILABLE');
        const provider=await wallet.getEthereumProvider();
        if(!provider)throw new Error('PRIVY_EVM_PROVIDER_NOT_AVAILABLE');
        let chain=await provider.request({method:'eth_chainId'});
        if(String(chain).toLowerCase()!=='0x38'){
          try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]})}catch(e){throw new Error('Please switch the Privy wallet to BSC Mainnet (chain 56).')}
          chain=await provider.request({method:'eth_chainId'});
        }
        const accounts=await provider.request({method:'eth_accounts'});
        const address=wallet.address||accounts?.[0];
        if(!address)throw new Error('PRIVY_WALLET_ADDRESS_NOT_AVAILABLE');
        exposePrivyProvider(provider,address,chain);
      }catch(e){
        privyError=e?.message||String(e);
        setConnectState('WALLET NOT CONNECTED',true);
        console.error('PRONOUS Privy connect:',e);
        window.dispatchEvent(new CustomEvent('pronous:privy-error',{detail:{message:privyError}}));
      }
    };
    privyConnect=connect;
    privyDisconnect=async()=>{try{if(authenticated)await logout()}finally{window.__pronousPrivyConnected=false;window.__pronousPrivyAddress=null;window.__pronousPrivyProvider=null;window.walletProvider=null;window.walletAddress=null;setConnectState('WALLET NOT CONNECTED');window.dispatchEvent(new CustomEvent('pronous:privy-wallet-disconnected'))}};
    window.dispatchEvent(new CustomEvent('pronous:privy-ready',{detail:{ready,authenticated,address:wallets?.[0]?.address||null}}));
    if(window.__pronousPrivyPending&&ready){window.__pronousPrivyPending=false;connect()}
  },[ready,authenticated,wallets,walletsReady,login,logout]);

  useEffect(()=>{
    if(!ready||!authenticated||!walletsReady)return;
    const sync=async()=>{try{
      const wallet=wallets?.find(w=>w.walletClientType==='privy'&&w.chainType==='ethereum')||wallets?.find(w=>w.chainType==='ethereum');
      if(!wallet)return;
      const provider=await wallet.getEthereumProvider();
      const chain=await provider.request({method:'eth_chainId'});
      exposePrivyProvider(provider,wallet.address,chain);
    }catch(e){console.warn('Privy wallet sync:',e)}};
    sync();
  },[ready,authenticated,walletsReady,wallets]);
  return null;
}

function mount(){
  let el=document.getElementById('privy-root');
  if(!el){el=document.createElement('div');el.id='privy-root';document.body.appendChild(el)}
  try{
    const config={
      defaultChain:bsc,
      supportedChains:[bsc],
      loginMethods:['email','google','wallet'],
      embeddedWallets:{ethereum:{createOnLogin:'all-users',requireUserOwnedRecoveryOnCreate:false}}
    };
    createRoot(el).render(React.createElement(PrivyProvider,{appId:PRIVY_APP_ID,config},React.createElement(PrivyBridge)));
  }catch(e){privyError=e?.message||String(e);setConnectState('PRIVY ERROR',true);console.error('PRONOUS Privy mount:',e)}
}

window.connectWallet=async function(){
  const btn=document.getElementById('connectWalletBtn');if(btn)btn.disabled=true;
  try{
    if(window.__pronousPrivyConnected){await privyDisconnect?.();return}
    if(privyConnect){await privyConnect();return}
    window.__pronousPrivyPending=true;
    setConnectState(privyReady?'OPENING PRIVY':'PRIVY LOADING');
    const deadline=Date.now()+8000;
    while(!privyConnect&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
    if(privyConnect){window.__pronousPrivyPending=false;await privyConnect()}
    else{window.__pronousPrivyPending=false;setConnectState('PRIVY NOT READY',true);console.error('PRONOUS: Privy bridge did not initialize',privyError)}
  }finally{if(btn&&!window.__pronousPrivyConnected)btn.disabled=false}
};
window.addEventListener('pronous:privy-disconnect-request',()=>privyDisconnect?.());
window.addEventListener('error',e=>{if(String(e?.message||'').toLowerCase().includes('privy'))console.error('PRONOUS Privy error:',e.error||e.message)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
