
const fs=require('fs'),path=require('path'); const {MedTerm}=require('../web/js/core.js');
const mt=new MedTerm(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/medterm.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(__dirname,'../data/class_lexicon.json'),'utf8')));
const inName=process.argv[2]||'benchmark_cases.json', outName=process.argv[3]||'benchmark_results.json';
const cases=JSON.parse(fs.readFileSync(path.join(__dirname,inName),'utf8'));
const t0=Date.now(); const out=cases.map(c=>{const r=mt.verify(c.text);const flagged=r.findings.filter(f=>f.severity==='warn'||f.severity==='error');
 const types=[...new Set(flagged.map(f=>f.type))];
 const hit=c.expect.length? flagged.some(f=>c.expect.includes(f.type)) : flagged.length===0;
 return {id:c.id,category:c.category,label:c.label,text:c.text,expect:c.expect,flagged_types:types,pass:hit};});
fs.writeFileSync(path.join(__dirname,outName),JSON.stringify({ms:Date.now()-t0,n:out.length,results:out},null,1));
console.log('done',out.length,'cases in',Date.now()-t0,'ms');
