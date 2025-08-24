import { Scraper } from 'agent-twitter-client';
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
      if (config.solanaPrivateKey) {
        this.solanaBuyer = new SolanaTokenBuyer(config.solanaPrivateKey, config.solanaRpcUrl);
        console.log(chalk.green('✅ Solana auto-buy enabled'));
      }
      if (config.bscPrivateKey) {
        this.bscBuyer = new BSCTokenBuyer(config.bscPrivateKey, config.bscRpcUrl);
        console.log(chalk.green('✅ BSC auto-buy enabled'));
      }
    }
  }

  async initialize() {
    try {
      console.log(chalk.blue('🔐 Logging into Twitter...'));
      
      // Try to login with cookies first if available
      if (this.config.cookies) {
        await this.scraper.setCookies(this.config.cookies);
      } else {
        // Login with username and password
        await this.scraper.login(
          this.config.username,
          this.config.password
        );
        
        // Save cookies for future use
        const cookies = await this.scraper.getCookies();
        console.log(chalk.green('✅ Login successful! Consider saving cookies for future sessions.'));
        console.log(chalk.gray('Cookies:', JSON.stringify(cookies)));
      }
      
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize Twitter client:'), error);
      return false;
    }
  }

  async fetchLatestTweets(username) {
    try {
      // Get user's latest tweets
      const tweets = [];
      const tweetsIterator = this.scraper.getTweets(username, 10);
      
      for await (const tweet of tweetsIterator) {
        tweets.push(tweet);
        if (tweets.length >= 10) break; // Limit to last 10 tweets
      }
      
      return tweets;
    } catch (error) {
      console.error(chalk.red('❌ Error fetching tweets:'), error);
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
        username: tweet.username,
        text: tweet.text,
        url: `https://twitter.com/${tweet.username}/status/${tweet.id}`,
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
        try {
          const buyResult = await this.solanaBuyer.buyToken(address);
          if (buyResult.success) {
            console.log(chalk.green('✅ Solana token purchase successful!'));
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
        try {
          const buyResult = await this.bscBuyer.buyToken(address);
          if (buyResult.success) {
            console.log(chalk.green('✅ BSC token purchase successful!'));
          }
        } catch (error) {
          console.error(chalk.red('❌ BSC auto-buy error:'), error.message);
        }
      }
    }
  }

  displayAlert(result) {
    console.log('\n' + chalk.bgYellow.black(' 🚨 CRYPTO CONTENT DETECTED! '));
    console.log(chalk.cyan('━'.repeat(50)));
    console.log(chalk.white('👤 User: ') + chalk.yellow(`@${result.username}`));
    console.log(chalk.white('🔗 URL: ') + chalk.blue(result.url));
    console.log(chalk.white('📝 Tweet: ') + chalk.gray(result.text));
    console.log(chalk.cyan('━'.repeat(50)));
    
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
    
    console.log(chalk.cyan('━'.repeat(50)) + '\n');
  }

  async startMonitoring() {
    if (this.isRunning) {
      console.log(chalk.yellow('⚠️  Monitor is already running'));
      return;
    }
    
    this.isRunning = true;
    console.log(chalk.green(`✅ Starting monitor for @${this.config.targetUsername}`));
    console.log(chalk.gray(`Check interval: ${this.config.checkInterval / 1000} seconds`));
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
      const tweets = await this.fetchLatestTweets(this.config.targetUsername);
      
      if (tweets.length === 0) {
        console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] No tweets found`));
        return;
      }
      
      let newTweetsFound = false;
      
      for (const tweet of tweets) {
        // Process only new tweets
        if (!this.processedTweets.has(tweet.id)) {
          const result = await this.processTweet(tweet);
          if (result) {
            newTweetsFound = true;
            
            // Send webhook notification if configured
            if (this.config.webhookUrl) {
              await this.sendWebhookNotification(result);
            }
          }
        }
      }
      
      if (!newTweetsFound) {
        console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] No new crypto-related tweets`));
      }
    } catch (error) {
      console.error(chalk.red(`[${new Date().toLocaleTimeString()}] Error checking tweets:`), error);
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
      }
    } catch (error) {
      console.error(chalk.red('❌ Webhook error:'), error);
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