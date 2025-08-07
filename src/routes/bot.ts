import { Router } from 'express';
import { PiNetworkBot } from '../bot/PiNetworkBot';

export function botRouter(bot: PiNetworkBot) {
  const router = Router();

  // Get bot status
  router.get('/status', (req, res) => {
    res.json(bot.getStatus());
  });

  // Get bot configuration
  router.get('/config', (req, res) => {
    const config = bot.getConfig();
    if (config) {
      // Don't send sensitive data
      const safeConfig = {
        receiverAddress: config.receiverAddress,
        unlockTime: config.unlockTime,
        amountToWithdraw: config.amountToWithdraw,
        useTestnet: config.useTestnet,
        maxRetries: config.maxRetries,
        retryDelay: config.retryDelay
      };
      res.json(safeConfig);
    } else {
      res.status(404).json({ error: 'Bot not configured' });
    }
  });

  // Initialize bot
  router.post('/initialize', async (req, res) => {
    try {
      const {
        mnemonic,
        receiverAddress,
        unlockTime,
        amountToWithdraw = 10,
        useTestnet = false,
        maxRetries = 3,
        retryDelay = 5000
      } = req.body;

      if (!mnemonic || !receiverAddress || !unlockTime) {
        return res.status(400).json({ 
          error: 'Missing required fields: mnemonic, receiverAddress, unlockTime' 
        });
      }

      await bot.initialize({
        mnemonic,
        receiverAddress,
        unlockTime: new Date(unlockTime),
        amountToWithdraw,
        useTestnet,
        maxRetries,
        retryDelay
      });

      res.json({ message: 'Bot initialized successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start bot
  router.post('/start', async (req, res) => {
    try {
      await bot.start();
      res.json({ message: 'Bot started successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stop bot
  router.post('/stop', async (req, res) => {
    try {
      await bot.stop();
      res.json({ message: 'Bot stopped successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}