import React from 'react';
import { useTranslation } from 'react-i18next';

const TimeWindowConfig = ({ config, onConfigChange }) => {
  const { t } = useTranslation();

  const handleTimeChange = (e) => {
    const { name, value } = e.target;
    const field = name.split('.')[1]; // Extract 'start' or 'end' from 'timeWindow.start'
    
    onConfigChange({
      timeWindow: {
        ...config.timeWindow,
        [field]: value
      }
    });
  };

  return (
    <div className="form-group">
      <label>{t('schedule.timeWindow.title')}:</label>
      <div className="time-window">
        <div>
          <label>{t('schedule.timeWindow.start')}:</label>
          <input
            type="time"
            name="timeWindow.start"
            value={config.timeWindow.start}
            onChange={handleTimeChange}
            required
          />
        </div>
        <div>
          <label>{t('schedule.timeWindow.end')}:</label>
          <input
            type="time"
            name="timeWindow.end"
            value={config.timeWindow.end}
            onChange={handleTimeChange}
            required
          />
        </div>
      </div>
      <small className="helper-text">
        {t('schedule.timeWindow.help')}
      </small>
    </div>
  );
};

export default TimeWindowConfig;
