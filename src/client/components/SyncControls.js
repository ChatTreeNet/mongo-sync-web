import React from 'react';

const SyncControls = ({ onSave, onSync, isSaving, isSyncing }) => {
  return (
    <div className="button-group">
      <button 
        type="submit" 
        className="submit-btn"
        disabled={isSaving}
        onClick={onSave}
      >
        {isSaving ? 'Saving...' : 'Save Configuration'}
      </button>
      <button
        type="button"
        className={`sync-btn ${isSyncing ? 'syncing' : ''}`}
        onClick={onSync}
        disabled={isSyncing}
      >
        {isSyncing ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  );
};

export default SyncControls;
