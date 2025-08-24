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

export class SolanaTokenBuyer {
  constructor(mnemonic, derivationPath = "m/44'/501'/0'/0'", rpcUrl = 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Generate wallet from mnemonic
    const seed = mnemonicToSeedSync(mnemonic, "");
    const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
    this.wallet = Keypair.fromSeed(derivedSeed);
    this.publicKey = this.wallet.publicKey;
    
    console.log(chalk.gray(`🔑 Solana wallet: ${this.publicKey.toString()}`));
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

      // Check Raydium
      const raydiumCheck = await this.checkRaydium(tokenAddress);
      if (raydiumCheck.exists) {
        console.log(chalk.green('✅ Token found on Raydium!'));
        console.log(chalk.gray(`   Pool ID: ${raydiumCheck.data.poolId}`));
        console.log(chalk.gray(`   Liquidity: $${raydiumCheck.data.liquidity}`));
        
        return await this.buyOnRaydium(tokenAddress, buyAmount);
      }

      console.log(chalk.yellow('⚠️  Token not found on Pump.fun or Raydium'));
      return { success: false, error: 'Token not found on supported DEXs' };
      
    } catch (error) {
      console.error(chalk.red('❌ Error buying token:'), error);
      return { success: false, error: error.message };
    }
  }
}