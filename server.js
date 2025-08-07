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
        data: { 
            status: 'connected', 
            timestamp: '2025-08-07 23:27:24',
            serverTime: '2025-08-07 23:27:24 UTC',
            user: 'walfgenxx'
        }
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

    const claimScheduledHandler = (data) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'claimScheduled', data }));
        }
    };

    const preparationStartedHandler = (data) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'preparationStarted', data }));
        }
    };

    const executionCompleteHandler = (data) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'executionComplete', data }));
        }
    };
    
    ultimateBot.on('log', logHandler);
    ultimateBot.on('monitoring', statusHandler);
    ultimateBot.on('claimScheduled', claimScheduledHandler);
    ultimateBot.on('preparationStarted', preparationStartedHandler);
    ultimateBot.on('executionComplete', executionCompleteHandler);
    
    ws.on('close', () => {
        console.log('🔌 Client disconnected');
        ultimateBot.removeListener('log', logHandler);
        ultimateBot.removeListener('monitoring', statusHandler);
        ultimateBot.removeListener('claimScheduled', claimScheduledHandler);
        ultimateBot.removeListener('preparationStarted', preparationStartedHandler);
        ultimateBot.removeListener('executionComplete', executionCompleteHandler);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ULTIMATE', 
        timestamp: '2025-08-07 23:27:24',
        serverTime: '2025-08-07 23:27:24 UTC',
        user: 'walfgenxx',
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

// Schedule competitive claim - THE PROPER COMPETITIVE WAY
app.post('/api/bot/schedule-competitive-claim', async (req, res) => {
    try {
        const { balanceId, toAddress, amount } = req.body;
        
        if (!balanceId || !toAddress || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Balance ID, address, and amount are required' 
            });
        }
        
        if (!ultimateBot.walletKeypair || !ultimateBot.sponsorKeypair) {
            return res.status(400).json({ 
                success: false, 
                error: 'Wallet and sponsor must be initialized' 
            });
        }
        
        // Schedule the competitive claim
        const result = await ultimateBot.scheduleCompetitiveClaim(balanceId, toAddress, amount);
        
        res.json({ 
            success: true, 
            unlockTime: result.unlockTime,
            timeToUnlock: result.timeToUnlock,
            status: result.status,
            message: `Competitive claim scheduled - will execute at unlock time in ${Math.round(result.timeToUnlock / 1000)} seconds`
        });
        
    } catch (error) {
        console.error('Schedule competitive claim error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Stop competitive claim
app.post('/api/bot/stop-competitive-claim', (req, res) => {
    try {
        ultimateBot.stopCompetitiveMonitoring();
        res.json({ success: true, message: 'Competitive claim stopped successfully' });
    } catch (error) {
        console.error('Stop competitive claim error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Execute atomic claim and transfer - LEGACY SUPPORT
app.post('/api/bot/claim-and-transfer', async (req, res) => {
    try {
        const { balanceId, toAddress, amount } = req.body;
        
        if (!balanceId || !toAddress || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'Balance ID, address, and amount are required' 
            });
        }
        
        if (!ultimateBot.walletKeypair || !ultimateBot.sponsorKeypair) {
            return res.status(400).json({ 
                success: false, 
                error: 'Wallet and sponsor must be initialized' 
            });
        }
        
        // Use the competitive claiming system
        const result = await ultimateBot.scheduleCompetitiveClaim(balanceId, toAddress, amount);
        
        res.json({ 
            success: true, 
            unlockTime: result.unlockTime,
            timeToUnlock: result.timeToUnlock,
            message: `Competitive claim initiated - preparing for unlock time`
        });
        
    } catch (error) {
        console.error('Claim and transfer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Legacy claim endpoint (for monitoring compatibility)
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

// Get current server time
app.get('/api/time', (req, res) => {
    const now = new Date();
    res.json({
        serverTime: now.toISOString().replace('T', ' ').substring(0, 19),
        utcTime: '2025-08-07 23:27:24',
        user: 'walfgenxx',
        timestamp: Date.now()
    });
});

// Get bot status
app.get('/api/bot/status', (req, res) => {
    res.json({
        isActive: ultimateBot.isActive,
        isPreparing: ultimateBot.isPreparing,
        isExecuting: ultimateBot.isExecuting,
        status: ultimateBot.getStatus ? ultimateBot.getStatus() : 'READY',
        unlockTime: ultimateBot.unlockTime,
        timeToUnlock: ultimateBot.unlockTime ? ultimateBot.unlockTime - Date.now() : null,
        user: 'walfgenxx'
    });
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
    console.log(`⏰ Server Time: 2025-08-07 23:27:24 UTC`);
    console.log(`👤 User: walfgenxx`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});