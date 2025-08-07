class UltimatePiBotUI {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isLoggedIn = false;
        this.currentPage = 'login';
        
        this.initializeUI();
        this.setupWebSocket();
        this.startTimeDisplay();
    }

    initializeUI() {
        // Tab switching
        document.getElementById('loginTab').addEventListener('click', () => this.switchPage('login'));
        document.getElementById('withdrawTab').addEventListener('click', () => this.switchPage('withdraw'));
        
        // Login functionality
        document.getElementById('loginButton').addEventListener('click', () => this.handleLogin());
        
        // Wallet operations
        document.getElementById('refreshBalance').addEventListener('click', () => this.refreshBalance());
        document.getElementById('refreshLocked').addEventListener('click', () => this.refreshLockedBalances());
        document.getElementById('withdrawButton').addEventListener('click', () => this.handleWithdraw());
        document.getElementById('claimButton').addEventListener('click', () => this.handleUltimateClaim());
        
        // Bot controls
        document.getElementById('startMonitoring').addEventListener('click', () => this.startMonitoring());
        document.getElementById('stopMonitoring').addEventListener('click', () => this.stopMonitoring());
        document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());
        
        // Auto-refresh transactions
        setInterval(() => {
            if (this.isLoggedIn) {
                this.refreshTransactions();
            }
        }, 30000); // Every 30 seconds
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.addLog('🔌 Connected to Ultimate Pi Bot', 'success');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
        
        this.ws.onclose = () => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.addLog('🔌 Disconnected from bot', 'error');
            
            // Attempt to reconnect after 5 seconds
            setTimeout(() => this.setupWebSocket(), 5000);
        };
        
        this.ws.onerror = (error) => {
            this.addLog('🔌 WebSocket error occurred', 'error');
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'log':
                this.addLog(data.data.message, this.getLogLevel(data.data.level));
                break;
            case 'status':
                this.updateMetrics(data.data);
                break;
        }
    }

    getLogLevel(level) {
        const levelMap = {
            'INFO': 'info',
            'SUCCESS': 'success',
            'WARN': 'warning',
            'ERROR': 'error',
            'ULTIMATE': 'success'
        };
        return levelMap[level] || 'info';
    }

    // CORRECTED updateConnectionStatus method
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('botStatus');
        const statusContainer = statusElement.parentElement;
        
        if (connected) {
            statusElement.textContent = 'ONLINE';
            statusContainer.classList.remove('offline');
            statusContainer.classList.add('online');
        } else {
            statusElement.textContent = 'OFFLINE';
            statusContainer.classList.remove('online');
            statusContainer.classList.add('offline');
        }
    }

    switchPage(page) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${page}Tab`).classList.add('active');
        
        // Update pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}Page`).classList.add('active');
        
        this.currentPage = page;
        
        // If switching to withdraw page and logged in, refresh data
        if (page === 'withdraw' && this.isLoggedIn) {
            this.refreshBalance();
            this.refreshLockedBalances();
            this.refreshTransactions();
        }
    }

    startTimeDisplay() {
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            document.getElementById('currentTime').textContent = timeString;
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    async handleLogin() {
        const seedPhrase = document.getElementById('seedPhrase').value.trim();
        
        if (!seedPhrase) {
            this.showError('Please enter your seed phrase');
            return;
        }
        
        if (seedPhrase.split(' ').length !== 24) {
            this.showError('Seed phrase must be exactly 24 words');
            return;
        }
        
        const loginButton = document.getElementById('loginButton');
        loginButton.classList.add('loading');
        loginButton.textContent = 'CONNECTING...';
        
        try {
            const response = await fetch('/api/wallet/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mnemonic: seedPhrase })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.isLoggedIn = true;
                this.addLog(`🔐 Login successful: ${result.data.publicKey}`, 'success');
                this.switchPage('withdraw');
                
                // Clear sensitive data
                document.getElementById('seedPhrase').value = '';
                
                // Load initial data
                await Promise.all([
                    this.refreshBalance(),
                    this.refreshLockedBalances(),
                    this.refreshTransactions()
                ]);
                
            } else {
                this.showError(result.error);
            }
            
        } catch (error) {
            this.showError('Login failed: ' + error.message);
        } finally {
            loginButton.classList.remove('loading');
            loginButton.textContent = 'LOGIN TO ULTIMATE BOT';
        }
    }

    async refreshBalance() {
        try {
            const response = await fetch('/api/wallet/balance');
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('availableBalance').textContent = result.balance.toFixed(7);
            }
        } catch (error) {
            this.addLog('❌ Failed to refresh balance', 'error');
        }
    }

    async refreshLockedBalances() {
        try {
            const response = await fetch('/api/wallet/locked');
            const result = await response.json();
            
            if (result.success) {
                const select = document.getElementById('lockedBalance');
                select.innerHTML = '<option value="">Select locked balance...</option>';
                
                result.locked.forEach(balance => {
                    const option = document.createElement('option');
                    option.value = balance.id;
                    
                    const unlockDate = new Date(balance.unlockTime);
                    const now = new Date();
                    const isUnlocked = unlockDate <= now;
                    const timeStr = isUnlocked ? 'UNLOCKED' : `Unlocks: ${unlockDate.toLocaleString()}`;
                    
                    option.textContent = `${balance.amount.toFixed(7)} ${balance.asset} - ${timeStr}`;
                    option.dataset.amount = balance.amount;
                    option.dataset.unlockTime = balance.unlockTime;
                    
                    select.appendChild(option);
                });
                
                this.addLog(`🔒 Found ${result.locked.length} locked balances`, 'info');
            }
        } catch (error) {
            this.addLog('❌ Failed to refresh locked balances', 'error');
        }
    }

    async refreshTransactions() {
        try {
            const response = await fetch('/api/wallet/transactions');
            const result = await response.json();
            
            if (result.success) {
                const container = document.getElementById('recentTransactions');
                
                if (result.transactions.length === 0) {
                    container.innerHTML = '<div class="no-transactions">No transactions yet</div>';
                    return;
                }
                
                container.innerHTML = result.transactions.map(tx => `
                    <div class="transaction-item ${tx.successful ? 'success' : 'failed'}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>Hash:</strong> ${tx.hash.substring(0, 16)}...
                                <br>
                                <strong>Fee:</strong> ${(tx.fee / 10000000).toFixed(7)} PI
                                <br>
                                <strong>Operations:</strong> ${tx.operationCount}
                            </div>
                            <div style="text-align: right;">
                                <div style="color: ${tx.successful ? '#4caf50' : '#f44336'}; font-weight: bold;">
                                    ${tx.successful ? '✅ SUCCESS' : '❌ FAILED'}
                                </div>
                                <div style="font-size: 0.9em; color: #ccc;">
                                    ${new Date(tx.timestamp).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        } catch (error) {
            this.addLog('❌ Failed to refresh transactions', 'error');
        }
    }

    async handleWithdraw() {
        const toAddress = document.getElementById('withdrawalAddress').value.trim();
        const amount = parseFloat(document.getElementById('withdrawAmount').value);
        
        if (!toAddress) {
            this.showError('Please enter withdrawal address');
            return;
        }
        
        if (!amount || amount <= 0) {
            this.showError('Please enter valid amount');
            return;
        }
        
        if (!toAddress.startsWith('G') || toAddress.length !== 56) {
            this.showError('Invalid Pi Network address');
            return;
        }
        
        const withdrawButton = document.getElementById('withdrawButton');
        withdrawButton.classList.add('loading');
        withdrawButton.textContent = 'PROCESSING...';
        
        try {
            const response = await fetch('/api/wallet/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toAddress, amount })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.addLog(`✅ Withdrawal successful: ${result.hash}`, 'success');
                this.showSuccess(`Withdrawal of ${amount} PI successful!`);
                
                // Clear form and refresh data
                document.getElementById('withdrawalAddress').value = '';
                document.getElementById('withdrawAmount').value = '';
                await this.refreshBalance();
                await this.refreshTransactions();
                
            } else {
                this.showError(result.error);
            }
            
        } catch (error) {
            this.showError('Withdrawal failed: ' + error.message);
        } finally {
            withdrawButton.classList.remove('loading');
            withdrawButton.textContent = '💸 WITHDRAW';
        }
    }

    async handleUltimateClaim() {
        const selectedBalance = document.getElementById('lockedBalance').value;
        const sponsorPhrase = document.getElementById('sponsorPhrase').value.trim();
        
        if (!selectedBalance) {
            this.showError('Please select a locked balance to claim');
            return;
        }
        
        if (!sponsorPhrase) {
            this.showError('Please enter sponsor seed phrase for claiming fees');
            return;
        }
        
        if (sponsorPhrase.split(' ').length !== 24) {
            this.showError('Sponsor seed phrase must be exactly 24 words');
            return;
        }
        
        const claimButton = document.getElementById('claimButton');
        claimButton.classList.add('loading');
        claimButton.textContent = 'INITIATING ULTIMATE CLAIM...';
        
        try {
            // First initialize sponsor
            const sponsorResponse = await fetch('/api/sponsor/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sponsorMnemonic: sponsorPhrase })
            });
            
            const sponsorResult = await sponsorResponse.json();
            
            if (!sponsorResult.success) {
                throw new Error('Sponsor initialization failed: ' + sponsorResult.error);
            }
            
            this.addLog('💳 Sponsor account initialized successfully', 'success');
            
            // Execute ultimate claim
            const claimResponse = await fetch('/api/bot/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ balanceId: selectedBalance })
            });
            
            const claimResult = await claimResponse.json();
            
            if (claimResult.success) {
                this.addLog('🏆 ULTIMATE CLAIM SEQUENCE INITIATED!', 'success');
                this.showSuccess('Ultimate claim sequence started! Check logs for progress.');
                
                // Clear sensitive sponsor data
                document.getElementById('sponsorPhrase').value = '';
                
                // Start monitoring automatically
                await this.startMonitoring();
                
            } else {
                this.showError(claimResult.error);
            }
            
        } catch (error) {
            this.showError('Ultimate claim failed: ' + error.message);
        } finally {
            claimButton.classList.remove('loading');
            claimButton.textContent = '⚡ ULTIMATE CLAIM';
        }
    }

    async startMonitoring() {
        try {
            const response = await fetch('/api/bot/monitoring/start', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.addLog('🚨 ULTIMATE MONITORING ACTIVATED', 'success');
                document.getElementById('startMonitoring').disabled = true;
                document.getElementById('stopMonitoring').disabled = false;
            }
        } catch (error) {
            this.addLog('❌ Failed to start monitoring', 'error');
        }
    }

    async stopMonitoring() {
        try {
            const response = await fetch('/api/bot/monitoring/stop', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.addLog('🛑 Monitoring stopped', 'info');
                document.getElementById('startMonitoring').disabled = false;
                document.getElementById('stopMonitoring').disabled = true;
            }
        } catch (error) {
            this.addLog('❌ Failed to stop monitoring', 'error');
        }
    }

    clearLogs() {
        const logContainer = document.getElementById('liveLogs');
        logContainer.innerHTML = '<div class="log-entry info"><span class="timestamp">[' + 
            new Date().toISOString() + ']</span><span class="message">🧹 Logs cleared</span></div>';
    }

    addLog(message, level = 'info') {
        const logContainer = document.getElementById('liveLogs');
        const timestamp = new Date().toISOString();
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        logEntry.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            <span class="message">${message}</span>
        `;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Keep only last 100 log entries
        while (logContainer.children.length > 100) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }

    updateMetrics(data) {
        if (data.competitionWins !== undefined) {
            document.getElementById('competitionWins').textContent = data.competitionWins;
        }
        
        if (data.networkDominanceScore !== undefined) {
            document.getElementById('networkDominance').textContent = data.networkDominanceScore + '%';
        }
        
        // Update threat level color
        const threatElement = document.getElementById('threatLevel');
        if (data.threatLevel) {
            threatElement.textContent = data.threatLevel;
            threatElement.style.color = this.getThreatColor(data.threatLevel);
        }
    }

    getThreatColor(level) {
        const colors = {
            'LOW': '#4caf50',
            'MEDIUM': '#ff9800',
            'HIGH': '#f44336',
            'EXTREME': '#9c27b0'
        };
        return colors[level] || '#ffd700';
    }

    showError(message) {
        this.addLog('❌ ' + message, 'error');
        
        // Create temporary error notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #f44336, #ff5722);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(244, 67, 54, 0.4);
            z-index: 10000;
            font-weight: bold;
            max-width: 400px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }

    showSuccess(message) {
        this.addLog('✅ ' + message, 'success');
        
        // Create temporary success notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #4caf50, #8bc34a);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
            z-index: 10000;
            font-weight: bold;
            max-width: 400px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }
}

// Initialize the UI when page loads
document.addEventListener('DOMContentLoaded', () => {
    new UltimatePiBotUI();
});