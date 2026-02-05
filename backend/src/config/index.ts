import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// OFFICIAL DEEPBOOK V3 ADDRESSES (from @mysten/deepbook-v3 SDK)
// ============================================================================

// TESTNET Token Types
const TESTNET_TOKENS = {
  DEEP: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
  SUI: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  DBUSDC: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
  DBUSDT: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDT::DBUSDT',
};

// TESTNET Pool Addresses
const TESTNET_POOLS = {
  DEEP_SUI: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
  SUI_DBUSDC: '0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5',
  DEEP_DBUSDC: '0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622',
  DBUSDT_DBUSDC: '0x83970bb02e3636efdff8c141ab06af5e3c9a22e2f74d7f02a9c3430d0d10c1ca',
};

// TESTNET DeepBook Package
const TESTNET_DEEPBOOK_PACKAGE = '0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c';

// MAINNET Token Types
const MAINNET_TOKENS = {
  DEEP: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
  SUI: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  USDC: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
  WUSDC: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
  WUSDT: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
};

// MAINNET Pool Addresses
const MAINNET_POOLS = {
  DEEP_SUI: '0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22',
  SUI_USDC: '0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407',
  DEEP_USDC: '0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce',
  WUSDT_USDC: '0x4e2ca3988246e1d50b9bf209abb9c1cbfec65bd95afdacc620a36c67bdb8452f',
  WUSDC_USDC: '0xa0b9ebefb38c963fd115f52d71fa64501b79d1adcb5270563f92ce0442376545',
};

// MAINNET DeepBook Package
const MAINNET_DEEPBOOK_PACKAGE = '0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497';

// ============================================================================

const network = process.env.SUI_NETWORK || 'testnet';
const isMainnet = network === 'mainnet';

export const env = {
  SUI_NETWORK: network,
  SUI_RPC_URL: process.env.SUI_RPC_URL,
  PACKAGE_ID: process.env.PACKAGE_ID || '',
  
  // Token Types (auto-select based on network)
  DEEP_TYPE: process.env.DEEP_TYPE || (isMainnet ? MAINNET_TOKENS.DEEP : TESTNET_TOKENS.DEEP),
  SUI_TYPE: TESTNET_TOKENS.SUI, // Same on both networks
  // DBUSDC is the DeepBook testnet stablecoin (what the testnet pools actually use)
  DBUSDC_TYPE: process.env.DBUSDC_TYPE || TESTNET_TOKENS.DBUSDC,
  // USDC is native USDC on mainnet
  USDC_TYPE: process.env.USDC_TYPE || (isMainnet ? MAINNET_TOKENS.USDC : TESTNET_TOKENS.DBUSDC),
  
  // Pool Addresses (auto-select based on network)
  DEEPBOOK_DEEP_SUI_POOL: process.env.DEEPBOOK_DEEP_SUI_POOL || (isMainnet ? MAINNET_POOLS.DEEP_SUI : TESTNET_POOLS.DEEP_SUI),
  DEEPBOOK_SUI_USDC_POOL: process.env.DEEPBOOK_SUI_USDC_POOL || (isMainnet ? MAINNET_POOLS.SUI_USDC : TESTNET_POOLS.SUI_DBUSDC),
  DEEPBOOK_DEEP_USDC_POOL: process.env.DEEPBOOK_DEEP_USDC_POOL || (isMainnet ? MAINNET_POOLS.DEEP_USDC : TESTNET_POOLS.DEEP_DBUSDC),
  DEEPBOOK_DEEP_DBUSDC_POOL: process.env.DEEPBOOK_DEEP_DBUSDC_POOL || TESTNET_POOLS.DEEP_DBUSDC,
  
  // DeepBook Package ID
  DEEPBOOK_PACKAGE_ID: process.env.DEEPBOOK_PACKAGE_ID || (isMainnet ? MAINNET_DEEPBOOK_PACKAGE : TESTNET_DEEPBOOK_PACKAGE),
  
  PORT: parseInt(process.env.PORT || '3001', 10),
};

// Export network-specific configs for direct access
export const TOKENS = isMainnet ? MAINNET_TOKENS : TESTNET_TOKENS;
export const POOLS = isMainnet ? MAINNET_POOLS : TESTNET_POOLS;
export const DEEPBOOK_PACKAGE = isMainnet ? MAINNET_DEEPBOOK_PACKAGE : TESTNET_DEEPBOOK_PACKAGE;

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
