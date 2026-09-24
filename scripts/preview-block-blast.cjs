// Local visual harness: uses production board/drag/scoring code, no network or account writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function extract(source, name) {
    const start = source.indexOf('function ' + name + '(');
    if (start < 0) throw new Error(name);
    const body = source.indexOf('{', start);
    let depth = 0;
    for (let i = body; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
}
function page(url) {
    const s = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const styles = [...s.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[0]).join('\n');
    const start = s.indexOf('<div id="bb-screen"');
    const markup = s.slice(start, s.indexOf('\n', start)).trim();
    const functions = ['renderBBGrid', 'getCellFast', 'countFreeCells', 'bbComboMultiplier', 'bbSimultaneousMultiplier', 'bbLineScore', 'updateComboBar', 'checkAllClear'].map(n => extract(s, n)).join('\n');
    const colors = s.slice(s.indexOf('const COLOR_MAP ='), s.indexOf('// --- SUBSCRIPTION CHECK ---')) + '\n' + s.match(/const COLORS =[^\r\n]+/)[0] + '\nconst DRAG_LIFT_Y=150; const isDesktop=()=>document.body.classList.contains("desktop"); let bbCellCache=[];';
    const scoring = s.slice(s.indexOf('const BB_SCORING ='), s.indexOf('function bbComboMultiplier'));
    const interaction = s.slice(s.indexOf('function renderBBShapeSlots()'), s.indexOf('// Combo buffer bar:'));
    return `<!doctype html><html lang="${url.searchParams.get('lang') || 'ru'}" data-theme="${url.searchParams.get('light') ? 'light' : 'dark'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<link rel="stylesheet" href="/assets/block-blast/visuals.css"><script src="/assets/block-blast/visuals.js"></script><style>.qa-tools{position:fixed;bottom:8px;left:8px;right:8px;z-index:11000;display:flex;gap:5px;flex-wrap:wrap;justify-content:center;font:11px sans-serif}.qa-tools button{background:#263746;color:#ddd;border:1px solid #456;padding:7px;border-radius:8px}.qa-tools output{width:100%;text-align:center;color:#99acba;pointer-events:none}body{overflow:hidden}</style></head><body class="${url.searchParams.get('touch') ? '' : 'desktop'}">${markup}<div class="qa-tools"><button onclick="setup()">Сцена</button><button onclick="demo('row')">Линия</button><button onclick="demo('cross')">Пересечение</button><button onclick="demo('all')">Всё поле</button><button onclick="stress()">Нагрузка</button><output id="qaStatus">Локальная проверка · без сохранения</output></div><script>
window.onerror=(m)=>document.getElementById('qaStatus').textContent='ERROR: '+m;
const BB_ROWS=8,BB_COLS=8;let bbGrid=[],bbScore=1248000,bbDisplayedScore=1248000,bbShapes=[],bbState=null,bbCombo=0,bbComboBuffer=0,bbIsAnimating=false,bbLastComboFilled=-1,bbNextHandSeed=null,bbInputLocked=false,bbGameEnded=false;
const vibrationEnabled=false,isLiteMode=false;const tg={HapticFeedback:{impactOccurred(){},notificationOccurred(){}}};
function bbPlayPlace(){}function bbPlayPickup(){}function bbPlayClear(){}function saveBBState(){}function reportGameMove(){}function checkGameOver(){}function closeGame(){BBVisuals.cleanup()}function openMultPromoModal(){}
${colors}
${scoring}
${functions}
${interaction}
function setup(){BBVisuals.cleanup();bbGrid=Array.from({length:8},()=>Array(8).fill(0));for(let r=3;r<8;r++)for(let c=0;c<8;c++)if((r+c)%5&&!(r===4&&c===4))bbGrid[r][c]=COLORS[Math.floor(c/2+r/2)%7];bbShapes=[{matrix:[[1,1,1]],color:'bb-c-5'},{matrix:[[1,1],[1,0]],color:'bb-c-4'},{matrix:[[1],[1]],color:'bb-c-2'}];bbCombo=0;bbComboBuffer=0;renderBBGrid();renderBBShapeSlots();updateBBScoreUI();document.getElementById('bbBestScore').textContent=BBVisuals.formatNumber(2935100);}
function demo(mode){bbGrid=Array.from({length:8},()=>Array(8).fill(0));for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(mode==='all'||r===4||(mode==='cross'&&c===3))bbGrid[r][c]=COLORS[(r+c)%7];if(mode!=='all')bbGrid[0][0]='bb-c-3';renderBBGrid();checkLines('bb-c-5',[{r:4,c:3}]);document.getElementById('qaStatus').textContent='Режим: '+mode+' · Очки: '+BBVisuals.formatNumber(bbScore);if(location.search.includes('frame='))setTimeout(()=>document.getAnimations().forEach(a=>{a.currentTime=Number(new URLSearchParams(location.search).get('frame'));a.pause()}),20);}
async function stress(){let frames=[],last=performance.now(),run=true,maxNodes=0;function sample(t){frames.push(t-last);last=t;maxNodes=Math.max(maxNodes,document.querySelectorAll('.bb-material-particle').length);if(run)requestAnimationFrame(sample)}requestAnimationFrame(sample);for(let i=0;i<20;i++){demo(i%4===0?'all':'cross');await new Promise(r=>setTimeout(r,130))}await new Promise(r=>setTimeout(r,800));run=false;frames.sort((a,b)=>a-b);document.getElementById('qaStatus').textContent='20 clears · particles '+maxNodes+' · p95 '+Math.round(frames[Math.floor(frames.length*.95)])+'ms · remaining '+document.querySelectorAll('.bb-clear-tile,.bb-material-particle,.bb-line-score').length;}
document.getElementById('bb-screen').classList.add('visible');setup();
</script></body></html>`;
}
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/bb-qa') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(page(url)); }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    try {
        res.setHeader('Content-Type', ({ '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
    } catch (_) { res.writeHead(404); res.end(); }
}).listen(4173, '127.0.0.1', () => console.log('Block Blast QA: http://127.0.0.1:4173/bb-qa'));
