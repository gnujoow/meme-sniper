import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  parseEther,
  formatEther,
  encodeFunctionData,
  decodeFunctionResult
} from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import chalk from 'chalk';

// PancakeSwap Router V2 ABI (minimal)
const PANCAKE_ROUTER_ABI = [
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    name: 'swapExactETHForTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'path', type: 'address[]' }
    ],
    name: 'getAmountsIn',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  }
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

export class BSCTokenBuyer {
  constructor(privateKey, rpcUrl = 'https://bsc-dataseed.binance.org/') {
    this.account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}`);
    
    this.publicClient = createPublicClient({
      chain: bsc,
      transport: http(rpcUrl)
    });
    
    this.walletClient = createWalletClient({
      account: this.account,
      chain: bsc,
      transport: http(rpcUrl)
    });

    // PancakeSwap Router V2 address
    this.PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
    // WBNB address
    this.WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  }

  async getBalance() {
    const balance = await this.publicClient.getBalance({
      address: this.account.address
    });
    return parseFloat(formatEther(balance));
  }

  async getTokenInfo(tokenAddress) {
    try {
      const [name, symbol, decimals] = await Promise.all([
        this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'name'
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'symbol'
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'decimals'
        })
      ]);

      return { name, symbol, decimals, exists: true };
    } catch (error) {
      return { exists: false };
    }
  }

  async checkPancakeSwapLiquidity(tokenAddress) {
    try {
      // Try to get quote for 0.1 BNB
      const testAmount = parseEther('0.1');
      const path = [this.WBNB, tokenAddress];
      
      const amounts = await this.publicClient.readContract({
        address: this.PANCAKE_ROUTER,
        abi: PANCAKE_ROUTER_ABI,
        functionName: 'getAmountsIn',
        args: [testAmount, path]
      });

      if (amounts && amounts.length > 0) {
        return {
          hasLiquidity: true,
          testQuote: formatEther(amounts[1])
        };
      }
      
      return { hasLiquidity: false };
    } catch (error) {
      console.error(chalk.yellow('⚠️  Error checking liquidity:'), error.message);
      return { hasLiquidity: false };
    }
  }

  async buyOnPancakeSwap(tokenAddress, amountBNB) {
    try {
      console.log(chalk.blue(`🥞 Attempting to buy on PancakeSwap...`));
      console.log(chalk.gray(`   Token: ${tokenAddress}`));
      console.log(chalk.gray(`   Amount: ${amountBNB} BNB`));

      // Get token info
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      if (!tokenInfo.exists) {
        throw new Error('Token contract not found or invalid');
      }

      console.log(chalk.gray(`   Token: ${tokenInfo.symbol} (${tokenInfo.name})`));

      // Set up swap parameters
      const amountIn = parseEther(amountBNB.toString());
      const amountOutMin = 0n; // Accept any amount (use slippage in production)
      const path = [this.WBNB, tokenAddress];
      const to = this.account.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

      // Encode swap function
      const data = encodeFunctionData({
        abi: PANCAKE_ROUTER_ABI,
        functionName: 'swapExactETHForTokens',
        args: [amountOutMin, path, to, deadline]
      });

      // Estimate gas
      const gasEstimate = await this.publicClient.estimateGas({
        account: this.account.address,
        to: this.PANCAKE_ROUTER,
        data,
        value: amountIn
      });

      // Send transaction
      const hash = await this.walletClient.sendTransaction({
        to: this.PANCAKE_ROUTER,
        data,
        value: amountIn,
        gas: gasEstimate * 120n / 100n // Add 20% buffer
      });

      console.log(chalk.yellow(`⏳ Transaction sent: ${hash}`));
      
      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2
      });

      if (receipt.status === 'success') {
        console.log(chalk.green(`✅ Purchase successful on PancakeSwap!`));
        console.log(chalk.gray(`   Transaction: ${hash}`));
        
        // Get token balance
        const tokenBalance = await this.publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [this.account.address]
        });

        console.log(chalk.gray(`   Tokens received: ${tokenBalance}`));
        
        return {
          success: true,
          hash,
          platform: 'PancakeSwap',
          amount: amountBNB,
          tokenReceived: tokenBalance.toString()
        };
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      console.error(chalk.red('❌ PancakeSwap purchase failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  async buyToken(tokenAddress) {
    try {
      // Validate address format
      if (!tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.log(chalk.red('❌ Invalid BSC token address format'));
        return { success: false, error: 'Invalid address format' };
      }

      // Get current balance
      const balance = await this.getBalance();
      const buyAmount = Math.floor(balance); // Integer BNB amount
      
      if (buyAmount < 1) {
        console.log(chalk.yellow(`⚠️  Insufficient balance: ${balance} BNB (need at least 1 BNB)`));
        return { success: false, error: 'Insufficient balance' };
      }

      console.log(chalk.cyan(`💰 Wallet balance: ${balance.toFixed(4)} BNB`));
      console.log(chalk.cyan(`📊 Will buy with: ${buyAmount} BNB`));

      // Check token contract
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      if (!tokenInfo.exists) {
        console.log(chalk.yellow('⚠️  Token contract not found or invalid'));
        return { success: false, error: 'Invalid token contract' };
      }

      console.log(chalk.green('✅ Token found!'));
      console.log(chalk.gray(`   Name: ${tokenInfo.name}`));
      console.log(chalk.gray(`   Symbol: ${tokenInfo.symbol}`));
      console.log(chalk.gray(`   Decimals: ${tokenInfo.decimals}`));

      // Check liquidity on PancakeSwap
      const liquidityCheck = await this.checkPancakeSwapLiquidity(tokenAddress);
      if (!liquidityCheck.hasLiquidity) {
        console.log(chalk.yellow('⚠️  No liquidity found on PancakeSwap'));
        return { success: false, error: 'No liquidity on PancakeSwap' };
      }

      console.log(chalk.green('✅ Liquidity found on PancakeSwap'));
      
      // Execute buy
      return await this.buyOnPancakeSwap(tokenAddress, buyAmount);
      
    } catch (error) {
      console.error(chalk.red('❌ Error buying token:'), error);
      return { success: false, error: error.message };
    }
  }
}