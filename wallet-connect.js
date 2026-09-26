const BSC_CHAIN_ID='0x38';
let pronousMMClient=null;
let pronousMMProvider=null;

async function getMetaMaskConnectClient(){
  if(pronousMMClient)return pronousMMClient;
  const mod=await import('https://cdn.jsdelivr.net/npm/@metamask/connect-evm@1.4.0/+esm');
  const {createEVMClient}=mod;
  pronousMMClient=await createEVMClient({
    dapp:{name:'PRONOUS',url:window.location.origin},
    api:{supportedNetworks:{[BSC_CHAIN_ID]:'https://bsc-dataseed.binance.org/'}},
    analytics:{enabled:false}
  });
  pronousMMProvider=pronousMMClient.getProvider();
  return pronousMMClient;
}

window.pronousConnectMobileWallet=async function(){
  const client=await getMetaMaskConnectClient();
  const result=await client.connect({chainIds:[BSC_CHAIN_ID]});
  if(!result?.accounts?.[0])throw new Error('NO_WALLET_ACCOUNT');
  window.dispatchEvent(new CustomEvent('pronous:wallet-connected',{detail:{provider:pronousMMProvider,accounts:result.accounts,chainId:result.chainId}}));
  return {provider:pronousMMProvider,accounts:result.accounts,chainId:result.chainId};
};
window.pronousDisconnectMobileWallet=async function(){
  if(pronousMMClient)await pronousMMClient.disconnect();
  pronousMMProvider=null;
};

function installPronousWalletBridge(){
  if(typeof window.connectWallet!=='function')return false;
  if(window.connectWallet.__pronousBridge)return true;
  const nativeConnect=window.connectWallet;
  async function bridgedConnectWallet(){
    if(window.walletAddress) return nativeConnect();
    const injected=window.ethereum;
    if(injected) return nativeConnect();
    try{
      const result=await window.pronousConnectMobileWallet();
      window.walletProvider=result.provider;
      window.walletAddress=result.accounts[0];
      if(typeof window.setWalletUI==='function')window.setWalletUI(window.walletAddress);
    }catch(e){
      const msg=e?.message||String(e);
      const status=document.getElementById('walletStatus');
      if(status)status.textContent=msg.includes('4001')?'WALLET REQUEST REJECTED':'WALLET CONNECTION FAILED';
      const fallback=confirm('MetaMask Connect gagal. Buka PRONOUS langsung di MetaMask?');
      if(fallback)window.location.href='https://metamask.app.link/dapp/pronous.vercel.app';
    }
  }
  bridgedConnectWallet.__pronousBridge=true;
  window.connectWallet=bridgedConnectWallet;
  return true;
}

window.addEventListener('load',()=>{installPronousWalletBridge();setTimeout(installPronousWalletBridge,250);});
setTimeout(installPronousWalletBridge,0);
setTimeout(installPronousWalletBridge,1000);
