import { Connection, PublicKey } from '@solana/web3.js';
import { createWalletClient, createPublicClient, http, formatEther } from 'viem';
import { bsc } from 'viem/chains';
import chalk from 'chalk';

export class ProfitTracker {
  constructor() {
    // Store purchased tokens and their purchase info
    this.purchasedTokens = [];
    this.isTracking = false;
    this.trackingInterval = null;
    
    // Solana connection
    this.solanaConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // BSC connection
    this.bscPublicClient = createPublicClient({
      chain: bsc,
      transport: http('https://bsc-dataseed.binance.org/')
    });
    
    // Jupiter API for price data
    this.JUPITER_API_URL = 'https://quote-api.jup.ag/v6';
    this.SOL_MINT = 'So11111111111111111111111111111111111111112';
    this.WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  }

  addPurchase(tokenInfo) {
    const purchase = {
      id: Date.now(),
      ...tokenInfo,
      purchaseTime: new Date(),
      currentValue: 0,
      profitLoss: 0,
      profitPercentage: 0
    };
    
    this.purchasedTokens.push(purchase);
    console.log(chalk.green(`📊 Added ${purchase.chain} token to tracking: ${purchase.tokenAddress}`));
    
    // Start tracking if not already started
    if (!this.isTracking) {
      this.startTracking();
    }
    
    return purchase;
  }

  async getSolanaTokenPrice(tokenAddress, baseAmount = 100000000) { // 0.1 SOL in lamports
    try {
      const response = await fetch(
        `${this.JUPITER_API_URL}/quote?inputMint=${this.SOL_MINT}&outputMint=${tokenAddress}&amount=${baseAmount}&slippageBps=50`
      );
      
      if (response.ok) {
        const quote = await response.json();
        // Price = input amount / output amount (in SOL per token)
        const priceInSOL = (baseAmount / parseFloat(quote.outAmount)) * (baseAmount / 100000000);
        return priceInSOL;
      }
    } catch (error) {
      console.error(chalk.red(`Error getting Solana price for ${tokenAddress}:`), error.message);
    }
    return null;
  }

  async getBSCTokenPrice(tokenAddress) {
    try {
      // Use PancakeSwap factory to get pair info
      // This is a simplified implementation - in production you'd want to use proper DEX APIs
      const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350C73';
      
      // For now, return a mock price since we don't have the full PancakeSwap integration
      // In a real implementation, you'd query the pair reserves and calculate the price
      return 0.001; // Mock price in BNB
    } catch (error) {
      console.error(chalk.red(`Error getting BSC price for ${tokenAddress}:`), error.message);
    }
    return null;
  }

  async updateProfitLoss() {
    if (this.purchasedTokens.length === 0) return;

    for (const purchase of this.purchasedTokens) {
      let currentPrice = null;
      
      if (purchase.chain === 'solana') {
        currentPrice = await this.getSolanaTokenPrice(purchase.tokenAddress);
      } else if (purchase.chain === 'bsc') {
        currentPrice = await this.getBSCTokenPrice(purchase.tokenAddress);
      }
      
      if (currentPrice) {
        // Calculate current value based on tokens received and current price
        const tokensReceived = parseFloat(purchase.tokensReceived || 0);
        purchase.currentValue = tokensReceived * currentPrice;
        
        // Calculate profit/loss
        purchase.profitLoss = purchase.currentValue - purchase.amount;
        purchase.profitPercentage = ((purchase.currentValue - purchase.amount) / purchase.amount) * 100;
      }
    }
  }

  displayProfitSummary() {
    if (this.purchasedTokens.length === 0) {
      console.log(chalk.gray('📊 No tokens being tracked'));
      return;
    }

    // Clear console and show header
    console.clear();
    console.log(chalk.bgCyan.black('  📊 PROFIT TRACKER - REAL TIME  '));
    console.log(chalk.cyan('━'.repeat(80)));
    console.log(chalk.white(`Last Update: ${new Date().toLocaleTimeString()}`));
    console.log();

    let totalInvested = 0;
    let totalCurrentValue = 0;

    this.purchasedTokens.forEach((purchase, index) => {
      totalInvested += purchase.amount;
      totalCurrentValue += purchase.currentValue;

      const profitColor = purchase.profitLoss >= 0 ? chalk.green : chalk.red;
      const profitSymbol = purchase.profitLoss >= 0 ? '📈' : '📉';
      
      console.log(chalk.yellow(`${index + 1}. ${purchase.platform} (${purchase.chain.toUpperCase()})`));
      console.log(chalk.gray(`   Address: ${purchase.tokenAddress}`));
      console.log(chalk.gray(`   Purchase: ${purchase.amount.toFixed(4)} ${purchase.chain === 'solana' ? 'SOL' : 'BNB'}`));
      console.log(chalk.gray(`   Time: ${purchase.purchaseTime.toLocaleString()}`));
      console.log(chalk.white(`   Current: ${purchase.currentValue.toFixed(4)} ${purchase.chain === 'solana' ? 'SOL' : 'BNB'}`));
      console.log(profitColor(`   ${profitSymbol} P&L: ${purchase.profitLoss.toFixed(4)} (${purchase.profitPercentage.toFixed(2)}%)`));
      console.log();
    });

    // Total summary
    const totalProfitLoss = totalCurrentValue - totalInvested;
    const totalProfitPercentage = ((totalCurrentValue - totalInvested) / totalInvested) * 100;
    const totalProfitColor = totalProfitLoss >= 0 ? chalk.green : chalk.red;
    const totalProfitSymbol = totalProfitLoss >= 0 ? '📈' : '📉';

    console.log(chalk.cyan('━'.repeat(80)));
    console.log(chalk.white.bold('TOTAL PORTFOLIO:'));
    console.log(chalk.white(`Invested: ${totalInvested.toFixed(4)} (SOL + BNB)`));
    console.log(chalk.white(`Current:  ${totalCurrentValue.toFixed(4)} (SOL + BNB)`));
    console.log(totalProfitColor.bold(`${totalProfitSymbol} Total P&L: ${totalProfitLoss.toFixed(4)} (${totalProfitPercentage.toFixed(2)}%)`));
    console.log(chalk.cyan('━'.repeat(80)));
    console.log(chalk.gray('Press Ctrl+C to stop tracking'));
    console.log();
  }

  startTracking() {
    if (this.isTracking) return;
    
    this.isTracking = true;
    console.log(chalk.green('🚀 Started real-time profit tracking'));
    
    // Update every second
    this.trackingInterval = setInterval(async () => {
      await this.updateProfitLoss();
      this.displayProfitSummary();
    }, 1000);
  }

  stopTracking() {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
    this.isTracking = false;
    console.log(chalk.yellow('📊 Stopped profit tracking'));
  }

  // Get summary for webhook notifications
  getPortfolioSummary() {
    if (this.purchasedTokens.length === 0) return null;

    const totalInvested = this.purchasedTokens.reduce((sum, p) => sum + p.amount, 0);
    const totalCurrentValue = this.purchasedTokens.reduce((sum, p) => sum + p.currentValue, 0);
    const totalProfitLoss = totalCurrentValue - totalInvested;
    const totalProfitPercentage = ((totalCurrentValue - totalInvested) / totalInvested) * 100;

    return {
      totalTokens: this.purchasedTokens.length,
      totalInvested,
      totalCurrentValue,
      totalProfitLoss,
      totalProfitPercentage,
      lastUpdate: new Date().toISOString()
    };
  }
}