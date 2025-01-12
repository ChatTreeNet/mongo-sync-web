const express = require('express');
const router = express.Router();
const configManager = require('../utils/ConfigManager');
const logManager = require('../utils/LogManager');
const { restartSync, manualSync } = require('../sync');
const { MongoClient } = require('mongodb');

// Helper function to connect to MongoDB and list collections
async function getCollections(url) {
  const client = new MongoClient(url);

  try {
    await client.connect();
    const db = client.db();
    const collections = await db.listCollections().toArray();

    // Get document count and last modified time for each collection
    const collectionsWithInfo = await Promise.all(
      collections.map(async col => {
        const collection = db.collection(col.name);
        const count = await collection.countDocuments();
        // Get the most recent document's timestamp
        const latestDoc = await collection
          .find({})
          .sort({ _id: -1 })
          .limit(1)
          .toArray();
        const lastModified = latestDoc[0] ? latestDoc[0]._id.getTimestamp() : null;

        return {
          name: col.name,
          count,
          lastModified
        };
      })
    );

    return collectionsWithInfo;
  } finally {
    await client.close();
  }
}

// 获取数据库集合列表
router.get('/collections', async (req, res) => {
  try {
    const { sourceUrl, targetUrl } = req.query;
    if (!sourceUrl || !targetUrl) {
      return res.status(400).json({ error: 'Source and target URLs are required' });
    }

    const [sourceCollections, targetCollections] = await Promise.all([
      getCollections(sourceUrl),
      getCollections(targetUrl)
    ]);

    // Compare collections and mark those that need sync
    const sourceCollectionsWithStatus = sourceCollections.map(sourceColl => {
      const targetColl = targetCollections.find(tc => tc.name === sourceColl.name);
      const needsSync = !targetColl ||
        targetColl.count !== sourceColl.count ||
        (sourceColl.lastModified && targetColl.lastModified &&
          sourceColl.lastModified > targetColl.lastModified);

      return {
        ...sourceColl,
        targetCount: targetColl?.count || 0,
        needsSync
      };
    });

    // Also include collections that exist only in target
    const uniqueTargetCollections = targetCollections
      .filter(tc => !sourceCollections.some(sc => sc.name === tc.name))
      .map(tc => ({
        name: tc.name,
        count: 0,
        targetCount: tc.count,
        lastModified: null,
        needsSync: false,
        onlyInTarget: true
      }));

    res.json({
      sourceCollections: sourceCollectionsWithStatus,
      targetCollections,
      uniqueTargetCollections
    });
  } catch (error) {
    console.error('[GET /api/config/collections] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取当前配置
router.get('/', async (req, res) => {
  try {
    console.log('[GET /api/config] Fetching current config');
    const config = await configManager.init();
    console.log('[GET /api/config] Current config:', config);
    res.json(config || {});
  } catch (error) {
    console.error('[GET /api/config] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取同步状态
router.get('/status', async (req, res) => {
  try {
    const config = await configManager.init();
    const syncService = global.syncService;
    const status = {
      isRunning: syncService ? syncService.isRunning() : false,
      lastSync: config ? config.lastSync : null,
      error: config ? config.error : null
    };
    res.json(status);
  } catch (error) {
    console.error('[GET /api/config/status] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 保存或更新配置
router.post('/', async (req, res) => {
  console.log('\n=== Config Save Request ===');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));

  try {
    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      console.error('Invalid request body:', req.body);
      return res.status(400).json({
        error: 'Invalid request body',
        received: req.body
      });
    }

    const {
      sourceUrl,
      targetUrl,
      collections,
      schedule = '0 0 * * *',
      timeWindow = { start: '00:00', end: '06:00' }
    } = req.body;

    console.log('Parsed request data:', {
      sourceUrl,
      targetUrl,
      collections,
      schedule,
      timeWindow
    });

    // Validate required fields
    const missingFields = [];
    if (!sourceUrl) missingFields.push('sourceUrl');
    if (!targetUrl) missingFields.push('targetUrl');
    if (!collections) missingFields.push('collections');

    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields
      });
    }

    // Validate MongoDB URLs
    const validateMongoUrl = (url) => {
      // Basic MongoDB URL format validation
      const mongoUrlPattern = /^mongodb:\/\/[^\/]+\/[^\/]+(\?[^\/]*)?$/;
      if (!mongoUrlPattern.test(url)) {
        throw new Error(`Invalid MongoDB URL format: ${url}`);
      }
    };

    try {
      validateMongoUrl(sourceUrl);
      validateMongoUrl(targetUrl);
    } catch (error) {
      console.error('Invalid URL format:', error);
      return res.status(400).json({
        error: 'Invalid database URL format',
        details: error.message
      });
    }

    // Validate collections format
    if (typeof collections !== 'string' || !collections.trim()) {
      console.error('Invalid collections format:', collections);
      return res.status(400).json({
        error: 'Collections must be a non-empty string',
        received: collections
      });
    }

    // 验证时间窗口格式
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeWindow.start || !timeWindow.end ||
      !timeRegex.test(timeWindow.start) || !timeRegex.test(timeWindow.end)) {
      console.error('Invalid time window format:', timeWindow);
      return res.status(400).json({
        error: 'Invalid time format',
        details: 'Time must be in HH:mm format (00:00-23:59)',
        received: timeWindow
      });
    }

    // 验证cron表达式
    const validateCron = (cron) => {
      const parts = cron.split(' ');
      if (parts.length !== 5) return false;

      const patterns = {
        minute: /^(\*|\d+|\d+-\d+|\d+\/\d+|(\d+,)+\d+)$/,
        hour: /^(\*|\d+|\d+-\d+|\d+\/\d+|(\d+,)+\d+)$/,
        dayOfMonth: /^(\*|\d+|\d+-\d+|\d+\/\d+|(\d+,)+\d+|\?)$/,
        month: /^(\*|\d+|\d+-\d+|\d+\/\d+|(\d+,)+\d+)$/,
        dayOfWeek: /^(\*|\d+|\d+-\d+|\d+\/\d+|(\d+,)+\d+|\?)$/
      };

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      return patterns.minute.test(minute) &&
        patterns.hour.test(hour) &&
        patterns.dayOfMonth.test(dayOfMonth) &&
        patterns.month.test(month) &&
        patterns.dayOfWeek.test(dayOfWeek);
    };

    if (!validateCron(schedule)) {
      console.error('Invalid cron expression:', schedule);
      return res.status(400).json({
        error: 'Invalid cron expression',
        details: 'Must be a valid cron expression (e.g., "0 0 * * *" for daily at midnight)',
        received: schedule
      });
    }

    // Prepare config object
    const configToSave = {
      sourceUrl,
      targetUrl,
      collections,
      schedule,
      timeWindow,
      error: null
    };

    console.log('Config to save:', JSON.stringify(configToSave, null, 2));

    try {
      const config = await configManager.save(configToSave);
      console.log('Config saved successfully:', JSON.stringify(config, null, 2));

      // Update sync service config if it exists
      if (global.syncService) {
        await global.syncService.updateConfig(config);
      }

      res.json({
        success: true,
        message: 'Configuration saved successfully',
        config
      });
    } catch (saveError) {
      console.error('Error saving config:', saveError);
      throw new Error(`Failed to save configuration: ${saveError.message}`);
    }

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 获取同步日志
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await logManager.getLogs(limit);
    res.json(logs);
  } catch (error) {
    console.error('[GET /api/config/logs] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 清空日志
router.delete('/logs', async (req, res) => {
  try {
    console.log('[DELETE /api/config/logs] Clearing all logs');
    await logManager.clearLogs();
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    console.error('[DELETE /api/config/logs] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start sync
router.post('/sync', async (req, res) => {
  try {
    console.log('[POST /api/config/sync] Triggering manual sync');
    const result = await manualSync();
    console.log('[POST /api/config/sync] Sync result:', result);
    res.json(result);
  } catch (error) {
    console.error('[POST /api/config/sync] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stop sync
router.post('/sync/stop', async (req, res) => {
  try {
    if (!global.syncService) {
      return res.status(400).json({ error: 'Sync service not initialized' });
    }

    const result = await global.syncService.stopSync();
    res.json(result);
  } catch (error) {
    console.error('Error stopping sync:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
