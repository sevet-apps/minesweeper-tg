/* Spark: говорящие фигуры. После каждого хода какая-нибудь фигура говорит
   реплику, и она зависит от хода: фигура здоровается с соседом, оплакивает
   срубленного, хвастается, паникует под шахом, мстит за друга. У пешек есть
   имена, а движок помнит, кто с кем здоровался и кто кого срубил, — так за
   партию складывается свой сюжет. Маты замаскированы символами.
   Без DOM: работает и в Mini App (globalThis.SparkChessTalk), и в тестах (require).
   onMove(chess, move) получает chess.js после хода и его verbose-ход (с before/after). */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkChessTalk = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    const FILES = 'abcdefgh';

    const NAMES = {
        ru: ['Вася', 'Петя', 'Коля', 'Толя', 'Гоша', 'Миша', 'Паша', 'Лёха', 'Серёга', 'Саня', 'Димон', 'Жора', 'Вован', 'Стёпа', 'Федя', 'Гена', 'Тёма', 'Костя', 'Валера', 'Юра', 'Женя', 'Славик', 'Боря', 'Гриша'],
        en: ['Bob', 'Tim', 'Joe', 'Max', 'Sam', 'Dan', 'Ben', 'Tom', 'Jack', 'Leo', 'Ray', 'Gus', 'Ted', 'Hank', 'Earl', 'Ned', 'Phil', 'Rick', 'Carl', 'Stan', 'Larry', 'Barry', 'Gary', 'Kevin'],
    };
    // Как фигуру называют в репликах: именительный, винительный, родительный, дательный.
    const ROLE = {
        ru: { p: ['пешка', 'пешку', 'пешки', 'пешке'], n: ['конь', 'коня', 'коня', 'коню'], b: ['слон', 'слона', 'слона', 'слону'], r: ['ладья', 'ладью', 'ладьи', 'ладье'], q: ['ферзь', 'ферзя', 'ферзя', 'ферзю'], k: ['король', 'короля', 'короля', 'королю'] },
        en: { p: 'the pawn', n: 'the knight', b: 'the bishop', r: 'the rook', q: 'the queen', k: 'the king' },
    };

    /** Падежи мужского имени: Вася → Васю, Васи, Васе; Димон → Димона, Димона, Димону. */
    function ruForms(name) {
        const stem = name.slice(0, -1), end = name.slice(-1);
        if (end === 'я') return [name, `${stem}ю`, `${stem}и`, `${stem}е`];
        if (end === 'а') return [name, `${stem}у`, stem + (/[гкхжшщч]$/.test(stem) ? 'и' : 'ы'), `${stem}е`];
        return [name, `${name}а`, `${name}а`, `${name}у`];
    }

    /* ---------- Реплики ----------
       Ключ — ситуация. Строка — реплика; пара [реплика, ответ] — мини-диалог:
       отвечает тот, к кому обратились. {t} — тот, о ком речь (имя пешки или
       «конь», «ладья»…), {T} — то же с большой буквы, {t_acc} / {t_gen} /
       {t_dat} — в винительном, родительном и дательном падеже, {me} — имя
       говорящей пешки. greet_xy — фигура x здоровается с соседом y. */
    const BANK = {
        ru: {
            first: ['Ну, понеслась!', 'Погнали!', 'Поехали!', 'Всем удачи. Особенно мне', 'Ну что, пацаны, работаем', 'Главное — не зевать'],
            firstReply: ['Ну давай, удиви меня', 'Видали и не такое', 'Ага, начинается', 'Ну-ну', 'Окей, мы в деле'],
            move_p: ['Топ-топ', 'Вперёд, пацаны!', 'Шаг за шагом', '{me} на позиции', 'Маленький шаг для пешки...', 'Я просто пешка, мне можно', 'Иду, никого не трогаю', 'Назад дороги нет. Буквально', 'Кто, если не я?', 'Пешка — это звучит гордо', 'Меня зовут {me}, если что', 'Мама, я на передовой', 'Строем, пацаны, строем'],
            move_n: ['Иго-го!', 'Буквой Г, как учили', 'Прыг-скок', 'Никто не понимает, как я хожу', 'Через головы — моя фишка', 'Цок-цок', 'Я не осёл, я конь!', 'Кривые дорожки — мои любимые', 'Тпру, приехали', 'Галопом!'],
            move_b: ['По диагонали, как всегда', 'Слон идёт — разойдитесь', 'Только по своим клеткам', 'Я вижу всё насквозь', 'Лысый на позиции', 'Наискосок — значит быстрее', 'Прямо ходить скучно', 'Длинная диагональ — моя слабость'],
            move_r: ['Башня на позиции', 'Еду только прямо', 'Открытая вертикаль — кайф', 'Сдвинуть меня? Попробуй', 'Ладья выходит из тени', 'Тяжёлая фигура, расступись', 'Прямо и без лишних слов', 'Тут и встану'],
            move_q: ['Мама пришла', 'Я везде', 'Куда хочу, туда хожу', 'Кто тут главный? Я', 'Расступитесь, ферзь идёт', 'Королева не спрашивает', 'Делай, как мама', 'Мне и полдоски мало'],
            move_k: ['Шаг. Осторожно.', 'Королям тоже надо размяться', 'Я просто проверить', 'Охрана, за мной', 'Не толкайтесь, я король', 'Одна клетка — и уже устал', 'Неспешно, по-королевски', 'Король идёт, всем встать'],

            greet_pn: [['Привет, осёл', 'Я конь, вообще-то'], ['Здарова, лошадка', 'Иго-го, малой'], 'Конь, подвинь копыто', ['Покатаешь?', 'Я тебе не такси'], 'О, ослик!'],
            greet_pb: [['Привет, лысый', 'Я не лысый, это шапка такая'], 'Здарова, слон', ['Слон, а хобот где?', 'Не начинай'], 'Слон, прикрой, если что'],
            greet_pr: [['Здарова, башня', 'Привет, малой'], 'Ладья, можно я за тобой постою?', ['А правда, что ты в углу живёшь?', 'Жила. Теперь тут'], 'Тётя ладья, привет'],
            greet_pq: [['Мам, привет!', 'Не мешайся под ногами'], 'Ой, королева! Здрасьте', ['Мамка, я тебя прикрою', 'Себя прикрой'], 'Королева рядом — я спокоен'],
            greet_pk: [['Батя, здарова', 'Не батя, а ваше величество'], 'Ваше величество, я за вас умру', ['Король, а можно автограф?', 'Потом, малой'], 'Не бойся, бать, я рядом'],
            greet_pp: [['Здарова, {t}', 'Здарова'], 'Привет, {t}. Держим строй', ['{T}, ты как?', 'Пока живой'], 'Пацаны, все в сборе', ['{T}, прикрой спину', 'Уже'], 'Плечом к плечу, {t}'],
            greet_np: [['Здорово, мелкий', 'Привет, осёл'], 'Пацан, не путайся под копытами', ['{T}, держись за гриву', 'Ты ж меня уронишь'], 'Не бойся, я тебя прикрою'],
            greet_nn: [['Брат!', 'Брат!'], 'Два коня — уже табун', ['Иго-го?', 'Иго-го']],
            greet_nb: [['Слон, меняемся: тебе копыта, мне хобот', 'Чего?'], 'Привет, лысый', ['Почему ты ходишь криво?', 'Кто бы говорил']],
            greet_nr: ['Башня, привет', ['Ладья, не скучно прямо ходить?', 'А тебе не стыдно буквой Г?']],
            greet_nq: [['Королева, я к вашим услугам', 'Свободен'], 'Мамка, подвинься чуток', ['Королева, вы прекрасны', 'Я знаю']],
            greet_nk: [['Ваше величество, конь прибыл', 'Вольно'], 'Батя, я рядом, не дрейфь', ['Король, садись, подвезу', 'Мне по статусу не положено']],
            greet_bp: [['Пешка, не загораживай', 'Обойдёшь, ты же наискосок'], 'Привет, {t}', 'Мелочь, держи диагональ'],
            greet_bn: [['О, осёл', 'Да что вы все заладили'], 'Привет, лошадка'],
            greet_bb: [['Коллега!', 'Мы на разных цветах, не путай'], 'Два слона — это сила'],
            greet_br: [['Ладья, вместе мы — ферзь', 'Не льсти себе'], 'Привет, башня'],
            greet_bq: [['Королева, я на подхвате', 'Ну хоть кто-то'], 'Мадам'],
            greet_bk: [['Ваше величество, благословите', 'Иди уже'], 'Я тут, король. Прикрываю'],
            greet_rp: ['Мелкий, освободи вертикаль', ['{T}, ты мне всю линию загородил', 'Мне больше идти некуда']],
            greet_rn: [['Осёл, подвинься', 'Ну хоть ты не начинай'], 'Привет, копытный'],
            greet_rb: [['Слон, ты опять криво встал', 'Это диагональ, деревня']],
            greet_rr: [['Сдвоились!', 'Как в старые добрые'], 'Две ладьи — это мощь'],
            greet_rq: [['Королева, я с вами', 'Не отставай'], 'Мамка, давай вдвоём по вертикали'],
            greet_rk: [['Король, я тебя охраняю', 'Ага, из угла'], 'Батя, я рядом'],
            greet_qp: [['Сынок, не высовывайся', 'Мам, ну я же взрослый'], 'Пешечка моя', ['{T}, ты поел?', 'Мам, мы в партии!']],
            greet_qn: [['Мой верный конь', 'Иго-го, королева'], 'Осёл, не отставай'],
            greet_qb: [['Слон, за мной', 'Есть, мэм']],
            greet_qr: [['Ладья, у нас тут дела', 'Всегда готова']],
            greet_qq: [['Королев две? Мне не нравится', 'Привыкай']],
            greet_qk: [['Дорогой, ты как?', 'Нормально, пока ты рядом'], 'Король, не высовывайся', ['Милый, опять ты без охраны', 'Ты моя охрана']],
            greet_kp: [['Солдат!', 'Служу королю!'], 'Прикрой меня, {t}', ['{T}, ты мой любимый', 'Вы всем так говорите']],
            greet_kn: [['Где мой конь?', 'Тут я, ваше величество'], 'Привет, осёл'],
            greet_kb: [['Слон, ты мне нужен', 'Слушаюсь']],
            greet_kr: [['Ладья, будь рядом', 'Только не прячься за меня']],
            greet_kq: [['Дорогая!', 'Не отвлекай, я работаю'], 'Королева, прикрой'],
            greetAgain: ['Опять ты?', 'Мы уже здоровались', 'Снова здравствуйте', 'Ты меня преследуешь?', 'Так, {t}, это уже не смешно', 'Скучал по мне?', 'Привет ещё раз, {t}', 'Мы что, теперь соседи?'],
            stare: [['Чё смотришь?', 'А чё, нельзя?'], 'Ну привет, сосед', ['Дыши в другую сторону', 'Сам дыши'], 'Даже не думай', ['Ты кто такой?', 'Твой ночной кошмар'], 'Здесь тебе не рады', ['Мы с тобой где-то встречались?', 'В прошлой партии'], 'Уходи по-хорошему', ['Подвинься', 'Сам подвинься'], 'Близко стоим. Неуютно', ['Ты чего такой нервный?', 'Шахматы, брат']],

            checkTaunt: ['Шах, дедуля', 'Тук-тук', 'Ку-ку!', 'Ваше величество, на выход', 'Шах! Я просто напомнить', 'Король, ты где прячешься?', 'Сюрприз, ваше величество', 'Шах. Беги', 'Привет от нашего короля', 'Не ждал?', 'Шах, и это только начало', 'Корона криво сидит'],
            checked: ['Ай!', 'Эй, полегче!', 'Охрана!', 'За что?!', 'Бл@, шах', 'Мне неприятно', 'Опять я крайний', 'Я в домике! Ну почти', 'Где охрана, когда она нужна?', 'Это покушение!', 'Так, без паники', 'Ой-ой-ой', 'Я сейчас кого-то казню'],
            doubleCheck: ['Двойной шах! Выбирай, кого бояться', 'Два шаха по цене одного', 'Двойной! Беги, король', 'Нас двое, король'],
            discovered: ['Сюрприз! Это я', 'Открылся! Шах', 'Спасибо, что ушёл с дороги', 'Вскрытый шах, учите тактику'],
            royalFork: ['Семейная вилка!', 'Король и ферзь? Беру ферзя', 'Вся семья в сборе. Ням', 'Королевская вилка, господа'],
            fork: ['Вилка! Выбирайте', 'Двоих зацепил', 'Кто-то из вас сейчас уедет', 'Вилочка, вкусно', 'Раз, два... кого первым?', 'Обоих вижу'],
            forkVictim: ['Ну всё, кого-то из нас...', 'Бл@, вилка', 'Это ловушка!', 'Я туда не смотрел'],
            hangSelf: ['Кажется, зря я сюда', 'Ой', 'Ну всё, мне конец', 'Прикройте!', 'Я тут совсем без прикрытия?', 'Чую, мне сейчас п@здец', 'Хм, а где все?', 'Это был тактический ход. Наверное'],
            hangMate: ['Ты куда полез?!', 'Вернись, дурак!', 'Ну и зачем?', 'Кто его туда пустил?', '{T}, ты в своём уме?', 'Мы тебя там не прикроем', 'Ох, ё...'],
            hangFoe: ['Бесплатно? Беру', 'Ням-ням', 'Подарок!', 'Спасибо, очень мило', 'Это мне? Не стоило', 'Сам пришёл. Уважаю', 'Иди сюда, мой хороший'],
            escape: ['Фух, пронесло', 'Не догонишь!', 'Это не побег, это манёвр', 'Я жить хочу!', 'В другой раз', 'Ищи меня теперь', 'Ноги в руки'],
            threatVictim: ['Он на меня смотрит...', 'Мне страшно', 'Чего уставился?', 'Ой, мамочки', 'Так, мне это не нравится', 'Эй, я тебя вижу!', 'Пацаны, меня сейчас съедят', 'Только не меня'],
            threaten: ['Ты следующий', 'Я тебя вижу', 'Беги', 'Иду за тобой, {t}', 'Готовься', 'Привет, обед', 'Тик-так, {t}', 'Попался'],

            mate: ['Мат. Расходимся', 'GG', 'Конец фильма', 'Шах и мат, детка', 'Занавес', 'Вот и сказочке конец', 'Ваше величество, вы уволены', 'Изи катка', 'Мат! Пацаны, мы сделали это', 'Король пал. Да здравствует наш король', 'Финита ля комедия'],
            mated: ['Я всё...', 'Пацаны, я всё', 'Бл@...', 'Пойду поплачу', 'Я сдаюсь, но я не сдавался', 'Это нечестно!', 'Реванш!', 'Ну и п#здец', 'Меня подставили'],
            stalemate: ['Пат. И куда мне идти?', 'Я никуда не пойду. Буквально', 'Ничья! Хе-хе', 'Ну, хоть не проиграли', 'Застрял. Ничья, господа'],
            draw: ['Ничья. Дружба победила', 'Ну и ладно', 'Все молодцы, все по домам', 'Ничья? Да ну вас', 'Победила скука'],
            castle: ['Переезжаем!', 'Новоселье!', 'В домик!', 'Король в безопасности. Наверное', 'Забаррикадировались', 'Прячусь за пацанов'],
            castleLong: ['Длинная рокировка — для ценителей', 'Через весь ферзевый фланг!', 'Далеко переехал, адрес новый'],
            castleRook: ['Опять я твои вещи таскаю', 'Я тут теперь живу?', 'А меня спросить?', 'Прыгнул через меня, нормально вообще?', 'Ладно, охраняю'],
            promote: ['Я теперь ФЕРЗЬ!', 'Из грязи в князи', 'Мама, я королева!', 'Кто тут пешка? Нет тут пешек', 'Карьерный рост, пацаны', 'Теперь обращайтесь на вы', '{me} теперь ферзь, запомните', 'Ох*еть, я дошёл!', 'Вот это поворот'],
            underpromote: ['Хотел в ферзи, а стал вот этим', 'Ну, хоть так', 'Скромность украшает', 'Ферзём быть скучно'],
            promoteCheer: ['{T}, ты красавчик!', 'Наш {t} выбился в люди!', 'Мы в тебя верили!', 'Так, теперь {t} у нас главный'],
            epShock: ['Это вообще законно?!', 'Так можно было?!', 'Что за беспредел?!', 'Он пешку сбоку съел!', 'Требую судью!'],
            epReply: ['Google en passant', 'Взятие на проходе, учите правила', 'Holy hell', 'Читайте правила, господа'],

            mourn: ['Press F', 'F', 'Жалко пацана', 'Бл@...', 'Покойся с миром, {t}', '{T}, нееет!', 'Минус один', 'Хороший был боец', 'Мы тебя не забудем, {t}', 'Вот и всё...', 'А ведь были планы...', 'Кто следующий?', 'Не смотрите туда', 'П@здец', 'Земля пухом, {t}', 'Ну ё-моё', 'За что?!', 'С*ка...', 'Так, пацаны, без паники', 'Как герой...', 'Помянем'],
            mourn_p: ['Пацана жалко', 'Одним пацаном меньше', '{T}, ты был лучшим из нас', 'Пешки не плачут. Но я плачу', 'Прощай, {t}', '{T}... Он мне сотку должен был'],
            mourn_n: ['Лошадку жалко', 'Нашего осла убили!', 'Иго-го... Больше не иго-го', 'Коня потеряли, бл@', 'Кто теперь будет прыгать?'],
            mourn_b: ['Слона потеряли', 'Лысого замочили!', 'Диагональ осиротела', 'Слон был лучшим. Ну, по диагонали'],
            mourn_r: ['Башню снесли!', 'Ладья всё...', 'Вертикаль опустела', 'Нашу башню!'],
            mourn_q: ['МАМКУ УБИЛИ!!!', 'Королева пала. Нам хана', 'Бл@, ферзь!', 'Без мамки мы пропали', 'Это конец, пацаны', 'П#здец нам без королевы'],
            mournFriend: ['Мы же только познакомились...', '{T}, я же тебе говорил!', 'Это был мой друг!', 'Я отомщу за тебя, {t}', '{T}, братан, нет!', 'Ты был мне как брат, {t}', 'Я запомню это'],
            brag: ['Ням', 'Следующий!', 'Изи', 'Пакуем', 'Ничего личного', 'Кто ещё хочет?', 'Вкусно', 'Минус один, {t}', 'Сам виноват', 'Прости, {t}, так надо', 'Это бизнес', 'Ещё!', 'Хрум', 'Тебя предупреждали', 'Обед подан', 'Подвинься, теперь тут я'],
            brag_p: ['Пешка, а может!', 'Маленький, да удаленький', 'Не ждали от пешки?', '{me} открыл счёт'],
            brag_n: ['Прыг — и нет тебя', 'Копытом по голове', 'Иго-го, детка', 'Откуда прилетел? Буквой Г'],
            brag_b: ['Наискосок прилетело', 'Издалека видел', 'Диагональ не прощает', 'Лысый наносит удар'],
            brag_r: ['Таран!', 'По прямой — и в лоб', 'Ладья не промахивается', 'Каток проехал'],
            brag_q: ['Мама дерётся', 'Не зли маму', 'Королева берёт, что хочет', 'Ещё кого-нибудь?'],
            brag_k: ['Король тоже умеет бить', 'Сам, всё сам', 'Королевский удар', 'Не ожидали от старика?'],
            bragBig: ['Я дешевле, а помер ты', 'Вот это я удачно зашёл', 'Дорогой трофей', 'Мама, я в телевизоре!', 'Размен века', 'Кто тут мелкий, а?'],
            revenge: ['Это тебе за {t_acc}!', 'За {t_acc}!!!', '{T}, ты отомщён', 'Карма, с*ка', 'Помнишь {t_acc}? Привет от {t_gen}', 'Это за {t_acc}, гад', 'Месть подаётся холодной', 'Вот теперь мы квиты'],
            streak2: ['Двойное убийство!', 'Минус два', 'Я только разогреваюсь', 'Два — ноль', 'Ещё одна зарубка'],
            streak3: ['Тройное! Я машина', 'Мне нужна полка для трофеев', 'Остановите меня кто-нибудь', 'Я непобедим!', 'Это уже серия', 'Кто следующий в очереди?'],
            trade: ['Размен!', 'Око за око', 'Ну всё, квиты', 'Обмен любезностями', 'Ты моего, я твоего', 'Честно', 'Баш на баш'],
            captureCheck: ['И шах в придачу', 'Съел и шах. Комбо!', 'С вас ещё шах', 'Два в одном'],

            queenEarly: ['Мама вышла на разборки', 'Рано мне? Плевать', 'Кто тут без меня скучал?', 'Королева сама разберётся', 'Не ждите меня к ужину'],
            kingWalk: ['Король пошёл гулять', 'Я просто подышать', 'Пойду посмотрю, что там', 'Королю всё можно'],
            kingWalkMate: ['Ваше величество, вернитесь!', 'Король, ты куда?!', 'Бать, тебя же убьют', 'Охрана, король сбежал!'],
            seventh: ['Ещё шаг — и я королева!', 'Вижу финиш', 'Последний рывок', 'Пацаны, я почти дошёл', 'Готовьте корону'],
            home: ['Я дома', 'Вернулся, как и не уходил', 'Нагулялся', 'Дом, милый дом'],
            retreat: ['Тактическое отступление', 'Я не убегаю, я перегруппировываюсь', 'Шаг назад, два вперёд', 'Назад, пока не поздно', 'Отходим, пацаны', 'Стратегически отступаю'],
            long: ['Вжууух', 'Через всю доску!', 'Скорость!', 'Пролетаю', 'Как ветер!'],
            again: ['Опять я? Других нет?', 'Я что, один тут работаю?', 'Можно мне отдохнуть?', 'Снова я. Ну конечно', 'Остальные спят, что ли?'],
            idle: ['А про меня вообще забыли?', 'Я тут с начала партии стою', 'Ну хоть бы раз позвали', 'Эй, я тоже фигура!', 'Мне скучно', 'Можно мне тоже походить?'],
            milestone: ['Что-то мы долго', 'Я уже устал', 'Кто-нибудь, закончите это', 'У меня ноги затекли', 'Сколько можно-то?'],
            lonely: ['Нас осталось мало', 'Где все?', 'Эхо...', 'Одиноко как-то', 'Пацаны? Пацаны?!'],
            hello: ['О, мы теперь разговариваем?', 'Наконец-то! Молчать надоело', 'Раз-раз. Меня слышно?', 'Привет! Мы теперь болтаем'],
        },
        en: {
            first: ['Here we go!', 'Let’s roll!', 'Good luck, everyone. Mostly me', 'Okay boys, to work', 'Rule one: don’t blunder', 'And so it begins'],
            firstReply: ['Go on, surprise me', 'Seen worse', 'Oh, it’s starting', 'Sure, sure', 'Okay, we’re in'],
            move_p: ['Step, step', 'Forward, boys!', 'One square at a time', '{me} in position', 'One small step for a pawn...', 'I’m just a pawn, I’m allowed', 'Walking, minding my business', 'No going back. Literally', 'If not me, then who?', 'Pawn and proud', 'Name’s {me}, by the way', 'Mom, I’m on the front line', 'Keep the line, boys'],
            move_n: ['Neigh!', 'L-shape, like they taught me', 'Hop!', 'Nobody gets how I move', 'Jumping over heads is my thing', 'Clip-clop', 'I’m a horse, not a donkey!', 'Crooked paths are the best', 'Whoa, we’re here', 'Gallop!'],
            move_b: ['Diagonal, as usual', 'Bishop coming through', 'My colour only, thanks', 'I see right through you', 'Baldy in position', 'Diagonal is faster, trust me', 'Straight lines are boring', 'Long diagonal, my weakness'],
            move_r: ['Tower in position', 'Straight lines only', 'Open file, love it', 'Move me? Try it', 'The rook steps out of the shadows', 'Heavy piece coming through', 'Straight to the point', 'I’ll park right here'],
            move_q: ['Mom’s here', 'I’m everywhere', 'I go where I want', 'Who’s the boss? Me', 'Make way for the queen', 'The queen doesn’t ask', 'Do it like mom', 'Half the board isn’t enough for me'],
            move_k: ['One step. Carefully.', 'Kings need a stretch too', 'Just checking', 'Guards, follow me', 'Don’t push, I’m the king', 'One square and I’m tired', 'Slow and royal', 'All rise, the king is moving'],

            greet_pn: [['Hi, donkey', 'I’m a horse, actually'], ['Yo, pony', 'Neigh, kid'], 'Horse, move your hoof', ['Give me a ride?', 'I’m not a taxi'], 'Oh, a donkey!'],
            greet_pb: [['Hi, baldy', 'It’s a hat, not a bald head'], 'Yo, bishop', ['Bishop, bless me?', 'Don’t start'], 'Bishop, cover me if anything'],
            greet_pr: [['Yo, tower', 'Hey, kid'], 'Rook, can I stand behind you?', ['Is it true you live in a corner?', 'Used to. Now here'], 'Hi, auntie rook'],
            greet_pq: [['Hi, mom!', 'Stop getting under my feet'], 'Oh, your majesty! Hello', ['Mom, I’ll cover you', 'Cover yourself'], 'Queen nearby, I’m calm'],
            greet_pk: [['Yo, dad', 'Not dad. Your majesty'], 'Your majesty, I’d die for you', ['King, can I get an autograph?', 'Later, kid'], 'Don’t worry, dad, I’m here'],
            greet_pp: [['Yo, {t}', 'Yo'], 'Hi, {t}. Hold the line', ['{T}, how are you?', 'Still alive'], 'The boys are all here', ['{T}, watch my back', 'Already on it'], 'Shoulder to shoulder, {t}'],
            greet_np: [['Hey, shorty', 'Hi, donkey'], 'Kid, stay away from my hooves', ['{T}, hold on to my mane', 'You’ll drop me'], 'Don’t worry, I’ve got you'],
            greet_nn: [['Brother!', 'Brother!'], 'Two horses, that’s a herd', ['Neigh?', 'Neigh']],
            greet_nb: [['Baldy, let’s trade: my hooves for your hat', 'What?'], 'Hi, baldy', ['Why do you walk crooked?', 'Look who’s talking']],
            greet_nr: ['Hi, tower', ['Rook, isn’t moving straight boring?', 'Isn’t moving in L’s embarrassing?']],
            greet_nq: [['My queen, at your service', 'Dismissed'], 'Mom, scoot over a bit', ['My queen, you look stunning', 'I know']],
            greet_nk: [['Your majesty, the horse has arrived', 'At ease'], 'Dad, I’m here, don’t panic', ['King, hop on, I’ll give you a lift', 'Not proper for my rank']],
            greet_bp: [['Pawn, you’re blocking me', 'Go around, you’re diagonal anyway'], 'Hi, {t}', 'Little guy, hold the diagonal'],
            greet_bn: [['Oh, a donkey', 'Why does everyone keep saying that'], 'Hi, pony'],
            greet_bb: [['Colleague!', 'We’re on different colours, don’t mix us up'], 'Two bishops, that’s power'],
            greet_br: [['Rook, together we’re a queen', 'Don’t flatter yourself'], 'Hi, tower'],
            greet_bq: [['My queen, I’m on standby', 'Finally someone useful'], 'Madam'],
            greet_bk: [['Your majesty, bless you', 'Just go already'], 'I’m here, king. Covering you'],
            greet_rp: ['Kid, clear the file', ['{T}, you’re blocking my whole line', 'I literally can’t move']],
            greet_rn: [['Donkey, move over', 'Not you too'], 'Hi, hooves'],
            greet_rb: [['Bishop, you’re standing crooked again', 'It’s called a diagonal']],
            greet_rr: [['Doubled up!', 'Just like old times'], 'Two rooks, that’s raw power'],
            greet_rq: [['Queen, I’m with you', 'Keep up'], 'Mom, let’s take this file together'],
            greet_rk: [['King, I’m guarding you', 'Yeah, from the corner'], 'Dad, I’m right here'],
            greet_qp: [['Son, keep your head down', 'Mom, I’m a grown-up'], 'My little pawn', ['{T}, did you eat?', 'Mom, we’re in a game!']],
            greet_qn: [['My trusty steed', 'Neigh, my queen'], 'Donkey, keep up'],
            greet_qb: [['Bishop, follow me', 'Yes, ma’am']],
            greet_qr: [['Rook, we’ve got business', 'Always ready']],
            greet_qq: [['Two queens? I don’t like it', 'Get used to it']],
            greet_qk: [['Honey, how are you?', 'Fine, as long as you’re near'], 'King, stay down', ['Darling, no guards again?', 'You are my guard']],
            greet_kp: [['Soldier!', 'Serving the king!'], 'Cover me, {t}', ['{T}, you’re my favourite', 'You say that to everyone']],
            greet_kn: [['Where’s my horse?', 'Right here, your majesty'], 'Hi, donkey'],
            greet_kb: [['Bishop, I need you', 'At your service']],
            greet_kr: [['Rook, stay close', 'Just don’t hide behind me']],
            greet_kq: [['Darling!', 'Not now, I’m working'], 'Queen, cover me'],
            greetAgain: ['You again?', 'We’ve said hi already', 'Hello again', 'Are you following me?', 'Okay, {t}, this isn’t funny anymore', 'Missed me?', 'Hi again, {t}', 'So we’re neighbours now?'],
            stare: [['What are you looking at?', 'Can’t I look?'], 'Well, hello, neighbour', ['Breathe the other way', 'You breathe the other way'], 'Don’t even think about it', ['Who are you?', 'Your worst nightmare'], 'You’re not welcome here', ['Have we met before?', 'Last game'], 'Walk away while you can', ['Scoot over', 'You scoot over'], 'Standing too close. Awkward', ['Why so nervous?', 'It’s chess, bro']],

            checkTaunt: ['Check, grandpa', 'Knock knock', 'Peekaboo!', 'Your majesty, out you go', 'Check! Just a reminder', 'King, where are you hiding?', 'Surprise, your majesty', 'Check. Run', 'Greetings from our king', 'Didn’t see that coming?', 'Check, and that’s just the start', 'Your crown is crooked'],
            checked: ['Ouch!', 'Hey, easy!', 'Guards!', 'What for?!', 'Sh*t, check', 'I don’t like this', 'Always me', 'I’m safe! Almost', 'Where are my guards when I need them?', 'This is an assassination attempt!', 'Okay, no panic', 'Oh no no no', 'Someone’s getting executed for this'],
            doubleCheck: ['Double check! Pick which one to fear', 'Two checks for the price of one', 'Double! Run, king', 'There are two of us, king'],
            discovered: ['Surprise! It was me', 'Unveiled! Check', 'Thanks for getting out of the way', 'Discovered check, learn your tactics'],
            royalFork: ['Family fork!', 'King and queen? I’ll take the queen', 'The whole family. Yum', 'Royal fork, gentlemen'],
            fork: ['Fork! Pick one', 'Got two of you', 'One of you is leaving', 'Forky fork, delicious', 'One, two... who’s first?', 'I see you both'],
            forkVictim: ['Well, one of us is done...', 'Damn, a fork', 'It’s a trap!', 'I wasn’t looking there'],
            hangSelf: ['Maybe coming here was a mistake', 'Oops', 'Well, I’m dead', 'Cover me!', 'No cover at all here?', 'I’m so f*cked', 'Hmm, where is everyone?', 'That was tactical. Probably'],
            hangMate: ['Where are you going?!', 'Come back, you idiot!', 'But why?', 'Who let them go there?', '{T}, are you out of your mind?', 'We can’t cover you there', 'Oh, sh*t...'],
            hangFoe: ['Free? I’ll take it', 'Yum yum', 'A gift!', 'Thanks, how sweet', 'For me? You shouldn’t have', 'Came by yourself. Respect', 'Come here, sweetie'],
            escape: ['Phew, close one', 'Can’t catch me!', 'Not running, just manoeuvring', 'I want to live!', 'Some other time', 'Good luck finding me now', 'Feet, don’t fail me now'],
            threatVictim: ['They’re staring at me...', 'I’m scared', 'What are you staring at?', 'Oh mommy', 'Okay, I don’t like this', 'Hey, I see you!', 'Guys, I’m about to get eaten', 'Not me, please'],
            threaten: ['You’re next', 'I see you', 'Run', 'Coming for you, {t}', 'Get ready', 'Hello, lunch', 'Tick tock, {t}', 'Gotcha'],

            mate: ['Mate. We’re done here', 'GG', 'The end', 'Checkmate, baby', 'Curtain', 'And they lived happily never after', 'Your majesty, you’re fired', 'Easy game', 'Mate! Boys, we did it', 'The king is dead. Long live our king', 'That’s all, folks'],
            mated: ['I’m done...', 'Guys, I’m done', 'F*ck...', 'Gonna go cry', 'I resign, but I didn’t give up', 'That’s not fair!', 'Rematch!', 'Well, sh*t', 'I was set up'],
            stalemate: ['Stalemate. Where am I supposed to go?', 'I’m not going anywhere. Literally', 'A draw! Heh heh', 'Well, at least we didn’t lose', 'Stuck. Draw, gentlemen'],
            draw: ['Draw. Friendship wins', 'Fine, whatever', 'Good job, everyone, go home', 'A draw? Oh come on', 'Boredom wins'],
            castle: ['Moving house!', 'Housewarming!', 'Into the bunker!', 'King is safe. Probably', 'Barricaded', 'Hiding behind the boys'],
            castleLong: ['Long castle, for connoisseurs', 'All the way to the queenside!', 'Moved far, new address'],
            castleRook: ['Carrying your stuff again', 'So I live here now?', 'Nobody asked me?', 'You just jumped over me. Cool', 'Fine, I’ll guard'],
            promote: ['I’m a QUEEN now!', 'From rags to riches', 'Mom, I’m a queen!', 'Pawns? I see no pawns here', 'Career growth, boys', 'Address me as your majesty now', '{me} is a queen now, remember that', 'Holy sh*t, I made it!', 'What a plot twist'],
            underpromote: ['Wanted to be a queen, became this', 'Well, better than nothing', 'Modesty is a virtue', 'Being a queen is boring'],
            promoteCheer: ['{T}, you legend!', 'Our {t} made it big!', 'We believed in you!', 'Okay, {t} is the boss now'],
            epShock: ['Is that even legal?!', 'You can do that?!', 'What is this lawlessness?!', 'He ate a pawn from the side!', 'I demand a referee!'],
            epReply: ['Google en passant', 'En passant, read the rules', 'Holy hell', 'Read the rulebook, folks'],

            mourn: ['Press F', 'F', 'Poor guy', 'Sh*t...', 'Rest in peace, {t}', '{T}, nooo!', 'Minus one', 'Good soldier', 'We won’t forget you, {t}', 'And that’s it...', 'And there were plans...', 'Who’s next?', 'Don’t look over there', 'F*ck', 'Rest easy, {t}', 'Oh, come on', 'What for?!', 'B*tch...', 'Okay boys, no panic', 'Like a hero...', 'A moment of silence'],
            mourn_p: ['Poor kid', 'One pawn less', '{T}, you were the best of us', 'Pawns don’t cry. But I do', 'Goodbye, {t}', '{T}... He owed me a hundred bucks'],
            mourn_n: ['Poor pony', 'They killed our donkey!', 'Neigh... no more neigh', 'Lost the horse, damn it', 'Who’s gonna jump now?'],
            mourn_b: ['Lost the bishop', 'They whacked baldy!', 'The diagonal is orphaned', 'The bishop was the best. Diagonally'],
            mourn_r: ['They took down the tower!', 'The rook is done...', 'The file is empty now', 'Our tower!'],
            mourn_q: ['THEY KILLED MOM!!!', 'The queen has fallen. We’re doomed', 'Sh*t, the queen!', 'We’re lost without mom', 'This is the end, boys', 'We’re f*cked without the queen'],
            mournFriend: ['But we just met...', '{T}, I told you!', 'That was my friend!', 'I’ll avenge you, {t}', '{T}, bro, no!', 'You were like a brother to me, {t}', 'I’ll remember this'],
            brag: ['Yum', 'Next!', 'Easy', 'Bagged it', 'Nothing personal', 'Who else wants some?', 'Tasty', 'Minus one, {t}', 'Your own fault', 'Sorry, {t}, had to', 'It’s just business', 'More!', 'Crunch', 'You were warned', 'Dinner is served', 'Move over, this is my spot now'],
            brag_p: ['A pawn can do it too!', 'Small but mighty', 'Didn’t expect that from a pawn?', '{me} opens the score'],
            brag_n: ['Hop, and you’re gone', 'Hoof to the head', 'Neigh, baby', 'Where did I come from? L-shape'],
            brag_b: ['Diagonal delivery', 'Saw you from afar', 'The diagonal never forgives', 'Baldy strikes'],
            brag_r: ['Battering ram!', 'Straight to the face', 'The rook never misses', 'Steamroller'],
            brag_q: ['Mom fights', 'Don’t make mom angry', 'The queen takes what she wants', 'Anyone else?'],
            brag_k: ['Kings can fight too', 'Have to do everything myself', 'Royal strike', 'Didn’t expect that from an old man?'],
            bragBig: ['I’m cheaper and you still lost', 'What a good deal', 'Expensive trophy', 'Mom, I’m on TV!', 'Trade of the century', 'Who’s small now, huh?'],
            revenge: ['This is for {t}!', 'For {t}!!!', '{T}, you’re avenged', 'Karma’s a b*tch', 'Remember {t}? {T} says hi', 'That’s for {t}, you rat', 'Revenge is a dish best served cold', 'Now we’re even'],
            streak2: ['Double kill!', 'Minus two', 'Just warming up', 'Two-nil', 'Another notch'],
            streak3: ['Triple! I’m a machine', 'I need a trophy shelf', 'Somebody stop me', 'I’m unstoppable!', 'This is a killing spree', 'Who’s next in line?'],
            trade: ['A trade!', 'An eye for an eye', 'Okay, we’re even', 'Exchange of pleasantries', 'You took mine, I took yours', 'Fair', 'Tit for tat'],
            captureCheck: ['And a check for dessert', 'Ate it and check. Combo!', 'You also owe me a check', 'Two in one'],

            queenEarly: ['Mom’s out to settle things', 'Too early for me? Don’t care', 'Who missed me?', 'The queen will handle it', 'Don’t wait up for me'],
            kingWalk: ['The king goes for a walk', 'Just getting some air', 'Let me see what’s over there', 'A king can do anything'],
            kingWalkMate: ['Your majesty, come back!', 'King, where are you going?!', 'Dad, they’ll kill you', 'Guards, the king escaped!'],
            seventh: ['One more step and I’m a queen!', 'I can see the finish', 'Final push', 'Boys, I’m almost there', 'Get the crown ready'],
            home: ['I’m home', 'Back like I never left', 'Had enough walking', 'Home, sweet home'],
            retreat: ['Tactical retreat', 'Not running, regrouping', 'One step back, two forward', 'Back off while we can', 'Fall back, boys', 'Strategic withdrawal'],
            long: ['Whoosh', 'All the way across!', 'Speed!', 'Flying by', 'Like the wind!'],
            again: ['Me again? Nobody else?', 'Am I the only one working here?', 'Can I take a break?', 'Me again. Of course', 'Is everyone else asleep?'],
            idle: ['Did everyone forget about me?', 'Been standing here since move one', 'Could you call me just once?', 'Hey, I’m a piece too!', 'I’m bored', 'Can I move too?'],
            milestone: ['This is taking a while', 'I’m tired already', 'Someone finish this', 'My legs went numb', 'How long can this go on?'],
            lonely: ['There are few of us left', 'Where is everyone?', 'Echo...', 'Kinda lonely', 'Boys? Boys?!'],
            hello: ['Oh, we can talk now?', 'Finally! Tired of keeping quiet', 'Testing, testing. Can you hear me?', 'Hi! We’re chatting now'],
        },
    };

    const TARGET = /\{(?:t|T|t_acc|t_gen|t_dat)\}/;
    const bankFor = lang => (BANK[lang] ? lang : 'en');

    /** Сколько разных реплик (с ответами) в языке — для описания и тестов. */
    function countLines(lang = 'ru') {
        const seen = new Set();
        for (const list of Object.values(BANK[lang] || {})) {
            for (const entry of list) (Array.isArray(entry) ? entry : [entry]).forEach(text => seen.add(text));
        }
        return seen.size;
    }

    const cheb = (a, b) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

    function createTalk({ random = Math.random } = {}) {
        let fen = null;
        let ply = 0;
        let nextId = 1;
        let bySq = new Map();
        let used = new Map();
        let recent = [];                                   // последние ходы: { id, color, to, capture }
        let threatened = { w: new Set(), b: new Set() };   // фигуры под боем без защиты — после хода соперника
        const rnd = n => Math.floor(random() * n);
        const chance = p => random() < p;
        const one = list => list[rnd(list.length)];

        function reset(fromFen) {
            const [placement = '', turn = 'w', , , , full = '1'] = String(fromFen).split(' ');
            ply = (Math.max(1, Number(full) || 1) - 1) * 2 + (turn === 'b' ? 1 : 0);
            const start = ply === 0;
            const order = NAMES.ru.map((_, i) => i);
            for (let i = order.length - 1; i > 0; i--) { const j = rnd(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
            let named = 0;
            bySq = new Map();
            used = new Map();
            recent = [];
            threatened = { w: new Set(), b: new Set() };
            placement.split('/').forEach((row, i) => {
                let f = 0;
                for (const ch of row) {
                    if (/\d/.test(ch)) { f += Number(ch); continue; }
                    const sq = FILES[f] + (8 - i);
                    const type = ch.toLowerCase();
                    bySq.set(sq, {
                        id: nextId++, color: ch === type ? 'b' : 'w', type, sq,
                        name: type === 'p' ? order[named++ % order.length] : null,
                        home: start ? sq : null, moves: start ? 0 : 1, kills: [], friends: new Set(),
                    });
                    f++;
                }
            });
            fen = fromFen;
        }

        /** Переносим фигуры по ходу; срубленная запоминает, кто её срубил. */
        function apply(move) {
            const me = bySq.get(move.from);
            if (!me) return null;
            bySq.delete(move.from);
            let victim = null;
            if (move.captured) {
                const vsq = move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
                victim = bySq.get(vsq) || null;
                bySq.delete(vsq);
                if (victim) { victim.sq = null; victim.killedBy = me.id; me.kills.push(victim); }
            }
            me.sq = move.to;
            me.moves++;
            if (move.promotion) me.type = move.promotion;
            bySq.set(move.to, me);
            let rook = null;
            if (move.flags.includes('k') || move.flags.includes('q')) {
                const rank = move.from[1];
                const [rf, rt] = move.flags.includes('k') ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
                rook = bySq.get(rf) || null;
                if (rook) { bySq.delete(rf); rook.sq = rt; rook.moves++; bySq.set(rt, rook); }
            }
            return { me, victim, rook };
        }

        function nameOf(p, lang, form = 0) {
            if (p.name != null) {
                const name = (NAMES[lang] || NAMES.en)[p.name % NAMES.en.length];
                return lang === 'ru' ? ruForms(name)[form] : name;
            }
            const role = (ROLE[lang] || ROLE.en)[p.type];
            return Array.isArray(role) ? role[form] : role;
        }
        function fill(text, lang, who, target) {
            return text.replace(/\{(me|t|T|t_acc|t_gen|t_dat)\}/g, (_, key, at) => {
                const p = key === 'me' ? who : target;
                const s = nameOf(p, lang, { t_acc: 1, t_gen: 2, t_dat: 3 }[key] || 0);
                return key === 'T' || at === 0 ? cap(s) : s;
            });
        }

        /** Реплика из ключа, без повторов, пока не кончатся все варианты. */
        function pick(lang, key, hasTarget) {
            const list = BANK[lang][key] || BANK.en[key];
            if (!list) return null;
            const ok = list.map((entry, i) => [entry, i]).filter(([entry]) => hasTarget || !TARGET.test(Array.isArray(entry) ? entry.join(' ') : entry));
            if (!ok.length) return null;
            const mark = `${lang}:${key}`;
            let seen = used.get(mark);
            let free = seen ? ok.filter(([, i]) => !seen.has(i)) : ok;
            if (!free.length) {
                const lastOne = seen.last;
                seen = new Set();
                used.set(mark, seen);
                free = ok.filter(([, i]) => i !== lastOne);
                if (!free.length) free = ok;
            }
            if (!seen) { seen = new Set(); used.set(mark, seen); }
            const [entry, i] = one(free);
            seen.add(i);
            seen.last = i;
            return entry;
        }
        const line = (lang, text, who, target) => ({ id: who.id, sq: who.sq, color: who.color, text: fill(text, lang, who, target) });

        /** Реплика фигуры who о target; если в банке диалог, отвечает target. */
        function speak(lang, key, who, target = null) {
            if (!who || !who.sq) return null;
            const entry = pick(lang, key, !!target);
            if (entry == null) return null;
            const [text, reply] = Array.isArray(entry) ? entry : [entry, null];
            const lines = [line(lang, text, who, target)];
            if (reply && target && target.sq && target !== who) lines.push(line(lang, reply, target, who));
            return lines;
        }

        function closest(list, sq) {
            let best = null, bestD = Infinity;
            for (const p of list) {
                if (!p.sq) continue;
                const d = cheb(p.sq, sq) + random() * 0.5;
                if (d < bestD) { bestD = d; best = p; }
            }
            return best;
        }

        function context(chess, move, { me, victim, rook }) {
            const side = move.color, foe = side === 'w' ? 'b' : 'w';
            const all = [...bySq.values()];
            const mine = all.filter(p => p.color === side), theirs = all.filter(p => p.color === foe);
            const at = sqs => sqs.map(sq => bySq.get(sq)).filter(Boolean);
            const foeKing = theirs.find(p => p.type === 'k') || null;
            const check = chess.inCheck();
            const attackers = at(chess.attackers(move.to, foe));
            const defenders = at(chess.attackers(move.to, side));
            const cheapest = attackers.reduce((m, p) => Math.min(m, VALUE[p.type]), Infinity);
            const near = all.filter(p => p !== me && cheb(p.sq, move.to) === 1);
            return {
                chess, move, side, foe, me, victim, rook, mine, theirs, foeKing, check,
                mate: chess.isCheckmate(),
                stalemate: chess.isStalemate(),
                draw: !chess.isCheckmate() && !chess.isStalemate() && chess.isDraw(),
                checkers: check && foeKing ? at(chess.attackers(foeKing.sq, side)) : [],
                attacks: theirs.filter(p => p.type !== 'k' && chess.attackers(p.sq, side).includes(move.to)),
                attackers,
                hanging: me.type !== 'k' && attackers.length > 0 && (defenders.length === 0 || cheapest < VALUE[me.type]),
                friends: near.filter(p => p.color === side),
                enemies: near.filter(p => p.color === foe),
                undefended: p => chess.attackers(p.sq, foe).length === 0,
            };
        }

        function choose(c, lang) {
            const { me, victim, move } = c;
            const say = (key, who, target) => speak(lang, key, who, target);
            const scene = (prio, first, second) => {
                if (!first) return null;
                const lines = first.slice(0, 2);
                if (lines.length < 2 && second) { const more = second(); if (more) lines.push(more[0]); }
                return { prio, lines };
            };
            const others = c.mine.filter(p => p !== me);

            if (c.mate) return scene(100, say('mate', me, c.foeKing), () => say('mated', c.foeKing, me));
            if (c.stalemate) return scene(90, say('stalemate', c.foeKing || me, me));
            if (c.draw) return scene(80, say('draw', me));
            if (move.promotion) {
                const fan = closest(others, move.to);
                return scene(85, say(move.promotion === 'q' ? 'promote' : 'underpromote', me), fan && chance(0.6) ? () => say('promoteCheer', fan, me) : null);
            }
            if (move.flags.includes('e')) {
                const shocked = closest(c.theirs, move.to);
                return scene(85, say('epShock', shocked, me), () => say('epReply', me, shocked)) || scene(85, say('epReply', me, shocked));
            }
            if (victim) return captureScene(c, say, scene);
            if (c.check) {
                const king = c.foeKing;
                if (c.checkers.length >= 2) return scene(78, say('doubleCheck', me, king), () => say('checked', king, me));
                if (c.checkers.length && !c.checkers.includes(me)) return scene(76, say('discovered', c.checkers[0], king), () => say('checked', king, c.checkers[0]));
                const queen = c.attacks.find(p => p.type === 'q');
                if (queen) return scene(77, say('royalFork', me, king), chance(0.5) ? () => say('forkVictim', queen, me) : null);
                if (chance(0.5)) return scene(74, say('checkTaunt', me, king), chance(0.6) ? () => say('checked', king, me) : null);
                return scene(74, say('checked', king, me), chance(0.4) ? () => say('checkTaunt', me, king) : null);
            }
            if (c.rook) {
                const long = move.flags.includes('q') && chance(0.5);
                return scene(70, say(long ? 'castleLong' : 'castle', me, c.rook), chance(0.7) ? () => say('castleRook', c.rook, me) : null);
            }

            const forked = c.attacks.filter(p => VALUE[p.type] >= 3 && (VALUE[p.type] > VALUE[me.type] || c.undefended(p)));
            if (forked.length >= 2) return scene(60, say('fork', me, forked[0]), chance(0.5) ? () => say('forkVictim', forked[1], me) : null);
            if (c.hanging) {
                const roll = random();
                const mate = closest(others, move.to);
                if (roll < 0.4 && mate) return scene(58, say('hangMate', mate, me));
                if (roll < 0.7) return scene(58, say('hangSelf', me));
                const taker = c.attackers.slice().sort((a, b) => VALUE[a.type] - VALUE[b.type])[0];
                return scene(58, say('hangFoe', taker, me));
            }
            if (threatened[c.side].has(me.id) && chance(0.8)) return scene(55, say('escape', me));
            const prey = c.attacks.filter(p => VALUE[p.type] > VALUE[me.type] || (VALUE[p.type] >= 3 && c.undefended(p))).sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
            if (prey && chance(0.7)) {
                if (chance(0.5)) return scene(52, say('threatVictim', prey, me), chance(0.4) ? () => say('threaten', me, prey) : null);
                return scene(52, say('threaten', me, prey));
            }

            // Тихий ход: выбираем одну из подходящих сценок с весами.
            const options = [];
            const add = (weight, fn) => options.push([weight, fn]);
            const rel = sq => (c.side === 'w' ? Number(sq[1]) : 9 - Number(sq[1]));
            if (ply === 1) add(200, () => say('first', me));
            if (ply === 2) add(60, () => say('firstReply', me));
            if (me.type === 'q' && ply <= 12 && me.moves === 1) add(50, () => say('queenEarly', me));
            if (me.type === 'k' && c.theirs.some(p => p.type === 'q') && ply < 70) {
                const guard = closest(others, move.to);
                add(40, () => (guard && chance(0.5) ? say('kingWalkMate', guard, me) : say('kingWalk', me)));
            }
            if (me.type === 'p' && rel(move.to) === 7) add(70, () => say('seventh', me));
            if (me.home && move.to === me.home && me.moves > 1) add(40, () => say('home', me));
            if (me.type !== 'p' && rel(move.from) - rel(move.to) >= 2) add(30, () => say('retreat', me));
            if (cheb(move.from, move.to) >= 5) add(30, () => say('long', me));
            const mineRecent = recent.filter(m => m.color === c.side).slice(-2);
            if (mineRecent.length === 2 && mineRecent.every(m => m.id === me.id)) add(45, () => say('again', me));
            const fresh = c.friends.filter(p => !me.friends.has(p.id));
            if (fresh.length) {
                const other = one(fresh);
                add(55, () => {
                    me.friends.add(other.id);
                    other.friends.add(me.id);
                    const [a, b] = chance(0.6) ? [me, other] : [other, me];
                    return say(`greet_${a.type}${b.type}`, a, b);
                });
            } else if (c.friends.length) {
                const other = one(c.friends);
                add(12, () => (chance(0.5) ? say('greetAgain', me, other) : say('greetAgain', other, me)));
            }
            if (c.enemies.length) {
                const enemy = one(c.enemies);
                add(25, () => (chance(0.5) ? say('stare', me, enemy) : say('stare', enemy, me)));
            }
            if (ply >= 30) {
                const idle = others.filter(p => p.moves === 0 && 'nbrq'.includes(p.type));
                if (idle.length) add(15, () => say('idle', one(idle)));
            }
            if ([40, 60, 80, 100, 120, 150, 200].includes(ply)) add(40, () => say('milestone', me));
            if (c.mine.length <= 3) add(25, () => say('lonely', me));
            add(20, () => say(`move_${me.type}`, me));
            let roll = random() * options.reduce((s, [w]) => s + w, 0);
            for (const [weight, fn] of options) {
                roll -= weight;
                if (roll <= 0) { const lines = fn(); if (lines) return scene(30 + Math.min(20, weight / 5), lines); break; }
            }
            return scene(30, say(`move_${me.type}`, me));
        }

        function captureScene(c, say, scene) {
            const { me, victim, move } = c;
            const avenged = victim.kills.slice().reverse().find(p => p.color === c.side);
            if (avenged) {
                const friend = c.mine.find(p => p !== me && avenged.friends.has(p.id));
                return scene(75, say('revenge', friend && chance(0.5) ? friend : me, avenged));
            }
            if (c.check && chance(0.5)) return scene(72, say('captureCheck', me, victim));
            if (me.kills.length >= 3 && chance(0.7)) return scene(70, say('streak3', me, victim));
            if (me.kills.length === 2 && chance(0.5)) return scene(68, say('streak2', me, victim));
            if (VALUE[victim.type] - VALUE[me.type] >= 4 && chance(0.7)) return scene(68, say('bragBig', me, victim));
            const prev = recent[recent.length - 1];
            if (prev && prev.capture && prev.to === move.to && chance(0.5)) return scene(66, say('trade', chance(0.5) ? me : (closest(c.theirs, move.to) || me), victim));
            const friend = c.theirs.find(p => victim.friends.has(p.id));
            if (friend && chance(0.7)) return scene(65, say('mournFriend', friend, victim), chance(0.35) ? () => say('brag', me, victim) : null);
            if (chance(0.55) && c.theirs.length) {
                const mourner = (victim.type === 'q' && c.foeKing && chance(0.6)) ? c.foeKing : closest(c.theirs, move.to);
                return scene(64, say(chance(0.5) ? `mourn_${victim.type}` : 'mourn', mourner, victim), chance(0.35) ? () => say('brag', me, victim) : null);
            }
            return scene(64, say(chance(0.5) ? `brag_${me.type}` : 'brag', me, victim), chance(0.3) ? () => say('mourn', closest(c.theirs, move.to), victim) : null);
        }

        /** Свои фигуры под боем без защиты (после хода соперника) — чтобы потом сказать «пронесло». */
        function threats(chess, color) {
            const enemy = color === 'w' ? 'b' : 'w';
            const set = new Set();
            for (const p of bySq.values()) {
                if (p.color !== color || p.type === 'k') continue;
                const hit = chess.attackers(p.sq, enemy);
                if (!hit.length) continue;
                const cheapest = Math.min(...hit.map(sq => VALUE[bySq.get(sq)?.type] || 100));
                if (!chess.attackers(p.sq, color).length || cheapest < VALUE[p.type]) set.add(p.id);
            }
            return set;
        }

        function sync(before) {
            if (before && before !== fen) reset(before);
        }

        return {
            /** Ход сделан: chess — позиция после хода, move — verbose-ход chess.js. Возвращает сценку { prio, lines } или null. */
            onMove(chess, move, { lang = 'ru' } = {}) {
                if (!move || !move.from) return null;
                sync(move.before || fen);
                let applied = apply(move);
                if (!applied && move.before) { reset(move.before); applied = apply(move); }
                if (!applied) { fen = move.after || null; return null; }
                ply++;
                fen = move.after || chess.fen();
                const c = context(chess, move, applied);
                const result = choose(c, bankFor(lang));
                recent.push({ id: applied.me.id, color: move.color, to: move.to, capture: !!applied.victim });
                if (recent.length > 8) recent.shift();
                threatened[c.foe] = threats(chess, c.foe);
                return result;
            },
            /** Реплика при включении: говорит король стороны color. */
            hello(chess, color = 'w', { lang = 'ru' } = {}) {
                const now = chess.fen();
                if (now !== fen) reset(now);
                const list = [...bySq.values()].filter(p => p.color === color);
                const who = list.find(p => p.type === 'k') || one(list);
                const lines = who ? speak(bankFor(lang), 'hello', who) : null;
                return lines ? { prio: 40, lines } : null;
            },
            /** Где сейчас фигура (null — срублена). */
            squareOf(id) {
                for (const p of bySq.values()) if (p.id === id) return p.sq;
                return null;
            },
            /** Для тестов: фигура на клетке. */
            pieceAt(sq, lang = 'ru') {
                const p = bySq.get(sq);
                return p ? { id: p.id, type: p.type, color: p.color, name: p.name != null ? nameOf(p, lang) : null, kills: p.kills.length, friends: p.friends.size } : null;
            },
            get ply() { return ply; },
        };
    }

    return { BANK, NAMES, ROLE, ruForms, countLines, createTalk };
});
