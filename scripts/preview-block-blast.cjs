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
    return `<!doctype html><html lang="${url.searchParams.get('lang') || 'ru'}" data-theme="${url.searchParams.get('light') ? 'light' : 'dark'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<link rel="stylesheet" href="/assets/block-blast/visuals.css"><link rel="stylesheet" href="/assets/block-blast/picker.css"><script src="/assets/block-blast/motion.js"></script><script src="/assets/block-blast/picker.js"></script><script src="/assets/block-blast/visuals.js"></script><style>.qa-tools{position:fixed;bottom:8px;left:8px;right:8px;z-index:11000;display:flex;gap:5px;flex-wrap:wrap;justify-content:center;font:11px sans-serif}.qa-tools button{background:#263746;color:#ddd;border:1px solid #456;padding:7px;border-radius:8px}.qa-tools output{width:100%;text-align:center;color:#99acba;pointer-events:none}body{overflow:hidden}</style></head><body class="${url.searchParams.get('touch') ? '' : 'desktop'}">${markup}<div class="qa-tools"><button onclick="setup()">Сцена</button><button onclick="demo('row')">Линия</button><button onclick="demo('cross')">Пересечение</button><button onclick="demo('all')">Всё поле</button><button onclick="stress()">Нагрузка</button><button onclick="lift()">Поднять</button><select id="qaMaterial" aria-label="Материал для проверки"></select><select id="qaFrame" aria-label="Кадр анимации"><option value="">Движение</option><option>0</option><option>60</option><option>180</option><option>360</option><option>500</option><option>700</option></select><button onclick="aim()">Прицел</button><button onmousedown="onTouchEnd({type:'touchcancel'})">Отменить</button><output id="qaStatus">Локальная проверка · без сохранения</output></div><script>
window.onerror=(m)=>document.getElementById('qaStatus').textContent='ERROR: '+m;
const BB_ROWS=8,BB_COLS=8;let bbGrid=[],bbScore=1248000,bbDisplayedScore=1248000,bbShapes=[],bbState=null,bbCombo=0,bbComboBuffer=0,bbIsAnimating=false,bbLastComboFilled=-1,bbNextHandSeed=null,bbInputLocked=false,bbGameEnded=false;
const vibrationEnabled=false,isLiteMode=false;const tg={HapticFeedback:{impactOccurred(){},notificationOccurred(){}}};
function bbPlayPlace(){}function bbPlayPickup(){}function bbPlayClear(){}function saveBBState(){}function reportGameMove(){}function checkGameOver(){}function closeGame(){BBVisuals.cleanup()}function openMultPromoModal(){}
${colors}
${scoring}
${functions}
${interaction}
function lift(){const s=bbShapes[0],rect=document.getElementById('shape0').getBoundingClientRect();if(s)startDrag({type:'mousedown',clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2,preventDefault(){},stopPropagation(){}},0,s.matrix,s.color)}
function setup(){BBVisuals.cleanup();bbGrid=Array.from({length:8},()=>Array(8).fill(0));for(let r=3;r<8;r++)for(let c=0;c<8;c++)if((r+c)%5&&!(r===4&&c===4))bbGrid[r][c]=COLORS[Math.floor(c/2+r/2)%7];bbShapes=[{matrix:[[1,1,1]],color:'bb-c-5'},{matrix:[[1,1],[1,0]],color:'bb-c-4'},{matrix:[[1],[1]],color:'bb-c-2'}];bbCombo=0;bbComboBuffer=0;renderBBGrid();renderBBShapeSlots();updateBBScoreUI();document.getElementById('bbBestScore').textContent=BBVisuals.formatNumber(2935100);}
function demo(mode){bbGrid=Array.from({length:8},()=>Array(8).fill(0));for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(mode==='all'||r===4||(mode==='cross'&&c===3))bbGrid[r][c]=COLORS[(r+c)%7];if(mode!=='all')bbGrid[0][0]='bb-c-3';for(let r=0;r<8;r++)for(let c=0;c<8;c++){const cell=getCellFast(r,c);cell.className='bb-cell'+(bbGrid[r][c]?' filled '+bbGrid[r][c]:'');cell.removeAttribute('style')}checkLines('bb-c-5',[{r:4,c:3}]);document.getElementById('qaStatus').textContent='Режим: '+mode+' · Очки: '+BBVisuals.formatNumber(bbScore);if(document.getElementById('qaFrame').value!=='')setTimeout(()=>{const t=Number(document.getElementById('qaFrame').value);BBVisuals.inspectFrame(t);document.getAnimations().forEach(a=>{a.currentTime=t;a.pause()})},20);}
async function stress(){let frames=[],last=performance.now(),run=true,maxNodes=0;function sample(t){frames.push(t-last);last=t;maxNodes=Math.max(maxNodes,Number(document.getElementById('bbMaterialCanvas')?.dataset.particles||0));if(run)requestAnimationFrame(sample)}requestAnimationFrame(sample);for(let i=0;i<20;i++){demo(i%4===0?'all':'cross');await new Promise(r=>setTimeout(r,130))}await new Promise(r=>setTimeout(r,2400));run=false;frames.sort((a,b)=>a-b);document.getElementById('qaStatus').textContent='20 clears · particles '+maxNodes+' · p95 '+Math.round(frames[Math.floor(frames.length*.95)])+'ms · remaining '+(Number(document.getElementById('bbMaterialCanvas')?.dataset.bursts||0)+document.querySelectorAll('.bb-line-score').length);}
function aim(){setup();for(let c=0;c<8;c++)bbGrid[2][c]=c>=2&&c<=4?0:'bb-c-5';renderBBGrid();lift();const targetX=dragData.gridRect.left+2*dragData.cellSize+dragData.logicalWidth/2,targetY=dragData.gridRect.top+2*dragData.cellSize+dragData.logicalHeight/2;const m=isDesktop()?1:DRAG_MULTIPLIER,l=isDesktop()?0:DRAG_LIFT_Y;handleMove(dragData.startX+(targetX-dragData.startX)/m,dragData.startY+(targetY+l-dragData.startY)/m)}
const qaMaterial=document.getElementById('qaMaterial'),qaFrame=document.getElementById('qaFrame');for(const item of BBVisuals.catalog){const option=document.createElement('option');option.value=item.id;option.textContent=item.name.ru;qaMaterial.appendChild(option)}qaMaterial.value=BBVisuals.theme().id;qaMaterial.onchange=()=>{BBVisuals.selectTheme(qaMaterial.value);setup()};qaFrame.value=new URLSearchParams(location.search).get('frame')||'';
document.getElementById('bb-screen').classList.add('visible');setup();
new MutationObserver(records=>{for(const record of records){if(record.attributeName==='hidden'&&record.target.matches('.bb-picker-overlay')&&!record.target.hidden){const values=[],start=performance.now(),panel=record.target.querySelector('.bb-picker-panel');function sample(){values.push(panel.getBoundingClientRect().top);if(performance.now()-start<750)requestAnimationFrame(sample);else document.documentElement.dataset.sheetTravel=JSON.stringify({first:Math.round(values[0]),last:Math.round(values.at(-1)),samples:values.map(v=>Math.round(v)),wrongWay:values.slice(1).filter((v,i)=>v>values[i]+1).length})}requestAnimationFrame(sample)}}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});
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
