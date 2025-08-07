import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import io from 'socket.io-client';
import './App.css';

// Components
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import BotConfig from './components/BotConfig';
import BotStatus from './components/BotStatus';
import TransactionHistory from './components/TransactionHistory';

interface User {
  username: string;
  role: string;
  token: string;
}

interface BotStatus {
  isRunning: boolean;
  lastActivity: Date | null;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  currentBalance: number;
  nextUnlockTime: Date | null;
  errors: string[];
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    // Check for existing token
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    
    if (token && username && role) {
      setUser({ username, role, token });
    }
  }, []);

  useEffect(() => {
    if (user) {
      // Initialize WebSocket connection
      const newSocket = io(window.location.origin, {
        auth: {
          token: user.token
        }
      });

      newSocket.on('connect', () => {
        console.log('Connected to server');
      });

      newSocket.on('bot-status', (status: BotStatus) => {
        setBotStatus(status);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user]);

  const handleLogin = (userData: User) => {
    setUser(userData);
    localStorage.setItem('token', userData.token);
    localStorage.setItem('username', userData.username);
    localStorage.setItem('role', userData.role);
  };

  const handleLogout = () => {
    setUser(null);
    setBotStatus(null);
    if (socket) {
      socket.close();
    }
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <div className="nav-brand">
            <h1>🥧 Pi Network Bot</h1>
          </div>
          <div className="nav-items">
            <span>Welcome, {user.username}</span>
            <button onClick={handleLogout} className="btn btn-secondary">
              Logout
            </button>
          </div>
        </nav>

        <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard botStatus={botStatus} socket={socket} />} />
            <Route path="/config" element={<BotConfig socket={socket} />} />
            <Route path="/status" element={<BotStatus botStatus={botStatus} />} />
            <Route path="/transactions" element={<TransactionHistory />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;