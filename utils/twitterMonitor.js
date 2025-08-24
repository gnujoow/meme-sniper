import { Scraper } from '@the-convocation/twitter-scraper';
import chalk from 'chalk';
import open from 'open';
import { AddressDetector } from './addressDetector.js';
import { SolanaTokenBuyer } from './solanaTokenBuyer.js';
import { BSCTokenBuyer } from './bscTokenBuyer.js';
import { ProfitTracker } from './profitTracker.js';

export class TwitterMonitor {
  constructor(config) {
    this.config = config;
    this.scraper = new Scraper();
    this.detector = new AddressDetector();
    this.lastTweetId = null;
    this.isRunning = false;
    this.processedTweets = new Set();
    
    // Initialize profit tracker
    this.profitTracker = new ProfitTracker();
    
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
      const tweetIterator = this.scraper.getTweets(this.config.targetUsername, 5);
      
      for await (const tweet of tweetIterator) {
        tweets.push(tweet);
        if (tweets.length >= 5) break; // Limit to 5 tweets
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
            
            // Add to profit tracker
            this.profitTracker.addPurchase({
              chain: 'solana',
              tokenAddress: address,
              platform: buyResult.platform,
              amount: buyResult.amount,
              signature: buyResult.signature,
              tokensReceived: buyResult.quote?.outAmount || buyResult.tokenReceived
            });
            
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
            
            // Add to profit tracker
            this.profitTracker.addPurchase({
              chain: 'bsc',
              tokenAddress: address,
              platform: buyResult.platform,
              amount: buyResult.amount,
              hash: buyResult.hash,
              tokensReceived: buyResult.tokenReceived
            });
            
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
      
      // Auto-open URLs in browser if enabled
      if (this.config.autoOpenUrls) {
        this.openUrlsInBrowser(result.analysis.urls);
      }
    }
    
    console.log(chalk.cyan('━'.repeat(60)) + '\n');
  }

  async openUrlsInBrowser(urls) {
    console.log(chalk.magenta('🌐 Opening URLs in browser...'));
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        console.log(chalk.gray(`   Opening: ${url}`));
        await open(url);
        
        // Add delay between opening multiple URLs to avoid overwhelming the browser
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(chalk.red(`   ❌ Failed to open URL: ${url}`), error.message);
      }
    }
    console.log(chalk.green(`✅ Opened ${urls.length} URL(s) in browser\n`));
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
    
    if (this.config.autoOpenUrls) {
      console.log(chalk.cyan('🌐 Auto-open URLs is ENABLED'));
    } else {
      console.log(chalk.gray('🌐 URLs will be displayed only (auto-open disabled)'));
    }
    
    // 판매 기능 안내
    console.log(chalk.bgYellow.black('💡 SELL CONTROLS:'));
    console.log(chalk.yellow('   Press "s" + Enter to sell ALL Solana tokens to SOL'));
    console.log(chalk.yellow('   Press "b" + Enter to sell ALL BSC tokens to BNB'));
    console.log(chalk.gray('   Press Ctrl+C to stop monitoring\n'));
    
    // 키보드 입력 리스너 설정
    this.setupKeyboardListener();
    
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

  setupKeyboardListener() {
    // stdin을 raw 모드로 설정하여 키 입력을 즉시 받을 수 있도록 함
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (key) => {
      // Ctrl+C 처리
      if (key === '\u0003') {
        this.stopMonitoring();
        process.exit();
      }
      
      // 's' 키: Solana 토큰 판매
      if (key.toLowerCase() === 's') {
        console.log(chalk.bgRed.white('\n🔥 Solana 토큰 판매 시작...'));
        if (this.solanaBuyer) {
          await this.sellAllSolanaTokens();
        } else {
          console.log(chalk.red('❌ Solana buyer가 초기화되지 않았습니다.'));
        }
      }
      
      // 'b' 키: BSC 토큰 판매
      if (key.toLowerCase() === 'b') {
        console.log(chalk.bgRed.white('\n🔥 BSC 토큰 판매 시작...'));
        if (this.bscBuyer) {
          await this.sellAllBSCTokens();
        } else {
          console.log(chalk.red('❌ BSC buyer가 초기화되지 않았습니다.'));
        }
      }
    });
  }

  async sellAllSolanaTokens() {
    try {
      const result = await this.solanaBuyer.sellAllTokensToSOL();
      if (result.success) {
        console.log(chalk.green(`\n✅ Solana 판매 완료! 받은 SOL: ${result.totalSOLReceived.toFixed(4)}`));
        
        // Profit tracker 업데이트
        this.profitTracker.purchasedTokens = this.profitTracker.purchasedTokens.filter(
          token => token.chain !== 'solana'
        );
      } else {
        console.log(chalk.red(`\n❌ Solana 판매 실패: ${result.error}`));
      }
    } catch (error) {
      console.error(chalk.red('\n❌ Solana 판매 오류:'), error.message);
    }
  }

  async sellAllBSCTokens() {
    try {
      const result = await this.bscBuyer.sellAllTokensToBNB();
      if (result.success) {
        console.log(chalk.green(`\n✅ BSC 판매 완료! 받은 BNB: ${result.totalBNBReceived.toFixed(4)}`));
        
        // Profit tracker 업데이트
        this.profitTracker.purchasedTokens = this.profitTracker.purchasedTokens.filter(
          token => token.chain !== 'bsc'
        );
      } else {
        console.log(chalk.red(`\n❌ BSC 판매 실패: ${result.error}`));
      }
    } catch (error) {
      console.error(chalk.red('\n❌ BSC 판매 오류:'), error.message);
    }
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    
    // Stop profit tracking
    this.profitTracker.stopTracking();
    
    console.log(chalk.yellow('\n🛑 Monitoring stopped'));
  }
}