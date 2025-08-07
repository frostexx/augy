import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { UltimatePiBot } from './bot/UltimatePiBot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Global bot instance
let ultimateBot = new UltimatePiBot();

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "connect-src": ["'self'", "wss:", "ws:", "https:"],
            "script-src": ["'self'", "'unsafe-inline'"],
            "style-src": ["'self'", "'unsafe-inline'"]
        }
    }
}));

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection for real-time updates
wss.on('connection', (ws) => {
    console.log('🔌 Client connected');
    
    // Send initial connection message
    ws.send(JSON.stringify({ 
        type: 'connection', 
        data: { status: 'connected', timestamp: new Date().toISOString() }
    }));
    
    // Forward bot events to client
    const logHandler = (logData) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'log', data: logData }));
        }
    };
    
    const statusHandler = (statusData) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'status', data: statusData }));
        }
    };
    
    ultimateBot.on('log', logHandler);
    ultimateBot.on('monitoring', statusHandler);
    
    ws.on('close', () => {
        console.log('🔌 Client disconnected');
        ultimateBot.removeListener('log', logHandler);
        ultimateBot.removeListener('monitoring', statusHandler);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ULTIMATE', 
        timestamp: new Date().toISOString(),
        botActive: ultimateBot ? ultimateBot.isActive : false,
        nodeVersion: process.version,
        memory: process.memoryUsage()
    });
});

// Initialize wallet
app.post('/api/wallet/init', async (req, res) => {
    try {
        const { mnemonic } = req.body;
        
        if (!mnemonic) {
            return res.status(400).json({ success: false, error: 'Mnemonic is required' });
        }
        
        const walletData = await ultimateBot.initializeWallet(mnemonic);
        res.json({ success: true, data: walletData });
    } catch (error) {
        console.error('Wallet init error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Initialize sponsor
app.post('/api/sponsor/init', async (req, res) => {
    try {
        const { sponsorMnemonic } = req.body;
        
        if (!sponsorMnemonic) {
            return res.status(400).json({ success: false, error: 'Sponsor mnemonic is required' });
        }
        
        const sponsorData = await ultimateBot.initializeSponsor(sponsorMnemonic);
        res.json({ success: true, data: sponsorData });
    } catch (error) {
        console.error('Sponsor init error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get wallet balance
app.get('/api/wallet/balance', async (req, res) => {
    try {
        if (!ultimateBot.walletKeypair) {
            return res.status(400).json({ success: false, error: 'Wallet not initialized' });
        }
        
        const balance = await ultimateBot.getAvailableBalance();
        res.json({ success: true, balance });
    } catch (error) {
        console.error('Balance fetch error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get locked balances
app.get('/api/wallet/locked', async (req, res) => {
    try {
        if (!ultimateBot.walletKeypair) {
            return res.status(400).json({ success: false, error: 'Wallet not initialized' });
        }
        
        const locked = await ultimateBot.getLockedBalances();
        res.json({ success: true, locked });
    } catch (error) {
        console.error('Locked balances fetch error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Execute withdrawal
app.post('/api/wallet/withdraw', async (req, res) => {
    try {
        const { toAddress, amount } = req.body;
        
        if (!toAddress || !amount) {
            return res.status(400).json({ success: false, error: 'Address and amount are required' });
        }
        
        if (!ultimateBot.walletKeypair) {
            return res.status(400).json({ success: false, error: 'Wallet not initialized' });
        }
        
        const result = await ultimateBot.executeWithdrawal(toAddress, amount);
        res.json({ success: true, hash: result.hash });
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Start ultimate claiming
app.post('/api/bot/claim', async (req, res) => {
    try {
        const { balanceId } = req.body;
        
        if (!balanceId) {
            return res.status(400).json({ success: false, error: 'Balance ID is required' });
        }
        
        if (!ultimateBot.walletKeypair || !ultimateBot.sponsorKeypair) {
            return res.status(400).json({ success: false, error: 'Wallet and sponsor must be initialized' });
        }
        
        ultimateBot.selectedBalance = { id: balanceId };
        
        // Start the claim process asynchronously
        ultimateBot.executeUltimateClaim(balanceId).catch(error => {
            console.error('Ultimate claim error:', error);
        });
        
        res.json({ success: true, message: 'Ultimate claim sequence initiated' });
    } catch (error) {
        console.error('Claim initiation error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Start/stop monitoring
app.post('/api/bot/monitoring/:action', (req, res) => {
    try {
        const { action } = req.params;
        
        if (action === 'start') {
            ultimateBot.startUltimateMonitoring();
        } else if (action === 'stop') {
            ultimateBot.stopUltimateMonitoring();
        } else {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }
        
        res.json({ success: true, action, isActive: ultimateBot.isActive });
    } catch (error) {
        console.error('Monitoring control error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get recent transactions
app.get('/api/wallet/transactions', async (req, res) => {
    try {
        if (!ultimateBot.walletKeypair) {
            return res.status(400).json({ success: false, error: 'Wallet not initialized' });
        }
        
        const transactions = await ultimateBot.getRecentTransactions();
        res.json({ success: true, transactions });
    } catch (error) {
        console.error('Transactions fetch error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 ULTIMATE PI BOT SERVER RUNNING ON PORT ${PORT}`);
    console.log(`🌐 Dashboard: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
    console.log(`📊 Health Check: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});