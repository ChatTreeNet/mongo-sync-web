import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const DatabaseConfig = ({ config, onConfigChange }) => {
  const { t } = useTranslation();

  // Local state for input values
  const [localConfig, setLocalConfig] = useState({
    sourceUrl: config.sourceUrl,
    targetUrl: config.targetUrl
  });

  // Update local state when parent config changes
  useEffect(() => {
    setLocalConfig({
      sourceUrl: config.sourceUrl,
      targetUrl: config.targetUrl
    });
  }, [config.sourceUrl, config.targetUrl]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLocalConfig(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleInputBlur = (e) => {
    const { name, value } = e.target;
    if (value !== config[name]) {
      onConfigChange({ [name]: value });
    }
  };

  return (
    <div className="database-config">
      <h2>{t('database.title')}</h2>
      
      <div className="form-group">
        <label>{t('database.sourceDb')}:</label>
        <div className="input-group">
          <input
            type="text"
            name="sourceUrl"
            value={localConfig.sourceUrl}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            placeholder="mongodb://source-host:27017/db-name"
            required
          />
          <small className="helper-text">
            {t('database.example')}: mongodb://localhost:27017/source-db
          </small>
        </div>
      </div>

      <div className="form-group">
        <label>{t('database.targetDb')}:</label>
        <div className="input-group">
          <input
            type="text"
            name="targetUrl"
            value={localConfig.targetUrl}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            placeholder="mongodb://target-host:27017/db-name"
            required
          />
          <small className="helper-text">
            {t('database.example')}: mongodb://localhost:27017/target-db
          </small>
        </div>
      </div>
    </div>
  );
};

export default DatabaseConfig;
