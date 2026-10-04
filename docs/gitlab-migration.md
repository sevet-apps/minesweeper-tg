# Spark: переход на приватный GitLab

Подготовка не меняет адрес работающего приложения. Новый адрес назначается только
после проверки сайта и подключения GitLab к существующему сервису Render.

## Что публикуется

`node scripts/build-static.cjs` создаёт `public/` из разрешённых **отслеживаемых Git**
файлов интерфейса. В сборку не входят `server/`, `supabase/`, `scripts/`, `docs/`,
`examples/`, `motion/`, исходный каталог переводов, `.env`, `.git` и source maps.
Папка `public/` пересоздаётся, поэтому старые лишние файлы не сохраняются.
`_config.yml` исключает служебные файлы из текущего GitHub Pages на время перехода.

HTML, CSS, клиентский JavaScript и ресурсы работающего сайта остаются доступны
браузерам игроков. Приватность репозитория защищает серверный код и историю Git,
но не может скрыть уже загруженный клиент или удалить старые копии репозитория.

## До переключения

1. Создать приватный проект в личном пространстве GitLab. Импортировать репозиторий
   `https://github.com/sevet-apps/minesweeper-tg.git` через **Repository by URL**,
   пока он доступен. При необходимости перенести оставшиеся ветки и теги Git.
   Сравнить полный SHA `main`, ветки и теги. Git-история переносится; номера PR,
   комментарии, Actions и настройки сервиса не являются частью Git-репозитория.
2. Запустить pipeline из `.gitlab-ci.yml`. Сначала проходят Node-тесты и проверка
   переводов, затем Pages публикует только `public/` из основной ветки.
   Если GitLab требует подтверждения личности для runner, его проходит владелец.
3. В Settings → General → Visibility, project features, permissions оставить
   **Project visibility: Private**, а Pages установить **Everyone**. Repository и
   CI/CD доступны только участникам. Это разные настройки: игрокам нужен сайт
   без входа в GitLab, доступ к репозиторию им не нужен.
4. Взять фактический HTTPS-адрес из Deploy → Pages. Не угадывать его по username:
   GitLab может использовать уникальный домен Pages. Проверить `CI_PAGES_URL`;
   если итоговый адрес отличается, назначить CI-переменную `SPARK_PUBLIC_URL` и
   повторить pipeline для корректной картинки предпросмотра.
5. Анонимно проверить старт приложения, загрузочное видео, 12 языков, Wordle,
   worker шашек, Block Blast и iframe Монополии, её шрифты, звуки и 3D-ресурсы.
   Проверить, что `/server/index.js`, `/supabase/`, `/scripts/` и `.git/config`
   не отдают исходники. Проверить API и Socket.IO с нового origin.
6. Сохранить локальную резервную копию Git и список текущих настроек сервисов.
   `.env`, значения ключей и резервные копии никогда не коммитить.

## Переключение

1. Подключить GitLab в настройках учётной записи Render. В **существующем**
   `spark-game-backend` изменить Settings → Build → Source на новый приватный
   проект и основную ветку. Сохранить текущие runtime, root directory, build/start
   commands и переменные окружения. Не создавать второй процесс того же бота.
   Render URL остаётся `https://spark-game-backend.onrender.com`.
2. Проверить новый deploy: ответ `GET /` и `X-Spark-Release` должен соответствовать
   полному SHA опубликованного коммита. Проверить `/start`, инлайн-игры и топы.
   Supabase-проект, таблицы, BOT_TOKEN и идентификатор Telegram-бота сохраняются.
3. Установить в Render `WEBAPP_URL` равным проверенному адресy Pages с завершающим
   `/`. Код строит адреса всех миниатюр и кнопок из этой переменной. При её
   отсутствии используется прежний URL, поэтому подготовительный deploy безопасен.
4. В BotFather обновить URL основного Mini App, именованных Mini App (`spark`,
   `sparkapp`, если оба настроены) и menu button. Эти настройки внешние: один
   `WEBAPP_URL` их не изменяет. Существующие `t.me`-ссылки должны вести к тому же боту.
5. Проверить открытие внутри Telegram, приглашение по коду, рефералы, новые
   результаты и топы. На время выкладки избегать активных онлайн-партий: состояние
   комнат находится в памяти процесса и может сброситься при любом redeploy.
6. Учесть смену origin: очки и профиль в Supabase сохраняются, но localStorage
   привязан к старому домену. На этапе переключения отдельно проверить перенос
   настроек, выбранных скинов, незавершённых игр и несинхронизированных результатов.
   Не обещать сохранение этих локальных данных без проверенного механизма переноса.
7. Только после успешной проверки сделать старый GitHub-репозиторий приватным.
   На GitHub Free это отключит старый Pages. Репозиторий сохранить для отката.
   Затем заменить локальный `origin` на GitLab, сохранив старый remote как
   `github-backup`; не использовать `push --mirror` в непустой целевой проект.

## Откат

До закрытия GitHub: вернуть прежний `WEBAPP_URL`, URL Mini App/menu в BotFather и
source сервиса Render. После закрытия GitHub старый бесплатный Pages недоступен;
не делать репозиторий публичным ради отката. Можно повторно опубликовать предыдущую
сборку на GitLab Pages и вернуть предыдущий коммит Render. База не мигрируется.

## Источники (проверены 4 октября 2026)

- [GitHub Free: приватные репозитории бесплатны, Pages — только для публичных](https://docs.github.com/en/get-started/learning-about-github/githubs-plans).
- [Изменение видимости GitHub и отключение Pages](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).
- [GitLab: импорт Repository by URL](https://docs.gitlab.com/user/import/third_party_systems/repo_by_url/).
- [GitLab Pages: приватный проект с публичным сайтом](https://docs.gitlab.com/user/project/pages/pages_access_control/).
- [Актуальный синтаксис Pages в CI](https://docs.gitlab.com/ci/yaml/#pages).
- [Лимит compute minutes на GitLab Free](https://docs.gitlab.com/ci/pipelines/compute_minutes/).
- [Render: подключение GitLab](https://render.com/docs/git-provider).
- [Render: изменение исходного репозитория существующего сервиса](https://render.com/changelog/change-your-services-backing-repo-or-image-in-the-render-dashboard).
