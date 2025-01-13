import React from 'react';
import { useTranslation } from 'react-i18next';

const SyncControls = ({ onSave, onSync, isSaving, isSyncing }) => {
  const { t } = useTranslation();

  return (
    <div className="button-group">
      <button
        type="submit"
        className="submit-btn"
        disabled={isSaving}
        onClick={onSave}
      >
        {isSaving ? t('sync.controls.saving') : t('sync.controls.save')}
      </button>
      <button
        type="button"
        className={`sync-btn ${isSyncing ? 'syncing' : ''}`}
        onClick={onSync}
      >
        {isSyncing ? t('sync.controls.syncing') : t('sync.controls.syncNow')}
      </button>
    </div>
  );
};

export default SyncControls;
