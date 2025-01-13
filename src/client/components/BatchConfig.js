import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const BatchConfig = ({ config, onConfigChange }) => {
  const { t } = useTranslation();

  // Local state for input values
  const [localConfig, setLocalConfig] = useState({
    batchSize: config.batchSize || 5000,
    chunkSize: config.chunkSize || 1000,
    batchDelay: config.batchDelay || 10
  });

  // Update local state when parent config changes
  useEffect(() => {
    setLocalConfig({
      batchSize: config.batchSize || 5000,
      chunkSize: config.chunkSize || 1000,
      batchDelay: config.batchDelay || 10
    });
  }, [config.batchSize, config.chunkSize, config.batchDelay]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      setLocalConfig(prev => ({
        ...prev,
        [name]: numValue
      }));
    }
  };

  const handleInputBlur = (e) => {
    const { name, value } = e.target;
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue !== config[name]) {
      onConfigChange({ [name]: numValue });
    }
  };

  return (
    <div className="batch-config">
      <h2>{t('batch.title')}</h2>

      <div className="form-group">
        <label>{t('batch.batchSize')}:</label>
        <div className="input-group">
          <input
            type="number"
            name="batchSize"
            value={localConfig.batchSize}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            min="1000"
            max="10000"
            required
          />
          <small className="helper-text">
            {t('batch.batchSizeHelp')}
          </small>
        </div>
      </div>

      <div className="form-group">
        <label>{t('batch.chunkSize')}:</label>
        <div className="input-group">
          <input
            type="number"
            name="chunkSize"
            value={localConfig.chunkSize}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            min="100"
            max="5000"
            required
          />
          <small className="helper-text">
            {t('batch.chunkSizeHelp')}
          </small>
        </div>
      </div>

      <div className="form-group">
        <label>{t('batch.batchDelay')}:</label>
        <div className="input-group">
          <input
            type="number"
            name="batchDelay"
            value={localConfig.batchDelay}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            min="0"
            max="1000"
            required
          />
          <small className="helper-text">
            {t('batch.batchDelayHelp')}
          </small>
        </div>
      </div>
    </div>
  );
};

export default BatchConfig;
