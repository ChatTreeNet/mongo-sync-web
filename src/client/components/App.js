import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DatabaseConfig from './DatabaseConfig';
import CollectionSelector from './CollectionSelector';
import ScheduleConfig from './ScheduleConfig';
import TimeWindowConfig from './TimeWindowConfig';
import SyncStatus from './SyncStatus';
import LogViewer from './LogViewer';
import LiveLogViewer from './LiveLogViewer';
import SyncControls from './SyncControls';
import LanguageSwitcher from './LanguageSwitcher';
import BatchConfig from './BatchConfig';
import * as api from '../utils/apiUtils';
import '../i18n';
import '../styles/main.css';
import '../styles/live-log.css';

function App() {
  const { t } = useTranslation();

  const defaultConfig = {
    sourceUrl: '',
    targetUrl: '',
    collections: '',
    schedule: '0 0 * * *', // Default to midnight
    timeWindow: {
      start: '00:00',
      end: '06:00'
    },
    batchSize: 5000,    // 默认批次大小
    chunkSize: 1000,    // 默认分块大小
    batchDelay: 10,     // 默认批次延迟(毫秒)
    isActive: true,
    lastSync: null,
    error: null
  };

  const [config, setConfig] = useState(defaultConfig);
  const [status, setStatus] = useState({
    isRunning: false,
    lastSync: null,
    error: null
  });
  const [logs, setLogs] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [availableCollections, setAvailableCollections] = useState([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [showLiveLogs, setShowLiveLogs] = useState(false);


  // Initial data fetch
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [configData, statusData, logsData] = await Promise.all([
          api.fetchConfig(),
          api.fetchStatus(),
          api.fetchLogs()
        ]);

        setConfig(configData || defaultConfig);
        setStatus(statusData);
        setLogs(logsData);

        // 如果正在同步，显示实时日志
        if (statusData.isRunning) {
          setIsSyncing(true);
          setShowLiveLogs(true);
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };

    fetchInitialData();

    // Refresh status and logs periodically
    const interval = setInterval(async () => {
      try {
        // 分开请求以减少负载
        const statusData = await api.fetchStatus();
        setStatus(statusData);

        // 更新同步状态
        setIsSyncing(statusData.isRunning);
        if (!statusData.isRunning) {
          setIsStopping(false);
        }

        // 只有当状态显示正在运行时才获取日志
        if (statusData.isRunning) {
          const logsData = await api.fetchLogs();
          setLogs(logsData);
        }
      } catch (error) {
        console.error('Error refreshing data:', error);
      }
    }, 2000); // 设置轮询间隔为2秒，平衡实时性和服务器负载

    // 在组件卸载时清理定时器
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  // Fetch collections when URLs change
  useEffect(() => {
    const fetchCollectionsData = async () => {
      if (!config.sourceUrl || !config.targetUrl) return;

      setIsLoadingCollections(true);
      try {
        const data = await api.fetchCollections(config.sourceUrl, config.targetUrl);
        setAvailableCollections(data);

        // Pre-select collections if they were previously configured
        if (config.collections) {
          const previousCollections = config.collections.split(',').map(c => c.trim());
          setSelectedCollections(previousCollections.filter(c =>
            data.sourceCollections.some(col => col.name === c)
          ));
        }
      } catch (error) {
        console.error('Error fetching collections:', error);
        alert(t('database.error.loading') + ': ' + error.message);
        setAvailableCollections([]);
      } finally {
        setIsLoadingCollections(false);
      }
    };

    fetchCollectionsData();
  }, [config.sourceUrl, config.targetUrl, t]);

  const handleConfigChange = (changes) => {
    setConfig(prev => ({
      ...prev,
      ...changes
    }));
  };

  const handleCollectionChange = (collectionName, isSelected) => {
    setSelectedCollections(prev => {
      const newSelected = isSelected
        ? [...prev, collectionName]
        : prev.filter(c => c !== collectionName);

      setConfig(prevConfig => ({
        ...prevConfig,
        collections: newSelected.join(',')
      }));

      return newSelected;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    try {
      setIsSaving(true);

      // Validate configuration
      const errors = api.validateConfig(config);
      if (errors.length > 0) {
        alert(errors.join('\n'));
        return;
      }

      await api.saveConfig(config);
      alert(t('common.save') + ' ' + t('common.success'));

      // Refresh data
      const [configData, statusData] = await Promise.all([
        api.fetchConfig(),
        api.fetchStatus()
      ]);
      setConfig(configData);
      setStatus(statusData);
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert(t('common.error.save') + ': ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchLatestData = async () => {
    try {
      const [statusData, logsData] = await Promise.all([
        api.fetchStatus(),
        api.fetchLogs()
      ]);
      setStatus(statusData);
      setLogs(logsData);
      return statusData;
    } catch (error) {
      console.error('Error fetching latest data:', error);
      return null;
    }
  };

  const handleStopSync = async () => {
    if (!isSyncing) return;

    try {
      setIsStopping(true);
      await api.stopSync();

      // 立即更新状态
      setIsSyncing(false);
      setIsStopping(false);

      // 多次尝试获取最新状态，确保同步已停止
      let retries = 3;
      while (retries > 0) {
        const statusData = await fetchLatestData();
        if (statusData && !statusData.isRunning) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        retries--;
      }
    } catch (error) {
      console.error('Error stopping sync:', error);
      alert(t('sync.error.stop') + ': ' + error.message);
      setIsStopping(false);
    }
  };

  const handleSync = async () => {
    if (isSyncing) {
      setShowLiveLogs(true);
      return;
    }

    try {
      await api.triggerSync();
      setShowLiveLogs(true);
      setIsSyncing(true);
      const [statusData, logsData] = await Promise.all([
        api.fetchStatus(),
        api.fetchLogs()
      ]);
      setStatus(statusData);
      setLogs(logsData);
    } catch (error) {
      const errorKey = error.message.includes('already in progress') ? 'inProgress' :
        error.message.includes('No configuration') ? 'noConfig' :
          error.message.includes('Configuration') ? 'config' : 'start';
      alert(t(`sync.error.${errorKey}`) + ': ' + error.message);
    }
  };

  const handleClearLogs = async () => {
    try {
      await api.clearLogs();
      setLogs([]);
    } catch (error) {
      alert(t('logs.error.clear') + ': ' + error.message);
    }
  };

  const handleCloseLiveLogs = () => {
    setShowLiveLogs(false);
  };

  return (
    <div className="container">
      <LanguageSwitcher />
      <h1>{t('common.settings')}</h1>

      <SyncStatus status={status} />

      <form onSubmit={handleSave} className="config-form">
        <DatabaseConfig
          config={config}
          onConfigChange={handleConfigChange}
        />

        <CollectionSelector
          isLoadingCollections={isLoadingCollections}
          availableCollections={availableCollections}
          selectedCollections={selectedCollections}
          onCollectionChange={handleCollectionChange}
          config={config}
        />

        <ScheduleConfig
          config={config}
          onConfigChange={handleConfigChange}
        />

        <TimeWindowConfig
          config={config}
          onConfigChange={handleConfigChange}
        />

        <BatchConfig
          config={config}
          onConfigChange={handleConfigChange}
        />

        <SyncControls
          onSave={handleSave}
          onSync={handleSync}
          isSaving={isSaving}
          isSyncing={isSyncing}
          isStopping={isStopping}
        />
      </form>

      <LogViewer
        logs={logs}
        onClearLogs={handleClearLogs}
      />

      <LiveLogViewer
        isVisible={showLiveLogs}
        onClose={handleCloseLiveLogs}
        onStopSync={handleStopSync}
        isSyncing={isSyncing}
        isStopping={isStopping}
      />
    </div>
  );
}

export default App;
