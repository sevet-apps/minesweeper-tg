'use strict';

const RARITIES = Object.freeze({
    common:    { order: 0, color: '#8e8e93' },
    uncommon:  { order: 1, color: '#168cff' },
    rare:      { order: 2, color: '#28c76f' },
    epic:      { order: 3, color: '#9b5cff' },
    legendary: { order: 4, color: '#f5b82e' },
    mythic:    { order: 5, color: '#ff3b30' },
});

const GAME_LABELS = Object.freeze({
    general:  { ru: 'Общие', en: 'General', zh: '通用' },
    saper:    { ru: 'Сапёр', en: 'Minesweeper', zh: '扫雷' },
    checkers: { ru: 'Шашки', en: 'Checkers', zh: '跳棋' },
    bb:       { ru: 'Блок Бласт', en: 'Block Blast', zh: '方块消除' },
    sudoku:   { ru: 'Судоку', en: 'Sudoku', zh: '数独' },
    tower:    { ru: 'Башня', en: 'Tower', zh: '高塔' },
    wordle:   { ru: 'Вордли', en: 'Wordle', zh: '猜词' },
    monopoly: { ru: 'Монополия', en: 'Monopoly', zh: '大富翁' },
    referral: { ru: 'Рефералы', en: 'Referrals', zh: '邀请' },
});

function text(ru, en, zh) { return Object.freeze({ ru, en, zh }); }
function title(id, game, rarity, icon, name, description, extra = {}) {
    return Object.freeze({ id, game, rarity, icon, name, description, ...extra });
}

const TITLES = Object.freeze([
    title('first_spark', 'general', 'common', '✦', text('Первая искра', 'First Spark', '第一束火花'), text('Завершить первую игру.', 'Finish your first game.', '完成第一局游戏。')),
    title('all_rounder', 'general', 'uncommon', '◈', text('Универсал', 'All-rounder', '全能玩家'), text('Сыграть хотя бы одну завершённую игру в каждой игре Spark.', 'Finish at least one game in every Spark game.', '在 Spark 的每款游戏中至少完成一局。')),
    title('connected', 'general', 'uncommon', '◉', text('На связи', 'Always Around', '常伴在线'), text('Зайти в приложение в 7 разных дней.', 'Open the app on 7 different days.', '在 7 个不同日期打开应用。')),
    title('regular', 'general', 'rare', '⌛', text('Завсегдатай', 'Regular', '常客'), text('Провести 25 часов активного времени в играх.', 'Spend 25 active hours in games.', '累计 25 小时有效游戏时间。')),
    title('spark_veteran', 'general', 'epic', '✹', text('Ветеран Spark', 'Spark Veteran', 'Spark 老将'), text('Провести 100 часов активного времени в играх.', 'Spend 100 active hours in games.', '累计 100 小时有效游戏时间。')),
    title('unstoppable', 'general', 'epic', '▣', text('Без остановки', 'Unstoppable', '永不停歇'), text('Заходить в Spark 30 дней подряд.', 'Open Spark 30 days in a row.', '连续 30 天打开 Spark。')),
    title('top_ten', 'general', 'rare', '⑩', text('В десятке', 'Top Ten', '前十名'), text('Войти в топ-10 хотя бы одной главной таблицы.', 'Reach the top 10 of any main leaderboard.', '进入任一主要排行榜前十。')),
    title('summit_conqueror', 'general', 'legendary', '♛', text('Покоритель вершины', 'Summit Conqueror', '登顶者'), text('Хотя бы однажды занять первое место в главном топе игры.', 'Reach first place in a main game leaderboard.', '曾在任一游戏主榜登顶。')),
    title('seven_facets', 'general', 'mythic', '✺', text('Семь граней', 'Seven Facets', '七重光芒'), text('Получить титул эпической редкости или выше в каждой из семи игр.', 'Earn an Epic-or-higher title in all seven games.', '在七款游戏中各获得一个史诗或更高稀有度的称号。')),

    title('saper_rookie', 'saper', 'common', '⚑', text('Сапёр-новобранец', 'Rookie Sapper', '扫雷新兵'), text('Впервые пройти поле 6×6.', 'Clear a 6×6 board for the first time.', '首次完成 6×6 棋盘。')),
    title('saper_full_clearance', 'saper', 'uncommon', '▦', text('Полная зачистка', 'Full Clearance', '全面清扫'), text('Пройти режимы 6×6, 8×8, 10×10 и 15×15.', 'Clear all four board sizes.', '完成全部四种棋盘尺寸。')),
    title('saper_no_flags', 'saper', 'rare', '◇', text('Без единой метки', 'No Flags Needed', '无需标记'), text('Пройти 10×10, ни разу не поставив флаг.', 'Clear 10×10 without placing a flag.', '不放置旗帜完成 10×10。')),
    title('saper_fast_fuse', 'saper', 'epic', 'ϟ', text('Быстрее фитиля', 'Faster than the Fuse', '快过引线'), text('Пройти 15×15 быстрее чем за 3 минуты.', 'Clear 15×15 in under 3 minutes.', '在 3 分钟内完成 15×15。')),
    title('saper_cold_head', 'saper', 'epic', '❄', text('Холодная голова', 'Cold Head', '冷静头脑'), text('Победить 10 раз подряд. Учитываются режимы не меньше 8×8.', 'Win 10 games in a row on boards of at least 8×8.', '在至少 8×8 的模式中连续获胜 10 局。'), { note: text('Минимум 8×8', '8×8 minimum', '至少 8×8') }),
    title('saper_mine_sense', 'saper', 'mythic', '✧', text('Чувствую мины', 'Mine Sense', '雷区直觉'), text('Одновременно занимать первое место по времени во всех четырёх режимах.', 'Hold the fastest time in all four modes at once.', '同时占据四种模式最快时间第一名。'), { dynamic: true }),

    title('checkers_first_king', 'checkers', 'common', '♔', text('Первая дамка', 'First King', '首枚王棋'), text('Впервые превратить шашку в дамку в игре с человеком.', 'Crown your first king in a human match.', '在人类对局中首次升王。')),
    title('checkers_combo', 'checkers', 'rare', '⤫', text('Комбинация', 'Combination', '连环吃子'), text('Срубить не меньше трёх шашек за один ход.', 'Capture at least three pieces in one turn.', '一回合吃掉至少三枚棋子。')),
    title('checkers_clean_win', 'checkers', 'legendary', '◐', text('Сухая победа', 'Flawless Victory', '零损胜利'), text('Победить человека, не потеряв ни одной шашки.', 'Beat a human without losing a single piece.', '不损失任何棋子击败真人。')),
    title('checkers_iron_will', 'checkers', 'epic', '◆', text('Железная воля', 'Iron Will', '钢铁意志'), text('Победить после отставания минимум в четыре шашки.', 'Win after trailing by at least four pieces.', '落后至少四枚棋子后逆转获胜。')),
    title('checkers_ten_streak', 'checkers', 'legendary', 'Ⅹ', text('Без права на ошибку', 'No Room for Error', '不容有失'), text('Победить людей 10 раз подряд.', 'Win 10 human matches in a row.', '连续赢得 10 场真人对局。')),
    title('checkers_grandmaster', 'checkers', 'legendary', '♚', text('Гроссмейстер', 'Grandmaster', '特级大师'), text('Одержать 100 побед над людьми.', 'Win 100 matches against humans.', '赢得 100 场真人对局。')),

    title('bb_first_line', 'bb', 'common', '▬', text('Первый ряд', 'First Line', '第一行'), text('Впервые очистить линию.', 'Clear your first line.', '首次消除一行。')),
    title('bb_triple', 'bb', 'rare', '≡', text('Тройной удар', 'Triple Strike', '三重打击'), text('Очистить минимум три линии одним ходом.', 'Clear at least three lines in one move.', '一回合消除至少三行。')),
    title('bb_combo_10', 'bb', 'rare', '⑩', text('Цепная реакция', 'Chain Reaction', '连锁反应'), text('Достичь комбо ×10.', 'Reach a ×10 combo.', '达到 ×10 连击。')),
    title('bb_combo_100', 'bb', 'legendary', '◎', text('Резонанс', 'Resonance', '共振'), text('Достичь комбо ×100.', 'Reach a ×100 combo.', '达到 ×100 连击。')),
    title('bb_combo_1000', 'bb', 'mythic', '∞', text('Бесконечная цепь', 'Endless Chain', '无限连锁'), text('Достичь комбо ×1000.', 'Reach a ×1000 combo.', '达到 ×1000 连击。')),
    title('bb_geometry', 'bb', 'epic', '▰', text('Геометрия подчиняется', 'Geometry Obeys', '驾驭几何'), text('Набрать 10 000 000 очков.', 'Score 10,000,000 points.', '获得 10,000,000 分。')),
    title('bb_event_horizon', 'bb', 'legendary', '◉', text('Горизонт событий', 'Event Horizon', '事件视界'), text('Набрать 100 000 000 очков.', 'Score 100,000,000 points.', '获得 100,000,000 分。')),
    title('bb_singularity', 'bb', 'mythic', '●', text('Сингулярность', 'Singularity', '奇点'), text('Набрать 1 000 000 000 очков.', 'Score 1,000,000,000 points.', '获得 1,000,000,000 分。')),
    title('bb_clean_board', 'bb', 'epic', '□', text('Чистое поле', 'Clean Board', '清空棋盘'), text('Полностью очистить поле одним ходом.', 'Completely clear the board in one move.', '一次落子清空整个棋盘。')),

    title('sudoku_first_grid', 'sudoku', 'common', '▦', text('Первая сетка', 'First Grid', '第一盘'), text('Впервые решить судоку.', 'Solve your first Sudoku.', '首次完成数独。')),
    title('sudoku_pure_logic', 'sudoku', 'uncommon', '◇', text('Чистая логика', 'Pure Logic', '纯粹逻辑'), text('Решить средний уровень без ошибок.', 'Solve Medium without mistakes.', '无错误完成中等难度。')),
    title('sudoku_expert', 'sudoku', 'legendary', '◆', text('Эксперт', 'Expert', '专家'), text('Решить сложный уровень без ошибок.', 'Solve Hard without mistakes.', '无错误完成困难难度。')),
    title('sudoku_speed', 'sudoku', 'epic', 'ϟ', text('Скорость мысли', 'Speed of Thought', '思维极速'), text('Решить сложный уровень быстрее чем за 5 минут.', 'Solve Hard in under 5 minutes.', '在 5 分钟内完成困难难度。')),
    title('sudoku_archivist', 'sudoku', 'legendary', '▤', text('Архивариус', 'Archivist', '典藏家'), text('Решить 100 судоку.', 'Solve 100 Sudoku puzzles.', '完成 100 盘数独。')),
    title('sudoku_ninth_level', 'sudoku', 'mythic', '⑨', text('Девятый уровень', 'Ninth Level', '第九境界'), text('Решить 30 сложных судоку подряд без ошибок.', 'Solve 30 Hard puzzles in a row without mistakes.', '连续无错误完成 30 盘困难数独。')),

    title('tower_foundation', 'tower', 'common', '▰', text('Фундамент заложен', 'Foundation Laid', '奠定基础'), text('Построить башню из 10 этажей.', 'Build a 10-floor tower.', '建成 10 层高塔。')),
    title('tower_steady_hand', 'tower', 'uncommon', '◫', text('Точная рука', 'Steady Hand', '精准之手'), text('Поставить 5 идеальных блоков подряд.', 'Place 5 perfect blocks in a row.', '连续完美放置 5 个方块。')),
    title('tower_skyscraper', 'tower', 'rare', '▥', text('Небоскрёб', 'Skyscraper', '摩天楼'), text('Построить 50 этажей.', 'Build 50 floors.', '建成 50 层。')),
    title('tower_perfect_balance', 'tower', 'legendary', '◈', text('Идеальный баланс', 'Perfect Balance', '完美平衡'), text('Поставить 20 идеальных блоков подряд.', 'Place 20 perfect blocks in a row.', '连续完美放置 20 个方块。')),
    title('tower_stratosphere', 'tower', 'mythic', '↑', text('Стратосфера', 'Stratosphere', '平流层'), text('Построить башню из 500 этажей.', 'Build a 500-floor tower.', '建成 500 层高塔。')),
    title('tower_close_call', 'tower', 'mythic', '⌁', text('На волоске', 'By a Thread', '命悬一线'), text('За одну игру 10 раз успешно поставить блок, когда остаётся не больше 5% ширины.', 'In one game, place 10 blocks successfully with no more than 5% width remaining.', '在同一局中，以不超过 5% 的剩余宽度成功放置 10 次。')),

    title('wordle_found', 'wordle', 'common', '✓', text('Слово найдено', 'Word Found', '找到单词'), text('Впервые угадать слово.', 'Guess your first word.', '首次猜中单词。')),
    title('wordle_third_try', 'wordle', 'uncommon', '③', text('Третья попытка', 'Third Try', '三次以内'), text('Угадать слово не позднее третьей попытки.', 'Guess a word within three attempts.', '三次以内猜中单词。')),
    title('wordle_almost_telepath', 'wordle', 'rare', '②', text('Почти телепат', 'Almost Telepathic', '近乎读心'), text('Угадать слово со второй попытки.', 'Guess a word on the second attempt.', '第二次猜中单词。')),
    title('wordle_sixth_sense', 'wordle', 'legendary', '①', text('Шестое чувство', 'Sixth Sense', '第六感'), text('Угадать слово с первой попытки.', 'Guess a word on the first attempt.', '第一次就猜中单词。')),
    title('wordle_vocabulary', 'wordle', 'legendary', 'A', text('Словарный запас', 'Vocabulary', '词汇大师'), text('Одержать 100 побед.', 'Win 100 Wordle games.', '赢得 100 局猜词。')),
    title('wordle_last_word', 'wordle', 'mythic', 'Ω', text('Последнее слово', 'Last Word', '最终答案'), text('Победить 30 раз подряд.', 'Win 30 games in a row.', '连续获胜 30 局。')),

    title('mono_first_capital', 'monopoly', 'common', '$', text('Первый капитал', 'First Capital', '第一桶金'), text('Впервые победить в игре с людьми.', 'Win your first human match.', '首次赢得真人对局。')),
    title('mono_monopolist', 'monopoly', 'uncommon', '▣', text('Монополист', 'Monopolist', '垄断者'), text('Впервые собрать полную цветовую группу.', 'Complete your first color group.', '首次集齐一个完整色组。')),
    title('mono_builder', 'monopoly', 'rare', '▥', text('Застройщик', 'Developer', '建设者'), text('Максимально застроить все компании одной группы.', 'Fully develop every company in one group.', '将同一色组全部开发至最高等级。')),
    title('mono_diplomat', 'monopoly', 'rare', '⇄', text('Дипломат', 'Diplomat', '外交家'), text('Заключить 10 принятых договоров.', 'Complete 10 accepted deals.', '达成 10 笔被接受的交易。')),
    title('mono_clean_assets', 'monopoly', 'legendary', '◇', text('Чистые активы', 'Clean Assets', '纯净资产'), text('Победить, не заложив ни одной компании.', 'Win without mortgaging a company.', '在未抵押任何公司的情况下获胜。')),
    title('mono_phoenix', 'monopoly', 'epic', '♨', text('Феникс', 'Phoenix', '凤凰'), text('Победить после падения денежного баланса ниже $100.', 'Win after your cash balance falls below $100.', '现金余额低于 $100 后逆转获胜。')),
    title('mono_ruthless_market', 'monopoly', 'legendary', '♜', text('Безжалостный рынок', 'Ruthless Market', '无情市场'), text('Обанкротить трёх соперников за одну игру.', 'Bankrupt three opponents in one match.', '一局内令三名对手破产。')),
    title('mono_city_owner', 'monopoly', 'legendary', '♙', text('Владелец города', 'City Owner', '城市之主'), text('Одержать 100 побед в играх с людьми.', 'Win 100 human matches.', '赢得 100 场真人对局。')),
    title('mono_last_asset', 'monopoly', 'mythic', '◒', text('Последний актив', 'Last Asset', '最后资产'), text('Победить после падения общей стоимости активов до $2 000 или ниже.', 'Win after your total net worth falls to $2,000 or less.', '总资产跌至 $2,000 或更低后逆转获胜。')),

    title('ref_partner', 'referral', 'common', '＋', text('Напарник', 'Partner', '伙伴'), text('Пригласить одного активированного игрока.', 'Invite one activated player.', '邀请 1 名已激活玩家。')),
    title('ref_company', 'referral', 'uncommon', '♧', text('Своя компания', 'Your Own Crew', '自己的团队'), text('Пригласить 5 активированных игроков.', 'Invite 5 activated players.', '邀请 5 名已激活玩家。')),
    title('ref_hub', 'referral', 'epic', '◎', text('Центр сообщества', 'Community Hub', '社区中心'), text('Пригласить 25 активированных игроков.', 'Invite 25 activated players.', '邀请 25 名已激活玩家。')),
    title('ref_ambassador', 'referral', 'legendary', '✦', text('Амбассадор Spark', 'Spark Ambassador', 'Spark 大使'), text('Пригласить 100 активированных игроков.', 'Invite 100 activated players.', '邀请 100 名已激活玩家。')),

    title('leader_saper', 'saper', 'legendary', '⚑', text('Гроза мин', 'Mine Terror', '雷区霸主'), text('Занимать первое место в главном топе Сапёра по победам.', 'Hold first place in the main Minesweeper wins leaderboard.', '占据扫雷胜场主榜第一。'), { dynamic: true }),
    title('leader_checkers', 'checkers', 'legendary', '♚', text('Гроссмейстер Spark', 'Spark Grandmaster', 'Spark 特级大师'), text('Занимать первое место в главном топе Шашек.', 'Hold first place in the main Checkers leaderboard.', '占据跳棋主榜第一。'), { dynamic: true }),
    title('leader_bb', 'bb', 'legendary', '◉', text('Архитектор хаоса', 'Architect of Chaos', '混沌建筑师'), text('Занимать первое место в главном топе Блок Бласта.', 'Hold first place in the main Block Blast leaderboard.', '占据方块消除主榜第一。'), { dynamic: true }),
    title('leader_sudoku', 'sudoku', 'legendary', '⑨', text('Властелин сеток', 'Grid Master', '九宫之主'), text('Занимать первое место в главном топе Судоку.', 'Hold first place in the main Sudoku leaderboard.', '占据数独主榜第一。'), { dynamic: true }),
    title('leader_tower', 'tower', 'legendary', '↑', text('Выше облаков', 'Above the Clouds', '云端之上'), text('Занимать первое место в главном топе Башни.', 'Hold first place in the main Tower leaderboard.', '占据高塔主榜第一。'), { dynamic: true }),
    title('leader_wordle', 'wordle', 'legendary', 'W', text('Хозяин слов', 'Master of Words', '词语之王'), text('Занимать первое место в главном топе Вордли.', 'Hold first place in the main Wordle leaderboard.', '占据猜词主榜第一。'), { dynamic: true }),
    title('leader_monopoly', 'monopoly', 'legendary', '♜', text('Король рынка', 'Market King', '市场之王'), text('Занимать первое место в рейтинге Монополии.', 'Hold first place in the Monopoly rating.', '占据大富翁评级第一。'), { dynamic: true }),
    title('absolute_champion', 'general', 'mythic', '✵', text('Абсолютный чемпион', 'Absolute Champion', '绝对冠军'), text('Одновременно занимать первое место в трёх главных игровых топах.', 'Hold first place in three main game leaderboards at once.', '同时占据三个游戏主榜第一。'), { dynamic: true }),
    title('spark_crown', 'general', 'mythic', '♕', text('Венец Spark', 'Crown of Spark', 'Spark 王冠'), text('Одновременно занимать первые места во всех семи главных игровых топах. Рекорды времени Сапёра не учитываются.', 'Hold first place in all seven main game leaderboards. Minesweeper time boards do not count.', '同时占据七个游戏主榜第一；扫雷计时榜不计入。'), { dynamic: true }),
]);

const BY_ID = new Map(TITLES.map(item => [item.id, item]));
const MAIN_RANKS = Object.freeze({
    saper: 'saper_wins', checkers: 'checkers_wins_pve', bb: 'bb_best_score',
    sudoku: 'sudoku_wins', tower: 'tower_best', wordle: 'wordle_wins',
});

function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function dateKey(value = Date.now()) { return new Date(value).toISOString().slice(0, 10); }
function isMissingSchema(error) {
    const message = String(error && error.message || '');
    return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /player_title/i.test(message));
}

function evaluate(progress, stats, unlockedIds, rankState) {
    const awards = [];
    const award = (id, condition = true) => { if (condition && BY_ID.has(id) && !unlockedIds.has(id)) awards.push(id); };
    const games = new Set(progress.completedGames || []);
    const days = unique(progress.openDays).sort();
    const totalPlaytime = Object.values(safeObject(progress.playtime)).reduce((sum, value) => sum + number(value), 0);

    const historicalGames = new Set(games);
    if (number(stats.bb_best_score) > 0 || number(stats.bb_total_games) > 0) historicalGames.add('bb');
    if (number(stats.saper_wins) > 0) historicalGames.add('saper');
    if (number(stats.checkers_total) > 0 || number(stats.checkers_wins_pve) > 0) historicalGames.add('checkers');
    if (number(stats.sudoku_wins) > 0) historicalGames.add('sudoku');
    if (number(stats.tower_best) > 0) historicalGames.add('tower');
    if (number(stats.wordle_wins) > 0) historicalGames.add('wordle');
    if (number(stats.monopoly_games) > 0) historicalGames.add('monopoly');
    award('first_spark', historicalGames.size > 0);
    award('all_rounder', ['bb','saper','tower','sudoku','checkers','wordle','monopoly'].every(game => historicalGames.has(game)));
    award('connected', days.length >= 7);
    award('regular', totalPlaytime >= 25 * 60 * 60 * 1000);
    award('spark_veteran', totalPlaytime >= 100 * 60 * 60 * 1000);
    award('unstoppable', number(progress.longestOpenStreak) >= 30);
    award('top_ten', !!rankState?.topTenAny);
    award('summit_conqueror', !!rankState?.firstAny || !!progress.everFirst);

    const modes = new Set(progress.saperModes || []);
    const clearedModes = new Set(modes);
    [6,8,10,15].forEach(mode => {
        const best = number(stats[`saper_best_${mode}`]);
        if (best > 0 && best < 9999) clearedModes.add(mode);
    });
    award('saper_rookie', clearedModes.has(6));
    award('saper_full_clearance', [6,8,10,15].every(mode => clearedModes.has(mode)));
    award('saper_no_flags', !!progress.saperNoFlags10);
    const saperBest15 = Math.min(
        number(progress.saperBest15) || Number.POSITIVE_INFINITY,
        number(stats.saper_best_15) || Number.POSITIVE_INFINITY);
    award('saper_fast_fuse', saperBest15 > 0 && saperBest15 < 180);
    award('saper_cold_head', number(progress.saperEligibleWinStreak) >= 10);

    award('checkers_first_king', !!progress.checkersFirstKing);
    award('checkers_combo', number(progress.checkersMaxCapture) >= 3);
    award('checkers_clean_win', !!progress.checkersCleanWin);
    award('checkers_iron_will', !!progress.checkersComeback);
    award('checkers_ten_streak', number(progress.checkersWinStreak) >= 10);
    // Bot wins and human wins currently share a legacy public statistic, so
    // Grandmaster must only use the new server-owned human-match counter.
    award('checkers_grandmaster', number(progress.checkersHumanWins) >= 100);

    award('bb_first_line', number(progress.bbMaxLines) >= 1);
    award('bb_triple', number(progress.bbMaxLines) >= 3);
    award('bb_combo_10', number(progress.bbMaxCombo) >= 10);
    award('bb_combo_100', number(progress.bbMaxCombo) >= 100);
    award('bb_combo_1000', number(progress.bbMaxCombo) >= 1000);
    award('bb_geometry', number(stats.bb_best_score) >= 10_000_000);
    award('bb_event_horizon', number(stats.bb_best_score) >= 100_000_000);
    award('bb_singularity', number(stats.bb_best_score) >= 1_000_000_000);
    award('bb_clean_board', !!progress.bbCleanBoard);

    // sudoku_wins is a points column (Medium, for example, awards two points),
    // not a solved-puzzle counter.  It is safe only as historical evidence that
    // at least one grid was solved; cumulative titles use the exact event count.
    const sudokuSolved = number(progress.sudokuSolved);
    award('sudoku_first_grid', sudokuSolved >= 1 || number(stats.sudoku_wins) > 0);
    award('sudoku_pure_logic', !!progress.sudokuMediumClean);
    award('sudoku_expert', !!progress.sudokuHardClean);
    award('sudoku_speed', number(progress.sudokuHardBestMs) > 0 && number(progress.sudokuHardBestMs) < 300_000);
    award('sudoku_archivist', sudokuSolved >= 100);
    award('sudoku_ninth_level', number(progress.sudokuHardCleanStreak) >= 30);

    award('tower_foundation', number(stats.tower_best) >= 10);
    award('tower_steady_hand', number(stats.tower_combo) >= 5);
    award('tower_skyscraper', number(stats.tower_best) >= 50);
    award('tower_perfect_balance', number(stats.tower_combo) >= 20);
    award('tower_stratosphere', number(stats.tower_best) >= 500);
    award('tower_close_call', number(progress.towerCloseCallsInGame) >= 10);

    award('wordle_found', number(progress.wordleWins) >= 1 || number(stats.wordle_wins) >= 1);
    award('wordle_third_try', number(progress.wordleBestAttempts) > 0 && number(progress.wordleBestAttempts) <= 3);
    award('wordle_almost_telepath', number(progress.wordleBestAttempts) === 2);
    award('wordle_sixth_sense', number(progress.wordleBestAttempts) === 1);
    award('wordle_vocabulary', number(progress.wordleWins) >= 100 || number(stats.wordle_wins) >= 100);
    award('wordle_last_word', number(progress.wordleWinStreak) >= 30);

    award('mono_first_capital', number(progress.monopolyHumanWins) >= 1);
    award('mono_monopolist', !!progress.monopolyFullGroup);
    award('mono_builder', !!progress.monopolyMaxGroup);
    award('mono_diplomat', number(progress.monopolyAcceptedDeals) >= 10);
    award('mono_clean_assets', !!progress.monopolyCleanAssetsWin);
    award('mono_phoenix', !!progress.monopolyPhoenixWin);
    award('mono_ruthless_market', number(progress.monopolyMaxBankruptions) >= 3);
    award('mono_city_owner', number(progress.monopolyHumanWins) >= 100);
    award('mono_last_asset', !!progress.monopolyLastAssetWin);

    // referral_count contains every referral link activation, including people
    // who have not completed the referral requirement yet. Titles intentionally
    // use the exact number of activated referrals instead.
    const refs = Math.max(number(progress.referralCount), number(stats.activated_referrals));
    award('ref_partner', refs >= 1); award('ref_company', refs >= 5);
    award('ref_hub', refs >= 25); award('ref_ambassador', refs >= 100);

    const prospective = new Set([...unlockedIds, ...awards]);
    const sevenGames = ['saper','checkers','bb','sudoku','tower','wordle','monopoly'];
    award('seven_facets', sevenGames.every(game => TITLES.some(item =>
        item.game === game && !item.dynamic && RARITIES[item.rarity].order >= RARITIES.epic.order && prospective.has(item.id))));
    return unique(awards);
}

function applyEvent(progress, event) {
    const next = { ...safeObject(progress) };
    const context = safeObject(event.context);
    const completed = new Set(next.completedGames || []);
    if (event.game) completed.add(event.game);
    next.completedGames = [...completed];

    if (event.type === 'app_open') {
        const today = dateKey(event.at);
        const days = unique([...(next.openDays || []), today]).sort().slice(-400);
        next.openDays = days;
        let current = 1;
        for (let i = days.length - 1; i > 0; i--) {
            const newer = new Date(`${days[i]}T00:00:00Z`);
            const older = new Date(`${days[i - 1]}T00:00:00Z`);
            if (newer - older !== 86_400_000) break;
            current++;
        }
        next.currentOpenStreak = current;
        next.longestOpenStreak = Math.max(number(next.longestOpenStreak), current);
    }
    if (event.type === 'playtime') next.playtime = { ...safeObject(next.playtime), ...safeObject(event.totals) };
    if (event.type === 'saper_loss') next.saperEligibleWinStreak = 0;
    if (event.type === 'saper_win') {
        const mode = number(context.mode);
        next.saperModes = unique([...(next.saperModes || []), mode]);
        if (mode === 10 && context.usedFlag === false) next.saperNoFlags10 = true;
        if (mode === 15) next.saperBest15 = !next.saperBest15 ? number(event.score) : Math.min(number(next.saperBest15), number(event.score));
        next.saperEligibleWinStreak = mode >= 8 ? number(next.saperEligibleWinStreak) + 1 : 0;
    }
    if (event.type === 'checkers_match') {
        if (context.crowned) next.checkersFirstKing = true;
        next.checkersMaxCapture = Math.max(number(next.checkersMaxCapture), number(context.maxCapture));
        if (context.won && context.lostPieces === 0) next.checkersCleanWin = true;
        if (context.won && number(context.maxDeficit) >= 4) next.checkersComeback = true;
        next.checkersWinStreak = context.won ? number(next.checkersWinStreak) + 1 : 0;
        if (context.won) next.checkersHumanWins = number(next.checkersHumanWins) + 1;
    }
    if (event.type === 'bb_game') {
        next.bbMaxLines = Math.max(number(next.bbMaxLines), number(context.maxLines));
        next.bbMaxCombo = Math.max(number(next.bbMaxCombo), number(context.maxCombo));
        if (context.cleanBoard) next.bbCleanBoard = true;
    }
    if (event.type === 'sudoku_win') {
        const difficulty = number(context.difficulty);
        const mistakes = number(context.mistakes);
        next.sudokuSolved = number(next.sudokuSolved) + 1;
        if (difficulty === 2 && mistakes === 0) next.sudokuMediumClean = true;
        if (difficulty === 3 && mistakes === 0) {
            next.sudokuHardClean = true;
            next.sudokuHardCleanStreak = number(next.sudokuHardCleanStreak) + 1;
        } else next.sudokuHardCleanStreak = 0;
        if (difficulty === 3 && number(context.durationMs) > 0) {
            next.sudokuHardBestMs = !next.sudokuHardBestMs ? number(context.durationMs) : Math.min(number(next.sudokuHardBestMs), number(context.durationMs));
        }
    }
    if (event.type === 'sudoku_loss') next.sudokuHardCleanStreak = 0;
    if (event.type === 'tower_game') next.towerCloseCallsInGame = Math.max(number(next.towerCloseCallsInGame), number(context.closeCalls));
    if (event.type === 'wordle_win') {
        const attempts = number(context.attempts);
        next.wordleWins = number(next.wordleWins) + 1;
        next.wordleWinStreak = number(next.wordleWinStreak) + 1;
        if (attempts > 0) next.wordleBestAttempts = !next.wordleBestAttempts ? attempts : Math.min(number(next.wordleBestAttempts), attempts);
    }
    if (event.type === 'wordle_loss') next.wordleWinStreak = 0;
    if (event.type === 'monopoly_match') {
        // Bot matches still count as a completed Spark game and may unlock
        // board-state titles, but titles explicitly requiring a human win must
        // never be advanced by them.
        const humanMatch = context.humanMatch !== false;
        if (context.won && humanMatch) next.monopolyHumanWins = number(next.monopolyHumanWins) + 1;
        if (context.fullGroup) next.monopolyFullGroup = true;
        if (context.maxGroup) next.monopolyMaxGroup = true;
        next.monopolyAcceptedDeals = number(next.monopolyAcceptedDeals) + number(context.acceptedDeals);
        if (context.won && !context.everMortgaged) next.monopolyCleanAssetsWin = true;
        if (context.won && number(context.lowestCash) < 100) next.monopolyPhoenixWin = true;
        if (context.won && number(context.lowestNetWorth) <= 2000) next.monopolyLastAssetWin = true;
        next.monopolyMaxBankruptions = Math.max(number(next.monopolyMaxBankruptions), number(context.bankruptions));
    }
    if (event.type === 'referrals') next.referralCount = Math.max(number(next.referralCount), number(event.count));
    return next;
}

function makeTitleService({ supabase, log = console }) {
    const memory = new Map();
    const chains = new Map();

    function memoryState(userId) {
        const id = String(userId);
        if (!memory.has(id)) memory.set(id, { progress: {}, selectedTitleId: null, titles: new Map() });
        return memory.get(id);
    }
    async function dbState(userId) {
        const id = String(userId);
        try {
            const [progressResult, titleResult] = await Promise.all([
                supabase.from('player_title_progress').select('progress,selected_title_id').eq('telegram_id', id).maybeSingle(),
                supabase.from('player_titles').select('title_id,unlocked_at,seen_at').eq('telegram_id', id),
            ]);
            if (progressResult.error) throw progressResult.error;
            if (titleResult.error) throw titleResult.error;
            return {
                storage: 'supabase',
                progress: safeObject(progressResult.data?.progress),
                selectedTitleId: progressResult.data?.selected_title_id || null,
                titles: new Map((titleResult.data || []).map(row => [row.title_id, row])),
            };
        } catch (error) {
            if (!isMissingSchema(error)) throw error;
            return { storage: 'memory', ...memoryState(id) };
        }
    }
    async function saveProgress(userId, state) {
        const id = String(userId);
        if (state.storage === 'memory') {
            const target = memoryState(id); target.progress = state.progress; target.selectedTitleId = state.selectedTitleId;
            return;
        }
        const { error } = await supabase.from('player_title_progress').upsert({
            telegram_id: id, progress: state.progress, selected_title_id: state.selectedTitleId || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'telegram_id' });
        if (error) throw error;
    }
    async function saveAwards(userId, state, ids) {
        if (!ids.length) return [];
        const id = String(userId), now = new Date().toISOString();
        const fresh = ids.filter(titleId => !state.titles.has(titleId));
        if (!fresh.length) return [];
        if (state.storage === 'memory') {
            const target = memoryState(id);
            fresh.forEach(titleId => { const row = { title_id: titleId, unlocked_at: now, seen_at: null }; target.titles.set(titleId, row); state.titles.set(titleId, row); });
            return fresh;
        }
        const { error } = await supabase.from('player_titles').upsert(
            fresh.map(titleId => ({ telegram_id: id, title_id: titleId, unlocked_at: now })),
            { onConflict: 'telegram_id,title_id', ignoreDuplicates: true });
        if (error) throw error;
        fresh.forEach(titleId => state.titles.set(titleId, { title_id: titleId, unlocked_at: now, seen_at: null }));
        return fresh;
    }
    async function readStats(userId) {
        const fields = [
            'bb_best_score','bb_total_games','saper_wins','saper_best_6','saper_best_8','saper_best_10','saper_best_15',
            'checkers_total','checkers_wins_pve','sudoku_wins','tower_best','tower_combo','wordle_wins'
        ];
        const id = String(userId);
        const [userResult, referralResult, monopolyResult] = await Promise.all([
            supabase.from('users').select(fields.join(',')).eq('telegram_id', id).maybeSingle(),
            supabase.from('users').select('telegram_id', { count: 'exact', head: true })
                .eq('referred_by', id).eq('referral_activated', true),
            supabase.from('monopoly_rating').select('games').eq('uid', id).maybeSingle(),
        ]);
        if (userResult.error) log.warn?.('[titles] user stats:', userResult.error.message);
        if (referralResult.error) log.warn?.('[titles] activated referrals:', referralResult.error.message);
        if (monopolyResult.error) log.warn?.('[titles] Monopoly stats:', monopolyResult.error.message);
        return {
            ...safeObject(userResult.data),
            activated_referrals: referralResult.error ? 0 : number(referralResult.count),
            monopoly_games: monopolyResult.error ? 0 : number(monopolyResult.data?.games),
        };
    }
    async function rankState(userId) {
        const id = String(userId), first = {}, ranks = {};
        await Promise.all(Object.entries(MAIN_RANKS).map(async ([game, column]) => {
            const [{ data: own, error: ownError }, { data: top, error: topError }] = await Promise.all([
                supabase.from('users').select(column).eq('telegram_id', id).maybeSingle(),
                supabase.from('users').select(`telegram_id,${column}`).gt(column, 0).order(column, { ascending: false }).limit(10),
            ]);
            if (ownError) throw ownError;
            if (topError) throw topError;
            const ownValue = number(own?.[column]);
            const topRows = top || [];
            first[game] = ownValue > 0 && topRows.length > 0 && ownValue === number(topRows[0][column]);
            const index = topRows.findIndex(row => String(row.telegram_id) === id);
            // A user tied for first can fall outside the ten returned rows. It
            // is still rank #1 and must remain eligible for rank titles.
            ranks[game] = first[game] ? 1 : (index >= 0 ? index + 1 : null);
        }));
        const [{ data: own, error: ownError }, { data: top, error: topError }] = await Promise.all([
            supabase.from('monopoly_rating').select('points').eq('uid', id).maybeSingle(),
            supabase.from('monopoly_rating').select('uid,points').gt('games', 0).order('points', { ascending: false }).limit(10),
        ]);
        if (ownError) throw ownError;
        if (topError) throw topError;
        const rows = top || [], ownValue = number(own?.points);
        first.monopoly = ownValue > 0 && rows.length > 0 && ownValue === number(rows[0].points);
        const index = rows.findIndex(row => String(row.uid) === id);
        ranks.monopoly = first.monopoly ? 1 : (index >= 0 ? index + 1 : null);
        const firstCount = Object.values(first).filter(Boolean).length;
        return { first, ranks, firstCount, firstAny: firstCount > 0, topTenAny: Object.values(ranks).some(rank => rank && rank <= 10) };
    }
    async function holderCounts() {
        try {
            const { data, error } = await supabase.from('player_title_holder_counts').select('title_id,holder_count');
            if (error) throw error;
            return Object.fromEntries((data || []).map(row => [row.title_id, number(row.holder_count)]));
        } catch (_) { return {}; }
    }
    let dynamicCountsCache = { expiresAt: 0, counts: {} };
    async function topTieIds(table, idField, column, { ascending = false, extra = null } = {}) {
        let topQuery = supabase.from(table).select(`${idField},${column}`).gt(column, 0);
        if (typeof extra === 'function') topQuery = extra(topQuery);
        const { data: top, error: topError } = await topQuery.order(column, { ascending }).limit(1);
        if (topError) throw topError;
        if (!top?.length) return new Set();
        const value = number(top[0][column]);
        let tieQuery = supabase.from(table).select(idField).eq(column, value);
        if (typeof extra === 'function') tieQuery = extra(tieQuery);
        const { data: ties, error: tieError } = await tieQuery;
        if (tieError) throw tieError;
        return new Set((ties || []).map(row => String(row[idField])));
    }
    async function dynamicHolderCounts() {
        if (dynamicCountsCache.expiresAt > Date.now()) return dynamicCountsCache.counts;
        try {
            const rankSets = {};
            await Promise.all(Object.entries(MAIN_RANKS).map(async ([game, column]) => {
                rankSets[game] = await topTieIds('users', 'telegram_id', column);
            }));
            rankSets.monopoly = await topTieIds('monopoly_rating', 'uid', 'points', {
                extra: query => query.gt('games', 0),
            });
            const counts = {};
            Object.entries(rankSets).forEach(([game, ids]) => { counts[`leader_${game}`] = ids.size; });
            const firstPlaces = new Map();
            Object.values(rankSets).forEach(ids => ids.forEach(id => firstPlaces.set(id, number(firstPlaces.get(id)) + 1)));
            counts.absolute_champion = [...firstPlaces.values()].filter(value => value >= 3).length;
            counts.spark_crown = [...firstPlaces.values()].filter(value => value >= 7).length;

            const saperSets = await Promise.all([6,8,10,15].map(mode =>
                topTieIds('users', 'telegram_id', `saper_best_${mode}`, {
                    ascending: true,
                    extra: query => query.lt(`saper_best_${mode}`, 9999),
                })));
            let mineSense = new Set(saperSets[0] || []);
            for (const ids of saperSets.slice(1)) mineSense = new Set([...mineSense].filter(id => ids.has(id)));
            counts.saper_mine_sense = mineSense.size;
            dynamicCountsCache = { expiresAt: Date.now() + 30_000, counts };
            return counts;
        } catch (error) {
            log.warn?.('[titles] dynamic holder counts:', error.message);
            return dynamicCountsCache.counts;
        }
    }
    function enqueue(userId, task) {
        const id = String(userId), previous = chains.get(id) || Promise.resolve();
        const current = previous.then(task, task);
        chains.set(id, current.catch(() => {}));
        return current;
    }
    async function record(userId, event = {}) {
        return enqueue(userId, async () => {
            const state = await dbState(userId);
            const eventId = String(event.eventId || '');
            const recent = safeObject(state.progress.recentEvents);
            if (eventId && recent[eventId]) return [];
            state.progress = applyEvent(state.progress, event);
            if (eventId) {
                const entries = Object.entries({ ...recent, [eventId]: Date.now() }).sort((a,b) => b[1] - a[1]).slice(0, 80);
                state.progress.recentEvents = Object.fromEntries(entries);
            }
            let ranks = null;
            if (event.checkRanks) {
                try { ranks = await rankState(userId); } catch (error) { log.warn?.('[titles] ranks:', error.message); }
                if (ranks?.firstAny) state.progress.everFirst = true;
            }
            const stats = { ...(await readStats(userId)), ...safeObject(event.stats) };
            const awards = evaluate(state.progress, stats, new Set(state.titles.keys()), ranks);
            await saveProgress(userId, state);
            return saveAwards(userId, state, awards);
        });
    }
    async function collection(userId, { registerOpen = false } = {}) {
        if (registerOpen) await record(userId, { type: 'app_open', at: Date.now(), checkRanks: true });
        return enqueue(userId, async () => {
            const state = await dbState(userId);
            let ranks = null;
            let ranksLoaded = false;
            try { ranks = await rankState(userId); ranksLoaded = true; }
            catch (error) { log.warn?.('[titles] ranks:', error.message); }
            if (ranks?.firstAny) state.progress.everFirst = true;
            const stats = await readStats(userId);
            const awards = evaluate(state.progress, stats, new Set(state.titles.keys()), ranks);
            await saveProgress(userId, state);
            await saveAwards(userId, state, awards);
            // Keep the last confirmed dynamic set during a temporary database
            // failure. A network hiccup must never unequip a title the player
            // legitimately held a moment earlier.
            const activeDynamic = new Set(state.progress.activeDynamicIds || []);
            const mainDynamicIds = [
                ...Object.keys(MAIN_RANKS).map(game => `leader_${game}`),
                'leader_monopoly', 'absolute_champion', 'spark_crown',
            ];
            if (ranksLoaded) {
                mainDynamicIds.forEach(id => activeDynamic.delete(id));
                Object.entries(ranks.first || {}).forEach(([game, active]) => { if (active) activeDynamic.add(`leader_${game}`); });
                if (ranks.firstCount >= 3) activeDynamic.add('absolute_champion');
                if (ranks.firstCount >= 7) activeDynamic.add('spark_crown');
            }
            // Special Minesweeper title uses the four time boards, not the main wins board.
            let mineSenseLoaded = false;
            try {
                const modes = [6,8,10,15]; let allFirst = true;
                for (const mode of modes) {
                    const column = `saper_best_${mode}`;
                    const [{ data: own, error: ownError }, { data: top, error: topError }] = await Promise.all([
                        supabase.from('users').select(column).eq('telegram_id', String(userId)).maybeSingle(),
                        supabase.from('users').select(column).gt(column, 0).lt(column, 9999).order(column, { ascending: true }).limit(1),
                    ]);
                    if (ownError) throw ownError;
                    if (topError) throw topError;
                    if (!(number(own?.[column]) > 0 && number(own?.[column]) === number(top?.[0]?.[column]))) { allFirst = false; break; }
                }
                mineSenseLoaded = true;
                activeDynamic.delete('saper_mine_sense');
                if (allFirst) activeDynamic.add('saper_mine_sense');
            } catch (error) { log.warn?.('[titles] Minesweeper ranks:', error.message); }
            if (ranksLoaded || mineSenseLoaded) {
                state.progress.activeDynamicIds = [...activeDynamic];
                await saveProgress(userId, state);
            }
            // Dynamic titles remain equippable only while active, but their
            // first activation is still stored so the player receives the same
            // one-time reward presentation as for every other title.
            await saveAwards(userId, state, [...activeDynamic]);
            if (state.selectedTitleId && BY_ID.get(state.selectedTitleId)?.dynamic && !activeDynamic.has(state.selectedTitleId)) {
                state.selectedTitleId = null; await saveProgress(userId, state);
            }
            const counts = await holderCounts();
            TITLES.filter(item => item.dynamic).forEach(item => { delete counts[item.id]; });
            Object.assign(counts, await dynamicHolderCounts());
            const unlocked = Object.fromEntries([...state.titles.entries()].map(([id,row]) => [id, row]));
            const pending = [...state.titles.values()].filter(row => !row.seen_at).sort((a,b) => new Date(a.unlocked_at) - new Date(b.unlocked_at)).map(row => row.title_id);
            return { catalog: TITLES, rarities: RARITIES, games: GAME_LABELS, unlocked, active_dynamic: [...activeDynamic], selected_title_id: state.selectedTitleId, holder_counts: counts, pending, storage: state.storage };
        });
    }
    async function select(userId, titleId) {
        return enqueue(userId, async () => {
            const id = String(titleId || '');
            if (!BY_ID.has(id)) throw new Error('Unknown title');
            const state = await dbState(userId);
            if (BY_ID.get(id).dynamic) {
                const ranks = await rankState(userId);
                let active = id === 'absolute_champion' ? ranks.firstCount >= 3
                    : id === 'spark_crown' ? ranks.firstCount >= 7
                    : id.startsWith('leader_') ? !!ranks.first[id.slice('leader_'.length)]
                    : false;
                if (id === 'saper_mine_sense') {
                    active = true;
                    for (const mode of [6,8,10,15]) {
                        const column = `saper_best_${mode}`;
                        const [{ data: own, error: ownError }, { data: top, error: topError }] = await Promise.all([
                            supabase.from('users').select(column).eq('telegram_id', String(userId)).maybeSingle(),
                            supabase.from('users').select(column).gt(column, 0).lt(column, 9999).order(column, { ascending: true }).limit(1),
                        ]);
                        if (ownError) throw ownError;
                        if (topError) throw topError;
                        if (!(number(own?.[column]) > 0 && number(own?.[column]) === number(top?.[0]?.[column]))) { active = false; break; }
                    }
                }
                if (!active) throw new Error('Title is not active');
            } else if (!state.titles.has(id)) throw new Error('Title is locked');
            state.selectedTitleId = id; await saveProgress(userId, state); return id;
        });
    }
    async function acknowledge(userId, titleIds) {
        const ids = unique(titleIds).filter(id => BY_ID.has(id));
        if (!ids.length) return;
        return enqueue(userId, async () => {
            const state = await dbState(userId), now = new Date().toISOString();
            if (state.storage === 'memory') {
                ids.forEach(id => { const row = state.titles.get(id); if (row) row.seen_at = now; }); return;
            }
            const { error } = await supabase.from('player_titles').update({ seen_at: now }).eq('telegram_id', String(userId)).in('title_id', ids);
            if (error) throw error;
        });
    }
    return { record, collection, select, acknowledge, rankState };
}

module.exports = { TITLES, RARITIES, GAME_LABELS, evaluate, applyEvent, makeTitleService };
