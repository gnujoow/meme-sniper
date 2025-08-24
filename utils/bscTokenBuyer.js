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
import { mnemonicToAccount } from 'viem/accounts';
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

// Four.meme Exchange ABI (minimal)
const FOUR_MEME_ABI = [
  {
    inputs: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'minTokens', type: 'uint256' }
    ],
    name: 'buyToken',
    outputs: [{ name: 'tokensReceived', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenAddress', type: 'address' }],
    name: 'getTokenPrice',
    outputs: [{ name: 'price', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'tokenAddress', type: 'address' },
      { name: 'bnbAmount', type: 'uint256' }
    ],
    name: 'getBuyQuote',
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenAddress', type: 'address' }],
    name: 'isTokenLive',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  }
];

export class BSCTokenBuyer {
  constructor(mnemonic, derivationPath = "m/44'/60'/0'/0/0", rpcUrl = 'https://bsc-dataseed.binance.org/') {
    // Generate account from mnemonic
    this.account = mnemonicToAccount(mnemonic, {
      path: derivationPath
    });
    
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
    // Four.meme Exchange address
    this.FOUR_MEME_EXCHANGE = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
    
    console.log(chalk.gray(`🔑 BSC wallet: ${this.account.address}`));
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

  async checkFourMeme(tokenAddress) {
    try {
      console.log(chalk.blue('🔍 Checking Four.meme...'));
      
      // Check if token is live on Four.meme
      const isLive = await this.publicClient.readContract({
        address: this.FOUR_MEME_EXCHANGE,
        abi: FOUR_MEME_ABI,
        functionName: 'isTokenLive',
        args: [tokenAddress]
      });

      if (isLive) {
        // Get token price
        const price = await this.publicClient.readContract({
          address: this.FOUR_MEME_EXCHANGE,
          abi: FOUR_MEME_ABI,
          functionName: 'getTokenPrice',
          args: [tokenAddress]
        });

        // Get buy quote for 0.1 BNB
        const testAmount = parseEther('0.1');
        const tokensOut = await this.publicClient.readContract({
          address: this.FOUR_MEME_EXCHANGE,
          abi: FOUR_MEME_ABI,
          functionName: 'getBuyQuote',
          args: [tokenAddress, testAmount]
        });

        return {
          isAvailable: true,
          price: formatEther(price),
          testQuote: tokensOut.toString()
        };
      }

      return { isAvailable: false };
    } catch (error) {
      console.error(chalk.yellow('⚠️  Error checking Four.meme:'), error.message);
      return { isAvailable: false };
    }
  }

  async checkPancakeSwapLiquidity(tokenAddress) {
    try {
      console.log(chalk.blue('🔍 Checking PancakeSwap...'));
      
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
      console.error(chalk.yellow('⚠️  Error checking PancakeSwap:'), error.message);
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

  async buyOnFourMeme(tokenAddress, amountBNB) {
    try {
      console.log(chalk.blue(`🟦 Attempting to buy on Four.meme...`));
      console.log(chalk.gray(`   Token: ${tokenAddress}`));
      console.log(chalk.gray(`   Amount: ${amountBNB} BNB`));

      // Get token info
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      if (!tokenInfo.exists) {
        throw new Error('Token contract not found or invalid');
      }

      console.log(chalk.gray(`   Token: ${tokenInfo.symbol} (${tokenInfo.name})`));

      const amountIn = parseEther(amountBNB.toString());
      const minTokensOut = 0n; // Accept any amount (use slippage in production)

      // Encode buy function for Four.meme
      const data = encodeFunctionData({
        abi: FOUR_MEME_ABI,
        functionName: 'buyToken',
        args: [tokenAddress, minTokensOut]
      });

      // Estimate gas
      const gasEstimate = await this.publicClient.estimateGas({
        account: this.account.address,
        to: this.FOUR_MEME_EXCHANGE,
        data,
        value: amountIn
      });

      // Send transaction
      const hash = await this.walletClient.sendTransaction({
        to: this.FOUR_MEME_EXCHANGE,
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
        console.log(chalk.green(`✅ Purchase successful on Four.meme!`));
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
          platform: 'Four.meme',
          amount: amountBNB,
          tokenReceived: tokenBalance.toString()
        };
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      console.error(chalk.red('❌ Four.meme purchase failed:'), error.message);
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

      // Check Four.meme first (priority platform for meme tokens)
      const fourMemeCheck = await this.checkFourMeme(tokenAddress);
      if (fourMemeCheck.isAvailable) {
        console.log(chalk.green('✅ Token found on Four.meme!'));
        console.log(chalk.gray(`   Price: ${fourMemeCheck.price} BNB`));
        console.log(chalk.gray(`   Test Quote: ${fourMemeCheck.testQuote} tokens for 0.1 BNB`));
        
        return await this.buyOnFourMeme(tokenAddress, buyAmount);
      }

      // Fallback to PancakeSwap
      const liquidityCheck = await this.checkPancakeSwapLiquidity(tokenAddress);
      if (liquidityCheck.hasLiquidity) {
        console.log(chalk.green('✅ Liquidity found on PancakeSwap'));
        return await this.buyOnPancakeSwap(tokenAddress, buyAmount);
      }

      console.log(chalk.yellow('⚠️  Token not found on Four.meme or PancakeSwap'));
      return { success: false, error: 'Token not available on supported platforms' };
      
    } catch (error) {
      console.error(chalk.red('❌ Error buying token:'), error);
      return { success: false, error: error.message };
    }
  }

  // 모든 토큰을 BNB로 판매하는 기능
  async sellAllTokensToBNB() {
    try {
      console.log(chalk.bgRed.white('🔥 SELLING ALL TOKENS TO BNB 🔥'));
      
      // 지갑의 모든 ERC20 토큰 잔액 확인
      const sellResults = [];
      let totalBNBReceived = 0;

      // 사용자 지갑이 보유한 토큰들 (수동으로 토큰 주소를 추가해야 함)
      // 실제 구현에서는 BSC 스캔 API나 다른 방법으로 토큰 목록을 가져올 수 있습니다
      const knownTokens = this.getKnownTokens();

      for (const tokenAddress of knownTokens) {
        try {
          // 토큰 잔액 확인
          const balance = await this.publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [this.account.address]
          });

          // 잔액이 0이면 건너뛰기
          if (balance === 0n) continue;

          const tokenInfo = await this.getTokenInfo(tokenAddress);
          console.log(chalk.yellow(`🔄 Selling token: ${tokenInfo.name} (${tokenInfo.symbol})`));
          console.log(chalk.gray(`   Balance: ${balance.toString()} wei`));

          const sellResult = await this.sellSingleToken(tokenAddress, balance.toString());
          sellResults.push(sellResult);
          
          if (sellResult.success) {
            totalBNBReceived += sellResult.bnbReceived || 0;
            console.log(chalk.green(`✅ Sold for ${sellResult.bnbReceived?.toFixed(4)} BNB`));
          } else {
            console.log(chalk.red(`❌ Failed to sell: ${sellResult.error}`));
          }

          // 판매 간 딜레이
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(chalk.red(`❌ Error processing token ${tokenAddress}:`), error.message);
        }
      }

      console.log(chalk.bgGreen.black(`\n🎉 SELL COMPLETED! Total BNB received: ${totalBNBReceived.toFixed(4)} BNB`));
      
      return {
        success: true,
        totalBNBReceived,
        sellResults
      };

    } catch (error) {
      console.error(chalk.red('❌ Error selling all tokens:'), error.message);
      return { success: false, error: error.message };
    }
  }

  async sellSingleToken(tokenAddress, tokenAmount) {
    try {
      // Four.meme에서 먼저 판매 시도
      const fourMemeResult = await this.sellOnFourMeme(tokenAddress, tokenAmount);
      if (fourMemeResult.success) {
        return fourMemeResult;
      }

      // PancakeSwap에서 판매 시도
      const pancakeResult = await this.sellOnPancakeSwap(tokenAddress, tokenAmount);
      if (pancakeResult.success) {
        return pancakeResult;
      }

      return { success: false, error: 'No compatible DEX found for selling' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sellOnFourMeme(tokenAddress, tokenAmount) {
    try {
      console.log(chalk.blue('🟦 Attempting Four.meme sell...'));
      
      // Four.meme 판매 로직 
      const minBNBOut = 0n; // Accept any amount (use slippage in production)

      // Approve token spending first
      const approveTx = await this.walletClient.sendTransaction({
        to: tokenAddress,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [this.FOUR_MEME_EXCHANGE, BigInt(tokenAmount)]
        })
      });

      await this.publicClient.waitForTransactionReceipt({
        hash: approveTx,
        confirmations: 1
      });

      // Encode sell function for Four.meme
      const data = encodeFunctionData({
        abi: FOUR_MEME_ABI,
        functionName: 'sellToken',
        args: [tokenAddress, BigInt(tokenAmount), minBNBOut]
      });

      // Estimate gas
      const gasEstimate = await this.publicClient.estimateGas({
        account: this.account.address,
        to: this.FOUR_MEME_EXCHANGE,
        data
      });

      // Send transaction
      const hash = await this.walletClient.sendTransaction({
        to: this.FOUR_MEME_EXCHANGE,
        data,
        gas: gasEstimate * 120n / 100n // Add 20% buffer
      });

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2
      });

      if (receipt.status === 'success') {
        // Calculate BNB received from transaction logs (simplified)
        const bnbReceived = 0.001; // Mock value - in practice, parse logs
        
        return {
          success: true,
          hash,
          platform: 'Four.meme',
          bnbReceived
        };
      }

      return { success: false, error: 'Transaction failed' };
    } catch (error) {
      console.error(chalk.red('❌ Four.meme sell failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  async sellOnPancakeSwap(tokenAddress, tokenAmount) {
    try {
      console.log(chalk.blue('🥞 Attempting PancakeSwap sell...'));
      
      // Approve token spending first
      const approveTx = await this.walletClient.sendTransaction({
        to: tokenAddress,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [this.PANCAKE_ROUTER, BigInt(tokenAmount)]
        })
      });

      await this.publicClient.waitForTransactionReceipt({
        hash: approveTx,
        confirmations: 1
      });

      // Set up swap parameters
      const amountOutMin = 0n; // Accept any amount (use slippage in production)
      const path = [tokenAddress, this.WBNB];
      const to = this.account.address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

      // Encode swap function
      const data = encodeFunctionData({
        abi: PANCAKE_ROUTER_ABI,
        functionName: 'swapExactTokensForETH',
        args: [BigInt(tokenAmount), amountOutMin, path, to, deadline]
      });

      // Estimate gas
      const gasEstimate = await this.publicClient.estimateGas({
        account: this.account.address,
        to: this.PANCAKE_ROUTER,
        data
      });

      // Send transaction
      const hash = await this.walletClient.sendTransaction({
        to: this.PANCAKE_ROUTER,
        data,
        gas: gasEstimate * 120n / 100n // Add 20% buffer
      });

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2
      });

      if (receipt.status === 'success') {
        // Calculate BNB received from transaction logs (simplified)
        const bnbReceived = 0.001; // Mock value - in practice, parse logs
        
        return {
          success: true,
          hash,
          platform: 'PancakeSwap',
          bnbReceived
        };
      }

      return { success: false, error: 'Transaction failed' };
    } catch (error) {
      console.error(chalk.red('❌ PancakeSwap sell failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  // 알려진 토큰 목록 반환 (실제로는 동적으로 가져와야 함)
  getKnownTokens() {
    // 예시 토큰들 - 실제 구현에서는 BSC Scan API나 다른 방법으로 토큰 목록을 가져와야 합니다
    return [
      // 여기에 구매한 토큰 주소들이 동적으로 추가되어야 함
    ];
  }
}