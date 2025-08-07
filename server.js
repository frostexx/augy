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
            "connect-src": ["'self'", "wss:", "ws:"]
        }
    }
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection for real-time updates
wss.on('connection', (ws) => {
    console.log('🔌 Client connected');
    
    // Forward bot events to client
    ultimateBot.on('log', (logData) => {
        ws.send(JSON.stringify({ type: 'log', data: logData }));
    });
    
    ultimateBot.on('monitoring', (statusData) => {
        ws.send(JSON.stringify({ type: 'status', data: statusData }));
    });
    
    ws.on('close', () => {
        console.log('🔌 Client disconnected');
    });
});

// API Routes

// Initialize wallet
app.post('/api/wallet/init', async (req, res) => {
    try {
        const { mnemonic } = req.body;
        const walletData = await ultimateBot.initializeWallet(mnemonic);
        res.json({ success: true, data: walletData });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Initialize sponsor
app.post('/api/sponsor/init', async (req, res) => {
    try {
        const { sponsorMnemonic } = req.body;
        const sponsorData = await ultimateBot.initializeSponsor(sponsorMnemonic);
        res.json({ success: true, data: sponsorData });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get wallet balance
app.get('/api/wallet/balance', async (req, res) => {
    try {
        const balance = await ultimateBot.getAvailableBalance();
        res.json({ success: true, balance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get locked balances
app.get('/api/wallet/locked', async (req, res) => {
    try {
        const locked = await ultimateBot.getLockedBalances();
        res.json({ success: true, locked });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Execute withdrawal
app.post('/api/wallet/withdraw', async (req, res) => {
    try {
        const { toAddress, amount } = req.body;
        const result = await ultimateBot.executeWithdrawal(toAddress, amount);
        res.json({ success: true, hash: result.hash });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Start ultimate claiming
app.post('/api/bot/claim', async (req, res) => {
    try {
        const { balanceId } = req.body;
        ultimateBot.selectedBalance = { id: balanceId };
        const result = await ultimateBot.executeUltimateClaim(balanceId);
        res.json({ success: true, result });
    } catch (error) {
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
        }
        
        res.json({ success: true, action, isActive: ultimateBot.isActive });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get recent transactions
app.get('/api/wallet/transactions', async (req, res) => {
    try {
        const transactions = await ultimateBot.getRecentTransactions();
        res.json({ success: true, transactions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ULTIMATE', 
        timestamp: new Date().toISOString(),
        botActive: ultimateBot.isActive
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 ULTIMATE PI BOT SERVER RUNNING ON PORT ${PORT}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
});