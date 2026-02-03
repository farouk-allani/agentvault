import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import App from './App';
import './styles.css';
import '@mysten/dapp-kit/dist/index.css';

const queryClient = new QueryClient();

// Network configuration for Sui dapp-kit v1.x
const { networkConfig } = createNetworkConfig({
  testnet: {
    url: 'https://fullnode.testnet.sui.io:443',
    network: 'testnet',
  },
  mainnet: {
    url: 'https://fullnode.mainnet.sui.io:443',
    network: 'mainnet',
  },
  devnet: {
    url: 'https://fullnode.devnet.sui.io:443',
    network: 'devnet',
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
