
const fs = require('fs'); const path = require('path');
const { MedTerm } = require('../web/js/core.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/medterm.json'),'utf8'));
const cls = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/class_lexicon.json'),'utf8'));
const mt = new MedTerm(data, cls);
console.log('VTM', mt.vtms.length, 'surfaces', mt.surfaces.length);
const cases = [
 "오메프라졸은 양성자펌프억제제이며 ATC 코드는 A02BC01입니다. 오메프라졸 20mg 캡슐이 있습니다.",
 "오메프라졸린을 하루 한 번 복용합니다.",
 "메트포르민은 항고혈압제로 ATC 코드 C09CA01에 해당합니다.",
 "아토르바스타틴 37mg 정제는 스타틴 계열입니다. 베르나스타틴도 비슷합니다.",
 "Omeprazol and clopidogrel (RxCUI 7646) are discussed.",
];
for (const t of cases) { const r = mt.verify(t); console.log('\n>', t); console.log(JSON.stringify(r.summary)); r.findings.forEach(f => console.log(' ', f.severity.padEnd(5), f.type.padEnd(18), JSON.stringify(f.text), '|', f.message.slice(0,90))); }
