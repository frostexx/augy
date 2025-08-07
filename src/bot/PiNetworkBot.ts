import * as stellarSDK from 'stellar-sdk';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Server as SocketServer } from 'socket.io';
import winston from 'winston';

export interface BotConfig {
  mnemonic: string;
  receiverAddress: string;
  unlockTime: Date;
  amountToWithdraw: number;
  useTestnet: boolean;
  maxRetries: number;
  retryDelay: number;
}

export interface BotStatus {
  isRunning: boolean;
  lastActivity: Date | null;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  currentBalance: number;
  nextUnlockTime: Date | null;
  errors: string[];
}

export class PiNetworkBot {
  private config: BotConfig | null = null;
  private status: BotStatus;
  private keypair: stellarSDK.Keypair | null = null;
  private server: stellarSDK.Server | null = null;
  private rateLimiter: RateLimiterMemory;
  private intervalId: NodeJS.Timeout | null = null;
  private logger: winston.Logger;
  private io: SocketServer;

  constructor(logger: winston.Logger, io: SocketServer) {
    this.logger = logger;
    this.io = io;
    
    this.status = {
      isRunning: false,
      lastActivity: null,
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      currentBalance: 0,
      nextUnlockTime: null,
      errors: []
    };

    // Rate limiter for API calls
    this.rateLimiter = new RateLimiterMemory({
      keyspace: 'stellar-api',
      points: 10, // 10 requests
      duration: 60, // per 60 seconds
    });
  }

  async initialize(config: BotConfig): Promise<void> {
    try {
      this.config = config;
      
      // Initialize Stellar keypair
      const seed = bip39.mnemonicToSeedSync(config.mnemonic);
      const derivationPath = "m/44'/314159'/0'";
      const { key } = derivePath(derivationPath, seed.toString('hex'));
      this.keypair = config.useTestnet
        ? stellarSDK.Keypair.fromSecret('SD5WQM4HA3MERWGFMRBTP5KXPGGC4A5WEQMF5WZZRUFPVTC6S7BFEYMK')
        : stellarSDK.Keypair.fromRawEd25519Seed(key);

      // Initialize Stellar server
      const horizonUrl = config.useTestnet 
        ? 'https://api.testnet.minepi.com'
        : 'https://api.mainnet.minepi.com';
      
      this.server = new stellarSDK.Server(horizonUrl);
      
      this.status.nextUnlockTime = config.unlockTime;
      
      this.logger.info('Bot initialized successfully', {
        publicKey: this.keypair.publicKey(),
        receiverAddress: config.receiverAddress,
        useTestnet: config.useTestnet
      });

      this.emitStatus();
    } catch (error) {
      this.logger.error('Failed to initialize bot:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.config || !this.keypair || !this.server) {
      throw new Error('Bot not initialized');
    }

    if (this.status.isRunning) {
      throw new Error('Bot is already running');
    }

    this.status.isRunning = true;
    this.logger.info('Bot started');

    // Start monitoring loop
    this.intervalId = setInterval(() => {
      this.monitorAndExecute();
    }, 5000); // Check every 5 seconds

    this.emitStatus();
  }

  async stop(): Promise<void> {
    this.status.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.logger.info('Bot stopped');
    this.emitStatus();
  }

  private async monitorAndExecute(): Promise<void> {
    if (!this.config || !this.keypair || !this.server) return;

    try {
      // Rate limiting
      await this.rateLimiter.consume('api-call');

      // Update balance
      await this.updateBalance();

      // Check if unlock time has passed
      const now = new Date();
      if (this.config.unlockTime <= now) {
        await this.executeClaimAndTransfer();
      }

      this.status.lastActivity = now;
      this.emitStatus();

    } catch (error: any) {
      this.logger.error('Error in monitoring loop:', error);
      this.addError(error.message || 'Unknown error in monitoring');
      
      if (error.remaining !== undefined) {
        // Rate limit error, wait before next attempt
        setTimeout(() => {}, error.msBeforeNext || 5000);
      }
    }
  }

  private async updateBalance(): Promise<void> {
    if (!this.keypair || !this.server) return;

    try {
      const account = await this.server.loadAccount(this.keypair.publicKey());
      const balanceStr = account.balances.find(b => b.asset_type === 'native')?.balance;
      this.status.currentBalance = balanceStr ? parseFloat(balanceStr) : 0;
    } catch (error) {
      this.logger.warn('Failed to update balance:', error);
    }
  }

  private async executeClaimAndTransfer(): Promise<void> {
    if (!this.config || !this.keypair || !this.server) return;

    try {
      this.logger.info('Executing claim and transfer');

      // First, check for claimable balances
      const claimableBalances = await this.server.claimableBalances()
        .claimant(this.keypair.publicKey())
        .limit(10)
        .order('asc')
        .call();

      if (claimableBalances.records.length > 0) {
        await this.claimBalances(claimableBalances.records);
      }

      // Then transfer available balance
      await this.transferBalance();

      this.status.successfulTransactions++;
      this.logger.info('Claim and transfer completed successfully');

    } catch (error: any) {
      this.status.failedTransactions++;
      this.logger.error('Failed to execute claim and transfer:', error);
      this.addError(`Transfer failed: ${error.message}`);
    }

    this.status.totalTransactions++;
  }

  private async claimBalances(records: any[]): Promise<void> {
    if (!this.config || !this.keypair || !this.server) return;

    const account = await this.server.loadAccount(this.keypair.publicKey());
    const txBuilder = new stellarSDK.TransactionBuilder(account, {
      fee: '10000000',
      networkPassphrase: this.config.useTestnet ? 'Pi Testnet' : 'Pi Network',
    });

    // Add claim operations
    for (const record of records) {
      txBuilder.addOperation(stellarSDK.Operation.claimClaimableBalance({
        balanceId: record.id,
      }));
    }

    const transaction = txBuilder.setTimeout(30).build();
    transaction.sign(this.keypair);

    await this.server.submitTransaction(transaction);
    this.logger.info(`Claimed ${records.length} balances`);
  }

  private async transferBalance(): Promise<void> {
    if (!this.config || !this.keypair || !this.server) return;

    const account = await this.server.loadAccount(this.keypair.publicKey());
    const balanceStr = account.balances.find(b => b.asset_type === 'native')?.balance;
    
    if (!balanceStr) return;

    const balance = parseFloat(balanceStr);
    const amountToSend = balance - 0.2; // Leave some for fees

    if (amountToSend <= 0) {
      this.logger.warn('Insufficient balance for transfer');
      return;
    }

    const transaction = new stellarSDK.TransactionBuilder(account, {
      fee: '10000000',
      networkPassphrase: this.config.useTestnet ? 'Pi Testnet' : 'Pi Network',
    })
    .addOperation(stellarSDK.Operation.payment({
      destination: this.config.receiverAddress,
      asset: stellarSDK.Asset.native(),
      amount: amountToSend.toFixed(7),
    }))
    .setTimeout(30)
    .build();

    transaction.sign(this.keypair);
    const result = await this.server.submitTransaction(transaction);
    
    this.logger.info(`Transferred ${amountToSend} PI`, { hash: result.hash });
  }

  private addError(error: string): void {
    this.status.errors.unshift(`${new Date().toISOString()}: ${error}`);
    if (this.status.errors.length > 10) {
      this.status.errors = this.status.errors.slice(0, 10);
    }
  }

  private emitStatus(): void {
    this.io.emit('bot-status', this.status);
  }

  getStatus(): BotStatus {
    return { ...this.status };
  }

  getConfig(): BotConfig | null {
    return this.config ? { ...this.config } : null;
  }
}