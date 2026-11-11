import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [template, css, course, app, engine, worker, license] = await Promise.all(['src/index.html','src/style.css','src/course.js','src/app.js','vendor/sql-asm.js','src/worker.js','vendor/LICENSE.sql.js'].map(read));
const safeScript = s => s.replace(/<\/script/gi, '<\\/script');
// Functions prevent SQL regex text such as $' from being interpreted as a replacement token.
const html = template.replace('/* STYLES */', () => css).replace('/* COURSE */', () => safeScript(course)).replace('/* APP */', () => safeScript(app)).replace('/* ENGINE */', () => safeScript(engine + '\n' + worker)).replace('<!-- LICENSE -->', () => '<!-- sql.js MIT license\n' + license.replace(/-->/g,'-- >') + '\n-->');
await mkdir(new URL('dist/',import.meta.url),{recursive:true});
await writeFile(new URL('dist/index.html',import.meta.url),html);
await writeFile(new URL('index.html',import.meta.url),html);
await copyFile(new URL('vendor/LICENSE.sql.js',import.meta.url), new URL('dist/LICENSE.sql.js',import.meta.url));
await copyFile(new URL('vendor/LICENSE.sql.js',import.meta.url), new URL('LICENSE.sql.js',import.meta.url));
console.log(`Built standalone HTML: ${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB`);
