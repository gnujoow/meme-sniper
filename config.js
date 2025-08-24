import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Twitter authentication (no API key needed)
  twitterUsername: process.env.TWITTER_USERNAME,
  twitterPassword: process.env.TWITTER_PASSWORD,
  twitterEmail: process.env.TWITTER_EMAIL,
  
  // Monitoring settings
  targetUsername: process.env.TARGET_USERNAME || 'elonmusk',
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 30000, // 30 seconds default
  
  // Optional keywords to watch for
  watchKeywords: process.env.WATCH_KEYWORDS ? 
    process.env.WATCH_KEYWORDS.split(',').map(k => k.trim()) : [],
  
  // Webhook for notifications
  webhookUrl: process.env.WEBHOOK_URL || null,
  
  // Wallet configuration (separate mnemonics)
  solanaMnemonic: process.env.SOLANA_MNEMONIC,
  bscMnemonic: process.env.BSC_MNEMONIC,
  solanaDerivationPath: process.env.SOLANA_DERIVATION_PATH || "m/44'/501'/0'/0'",
  bscDerivationPath: process.env.BSC_DERIVATION_PATH || "m/44'/60'/0'/0/0",
  
  // RPC URLs
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  bscRpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
  
  // Auto-buy settings
  autoBuyEnabled: process.env.AUTO_BUY_ENABLED === 'true',
  maxBuyAmountSol: parseFloat(process.env.MAX_BUY_AMOUNT_SOL) || 10,
  maxBuyAmountBnb: parseFloat(process.env.MAX_BUY_AMOUNT_BNB) || 5
};

// Validate required config
export function validateConfig() {
  const errors = [];
  
  if (!config.twitterUsername) {
    errors.push('TWITTER_USERNAME is required');
  }
  
  if (!config.twitterPassword) {
    errors.push('TWITTER_PASSWORD is required');
  }
  
  if (!config.targetUsername) {
    errors.push('TARGET_USERNAME is required');
  }
  
  if (config.autoBuyEnabled) {
    if (!config.solanaMnemonic) {
      errors.push('SOLANA_MNEMONIC is required when auto-buy is enabled');
    }
    if (!config.bscMnemonic) {
      errors.push('BSC_MNEMONIC is required when auto-buy is enabled');
    }
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease create a .env file based on .env.example');
    return false;
  }
  
  return true;
}