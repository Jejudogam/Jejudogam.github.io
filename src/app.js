'use strict';
const {questions: BANK, labs: LABS, notes: NOTES} = COURSE;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'sqld-sprint-v1';
const C=COPY;
const copy=(key,values={})=>C[key].replace(/\{(\w+)\}/g,(_,name)=>values[name]??'');
const READING_SIZES = ['comfortable','large','extra'];
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
const blankState = () => ({version:1,session:null,latest:{},bookmarks:[],history:[],drafts:{},solved:[],assisted:[],labId:1,readingSize:'comfortable'});
function readState() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data || data.version !== 1) return blankState();
    const state = {...blankState(),...data};
    for(const field of ['bookmarks','history','solved','assisted']) if(!Array.isArray(state[field])) state[field]=[];
    for(const field of ['latest','drafts']) if(!state[field] || typeof state[field] !== 'object' || Array.isArray(state[field])) state[field]={};
    if(!LABS.some(l=>l.id===state.labId)) state.labId=1;
    if(!READING_SIZES.includes(state.readingSize)) state.readingSize='comfortable';
    const s=state.session;
    if(s && (!Array.isArray(s.ids) || !s.ids.length || !s.ids.every(id=>BANK.some(q=>q.id===id)) || new Set(s.ids).size!==s.ids.length || !['quick','exam','review'].includes(s.mode) || !Number.isFinite(s.started) || !Number.isInteger(s.index) || s.index<0 || s.index>=s.ids.length || !s.answers || !s.graded || (s.mode==='exam' && !Number.isFinite(s.deadline)))) state.session=null;
    return state;
  } catch {return blankState();}
}
let state = readState(), view = 'quiz', resultView = !!state.session?.done, reviewFilter='wrong', search='', toastTimer;
let sqlWorker=null, runTimer=null, running=false, resultData=null, hintOpen=false;
const lookup = id => BANK.find(q=>q.id===id);
const wrongIds = () => BANK.filter(q=>state.latest[q.id]?.correct===false).map(q=>q.id);
function save() {
  try {localStorage.setItem(KEY,JSON.stringify(state));}
  catch {$('#save-label').textContent=C.storageError;$('#save-label').hidden=false;}
  updateSidebar();
}
function applyReadingSize() {
  document.documentElement.setAttribute('data-reading',state.readingSize);
  $('#reading-size').value=state.readingSize;
}
function setReadingSize(size) {
  if(!READING_SIZES.includes(size))return;
  state.readingSize=size;applyReadingSize();save();
}
function updateSidebar() {
  const count=wrongIds().length, badge=$('#wrong-count');
  badge.textContent=count;badge.hidden=count===0;
}
function shuffle(list) {const copy=[...list];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
function startSession(mode,ids) {
  if(!ids) ids=mode==='exam' ? [...shuffle(BANK.filter(q=>q.subject===1)),...shuffle(BANK.filter(q=>q.subject===2))].map(q=>q.id) : [11,...shuffle(BANK.filter(q=>q.subject===1)).slice(0,2).map(q=>q.id),...shuffle(BANK.filter(q=>q.subject===2 && q.id!==11)).slice(0,7).map(q=>q.id)];
  state.session={mode,ids,index:0,answers:{},graded:{},started:Date.now(),deadline:mode==='exam'?Date.now()+90*60*1000:null,done:false};
  resultView=false;view='quiz';save();render();
}
function requestStart(mode,ids) {
  const s=state.session,hasProgress=s&&!s.done&&Object.keys(s.answers).length;
  if(mode==='exam'||hasProgress)openModal(`<h2>${mode==='exam'?C.examStartTitle:C.newSetTitle}</h2><p>${mode==='exam'?C.examStartDescription:C.newSetDescription}</p>${hasProgress?`<p>${C.replaceProgress}</p>`:''}<div class="button-row"><button class="secondary" data-action="close">${C.keepGoing}</button><button class="primary" id="confirm-start">${mode==='exam'?C.startExam:C.startNewSet}${icon('arrow')}</button></div>`,()=>{$('#confirm-start').onclick=()=>{closeModal();startSession(mode,ids);};});
  else startSession(mode,ids);
}
function record(q,selected) {
  const correct=selected===q.answer;
  const entry={id:q.id,selected:selected??null,correct,time:Date.now()};
  state.latest[q.id]=entry;state.history.push(entry);
  if(state.history.length>2500) state.history=state.history.slice(-2500);
  state.session.graded[q.id]=true;
}
function gradeCurrent() {
  const s=state.session, q=lookup(s.ids[s.index]);
  if(s.done || s.mode==='exam' || s.graded[q.id]) return;
  if(!Number.isInteger(s.answers[q.id])) {toast(C.selectFirst);return;}
  record(q,s.answers[q.id]);save();render();$('.feedback h2')?.focus();
}
function finish(force=false) {
  const s=state.session;if(s.done){resultView=true;render();return;}
  const missing=s.ids.filter(id=>!Number.isInteger(s.answers[id])).length;
  if(!force) {
    openModal(`<h2>${C.submitTitle}</h2><p>${missing?copy('submitMissing',{count:missing}):C.submitAll}</p><div class="button-row"><button class="secondary" data-action="close">${C.reviewAnswers}</button><button class="primary" data-action="finish-confirm">${C.submit}${icon('arrow')}</button></div>`);return;
  }
  for(const id of s.ids) if(!s.graded[id]) record(lookup(id),s.answers[id]);
  s.done=true;s.finished=Date.now();resultView=true;save();closeModal();render();
}
function selectAnswer(choice) {
  const s=state.session,id=s.ids[s.index];
  if(s.done||s.graded[id]||choice<0||choice>3)return;
  s.answers[id]=choice;save();render();
  document.querySelector(`[data-choice="${choice}"]`)?.focus({preventScroll:true});
}
function moveQuestion(index) {
  const s=state.session;if(index<0||index>=s.ids.length)return;
  s.index=index;resultView=false;save();render();$('.question-title')?.focus({preventScroll:true});
}
function formatTime(seconds) {
  const s=Math.max(0,Math.floor(seconds));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function timerValue() {const s=state.session;return formatTime((s.mode==='exam'?(s.done?s.deadline-s.finished:s.deadline-Date.now()):(s.done?s.finished:Date.now())-s.started)/1000);}
function tick() {
  const s=state.session;if(!s)return;
  if(s.mode==='exam'&&!s.done&&Date.now()>=s.deadline) {finish(true);toast(C.timeExpired);}
  const timer=$('#timer');if(timer){timer.textContent=timerValue();timer.classList.toggle('urgent',s.mode==='exam'&&!s.done&&s.deadline-Date.now()<300000);}
}
function codeBlock(sql) {
  let html=esc(sql).replace(/\b(SELECT|COUNT|AVG|SUM|FROM|WHERE|AS|NULL|LEFT|JOIN|ON|GROUP|BY|ORDER|HAVING|OVER|PARTITION|CASE|WHEN|THEN|ELSE|END|WITH|DESC|ASC)\b/g,'<span class="sql-keyword">$1</span>');
  html=html.replace(/(--[^\n]*)/g,'<span class="sql-comment">$1</span>');
  return `<pre class="sql-block" tabindex="0">${html}</pre>`;
}
function explanationText(text) {
  return text.split(/(`[^`]+`)/g).map(part=>part.startsWith('`')&&part.endsWith('`')?`<code>${esc(part.slice(1,-1))}</code>`:esc(part)).join('');
}
function renderExplanation(q,selected) {
  const explanation=EXPLANATIONS.questions[q.id];
  return `<div class="explanation-body">${explanation.paragraphs.map(p=>`<p>${explanationText(p)}</p>`).join('')}</div><details class="choice-explanations"><summary><span>${C.choiceExplanations}</span>${icon('chevron')}</summary><ol>${explanation.choices.map((reason,i)=>`<li class="${i===q.answer?'answer-correct':''} ${i===selected?'answer-selected':''}"><span class="explanation-number" aria-hidden="true">${i+1}</span><div>${i===q.answer||i===selected?`<div class="explanation-tags">${i===q.answer?`<span>${icon('check')}${C.correctChoice}</span>`:''}${i===selected?`<span>${C.selectedAnswer}</span>`:''}</div>`:''}<p>${explanationText(reason)}</p></div></li>`).join('')}</ol></details>`;
}
function renderLabWalkthrough(lab) {
  const explanation=EXPLANATIONS.labs[lab.id];
  return `<div class="lab-walkthrough">${codeBlock(explanation.formattedSql)}<ol class="walkthrough-steps">${explanation.steps.map(step=>`<li><code>${esc(step.sql)}</code><p>${explanationText(step.body)}</p></li>`).join('')}</ol><p class="walkthrough-note">${explanationText(explanation.note)}</p></div>`;
}
function questionMap(s) {
  const answered=s.ids.filter(id=>Number.isInteger(s.answers[id])).length;
  return `<aside class="question-navigator" aria-label="${C.answerMap}"><div class="navigator-head"><span>${C.answerMap}</span><span class="count">${answered}<span> / ${s.ids.length}</span></span></div><div class="question-grid">${s.ids.map((id,i)=>{
    const graded=s.graded[id],correct=s.answers[id]===lookup(id).answer,chosen=Number.isInteger(s.answers[id]);
    const status=graded?(correct?C.correct:C.incorrect):(chosen?C.answered:C.unanswered);
    return `<button class="q-dot ${i===s.index?'current':''} ${graded?(correct?'good':'bad'):chosen?'answered':''}" data-index="${i}" aria-label="${i+1}. ${status}${state.bookmarks.includes(id)?`, ${C.saveQuestion}`:''}" title="${i+1}. ${status}" ${i===s.index?'aria-current="step"':''}><span>${String(i+1).padStart(2,'0')}</span>${graded?`<span class="q-state">${icon(correct?'check':'close')}</span>`:chosen?'<i class="answer-dot"></i>':''}${state.bookmarks.includes(id)?`<span class="q-saved">${icon('bookmark')}</span>`:''}</button>`;
  }).join('')}</div><button class="submit-link" data-action="${s.done?'results':'finish'}">${s.done?C.results:C.submit}${icon('arrow')}</button></aside>`;
}
function renderQuiz() {
  const s=state.session;
  if(s.done&&resultView)return renderResults();
  const q=lookup(s.ids[s.index]),selected=s.answers[q.id],revealed=s.done||s.graded[q.id],correct=selected===q.answer,saved=state.bookmarks.includes(q.id);
  return `<div class="view-toolbar">${s.mode==='review'?`<button class="text-button" data-view="review">${icon('arrow-left')}${C.navReview}</button>`:`<div class="segmented" aria-label="${C.navQuiz}"><button class="segment ${s.mode!=='exam'?'active':''}" data-action="quick" aria-pressed="${s.mode!=='exam'}">${C.quick}<span class="segment-count">10</span></button><button class="segment ${s.mode==='exam'?'active':''}" data-action="exam" aria-pressed="${s.mode==='exam'}">${C.exam}<span class="segment-count">50</span></button></div>`}${s.mode==='exam'?`<div class="timer" title="${C.remaining}">${icon('clock')}<span id="timer">${timerValue()}</span></div>`:''}</div>
  <div class="quiz-layout"><section class="question-sheet" aria-label="${C.navQuiz}"><div class="question-meta"><div class="question-context"><span class="question-number">${String(s.index+1).padStart(2,'0')}<span> / ${s.ids.length}</span></span><span class="question-topic">${esc(q.topic)}</span></div><button class="icon-button bookmark ${saved?'on':''}" data-action="bookmark" aria-label="${saved?C.unsaveQuestion:C.saveQuestion}" title="${saved?C.unsaveQuestion:C.saveQuestion}" aria-pressed="${saved}">${icon('bookmark')}</button></div>
  <h1 class="question-title" tabindex="-1">${esc(q.title)}</h1>${q.sql?codeBlock(q.sql):''}
  <div class="choices" role="radiogroup" aria-label="${C.checkAnswer}">${q.choices.map((choice,i)=>`<button role="radio" aria-checked="${selected===i}" class="choice ${selected===i?'selected':''} ${revealed&&i===q.answer?'correct':''} ${revealed&&selected===i&&!correct?'incorrect':''}" data-choice="${i}" ${revealed?'disabled':''}><span class="choice-letter">${i+1}</span><span class="choice-text">${esc(choice)}</span><span class="choice-indicator">${revealed&&i===q.answer?icon('check'):revealed&&selected===i?icon('close'):selected===i?'<span class="selection-dot"></span>':''}</span></button>`).join('')}</div>
  ${revealed?`<section class="feedback ${correct?'':'bad'}" aria-label="${C.explanation}"><h2 tabindex="-1">${icon(correct?'check':'close')}<span>${correct?C.correct:copy('correctAnswer',{number:q.answer+1})}</span></h2>${renderExplanation(q,selected)}</section>`:''}
  <div class="question-actions"><button class="icon-button" data-action="prev" ${s.index===0?'disabled':''} aria-label="${C.previous}" title="${C.previous}">${icon('arrow-left')}</button>${!revealed&&s.mode!=='exam'?`<button class="primary" data-action="grade" ${!Number.isInteger(selected)?'disabled':''}>${C.checkAnswer}${icon('check')}</button>`:`<button class="primary" data-action="next">${s.index===s.ids.length-1?C.results:C.next}${icon('arrow')}</button>`}</div></section>${questionMap(s)}</div>`;
}

function scoreSession(s) {
  const correct=s.ids.filter(id=>s.answers[id]===lookup(id).answer).length;
  const subjects=[1,2].map(subject=>{const ids=s.ids.filter(id=>lookup(id).subject===subject);return {total:ids.length,correct:ids.filter(id=>s.answers[id]===lookup(id).answer).length};});
  const percent=Math.round(correct/s.ids.length*100);
  return {correct,subjects,percent,passed:percent>=60&&subjects.every(s=>s.total&&s.correct/s.total>=.4)};
}
function renderResults() {
  const s=state.session,score=scoreSession(s),wrong=s.ids.filter(id=>s.answers[id]!==lookup(id).answer);
  return `<section class="results-view"><div class="result-overview"><div><h1>${C.resultTitle}</h1><div class="score-value">${score.percent}<small>/ 100</small></div><div class="score-counts"><span><span class="sr-only">${C.correct}</span>${icon('check')}${score.correct}</span><span><span class="sr-only">${C.incorrect}</span>${icon('close')}${wrong.length}</span><span><span class="sr-only">${C.elapsed}</span>${icon('clock')}${formatTime(((s.finished||Date.now())-s.started)/1000)}</span></div></div><div class="subject-scores">${score.subjects.map((r,i)=>{const percent=r.total?r.correct/r.total*100:0;return `<div class="subject-score ${s.mode==='exam'&&percent<40?'bad':''}"><div class="spread"><span>${i===0?C.modeling:C.sqlSubject}</span><span class="count">${r.correct}<span> / ${r.total}</span></span></div><div class="score-bar" role="meter" aria-label="${i===0?C.modeling:C.sqlSubject}" aria-valuemin="0" aria-valuemax="${r.total||1}" aria-valuenow="${r.correct}"><span style="width:${percent}%"></span>${s.mode==='exam'?'<i class="pass-mark"></i>':''}</div></div>`;}).join('')}${s.mode==='exam'?`<p class="exam-verdict ${score.passed?'':'bad'}">${icon(score.passed?'check':'close')}${score.passed?C.pass:C.fail}</p>`:''}</div></div><div class="result-actions"><button class="primary" ${wrong.length?'data-action="retry-session"':'data-view="lab"'}>${wrong.length?C.retryWrong:C.navLab}${icon('arrow')}</button><button class="secondary" data-action="new-quick">${C.newSet}${icon('refresh')}</button><details class="score-help"><summary>${icon('info')}<span>${C.scoreHelp}</span></summary><p>${s.mode==='exam'?C.scoreCriteria:C.quickScoreNote}</p></details></div><div class="session-review">${s.ids.map((id,i)=>`<article class="review-row"><span class="review-status ${s.answers[id]===lookup(id).answer?'':'bad'}" aria-label="${s.answers[id]===lookup(id).answer?C.correct:C.incorrect}">${icon(s.answers[id]===lookup(id).answer?'check':'close')}</span><div class="review-content"><small>${String(i+1).padStart(2,'0')}<span class="meta-separator"></span>${esc(lookup(id).topic)}</small><h2>${esc(lookup(id).title)}</h2></div><button class="text-button explanation-link" data-index="${i}" aria-label="${i+1}. ${C.explanation}">${C.explanation}${icon('arrow')}</button></article>`).join('')}</div></section>`;
}
function schemaTable(name,columns,rows) {
  return `<section class="schema-table"><header><span>${icon('table')}<b>${name}</b></span><button class="icon-button" data-action="preview-${name}" aria-label="${name} ${C.viewData}" title="${C.viewData}">${icon('eye')}</button></header><div class="schema-columns">${columns.map(([col,type,key])=>`<div class="schema-col ${key?'is-key':''}"><span>${key?`<span class="sr-only">${key}</span>${icon(key==='PK'?'key':'link')}`:'<i></i>'}<code>${col}</code></span><small>${type}</small></div>`).join('')}</div><span class="sr-only">${rows}</span></section>`;
}
function renderLab() {
  const lab=LABS.find(l=>l.id===state.labId),draft=state.drafts[lab.id]??lab.starter;
  return `<div class="view-toolbar lab-toolbar"><label class="mission-picker"><span class="sr-only">${C.navLab}</span><select id="lab-select">${LABS.map(l=>`<option value="${l.id}" ${l.id===lab.id?'selected':''}>${String(l.id).padStart(2,'0')}. ${esc(l.title)}</option>`).join('')}</select></label><div class="lab-progress" title="${C.selfSolved}">${icon('check')}<span class="count">${state.solved.length}<span> / ${LABS.length}</span></span></div></div><div class="lab-layout"><div class="lab-main"><section class="lab-task"><div class="spread"><h1>${esc(lab.title)}</h1>${state.solved.includes(lab.id)?`<span class="solved-mark" aria-label="${C.solved}" title="${C.solved}">${icon('check')}</span>`:''}</div><p>${esc(lab.description)}</p><div class="task-tools"><button class="text-button" data-action="hint" aria-expanded="${hintOpen}">${icon('bulb')}${hintOpen?C.hideHint:C.hint}</button><button class="text-button" data-action="solution">${icon('code')}${C.solution}</button></div>${hintOpen?`<div class="hint-body">${esc(lab.hint)}</div>`:''}</section>
  <section class="editor-panel"><div class="editor-header"><span>query.sql</span><button class="icon-button" data-action="reset-query" aria-label="${C.reset}" title="${C.reset}">${icon('refresh')}</button></div><div class="editor"><div class="line-numbers" id="line-numbers" aria-hidden="true">${draft.split('\n').map((_,i)=>i+1).join('\n')}</div><textarea id="sql-editor" aria-label="${C.sqlEditor}" aria-describedby="sql-editor-hint" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off">${esc(draft)}</textarea></div><p class="sr-only" id="sql-editor-hint">${C.editorHelp}</p><div class="editor-footer"><button class="secondary" data-action="run" ${running?'disabled':''} title="Ctrl + Enter">${icon('play')}${C.run}</button><button class="primary" data-action="check-sql" ${running?'disabled':''}>${running?C.running:C.grade}${icon('check')}</button></div></section>
  <section class="result-panel" aria-label="${C.queryResult}" aria-live="polite" aria-busy="${running}"><div class="result-header"><h2>${C.queryResult}</h2>${resultData?.result?`<span class="result-metrics"><span>${resultData.result.values.length} ${C.rows}</span><span>${resultData.ms} ms</span></span>`:''}</div>${renderSQLResult()}</section>${state.solved.includes(lab.id)||state.assisted.includes(lab.id)?`<details class="lab-explanation"><summary><span>${C.labWalkthrough}</span>${icon('chevron')}</summary>${renderLabWalkthrough(lab)}</details>`:''}<div class="lab-next"><button class="text-button" data-action="next-lab">${C.nextLab}${icon('arrow')}</button></div></div>
  <aside class="schema-panel" aria-label="${C.database}">${schemaTable('employees',[['emp_id','INTEGER','PK'],['name','TEXT'],['dept_id','INTEGER','FK'],['salary','INTEGER'],['bonus','NULL'],['manager_id','NULL']],8)}<div class="relation-line" role="img" aria-label="${C.relatedKey}: employees.dept_id, departments.dept_id"><svg viewBox="0 0 64 52" aria-hidden="true"><path d="M32 0v52M24 0l8 12 8-12M24 43h16"/></svg><code>dept_id</code></div>${schemaTable('departments',[['dept_id','INTEGER','PK'],['dept_name','TEXT']],4)}<details class="environment"><summary>${icon('info')}<span>SQLite</span>${icon('chevron')}</summary><p>${C.environmentDescription}</p><button class="text-button" data-action="dialects">${C.dbmsDifference}${icon('arrow')}</button></details></aside></div>`;
}
function resultTable(result) {
  return `<div class="table-wrap" tabindex="0"><table><thead><tr>${result.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${result.values.map(row=>`<tr>${row.map(value=>`<td class="${value===null?'null':''}">${value===null?'NULL':esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${result.values.length===0?`<div class="result-empty">${C.queryZero}</div>`:''}`;
}
function renderSQLResult() {
  if(running)return `<div class="result-empty">${icon('clock')}<span>${C.running}</span></div>`;
  if(!resultData)return `<div class="result-empty"><svg class="empty-table" viewBox="0 0 160 70" role="img" aria-label="${C.queryEmpty}"><rect x="1" y="1" width="158" height="68" rx="6"/><path d="M1 23h158M1 46h158M54 1v68M107 1v68"/></svg></div>`;
  if(resultData.error)return `<div class="result-message error">${icon('close')}<div><strong>${C.queryError}</strong><p>${esc(resultData.error)}</p></div></div>`;
  let message='';
  if(resultData.passed===true)message=`<div class="result-message">${icon('check')}<span>${resultData.assisted?C.assistedCorrect:C.matched}</span></div>`;
  if(resultData.passed===false)message=`<div class="result-message bad">${icon('close')}<span>${C.mismatched}</span></div>`;
  if(resultData.stale)message=`<div class="result-message bad">${icon('refresh')}<span>${C.queryStale}</span></div>`;
  return message+resultTable(resultData.result);
}

function runSQL(check=false,sqlOverride=null,previewName=null) {
  if(running)return;
  const lab=LABS.find(l=>l.id===state.labId),sql=sqlOverride??state.drafts[lab.id]??lab.starter;
  if(!sql.trim()){toast(C.enterSQL);return;}
  running=true;resultData=null;const started=performance.now();
  const url=URL.createObjectURL(new Blob([$('#sql-engine').textContent],{type:'text/javascript'}));
  const worker=new Worker(url);sqlWorker=worker;URL.revokeObjectURL(url);
  const done=data=>{
    if(sqlWorker!==worker)return;
    clearTimeout(runTimer);worker.terminate();sqlWorker=null;running=false;
    if(data.passed===true&&!sqlOverride) {
      if(state.assisted.includes(lab.id))data.assisted=true;
      else if(!state.solved.includes(lab.id))state.solved.push(lab.id);
      save();
    }
    data.ms=Math.round(performance.now()-started);
    if(previewName){if(data.error)toast(data.error);else openModal(`<h2>${esc(previewName)}</h2>${resultTable(data.result)}<div class="button-row"><button class="primary" data-action="close">${C.close}</button></div>`);}
    else resultData=data;
    if(view==='lab')render();
  };
  worker.onmessage=event=>done(event.data);
  worker.onerror=event=>{event.preventDefault();done({error:C.engineError});};
  runTimer=setTimeout(()=>done({error:C.timeout}),8000);
  worker.postMessage({schema:COURSE.schema,variant:COURSE.variant,sql,solution:check?lab.solution:null,ordered:lab.ordered||false});
  if(view==='lab')render();
}
function cancelSQL(){if(sqlWorker)sqlWorker.terminate();sqlWorker=null;clearTimeout(runTimer);running=false;}
function renderNotes() {
  const matches=NOTES.filter(note=>note.join(' ').toLowerCase().includes(search.toLowerCase()));
  return `<h1 class="sr-only">${C.navNotes}</h1><div class="view-toolbar"><label class="search-wrap">${icon('search')}<input id="note-search" aria-label="${C.searchPlaceholder}" type="search" value="${esc(search)}" placeholder="${C.searchPlaceholder}"></label></div><div class="note-list">${matches.length?matches.map(([title,body,sql])=>`<article class="note-row"><div><h2>${esc(title)}</h2><p>${esc(body)}</p></div>${codeBlock(sql)}</article>`).join(''):`<div class="empty-state">${icon('search')}<p>${C.noMatches}</p></div>`}</div><details class="sources"><summary>${C.sources}${icon('chevron')}</summary><p>${C.sourcesDescription}</p><div><a href="https://www.dataq.or.kr/www/sub/a_04.do" target="_blank" rel="noopener">DataQ</a><a href="https://www.sqlite.org/lang_select.html" target="_blank" rel="noopener">SQLite</a><a href="https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/" target="_blank" rel="noopener">Oracle</a></div></details>`;
}
function renderReview() {
  const ids=reviewFilter==='wrong'?wrongIds():state.bookmarks.filter(id=>lookup(id));
  return `<h1 class="sr-only">${C.navReview}</h1><div class="view-toolbar"><div class="segmented"><button class="segment ${reviewFilter==='wrong'?'active':''}" data-filter="wrong" aria-pressed="${reviewFilter==='wrong'}">${C.reviewWrong}<span class="segment-count">${wrongIds().length}</span></button><button class="segment ${reviewFilter==='saved'?'active':''}" data-filter="saved" aria-pressed="${reviewFilter==='saved'}">${icon('bookmark')}${C.reviewSaved}<span class="segment-count">${state.bookmarks.length}</span></button></div>${ids.length?`<button class="primary" data-action="review-all">${C.retry}${icon('play')}</button>`:''}</div>${ids.length?`<div class="review-list">${ids.map(id=>{const q=lookup(id);return `<article class="review-row"><span class="review-index">${String(id).padStart(2,'0')}</span><div class="review-content"><small>${esc(q.topic)}</small><h2>${esc(q.title)}</h2></div><button class="icon-button" data-review-id="${id}" aria-label="${id}. ${C.retry}" title="${C.retry}">${icon('arrow')}</button>${reviewFilter==='saved'?`<button class="icon-button" data-remove-bookmark="${id}" aria-label="${id}. ${C.unsaveQuestion}" title="${C.unsaveQuestion}">${icon('close')}</button>`:''}</article>`;}).join('')}</div>`:`<section class="empty-state">${icon(reviewFilter==='wrong'?'check':'bookmark')}<h2>${reviewFilter==='wrong'?C.noWrong:C.noSaved}</h2><p>${reviewFilter==='wrong'?C.emptyReviewHelp:C.emptySavedHelp}</p><button class="primary" data-view="quiz">${C.navQuiz}${icon('arrow')}</button></section>`}`;
}

function render() {
  applyReadingSize();
  document.querySelectorAll('[data-view]').forEach(button=>{if(button.classList.contains('nav-item')){button.classList.toggle('active',button.dataset.view===view);if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}});
  $('#main').innerHTML=({quiz:renderQuiz,lab:renderLab,review:renderReview,notes:renderNotes})[view]();
  updateSidebar();
}
function navigate(nextView){if(!['quiz','lab','review','notes'].includes(nextView))return;if(view==='lab'&&nextView!=='lab')cancelSQL();view=nextView;render();globalThis.scrollTo?.({top:0,behavior:'auto'});}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function openModal(html,after){$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();after?.();}
function closeModal() {if($('#modal').open)$('#modal').close();}
function about(){openModal(`<h2>${C.aboutTitle}</h2><p>${C.aboutQuestions}</p><p>${C.aboutExam}</p><p>${C.aboutEngine}</p><p>${C.engineLimits}</p><p>${C.aboutStorage}</p><div class="source-links"><a href="https://www.dataq.or.kr/www/sub/a_04.do" target="_blank" rel="noopener">${C.examInfo}</a><a href="https://github.com/sql-js/sql.js" target="_blank" rel="noopener">${C.license}</a></div><div class="button-row"><a class="secondary" href="./index.html" download="sqld-sprint.html">${C.downloadHtml}</a><button class="primary" data-action="close">${C.close}</button></div>`);}
document.addEventListener('click',event=>{
  if(!event.target.closest('.reading-menu'))document.querySelectorAll('.reading-menu[open]').forEach(menu=>{menu.open=false;});
  const button=event.target.closest('button,a');if(!button||button.disabled)return;
  if(button.dataset.view){navigate(button.dataset.view);return;}
  if(button.classList.contains('brand')){event.preventDefault();navigate('quiz');return;}
  if(button.dataset.choice!==undefined){selectAnswer(Number(button.dataset.choice));return;}
  if(button.dataset.index!==undefined){moveQuestion(Number(button.dataset.index));return;}
  if(button.dataset.filter){reviewFilter=button.dataset.filter;render();return;}
  if(button.dataset.reviewId){requestStart('review',[Number(button.dataset.reviewId)]);return;}
  if(button.dataset.removeBookmark){state.bookmarks=state.bookmarks.filter(id=>id!==Number(button.dataset.removeBookmark));save();render();return;}
  const s=state.session,action=button.dataset.action;if(!action)return;
  switch(action){
    case 'quick':if(s.mode!=='quick')requestStart('quick');else if(s.done)requestStart('quick');else toast(C.quickInProgress);break;
    case 'new-quick':requestStart('quick');break;
    case 'exam':if(s.mode==='exam'&&!s.done)toast(C.examInProgress);else requestStart('exam');break;
    case 'grade':gradeCurrent();break;
    case 'prev':moveQuestion(s.index-1);break;
    case 'next':if(s.index<s.ids.length-1)moveQuestion(s.index+1);else finish();break;
    case 'finish':finish();break;
    case 'finish-confirm':finish(true);break;
    case 'results':resultView=true;render();break;
    case 'bookmark':{const id=s.ids[s.index];state.bookmarks=state.bookmarks.includes(id)?state.bookmarks.filter(x=>x!==id):[...state.bookmarks,id];save();render();break;}
    case 'retry-session':requestStart('review',s.ids.filter(id=>s.answers[id]!==lookup(id).answer));break;
    case 'review-all':requestStart('review',reviewFilter==='wrong'?wrongIds():state.bookmarks.filter(id=>lookup(id)));break;
    case 'close':closeModal();break;
    case 'help':openModal(`<h2>${C.shortcuts}</h2><ul>${['shortcutChoose','shortcutEnter','shortcutMove','shortcutRun','shortcutIndent','shortcutLeave','shortcutClose'].map(key=>`<li>${esc(C[key])}</li>`).join('')}</ul><div class="button-row"><button class="primary" data-action="close">${C.close}</button></div>`);break;
    case 'about':about();break;
    case 'run':runSQL(false);break;
    case 'check-sql':runSQL(true);break;
    case 'hint':hintOpen=!hintOpen;render();break;
    case 'reset-query':openModal(`<h2>${C.resetTitle}</h2><p>${C.resetDescription}</p><div class="button-row"><button class="secondary" data-action="close">${C.cancel}</button><button class="primary" data-action="reset-query-confirm">${C.reset}</button></div>`);break;
    case 'reset-query-confirm':cancelSQL();delete state.drafts[state.labId];resultData=null;save();closeModal();render();break;
    case 'solution':openModal(`<h2>${C.solutionTitle}</h2><p>${C.solutionDescription}</p><div class="button-row"><button class="secondary" data-action="close">${C.cancel}</button><button class="primary" data-action="show-solution">${C.showSolution}</button></div>`);break;
    case 'show-solution':{const lab=LABS.find(l=>l.id===state.labId);if(!state.assisted.includes(lab.id))state.assisted.push(lab.id);save();openModal(`<h2>${C.solutionHeading}</h2>${renderLabWalkthrough(lab)}<div class="button-row"><button class="secondary" data-action="use-solution">${C.useSolution}</button><button class="primary" data-action="close">${C.close}</button></div>`);break;}
    case 'use-solution':cancelSQL();state.drafts[state.labId]=EXPLANATIONS.labs[state.labId].formattedSql;resultData=null;save();closeModal();render();break;
    case 'preview-employees':runSQL(false,'SELECT * FROM employees ORDER BY emp_id;','employees');break;
    case 'preview-departments':runSQL(false,'SELECT * FROM departments ORDER BY dept_id;','departments');break;
    case 'next-lab':cancelSQL();state.labId=state.labId%LABS.length+1;resultData=null;hintOpen=false;save();render();break;
    case 'dialects':search='DBMS';navigate('notes');break;
  }
});
document.addEventListener('input',event=>{
  if(event.target.id==='sql-editor'){
    state.drafts[state.labId]=event.target.value;
    $('#line-numbers').textContent=event.target.value.split('\n').map((_,i)=>i+1).join('\n');
    if(resultData&&!resultData.stale){resultData.stale=true;const panel=$('.result-panel');panel.innerHTML=`<div class="result-header"><h2>${C.queryResult}</h2><span class="result-metrics">${C.oldQueryResult}</span></div>`+renderSQLResult();}
    save();
  }
  if(event.target.id==='note-search'){
    search=event.target.value;const position=event.target.selectionStart;render();$('#note-search').focus();try{$('#note-search').setSelectionRange(position,position);}catch{}
  }
});
document.addEventListener('change',event=>{if(event.target.id==='reading-size'){setReadingSize(event.target.value);return;}if(event.target.id==='lab-select'){cancelSQL();state.labId=Number(event.target.value);resultData=null;hintOpen=false;save();render();}});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')document.querySelectorAll('.reading-menu[open]').forEach(menu=>{menu.open=false;});
  if($('#modal').open)return;
  if(event.target.id==='sql-editor'){
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();runSQL(false);}
    if(event.key==='Tab'&&!event.shiftKey){event.preventDefault();const editor=event.target;editor.setRangeText('  ',editor.selectionStart,editor.selectionEnd,'end');editor.dispatchEvent(new Event('input',{bubbles:true}));}
    return;
  }
  if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.ctrlKey||event.metaKey||event.altKey||view!=='quiz'||resultView)return;
  if(/^[1-4]$/.test(event.key)){event.preventDefault();selectAnswer(Number(event.key)-1);}
  if(event.key==='ArrowLeft'){event.preventDefault();moveQuestion(state.session.index-1);}
  if(event.key==='ArrowRight'){event.preventDefault();moveQuestion(state.session.index+1);}
  if(event.key==='Enter'){
    // Let non-answer controls retain their normal keyboard activation.
    if(event.target.closest('button,a,summary')&&!event.target.closest('[data-choice]'))return;
    event.preventDefault();const s=state.session,id=s.ids[s.index];if(s.mode==='exam'||s.graded[id]){if(s.index===s.ids.length-1)finish();else moveQuestion(s.index+1);}else gradeCurrent();
  }
});
document.addEventListener('scroll',event=>{if(event.target.id==='sql-editor')$('#line-numbers').scrollTop=event.target.scrollTop;},true);
if(!state.session)startSession('quick');else render();
tick();setInterval(tick,1000);
