import React from 'react';
import { useTranslation } from 'react-i18next';

const SyncStatus = ({ status }) => {
  const { t } = useTranslation();

  return (
    <div className="status-panel">
      <h2>{t('sync.status.title')}</h2>
      <div className="status-info">
        <p>
          {t('sync.status.label')}: 
          <span className={status.isRunning ? 'running' : 'stopped'}>
            {t(status.isRunning ? 'sync.status.running' : 'sync.status.stopped')}
          </span>
        </p>
        
        {status.lastSync && (
          <p>
            {t('sync.status.lastSync')}: 
            <span className="last-sync">
              {new Date(status.lastSync).toLocaleString()}
            </span>
          </p>
        )}
        
        {status.error && (
          <div className="error-container">
            <p className="error">{t('sync.status.error')}: {status.error}</p>
            {status.errorDetails && (
              <div className="error-details">
                <div className="error-details-header">
                  {t('sync.status.errorDetails')}:
                </div>
                <pre>{JSON.stringify(status.errorDetails, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
        
        {status.progress && (
          <div className="sync-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${status.progress}%` }}
              />
            </div>
            <span className="progress-text">
              {status.progress}% {t('sync.status.progress.complete')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncStatus;
