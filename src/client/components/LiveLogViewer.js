import React, { useState, useEffect, useRef } from 'react';

const LiveLogViewer = ({ isVisible, onClose, onStopSync, isSyncing, isStopping }) => {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const logContainerRef = useRef(null);

  useEffect(() => {
    // 当窗口打开时清空日志
    if (isVisible) {
      setLogs([]);
      // Create WebSocket connection
      // Connect through webpack dev server proxy
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/logs`);
      wsRef.current = ws;

      // Handle ping from server
      ws.onmessage = (event) => {
        if (event.data === 'ping') {
          ws.send('pong');
          return;
        }

        try {
          const log = JSON.parse(event.data);
          setLogs(prev => [...prev, log]);

          // Auto-scroll to bottom
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        } catch (error) {
          console.error('Error parsing log message:', error);
        }
      };

      ws.onopen = () => {
        setConnected(true);
      };


      ws.onclose = () => {
        setConnected(false);
        setLogs(prev => [...prev, {
          type: 'warning',
          message: 'Disconnected from sync service',
          timestamp: new Date().toISOString()
        }]);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setLogs(prev => [...prev, {
          type: 'error',
          message: 'Connection error',
          timestamp: new Date().toISOString()
        }]);
      };

      return () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }
        // 清理连接状态
        setConnected(false);
      };
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="live-log-overlay">
      <div className="live-log-container">
        <div className="live-log-header">
          <h3>Live Sync Progress</h3>
          <div className="header-controls">
            <div className="connection-status">
              <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`} />
              {connected ? 'Connected' : 'Disconnected'}
            </div>
            <div className="header-buttons">
              {isSyncing && !isStopping && (
                <button
                  className="stop-button"
                  onClick={onStopSync}
                  disabled={isStopping}
                >
                  {isStopping ? 'Stopping...' : 'Stop Sync'}
                </button>
              )}
              <button className="close-button" onClick={onClose}>×</button>
            </div>
          </div>
        </div>

        <div className="live-log-content" ref={logContainerRef}>
          {logs.map((log, index) => (
            <div key={index} className={`log-entry ${log.type}`}>
              <span className="log-time">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="log-type">{log.type}</span>
              <span className="log-message">
                {log.type === 'error' ? (
                  <>
                    <span className="error-message">{log.message}</span>
                    {log.details && (
                      <pre className="error-details">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </>
                ) : log.type === 'success' && log.details?.stats ? (
                  <>
                    <span className="success-message">{log.message}</span>
                    <div className="sync-stats">
                      <div>Total: {log.details.stats.total}</div>
                      <div>Processed: {log.details.stats.processed}</div>
                      <div>Inserted: {log.details.stats.inserted}</div>
                      <div>Updated: {log.details.stats.updated}</div>
                    </div>
                  </>
                ) : (
                  log.message
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveLogViewer;
