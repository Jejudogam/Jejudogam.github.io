import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
let checks=0;
const test=(label,fn)=>{fn();checks++;console.log(`PASS ${label}`);};
const c=vm.createContext({self:{}});vm.runInContext(source('src/course.js'),c);vm.runInContext(source('src/worker.js'),c);
const {questions,labs,schema,variant}=c.COURSE;
const SQL=await require('./vendor/sql-asm.js')();
const run=sql=>c.execute(SQL,schema,sql);
test('50 unique original questions with 10/40 subject distribution',()=>{assert.equal(questions.length,50);assert.equal(new Set(questions.map(q=>q.id)).size,50);assert.equal(questions.filter(q=>q.subject===1).length,10);questions.forEach(q=>{assert.equal(q.choices.length,4);assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4);assert.ok(q.explanation.length>20);});});
test('all 12 SQL missions execute on base and variant fixtures',()=>{assert.equal(labs.length,12);for(const lab of labs){const a=c.execute(SQL,schema,lab.solution),b=c.execute(SQL,schema+variant,lab.solution);assert.ok(a.columns.length);assert.ok(b.columns.length);}});
test('NULL counts, averages and zero are handled by actual SQLite',()=>{assert.equal(JSON.stringify(run('SELECT COUNT(*),COUNT(bonus),AVG(bonus) FROM employees;').values),'[[8,5,220]]');assert.equal(JSON.stringify(run('SELECT COUNT(*) FROM employees WHERE bonus = NULL;').values),'[[0]]');});
test('outer join retains empty department with zero employees',()=>{const result=run(labs[3].solution);assert.equal(JSON.stringify(result.values),'[["개발",3],["기획",2],["마케팅",2],["인사",0]]');});
test('ranking ties and cumulative sums',()=>{assert.equal(JSON.stringify(run(labs[6].solution).values.map(r=>r[2])),'[1,2,2,1,2,1,1]');assert.equal(run(labs[8].solution).values.at(-1)[2],29800);});
test('multiset comparison preserves duplicate counts, order is conditional',()=>{const a={values:[[1],[2],[2]]},b={values:[[2],[1],[2]]},d={values:[[1],[2]]};assert.equal(c.comparable(a,false),c.comparable(b,false));assert.notEqual(c.comparable(a,true),c.comparable(b,true));assert.notEqual(c.comparable(a,false),c.comparable(d,false));});
test('variant fixture rejects a hard-coded output matching only example data',()=>{const hardcoded="SELECT '민서',5000 UNION ALL SELECT '도윤',4500 UNION ALL SELECT '지훈',4000 UNION ALL SELECT '서연',4000;";assert.equal(c.comparable(run(hardcoded),true),c.comparable(run(labs[0].solution),true));assert.notEqual(c.comparable(c.execute(SQL,schema+variant,hardcoded),true),c.comparable(c.execute(SQL,schema+variant,labs[0].solution),true));});
test('SQL errors, empty SQL, mutation, multi-statement and result limit',()=>{assert.throws(()=>run('SELECT missing FROM employees'));assert.throws(()=>run(''));assert.throws(()=>run('DELETE FROM employees RETURNING *'));assert.throws(()=>run('SELECT 1; SELECT 2;'));assert.throws(()=>run('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<501) SELECT x FROM n;'));assert.equal(run('SELECT * FROM employees').values.length,8);});
const element=()=>({innerHTML:'',textContent:'',style:{},attributes:{},open:false,classList:{add(){},remove(){},toggle(){}},setAttribute(key,value){this.attributes[key]=value;},focus(){},showModal(){this.open=true;},close(){this.open=false;}});
function appContext(saved=null){
  const elements=new Map(),storage=new Map(saved?[['sqld-sprint-v1',saved]]:[]),listeners=new Map();
  const get=key=>{if(!elements.has(key))elements.set(key,element());return elements.get(key);};
  const context=vm.createContext({document:{documentElement:get('html'),querySelector:get,querySelectorAll:()=>[],addEventListener(type,listener){listeners.set(type,listener);}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},Event,setInterval(){},setTimeout(){},clearTimeout(){},performance:{now:()=>0},console});
  vm.runInContext(source('src/course.js'),context);vm.runInContext('const COPY='+source('src/ui.json')+';',context);vm.runInContext('const EXPLANATIONS='+source('src/explanations.json')+';',context);vm.runInContext(source('src/app.js'),context);
  return {context,storage,elements,listeners,eval:code=>vm.runInContext(code,context)};
}
const app=appContext();
const explanations=JSON.parse(source('src/explanations.json'));
test('every question has reasoning and a reason for each immutable choice',()=>{
  assert.equal(Object.keys(explanations.questions).length,questions.length);
  for(const q of questions){const entry=explanations.questions[q.id];assert.equal(entry.paragraphs.length,2);assert.equal(entry.choices.length,q.choices.length);for(const text of [...entry.paragraphs,...entry.choices]){assert.ok(typeof text==='string'&&text.trim().length>10);assert.ok(/[가-힣]/.test(text));assert.ok(!/\?{2,}/.test(text));}}
});
test('each lab walkthrough uses the original solution and produces identical results',()=>{
  assert.equal(Object.keys(explanations.labs).length,labs.length);
  for(const lab of labs){const entry=explanations.labs[lab.id];assert.ok(entry.steps.length>=2&&entry.steps.length<=5);assert.equal(entry.formattedSql.replace(/\s/g,''),lab.solution.replace(/\s/g,''));assert.equal(c.comparable(run(entry.formattedSql),true),c.comparable(run(lab.solution),true));assert.ok(entry.note.length>10);for(const step of entry.steps){assert.ok(lab.solution.replace(/\s/g,'').includes(step.sql.replace(/\s/g,'')),`Lab ${lab.id}: ${step.sql}`);assert.ok(step.body.length>10);}}
});
test('explanation formatting supports inline code and escapes all HTML',()=>{
  assert.equal(app.eval('explanationText("Use `<script>` & <img>")'),'Use <code>&lt;script&gt;</code> &amp; &lt;img&gt;');
});
test('explanations stay hidden until grading, and exam explanations wait for submission',()=>{
  const learning=appContext();
  assert.ok(!learning.eval('renderQuiz()').includes('choice-explanations'));
  learning.eval('selectAnswer(0);gradeCurrent();');
  assert.ok(learning.eval('renderQuiz()').includes('choice-explanations'));
  assert.ok(learning.eval('renderQuiz()').includes('answer-selected'));
  learning.eval('startSession("exam");selectAnswer(0);gradeCurrent();');
  assert.ok(!learning.eval('renderQuiz()').includes('choice-explanations'));
  learning.eval('finish(true);resultView=false;');
  assert.ok(learning.eval('renderQuiz()').includes('choice-explanations'));
});
test('lab walkthrough is revealed only after solving or choosing to see the solution',()=>{
  const learning=appContext();
  assert.ok(!learning.eval('renderLab()').includes('lab-explanation'));
  learning.eval('state.assisted.push(1);');
  assert.ok(learning.eval('renderLab()').includes('lab-explanation'));
  assert.equal(learning.eval('state.solved.length'),0);
  learning.eval('state.assisted=[];state.solved.push(1);');
  assert.ok(learning.eval('renderLab()').includes('lab-explanation'));
  learning.eval('state.labId=2;');
  assert.ok(!learning.eval('renderLab()').includes('lab-explanation'));
});
test('Enter on explanation disclosure keeps native expansion instead of advancing the quiz',()=>{
  const learning=appContext();learning.eval('selectAnswer(0);gradeCurrent();');let prevented=false;
  learning.listeners.get('keydown')({key:'Enter',target:{tagName:'SUMMARY',closest:selector=>selector==='button,a,summary'?{}:null},preventDefault(){prevented=true;}});
  assert.equal(prevented,false);assert.equal(learning.eval('state.session.index'),0);
});
test('every question renders choice reasoning and lab solution modal uses the complete walkthrough',()=>{
  const learning=appContext();
  for(const q of questions){const html=learning.eval(`renderExplanation(lookup(${q.id}),${q.answer})`);assert.equal((html.match(/explanation-number/g)||[]).length,4);assert.ok(!html.includes('undefined'));}
  const click=learning.listeners.get('click');
  click({target:{closest:selector=>selector==='.reading-menu'?null:{dataset:{action:'show-solution'},classList:{contains:()=>false}}}});
  assert.ok(learning.elements.get('#modal-content').innerHTML.includes('walkthrough-steps'));
  assert.equal(learning.eval('state.assisted.includes(1)'),true);
  click({target:{closest:selector=>selector==='.reading-menu'?null:{dataset:{action:'use-solution'},classList:{contains:()=>false}}}});
  assert.equal(learning.eval('state.drafts[1]'),explanations.labs[1].formattedSql);
});
test('quick quiz starts with 10 unique questions, no answer revealed',()=>{assert.equal(app.eval('state.session.ids.length'),10);assert.equal(app.eval('new Set(state.session.ids).size'),10);assert.ok(!app.eval('renderQuiz()').includes('정답이에요.'));});
test('answer grading records a wrong answer only once',()=>{app.eval('selectAnswer(0);gradeCurrent();gradeCurrent();');assert.equal(app.eval('state.history.length'),1);assert.equal(app.eval('wrongIds().length'),1);assert.ok(app.eval('renderQuiz()').includes('정답은 2번'));});
test('correct retry clears wrong list and accumulates attempt history',()=>{app.eval('startSession("review",[11]);selectAnswer(1);gradeCurrent();');assert.equal(app.eval('wrongIds().length'),0);assert.equal(app.eval('state.history.length'),2);});
test('exam has 50 questions, 90-minute deadline and no early grading',()=>{app.eval('startSession("exam");selectAnswer(0);gradeCurrent();');assert.equal(app.eval('state.session.ids.length'),50);assert.equal(app.eval('state.session.deadline-state.session.started'),5400000);assert.equal(app.eval('Object.keys(state.session.graded).length'),0);assert.ok(!app.eval('renderQuiz()').includes('정답이에요.'));});
test('60 overall with subject below 40% is not a pass',()=>{app.eval('state.session.answers={};for(const id of state.session.ids.filter(id=>id>10).slice(0,30))state.session.answers[id]=lookup(id).answer;');assert.equal(app.eval('scoreSession(state.session).percent'),60);assert.equal(app.eval('scoreSession(state.session).passed'),false);});
test('60 overall and both subjects at least 40% passes',()=>{app.eval('state.session.answers={};for(const id of [...state.session.ids.filter(id=>id<=10).slice(0,4),...state.session.ids.filter(id=>id>10).slice(0,26)])state.session.answers[id]=lookup(id).answer;');assert.equal(app.eval('scoreSession(state.session).passed'),true);});
test('unfinished exam preserves deadline, selections, drafts and bookmarks',()=>{app.eval('state.drafts[1]="SELECT 1;";state.bookmarks=[11];save();');const restored=appContext(app.storage.get('sqld-sprint-v1'));assert.equal(restored.eval('state.session.deadline'),app.eval('state.session.deadline'));assert.equal(restored.eval('Object.keys(state.session.answers).length'),30);assert.equal(restored.eval('state.drafts[1]'),'SELECT 1;');assert.equal(restored.eval('state.bookmarks[0]'),11);});
test('expired exam automatically grades once and locks answers',()=>{app.eval('state.session.deadline=Date.now()-1;tick();tick();');assert.equal(app.eval('state.session.done'),true);assert.equal(app.eval('Object.keys(state.session.graded).length'),50);assert.equal(app.eval('state.history.length'),52);const before=app.eval('JSON.stringify(state.session.answers)');app.eval('selectAnswer(3);');assert.equal(app.eval('JSON.stringify(state.session.answers)'),before);});
test('partial submission treats unanswered questions as incorrect',()=>{const partial=appContext();partial.eval('selectAnswer(1);finish(true);');assert.equal(partial.eval('scoreSession(state.session).percent'),10);assert.equal(partial.eval('wrongIds().length'),9);});
test('bad stored JSON safely starts a new session',()=>{assert.equal(appContext('{broken').eval('state.session.ids.length'),10);});
test('reading preference persists across reload without replacing the active exam or SQL draft',()=>{
  const reader=appContext();reader.eval('startSession("exam");selectAnswer(2);state.drafts[1]="SELECT 1;";save();');
  const session=reader.eval('JSON.stringify(state.session)');
  for(const size of ['large','extra','comfortable']){
    reader.listeners.get('change')({target:{id:'reading-size',value:size}});
    const restored=appContext(reader.storage.get('sqld-sprint-v1'));
    assert.equal(restored.eval('state.readingSize'),size);
    assert.equal(restored.elements.get('html').attributes['data-reading'],size);
    assert.equal(restored.elements.get('#reading-size').value,size);
    assert.equal(restored.eval('JSON.stringify(state.session)'),session);
    assert.equal(restored.eval('state.drafts[1]'),'SELECT 1;');
  }
});
test('older and invalid reading preferences fall back while preserving existing progress',()=>{
  const saved=JSON.parse(app.storage.get('sqld-sprint-v1'));
  for(const value of [undefined,'tiny',null]){
    saved.readingSize=value;
    const restored=appContext(JSON.stringify(saved));
    assert.equal(restored.eval('state.readingSize'),'comfortable');
    assert.equal(restored.eval('state.history.length'),saved.history.length);
    restored.eval('setReadingSize("unknown")');
    assert.equal(restored.eval('state.readingSize'),'comfortable');
  }
});
test('SQL Tab inserts two spaces; Shift+Tab retains native focus escape',()=>{
  const editorApp=appContext();let prevented=0,inserted='',dispatched=0;
  const editor={id:'sql-editor',selectionStart:0,selectionEnd:0,setRangeText(text){inserted+=text;},dispatchEvent(){dispatched++;}};
  const keydown=editorApp.listeners.get('keydown');
  keydown({key:'Tab',shiftKey:true,target:editor,preventDefault(){prevented++;}});
  assert.equal(prevented,0);assert.equal(inserted,'');
  keydown({key:'Tab',shiftKey:false,target:editor,preventDefault(){prevented++;}});
  assert.equal(prevented,1);assert.equal(inserted,'  ');assert.equal(dispatched,1);
});
test('all views render with HTML-escaped query drafts',()=>{app.eval('state.drafts[1]="</textarea><script>alert(1)</script>";');for(const name of ['quiz','lab','review','notes'])assert.ok(app.eval(`view=${JSON.stringify(name)};render();document.querySelector('#main').innerHTML`).length>500);assert.ok(app.eval('renderLab()').includes('&lt;/textarea&gt;'));});
test('standalone output embeds engine and has no external runtime dependencies',()=>{const html=source('dist/index.html');assert.ok(html.includes('initSqlJs'));assert.ok(html.includes('sql.js MIT license'));assert.ok(!/<script[^>]+src=|<link[^>]+href=/i.test(html));assert.equal((html.match(/<script(?:\s|>)/g)||[]).length,3);assert.equal((html.match(/<\/script>/g)||[]).length,3);});
test('built HTML scripts compile without template replacement corruption',()=>{const scripts=[...source('dist/index.html').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]);assert.equal(scripts.length,3);scripts.forEach(script=>new vm.Script(script));assert.ok(scripts[1].includes("^[0-9]{3}$"));});
const workerContext=vm.createContext({console,setTimeout,clearTimeout,TextDecoder,TextEncoder,self:{location:{href:'blob:local-sql-test'},postMessage:data=>{workerContext.output=data;}}});
vm.runInContext(source('vendor/sql-asm.js')+'\n'+source('src/worker.js'),workerContext);
await workerContext.self.onmessage({data:{schema,variant,sql:labs[0].solution,solution:labs[0].solution,ordered:true}});
test('bundled browser-worker engine initializes and grades a real query',()=>{assert.equal(workerContext.output.passed,true);assert.equal(workerContext.output.result.values.length,4);});
console.log(`\n${checks} checks passed.`);
