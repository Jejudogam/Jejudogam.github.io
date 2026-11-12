import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [template, css, course, app, engine, worker, license, uiSource, explanationsSource] = await Promise.all(['src/index.html','src/style.css','src/course.js','src/app.js','vendor/sql-asm.js','src/worker.js','vendor/LICENSE.sql.js','src/ui.json','src/explanations.json'].map(read));
const ui=JSON.parse(uiSource);
const explanations=JSON.parse(explanationsSource);
const escapeHtml=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shell=template.replace(/\{\{(\w+)\}\}/g,(_,key)=>{if(typeof ui[key]!=='string')throw new Error(`Missing UI copy: ${key}`);return escapeHtml(ui[key]);});
const safeScript = s => s.replace(/<\/script/gi, '<\\/script');
// Functions prevent SQL regex text such as $' from being interpreted as a replacement token.
const html = shell.replace('/* STYLES */', () => css).replace('/* COURSE */', () => safeScript(course)).replace('/* APP */', () => safeScript(`'use strict';\nconst COPY=${JSON.stringify(ui)};\nconst EXPLANATIONS=${JSON.stringify(explanations)};\n${app}`)).replace('/* ENGINE */', () => safeScript(engine + '\n' + worker)).replace('<!-- LICENSE -->', () => '<!-- sql.js MIT license\n' + license.replace(/-->/g,'-- >') + '\n-->');
await mkdir(new URL('dist/',import.meta.url),{recursive:true});
await writeFile(new URL('dist/index.html',import.meta.url),html);
await writeFile(new URL('index.html',import.meta.url),html);
await copyFile(new URL('vendor/LICENSE.sql.js',import.meta.url), new URL('dist/LICENSE.sql.js',import.meta.url));
await copyFile(new URL('vendor/LICENSE.sql.js',import.meta.url), new URL('LICENSE.sql.js',import.meta.url));
console.log(`Built standalone HTML: ${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB`);
