/**
 * Schedule utility functions for handling cron expressions and time formatting
 */

/**
 * Determine schedule type from cron expression
 * @param {string} cronExpression - Cron expression to analyze
 * @returns {'daily' | 'weekly' | 'monthly'} Schedule type
 */
export const getScheduleType = (cronExpression) => {
  if (!cronExpression) return 'daily';
  
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) return 'daily';

  const [_, __, dom, month, dow] = parts;
  
  if (dom === '*' && month === '*' && dow === '*') return 'daily';
  if (dom === '*' && month === '*' && /^\d+$/.test(dow)) return 'weekly';
  if (/^\d+$/.test(dom) && month === '*' && dow === '*') return 'monthly';
  
  return 'daily';
};

/**
 * Format schedule time from cron expression
 * @param {string} cronExpression - Cron expression to format
 * @returns {string} Formatted time (HH:mm)
 */
export const formatScheduleTime = (cronExpression) => {
  if (!cronExpression) return '00:00';
  
  const [minute, hour] = cronExpression.split(' ');
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
};

/**
 * Parse time from cron expression
 * @param {string} cronExpression - Cron expression to parse
 * @returns {[string, string]} Array containing [hour, minute]
 */
export const parseScheduleTime = (cronExpression) => {
  if (!cronExpression) return ['00', '00'];
  
  const [minute, hour] = cronExpression.split(' ');
  return [hour.padStart(2, '0'), minute.padStart(2, '0')];
};

/**
 * Generate cron expression from components
 * @param {Object} params - Schedule parameters
 * @param {string} params.type - Schedule type (daily, weekly, monthly)
 * @param {string} params.time - Time in HH:mm format
 * @param {string|number} [params.day] - Day value (1-7 for weekly, 1-31 for monthly)
 * @returns {string} Cron expression
 */
export const generateCronExpression = ({ type, time, day }) => {
  const [hour, minute] = time.split(':');
  
  switch (type) {
    case 'weekly':
      return `${minute} ${hour} * * ${day || 1}`;
    case 'monthly':
      return `${minute} ${hour} ${day || 1} * *`;
    case 'daily':
    default:
      return `${minute} ${hour} * * *`;
  }
};

/**
 * Get human-readable schedule description
 * @param {string} cronExpression - Cron expression to describe
 * @returns {string} Human-readable description
 */
export const getScheduleDescription = (cronExpression) => {
  const type = getScheduleType(cronExpression);
  const time = formatScheduleTime(cronExpression);
  const [_, __, dom, ___, dow] = cronExpression.split(' ');
  
  switch (type) {
    case 'weekly':
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return `${time} every ${days[parseInt(dow)]}`;
    case 'monthly':
      return `${time} on day ${dom} of every month`;
    case 'daily':
    default:
      return `${time} every day`;
  }
};
