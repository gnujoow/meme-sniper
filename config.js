import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Twitter credentials
  username: process.env.TWITTER_USERNAME,
  password: process.env.TWITTER_PASSWORD,
  cookies: process.env.TWITTER_COOKIES ? JSON.parse(process.env.TWITTER_COOKIES) : null,
  
  // Monitoring settings
  targetUsername: process.env.TARGET_USERNAME || 'elonmusk',
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 30000, // 30 seconds default
  
  // Optional keywords to watch for
  watchKeywords: process.env.WATCH_KEYWORDS ? 
    process.env.WATCH_KEYWORDS.split(',').map(k => k.trim()) : [],
  
  // Webhook for notifications
  webhookUrl: process.env.WEBHOOK_URL || null,
  
  // Wallet configuration
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  bscPrivateKey: process.env.BSC_PRIVATE_KEY,
  
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
  
  if (!config.username && !config.cookies) {
    errors.push('TWITTER_USERNAME is required (or provide TWITTER_COOKIES)');
  }
  
  if (!config.password && !config.cookies) {
    errors.push('TWITTER_PASSWORD is required (or provide TWITTER_COOKIES)');
  }
  
  if (!config.targetUsername) {
    errors.push('TARGET_USERNAME is required');
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease create a .env file based on .env.example');
    return false;
  }
  
  return true;
}