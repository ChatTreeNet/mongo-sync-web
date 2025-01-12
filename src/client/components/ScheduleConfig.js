import React from 'react';
import { getScheduleType, formatScheduleTime, parseScheduleTime } from '../utils/scheduleUtils';

const ScheduleConfig = ({ config, onConfigChange }) => {
  const handleScheduleTypeChange = (type) => {
    let newSchedule;
    switch (type) {
      case 'daily':
        newSchedule = '0 0 * * *'; // Default to midnight
        break;
      case 'weekly':
        newSchedule = '0 0 * * 1'; // Default to Monday midnight
        break;
      case 'monthly':
        newSchedule = '0 0 1 * *'; // Default to 1st day of month
        break;
      default:
        newSchedule = '0 0 * * *';
    }
    onConfigChange({
      scheduleType: type,
      schedule: newSchedule
    });
  };

  const handleTimeChange = (e) => {
    const [hour, minute] = e.target.value.split(':');
    let newSchedule = config.schedule;
    const scheduleType = config.scheduleType || getScheduleType(config.schedule);

    switch (scheduleType) {
      case 'daily':
        newSchedule = `${minute} ${hour} * * *`;
        break;
      case 'weekly':
        const dayOfWeek = config.schedule.match(/\* \* (\d)$/)?.[1] || '1';
        newSchedule = `${minute} ${hour} * * ${dayOfWeek}`;
        break;
      case 'monthly':
        const dayOfMonth = config.schedule.match(/\* (\d+)/)?.[1] || '1';
        newSchedule = `${minute} ${hour} ${dayOfMonth} * *`;
        break;
    }

    onConfigChange({ schedule: newSchedule });
  };

  const handleDayChange = (e) => {
    const [hour, minute] = parseScheduleTime(config.schedule);
    const value = e.target.value;
    let newSchedule;

    if (config.scheduleType === 'weekly') {
      newSchedule = `${minute} ${hour} * * ${value}`;
    } else if (config.scheduleType === 'monthly') {
      newSchedule = `${minute} ${hour} ${value} * *`;
    }

    onConfigChange({ schedule: newSchedule });
  };

  const scheduleType = config.scheduleType || getScheduleType(config.schedule);
  const scheduleTime = formatScheduleTime(config.schedule);

  return (
    <div className="form-group">
      <label>Sync Schedule:</label>
      <div className="schedule-config">
        <div className="schedule-type">
          <label className="schedule-option">
            <input
              type="radio"
              name="scheduleType"
              value="daily"
              checked={scheduleType === 'daily'}
              onChange={() => handleScheduleTypeChange('daily')}
            />
            Daily
          </label>
          <label className="schedule-option">
            <input
              type="radio"
              name="scheduleType"
              value="weekly"
              checked={scheduleType === 'weekly'}
              onChange={() => handleScheduleTypeChange('weekly')}
            />
            Weekly
          </label>
          <label className="schedule-option">
            <input
              type="radio"
              name="scheduleType"
              value="monthly"
              checked={scheduleType === 'monthly'}
              onChange={() => handleScheduleTypeChange('monthly')}
            />
            Monthly
          </label>
        </div>

        <div className="schedule-details">
          {scheduleType === 'weekly' && (
            <div className="schedule-day">
              <label>Day:</label>
              <select
                value={config.schedule.match(/\* \* (\d)$/)?.[1] || '1'}
                onChange={handleDayChange}
              >
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
                <option value="0">Sunday</option>
              </select>
            </div>
          )}

          {scheduleType === 'monthly' && (
            <div className="schedule-day">
              <label>Day:</label>
              <select
                value={config.schedule.match(/\* (\d+)/)?.[1] || '1'}
                onChange={handleDayChange}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
          )}

          <div className="schedule-time">
            <label>Time:</label>
            <input
              type="time"
              value={scheduleTime}
              onChange={handleTimeChange}
            />
          </div>
        </div>

        <div className="schedule-summary">
          Will run at: {(() => {
            const [minute, hour, dom, month, dow] = config.schedule.split(' ');
            const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
            
            switch (scheduleType) {
              case 'daily':
                return `${time} every day`;
              case 'weekly':
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                return `${time} every ${days[dow]}`;
              case 'monthly':
                return `${time} on day ${dom} of every month`;
              default:
                return 'Invalid schedule';
            }
          })()}
        </div>
      </div>
    </div>
  );
};

export default ScheduleConfig;
