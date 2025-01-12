import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const LogViewer = ({ logs, onClearLogs }) => {
  const { t } = useTranslation();
  const [expandedSyncs, setExpandedSyncs] = useState(new Set());

  // Group logs by sync operation
  const groupedLogs = React.useMemo(() => {
    const groups = [];
    let currentGroup = [];
    
    for (const log of logs) {
      if (log.message === "Starting manual sync" || log.message === "Starting scheduled sync") {
        if (currentGroup.length > 0) {
          groups.push([...currentGroup]);
        }
        currentGroup = [log];
      } else {
        currentGroup.push(log);
        if (log.message === "Manual sync completed successfully" || 
            log.message === "All collections synced successfully" || 
            log.message === "Sync service stopped") {
          groups.push([...currentGroup]);
          currentGroup = [];
        }
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }, [logs]);

  const toggleExpand = (index) => {
    setExpandedSyncs(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="logs-panel">
      <div className="logs-header">
        <h2>{t('logs.title')}</h2>
        <button 
          className="clear-logs-btn"
          onClick={() => {
            if (window.confirm(t('logs.clearConfirm'))) {
              onClearLogs();
            }
          }}
        >
          {t('logs.clear')}
        </button>
      </div>
      
      <div className="logs-container">
        {groupedLogs.map((group, groupIndex) => {
          const startTime = new Date(group[0]?.timestamp);
          const endLog = group[group.length - 1];
          const endTime = new Date(endLog?.timestamp);
          const duration = Math.round((endTime - startTime) / 1000); // duration in seconds
          
          // Count operations by type
          const stats = group.reduce((acc, log) => {
            if (log.type === 'success') acc.success++;
            if (log.type === 'error') acc.errors++;
            if (log.message.includes('Starting sync for collection:')) {
              const collection = log.message.split(':')[1].trim();
              acc.collections.add(collection);
            }
            if (log.message === 'Starting manual sync' || log.message === 'Starting scheduled sync') {
              const collections = log.details?.collections?.split(',') || [];
              collections.forEach(c => acc.collections.add(c.trim()));
            }
            return acc;
          }, { success: 0, errors: 0, collections: new Set() });

          const hasError = stats.errors > 0;
          const status = hasError ? 'error' : (endLog?.type === 'success' ? 'success' : 'pending');
          
          return (
            <div key={groupIndex} className={`sync-group ${status}`}>
              <div 
                className="sync-summary" 
                onClick={() => toggleExpand(groupIndex)}
              >
                <div className="sync-header">
                  <div className="sync-main-info">
                    <span className="sync-time">{startTime.toLocaleString()}</span>
                    <span className={`sync-status ${status}`}>
                      {t(`logs.sync.status.${status}`)}
                    </span>
                  </div>
                  <div className="sync-stats">
                    <span className="sync-stat">
                      <span className="stat-label">{t('logs.stats.collections')}:</span>
                      <span className="stat-value">
                        {Array.from(stats.collections).filter(c => c).join(', ') || 
                         (group.find(log => log.details?.collections)?.details?.collections || '').split(',').filter(c => c.trim()).join(', ') || 
                         (status === 'pending' ? t('logs.stats.syncing') : t('logs.stats.none'))}
                      </span>
                    </span>
                    <span className="sync-stat">
                      <span className="stat-label">{t('logs.stats.success')}:</span>
                      <span className="stat-value success">{stats.success}</span>
                    </span>
                    <span className="sync-stat">
                      <span className="stat-label">{t('logs.stats.errors')}:</span>
                      <span className="stat-value error">{stats.errors}</span>
                    </span>
                    <span className="sync-stat">
                      <span className="stat-label">{t('logs.stats.duration')}:</span>
                      <span className="stat-value">{duration}{t('logs.stats.seconds')}</span>
                    </span>
                  </div>
                </div>
                <span className="expand-icon">
                  {expandedSyncs.has(groupIndex) ? '▼' : '▶'}
                </span>
              </div>
              
              {expandedSyncs.has(groupIndex) && (
                <div className="sync-details">
                  {group.map((log, logIndex) => (
                    <div key={logIndex} className={`log-entry ${log.type}`}>
                      <span className="log-time">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                      <span className="log-type">{log.type}</span>
                      <span className="log-message">
                        {log.type === 'error' ? (
                          <>
                            <span className="error-message">{log.message}</span>
                            {log.details && (
                              <div className="error-details">
                                <div className="error-details-header" onClick={(e) => {
                                  e.stopPropagation();
                                  const details = e.currentTarget.nextElementSibling;
                                  details.style.display = details.style.display === 'none' ? 'block' : 'none';
                                }}>
                                  {t('logs.error.details')} ▼
                                </div>
                                <pre className="error-details-content" style={{display: 'none'}}>
                                  {log.details.error && `${t('logs.error.message')}: ${log.details.error}\n`}
                                  {log.details.code && `${t('logs.error.code')}: ${log.details.code}\n`}
                                  {log.details.details && `${t('logs.error.info')}: ${JSON.stringify(log.details.details, null, 2)}`}
                                </pre>
                              </div>
                            )}
                          </>
                        ) : log.message === 'All collections synced successfully' ? (
                          <div className="sync-stats">
                            <div className="sync-stats-header">
                              {t('logs.sync.complete')}
                            </div>
                            <div className="sync-stats-content">
                              <div className="sync-stats-total">
                                <strong>{t('logs.stats.total')}：</strong>
                                {log.details.totalStats && (
                                  <span>
                                    {t('logs.stats.documents')}: {log.details.totalStats.total}, 
                                    {t('logs.stats.processed')}: {log.details.totalStats.processed}, 
                                    {t('logs.stats.inserted')}: {log.details.totalStats.inserted}, 
                                    {t('logs.stats.updated')}: {log.details.totalStats.updated}
                                  </span>
                                )}
                              </div>
                              {log.details.collectionStats && Object.entries(log.details.collectionStats).map(([collection, stats]) => (
                                <div key={collection} className="collection-stats">
                                  <strong>{collection}：</strong>
                                  <span>
                                    {t('logs.stats.documents')}: {stats.total}, 
                                    {t('logs.stats.processed')}: {stats.processed}, 
                                    {t('logs.stats.inserted')}: {stats.inserted}, 
                                    {t('logs.stats.updated')}: {stats.updated}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          log.message
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {groupedLogs.length === 0 && (
          <p className="no-logs">{t('logs.empty')}</p>
        )}
      </div>
    </div>
  );
};

export default LogViewer;
