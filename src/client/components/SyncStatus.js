import React from 'react';

const SyncStatus = ({ status }) => {
  return (
    <div className="status-panel">
      <h2>Sync Status</h2>
      <div className="status-info">
        <p>
          Status: 
          <span className={status.isRunning ? 'running' : 'stopped'}>
            {status.isRunning ? 'Running' : 'Stopped'}
          </span>
        </p>
        
        {status.lastSync && (
          <p>
            Last Sync: 
            <span className="last-sync">
              {new Date(status.lastSync).toLocaleString()}
            </span>
          </p>
        )}
        
        {status.error && (
          <div className="error-container">
            <p className="error">Error: {status.error}</p>
            {status.errorDetails && (
              <div className="error-details">
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
              {status.progress}% Complete
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncStatus;
