import { serve } from 'bun';
import * as stellar from 'stellar-sdk';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import 'dotenv/config';

// Configuration
const PORT = process.env.PORT || 3000;
const ONTESTNET = process.env.ONTESTNET === 'true' || false;
const HORIZON_MAIN = 'https://api.mainnet.minepi.com';
const HORIZON_TEST = 'https://api.testnet.minepi.com';

// Bot state management
interface BotState {
  isRunning: boolean;
  lastCheck: Date | null;
  balance: string;
  transactions: any[];
  errors: string[];
  config: BotConfig;
}

interface BotConfig {
  mnemonic: string;
  receiverMain: string;
  receiverTest: string;
  unlockTime: string;
  amountToWithdraw: number;
  maxRetries: number;
  checkInterval: number;
  useTestnet: boolean;
}

// Global state
let botState: BotState = {
  isRunning: false,
  lastCheck: null,
  balance: '0',
  transactions: [],
  errors: [],
  config: {
    mnemonic: process.env.MNEMONIC || '',
    receiverMain: process.env.RECEIVER_ADDRESS_MAIN || '',
    receiverTest: process.env.RECEIVER_ADDRESS || '',
    unlockTime: '',
    amountToWithdraw: 0,
    maxRetries: 10,
    checkInterval: 1000,
    useTestnet: ONTESTNET
  }
};

// Bot instance
let botInterval: Timer | null = null;
let server: stellar.Server;
let keypair: stellar.Keypair | null = null;

// Initialize Stellar connection
function initializeStellar(config: BotConfig) {
  try {
    server = new stellar.Server(config.useTestnet ? HORIZON_TEST : HORIZON_MAIN);
    
    if (config.mnemonic) {
      const seed = bip39.mnemonicToSeedSync(config.mnemonic);
      const derivationPath = "m/44'/314159'/0'";
      const { key } = derivePath(derivationPath, seed.toString('hex'));
      keypair = config.useTestnet
        ? stellar.Keypair.fromSecret('SD5WQM4HA3MERWGFMRBTP5KXPGGC4A5WEQMF5WZZRUFPVTC6S7BFEYMK')
        : stellar.Keypair.fromRawEd25519Seed(key);
      
      return { success: true, publicKey: keypair.publicKey() };
    }
    return { success: false, error: 'No mnemonic provided' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Rate-limited balance checker
async function checkBalance() {
  if (!keypair) return null;
  
  try {
    const account = await server.loadAccount(keypair.publicKey());
    const nativeBalance = account.balances.find(b => b.asset_type === 'native');
    return nativeBalance?.balance || '0';
  } catch (error: any) {
    console.error('Balance check error:', error.message);
    return null;
  }
}

// Transaction sender with rate limiting
async function sendTransaction(amount: number) {
  if (!keypair) return { success: false, error: 'Keypair not initialized' };
  
  try {
    const account = await server.loadAccount(keypair.publicKey());
    const receiver = botState.config.useTestnet 
      ? botState.config.receiverTest 
      : botState.config.receiverMain;
    
    const transaction = new stellar.TransactionBuilder(account, {
      fee: (10000000).toString(),
      networkPassphrase: botState.config.useTestnet ? 'Pi Testnet' : 'Pi Network',
    })
    .addOperation(stellar.Operation.payment({
      destination: receiver,
      asset: stellar.Asset.native(),
      amount: amount.toFixed(7),
    }))
    .setTimeout(30)
    .build();
    
    transaction.sign(keypair);
    const result = await server.submitTransaction(transaction);
    
    return { success: true, hash: result.hash };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Bot monitoring loop
async function botLoop() {
  if (!botState.isRunning) return;
  
  try {
    botState.lastCheck = new Date();
    const balance = await checkBalance();
    
    if (balance) {
      botState.balance = balance;
      
      // Check if balance changed
      const currentBalance = parseFloat(balance);
      const unlockTime = new Date(botState.config.unlockTime);
      
      if (new Date() >= unlockTime && currentBalance > 0) {
        // Try to send transaction
        const amountToSend = Math.min(
          currentBalance - 0.2,
          botState.config.amountToWithdraw
        );
        
        if (amountToSend > 0) {
          const result = await sendTransaction(amountToSend);
          
          if (result.success) {
            botState.transactions.push({
              time: new Date(),
              hash: result.hash,
              amount: amountToSend
            });
          } else {
            botState.errors.push(`TX Error: ${result.error}`);
          }
        }
      }
    }
  } catch (error: any) {
    botState.errors.push(`Loop error: ${error.message}`);
  }
}

// Start bot
function startBot(config: Partial<BotConfig>) {
  if (botState.isRunning) return { success: false, error: 'Bot already running' };
  
  // Update config
  botState.config = { ...botState.config, ...config };
  
  // Initialize Stellar
  const initResult = initializeStellar(botState.config);
  if (!initResult.success) {
    return { success: false, error: initResult.error };
  }
  
  // Start monitoring loop
  botState.isRunning = true;
  botState.errors = [];
  botState.transactions = [];
  
  botInterval = setInterval(botLoop, botState.config.checkInterval);
  
  return { success: true, publicKey: initResult.publicKey };
}

// Stop bot
function stopBot() {
  if (botInterval) {
    clearInterval(botInterval);
    botInterval = null;
  }
  botState.isRunning = false;
  return { success: true };
}

// HTML Frontend
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pi Network Bot Control Panel</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 900px;
            width: 100%;
            padding: 40px;
        }
        
        h1 {
            color: #333;
            margin-bottom: 30px;
            text-align: center;
            font-size: 2.5em;
        }
        
        .status-bar {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }
        
        .status-item {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        
        .status-indicator.running {
            background: #10b981;
        }
        
        .status-indicator.stopped {
            background: #ef4444;
            animation: none;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .form-section {
            margin-bottom: 30px;
        }
        
        .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .form-group {
            display: flex;
            flex-direction: column;
        }
        
        label {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 8px;
            font-weight: 500;
        }
        
        input, select, textarea {
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 1em;
            transition: all 0.3s;
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        textarea {
            resize: vertical;
            min-height: 100px;
            font-family: monospace;
        }
        
        .button-group {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
        }
        
        button {
            padding: 12px 30px;
            border: none;
            border-radius: 8px;
            font-size: 1em;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        
        .btn-secondary {
            background: #ef4444;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #dc2626;
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(239, 68, 68, 0.3);
        }
        
        .info-section {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-top: 30px;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        
        .info-card {
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .info-label {
            color: #666;
            font-size: 0.85em;
            margin-bottom: 5px;
        }
        
        .info-value {
            color: #333;
            font-size: 1.2em;
            font-weight: 600;
        }
        
        .log-section {
            margin-top: 30px;
        }
        
        .log-container {
            background: #1a1a1a;
            color: #0f0;
            padding: 20px;
            border-radius: 8px;
            height: 200px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 0.9em;
        }
        
        .log-entry {
            margin-bottom: 5px;
            opacity: 0;
            animation: fadeIn 0.3s forwards;
        }
        
        @keyframes fadeIn {
            to { opacity: 1; }
        }
        
        .error {
            color: #ff6b6b;
        }
        
        .success {
            color: #51cf66;
        }
        
        .warning {
            color: #ffd43b;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Pi Network Bot Control Panel</h1>
        
        <div class="status-bar">
            <div class="status-item">
                <div class="status-indicator" id="statusIndicator"></div>
                <span id="statusText">Bot Status: Stopped</span>
            </div>
            <div class="status-item">
                <span>Balance: <strong id="balance">0.00</strong> Pi</span>
            </div>
            <div class="status-item">
                <span>Last Check: <strong id="lastCheck">Never</strong></span>
            </div>
        </div>
        
        <div class="form-section">
            <div class="form-grid">
                <div class="form-group">
                    <label for="mnemonic">Wallet Mnemonic Phrase</label>
                    <textarea id="mnemonic" placeholder="Enter your 12-24 word mnemonic phrase"></textarea>
                </div>
                <div class="form-group">
                    <label for="receiverMain">Receiver Address (Mainnet)</label>
                    <input type="text" id="receiverMain" placeholder="G...">
                </div>
                <div class="form-group">
                    <label for="receiverTest">Receiver Address (Testnet)</label>
                    <input type="text" id="receiverTest" placeholder="G...">
                </div>
                <div class="form-group">
                    <label for="unlockTime">Unlock Time</label>
                    <input type="datetime-local" id="unlockTime">
                </div>
                <div class="form-group">
                    <label for="amount">Amount to Withdraw</label>
                    <input type="number" id="amount" placeholder="0.00" step="0.0000001">
                </div>
                <div class="form-group">
                    <label for="interval">Check Interval (ms)</label>
                    <input type="number" id="interval" value="1000" min="100">
                </div>
                <div class="form-group">
                    <label for="network">Network</label>
                    <select id="network">
                        <option value="false">Mainnet</option>
                        <option value="true">Testnet</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="maxRetries">Max Retries</label>
                    <input type="number" id="maxRetries" value="10" min="1">
                </div>
            </div>
            
            <div class="button-group">
                <button class="btn-primary" onclick="startBot()">Start Bot</button>
                <button class="btn-secondary" onclick="stopBot()">Stop Bot</button>
            </div>
        </div>
        
        <div class="info-section">
            <h3>Bot Information</h3>
            <div class="info-grid">
                <div class="info-card">
                    <div class="info-label">Public Key</div>
                    <div class="info-value" id="publicKey">Not initialized</div>
                </div>
                <div class="info-card">
                    <div class="info-label">Transactions Sent</div>
                    <div class="info-value" id="txCount">0</div>
                </div>
                <div class="info-card">
                    <div class="info-label">Errors</div>
                    <div class="info-value" id="errorCount">0</div>
                </div>
            </div>
        </div>
        
        <div class="log-section">
            <h3>Activity Log</h3>
            <div class="log-container" id="logContainer">
                <div class="log-entry">System ready. Configure and start the bot.</div>
            </div>
        </div>
    </div>
    
    <script>
        let pollingInterval = null;
        
        function addLog(message, type = 'info') {
            const logContainer = document.getElementById('logContainer');
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + type;
            entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        async function startBot() {
            const config = {
                mnemonic: document.getElementById('mnemonic').value,
                receiverMain: document.getElementById('receiverMain').value,
                receiverTest: document.getElementById('receiverTest').value,
                unlockTime: document.getElementById('unlockTime').value,
                amountToWithdraw: parseFloat(document.getElementById('amount').value) || 0,
                checkInterval: parseInt(document.getElementById('interval').value) || 1000,
                useTestnet: document.getElementById('network').value === 'true',
                maxRetries: parseInt(document.getElementById('maxRetries').value) || 10
            };
            
            try {
                const response = await fetch('/api/bot/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    addLog('Bot started successfully!', 'success');
                    if (result.publicKey) {
                        document.getElementById('publicKey').textContent = result.publicKey;
                    }
                    startPolling();
                } else {
                    addLog('Failed to start bot: ' + result.error, 'error');
                }
            } catch (error) {
                addLog('Error: ' + error.message, 'error');
            }
        }
        
        async function stopBot() {
            try {
                const response = await fetch('/api/bot/stop', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    addLog('Bot stopped successfully', 'warning');
                    stopPolling();
                }
            } catch (error) {
                addLog('Error: ' + error.message, 'error');
            }
        }
        
        async function updateStatus() {
            try {
                const response = await fetch('/api/bot/status');
                const status = await response.json();
                
                // Update UI
                const indicator = document.getElementById('statusIndicator');
                const statusText = document.getElementById('statusText');
                
                if (status.isRunning) {
                    indicator.className = 'status-indicator running';
                    statusText.textContent = 'Bot Status: Running';
                } else {
                    indicator.className = 'status-indicator stopped';
                    statusText.textContent = 'Bot Status: Stopped';
                }
                
                document.getElementById('balance').textContent = parseFloat(status.balance).toFixed(7);
                document.getElementById('lastCheck').textContent = status.lastCheck 
                    ? new Date(status.lastCheck).toLocaleTimeString() 
                    : 'Never';
                document.getElementById('txCount').textContent = status.transactions.length;
                document.getElementById('errorCount').textContent = status.errors.length;
                
                // Add new errors to log
                if (status.errors.length > 0) {
                    const lastError = status.errors[status.errors.length - 1];
                    if (!window.lastError || window.lastError !== lastError) {
                        addLog(lastError, 'error');
                        window.lastError = lastError;
                    }
                }
                
                // Add new transactions to log
                if (status.transactions.length > 0) {
                    const lastTx = status.transactions[status.transactions.length - 1];
                    if (!window.lastTx || window.lastTx.hash !== lastTx.hash) {
                        addLog('Transaction sent: ' + lastTx.hash, 'success');
                        window.lastTx = lastTx;
                    }
                }
            } catch (error) {
                console.error('Status update error:', error);
            }
        }
        
        function startPolling() {
            stopPolling();
            updateStatus();
            pollingInterval = setInterval(updateStatus, 1000);
        }
        
        function stopPolling() {
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
        }
        
        // Initial status check
        updateStatus();
    </script>
</body>
</html>
`;

// Create HTTP server
serve({
  port: PORT,
  
  async fetch(req) {
    const url = new URL(req.url);
    
    // Serve frontend
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(htmlContent, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // API endpoints
    if (url.pathname === '/api/bot/start' && req.method === 'POST') {
      try {
        const config = await req.json();
        const result = startBot(config);
        return Response.json(result);
      } catch (error: any) {
        return Response.json({ success: false, error: error.message });
      }
    }
    
    if (url.pathname === '/api/bot/stop' && req.method === 'POST') {
      const result = stopBot();
      return Response.json(result);
    }
    
    if (url.pathname === '/api/bot/status') {
      return Response.json({
        isRunning: botState.isRunning,
        lastCheck: botState.lastCheck,
        balance: botState.balance,
        transactions: botState.transactions.slice(-10),
        errors: botState.errors.slice(-10),
        config: {
          ...botState.config,
          mnemonic: botState.config.mnemonic ? '***' : ''
        }
      });
    }
    
    // Health check endpoint for Render
    if (url.pathname === '/health') {
      return Response.json({ status: 'healthy', timestamp: new Date() });
    }
    
    return new Response('Not Found', { status: 404 });
  }
});

console.log(`🚀 Server running at http://localhost:${PORT}`);
console.log(`📊 Dashboard available at http://localhost:${PORT}`);
console.log(`❤️  Health check at http://localhost:${PORT}/health`);