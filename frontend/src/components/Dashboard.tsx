import React, { useState, useEffect } from 'react';
import axios from 'axios';
import BotStatusCard from './BotStatusCard';
import QuickActions from './QuickActions';
import ConfigPreview from './ConfigPreview';

interface Props {
  botStatus: any;
  socket: any;
}

const Dashboard: React.FC<Props> = ({ botStatus, socket }) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/bot/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const startBot = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/bot/start', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error: any) {
      alert('Failed to start bot: ' + error.response?.data?.error);
    }
  };

  const stopBot = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/bot/stop', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error: any) {
      alert('Failed to stop bot: ' + error.response?.data?.error);
    }
  };

  if (loading) {
    return (
      <div className="dashboard loading">
        <div className="spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <div className="status-indicator">
          <span className={`status-dot ${botStatus?.isRunning ? 'running' : 'stopped'}`}></span>
          Bot is {botStatus?.isRunning ? 'Running' : 'Stopped'}
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="grid-item">
          <BotStatusCard botStatus={botStatus} />
        </div>
        
        <div className="grid-item">
          <QuickActions 
            isRunning={botStatus?.isRunning}
            onStart={startBot}
            onStop={stopBot}
          />
        </div>

        <div className="grid-item">
          <ConfigPreview config={config} />
        </div>

        <div className="grid-item">
          <div className="card">
            <h3>Recent Activity</h3>
            <div className="activity-log">
              {botStatus?.errors?.slice(0, 5).map((error: string, index: number) => (
                <div key={index} className="activity-item error">
                  {error}
                </div>
              )) || <div className="no-activity">No recent activity</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;