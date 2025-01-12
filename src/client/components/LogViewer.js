import React, { useState } from 'react';

const LogViewer = ({ logs, onClearLogs }) => {
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
        <h2>Sync Logs</h2>
        <button 
          className="clear-logs-btn"
          onClick={() => {
            if (window.confirm('Are you sure you want to clear all logs?')) {
              onClearLogs();
            }
          }}
        >
          Clear Logs
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
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </div>
                  <div className="sync-stats">
                    <span className="sync-stat">
                      <span className="stat-label">Collections:</span>
                      <span className="stat-value">
                        {Array.from(stats.collections).filter(c => c).join(', ') || 
                         (group.find(log => log.details?.collections)?.details?.collections || '').split(',').filter(c => c.trim()).join(', ') || 
                         (status === 'pending' ? '同步中...' : '无')}
                      </span>
                    </span>
                    <span className="sync-stat">
                      <span className="stat-label">Success:</span>
                      <span className="stat-value success">{stats.success}</span>
                    </span>
                    <span className="sync-stat">
                      <span className="stat-label">Errors:</span>
                      <span className="stat-value error">{stats.errors}</span>
                    </span>
                    <span className="sync-stat">
                      <span className="stat-label">Duration:</span>
                      <span className="stat-value">{duration}s</span>
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
                                  查看详细错误信息 ▼
                                </div>
                                <pre className="error-details-content" style={{display: 'none'}}>
                                  {log.details.error && `错误信息: ${log.details.error}\n`}
                                  {log.details.code && `错误代码: ${log.details.code}\n`}
                                  {log.details.details && `详细信息: ${JSON.stringify(log.details.details, null, 2)}`}
                                </pre>
                              </div>
                            )}
                          </>
                        ) : log.message === 'All collections synced successfully' ? (
                          <div className="sync-stats">
                            <div className="sync-stats-header">
                              {log.message}
                            </div>
                            <div className="sync-stats-content">
                              <div className="sync-stats-total">
                                <strong>总计：</strong>
                                {log.details.totalStats && (
                                  <span>
                                    总文档数: {log.details.totalStats.total}, 
                                    处理: {log.details.totalStats.processed}, 
                                    新增: {log.details.totalStats.inserted}, 
                                    更新: {log.details.totalStats.updated}
                                  </span>
                                )}
                              </div>
                              {log.details.collectionStats && Object.entries(log.details.collectionStats).map(([collection, stats]) => (
                                <div key={collection} className="collection-stats">
                                  <strong>{collection}：</strong>
                                  <span>
                                    总文档数: {stats.total}, 
                                    处理: {stats.processed}, 
                                    新增: {stats.inserted}, 
                                    更新: {stats.updated}
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
          <p className="no-logs">No logs available</p>
        )}
      </div>
    </div>
  );
};

export default LogViewer;
