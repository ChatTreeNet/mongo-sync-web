const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.configPath = path.join(__dirname, '../../config/sync-config.json');
    this.config = null;
  }

  async init() {
    if (!this.config) {
      try {
        await this.ensureConfigDir();
        await this.load();
      } catch (error) {
        console.error('Error initializing config:', error);
        throw error;
      }
    }
    return this.config;
  }

  async ensureConfigDir() {
    const configDir = path.dirname(this.configPath);
    try {
      // Check if directory exists
      try {
        const dirStats = await fs.stat(configDir);
        if (!dirStats.isDirectory()) {
          throw new Error(`${configDir} exists but is not a directory`);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('Creating config directory:', configDir);
          await fs.mkdir(configDir, { recursive: true, mode: 0o755 });
        } else {
          throw error;
        }
      }

      // Verify directory permissions
      try {
        await fs.access(configDir, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        console.error('Directory permission error:', error);
        // Try to fix permissions
        await fs.chmod(configDir, 0o755);
      }

      // Ensure config file exists with proper permissions
      try {
        const fileStats = await fs.stat(this.configPath);
        if (!fileStats.isFile()) {
          throw new Error(`${this.configPath} exists but is not a file`);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log('Creating initial config file:', this.configPath);
          await fs.writeFile(this.configPath, '{}', { mode: 0o644 });
        } else {
          throw error;
        }
      }

      // Verify file permissions
      try {
        await fs.access(this.configPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error) {
        console.error('File permission error:', error);
        // Try to fix permissions
        await fs.chmod(this.configPath, 0o644);
      }

      console.log('Config directory and file are ready');
    } catch (error) {
      console.error('Error ensuring config directory/file:', error);
      throw new Error(`Failed to setup config directory/file: ${error.message}`);
    }
  }

  async load() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      
      try {
        this.config = JSON.parse(data);
      } catch (parseError) {
        console.error('Error parsing config file:', parseError);
        // Backup corrupted file
        const backupPath = `${this.configPath}.${Date.now()}.bak`;
        await fs.copyFile(this.configPath, backupPath);
        console.log(`Backed up corrupted config to ${backupPath}`);
        
        // Reset to default config
        this.config = this.getDefaultConfig();
        await this.save(this.config);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.config = this.getDefaultConfig();
        await this.save(this.config);
      } else {
        throw error;
      }
    }
    return this.config;
  }

  getDefaultConfig() {
    return {
      sourceUrl: '',
      targetUrl: '',
      collections: '',
      schedule: '0 0 * * *',
      timeWindow: {
        start: '00:00',
        end: '06:00'
      },
      isActive: true,
      lastSync: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async save(config) {
    try {
      console.log('Saving config:', config);
      await this.ensureConfigDir();
      
      // Validate config object
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid config object');
      }

      // Prepare config object with required fields
      const configToSave = {
        ...this.config, // Use current in-memory config as base
        ...config,      // Override with new values
        isActive: true,
        updatedAt: new Date().toISOString(),
        createdAt: (this.config && this.config.createdAt) || new Date().toISOString()
      };

      // Validate required fields
      const requiredFields = ['sourceUrl', 'targetUrl', 'collections', 'schedule', 'timeWindow'];
      for (const field of requiredFields) {
        if (!configToSave[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      console.log('Config to save:', configToSave);
      console.log('Config path:', this.configPath);
      
      // Write to a temporary file first
      const tempPath = path.join(os.tmpdir(), `sync-config-${Date.now()}.json.tmp`);
      const configJson = JSON.stringify(configToSave, null, 2);
      
      try {
        // Write to temp file
        await fs.writeFile(tempPath, configJson, { 
          encoding: 'utf8', 
          mode: 0o644,
          flag: 'w'
        });
        
        // Verify the temp file was written correctly
        const written = await fs.readFile(tempPath, 'utf8');
        if (written !== configJson) {
          throw new Error('Config file verification failed');
        }
        
        // Backup existing config if it exists
        try {
          await fs.access(this.configPath);
          const backupPath = `${this.configPath}.${Date.now()}.bak`;
          await fs.copyFile(this.configPath, backupPath);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
        
        // Atomically replace the old file with the new one
        await fs.rename(tempPath, this.configPath);
        
        // Update in-memory config
        this.config = configToSave;
        console.log('Config saved successfully');
        return this.config;
      } catch (error) {
        // Clean up temp file if it exists
        try {
          await fs.unlink(tempPath);
        } catch (e) {
          // Ignore error if temp file doesn't exist
        }
        throw error;
      }
    } catch (error) {
      console.error('Error saving config:', error);
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }

  async updateLastSync(date = new Date()) {
    if (this.config) {
      this.config.lastSync = date.toISOString();
      await this.save(this.config);
    }
  }

  async updateError(error) {
    if (this.config) {
      this.config.error = error;
      await this.save(this.config);
    }
  }

  getConfig() {
    return this.config;
  }
}

module.exports = new ConfigManager();
