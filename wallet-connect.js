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
