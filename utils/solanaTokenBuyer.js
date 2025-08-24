import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
  VersionedTransaction
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import chalk from 'chalk';

// Meteora SDK imports
import DLMM from '@meteora-ag/dlmm';
import AmmImpl from '@meteora-ag/dynamic-amm-sdk';

// Anchor for Meteora
import pkg from '@coral-xyz/anchor';
const { AnchorProvider, BN } = pkg;

export class SolanaTokenBuyer {
  constructor(mnemonic, derivationPath = "m/44'/501'/0'/0'", rpcUrl = 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Generate wallet from mnemonic
    const seed = mnemonicToSeedSync(mnemonic, "");
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
    this.wallet = Keypair.fromSeed(derivedSeed);
    this.publicKey = this.wallet.publicKey;
    
    console.log(chalk.gray(`🔑 Solana wallet: ${this.publicKey.toString()}`));
    
    // Native SOL token (for swaps)
    this.SOL_MINT = 'So11111111111111111111111111111111111111112';
    
    // Setup Anchor provider for Meteora
    this.provider = new AnchorProvider(
      this.connection,
      { publicKey: this.publicKey, signTransaction: async (tx) => { tx.partialSign(this.wallet); return tx; }, signAllTransactions: async (txs) => { txs.forEach(tx => tx.partialSign(this.wallet)); return txs; } },
      { commitment: 'confirmed' }
    );
  }

  async getBalance() {
    const balance = await this.connection.getBalance(this.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  async checkPumpFun(tokenAddress) {
    try {
      // Pump.fun API endpoint to check if token exists
      const response = await fetch(`https://frontend-api.pump.fun/coins/${tokenAddress}`);
      if (response.ok) {
        const data = await response.json();
        return {
          exists: true,
          data: {
            name: data.name,
            symbol: data.symbol,
            marketCap: data.market_cap,
            priceSOL: data.price_sol,
            liquidity: data.virtual_sol_reserves
          }
        };
      }
      return { exists: false };
    } catch (error) {
      console.error(chalk.yellow('⚠️  Error checking Pump.fun:'), error);
      return { exists: false };
    }
  }

  async checkRaydium(tokenAddress) {
    try {
      // Check Raydium pools
      const response = await fetch('https://api.raydium.io/v2/main/pairs');
      if (response.ok) {
        const data = await response.json();
        const pool = data.find(p => 
          p.baseMint === tokenAddress || p.quoteMint === tokenAddress
        );
        
        if (pool) {
          return {
            exists: true,
            data: {
              poolId: pool.ammId,
              liquidity: pool.liquidity,
              volume24h: pool.volume24h,
              price: pool.price
            }
          };
        }
      }
      return { exists: false };
    } catch (error) {
      console.error(chalk.yellow('⚠️  Error checking Raydium:'), error);
      return { exists: false };
    }
  }

  async buyOnPumpFun(tokenAddress, amountSOL) {
    try {
      console.log(chalk.blue(`🎯 Attempting to buy on Pump.fun...`));
      console.log(chalk.gray(`   Token: ${tokenAddress}`));
      console.log(chalk.gray(`   Amount: ${amountSOL} SOL`));

      // Pump.fun bonding curve program
      const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
      
      // Get token account
      const tokenMint = new PublicKey(tokenAddress);
      const associatedTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        this.publicKey
      );

      // Check if ATA exists, create if not
      const ataInfo = await this.connection.getAccountInfo(associatedTokenAccount);
      const transaction = new Transaction();
      
      if (!ataInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.publicKey,
            associatedTokenAccount,
            this.publicKey,
            tokenMint
          )
        );
      }

      // Create buy instruction for Pump.fun
      // Note: This is a simplified version - actual implementation would need
      // the specific Pump.fun swap instruction format
      const buyInstruction = {
        programId: PUMP_FUN_PROGRAM,
        keys: [
          { pubkey: this.publicKey, isSigner: true, isWritable: true },
          { pubkey: tokenMint, isSigner: false, isWritable: false },
          { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([
          0x01, // Buy instruction
          ...Buffer.from(new Uint8Array(new Float64Array([amountSOL * LAMPORTS_PER_SOL]).buffer))
        ])
      };

      transaction.add(buyInstruction);
      
      // Send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet]
      );

      console.log(chalk.green(`✅ Purchase successful on Pump.fun!`));
      console.log(chalk.gray(`   Signature: ${signature}`));
      
      return {
        success: true,
        signature,
        platform: 'Pump.fun',
        amount: amountSOL
      };
    } catch (error) {
      console.error(chalk.red('❌ Pump.fun purchase failed:'), error);
      return { success: false, error: error.message };
    }
  }

  async buyOnRaydium(tokenAddress, amountSOL) {
    try {
      console.log(chalk.blue(`🎯 Attempting to buy on Raydium...`));
      console.log(chalk.gray(`   Token: ${tokenAddress}`));
      console.log(chalk.gray(`   Amount: ${amountSOL} SOL`));

      // Raydium AMM program
      const RAYDIUM_AMM_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
      
      const tokenMint = new PublicKey(tokenAddress);
      const associatedTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        this.publicKey
      );

      // Check if ATA exists, create if not
      const ataInfo = await this.connection.getAccountInfo(associatedTokenAccount);
      const transaction = new Transaction();
      
      if (!ataInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.publicKey,
            associatedTokenAccount,
            this.publicKey,
            tokenMint
          )
        );
      }

      // Create swap instruction for Raydium
      // Note: This is a simplified version - actual implementation would need
      // the specific Raydium swap instruction format and pool accounts
      const swapInstruction = {
        programId: RAYDIUM_AMM_PROGRAM,
        keys: [
          { pubkey: this.publicKey, isSigner: true, isWritable: true },
          { pubkey: tokenMint, isSigner: false, isWritable: false },
          { pubkey: associatedTokenAccount, isSigner: false, isWritable: true },
          // Additional pool accounts would be needed here
        ],
        data: Buffer.from([
          0x09, // Swap instruction
          ...Buffer.from(new Uint8Array(new Float64Array([amountSOL * LAMPORTS_PER_SOL]).buffer))
        ])
      };

      transaction.add(swapInstruction);
      
      // Send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet]
      );

      console.log(chalk.green(`✅ Purchase successful on Raydium!`));
      console.log(chalk.gray(`   Signature: ${signature}`));
      
      return {
        success: true,
        signature,
        platform: 'Raydium',
        amount: amountSOL
      };
    } catch (error) {
      console.error(chalk.red('❌ Raydium purchase failed:'), error);
      return { success: false, error: error.message };
    }
  }

  async checkMeteora(tokenAddress) {
    try {
      console.log(chalk.blue('🌟 Checking Meteora DLMM pools...'));
      
      // Check DLMM pools
      const dlmmPools = await DLMM.getAllLbPairPositionsByUser(this.connection, this.publicKey);
      
      // Search for pools with the target token
      const tokenMint = new PublicKey(tokenAddress);
      const availablePools = [];
      
      // Get all DLMM pools (this is a simplified version, in practice you'd query specific pools)
      try {
        // Try to find pools with SOL/target token pair
        const poolAddress = await DLMM.findLbPair(
          this.connection,
          new PublicKey(this.SOL_MINT),
          tokenMint
        );
        
        if (poolAddress) {
          const dlmmPool = await DLMM.create(this.connection, poolAddress);
          return {
            exists: true,
            poolType: 'DLMM',
            data: {
              poolAddress: poolAddress.toString(),
              tokenX: dlmmPool.tokenX,
              tokenY: dlmmPool.tokenY
            }
          };
        }
      } catch (dlmmError) {
        console.log(chalk.gray('   No DLMM pools found'));
      }
      
      // Check Dynamic AMM pools
      console.log(chalk.blue('🌟 Checking Meteora Dynamic AMM pools...'));
      try {
        const ammPools = await AmmImpl.getPoolList(this.connection);
        const targetPool = ammPools.find(pool => 
          (pool.tokenAMint.equals(tokenMint) && pool.tokenBMint.equals(new PublicKey(this.SOL_MINT))) ||
          (pool.tokenBMint.equals(tokenMint) && pool.tokenAMint.equals(new PublicKey(this.SOL_MINT)))
        );
        
        if (targetPool) {
          return {
            exists: true,
            poolType: 'Dynamic AMM',
            data: {
              poolAddress: targetPool.address.toString(),
              tokenAMint: targetPool.tokenAMint,
              tokenBMint: targetPool.tokenBMint
            }
          };
        }
      } catch (ammError) {
        console.log(chalk.gray('   No Dynamic AMM pools found'));
      }
      
      return { exists: false };
    } catch (error) {
      console.error(chalk.yellow('⚠️  Error checking Meteora:'), error.message);
      return { exists: false };
    }
  }

  async buyOnMeteora(tokenAddress, amountSOL, poolInfo) {
    try {
      console.log(chalk.blue(`🌟 Attempting to buy via Meteora ${poolInfo.poolType}...`));
      console.log(chalk.gray(`   Token: ${tokenAddress}`));
      console.log(chalk.gray(`   Amount: ${amountSOL} SOL`));
      console.log(chalk.gray(`   Pool: ${poolInfo.data.poolAddress}`));

      const amountInLamports = amountSOL * LAMPORTS_PER_SOL;
      const tokenMint = new PublicKey(tokenAddress);
      
      if (poolInfo.poolType === 'DLMM') {
        // Use DLMM SDK for swap
        const poolAddress = new PublicKey(poolInfo.data.poolAddress);
        const dlmmPool = await DLMM.create(this.connection, poolAddress);
        
        // Get bin arrays for swap
        const swapYtoX = dlmmPool.tokenY.publicKey.equals(tokenMint); // If token is tokenY, swap Y to X
        const binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);
        
        // Get swap quote
        const swapQuote = await dlmmPool.swapQuote(
          new BN(amountInLamports),
          swapYtoX,
          new BN(1), // min out amount (1 lamport)
          binArrays
        );
        
        // Create swap transaction
        const swapTx = await dlmmPool.swap({
          inToken: swapYtoX ? dlmmPool.tokenY.publicKey : dlmmPool.tokenX.publicKey,
          binArraysPubkey: swapQuote.binArraysPubkey,
          inAmount: new BN(amountInLamports),
          lbPair: dlmmPool.pubkey,
          user: this.publicKey,
          minOutAmount: swapQuote.minOutAmount,
          outToken: swapYtoX ? dlmmPool.tokenX.publicKey : dlmmPool.tokenY.publicKey,
        });
        
        // Sign and send transaction
        swapTx.partialSign(this.wallet);
        const signature = await this.connection.sendTransaction(swapTx);
        await this.connection.confirmTransaction(signature, 'confirmed');
        
        console.log(chalk.green(`✅ Purchase successful via Meteora DLMM!`));
        console.log(chalk.gray(`   Signature: ${signature}`));
        
        return {
          success: true,
          signature,
          platform: 'Meteora DLMM',
          amount: amountSOL,
          quote: swapQuote
        };
        
      } else if (poolInfo.poolType === 'Dynamic AMM') {
        // Use Dynamic AMM SDK for swap
        const poolAddress = new PublicKey(poolInfo.data.poolAddress);
        const ammPool = await AmmImpl.create(this.connection, poolAddress);
        
        // Determine swap direction
        const isAtoB = ammPool.tokenAMint.equals(new PublicKey(this.SOL_MINT));
        
        // Get swap quote
        const swapQuote = await ammPool.getSwapQuote(
          new BN(amountInLamports),
          isAtoB
        );
        
        // Create swap transaction
        const swapTx = await ammPool.swap(
          this.publicKey,
          isAtoB,
          new BN(amountInLamports),
          swapQuote.minOutAmount
        );
        
        // Sign and send transaction
        swapTx.partialSign(this.wallet);
        const signature = await this.connection.sendTransaction(swapTx);
        await this.connection.confirmTransaction(signature, 'confirmed');
        
        console.log(chalk.green(`✅ Purchase successful via Meteora Dynamic AMM!`));
        console.log(chalk.gray(`   Signature: ${signature}`));
        
        return {
          success: true,
          signature,
          platform: 'Meteora Dynamic AMM',
          amount: amountSOL,
          quote: swapQuote
        };
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Meteora purchase failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  async buyToken(tokenAddress) {
    try {
      // Get current balance
      const balance = await this.getBalance();
      const buyAmount = Math.floor(balance); // Integer SOL amount
      
      if (buyAmount < 1) {
        console.log(chalk.yellow(`⚠️  Insufficient balance: ${balance} SOL (need at least 1 SOL)`));
        return { success: false, error: 'Insufficient balance' };
      }

      console.log(chalk.cyan(`💰 Wallet balance: ${balance.toFixed(4)} SOL`));
      console.log(chalk.cyan(`📊 Will buy with: ${buyAmount} SOL`));

      // Check Pump.fun first
      const pumpFunCheck = await this.checkPumpFun(tokenAddress);
      if (pumpFunCheck.exists) {
        console.log(chalk.green('✅ Token found on Pump.fun!'));
        console.log(chalk.gray(`   Name: ${pumpFunCheck.data.name}`));
        console.log(chalk.gray(`   Symbol: ${pumpFunCheck.data.symbol}`));
        console.log(chalk.gray(`   Price: ${pumpFunCheck.data.priceSOL} SOL`));
        
        return await this.buyOnPumpFun(tokenAddress, buyAmount);
      }

      // Check Meteora
      const meteoraCheck = await this.checkMeteora(tokenAddress);
      if (meteoraCheck.exists) {
        console.log(chalk.green(`✅ Token found on Meteora ${meteoraCheck.poolType}!`));
        console.log(chalk.gray(`   Pool: ${meteoraCheck.data.poolAddress}`));
        
        return await this.buyOnMeteora(tokenAddress, buyAmount, meteoraCheck);
      }

      // Check Raydium
      const raydiumCheck = await this.checkRaydium(tokenAddress);
      if (raydiumCheck.exists) {
        console.log(chalk.green('✅ Token found on Raydium!'));
        console.log(chalk.gray(`   Pool ID: ${raydiumCheck.data.poolId}`));
        console.log(chalk.gray(`   Liquidity: $${raydiumCheck.data.liquidity}`));
        
        return await this.buyOnRaydium(tokenAddress, buyAmount);
      }

      console.log(chalk.yellow('⚠️  Token not found on supported DEXs'));
      return { success: false, error: 'Token not found on supported DEXs' };
      
    } catch (error) {
      console.error(chalk.red('❌ Error buying token:'), error);
      return { success: false, error: error.message };
    }
  }

  // 모든 토큰을 SOL로 판매하는 기능
  async sellAllTokensToSOL() {
    try {
      console.log(chalk.bgRed.white('🔥 SELLING ALL TOKENS TO SOL 🔥'));
      
      // 지갑의 모든 토큰 계정 가져오기
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      const sellResults = [];
      let totalSOLReceived = 0;

      for (const accountInfo of tokenAccounts.value) {
        const tokenAmount = accountInfo.account.data.parsed.info.tokenAmount;
        const mint = accountInfo.account.data.parsed.info.mint;
        
        // SOL은 건너뛰기
        if (mint === this.SOL_MINT) continue;
        
        // 토큰 잔액이 0이면 건너뛰기
        if (parseFloat(tokenAmount.amount) === 0) continue;

        console.log(chalk.yellow(`🔄 Selling token: ${mint}`));
        console.log(chalk.gray(`   Balance: ${tokenAmount.uiAmountString} tokens`));

        const sellResult = await this.sellSingleToken(mint, tokenAmount.amount);
        sellResults.push(sellResult);
        
        if (sellResult.success) {
          totalSOLReceived += sellResult.solReceived || 0;
          console.log(chalk.green(`✅ Sold for ${sellResult.solReceived?.toFixed(4)} SOL`));
        } else {
          console.log(chalk.red(`❌ Failed to sell: ${sellResult.error}`));
        }

        // 판매 간 딜레이
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(chalk.bgGreen.black(`\n🎉 SELL COMPLETED! Total SOL received: ${totalSOLReceived.toFixed(4)} SOL`));
      
      return {
        success: true,
        totalSOLReceived,
        sellResults
      };

    } catch (error) {
      console.error(chalk.red('❌ Error selling all tokens:'), error.message);
      return { success: false, error: error.message };
    }
  }

  async sellSingleToken(tokenMint, tokenAmount) {
    try {
      const tokenMintPubkey = new PublicKey(tokenMint);
      
      // Meteora에서 먼저 판매 시도
      const meteoraResult = await this.sellOnMeteora(tokenMint, tokenAmount);
      if (meteoraResult.success) {
        return meteoraResult;
      }

      // Raydium에서 판매 시도
      const raydiumResult = await this.sellOnRaydium(tokenMint, tokenAmount);
      if (raydiumResult.success) {
        return raydiumResult;
      }

      // Pump.fun에서 판매 시도
      const pumpFunResult = await this.sellOnPumpFun(tokenMint, tokenAmount);
      if (pumpFunResult.success) {
        return pumpFunResult;
      }

      return { success: false, error: 'No compatible DEX found for selling' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sellOnMeteora(tokenMint, tokenAmount) {
    try {
      const tokenMintPubkey = new PublicKey(tokenMint);
      
      // DLMM 풀 확인
      try {
        const poolAddress = await DLMM.findLbPair(
          this.connection,
          tokenMintPubkey,
          new PublicKey(this.SOL_MINT)
        );
        
        if (poolAddress) {
          const dlmmPool = await DLMM.create(this.connection, poolAddress);
          
          // 토큰을 SOL로 스왑
          const swapYtoX = dlmmPool.tokenY.publicKey.equals(tokenMintPubkey);
          const swapQuote = await dlmmPool.swapQuote(
            new BN(tokenAmount),
            swapYtoX,
            new BN(0.01 * LAMPORTS_PER_SOL), // 최소 0.01 SOL
            new BN(Date.now() + 20000)
          );

          const swapTx = await dlmmPool.swap({
            inToken: swapYtoX ? dlmmPool.tokenY.publicKey : dlmmPool.tokenX.publicKey,
            binArraysPubkey: swapQuote.binArraysPubkey,
            inAmount: new BN(tokenAmount),
            lbPair: dlmmPool.pubkey,
            user: this.publicKey,
            minOutAmount: swapQuote.minOutAmount,
            outToken: swapYtoX ? dlmmPool.tokenX.publicKey : dlmmPool.tokenY.publicKey,
          });

          swapTx.partialSign(this.wallet);
          const signature = await this.connection.sendTransaction(swapTx);
          await this.connection.confirmTransaction(signature, 'confirmed');

          const solReceived = parseFloat(swapQuote.outAmount.toString()) / LAMPORTS_PER_SOL;
          
          return {
            success: true,
            signature,
            platform: 'Meteora DLMM',
            solReceived
          };
        }
      } catch (dlmmError) {
        // DLMM 실패시 Dynamic AMM 시도
      }

      // Dynamic AMM 시도
      const ammPools = await AmmImpl.getPoolList(this.connection);
      const targetPool = ammPools.find(pool => 
        (pool.tokenAMint.equals(tokenMintPubkey) && pool.tokenBMint.equals(new PublicKey(this.SOL_MINT))) ||
        (pool.tokenBMint.equals(tokenMintPubkey) && pool.tokenAMint.equals(new PublicKey(this.SOL_MINT)))
      );
      
      if (targetPool) {
        const ammPool = await AmmImpl.create(this.connection, targetPool.address);
        const isAtoB = ammPool.tokenAMint.equals(tokenMintPubkey);
        
        const swapQuote = await ammPool.getSwapQuote(
          new BN(tokenAmount),
          isAtoB
        );
        
        const swapTx = await ammPool.swap(
          this.publicKey,
          isAtoB,
          new BN(tokenAmount),
          swapQuote.minOutAmount
        );
        
        swapTx.partialSign(this.wallet);
        const signature = await this.connection.sendTransaction(swapTx);
        await this.connection.confirmTransaction(signature, 'confirmed');
        
        const solReceived = parseFloat(swapQuote.outAmount.toString()) / LAMPORTS_PER_SOL;
        
        return {
          success: true,
          signature,
          platform: 'Meteora Dynamic AMM',
          solReceived
        };
      }

      return { success: false, error: 'No Meteora pools found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sellOnRaydium(tokenMint, tokenAmount) {
    try {
      // Raydium 판매 로직 (간소화된 버전)
      console.log(chalk.gray('   Attempting Raydium sell...'));
      return { success: false, error: 'Raydium sell not implemented yet' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sellOnPumpFun(tokenMint, tokenAmount) {
    try {
      // Pump.fun 판매 로직 (간소화된 버전)
      console.log(chalk.gray('   Attempting Pump.fun sell...'));
      return { success: false, error: 'Pump.fun sell not implemented yet' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}