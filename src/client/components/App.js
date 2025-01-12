import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DatabaseConfig from './DatabaseConfig';
import CollectionSelector from './CollectionSelector';
import ScheduleConfig from './ScheduleConfig';
import TimeWindowConfig from './TimeWindowConfig';
import SyncStatus from './SyncStatus';
import LogViewer from './LogViewer';
import SyncControls from './SyncControls';
import LanguageSwitcher from './LanguageSwitcher';
import * as api from '../utils/apiUtils';
import '../i18n';
import '../styles/main.css';

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
  const [isSaving, setIsSaving] = useState(false);
  const [availableCollections, setAvailableCollections] = useState([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState([]);

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
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };

    fetchInitialData();

    // Refresh status and logs periodically
    const interval = setInterval(async () => {
      try {
        const [statusData, logsData] = await Promise.all([
          api.fetchStatus(),
          api.fetchLogs()
        ]);
        setStatus(statusData);
        setLogs(logsData);
      } catch (error) {
        console.error('Error refreshing data:', error);
      }
    }, 10000);

    return () => clearInterval(interval);
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

  const handleSync = async () => {
    if (isSyncing) return;

    try {
      setIsSyncing(true);
      await api.triggerSync();
      const [statusData, logsData] = await Promise.all([
        api.fetchStatus(),
        api.fetchLogs()
      ]);
      setStatus(statusData);
      setLogs(logsData);
    } catch (error) {
      alert(t('sync.error.start') + ': ' + error.message);
    } finally {
      setIsSyncing(false);
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

        <SyncControls
          onSave={handleSave}
          onSync={handleSync}
          isSaving={isSaving}
          isSyncing={isSyncing}
        />
      </form>

      <LogViewer
        logs={logs}
        onClearLogs={handleClearLogs}
      />
    </div>
  );
}

export default App;
