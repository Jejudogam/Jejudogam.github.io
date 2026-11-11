'use strict';
const {questions: BANK, labs: LABS, notes: NOTES} = COURSE;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'sqld-sprint-v1';
const blankState = () => ({version:1,session:null,latest:{},bookmarks:[],history:[],drafts:{},solved:[],assisted:[],labId:1});
function readState() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (!data || data.version !== 1) return blankState();
    const state = {...blankState(),...data};
    for(const field of ['bookmarks','history','solved','assisted']) if(!Array.isArray(state[field])) state[field]=[];
    for(const field of ['latest','drafts']) if(!state[field] || typeof state[field] !== 'object' || Array.isArray(state[field])) state[field]={};
    if(!LABS.some(l=>l.id===state.labId)) state.labId=1;
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
  catch {$('#save-label').textContent='저장 공간 제한 · 이번 학습만 유지';}
  updateSidebar();
}
function updateSidebar() {
  $('#wrong-count').textContent=wrongIds().length;
  const mastered=BANK.filter(q=>state.latest[q.id]?.correct===true).length;
  $('#mastery-count').textContent=`${mastered} / 50`;
  $('#mastery-bar').style.width=`${mastered*2}%`;
}
function shuffle(list) {const copy=[...list];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
function startSession(mode,ids) {
  if(!ids) ids=mode==='exam' ? [...shuffle(BANK.filter(q=>q.subject===1)),...shuffle(BANK.filter(q=>q.subject===2))].map(q=>q.id) : [11,...shuffle(BANK.filter(q=>q.subject===1)).slice(0,2).map(q=>q.id),...shuffle(BANK.filter(q=>q.subject===2 && q.id!==11)).slice(0,7).map(q=>q.id)];
  state.session={mode,ids,index:0,answers:{},graded:{},started:Date.now(),deadline:mode==='exam'?Date.now()+90*60*1000:null,done:false};
  resultView=false;view='quiz';save();render();
}
function requestStart(mode,ids) {
  const s=state.session;
  const hasProgress=s && !s.done && Object.keys(s.answers).length;
  const text=mode==='exam'?'모델링 10문제와 SQL 40문제를 90분 동안 풉니다. 정답과 해설은 제출 후 공개됩니다. 다른 메뉴로 이동하거나 브라우저를 닫아도 제한 시간은 계속 흐릅니다.':'기존 문제 은행에서 새로 골라 연습합니다. 이미 채점된 학습 기록은 오답 노트에 남습니다.';
  if(mode==='exam'||hasProgress) openModal(`<h2>${mode==='exam'?'실전 모드로 들어갈까요?':'새 문제 세트를 시작할까요?'}</h2><p>${text}</p>${hasProgress?'<p>진행 중인 세트는 새 세트로 바뀝니다. 아직 채점하지 않은 답안은 기록에 반영되지 않습니다.</p>':''}<div class="button-row"><button class="secondary" data-action="close">계속 풀기</button><button class="primary" id="confirm-start">${mode==='exam'?'90분 모의고사 시작':'새 세트 시작'} →</button></div>`,()=>{$('#confirm-start').onclick=()=>{closeModal();startSession(mode,ids);};});
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
  if(!Number.isInteger(s.answers[q.id])) {toast('먼저 답을 골라주세요.');return;}
  record(q,s.answers[q.id]);save();render();
}
function finish(force=false) {
  const s=state.session;if(s.done){resultView=true;render();return;}
  const missing=s.ids.filter(id=>!Number.isInteger(s.answers[id])).length;
  if(!force) {
    openModal(`<h2>답안을 제출할까요?</h2><p>${missing?`아직 답하지 않은 문제가 ${missing}개 있어요. 제출하면 미응답은 오답으로 처리됩니다.`:'모든 문제에 답했어요. 점수와 과목별 결과를 확인해 보세요.'}</p><div class="button-row"><button class="secondary" data-action="close">다시 확인</button><button class="primary" data-action="finish-confirm">제출하고 결과 보기 →</button></div>`);return;
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
  s.index=index;resultView=false;save();render();
}
function formatTime(seconds) {
  const s=Math.max(0,Math.floor(seconds));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function timerValue() {const s=state.session;return formatTime((s.mode==='exam'?(s.done?s.deadline-s.finished:s.deadline-Date.now()):(s.done?s.finished:Date.now())-s.started)/1000);}
function tick() {
  const s=state.session;if(!s)return;
  if(s.mode==='exam'&&!s.done&&Date.now()>=s.deadline) {finish(true);toast('제한 시간이 끝나 답안을 자동 제출했어요.');}
  const timer=$('#timer');if(timer){timer.textContent=timerValue();timer.classList.toggle('urgent',s.mode==='exam'&&!s.done&&s.deadline-Date.now()<300000);}
}
function codeBlock(sql,label='SQL') {
  let html=esc(sql).replace(/\b(SELECT|COUNT|AVG|SUM|FROM|WHERE|AS|NULL|LEFT|JOIN|ON|GROUP|BY|ORDER|HAVING|OVER|PARTITION|CASE|WHEN|THEN|ELSE|END|WITH|DESC|ASC)\b/g,'<span class="sql-keyword">$1</span>');
  html=html.replace(/(--[^\n]*)/g,'<span class="sql-comment">$1</span>');
  return `<div class="code-block"><div class="code-label"><span>${label}</span><span>읽고, 결과를 떠올려 보세요</span></div><pre>${html}</pre></div>`;
}
function renderQuiz() {
  const s=state.session, answered=s.ids.filter(id=>Number.isInteger(s.answers[id])).length;
  if(resultView&&s.done)return renderResults();
  const q=lookup(s.ids[s.index]),selected=s.answers[q.id],revealed=!!s.graded[q.id],correct=selected===q.answer;
  const modeLabel=s.mode==='exam'?'실전 모의고사':s.mode==='review'?'오답 집중 복습':'10문제 벼락치기';
  return `<div class="hero"><div><div class="eyebrow">A LITTLE PRACTICE, EVERY DAY</div><h1>합격까지, 한 문제씩.</h1><p>아는 건 확실하게, 헷갈리는 건 지금 잡고 가요.</p></div><div class="hero-stamp">ONE QUESTION<b>ONE STEP</b>CLOSER TO YOUR GOAL</div></div>
  <div class="modebar"><div class="segmented" aria-label="학습 모드"><button class="segment ${s.mode!=='exam'?'active':''}" data-action="quick">⚡ 벼락치기 <small>10문제</small></button><button class="segment ${s.mode==='exam'?'active':''}" data-action="exam">실전 모의고사 <small>50문제 · 90분</small></button></div><span class="mode-info">${s.mode==='exam'?'제출 후 정답과 해설을 확인해요':'바로 채점하고, 해설로 한 번 더 기억해요'}</span></div>
  <div class="quiz-layout"><div><section class="panel question-panel" aria-label="문제 풀이"><div class="question-top"><span class="tag">${modeLabel}</span><span class="muted">${q.subject}과목 · ${q.subject===1?'데이터 모델링':'SQL 기본 및 활용'}</span><span class="timer" title="${s.mode==='exam'?'남은 시간':'학습 경과 시간'}">◷ <span id="timer">${timerValue()}</span></span></div><div class="question-body">
  <div class="question-meta"><span class="question-number">QUESTION ${String(s.index+1).padStart(2,'0')} <small>/ ${s.ids.length}</small></span><button class="bookmark ${state.bookmarks.includes(q.id)?'on':''}" data-action="bookmark" aria-pressed="${state.bookmarks.includes(q.id)}">${state.bookmarks.includes(q.id)?'◆':'◇'} 다시 볼 문제</button></div><h2 class="question-title">${esc(q.title)}</h2>
  ${q.sql?codeBlock(q.sql):''}<div class="choices" role="radiogroup" aria-label="정답 선택">${q.choices.map((choice,i)=>`<button role="radio" aria-checked="${selected===i}" class="choice ${selected===i?'selected':''} ${revealed&&i===q.answer?'correct':''} ${revealed&&selected===i&&!correct?'incorrect':''}" data-choice="${i}" ${revealed?'disabled':''}><span class="choice-letter">${i+1}</span><span class="choice-text">${esc(choice)}</span>${revealed&&i===q.answer?'<span class="choice-check">✓</span>':revealed&&selected===i?'<span class="choice-check">×</span>':''}</button>`).join('')}</div>
  ${revealed?`<div class="feedback ${correct?'':'bad'}" role="status"><h3>${correct?'✓ 정답이에요. 이 개념은 기억해 두세요.':`정답은 ${q.answer+1}번이에요. ${selected===undefined?'미응답으로 처리했어요.':'여기서 한 번 짚고 갈게요.'}`}</h3><p>${esc(q.explanation)}</p><div style="margin-top:10px"><span class="tag">${esc(q.topic)}</span></div></div>`:''}</div>
  <div class="question-bottom"><span class="keyboard-hint"><span class="kbd">1</span> ~ <span class="kbd">4</span> 답 선택 <span style="margin-left:8px" class="kbd">Enter</span> ${s.mode==='exam'?'다음 문제':'정답 확인'}</span><div class="button-row"><button class="ghost" data-action="prev" ${s.index===0?'disabled':''}>← 이전</button>${!revealed&&s.mode!=='exam'?`<button class="primary" data-action="grade" ${!Number.isInteger(selected)?'disabled':''}>정답 확인 <span>→</span></button>`:`<button class="primary" data-action="next">${s.index===s.ids.length-1?'결과 보기':'다음 문제'} <span>→</span></button>`}</div></div></section>
  <div class="subfooter"><span>직접 만든 연습문제 · 공식 기출문제가 아닙니다</span><button class="ghost" data-action="${s.done?'results':'finish'}">${s.done?'채점 결과 보기':'학습 마치고 채점'} ↗</button></div></div>
  <aside class="right-rail"><section class="panel rail-card"><div class="spread"><h3 class="rail-title">나의 풀이 현황</h3><span class="mini-muted">${answered} / ${s.ids.length}</span></div><div class="progress"><span style="width:${answered/s.ids.length*100}%"></span></div><div class="question-grid">${s.ids.map((id,i)=>`<button class="q-dot ${i===s.index?'current':''} ${s.graded[id]?(s.answers[id]===lookup(id).answer?'good':'bad'):Number.isInteger(s.answers[id])?'answered':''} ${state.bookmarks.includes(id)?'flagged':''}" data-index="${i}" aria-label="${i+1}번 문제${s.graded[id]?(s.answers[id]===lookup(id).answer?' 정답':' 오답'):Number.isInteger(s.answers[id])?' 답변함':' 미응답'}" ${i===s.index?'aria-current="step"':''}>${String(i+1).padStart(2,'0')}</button>`).join('')}</div><div class="legend"><span><i></i>미응답</span><span><i class="filled"></i>답변</span><span><i class="flag"></i>다시 보기</span></div><hr class="rail-separator"><button class="secondary finish-btn" data-action="${s.done?'results':'finish'}">${s.done?'채점 결과 보기':'답안 제출하기'} →</button></section>
  <section class="panel rail-card tip-card"><div class="tip-heading">✧ TODAY’S STUDY TIP</div><h3>${s.mode==='exam'?'시간도 연습의 일부니까.':'틀려도 괜찮아요.'}</h3><p>${s.mode==='exam'?'막히는 문제는 표시하고 넘어가세요. 남은 시간에 다시 돌아올 수 있어요.':'헷갈리는 문제를 발견한 지금이 기회예요. 해설을 읽고, 내 말로 한 번 설명해 보세요.'}</p></section>
  <button class="panel lab-link" data-view="lab"><span class="lab-symbol">&gt;_</span><span><b>눈으로만 읽었다면?</b><small>직접 쿼리 실행해 보기</small></span><span>↗</span></button></aside></div>`;
}
function scoreSession(s) {
  const correct=s.ids.filter(id=>s.answers[id]===lookup(id).answer).length;
  const subjects=[1,2].map(subject=>{const ids=s.ids.filter(id=>lookup(id).subject===subject);return {total:ids.length,correct:ids.filter(id=>s.answers[id]===lookup(id).answer).length};});
  const percent=Math.round(correct/s.ids.length*100);
  return {correct,subjects,percent,passed:percent>=60&&subjects.every(s=>s.total&&s.correct/s.total>=.4)};
}
function renderResults() {
  const s=state.session,score=scoreSession(s),wrong=s.ids.filter(id=>s.answers[id]!==lookup(id).answer);
  return `<div class="view-intro"><div class="eyebrow">YOUR NEXT STEP</div><h1>오늘의 연습이 쌓였어요.</h1><p>맞힌 개념은 굳히고, 놓친 개념은 한 번 더.</p></div><div class="quiz-layout"><section class="panel result-summary"><span class="tag">${s.mode==='exam'?'실전 모의고사':s.mode==='review'?'오답 복습':'벼락치기'} 결과</span><div class="score-layout"><div class="score-ring" style="--score:${score.percent}"><div><b>${score.percent}<small>점</small></b><small>${score.correct} / ${s.ids.length} 정답</small></div></div><div class="score-copy"><h2>${s.mode==='exam'?(score.passed?'연습 합격 기준을 넘었어요!':'보완할 개념이 보여요.'):(score.percent>=80?'좋은 흐름이에요.':'이제, 빈틈을 채울 시간.')}</h2><p>${wrong.length?`${wrong.length}문제를 오답 노트에 담았어요.<br>틀린 이유를 짚으면 다음에는 달라져요.`:'이번 세트는 모두 맞혔어요.<br>SQL 실습으로 이해한 내용을 확인해 보세요.'}</p><div class="history-line">학습 시간 ${formatTime(((s.finished||Date.now())-s.started)/1000)}</div></div></div><div class="subject-scores">${score.subjects.map((r,i)=>`<div class="subject-score ${s.mode==='exam'&&r.correct/r.total<.4?'bad':''}">${i+1}과목 · ${i===0?'데이터 모델링':'SQL 기본 및 활용'}<b>${r.correct}<small> / ${r.total}문제</small></b>${s.mode==='exam'&&r.correct/r.total<.4?'<small>과락 기준 미달</small>':''}</div>`).join('')}</div><div class="button-row">${wrong.length?'<button class="primary" data-action="retry-session">틀린 문제 다시 풀기 ↺</button>':'<button class="primary" data-view="lab">SQL 실습으로 이동 →</button>'}<button class="secondary" data-action="new-quick">새 10문제 풀기</button></div><p class="disclaimer">${s.mode==='exam'?'연습 판정: 총점 60점 이상 + 각 과목 40% 이상. 실제 시험 합격을 예측하는 결과가 아닙니다.':'점수는 이번 세트의 정답률입니다. 실전 시험의 합격 판정과는 구별해 주세요.'}</p><div class="session-review"><h3>문제별 해설 다시 보기</h3>${s.ids.map((id,i)=>`<div class="review-row"><span class="review-index" style="color:${s.answers[id]===lookup(id).answer?'var(--green)':'var(--red)'}">${s.answers[id]===lookup(id).answer?'✓':'×'} ${String(i+1).padStart(2,'0')}</span><div class="review-content"><small>${esc(lookup(id).topic)}</small><h3>${esc(lookup(id).title)}</h3></div><button class="secondary" data-index="${i}">해설</button></div>`).join('')}</div></section><aside class="right-rail"><section class="panel rail-card tip-card"><div class="tip-heading">✧ NEXT STEP</div><h3>해설은, 이유까지.</h3><p>정답 번호보다 중요한 건 다른 선택지가 틀린 이유예요. 개념이 막히면 핵심 요약을 펼쳐 보세요.</p><button class="text-button" data-view="notes">핵심 요약 열기 →</button></section></aside></div>`;
}
function renderLab() {
  const lab=LABS.find(l=>l.id===state.labId);
  const draft=state.drafts[lab.id]??lab.starter;
  return `<div class="view-intro"><div class="eyebrow">LESS READING, MORE QUERYING</div><h1>쿼리는, 직접 쳐봐야 아니까.</h1><p>SQL을 실행하고 결과를 확인해 보세요. 조회 결과로 답안을 채점합니다.</p></div><div class="lab-toolbar"><label class="select-wrap">오늘의 실습<select id="lab-select">${LABS.map(l=>`<option value="${l.id}" ${l.id===lab.id?'selected':''}>${String(l.id).padStart(2,'0')}. ${esc(l.title)}${state.solved.includes(l.id)?' ✓':''}</option>`).join('')}</select></label><span class="mini-muted">직접 해결 ${state.solved.length} / ${LABS.length} · SQLite 실행 환경</span></div><div class="lab-layout"><aside class="panel schema-panel"><div class="schema-title">▦ DATABASE EXPLORER</div><div class="schema-table"><details open><summary>employees <span class="mini-muted">8행</span></summary>${[['emp_id','PK · INTEGER'],['name','TEXT'],['dept_id','INTEGER'],['salary','INTEGER'],['bonus','NULL 가능'],['manager_id','NULL 가능']].map(([col,type])=>`<div class="schema-col"><span>${col}</span><small>${type}</small></div>`).join('')}<button class="text-button" data-action="preview-employees">데이터 미리 보기 ↗</button></details></div><div class="schema-table"><details open><summary>departments <span class="mini-muted">4행</span></summary><div class="schema-col"><span>dept_id</span><small>PK · INTEGER</small></div><div class="schema-col"><span>dept_name</span><small>TEXT</small></div><button class="text-button" data-action="preview-departments">데이터 미리 보기 ↗</button></details></div><div class="engine-note">employees.dept_id → departments.dept_id<br><br>조회 전용 · 매 실행마다 원본 데이터로 시작합니다.<br>Oracle의 NVL·ROLLUP·CONNECT BY 등은 지원하지 않아요.<button class="text-button" data-action="dialects">DBMS 차이 보기 ↗</button></div></aside><div><section class="panel lab-task"><div class="spread"><span class="tag">MISSION ${String(lab.id).padStart(2,'0')} · ${esc(lab.tag)}</span>${state.solved.includes(lab.id)?'<span class="badge-success">✓ 해결 완료</span>':''}</div><h2>${esc(lab.title)}</h2><p>${esc(lab.description)}</p><div class="button-row" style="margin-top:10px"><button class="text-button" data-action="hint">${hintOpen?'힌트 접기':'힌트 살짝 보기'}</button><button class="ghost" data-action="solution">모범 답안</button></div>${hintOpen?`<div class="feedback"><p>${esc(lab.hint)}</p></div>`:''}</section><section class="panel editor-panel"><div class="editor-header"><span>query.sql</span><button class="text-button" data-action="reset-query">처음 코드로</button></div><div class="editor"><div class="line-numbers" id="line-numbers" aria-hidden="true">${draft.split('\n').map((_,i)=>i+1).join('\n')}</div><textarea id="sql-editor" aria-label="SQL 쿼리 편집기" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off">${esc(draft)}</textarea></div><div class="editor-footer"><span class="keyboard-hint"><span class="kbd">Ctrl</span> + <span class="kbd">Enter</span> 실행 · Tab 들여쓰기</span><div class="button-row"><button class="secondary" data-action="run" ${running?'disabled':''}>▷ 실행</button><button class="primary" data-action="check-sql" ${running?'disabled':''}>${running?'실행 중…':'답안 채점'} →</button></div></div></section><section class="panel result-panel" aria-label="SQL 실행 결과" aria-live="polite"><div class="result-header"><b>실행 결과</b><span class="mini-muted">${resultData?.result?`${resultData.result.values.length}행 · ${resultData.ms} ms`:'RESULT'}</span></div>${renderSQLResult()}</section><div class="subfooter"><span>별칭은 자유 · 열 순서와 값은 문제 조건에 맞게</span><button class="ghost" data-action="next-lab">다음 실습 →</button></div></div></div>`;
}
function resultTable(result) {return `<div class="table-wrap"><table><thead><tr>${result.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${result.values.map(row=>`<tr>${row.map(value=>`<td class="${value===null?'null':''}">${value===null?'NULL':esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${result.values.length===0?'<div class="result-empty">조회 결과가 0행입니다.</div>':''}`;}
function renderSQLResult() {
  if(running)return '<div class="result-empty">쿼리를 실행하고 있어요…</div>';
  if(!resultData)return '<div class="result-empty"><span class="empty-symbol">&gt;_</span>실행 버튼을 누르면 결과가 여기에 나타나요.</div>';
  if(resultData.error)return `<div class="result-message error"><strong>SQL을 다시 확인해 주세요.</strong><br>${esc(resultData.error)}</div>`;
  let message='';
  if(resultData.passed===true)message=`<div class="result-message">✓ ${resultData.assisted?'정답 결과예요. 모범 답안을 본 연습으로 기록했어요.':'정답이에요! 예제와 추가 데이터에서도 결과가 일치해요.'}</div>`;
  if(resultData.passed===false)message='<div class="result-message bad">아직 결과가 달라요. 열 순서·NULL 처리·정렬 조건을 확인해 보세요. 예제와 추가 데이터 모두 검사합니다.</div>';
  if(resultData.stale) message='<div class="result-message bad">코드가 변경되었어요. 다시 실행하거나 채점해 주세요.</div>';
  return message+resultTable(resultData.result);
}
function runSQL(check=false,sqlOverride=null,previewName=null) {
  if(running)return;
  const lab=LABS.find(l=>l.id===state.labId),sql=sqlOverride??state.drafts[lab.id]??lab.starter;
  if(!sql.trim()){toast('SQL을 입력해 주세요.');return;}
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
    if(previewName){if(data.error)toast(data.error);else openModal(`<h2>${esc(previewName)}</h2><p>연습에 사용하는 원본 데이터예요. NULL과 0을 구분해 보세요.</p>${resultTable(data.result)}<div class="button-row"><button class="primary" data-action="close">확인</button></div>`);}
    else resultData=data;
    if(view==='lab')render();
  };
  worker.onmessage=event=>done(event.data);
  worker.onerror=event=>{event.preventDefault();done({error:'SQL 엔진을 실행하지 못했어요. 최신 Chrome 또는 Edge에서 다시 시도해 주세요.'});};
  runTimer=setTimeout(()=>done({error:'실행 제한 시간(8초)을 넘었어요. 조인 조건이나 재귀 쿼리를 확인해 주세요.'}),8000);
  worker.postMessage({schema:COURSE.schema,variant:COURSE.variant,sql,solution:check?lab.solution:null,ordered:lab.ordered||false});
  if(view==='lab')render();
}
function cancelSQL(){if(sqlWorker)sqlWorker.terminate();sqlWorker=null;clearTimeout(runTimer);running=false;}
function renderNotes() {
  const matches=NOTES.filter(note=>note.join(' ').toLowerCase().includes(search.toLowerCase()));
  return `<div class="view-intro"><div class="eyebrow">THE LAST-MINUTE CHEAT SHEET</div><h1>시험장 가기 전, 이것만은.</h1><p>헷갈리기 쉬운 개념을 짧게 정리했어요. 쿼리를 직접 실행하면 더 오래 남습니다.</p></div><div class="lab-toolbar"><span class="mini-muted">핵심 개념 ${NOTES.length}개</span><input class="search-field" id="note-search" aria-label="핵심 요약 검색" type="search" value="${esc(search)}" placeholder="개념 찾기 · NULL, JOIN, 정규화…"></div><div class="note-grid">${matches.length?matches.map(([title,body,sql,tag])=>`<article class="panel note-card"><span class="tag">${tag}</span><h2>${title}</h2><p>${body}</p><pre>${esc(sql)}</pre></article>`).join(''):'<p class="search-empty">일치하는 개념이 없어요. 다른 검색어로 찾아보세요.</p>'}</div><div class="source-links">참고: <a href="https://www.dataq.or.kr/www/sub/a_04.do" target="_blank" rel="noopener">DataQ SQL 자격 안내</a> · <a href="https://www.sqlite.org/lang_select.html" target="_blank" rel="noopener">SQLite SELECT 문서</a> · <a href="https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/" target="_blank" rel="noopener">Oracle SQL 문서</a><br>직접 작성한 학습 요약과 연습문제입니다. 실제 시험 공지·범위는 DataQ에서 확인하세요.</div>`;
}
function renderReview() {
  const ids=reviewFilter==='wrong'?wrongIds():state.bookmarks.filter(id=>lookup(id));
  return `<div class="view-intro"><div class="eyebrow">MISTAKES ARE PART OF THE PROCESS</div><h1>틀렸던 문제가, 내 것이 되도록.</h1><p>마지막 풀이가 오답인 문제를 모았어요. 다시 맞히면 오답 노트에서 빠집니다.</p></div><div class="lab-toolbar"><div class="segmented"><button class="segment ${reviewFilter==='wrong'?'active':''}" data-filter="wrong">오답 노트 <small>${wrongIds().length}</small></button><button class="segment ${reviewFilter==='saved'?'active':''}" data-filter="saved">다시 볼 문제 <small>${state.bookmarks.length}</small></button></div>${ids.length?'<button class="primary" data-action="review-all">모아서 다시 풀기 ↺</button>':''}</div>${ids.length?`<div class="review-list">${ids.map(id=>{const q=lookup(id);return `<article class="panel review-row"><span class="review-index">${String(id).padStart(2,'0')}</span><div class="review-content"><small>${q.subject}과목 · ${esc(q.topic)}${state.latest[id]?.correct===true?' · 마지막 풀이 정답':''}</small><h3>${esc(q.title)}</h3></div><button class="secondary" data-review-id="${id}">다시 풀기</button>${reviewFilter==='saved'?`<button class="ghost" data-remove-bookmark="${id}" aria-label="${id}번 문제 저장 해제">×</button>`:''}</article>`;}).join('')}</div>`:`<section class="panel empty-state"><div class="empty-symbol">${reviewFilter==='wrong'?'✓':'◇'}</div><h2>${reviewFilter==='wrong'?'아직 남아 있는 오답이 없어요.':'다시 보고 싶은 문제를 담아보세요.'}</h2><p>${reviewFilter==='wrong'?'문제를 풀고 채점하면, 틀린 문제를 여기에 모아둘게요.':'문제 위의 ‘다시 볼 문제’를 누르면 이곳에 저장됩니다.'}</p><button class="primary" data-view="quiz">문제 풀러 가기 →</button></section>`}<p class="history-line">누적 채점 ${state.history.length}회 · 기록은 현재 브라우저에 저장돼요.</p>`;
}
function render() {
  const names={quiz:'문제 풀기',lab:'SQL 플레이그라운드',review:'오답 노트',notes:'핵심 요약'};
  document.querySelectorAll('[data-view]').forEach(button=>{if(button.classList.contains('nav-item')){button.classList.toggle('active',button.dataset.view===view);if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}});
  $('#breadcrumb').textContent=names[view];
  $('#main').innerHTML=({quiz:renderQuiz,lab:renderLab,review:renderReview,notes:renderNotes})[view]();
  updateSidebar();
}
function navigate(nextView){if(!['quiz','lab','review','notes'].includes(nextView))return;if(view==='lab'&&nextView!=='lab')cancelSQL();view=nextView;render();}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function openModal(html,after){$('#modal-content').innerHTML=html;if(!$('#modal').open)$('#modal').showModal();after?.();}
function closeModal() {if($('#modal').open)$('#modal').close();}
function about(){openModal(`<h2>나만의 SQLD 스터디룸</h2><p>공식 기출문제를 복제하지 않고 만든 연습용 화면입니다. 모델링 10문제, SQL 40문제와 쿼리 미션 12개를 담았습니다. 모의고사 형식은 50문제·90분, 연습 판정은 총점 60점 및 과목별 40% 기준입니다.</p><p>SQL 실습은 SQLite(sql.js 1.14.1)로 실제 실행됩니다. Oracle 전용 문법은 개념 문제에서 다룹니다. HTML 파일에 엔진이 포함되어 있어 파일을 내려받으면 인터넷 없이도 사용할 수 있습니다.</p><p>답안·오답·작성 중인 쿼리는 이 브라우저에만 저장됩니다. 다른 기기와 동기화되지 않으며, 브라우저 데이터 삭제 또는 파일 경로 변경 시 기록이 사라질 수 있습니다.</p><p><a href="https://www.dataq.or.kr/www/sub/a_04.do" target="_blank" rel="noopener">DataQ 시험 안내 ↗</a> · <a href="https://github.com/sql-js/sql.js" target="_blank" rel="noopener">sql.js / MIT 라이선스 ↗</a></p><div class="button-row"><a class="secondary" href="./index.html" download="sqld-sprint.html">HTML 내려받기 ↓</a><button class="primary" data-action="close">좋아요</button></div>`);}
document.addEventListener('click',event=>{
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
    case 'quick':if(s.mode!=='quick')requestStart('quick');else if(s.done)requestStart('quick');else toast('지금 10문제 벼락치기를 풀고 있어요.');break;
    case 'new-quick':requestStart('quick');break;
    case 'exam':if(s.mode==='exam'&&!s.done)toast('모의고사가 진행 중이에요.');else requestStart('exam');break;
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
    case 'help':openModal('<h2>손이 기억하는 단축키</h2><ul><li><span class="kbd">1</span> ~ <span class="kbd">4</span> 보기 선택</li><li><span class="kbd">Enter</span> 정답 확인 / 다음 문제</li><li><span class="kbd">←</span> <span class="kbd">→</span> 문제 이동</li><li><span class="kbd">Ctrl</span> + <span class="kbd">Enter</span> SQL 실행 (Mac: ⌘ + Enter)</li><li><span class="kbd">Tab</span> SQL 편집기에서 두 칸 들여쓰기</li><li><span class="kbd">Esc</span> 팝업 닫기</li></ul><div class="button-row"><button class="primary" data-action="close">확인</button></div>');break;
    case 'about':about();break;
    case 'run':runSQL(false);break;
    case 'check-sql':runSQL(true);break;
    case 'hint':hintOpen=!hintOpen;render();break;
    case 'reset-query':openModal('<h2>작성한 쿼리를 초기화할까요?</h2><p>이 실습의 작성 중인 코드가 처음 코드로 돌아갑니다.</p><div class="button-row"><button class="secondary" data-action="close">취소</button><button class="primary" data-action="reset-query-confirm">초기화</button></div>');break;
    case 'reset-query-confirm':cancelSQL();delete state.drafts[state.labId];resultData=null;save();closeModal();render();break;
    case 'solution':{const lab=LABS.find(l=>l.id===state.labId);openModal('<h2>모범 답안을 확인할까요?</h2><p>답안을 확인하면 이번 미션은 도움을 받은 연습으로 표시되며, 이후 정답을 제출해도 ‘직접 해결’ 수에는 추가되지 않습니다. 이미 직접 해결한 기록은 유지됩니다.</p><div class="button-row"><button class="secondary" data-action="close">더 생각해 보기</button><button class="primary" data-action="show-solution">답안 보기</button></div>');break;}
    case 'show-solution':{const lab=LABS.find(l=>l.id===state.labId);if(!state.assisted.includes(lab.id))state.assisted.push(lab.id);save();openModal(`<h2>${esc(lab.title)} · 모범 답안</h2>${codeBlock(lab.solution)}<p>${esc(lab.hint)}</p><div class="button-row"><button class="secondary" data-action="use-solution">편집기에 넣기</button><button class="primary" data-action="close">확인</button></div>`);break;}
    case 'use-solution':cancelSQL();state.drafts[state.labId]=LABS.find(l=>l.id===state.labId).solution;resultData=null;save();closeModal();render();break;
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
    if(resultData&&!resultData.stale){resultData.stale=true;const panel=$('.result-panel');panel.innerHTML='<div class="result-header"><b>실행 결과</b><span class="mini-muted">이전 코드의 결과</span></div>'+renderSQLResult();}
    save();
  }
  if(event.target.id==='note-search'){
    search=event.target.value;const position=event.target.selectionStart;render();$('#note-search').focus();try{$('#note-search').setSelectionRange(position,position);}catch{}
  }
});
document.addEventListener('change',event=>{if(event.target.id==='lab-select'){cancelSQL();state.labId=Number(event.target.value);resultData=null;hintOpen=false;save();render();}});
document.addEventListener('keydown',event=>{
  if($('#modal').open)return;
  if(event.target.id==='sql-editor'){
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();runSQL(false);}
    if(event.key==='Tab'){event.preventDefault();const editor=event.target;editor.setRangeText('  ',editor.selectionStart,editor.selectionEnd,'end');editor.dispatchEvent(new Event('input',{bubbles:true}));}
    return;
  }
  if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.ctrlKey||event.metaKey||event.altKey||view!=='quiz'||resultView)return;
  if(/^[1-4]$/.test(event.key)){event.preventDefault();selectAnswer(Number(event.key)-1);}
  if(event.key==='ArrowLeft'){event.preventDefault();moveQuestion(state.session.index-1);}
  if(event.key==='ArrowRight'){event.preventDefault();moveQuestion(state.session.index+1);}
  if(event.key==='Enter'){
    // Let non-answer controls retain their normal keyboard activation.
    if(event.target.closest('button')&&!event.target.closest('[data-choice]'))return;
    event.preventDefault();const s=state.session,id=s.ids[s.index];if(s.mode==='exam'||s.graded[id]){if(s.index===s.ids.length-1)finish();else moveQuestion(s.index+1);}else gradeCurrent();
  }
});
document.addEventListener('scroll',event=>{if(event.target.id==='sql-editor')$('#line-numbers').scrollTop=event.target.scrollTop;},true);
if(!state.session)startSession('quick');else render();
tick();setInterval(tick,1000);
