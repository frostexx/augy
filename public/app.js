class UltimatePiBotUI {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isLoggedIn = false;
        this.currentPage = 'login';
        this.serverTime = '2025-08-07 23:27:24';
        this.currentUser = 'walfgenxx';
        this.botIsRunning = false;
        this.countdownInterval = null;
        
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
        
        // COMPETITIVE CLAIM+TRANSFER BUTTON
        document.getElementById('claimButton').addEventListener('click', () => this.handleCompetitiveClaim());
        
        // Bot controls
        document.getElementById('startMonitoring').addEventListener('click', () => this.startMonitoring());
        document.getElementById('stopMonitoring').addEventListener('click', () => this.stopMonitoring());
        document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());
        
        // Auto-refresh functionality
        setInterval(() => {
            if (this.isLoggedIn && !this.botIsRunning) {
                this.refreshTransactions();
            }
        }, 30000);

        // Real-time balance updates (less frequent when bot is running)
        setInterval(() => {
            if (this.isLoggedIn && !this.botIsRunning) {
                this.refreshBalance();
            }
        }, 15000);

        // Bot status updates
        setInterval(() => {
            if (this.isLoggedIn) {
                this.updateBotStatus();
            }
        }, 5000);
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            this.addLog('🔌 Connected to Ultimate Pi Bot Server - User: walfgenxx', 'success');
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
                this.addLog(`🚀 Server connection established - ${data.data.user} @ ${data.data.serverTime}`, 'success');
                break;
            case 'claimScheduled':
                this.handleClaimScheduled(data.data);
                break;
            case 'preparationStarted':
                this.handlePreparationStarted(data.data);
                break;
            case 'executionComplete':
                this.handleExecutionComplete(data.data);
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
            // Show actual current time
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

    async updateBotStatus() {
        try {
            const response = await fetch('/api/bot/status');
            const result = await response.json();
            
            if (result.timeToUnlock && result.timeToUnlock > 0) {
                this.updateCountdown(result.timeToUnlock);
            }
            
        } catch (error) {
            // Silent fail for status updates
        }
    }

    updateCountdown(timeToUnlock) {
        const seconds = Math.round(timeToUnlock / 1000);
        if (seconds > 0 && this.botIsRunning) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            const countdownText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            this.addLog(`⏰ Time to unlock: ${countdownText}`, 'info');
        }
    }

    // 🔥 COMPETITIVE CLAIMING SYSTEM
    async handleCompetitiveClaim() {
        const selectedBalance = document.getElementById('lockedBalance').value;
        const sponsorPhrase = document.getElementById('sponsorPhrase').value.trim();
        const toAddress = document.getElementById('withdrawalAddress').value.trim();
        const amount = parseFloat(document.getElementById('withdrawAmount').value);
        const claimButton = document.getElementById('claimButton');
        
        // Check if bot is already running - STOP functionality
        if (this.botIsRunning) {
            try {
                const response = await fetch('/api/bot/stop-competitive-claim', {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    this.botIsRunning = false;
                    claimButton.classList.remove('loading');
                    claimButton.textContent = '⚡ EXECUTE COMPETITIVE CLAIM';
                    this.addLog('🛑 Competitive claiming stopped by user', 'info');
                    
                    if (this.countdownInterval) {
                        clearInterval(this.countdownInterval);
                    }
                    
                    return;
                }
            } catch (error) {
                this.showError('Failed to stop competitive claim: ' + error.message);
                return;
            }
        }
        
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
        
        if (amount > lockedAmount) {
            this.showError(`Amount ${amount} PI exceeds locked balance ${lockedAmount} PI`);
            return;
        }
        
        // Start competitive claiming process
        this.botIsRunning = true;
        claimButton.classList.add('loading');
        claimButton.textContent = '🛑 STOP COMPETITIVE CLAIM';
        
        try {
            // Step 1: Initialize sponsor
            this.addLog('💳 Initializing sponsor account for competitive claiming...', 'info');
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
            
            this.addLog('💳 Sponsor account initialized - Ready for competitive execution', 'success');
            
            // Step 2: Schedule competitive claim
            this.addLog('🎯 Scheduling competitive claim with timing precision...', 'info');
            
            const scheduleResponse = await fetch('/api/bot/schedule-competitive-claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    balanceId: selectedBalance,
                    toAddress: toAddress,
                    amount: amount
                })
            });
            
            const scheduleResult = await scheduleResponse.json();
            
            if (scheduleResult.success) {
                const unlockDate = new Date(scheduleResult.unlockTime);
                const timeToUnlock = Math.round(scheduleResult.timeToUnlock / 1000);
                
                this.addLog('🎯 COMPETITIVE CLAIM SCHEDULED SUCCESSFULLY!', 'success');
                this.addLog(`📅 Unlock time: ${unlockDate.toLocaleString()}`, 'info');
                this.addLog(`⏰ Time to unlock: ${timeToUnlock} seconds`, 'info');
                this.addLog(`🚀 Bot will prepare 5 seconds before unlock and execute at exact millisecond`, 'info');
                this.addLog(`💰 Amount: ${amount} PI → ${toAddress.substring(0, 8)}...`, 'info');
                
                this.showSuccess(`Competitive claim scheduled!\nUnlock: ${unlockDate.toLocaleString()}\nTime remaining: ${timeToUnlock} seconds`);
                
                // Clear sensitive sponsor data
                document.getElementById('sponsorPhrase').value = '';
                
                // Start countdown display
                this.startCountdownDisplay(scheduleResult.unlockTime);
                
            } else {
                throw new Error(scheduleResult.error);
            }
            
        } catch (error) {
            this.addLog(`💥 Failed to schedule competitive claim: ${error.message}`, 'error');
            this.showError('Failed to schedule competitive claim: ' + error.message);
            
            // Reset button and state on error
            this.botIsRunning = false;
            claimButton.classList.remove('loading');
            claimButton.textContent = '⚡ EXECUTE COMPETITIVE CLAIM';
        }
    }

    startCountdownDisplay(unlockTime) {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        this.countdownInterval = setInterval(() => {
            const now = Date.now();
            const timeToUnlock = unlockTime - now;
            
            if (timeToUnlock <= 0) {
                clearInterval(this.countdownInterval);
                return;
            }
            
            const seconds = Math.round(timeToUnlock / 1000);
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            const countdownText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            // Update bot mode display
            document.getElementById('botMode').textContent = `WAITING (${countdownText})`;
            
        }, 1000);
    }

    // WebSocket event handlers
    handleClaimScheduled(data) {
        this.addLog(`🎯 Competitive claim scheduled - ${Math.round(data.timeToUnlock / 1000)} seconds to unlock`, 'info');
    }

    handlePreparationStarted(data) {
        this.addLog('⚡ PREPARATION PHASE STARTED - 5 SECONDS TO EXECUTION!', 'success');
        this.showSuccess('🚨 PREPARATION STARTED!\nDummy transactions submitting...\nExecution in 5 seconds!');
        
        document.getElementById('botMode').textContent = 'PREPARING';
        document.getElementById('botMode').style.color = '#9c27b0';
    }

    handleExecutionComplete(data) {
        const claimButton = document.getElementById('claimButton');
        this.botIsRunning = false;
        claimButton.classList.remove('loading');
        claimButton.textContent = '⚡ EXECUTE COMPETITIVE CLAIM';
        
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
        
        if (data.success) {
            this.addLog(`🏆 COMPETITIVE EXECUTION COMPLETED IN ${data.executionTime}MS!`, 'success');
            this.addLog(`🎯 Claim Hash: ${data.claimHash}`, 'success');
            this.addLog(`💸 Transfer Hash: ${data.transferHash}`, 'success');
            this.addLog(`💰 Fee Used: ${data.fee} stroops`, 'info');
            
            this.showSuccess(`🏆 COMPETITION WON!\nExecution time: ${data.executionTime}ms\nAmount transferred: ${data.amount} PI`);
            
            document.getElementById('botMode').textContent = 'SUCCESS';
            document.getElementById('botMode').style.color = '#4caf50';
            
            // Clear form
            document.getElementById('withdrawalAddress').value = '';
            document.getElementById('withdrawAmount').value = '';
            document.getElementById('lockedBalance').value = '';
            
            // Refresh data after success
            setTimeout(() => {
                this.refreshBalance();
                this.refreshLockedBalances();
                this.refreshTransactions();
            }, 3000);
            
        } else {
            this.addLog(`💥 Competitive execution failed: ${data.error}`, 'error');
            this.showError(`🚫 EXECUTION FAILED\n${data.error}`);
            
            document.getElementById('botMode').textContent = 'FAILED';
            document.getElementById('botMode').style.color = '#f44336';
        }
    }

    async startMonitoring() {
        try {
            const response = await fetch('/api/bot/monitoring/start', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.addLog('🚨 ULTIMATE MONITORING ACTIVATED - COMPETITIVE MODE ENGAGED', 'success');
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
        logContainer.innerHTML = `
            <div class="log-entry info">
                <span class="timestamp">[${new Date().toISOString().replace('T', ' ').substring(0, 19)}]</span>
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
        
        if (data.status) {
            document.getElementById('botMode').textContent = data.status;
            document.getElementById('botMode').style.color = this.getStatusColor(data.status);
        }
        
        const threatElement = document.getElementById('threatLevel');
        if (data.threatLevel) {
            threatElement.textContent = data.threatLevel;
            threatElement.style.color = this.getThreatColor(data.threatLevel);
        }
    }

    getStatusColor(status) {
        const colors = {
            'READY': '#4caf50',
            'WAITING': '#ff9800',
            'PREPARING': '#9c27b0',
            'EXECUTING': '#f44336',
            'SUCCESS': '#4caf50',
            'FAILED': '#f44336',
            'STOPPED': '#666666'
        };
        return colors[status] || '#ffd700';
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
        notification.innerHTML = message.replace(/\n/g, '<br>');
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 7000);
    }

    showSuccess(message) {
        this.addLog('✅ ' + message.replace(/\n/g, ' '), 'success');
        
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.innerHTML = message.replace(/\n/g, '<br>');
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 8000);
    }
}

// Add notification styles
const notificationStyles = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    font-weight: bold;
    max-width: 400px;
    z-index: 10000;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    font-size: 14px;
    line-height: 1.4;
}

.notification.error {
    background: linear-gradient(45deg, #f44336, #ff5722);
    color: white;
}

.notification.success {
    background: linear-gradient(45deg, #4caf50, #8bc34a);
    color: white;
}
`;

// Inject notification styles
if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = notificationStyles;
    document.head.appendChild(style);
}

// Initialize the Ultimate Pi Bot UI
document.addEventListener('DOMContentLoaded', () => {
    new UltimatePiBotUI();
});