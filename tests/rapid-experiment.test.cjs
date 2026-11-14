// Synthetic DOM, transport and clock. No real BLE or browser rendering.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
 let clock = 100, controller, calOptions, connected = true, autoComplete = true;
 const commands = [], nodes = {}, intervals = [], timers = new Map(), files = new Map();
 let timerId = 0;
 class Element {
   constructor(){this.children=[];this.handlers={};this.dataset={};this.disabled=false;this.checked=false;this.isConnected=true;}
   append(...v){this.children.push(...v)} replaceChildren(...v){this.children=v} setAttribute(k,v){this[k]=v}
   addEventListener(t,f){this.handlers[t]=f} click(){return this.handlers.click?.()}
   querySelector(sel){ const id=sel.match(/data-rapid="([^"]+)"/)?.[1]; return nodes[id] ||= new Element(); }
   querySelectorAll(sel){return sel.includes(':scope') ? [new Element(),new Element(),new Element()] : poses;}
 }
 const poses=['1','5'].map(p=>{const e=new Element();e.dataset.rapidPose=p;return e});
 const root=new Element(), view=new Element();
 const profile={gender:'male',age_years:25,body_height_cm:170,body_weight_kg:65};
 const rec={profile,anchors:{'1':{head:8,neck:11,pressure:{head_adc:1900000}},'5':{head:12,neck:13,pressure:{head_adc:2000000}}}};
 const c={subject:'S01',record:rec,valid:true,folder:{getFileHandle:async name=>({createWritable:async()=>({write:async value=>files.set(name,value),close:async()=>{},abort:async()=>{}})})}};
 const state={ready:true,head:12,neck:13};
 const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
 const context=vm.createContext({performance:{now:()=>clock},Date,Blob,
   document:{getElementById:()=>({content:{firstElementChild:{cloneNode:()=>view}}}),createElement:()=>new Element()},
   setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,at:clock+ms});return id},
   clearTimeout:id=>timers.delete(id),setInterval:f=>intervals.push(f),
   comfortProfileText:()=>'',saveComfortImage:async()=>true,
   createComfortExperiment:(_root,opts)=>{calOptions=opts;return {getCalibration:()=>c,refresh:()=>opts.onChange(),isBusy:()=>false,receivePressure(){},onDisconnected(){},needsLeaveProtection:()=>true}}
 });
 for (const name of ['pose-model.js','rapid-results.js','rapid-experiment.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../spp3_BLE',name),'utf8'),context);
 vm.runInContext("rapidPressurePng = async () => new Blob(['synthetic chart stub'], {type:'image/png'});",context);
 function transport(cmd){commands.push(cmd);const p=cmd.split(',');queueMicrotask(()=>{
   let line;
   if(p[0]==='EXP02' && p[1]==='DRAIN') { controller.receiveLine(`EXP02,ACK,${p[2]},DRAIN`); if (autoComplete) line=`EXP02,DRAINED,${p[2]}`; }
   if(p[0]==='EXP02' && p[1]==='START') { controller.receiveLine(`EXP02,ACK,${p[2]},HEIGHT_DRY`); if (autoComplete) { state.head=Number(p[4]);state.neck=Number(p[5]);line=`EXP02,DONE,${p[2]},1900000,2000000,${p[4]},${p[5]}`; } }
   if(p[0]==='EXP02' && p[1]==='STOP') line=`EXP02,ERR,${p[2]},STOPPED`;
   if(p[0]==='USER')line='USER,OK';
   if(p[0]==='FEATURE')line='FEATURE,STATUS,LEGACY,0,POSE,1,PRED,0';
   if(p[0]==='ANCHOR'&&p[1]==='START') {controller.receiveLine(`ANCHOR,OK,START,${p[2]}`);controller.receiveLine(`ANCHOR,STATUS,DONE,${p[2]}`);}
   if(p[0]==='ANCHOR'&&p[1]==='GET')line=`ANCHOR,OK,${p[2]},1800000.0,2000000.0,1900000.0,7.0,10.0`;
   if(p[0]==='CLASSIFY')line=`CLASSIFY,OK,${p[1]}`;
   if(line)controller.receiveLine(line);
 });}
 controller=context.createRapidExperiment(root,{heightControl:{getState:()=>state,tick(){},prepare:async()=>state,adjust:async(ch,v)=>{state[ch==='HEAD'?'head':'neck']=v}},getSystemState:()=>({connected,autoHeightPossible:false}),getUserProfile:()=>profile,sendExperimentCommand:transport,sendRapidCommand:transport,sendRapidQuery:transport,onChange(){}});
 const pressure = () => controller.receivePressure({monitor_adc:1800000,neck_adc:2000000,head_adc:1900000,receivedMonotonicMs:clock,timestamp_iso:new Date().toISOString()});
 return {controller,nodes,commands,state,profile,c,poses,flush,files,pressure,
   autoComplete: value=>{autoComplete=value}, cal:()=>calOptions, tick:async(ms)=>{clock+=ms;for(const [id,timer] of timers)if(timer.at<=clock){timers.delete(id);timer.fn()}intervals.forEach(f=>f());await flush()},
   sample:(line, complete=true)=>controller.receiveLine(line,complete?{receivedMonotonicMs:clock,timestamp_iso:new Date().toISOString()}:null),
   setClock:t=>clock=t,
   disconnect:()=>{connected=false;controller.onDisconnected()},
   async prepare(){await calOptions.beforeCalibrationSave({subject:'S01',pose:'1'});await calOptions.beforeCalibrationSave({subject:'S01',pose:'5'});calOptions.onCalibrationOverviewSaved();controller.refresh();nodes.drain.click();await flush();nodes.prepare.click();await flush();pressure();}
 };
}
test('overview save gates fixed-height preparation; adjustment uses pose1 even when pose5 is selected',async()=>{
 const f=fixture();f.controller.refresh();assert.equal(f.nodes.prepare.disabled,true);
 await f.prepare();assert.equal(f.nodes.prepare.disabled,true);assert.equal(f.state.head,8);assert.equal(f.state.neck,11);
 assert.equal(f.commands.filter(s=>s.startsWith('USER')).length,1);
 assert(!f.commands.includes('PRED,START'));
 f.poses[1].click();f.nodes.empty.checked=true;f.controller.refresh();assert.equal(f.nodes.start.disabled,false);
 f.profile.age_years=26;f.controller.refresh();assert.equal(f.nodes.start.disabled,true);assert.equal(f.nodes.prepare.disabled,true);
});
const frame = (sequence, options={}) => {
 const session = options.session ?? 1, invalid = options.invalid;
 const status = invalid ? 'INVALID,UNKNOWN,NA,NA' : 'OK,GROUP1,0.8,0.2';
 const history = invalid ? 'INVALID,UNKNOWN,NA,NA' : sequence<=6 ? 'WARMUP,UNKNOWN,NA,NA' : 'OK,GROUP2,0.2,0.8';
 return `CLASSIFY,DATA,V1,${session},${sequence},${sequence*1000},${sequence},${sequence*1000-10},1800000,2000000,1900000,${status},${history},${sequence-1},0,1200`;
};
test('20-second acquisition retains every second, resets with STOP/START, warms history, exports and permits another run',async()=>{
 const f=fixture();await f.prepare();f.nodes.empty.checked=true;await f.nodes.start.click();await f.flush();
 assert(f.controller.isRunning());assert.deepEqual(f.commands.slice(-3),['CLASSIFY,STOP','CLASSIFY,START','CLASSIFY,GET']);
 for(let second=1;second<=20;second++){f.setClock(100+second*1000);f.pressure();f.sample(frame(second));await f.tick(0);}
 assert(!f.controller.isRunning());assert(f.controller.isBusy());
 assert.equal(f.nodes.seconds.children.length,20);
 assert.equal(f.nodes.seconds.children[0].children[1].textContent,'Group1');
 assert.equal(f.nodes.seconds.children[0].children[4].textContent,'暖機 1/6');
 assert.equal(f.nodes.seconds.children[6].children[4].textContent,'Group2');
 assert.match(f.nodes.quality.textContent,/無歷史有效 20 秒，有歷史有效 14 秒/);
 assert.equal(f.nodes.results.children[0].children.at(-1).textContent,'20秒結束');
 f.nodes.finish.click();await f.nodes.export.click();await f.flush();
 const csv=[...f.files].find(([name])=>name.endsWith('_逐秒分類.csv'))[1];
 assert.equal(csv.split('\r\n').length,21);assert(csv.includes('"GROUP1"'));assert(csv.includes('"GROUP2"'));
 assert([...f.files.keys()].some(name=>name.endsWith('_壓力曲線.png')));
 assert(!csv.includes('score_supine'));assert(!csv.includes('"smooth"'));
 f.nodes.empty.checked=true;f.controller.refresh();assert.equal(f.nodes.start.disabled,false);
 await f.nodes.start.click();await f.flush();f.setClock(21100);f.pressure();f.sample(frame(1,{session:2}));
 assert.equal(f.nodes.seconds.children[0].children[4].textContent,'暖機 1/6');
});
test('missing, invalid, duplicate, partial and out-of-order frames are never fabricated or counted twice',async()=>{
 const f=fixture();await f.prepare();f.nodes.empty.checked=true;await f.nodes.start.click();await f.flush();
 f.setClock(1100);f.sample(frame(1),false); // Partial line is not a device event.
 f.setClock(2100);f.sample(frame(2,{invalid:true}));
 f.setClock(3100);f.sample(frame(3));f.sample(frame(3));f.sample(frame(2));
 f.setClock(4100);f.sample('CLASSIFY,OK,BSHS,BSHS,0.9,0.8,0.7,0.6');
 f.setClock(20100);await f.tick(0);f.nodes.finish.click();await f.nodes.export.click();
 assert.equal(f.nodes.seconds.children[0].children[1].textContent,'缺資料');
 assert.equal(f.nodes.seconds.children[1].children[1].textContent,'讀值無效');
 assert.equal(f.nodes.seconds.children[2].children[1].textContent,'Group1');
 assert.match(f.nodes.quality.textContent,/已有分類資料 2 秒；無歷史有效 1 秒，有歷史有效 0 秒/);
 const events=[...f.files].find(([name])=>name.endsWith('_壓力與分類事件.csv'))[1];
 assert.equal(events.split('\r\n').length,4); // header + run + two unique classification events
 assert.equal(f.nodes.results.children[0].children.at(-1).textContent,'20秒結束');
});
test('stale pressure blocks starting; early stop retains unrecorded seconds and failed export can retry',async()=>{
 const f=fixture();await f.prepare();f.nodes.empty.checked=true;f.setClock(5000);await f.tick(0);
 assert(f.nodes.start.disabled);await f.nodes.start.click();assert(!f.controller.isRunning());
 f.pressure();f.controller.refresh();await f.nodes.start.click();f.setClock(7500);f.nodes.stop.click();await f.flush();f.nodes.finish.click();
 assert.equal(f.nodes.seconds.children[2].children[1].textContent,'缺資料');
 assert.equal(f.nodes.seconds.children[3].children[1].textContent,'未記錄');
 const original=f.c.folder.getFileHandle;f.c.folder.getFileHandle=async()=>{throw new Error('disk full')};
 await f.nodes.export.click();assert.match(f.nodes.status.textContent,/儲存未完成.*disk full/);assert(!f.nodes.export.disabled);
 f.c.folder.getFileHandle=original;await f.nodes.export.click();assert.match(f.nodes.status.textContent,/已儲存2份CSV/);
});
test('a different new session aborts the round; previous session frames cannot overwrite it',async()=>{
 const f=fixture();await f.prepare();f.sample(frame(7,{session:4}));f.nodes.empty.checked=true;await f.nodes.start.click();
 f.setClock(1100);f.sample(frame(8,{session:4}));assert.equal(f.nodes.seconds.children[0].children[1].textContent,'等待中');
 f.setClock(2100);f.sample(frame(1,{session:5}));f.setClock(3100);f.sample(frame(2,{session:4}));assert(f.controller.isRunning());
 f.sample(frame(1,{session:6}));assert(!f.controller.isRunning());assert.equal(f.nodes.results.children[0].children.at(-1).textContent,'分類工作變更');
});
test('disconnect aborts recording and requires new firmware calibration',async()=>{
 const f=fixture();await f.prepare();f.nodes.empty.checked=true;f.nodes.start.click();await f.flush();f.disconnect();
 assert(!f.controller.isRunning());assert.equal(f.nodes.results.children[0].children.at(-1).textContent,'BLE 斷線中止');
 f.nodes.finish.click();f.controller.refresh();assert.equal(f.nodes.start.disabled,true);
});
test('an unrelated CLASSIFY error cannot fail an in-progress anchor capture',async()=>{
 const f=fixture();const promise=f.cal().beforeCalibrationSave({subject:'S01',pose:'1'});f.sample('CLASSIFY,ERR,NOT_RUNNING');await promise;
 assert(f.commands.includes('ANCHOR,START,BSHS'));
});

test('saving overview only enables drain; unacknowledged or wrong-run completion cannot unlock preparation', async () => {
 const f=fixture();f.cal().onCalibrationOverviewSaved();f.controller.refresh();
 assert.equal(f.nodes.drain.disabled,false);assert.equal(f.nodes.prepare.disabled,true);assert.equal(f.nodes.empty.disabled,true);
 f.sample('EXP02,DRAINED,UNRELATED');f.controller.refresh();assert.equal(f.nodes.prepare.disabled,true);
});

test('drain ACK alone stays locked; only matching DRAINED unlocks and fill DONE is also required', async () => {
 const f=fixture();await f.cal().beforeCalibrationSave({subject:'S01',pose:'1'});await f.cal().beforeCalibrationSave({subject:'S01',pose:'5'});
 f.cal().onCalibrationOverviewSaved();f.controller.refresh();f.autoComplete(false);f.nodes.drain.click();await f.flush();f.controller.refresh();
 assert.equal(f.nodes.prepare.disabled,true);assert.equal(f.nodes.start.disabled,true);assert(f.controller.isBusy());
 const id=f.commands.find(s=>s.startsWith('EXP02,DRAIN,')).split(',')[2];
 f.sample('EXP02,DRAINED,OTHER');await f.flush();f.controller.refresh();assert.equal(f.nodes.prepare.disabled,true);
 f.sample(`EXP02,DRAINED,${id}`);await f.flush();f.controller.refresh();assert.equal(f.nodes.prepare.disabled,false);
 f.nodes.prepare.click();await f.flush();f.controller.refresh();assert.equal(f.nodes.empty.disabled,true);assert.equal(f.nodes.start.disabled,true);
 f.nodes.abort.click();await f.flush();f.controller.refresh();assert.equal(f.nodes.prepare.disabled,true);assert.equal(f.nodes.drain.disabled,false);
});
test('older firmware BAD_COMMAND leaves preparation disabled and sends no inflation', async () => {
 const f=fixture();f.cal().onCalibrationOverviewSaved();f.autoComplete(false);f.controller.refresh();f.nodes.drain.click();await f.flush();
 f.sample('EXP02,ERR,BAD_COMMAND');await f.flush();f.controller.refresh();
 assert.equal(f.nodes.prepare.disabled,true);assert(!f.commands.some(s=>s.startsWith('EXP02,START,')));
});
test('startup refill stays locked beyond eight minutes and stops at eleven minutes', async () => {
 const f=fixture();f.cal().onCalibrationOverviewSaved();f.autoComplete(false);f.controller.refresh();
 f.nodes.drain.click();await f.flush();
 const id=f.commands.find(s=>s.startsWith('EXP02,DRAIN,')).split(',')[2];
 await f.tick(480000);
 assert(f.controller.isBusy());assert.equal(f.nodes.prepare.disabled,true);
 assert.match(f.nodes.status.textContent,/充氣恢復開機高度/);
 assert(!f.commands.includes(`EXP02,STOP,${id}`));
 await f.tick(179999);assert(!f.commands.includes(`EXP02,STOP,${id}`));
 await f.tick(1);
 assert(f.commands.includes(`EXP02,STOP,${id}`));assert(!f.controller.isBusy());
 assert.equal(f.nodes.prepare.disabled,true);assert.equal(f.nodes.drain.disabled,false);
});
test('startup completion after eight minutes unlocks apply and cancels the timeout', async () => {
 const f=fixture();f.cal().onCalibrationOverviewSaved();f.autoComplete(false);f.controller.refresh();
 f.nodes.drain.click();await f.flush();
 const id=f.commands.find(s=>s.startsWith('EXP02,DRAIN,')).split(',')[2];
 await f.tick(500000);f.sample(`EXP02,DRAINED,${id}`);await f.flush();f.controller.refresh();
 assert.equal(f.nodes.prepare.disabled,false);assert.match(f.nodes.status.textContent,/已恢復開機高度/);
 await f.tick(160000);assert(!f.commands.includes(`EXP02,STOP,${id}`));
});
