import dotenv from 'dotenv';

dotenv.config();

export const env = {
  SUI_NETWORK: process.env.SUI_NETWORK || 'testnet',
  SUI_RPC_URL: process.env.SUI_RPC_URL,
  PACKAGE_ID: process.env.PACKAGE_ID || '',
  USDC_TYPE: process.env.USDC_TYPE || '0x2::sui::SUI', // Default to SUI for testing
  DEEPBOOK_SUI_USDC_POOL: process.env.DEEPBOOK_SUI_USDC_POOL || '',
  PORT: parseInt(process.env.PORT || '3001', 10),
};

export function getSuiRpcUrl(): string {
  if (env.SUI_RPC_URL) {
    return env.SUI_RPC_URL;
  }

  const networkUrls: Record<string, string> = {
    mainnet: 'https://fullnode.mainnet.sui.io:443',
    testnet: 'https://fullnode.testnet.sui.io:443',
    devnet: 'https://fullnode.devnet.sui.io:443',
    localnet: 'http://127.0.0.1:9000',
  };

  return networkUrls[env.SUI_NETWORK] || networkUrls.testnet;
}

export function validateEnv(): void {
  const required = ['PACKAGE_ID'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
    console.warn('Some features may not work correctly.');
  }
}
