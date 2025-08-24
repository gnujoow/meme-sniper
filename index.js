import chalk from 'chalk';
import { TwitterMonitor } from './utils/twitterMonitor.js';
import { config, validateConfig } from './config.js';

async function main() {
  console.log(chalk.bgCyan.black(' 🐦 Twitter Crypto Monitor '));
  console.log(chalk.cyan('Monitoring for Solana and BSC token addresses\n'));
  
  // Validate configuration
  if (!validateConfig()) {
    process.exit(1);
  }
  
  // Display configuration
  console.log(chalk.blue('📋 Configuration:'));
  console.log(chalk.gray(`  Target User: @${config.targetUsername}`));
  console.log(chalk.gray(`  Check Interval: ${config.checkInterval / 1000} seconds`));
  if (config.watchKeywords.length > 0) {
    console.log(chalk.gray(`  Keywords: ${config.watchKeywords.join(', ')}`));
  }
  if (config.webhookUrl) {
    console.log(chalk.gray(`  Webhook: Enabled`));
  }
  console.log();
  
  // Create monitor instance
  const monitor = new TwitterMonitor(config);
  
  // Initialize Twitter client
  const initialized = await monitor.initialize();
  if (!initialized) {
    console.error(chalk.red('❌ Failed to initialize. Exiting...'));
    process.exit(1);
  }
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
    monitor.stopMonitoring();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    monitor.stopMonitoring();
    process.exit(0);
  });
  
  // Start monitoring
  await monitor.startMonitoring();
}

// Run the application
main().catch(error => {
  console.error(chalk.red('❌ Fatal error:'), error);
  process.exit(1);
});