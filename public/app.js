class UltimatePiBotUI {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isLoggedIn = false;
        this.currentPage = 'login';
        this.serverStartTime = '2025-08-07 23:07:00';
        this.currentUser = 'walfgenxx';
        
        this.initializeUI();
        this.setupWebSocket();
        this.startTimeDisplay();
        this.updateUserInfo();
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
        document.getElementById('refreshTransactions').addEventListener('click', () => this.refreshTransactions());
        
        // ATOMIC CLAIM+TRANSFER BUTTON
        document.getElementById('claimButton').addEventListener('click', () => this.handleAtomicClaimAndTransfer());
        
        // Bot controls
        document.getElementById('startMonitoring').addEventListener('click', () => this.startMonitoring());
        document.getElementById('stopMonitoring').addEventListener('click', () => this.stopMonitoring());
        document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());
        
        // Auto-refresh functionality
        setInterval(() => {
            if (this.isLoggedIn) {
                this.refreshTransactions();
            }
        }, 30000);

        // Real-time balance updates
        setInterval(() => {
            if (this.isLoggedIn) {
                this.refreshBalance();
            }
        }, 10000);
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.addLog('🔌 Connected to Ultimate Pi Bot Server', 'success');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
        
        this.ws.onclose = () => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            this.addLog('🔌 Disconnected from server - Attempting reconnection...', 'error');
            setTimeout(() => this.setupWebSocket(), 5000);
        };
        
        this.ws.onerror = (error) => {
            this.addLog('🔌 WebSocket connection error occurred', 'error');
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
            case 'connection':
                this.addLog(`🚀 Server connection established - ${data.data.user}`, 'success');
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

    updateUserInfo() {
        document.getElementById('currentUser').textContent = this.currentUser;
    }

    switchPage(page) {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${page}Tab`).classList.add('active');
        
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}Page`).classList.add('active');
        
        this.currentPage = page;
        
        if (page === 'withdraw' && this.isLoggedIn) {
            this.refreshBalance();
            this.refreshLockedBalances();
            this.refreshTransactions();
        }
    }

    startTimeDisplay() {
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toISOString().replace('T', ' ').substring(0, 19);
            document.getElementById('currentTime').textContent = timeString;
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    // Enhanced seed phrase validation
    validateSeedPhrase(phrase) {
        if (!phrase) return false;
        
        const cleanPhrase = phrase.trim().replace(/\s+/g, ' ');
        const words = cleanPhrase.split(' ');
        
        if (words.length !== 24) {
            console.log(`Seed phrase validation failed: ${words.length} words instead of 24`);
            return false;
        }
        
        const hasEmptyWords = words.some(word => word.length === 0);
        if (hasEmptyWords) {
            console.log('Seed phrase validation failed: contains empty words');
            return false;
        }
        
        return true;
    }

    async handleLogin() {
        const seedPhrase = document.getElementById('seedPhrase').value.trim();
        
        if (!seedPhrase) {
            this.showError('Please enter your seed phrase');
            return;
        }
        
        if (!this.validateSeedPhrase(seedPhrase)) {
            this.showError('Seed phrase must be exactly 24 words');
            return;
        }
        
        const loginButton = document.getElementById('loginButton');
        loginButton.classList.add('loading');
        loginButton.textContent = 'CONNECTING...';
        
        try {
            const cleanPhrase = seedPhrase.trim().replace(/\s+/g, ' ');
            
            const response = await fetch('/api/wallet/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mnemonic: cleanPhrase })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.isLoggedIn = true;
                this.addLog(`🔐 Login successful for ${this.currentUser}: ${result.data.publicKey.substring(0, 8)}...`, 'success');
                this.switchPage('withdraw');
                
                document.getElementById('seedPhrase').value = '';
                
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
                select.innerHTML = '<option value="">Select locked balance to claim...</option>';
                
                result.locked.forEach(balance => {
                    const option = document.createElement('option');
                    option.value = balance.id;
                    
                    const unlockDate = new Date(balance.unlockTime);
                    const now = new Date();
                    const isUnlocked = unlockDate <= now;
                    const timeStr = isUnlocked ? '🔓 UNLOCKED' : `🔒 Unlocks: ${unlockDate.toLocaleString()}`;
                    
                    option.textContent = `${balance.amount.toFixed(7)} ${balance.asset} - ${timeStr}`;
                    option.dataset.amount = balance.amount;
                    option.dataset.unlockTime = balance.unlockTime;
                    option.dataset.isUnlocked = isUnlocked;
                    
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
                        <div class="transaction-header">
                            <div class="transaction-info">
                                <strong>Hash:</strong> ${tx.hash !== 'N/A' ? tx.hash.substring(0, 16) + '...' : 'N/A'}
                                <br>
                                <strong>Fee:</strong> ${(tx.fee / 10000000).toFixed(7)} PI
                                <br>
                                <strong>Operations:</strong> ${tx.operationCount}
                            </div>
                            <div class="transaction-status">
                                <div class="status-badge ${tx.successful ? 'success' : 'failed'}">
                                    ${tx.successful ? '✅ SUCCESS' : '❌ FAILED'}
                                </div>
                                <div class="transaction-time">
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

    // 🔥 ATOMIC CLAIM + TRANSFER - LIGHTNING FAST EXECUTION
    async handleAtomicClaimAndTransfer() {
        const selectedBalance = document.getElementById('lockedBalance').value;
        const sponsorPhrase = document.getElementById('sponsorPhrase').value.trim();
        const toAddress = document.getElementById('withdrawalAddress').value.trim();
        const amount = parseFloat(document.getElementById('withdrawAmount').value);
        
        // Comprehensive validation
        if (!selectedBalance) {
            this.showError('Please select a locked balance to claim');
            return;
        }
        
        if (!sponsorPhrase) {
            this.showError('Please enter sponsor seed phrase for claiming fees');
            return;
        }
        
        if (!this.validateSeedPhrase(sponsorPhrase)) {
            this.showError('Sponsor seed phrase must be exactly 24 words');
            return;
        }
        
        if (!toAddress) {
            this.showError('Please enter transfer destination address');
            return;
        }
        
        if (!toAddress.startsWith('G') || toAddress.length !== 56) {
            this.showError('Invalid Pi Network address format');
            return;
        }
        
        if (!amount || amount <= 0) {
            this.showError('Please enter valid amount greater than zero');
            return;
        }
        
        // Validate against selected locked balance
        const selectedOption = document.querySelector(`#lockedBalance option[value="${selectedBalance}"]`);
        const lockedAmount = parseFloat(selectedOption?.dataset.amount || '0');
        const isUnlocked = selectedOption?.dataset.isUnlocked === 'true';
        
        if (amount > lockedAmount) {
            this.showError(`Amount ${amount} PI exceeds locked balance ${lockedAmount} PI`);
            return;
        }
        
        if (!isUnlocked) {
            const unlockTime = parseInt(selectedOption?.dataset.unlockTime || '0');
            const timeToUnlock = Math.round((unlockTime - Date.now()) / 1000);
            this.showError(`Balance still locked. Unlocks in ${timeToUnlock} seconds`);
            return;
        }
        
        const claimButton = document.getElementById('claimButton');
        claimButton.classList.add('loading');
        claimButton.textContent = 'EXECUTING ATOMIC OPERATION...';
        
        const startTime = Date.now();
        
        try {
            // Step 1: Initialize sponsor (lightning fast)
            this.addLog('💳 Initializing sponsor account...', 'info');
            const cleanSponsorPhrase = sponsorPhrase.trim().replace(/\s+/g, ' ');
            
            const sponsorResponse = await fetch('/api/sponsor/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sponsorMnemonic: cleanSponsorPhrase })
            });
            
            const sponsorResult = await sponsorResponse.json();
            
            if (!sponsorResult.success) {
                throw new Error('Sponsor initialization failed: ' + sponsorResult.error);
            }
            
            this.addLog('💳 Sponsor account initialized - Ready for atomic execution', 'success');
            
            // Step 2: Execute ATOMIC claim + transfer (NO DELAYS)
            this.addLog('⚡ EXECUTING ATOMIC CLAIM+TRANSFER - CRUSHING COMPETITORS...', 'info');
            
            const atomicResponse = await fetch('/api/bot/claim-and-transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    balanceId: selectedBalance,
                    toAddress: toAddress,
                    amount: amount
                })
            });
            
            const atomicResult = await atomicResponse.json();
            
            if (atomicResult.success) {
                const totalTime = Date.now() - startTime;
                const execTime = atomicResult.executionTime || totalTime;
                
                this.addLog(`🏆 ATOMIC EXECUTION SUCCESSFUL IN ${execTime}MS!`, 'success');
                this.addLog(`📊 Claim Hash: ${atomicResult.claimHash}`, 'success');
                this.addLog(`📊 Transfer Hash: ${atomicResult.transferHash}`, 'success');
                
                this.showSuccess(`⚡ Lightning-fast atomic execution completed!\n${amount} PI transferred in ${execTime}ms`);
                
                // Clear form for security
                document.getElementById('sponsorPhrase').value = '';
                document.getElementById('withdrawalAddress').value = '';
                document.getElementById('withdrawAmount').value = '';
                document.getElementById('lockedBalance').value = '';
                
                // Refresh all data
                await Promise.all([
                    this.refreshBalance(),
                    this.refreshLockedBalances(),
                    this.refreshTransactions()
                ]);
                
            } else {
                this.showError(`Atomic execution failed: ${atomicResult.error}`);
            }
            
        } catch (error) {
            const totalTime = Date.now() - startTime;
            this.addLog(`💥 Atomic execution failed after ${totalTime}ms: ${error.message}`, 'error');
            this.showError('Atomic execution failed: ' + error.message);
        } finally {
            claimButton.classList.remove('loading');
            claimButton.textContent = '⚡ EXECUTE ATOMIC CLAIM & TRANSFER';
        }
    }

    async startMonitoring() {
        try {
            const response = await fetch('/api/bot/monitoring/start', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.addLog('🚨 ULTIMATE MONITORING ACTIVATED - COMPETITION MODE ENGAGED', 'success');
                document.getElementById('startMonitoring').disabled = true;
                document.getElementById('stopMonitoring').disabled = false;
                document.getElementById('botMode').textContent = 'MONITORING';
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
                document.getElementById('botMode').textContent = 'READY';
            }
        } catch (error) {
            this.addLog('❌ Failed to stop monitoring', 'error');
        }
    }

    clearLogs() {
        const logContainer = document.getElementById('liveLogs');
        logContainer.innerHTML = `
            <div class="log-entry info">
                <span class="timestamp">[${new Date().toISOString()}]</span>
                <span class="message">🧹 Logs cleared - ${this.currentUser}</span>
            </div>
        `;
    }

    addLog(message, level = 'info') {
        const logContainer = document.getElementById('liveLogs');
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
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
        
        if (data.totalClaimed !== undefined) {
            document.getElementById('totalClaimed').textContent = data.totalClaimed.toFixed(7) + ' PI';
        }
        
        if (data.averageClaimTime !== undefined) {
            document.getElementById('avgExecutionTime').textContent = data.averageClaimTime + 'ms';
        }
        
        if (data.networkDominanceScore !== undefined) {
            document.getElementById('networkDominance').textContent = data.networkDominanceScore + '%';
        }
        
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
        
        const notification = document.createElement('div');
        notification.className = 'notification error';
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
        
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }
}

// Initialize the Ultimate Pi Bot UI
document.addEventListener('DOMContentLoaded', () => {
    new UltimatePiBotUI();
});