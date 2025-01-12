const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { initializeSync } = require('./sync');
const configRoutes = require('./routes/config');
const logManager = require('./utils/LogManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  noServer: true,  // Handle upgrade manually
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws/logs') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket clients
const clients = new Set();

// Broadcast log to all connected clients
const broadcastLog = (log) => {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(log));
    }
  });
};

// Override LogManager's addLog method to broadcast logs
const originalAddLog = logManager.addLog;
logManager.addLog = async function (type, message, details) {
  const log = {
    type,
    message,
    details,
    timestamp: new Date().toISOString()
  };
  broadcastLog(log);
  return originalAddLog.call(this, type, message, details);
};

// WebSocket connection handling
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('WebSocket client connected');

  // Send initial connection success message
  ws.send(JSON.stringify({
    type: 'info',
    message: 'Connected to sync service',
    timestamp: new Date().toISOString()
  }));

  // Handle ping/pong to keep connection alive
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('close', () => {
    clients.delete(ws);
    ws.isAlive = false;
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
    ws.isAlive = false;
    try {
      ws.terminate();
    } catch (e) {
      console.error('Error terminating WebSocket:', e);
    }
  });
});

// Heartbeat to check connection status
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      clients.delete(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      console.error('Error sending ping:', e);
      clients.delete(ws);
      ws.terminate();
    }
  });
}, 30000);

// Clean up interval on server close
wss.on('close', () => {
  clearInterval(interval);
});

// Express middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// API routes
app.use('/api/config', configRoutes);

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Initialize sync service
initializeSync().catch(console.error);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
