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
    this.changeStream = null;
    this.lastSyncTime = null;
    this.collections = new Set();
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
          socketTimeoutMS: 60000,
          maxPoolSize: 50,
          minPoolSize: 5,
          readPreference: 'secondaryPreferred',
          w: 'majority',
          retryWrites: true
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
          socketTimeoutMS: 60000,
          maxPoolSize: 50,
          minPoolSize: 5,
          w: 'majority',
          retryWrites: true
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

  async setupChangeStream(collectionName) {
    // Add collection to tracked collections
    this.collections.add(collectionName);

    // If change stream already exists, no need to create a new one
    if (this.changeStream) {
      await logManager.addLog('info', `Added ${collectionName} to change stream tracking`);
      return;
    }

    const setupStream = async () => {
      try {
        const sourceDb = this.sourceDb.getClient().db();

        // Setup change stream pipeline for all tracked collections
        const pipeline = [
          {
            $match: {
              'ns.coll': { $in: Array.from(this.collections) },
              operationType: { $in: ['insert', 'update', 'replace', 'delete'] }
            }
          }
        ];

        // Start change stream on database level
        this.changeStream = sourceDb.watch(pipeline, {
          fullDocument: 'updateLookup'
        });

        // Handle change stream events
        this.changeStream.on('change', async (change) => {
          try {
            const targetDb = this.targetDb.getClient().db();
            const targetCollection = targetDb.collection(change.ns.coll);

            switch (change.operationType) {
              case 'insert':
              case 'update':
              case 'replace':
                await targetCollection.replaceOne(
                  { _id: change.fullDocument._id },
                  change.fullDocument,
                  { upsert: true }
                );
                break;
              case 'delete':
                await targetCollection.deleteOne({ _id: change.documentKey._id });
                break;
            }

            await logManager.addLog('info', `Processed ${change.operationType} operation via change stream`, {
              collection: change.ns.coll,
              documentId: change.documentKey._id
            });
          } catch (error) {
            await logManager.addLog('error', 'Error processing change stream event', {
              error: error.message,
              change: change
            });
          }
        });

        // Handle errors and reconnection
        this.changeStream.on('error', async (error) => {
          await logManager.addLog('error', 'Change stream error', {
            error: error.message
          });

          // Close the errored stream
          try {
            await this.changeStream.close();
            this.changeStream = null;
          } catch (e) {
            console.error('Error closing change stream:', e);
          }

          // Attempt to reconnect after delay
          setTimeout(async () => {
            try {
              await setupStream();
              await logManager.addLog('info', 'Change stream reconnected');
            } catch (e) {
              await logManager.addLog('error', 'Failed to reconnect change stream', {
                error: e.message
              });
            }
          }, 5000); // 5 second delay before reconnect
        });

        await logManager.addLog('info', 'Change stream setup complete', {
          collections: Array.from(this.collections)
        });
      } catch (error) {
        await logManager.addLog('error', 'Error setting up change stream', {
          error: error.message
        });
        throw error;
      }
    };

    // Initial setup
    await setupStream();
  }

  async syncCollection(collectionName) {
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

      // Ensure target collection exists and copy indexes from source
      try {
        // Get source collection indexes
        const sourceIndexes = await sourceCollection.indexes();

        // Create target collection explicitly
        await targetDb.createCollection(collectionName);
        await logManager.addLog('info', `Created target collection: ${collectionName}`);

        // Create indexes on target collection (excluding _id index which is created automatically)
        const indexPromises = sourceIndexes
          .filter(index => index.name !== '_id_')
          .map(async (index) => {
            const indexSpec = { ...index };
            delete indexSpec.ns; // Remove namespace property
            delete indexSpec.v;  // Remove version property
            return targetCollection.createIndex(indexSpec.key, {
              name: indexSpec.name,
              unique: indexSpec.unique,
              sparse: indexSpec.sparse,
              background: true
            });
          });

        await Promise.all(indexPromises);
        await logManager.addLog('info', `Created indexes for collection: ${collectionName}`);
      } catch (err) {
        // Ignore error if collection already exists
        if (err.code !== 48) { // 48 is the "NamespaceExists" error code
          throw err;
        }
      }

      let processed = 0;
      let inserted = 0;
      let updated = 0;

      // 获取批处理配置
      const batchSize = this.config.batchSize || 5000;
      const chunkSize = this.config.chunkSize || 1000;
      const batchDelay = this.config.batchDelay || 10;

      // 使用增量同步
      let query = {};

      if (this.lastSyncTime) {
        // 获取目标集合中已存在的文档ID
        const existingIds = await targetCollection
          .find({}, { projection: { _id: 1 } })
          .map(doc => doc._id)
          .toArray();

        if (existingIds.length > 0) {
          // 查找上次同步后更新的文档，或者在目标集合中不存在的文档
          query = {
            $or: [
              { _id: { $gt: new mongoose.Types.ObjectId(Math.floor(this.lastSyncTime.getTime() / 1000)) } },
              { updatedAt: { $gt: this.lastSyncTime } },
              { _id: { $nin: existingIds } }
            ]
          };
        }
      }

      // 获取需要同步的总文档数
      const total = await sourceCollection.countDocuments(query);

      // 使用并行批处理来同步数据
      while (processed < total && this.running) {
        if (!this.isWithinTimeWindow()) {
          await logManager.addLog('info', 'Outside of sync window, pausing sync');
          return { success: false };
        }

        // 获取源数据库的批次数据
        const batch = await sourceCollection
          .find(query)
          .sort({ _id: 1 })
          .skip(processed)
          .limit(batchSize)
          .hint({ _id: 1 }) // 使用_id索引优化查询
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

          // 串行执行批量写入
          let result = { upsertedCount: 0, modifiedCount: 0 };
          for (let i = 0; i < operations.length && this.running; i += chunkSize) {
            const chunk = operations.slice(i, i + chunkSize);
            let retries = 3;
            while (retries > 0 && this.running) {
              try {
                const chunkResult = await targetCollection.bulkWrite(chunk, {
                  ordered: true,
                  writeConcern: { w: 'majority', wtimeout: 60000 }
                });
                result.upsertedCount += chunkResult.upsertedCount || 0;
                result.modifiedCount += chunkResult.modifiedCount || 0;
                break;
              } catch (err) {
                retries--;
                if (retries === 0) throw err;
                console.log(`Retrying bulk write operation, ${retries} attempts remaining`);
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
            // 每个chunk之间添加延迟
            await new Promise(resolve => setTimeout(resolve, batchDelay));
          }

          if (!this.running) {
            await logManager.addLog('warning', `Sync operation stopped for collection: ${collectionName}`);
            return { success: false };
          }

          inserted += result.upsertedCount || 0;
          updated += result.modifiedCount || 0;
          processed += batch.length;

          // 记录进度
          const progress = {
            collection: collectionName,
            processed,
            total,
            inserted,
            updated,
            percentage: Math.round((processed / total) * 100)
          };

          await Promise.all([
            logManager.addLog('info', `Processed ${processed}/${total} documents in ${collectionName}`, progress),
            configManager.updateSyncStatus({
              isRunning: true,
              progress
            })
          ]);

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

        // 使用配置的延迟时间
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }

      if (!this.running) {
        await logManager.addLog('warning', `Sync operation stopped for collection: ${collectionName}`);
        return { success: false };
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
      await configManager.updateSyncStatus({
        isRunning: false,
        error: 'Sync not properly initialized'
      });
      return;
    }

    this.running = true;
    await configManager.updateSyncStatus({
      isRunning: true,
      progress: null,
      error: null
    });

    const collections = this.config.collections.split(',').map(c => c.trim());
    let success = true;
    const syncStats = {};

    for (const collection of collections) {
      if (!this.running) {
        await logManager.addLog('warning', 'Sync operation stopped by user');
        success = false;
        break;
      }

      const result = await this.syncCollection(collection);
      if (!result.success) {
        success = false;
        break;
      }
      syncStats[collection] = result.stats;
    }

    if (success) {
      const now = new Date();
      // 更新最后同步时间
      await configManager.updateLastSync(now);

      // 计算总体统计信息
      const totalStats = Object.values(syncStats).reduce((acc, stats) => ({
        total: acc.total + stats.total,
        processed: acc.processed + stats.processed,
        inserted: acc.inserted + stats.inserted,
        updated: acc.updated + stats.updated
      }), { total: 0, processed: 0, inserted: 0, updated: 0 });

      await Promise.all([
        logManager.addLog('success', 'All collections synced successfully', {
          collections: this.config.collections,
          collectionStats: syncStats,
          totalStats
        }),
        configManager.updateSyncStatus({
          isRunning: false,
          lastSync: now.toISOString(),
          progress: null,
          error: null
        })
      ]);
    } else {
      await configManager.updateSyncStatus({
        isRunning: false,
        error: 'Sync failed or stopped'
      });
    }

    this.running = false;
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
        }
      });
    }
  }

  async start(config) {
    try {
      this.config = config;
      await this.connect(config);

      // 获取上次同步时间
      const lastSync = await configManager.getLastSync();
      this.lastSyncTime = lastSync ? new Date(lastSync) : null;

      // 为每个集合设置change stream
      const collections = config.collections.split(',').map(c => c.trim());
      for (const collection of collections) {
        await this.setupChangeStream(collection);
      }

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
    if (this.changeStream) {
      await this.changeStream.close();
      this.changeStream = null;
    }
    this.collections.clear();
    await this.disconnect();
    this.running = false;
    await Promise.all([
      logManager.addLog('info', 'Sync service stopped', { collections: this.config?.collections }),
      configManager.updateSyncStatus({
        isRunning: false,
        progress: null
      })
    ]);
  }

  async stopSync() {
    if (!this.running) {
      return { success: false, message: 'No sync in progress' };
    }

    this.running = false;
    await Promise.all([
      logManager.addLog('warning', 'Sync operation terminated by user'),
      configManager.updateSyncStatus({
        isRunning: false,
        progress: null
      })
    ]);
    return { success: true };
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
  let config;
  try {
    config = await configManager.init();
    if (!config) {
      throw new Error('No configuration found');
    }

    if (!config.sourceUrl || !config.targetUrl) {
      throw new Error('Source and target database URLs are required');
    }

    // 设置默认的批处理配置
    if (!config.batchSize) config.batchSize = 5000;
    if (!config.chunkSize) config.chunkSize = 1000;
    if (!config.batchDelay) config.batchDelay = 10;

    await logManager.addLog('info', 'Starting manual sync', {
      collections: config.collections,
      batchSize: config.batchSize,
      chunkSize: config.chunkSize,
      batchDelay: config.batchDelay
    });

    if (global.syncService && global.syncService.isRunning()) {
      throw new Error('Sync already in progress');
    }

    // 创建新的同步服务实例并设置为全局实例
    syncService = new SyncService();
    global.syncService = syncService;
    await syncService.start(config);

    // 获取上次同步时间
    const lastSync = await configManager.getLastSync();
    syncService.lastSyncTime = lastSync ? new Date(lastSync) : null;

    try {
      await syncService.performSync();
    } finally {
      await syncService.stop();
      syncService = null;
      global.syncService = null;
    }

    await logManager.addLog('success', 'Manual sync completed successfully', {
      collections: config.collections,
      batchSize: config.batchSize,
      chunkSize: config.chunkSize,
      batchDelay: config.batchDelay
    });
    return {
      success: true,
      collections: config.collections,
      batchConfig: {
        batchSize: config.batchSize,
        chunkSize: config.chunkSize,
        batchDelay: config.batchDelay
      }
    };
  } catch (error) {
    let errorLog = {
      error: error.message
    };

    // 只有当config存在时才添加配置相关信息
    if (config) {
      errorLog = {
        ...errorLog,
        collections: config.collections,
        batchConfig: {
          batchSize: config.batchSize,
          chunkSize: config.chunkSize,
          batchDelay: config.batchDelay
        }
      };
    }

    await logManager.addLog('error', 'Manual sync failed', errorLog);
    throw new Error(`Sync failed: ${error.message}`);
  }
}

module.exports = {
  initializeSync,
  restartSync,
  manualSync
};
