import React,{useEffect} from 'https://esm.sh/react@18.3.1';
import {createRoot} from 'https://esm.sh/react-dom@18.3.1/client';
import {PrivyProvider,usePrivy,useWallets} from 'https://esm.sh/@privy-io/react-auth@1.98.4?deps=react@18.3.1,react-dom@18.3.1';
import {bsc} from 'https://esm.sh/viem@2.37.0/chains';

const PRIVY_APP_ID='cmuhzdouv000i0cl2u6q438gf';
let privyConnect=null;
let privyDisconnect=null;

function exposePrivyProvider(provider,address,chainId){
  try{Object.defineProperty(window,'ethereum',{value:provider,writable:true,configurable:true})}catch(e){window.ethereum=provider}
  window.__pronousPrivyConnected=true;
  window.__pronousPrivyAddress=address;
  window.__pronousPrivyProvider=provider;
  if(typeof window.initInjectedWallet==='function')window.initInjectedWallet();
  window.dispatchEvent(new CustomEvent('pronous:privy-wallet-connected',{detail:{provider,address,chainId}}));
}

function PrivyBridge(){
  const {ready,authenticated,login,logout,createWallet}=usePrivy();
  const {wallets}=useWallets();

  useEffect(()=>{
    const connect=async()=>{
      if(!ready)return;
      if(!authenticated){await login();return;}
      let wallet=wallets?.find(w=>w.walletClientType==='privy')||wallets?.[0];
      if(!wallet){try{await createWallet()}catch(e){console.warn('Privy createWallet:',e)}return;}
      const provider=await wallet.getEthereumProvider();
      let chain=await provider.request({method:'eth_chainId'});
      if(String(chain).toLowerCase()!=='0x38'){
        await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});
        chain=await provider.request({method:'eth_chainId'});
      }
      exposePrivyProvider(provider,wallet.address,chain);
    };
    privyConnect=connect;
    privyDisconnect=async()=>{if(authenticated)await logout();window.__pronousPrivyConnected=false;window.dispatchEvent(new CustomEvent('pronous:privy-wallet-disconnected'))};
    window.dispatchEvent(new CustomEvent('pronous:privy-ready',{detail:{ready,authenticated,address:wallets?.[0]?.address||null}}));
  },[ready,authenticated,login,logout,createWallet,wallets]);

  useEffect(()=>{
    if(!ready||!authenticated)return;
    (async()=>{
      try{
        const wallet=wallets?.find(w=>w.walletClientType==='privy')||wallets?.[0];
        if(!wallet)return;
        const provider=await wallet.getEthereumProvider();
        const chain=await provider.request({method:'eth_chainId'});
        exposePrivyProvider(provider,wallet.address,chain);
      }catch(e){console.warn('Privy wallet sync:',e)}
    })();
  },[ready,authenticated,wallets]);
  return null;
}

function mount(){
  let el=document.getElementById('privy-root');
  if(!el){el=document.createElement('div');el.id='privy-root';el.hidden=true;document.body.appendChild(el)}
  createRoot(el).render(React.createElement(PrivyProvider,{appId:PRIVY_APP_ID,defaultChain:bsc,supportedChains:[bsc],config:{embeddedWallets:{createOnLogin:'all-users',requireUserOwnedRecoveryOnCreate:false}}},React.createElement(PrivyBridge)));
}

window.connectWallet=async function(){
  if(window.__pronousPrivyConnected){window.dispatchEvent(new CustomEvent('pronous:privy-disconnect-request'));return}
  if(privyConnect)await privyConnect();else window.__pronousPrivyPending=true;
};
window.addEventListener('pronous:privy-ready',()=>{if(window.__pronousPrivyPending){window.__pronousPrivyPending=false;privyConnect?.()}});
window.addEventListener('pronous:privy-disconnect-request',()=>privyDisconnect?.());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
