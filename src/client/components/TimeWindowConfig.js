import React from 'react';

const TimeWindowConfig = ({ config, onConfigChange }) => {
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
      <label>Sync Time Window:</label>
      <div className="time-window">
        <div>
          <label>Start:</label>
          <input
            type="time"
            name="timeWindow.start"
            value={config.timeWindow.start}
            onChange={handleTimeChange}
            required
          />
        </div>
        <div>
          <label>End:</label>
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
        Sync operations will only run during this time window
      </small>
    </div>
  );
};

export default TimeWindowConfig;
