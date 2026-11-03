
const fs=require('fs'),path=require('path'); const {MedTerm}=require('../web/js/core.js');
const mt=new MedTerm(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/medterm.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(__dirname,'../data/class_lexicon.json'),'utf8')));
const S=[
'오메프라졸(Omeprazole)은 양성자펌프억제제이며 ATC 코드는 A02BC01입니다. 단위용량으로 20mg 캡슐이 있습니다. 복용 방법은 의사·약사와 상담하세요.',
'메트포르민은 항고혈압제로 분류되며 ATC 코드 C09CA01에 해당합니다. 오메프라졸린 20mg을 하루 한 번 복용하고, 베르나스타틴과 병용할 수 있습니다.',
'아토르바스타틴 37mg 정제와 로수바스타틴 10mg 정제가 있습니다. 아토르바스타틴은 스타틴 계열입니다.',
'클로피도그렐(RxCUI 7646)은 항혈소판제입니다. ATC 코드는 B01AC04입니다.',
'Omeprazol and esomeprazole are PPIs (ATC A02BC05). 타이레놀은 아세트아미노펜 성분의 해열진통제이며 500mg 정제가 있습니다. 하루 최대 4,000mg을 넘기지 마세요.',
'오메프라졸은 ATC 코드 A02BC05에 해당하는 양성자펌프억제제이며, 10mg·20mg·40mg·200mg 캡슐이 있습니다. 에스오메프라졸린은 그 이성질체입니다.'];
S.forEach((t,i)=>{const r=mt.verify(t);console.log('#'+(i+1),JSON.stringify(r.summary));r.findings.filter(f=>f.severity!=='ok').forEach(f=>console.log('   ',f.severity,f.type,JSON.stringify(f.text)));});
