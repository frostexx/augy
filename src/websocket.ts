import { Server as SocketServer } from 'socket.io';
import { PiNetworkBot } from './bot/PiNetworkBot';

export function initializeWebSocket(io: SocketServer, bot: PiNetworkBot) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current bot status on connection
    socket.emit('bot-status', bot.getStatus());

    // Handle client requests
    socket.on('get-status', () => {
      socket.emit('bot-status', bot.getStatus());
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}