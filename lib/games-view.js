const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function formatHours(minutes) {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return 'часы скрыты';
  if (minutes > 0 && minutes < 6) return '< 0,1 ч';
  return `${number.format(minutes / 60)} ч`;
}

export function loopPosition(position, cycleWidth) {
  if (!Number.isFinite(position) || !Number.isFinite(cycleWidth) || cycleWidth <= 0) return 0;
  return ((position % cycleWidth) + cycleWidth) % cycleWidth;
}
