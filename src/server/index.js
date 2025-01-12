const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeSync } = require('./sync');
const configManager = require('./utils/ConfigManager');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5002;

// 中间件
app.use(cors());

// Body parsing middleware
app.use(express.json({
  limit: '10mb',
  strict: true,
  verify: (req, res, buf) => {
    try {
      if (buf.length) {
        JSON.parse(buf);
      }
    } catch (e) {
      console.error('Invalid JSON:', e, buf.toString());
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.headers['content-type']) {
    console.log('Content-Type:', req.headers['content-type']);
  }
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  
  // Capture response
  const oldSend = res.send;
  res.send = function(data) {
    console.log('Response:', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    oldSend.apply(res, arguments);
  };
  
  next();
});

// Static files
app.use(express.static(path.join(__dirname, '../../dist')));

// Routes
app.use('/api/config', require('./routes/config'));

// Frontend route handling
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    headers: req.headers
  });
  res.status(500).json({ error: err.message });
});

// Server startup
async function startServer() {
  try {
    // Initialize config and sync service
    await configManager.init();
    await initializeSync();

    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log('Server configuration:', {
        port: PORT,
        env: process.env.NODE_ENV,
        staticPath: path.join(__dirname, '../../dist')
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (global.syncService) {
    await global.syncService.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  if (global.syncService) {
    await global.syncService.stop();
  }
  process.exit(0);
});

startServer();
