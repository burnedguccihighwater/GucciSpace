const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function formatHours(minutes) {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return 'часы скрыты';
  if (minutes > 0 && minutes < 6) return '< 0,1 ч';
  return `${number.format(minutes / 60)} ч`;
}

export function selectGames(games, { query = '', filter = 'all', sort = 'playtime' } = {}) {
  const search = query.trim().toLocaleLowerCase('ru');
  return games.filter(game => {
    if (search && !game.name.toLocaleLowerCase('ru').includes(search)) return false;
    if (filter === 'played' && !(game.playtime_minutes > 0)) return false;
    if (filter === 'unplayed' && game.playtime_minutes !== 0) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'name') return collator.compare(a.name, b.name);
    if (sort === 'recent') {
      const recent = b.last_played - a.last_played;
      if (recent) return recent;
    }
    return (b.playtime_minutes ?? -1) - (a.playtime_minutes ?? -1) || collator.compare(a.name, b.name);
  });
}
