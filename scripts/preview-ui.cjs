/* Local, account-free UI review. Production markup/styles/handlers; mocked network only. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function extract(source, name) {
    const start = source.indexOf('function ' + name + '(');
    if (start < 0) throw new Error(name);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(source.slice(start-6,start)==='async '?start-6:start, i+1);
    }
}
const diagnostics = `<script>
window.qaErrors=[]; window.addEventListener('error',e=>{window.qaErrors.push(e.message);document.documentElement.dataset.qaErrors=JSON.stringify(qaErrors)});
new MutationObserver(records=>{for(const r of records){const el=r.target;if(!el.matches('.ui-mode-sheet.visible,.bottom-sheet-overlay.visible,.lb-sheet.on,.mc-layer.on'))continue;const panel=el.querySelector('.ui-mode-panel,.bottom-sheet,.lb-card,.mc-sheet');if(!panel)continue;const samples=[],start=performance.now();function sample(){samples.push(Math.round(panel.getBoundingClientRect().top));if(performance.now()-start<700)requestAnimationFrame(sample);else el.dataset.travel=JSON.stringify({samples,wrongWay:samples.slice(1).filter((v,i)=>v>samples[i]+2).length})}requestAnimationFrame(sample)}}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});
</script>`;
function app(url) {
    const s = read('index.html');
    const styles = [...s.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[0]).join('\n');
    let body = s.slice(s.indexOf('<body>')+6,s.lastIndexOf('</body>')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
    body = body.replace(/<div class="app-loader"[\s\S]*?<\/div>/,'');
    const names = ['setSaperDiff','selectSudokuDiff','setCheckersMainMode','setCheckersMode','openSettingsSheet','closeSettingsSheet','applyLiteMode','applyVibration','applySounds','showReferralConditions','hideReferralConditions','setProfileSection','openPrivacyPolicy','closePrivacyPolicy','renderBBModeCards','updateBBModeSlider','bbModeGoTo','bbModeStep','attachBBModeSwipe'];
    const functions = names.map(name=>extract(s,name)).join('\n');
    const dictionary = s.slice(s.indexOf('const translations ='),s.indexOf('        function t(key)'));
    const drag = s.slice(s.indexOf('(function initProfileSegmentDrag()'),s.indexOf('        function toggleProfileGameStats'));
    return `<!doctype html><html lang="ru" data-theme="${url.searchParams.get('light')?'light':'dark'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<link rel="stylesheet" href="/assets/block-blast/picker.css"><link rel="stylesheet" href="/assets/ui/tokens.css"><link rel="stylesheet" href="/assets/ui/app.css"><script src="/assets/ui/sheets.js" defer></script><style>.qa-tools{position:fixed;top:0;left:0;right:0;z-index:22000;display:flex;gap:6px;justify-content:center;background:var(--ui-bg);padding:4px;font:11px sans-serif}.qa-tools button{border:0;border-radius:8px;padding:6px;background:var(--ui-track);color:var(--ui-text)}.qa-tools a{color:var(--ui-accent);padding:6px}.screen{padding-top:50px}body{--safe-top:0px}.avatar[src=""]{background:var(--ui-accent);border:10px solid var(--ui-track)}</style>${diagnostics}</head><body class="${url.searchParams.get('desktop')?'desktop':''}">${body}
    <div class="qa-tools"><button onclick="qaScreen('games')">Игры</button><button onclick="qaScreen('profile')">Профиль</button><button onclick="qaScreen('leaderboard')">Топ</button><button onclick="toggleTheme()">Тема</button><a href="/monopoly/qa?theme=${url.searchParams.get('light')?'light':'dark'}">Монополия</a></div>
    <script>
let sRows=8,sCols=8,sMines=10,selectedSudoDiff=40,isPvE=false,isOnlineGame=false,currentProfileSection='overview',vibrationEnabled=false,isLiteMode=false,soundsEnabled=true,_bbModeIndex=0,_bbModeSlides=[],_bbSwipeAttached=false; const BB_PARTNER_DEFAULT_CTA=''; async function fetchTournamentState(){return {bb:{multiplier:1.5},vpn_active:false}} function hasBBSave(){return false} function pickBBMode(mode){document.getElementById('view-bb-mode').dataset.selection=mode;closeBBMode()} function closeBBMode(){document.getElementById('view-bb-mode').classList.remove('active')} async function startBlockBlastCheck(){document.getElementById('view-bb-mode').classList.add('active');await renderBBModeCards()}
const tg={HapticFeedback:{selectionChanged(){},impactOccurred(){}}};
let currentLang='ru'; ${dictionary}
function t(key){return translations[currentLang]?.[key]||key}
function setLanguage(lang){currentLang=lang;document.documentElement.lang=lang;document.querySelectorAll('[data-i18n]').forEach(el=>{if(translations[lang]?.[el.dataset.i18n])el.textContent=t(el.dataset.i18n)});document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang))}
${functions}
${drag}
function toggleTheme(){document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'}
function toggleLiteMode(){isLiteMode=!isLiteMode;applyLiteMode()}function toggleVibration(){vibrationEnabled=!vibrationEnabled;applyVibration()}function toggleSounds(){soundsEnabled=!soundsEnabled;applySounds()}
function qaScreen(id){document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));document.getElementById('view-'+id)?.classList.add('active')}
function switchTab(id){qaScreen(id)}
function openGame(id){const ids={saper:'modalSaper',sudoku:'modalSudoku',checkers:'modalCheckers',bb:'modalBBResume',blockblast:'modalBBResume'};document.getElementById(ids[id]||'modalResult')?.classList.add('visible')}
function startSudokuCheck(){openGame('sudoku')} function openGameModal(id){openGame(id)} function openSudokuMenu(){openGame('sudoku')} function openSudoku(){openGame('sudoku')} function openBB(){openGame('bb')}
function launchSaper(){document.getElementById('modalSaper').dataset.selection=[sRows,sCols,sMines];document.getElementById('modalSaper').classList.remove('visible')}
function startSudoku(){document.getElementById('modalSudoku').dataset.selection=selectedSudoDiff;document.getElementById('modalSudoku').classList.remove('visible')}
function launchCheckers(){document.getElementById('modalCheckers').dataset.selection=isPvE;document.getElementById('modalCheckers').classList.remove('visible')}
function openMonopolyLobby(){location.href='/monopoly/qa?theme='+document.documentElement.dataset.theme}
function joinGame(){document.getElementById('modalCheckers').classList.remove('visible');document.getElementById('modalWaitOpponent').classList.add('visible')}
function joinGameByCode(){joinGame()}function createGame(){joinGame()}function cancelOnlineWait(){document.getElementById('modalWaitOpponent').classList.remove('visible')}
function toggleDropdown(){document.getElementById('lbDropdown').classList.toggle('show')}
function setBBLbMode(mode){document.getElementById('bbLbSegment').classList.toggle('tournament-mode',mode==='tournament');document.querySelectorAll('.bb-lb-segment-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode))}
document.getElementById('user-name').textContent='Святослав';document.getElementById('user-id').textContent='@svyatoslav';document.getElementById('profileFavoriteName').textContent='Блок Бласт';document.getElementById('profileFavoriteTime').textContent='12 ч 40 мин';document.getElementById('bbLbSegment').style.display='flex';qaScreen('games');
</script></body></html>`;
}
function monopoly(url) {
    let s = read('monopoly/index.html');
    s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
    const catalog = JSON.parse(read('monopoly/assets/skins/catalog.json'));
    catalog.titles = require('../server/monopoly-rating').TITLES;
    const data = {catalog,user:{first_name:'Святослав',last_name:'Иванов',username:'svyatoslav'},rating:{points:160,wins:14,games:32},account:{coins:2450,cases_count:3},inventory:catalog.skins.slice(0,10).map((skin,i)=>({skin_id:skin.id,quantity:i%3+1,skin})),loadout:[],pendingOpenings:[]};
    const mock = `<script>
window.Telegram={WebApp:{initDataUnsafe:{user:{id:123,first_name:'Святослав',last_name:'Иванов'}},HapticFeedback:{impactOccurred(){},selectionChanged(){}},BackButton:{show(){},hide(){},onClick(){}}}};
window.io=true; const events={}, listeners={};
const socket={on(k,fn){events[k]=fn;if(k==='connect')setTimeout(fn,0)},off(){},emit(k,p,cb){document.documentElement.dataset.lastRequest=JSON.stringify({event:k,payload:p});if(k==='m2:rooms')cb?.([]);if(k==='m2:my-game')cb?.(null);if(k==='m2:create'||k==='m2:join')cb?.({ok:true,roomId:'ABC123',you:'tg123',maxPlayers:p.maxPlayers||5});}};
window.NetEngine={S:{maxPlayers:5,order:['tg123','tg456'],players:{tg123:{name:'Святослав Иванов',host:true},tg456:{name:'Анастасия'}},seats:['tg123','tg456',null,null,null]},connect(){return socket},socket(){return socket},setMe(){},setRoom(){},on(k,fn){listeners[k]=fn},off(){}};
const qaData=${JSON.stringify(data)};window.fetch=async(input,options)=>{const target=new URL(input,location.href);if(target.pathname.startsWith('/api/monopoly/collection')){if(options?.method&&options.method!=='GET')throw new Error('QA: запись отключена');return {ok:true,json:async()=>qaData}}if(target.origin!==location.origin)throw new Error('QA: внешний запрос отключён');return qaOriginalFetch(input,options)};const qaOriginalFetch=window.fetch.bind(window);
// Restore native local-file requests while keeping all service calls mocked.
</script>`;
    // Capture native fetch before installing mocks.
    const fixedMock = mock.replace('const qaData=', 'const qaOriginalFetch=window.fetch.bind(window); const qaData=').replace(';const qaOriginalFetch=window.fetch.bind(window);',';');
    return s.replace('</head>',`<script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"></script>${diagnostics}${fixedMock}</head>`).replace('</body>',`<script src="js/v2/ui-icons.js"></script><script src="js/v2/collection-ui.js"></script><script src="js/v2/lobby.js"></script><script>Lobby.init()</script></body>`);
}
http.createServer((req,res)=>{
    const url = new URL(req.url,'http://localhost');
    if (url.pathname==='/ui-qa'||url.pathname==='/monopoly/qa') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(url.pathname==='/ui-qa'?app(url):monopoly(url));}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
    try {res.setHeader('Content-Type',({'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end()}
}).listen(4174,'127.0.0.1',()=>console.log('Spark UI QA: http://127.0.0.1:4174/ui-qa'));
