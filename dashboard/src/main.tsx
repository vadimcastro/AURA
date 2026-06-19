import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { JsonRpcHTTPTransport, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import '@mysten/dapp-kit/dist/index.css'
import App from './App.tsx'

const { networkConfig } = createNetworkConfig({
  testnet: {
    network: 'testnet',
    transport: new JsonRpcHTTPTransport({
      url: getJsonRpcFullnodeUrl('testnet'),
    }),
  },
  mainnet: {
    network: 'mainnet',
    transport: new JsonRpcHTTPTransport({
      url: getJsonRpcFullnodeUrl('mainnet'),
    }),
  },
});

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>,
)
