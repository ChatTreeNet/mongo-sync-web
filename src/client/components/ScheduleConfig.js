import React from 'react';
import { useTranslation } from 'react-i18next';
import { getScheduleType, formatScheduleTime, parseScheduleTime } from '../utils/scheduleUtils';

const ScheduleConfig = ({ config, onConfigChange }) => {
  const { t } = useTranslation();

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

  const weekdays = [
    { value: '1', label: t('schedule.weekdays.monday') },
    { value: '2', label: t('schedule.weekdays.tuesday') },
    { value: '3', label: t('schedule.weekdays.wednesday') },
    { value: '4', label: t('schedule.weekdays.thursday') },
    { value: '5', label: t('schedule.weekdays.friday') },
    { value: '6', label: t('schedule.weekdays.saturday') },
    { value: '0', label: t('schedule.weekdays.sunday') }
  ];

  return (
    <div className="form-group">
      <label>{t('schedule.syncSchedule')}:</label>
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
            {t('schedule.type.daily')}
          </label>
          <label className="schedule-option">
            <input
              type="radio"
              name="scheduleType"
              value="weekly"
              checked={scheduleType === 'weekly'}
              onChange={() => handleScheduleTypeChange('weekly')}
            />
            {t('schedule.type.weekly')}
          </label>
          <label className="schedule-option">
            <input
              type="radio"
              name="scheduleType"
              value="monthly"
              checked={scheduleType === 'monthly'}
              onChange={() => handleScheduleTypeChange('monthly')}
            />
            {t('schedule.type.monthly')}
          </label>
        </div>

        <div className="schedule-details">
          {scheduleType === 'weekly' && (
            <div className="schedule-day">
              <label>{t('schedule.day')}:</label>
              <select
                value={config.schedule.match(/\* \* (\d)$/)?.[1] || '1'}
                onChange={handleDayChange}
              >
                {weekdays.map(day => (
                  <option key={day.value} value={day.value}>{day.label}</option>
                ))}
              </select>
            </div>
          )}

          {scheduleType === 'monthly' && (
            <div className="schedule-day">
              <label>{t('schedule.day')}:</label>
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
            <label>{t('schedule.time')}:</label>
            <input
              type="time"
              value={scheduleTime}
              onChange={handleTimeChange}
            />
          </div>
        </div>

        <div className="schedule-summary">
          {t('schedule.summary.prefix')}: {(() => {
            const [minute, hour, dom, month, dow] = config.schedule.split(' ');
            const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
            
            switch (scheduleType) {
              case 'daily':
                return t('schedule.summary.daily', { time });
              case 'weekly':
                const day = weekdays.find(d => d.value === dow)?.label;
                return t('schedule.summary.weekly', { time, day });
              case 'monthly':
                return t('schedule.summary.monthly', { time, day: dom });
              default:
                return t('schedule.summary.invalid');
            }
          })()}
        </div>
      </div>
    </div>
  );
};

export default ScheduleConfig;
