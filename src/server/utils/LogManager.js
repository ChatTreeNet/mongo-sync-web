const fs = require('fs').promises;
const path = require('path');

class LogManager {
  constructor() {
    this.logsPath = path.join(__dirname, '../../config/sync-logs.json');
    this.logs = [];
  }

  async ensureLogsDir() {
    const logsDir = path.dirname(this.logsPath);
    try {
      await fs.access(logsDir);
    } catch {
      await fs.mkdir(logsDir, { recursive: true });
    }
  }

  async load() {
    try {
      await this.ensureLogsDir();
      const data = await fs.readFile(this.logsPath, 'utf8');
      this.logs = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logs = [];
      } else {
        throw error;
      }
    }
    return this.logs;
  }

  async save() {
    await this.ensureLogsDir();
    await fs.writeFile(this.logsPath, JSON.stringify(this.logs, null, 2));
  }

  async addLog(type, message, details = {}) {
    await this.load();
    const log = {
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    };
    this.logs.unshift(log); // Add to beginning of array

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(0, 1000);
    }

    await this.save();
    return log;
  }

  async getLogs(limit = 100) {
    await this.load();
    return this.logs.slice(0, limit);
  }

  async clearLogs() {
    this.logs = [];
    await this.save();
  }
}

module.exports = new LogManager();
