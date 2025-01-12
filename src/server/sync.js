const mongoose = require('mongoose');
const cron = require('node-cron');
const configManager = require('./utils/ConfigManager');
const logManager = require('./utils/LogManager');

class SyncService {
  constructor() {
    this.sourceDb = null;
    this.targetDb = null;
    this.currentTask = null;
    this.running = false;
    this.config = null;
  }

  isRunning() {
    return this.running;
  }

  async connect(config) {
    try {
      // Connect to source database with detailed error logging
      try {
        console.log('Connecting to source database:', config.sourceUrl);
        const sourceConn = await mongoose.createConnection(config.sourceUrl, {
          serverSelectionTimeoutMS: 30000,
          connectTimeoutMS: 30000,
          socketTimeoutMS: 30000,
          maxPoolSize: 10,
          minPoolSize: 1
        }).asPromise();
        console.log('Source connection established');

        // Get native client and database references
        const sourceClient = sourceConn.getClient();
        const sourceDb = sourceClient.db();
        
        // Test source connection with read preference
        await sourceDb.command({ ping: 1 }, { readPreference: 'secondaryPreferred' });
        console.log('Source database ping successful');
        this.sourceDb = sourceConn;
      } catch (error) {
        console.error('Source connection error:', {
          message: error.message,
          code: error.code,
          codeName: error.codeName,
          errorLabels: error.errorLabels,
          topologyVersion: error.topologyVersion
        });
        throw error;
      }

      // Connect to target database
      try {
        console.log('Connecting to target database:', config.targetUrl);
        const targetConn = await mongoose.createConnection(config.targetUrl, {
          serverSelectionTimeoutMS: 30000,
          connectTimeoutMS: 30000,
          socketTimeoutMS: 30000,
          maxPoolSize: 10,
          minPoolSize: 1
        }).asPromise();

        // Test target connection
        const targetDb = targetConn.getClient().db();
        await targetDb.command({ ping: 1 }, { readPreference: 'secondaryPreferred' });
        console.log('Target database ping successful');
        
        this.targetDb = targetConn;
        await logManager.addLog('info', 'Successfully connected to source and target databases');
      } catch (error) {
        console.error('Target connection error:', {
          message: error.message,
          code: error.code,
          codeName: error.codeName,
          errorLabels: error.errorLabels,
          topologyVersion: error.topologyVersion
        });
        throw error;
      }
    } catch (error) {
      if (this.sourceDb) await this.sourceDb.close();
      if (this.targetDb) await this.targetDb.close();
      
      console.error('Connection error:', error);
      await logManager.addLog('error', 'Failed to connect to databases', { 
        error: error.message,
        code: error.code,
        details: error.errInfo || error.writeErrors || error.result
      });
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.sourceDb) await this.sourceDb.close();
      if (this.targetDb) await this.targetDb.close();
      this.sourceDb = null;
      this.targetDb = null;
    } catch (error) {
      await logManager.addLog('error', 'Error disconnecting from databases', { error: error.message });
    }
  }

  isWithinTimeWindow() {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = this.config.timeWindow.start.split(':').map(Number);
    const [endHour, endMinute] = this.config.timeWindow.end.split(':').map(Number);

    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    return currentTime >= startTime && currentTime <= endTime;
  }

  async syncCollection(collectionName, batchSize = 1000) {
    await logManager.addLog('info', `Starting sync for collection: ${collectionName}`);

    try {
      // Get native MongoDB driver connections
      const sourceClient = this.sourceDb.getClient();
      const targetClient = this.targetDb.getClient();
      
      // Get database references
      const sourceDb = sourceClient.db();
      const targetDb = targetClient.db();

      // Get collection references
      const sourceCollection = sourceDb.collection(collectionName);
      const targetCollection = targetDb.collection(collectionName);

      // Ensure source collection exists and get its stats
      let sourceStats;
      try {
        sourceStats = await sourceDb.command({ collStats: collectionName });
      } catch (err) {
        throw new Error(`Source collection ${collectionName} does not exist or is not accessible: ${err.message}`);
      }

      // Collection will be created automatically when we first write to it
      await logManager.addLog('info', `Using collection: ${collectionName}`);

      let processed = 0;
      let inserted = 0;
      let updated = 0;
      const total = await sourceCollection.countDocuments();

      // 使用批处理来同步数据
      while (processed < total) {
        // 检查是否在允许的时间窗口内
        if (!this.isWithinTimeWindow()) {
          await logManager.addLog('info', 'Outside of sync window, pausing sync');
          return { success: false };
        }

        // 获取源数据库的批次数据
        const batch = await sourceCollection
          .find({})
          .skip(processed)
          .limit(batchSize)
          .toArray();

        if (batch.length === 0) break;

        try {
          // 构建批量写入操作
          const operations = batch.map(doc => ({
            replaceOne: {
              filter: { _id: doc._id },
              replacement: doc,
              upsert: true
            }
          }));

          // 执行批量写入并记录结果
          let retries = 3;
          let result;
          while (retries > 0) {
            try {
              result = await targetCollection.bulkWrite(operations, { 
                ordered: false,
                writeConcern: { w: 1, wtimeout: 30000 },
                readPreference: 'secondaryPreferred'
              });
              break;
            } catch (err) {
              retries--;
              if (retries === 0) throw err;
              console.log(`Retrying bulk write operation, ${retries} attempts remaining`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          inserted += result.upsertedCount || 0;
          updated += result.modifiedCount || 0;
          processed += batch.length;

          // 记录进度
          await logManager.addLog('info', `Processed ${processed}/${total} documents in ${collectionName}`, {
            collection: collectionName,
            processed,
            total,
            inserted,
            updated
          });

          // 验证批次写入
          const batchIds = batch.map(doc => doc._id);
          const verifyCount = await targetCollection.countDocuments({
            _id: { $in: batchIds }
          });

          if (verifyCount !== batch.length) {
            await logManager.addLog('warning', `Batch verification failed for ${collectionName}`, {
              expected: batch.length,
              actual: verifyCount
            });
          }
        } catch (err) {
          // Handle write errors but continue processing
          console.error(`Error in batch write for ${collectionName}:`, err);
          if (err.writeErrors) {
            await logManager.addLog('error', `Write errors in batch for ${collectionName}`, {
              errors: err.writeErrors.map(e => ({
                index: e.index,
                code: e.code,
                message: e.errmsg
              }))
            });
          }
        }

        // 添加延迟以控制负载
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 验证最终同步结果
      const finalSourceCount = await sourceCollection.countDocuments();
      const finalTargetCount = await targetCollection.countDocuments();
      
      const finalStats = { 
        total,
        processed,
        inserted,
        updated,
        sourceCount: finalSourceCount,
        targetCount: finalTargetCount
      };

      if (finalSourceCount !== finalTargetCount) {
        await logManager.addLog('warning', `Count mismatch in ${collectionName}`, {
          source: finalSourceCount,
          target: finalTargetCount,
          difference: Math.abs(finalSourceCount - finalTargetCount)
        });
      }

      // 验证索引
      const sourceIndexes = await sourceCollection.indexes();
      const targetIndexes = await targetCollection.indexes();
      
      if (sourceIndexes.length !== targetIndexes.length) {
        await logManager.addLog('warning', `Index count mismatch in ${collectionName}`, {
          source: sourceIndexes.length,
          target: targetIndexes.length
        });
      }

      await logManager.addLog('success', `Completed sync for collection: ${collectionName}`, { stats: finalStats });
      return { success: true, stats: finalStats };
    } catch (error) {
      console.error(`Error syncing collection ${collectionName}:`, error);
      await logManager.addLog('error', `Error syncing collection ${collectionName}`, { 
        error: error.message,
        stack: error.stack,
        code: error.code,
        details: error.errInfo || error.writeErrors || error.result
      });
      return { success: false, error };
    }
  }

  async performSync() {
    if (!this.config || !this.sourceDb || !this.targetDb) {
      await logManager.addLog('error', 'Sync not properly initialized');
      return;
    }

    const collections = this.config.collections.split(',').map(c => c.trim());
    let success = true;
    const syncStats = {};

    for (const collection of collections) {
      const result = await this.syncCollection(collection);
      if (!result.success) {
        success = false;
        break;
      }
      syncStats[collection] = result.stats;
    }

    if (success) {
      // 更新最后同步时间
      await configManager.updateLastSync(new Date());
      
      // 计算总体统计信息
      const totalStats = Object.values(syncStats).reduce((acc, stats) => ({
        total: acc.total + stats.total,
        processed: acc.processed + stats.processed,
        inserted: acc.inserted + stats.inserted,
        updated: acc.updated + stats.updated
      }), { total: 0, processed: 0, inserted: 0, updated: 0 });

      await logManager.addLog('success', 'All collections synced successfully', { 
        collections: this.config.collections,
        collectionStats: syncStats,
        totalStats
      });
    }
  }

  async updateConfig(config) {
    // Update configuration without restarting connections
    this.config = config;
    
    // Update cron schedule if task exists
    if (this.currentTask) {
      this.currentTask.stop();
      this.currentTask = cron.schedule(config.schedule, async () => {
        if (this.running) {
          await logManager.addLog('info', 'Previous sync still running, skipping');
          return;
        }

        if (!this.isWithinTimeWindow()) {
          await logManager.addLog('info', 'Outside of sync window, skipping');
          return;
        }

        this.running = true;
        try {
          await logManager.addLog('info', 'Starting scheduled sync', { collections: this.config.collections });
          await this.performSync();
        } catch (error) {
          console.error('Error during sync:', error);
          await logManager.addLog('error', 'Error during sync execution', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            details: error.errInfo || error.writeErrors || error.result,
            collections: this.config.collections
          });
        } finally {
          this.running = false;
        }
      });
    }
  }

  async start(config) {
    try {
      this.config = config;
      await this.connect(config);

      // 设置定时任务
      this.currentTask = cron.schedule(config.schedule, async () => {
        if (this.running) {
          await logManager.addLog('info', 'Previous sync still running, skipping');
          return;
        }

        if (!this.isWithinTimeWindow()) {
          await logManager.addLog('info', 'Outside of sync window, skipping');
          return;
        }

        this.running = true;
        try {
          await logManager.addLog('info', 'Starting scheduled sync', { collections: this.config.collections });
          await this.performSync();
        } catch (error) {
          console.error('Error during sync:', error);
          await logManager.addLog('error', 'Error during sync execution', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            details: error.errInfo || error.writeErrors || error.result,
            collections: this.config.collections
          });
        } finally {
          this.running = false;
        }
      });
    } catch (error) {
      await logManager.addLog('error', 'Failed to start sync service', { error: error.message });
      throw error;
    }
  }

  async stop() {
    if (this.currentTask) {
      this.currentTask.stop();
      this.currentTask = null;
    }
    await this.disconnect();
    this.running = false;
    await logManager.addLog('info', 'Sync service stopped', { collections: this.config?.collections });
  }
}

// 全局同步服务实例
let syncService = null;

// 初始化同步服务
async function initializeSync() {
  try {
    const config = await configManager.init();
    if (config && config.sourceUrl && config.targetUrl) {
      syncService = new SyncService();
      await syncService.start(config);
    }
    global.syncService = syncService;
    return syncService;
  } catch (error) {
    console.error('Failed to initialize sync service:', error);
    await configManager.updateError(error.message);
    throw error;
  }
}

// 重启同步服务
async function restartSync(config) {
  try {
    if (!config.sourceUrl || !config.targetUrl) {
      throw new Error('Source and target database URLs are required');
    }
    
    if (syncService) {
      await syncService.stop();
    }
    syncService = new SyncService();
    await syncService.start(config);
    global.syncService = syncService;
    return syncService;
  } catch (error) {
    console.error('Failed to restart sync service:', error);
    await configManager.updateError(error.message);
    throw error;
  }
}

// 手动同步函数
async function manualSync() {
  try {
    const config = await configManager.init();
    if (!config) {
      throw new Error('No configuration found');
    }
    
    if (!config.sourceUrl || !config.targetUrl) {
      throw new Error('Source and target database URLs are required');
    }

    await logManager.addLog('info', 'Starting manual sync', { collections: config.collections });

    if (global.syncService && global.syncService.isRunning()) {
      throw new Error('Sync already in progress');
    }

    const syncService = new SyncService();
    await syncService.start(config);
    await syncService.performSync();
    await syncService.stop();

    await logManager.addLog('success', 'Manual sync completed successfully', { collections: config.collections });
    return { success: true, collections: config.collections };
  } catch (error) {
    await logManager.addLog('error', 'Manual sync failed', { error: error.message, collections: config?.collections });
    throw error;
  }
}

module.exports = {
  initializeSync,
  restartSync,
  manualSync
};
