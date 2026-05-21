import { format, subDays } from 'date-fns';

/**
 * Requirement 5: 新建日记时，自动填写日期，新建时间在早上6点之前时，日期填为前一天
 */
export function getInitialDiaryDate(): string {
  const now = new Date();
  const hours = now.getHours();
  
  let targetDate = now;
  if (hours < 6) {
    targetDate = subDays(now, 1);
  }
  
  return format(targetDate, 'yyyy/MM/dd');
}
