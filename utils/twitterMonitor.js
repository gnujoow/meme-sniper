import { Scraper } from '@the-convocation/twitter-scraper';
import chalk from 'chalk';
import { AddressDetector } from './addressDetector.js';
import { SolanaTokenBuyer } from './solanaTokenBuyer.js';
import { BSCTokenBuyer } from './bscTokenBuyer.js';

export class TwitterMonitor {
  constructor(config) {
    this.config = config;
    this.scraper = new Scraper();
    this.detector = new AddressDetector();
    this.lastTweetId = null;
    this.isRunning = false;
    this.processedTweets = new Set();
    
    // Initialize token buyers if auto-buy is enabled
    if (config.autoBuyEnabled) {
      if (config.solanaMnemonic) {
        this.solanaBuyer = new SolanaTokenBuyer(
          config.solanaMnemonic, 
          config.solanaDerivationPath, 
          config.solanaRpcUrl
        );
        console.log(chalk.green('✅ Solana auto-buy enabled'));
      }
      if (config.bscMnemonic) {
        this.bscBuyer = new BSCTokenBuyer(
          config.bscMnemonic, 
          config.bscDerivationPath, 
          config.bscRpcUrl
        );
        console.log(chalk.green('✅ BSC auto-buy enabled'));
      }
    }
  }

  async initialize() {
    try {
      console.log(chalk.blue('🔐 Logging into Twitter...'));
      
      // Login to Twitter using username, password, and email
      await this.scraper.login(
        this.config.twitterUsername,
        this.config.twitterPassword,
        this.config.twitterEmail
      );
      
      console.log(chalk.green('✅ Successfully logged into Twitter'));
      
      // Test by fetching target user info
      try {
        const profile = await this.scraper.getProfile(this.config.targetUsername);
        if (!profile) {
          throw new Error(`Profile @${this.config.targetUsername} not found`);
        }
        console.log(chalk.green(`✅ Found target user: @${this.config.targetUsername} (${profile.name})`));
        return true;
      } catch (profileError) {
        console.error(chalk.red(`❌ Could not find user @${this.config.targetUsername}`));
        return false;
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to login to Twitter:'), error.message);
      console.log(chalk.yellow('ℹ️  Make sure your Twitter credentials are correct'));
      console.log(chalk.yellow('   Note: Use a burner account as this may trigger rate limits'));
      return false;
    }
  }

  async fetchLatestTweets() {
    try {
      console.log(chalk.gray(`📡 Fetching tweets from @${this.config.targetUsername}...`));
      
      // Get tweets from the target user
      const tweets = [];
      const tweetIterator = this.scraper.getTweets(this.config.targetUsername, 10);
      
      for await (const tweet of tweetIterator) {
        tweets.push(tweet);
        if (tweets.length >= 10) break; // Limit to 10 tweets
      }
      
      console.log(chalk.gray(`📊 Retrieved ${tweets.length} tweets`));
      return tweets;
      
    } catch (error) {
      console.error(chalk.red('❌ Error fetching tweets:'), error.message);
      
      // Check if we got rate limited or logged out
      if (error.message.includes('401') || error.message.includes('403')) {
        console.log(chalk.yellow('⚠️  Possible authentication issue, attempting re-login...'));
        const relogin = await this.initialize();
        if (!relogin) {
          console.error(chalk.red('❌ Re-login failed'));
        }
      }
      
      return [];
    }
  }

  async processTweet(tweet) {
    // Skip if already processed
    if (this.processedTweets.has(tweet.id)) {
      return null;
    }
    
    this.processedTweets.add(tweet.id);
    
    // Analyze tweet content
    const analysis = this.detector.analyzeTweet(tweet.text || '');
    
    if (analysis.hasCryptoContent) {
      const result = {
        id: tweet.id,
        username: tweet.username || this.config.targetUsername,
        text: tweet.text,
        url: `https://twitter.com/${tweet.username || this.config.targetUsername}/status/${tweet.id}`,
        timestamp: tweet.timeParsed || new Date().toISOString(),
        analysis
      };
      
      this.displayAlert(result);
      
      // Auto-buy tokens if enabled
      if (this.config.autoBuyEnabled) {
        await this.autoBuyTokens(result);
      }
      
      return result;
    }
    
    return null;
  }

  async autoBuyTokens(result) {
    const { solanaAddresses, bscAddresses } = result.analysis;
    
    // Buy Solana tokens
    if (solanaAddresses.length > 0 && this.solanaBuyer) {
      for (const address of solanaAddresses) {
        console.log(chalk.bgMagenta.white('\n 🚀 AUTO-BUYING SOLANA TOKEN '));
        console.log(chalk.white(`   Address: ${address}`));
        try {
          const buyResult = await this.solanaBuyer.buyToken(address);
          if (buyResult.success) {
            console.log(chalk.green('✅ Solana token purchase successful!'));
            console.log(chalk.gray(`   Platform: ${buyResult.platform}`));
            console.log(chalk.gray(`   Amount: ${buyResult.amount} SOL`));
            console.log(chalk.gray(`   Signature: ${buyResult.signature}`));
          } else {
            console.log(chalk.yellow(`⚠️  Solana purchase failed: ${buyResult.error}`));
          }
        } catch (error) {
          console.error(chalk.red('❌ Solana auto-buy error:'), error.message);
        }
      }
    }
    
    // Buy BSC tokens
    if (bscAddresses.length > 0 && this.bscBuyer) {
      for (const address of bscAddresses) {
        console.log(chalk.bgYellow.black('\n 🚀 AUTO-BUYING BSC TOKEN '));
        console.log(chalk.white(`   Address: ${address}`));
        try {
          const buyResult = await this.bscBuyer.buyToken(address);
          if (buyResult.success) {
            console.log(chalk.green('✅ BSC token purchase successful!'));
            console.log(chalk.gray(`   Platform: ${buyResult.platform}`));
            console.log(chalk.gray(`   Amount: ${buyResult.amount} BNB`));
            console.log(chalk.gray(`   Transaction: ${buyResult.hash}`));
          } else {
            console.log(chalk.yellow(`⚠️  BSC purchase failed: ${buyResult.error}`));
          }
        } catch (error) {
          console.error(chalk.red('❌ BSC auto-buy error:'), error.message);
        }
      }
    }
  }

  displayAlert(result) {
    console.log('\n' + chalk.bgYellow.black(' 🚨 CRYPTO CONTENT DETECTED! '));
    console.log(chalk.cyan('━'.repeat(60)));
    console.log(chalk.white('👤 User: ') + chalk.yellow(`@${result.username}`));
    console.log(chalk.white('🕐 Time: ') + chalk.gray(new Date(result.timestamp).toLocaleString()));
    console.log(chalk.white('🔗 Tweet URL: ') + chalk.blue(result.url));
    console.log(chalk.white('📝 Tweet:'));
    console.log(chalk.gray(`   ${result.text}`));
    console.log(chalk.cyan('━'.repeat(60)));
    
    if (result.analysis.solanaAddresses.length > 0) {
      console.log(chalk.green('🟣 Solana Addresses Found:'));
      result.analysis.solanaAddresses.forEach(addr => {
        console.log(chalk.yellow(`   • ${addr}`));
      });
    }
    
    if (result.analysis.bscAddresses.length > 0) {
      console.log(chalk.green('🟡 BSC Addresses Found:'));
      result.analysis.bscAddresses.forEach(addr => {
        console.log(chalk.yellow(`   • ${addr}`));
      });
    }
    
    if (result.analysis.keywords.length > 0) {
      console.log(chalk.green('🔑 Keywords Detected:'));
      console.log(chalk.yellow(`   ${result.analysis.keywords.join(', ')}`));
    }
    
    if (result.analysis.urls && result.analysis.urls.length > 0) {
      console.log(chalk.green('🌐 URLs Found in Tweet:'));
      result.analysis.urls.forEach(url => {
        console.log(chalk.blue(`   • ${url}`));
      });
    }
    
    console.log(chalk.cyan('━'.repeat(60)) + '\n');
  }

  async startMonitoring() {
    if (this.isRunning) {
      console.log(chalk.yellow('⚠️  Monitor is already running'));
      return;
    }
    
    this.isRunning = true;
    console.log(chalk.green(`✅ Starting monitor for @${this.config.targetUsername}`));
    console.log(chalk.gray(`Check interval: ${this.config.checkInterval / 1000} seconds`));
    
    if (this.config.autoBuyEnabled) {
      console.log(chalk.magenta('🚀 Auto-buy is ENABLED'));
    } else {
      console.log(chalk.gray('🔍 Monitoring only (auto-buy disabled)'));
    }
    
    console.log(chalk.gray('Press Ctrl+C to stop monitoring\n'));
    
    // Initial check
    await this.checkForNewTweets();
    
    // Set up interval
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.checkForNewTweets();
      }
    }, this.config.checkInterval);
  }

  async checkForNewTweets() {
    try {
      const tweets = await this.fetchLatestTweets();
      
      if (tweets.length === 0) {
        console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] No tweets retrieved`));
        return;
      }
      
      let newTweetsFound = false;
      let cryptoTweetsFound = 0;
      
      // Process tweets in reverse order (oldest first)
      for (const tweet of tweets.reverse()) {
        if (!this.processedTweets.has(tweet.id)) {
          const result = await this.processTweet(tweet);
          if (result) {
            newTweetsFound = true;
            cryptoTweetsFound++;
            
            // Send webhook notification if configured
            if (this.config.webhookUrl) {
              await this.sendWebhookNotification(result);
            }
            
            // Add a small delay between processing tweets
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      if (newTweetsFound) {
        console.log(chalk.green(`[${new Date().toLocaleTimeString()}] Found ${cryptoTweetsFound} crypto-related tweet(s)!`));
      } else {
        console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] No new crypto-related tweets`));
      }
      
    } catch (error) {
      console.error(chalk.red(`[${new Date().toLocaleTimeString()}] Error checking tweets:`), error.message);
      
      // If we get authentication errors, try to re-initialize
      if (error.message.includes('401') || error.message.includes('forbidden')) {
        console.log(chalk.yellow('⚠️  Authentication error, attempting to re-login...'));
        await this.initialize();
      }
    }
  }

  async sendWebhookNotification(result) {
    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(result)
      });
      
      if (!response.ok) {
        console.error(chalk.red('❌ Failed to send webhook notification'));
      } else {
        console.log(chalk.green('📡 Webhook notification sent'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Webhook error:'), error.message);
    }
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log(chalk.yellow('\n🛑 Monitoring stopped'));
  }
}