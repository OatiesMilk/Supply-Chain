const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const {
 Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
 AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
 VerticalAlign, ExternalHyperlink, InternalHyperlink, Bookmark, PageNumber, TableLayoutType,
} = require('docx');
// Requires the workspace docx package and Python markdown-it-py. No network or application execution.
const parserCode = "from markdown_it import MarkdownIt\nfrom pathlib import Path\nimport hashlib,json,re,sys\np=Path(sys.argv[1]);source=p.read_text()\nversion=re.search(r'^\\*\\*Document Version:\\*\\* (.+)$',source,re.M).group(1)\ndate=re.search(r'^\\*\\*Last Updated:\\*\\* (.+)$',source,re.M).group(1).split(' (')[0]\nbaseline_line=re.search(r'^\\*\\*(?:Correction )?Baseline:\\*\\* (.+)$',source,re.M).group(1)\nbaseline=re.findall(r'`([a-f0-9]{7,40})`',baseline_line)[-1]\nskip=('**Document Version:**','**Last Updated:**','**Audience:**','**Baseline:**','**Original Baseline:**','**Correction Baseline:**','**Basis:**','**Word edition:**','**Related E2E suites:**','Download the [staff Word manual]','See the [branch readiness follow-up]','These instructions describe repository behavior')\nlines=[]\nfor line in source.splitlines():\n if line.startswith(skip):continue\n if line.startswith('To enforce strict audit trails'):\n  line='The portal separates responsibilities between operational roles. The table summarizes available actions; current account permissions and record state still apply.'\n line=re.sub(r'\\s*\\(\\[`[^`]+`\\]\\(\\.\\./(?:client|server|e2e)/[^)]+\\)\\)','',line)\n lines.append(line)\nparser=MarkdownIt('commonmark').enable('table')\nprint(json.dumps({'source':'docs/USER_MANUALS.md','source_sha256':hashlib.sha256(source.encode()).hexdigest(),'version':version,'date':date,'baseline':baseline,'tokens':[t.as_dict() for t in parser.parse('\\n'.join(lines))]},ensure_ascii=False))\n";
const data = JSON.parse(execFileSync('python3', ['-c', parserCode, path.join(root, 'docs/USER_MANUALS.md')], {encoding:'utf8'}));
const tokens = data.tokens;
const anchors = new Map();
function slug(text) { return text.toLowerCase().replace(/[`*]/g,'').replace(/[^\p{L}\p{N}_\- ]/gu,'').replace(/ /g,'-'); }
for (let i=0; i<tokens.length; i++) if(tokens[i].type==='heading_open') {
 const title=tokens[i+1].content;
 anchors.set(slug(title),`section_${anchors.size+1}`);
}
const body=[], numbering=[], lists=[];
const NAVY='000000', BLUE='000000', GREY='000000', BORDER='BFBFBF';
let section='', subsection='', quotes=0, listId=0, workflow=0;
const workflows=[
 ['Record preparation', 'Sales Coordinator opens a new record and checks the required information.', 'Incomplete information: save a Draft, add the missing details, then submit.', 'Ready to submit: save the Scheduled record and hand off to Logistics for assignment.'],
 ['Dispatch coordination', 'Logistics reviews Scheduled records and coverage suggestions.', 'Choose the driver, vehicle and assistants; save with the required reason.', 'Review the calendar and generate route slips. Logistics handles Pending and Rescheduled exceptions.'],
 ['Driver execution', 'Open the assigned active job and tap Start transport to confirm (add an optional note if needed).', 'Select valid photo proof and enter the receiver name.', 'Tap Complete delivery and confirm the required remarks.', 'Ordinary run: the server stamps Time Out and accomplishes the run.', 'RMA run: transport completes; TASS physical receipt and final completion remain separate.'],
 ['RMA handoff', 'TASS creates the RMA and chooses the movement method.', 'Logistics transport: the assigned Driver completes transport. Supplier/internal movements do not need an internal Driver.', 'TASS records the physical recipient and confirms physical receipt after inspection.', 'TASS enters completion remarks and completes the RMA when its prerequisites are satisfied.'],
];
const numLevels=(format)=>Array.from({length:9},(_,level)=>({level,format,text:format===LevelFormat.BULLET?'•':`%${level+1}.`,alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:360+level*250,hanging:210}}}}));
numbering.push({reference:'bullets',levels:numLevels(LevelFormat.BULLET)});
function attrs(token) { return Object.fromEntries(token.attrs||[]); }
function inlines(children, opts={}) {
 let bold=!!opts.bold,italics=false,link=null,linkNodes=[];
 const out=[];
 function run(text, more={}) {return new TextRun({text,bold,italics,size:opts.size||22,color:opts.color||'000000',...more});}
 function push(node) { if(link) linkNodes.push(node);else out.push(node); }
 for(const t of children||[]) {
  if(t.type==='strong_open') bold=true;
  else if(t.type==='strong_close') bold=!!opts.bold;
  else if(t.type==='em_open') italics=true;
  else if(t.type==='em_close') italics=false;
  else if(t.type==='link_open') {link=attrs(t).href;linkNodes=[];}
  else if(t.type==='link_close') {
   const dest=link;link=null;
   if(dest?.startsWith('#') && anchors.has(dest.slice(1))) out.push(new InternalHyperlink({anchor:anchors.get(dest.slice(1)),children:linkNodes}));
   else if(/^https?:/.test(dest||'')) out.push(new ExternalHyperlink({link:dest,children:linkNodes}));
   else if(/^\.\.\/(client|server)\//.test(dest||'')) {
    out.push(new ExternalHyperlink({link:`https://github.com/OatiesMilk/Supply-Chain/blob/${data.baseline}/${dest.slice(3)}`,children:linkNodes}));
   } else out.push(...linkNodes);
   linkNodes=[];
  }
  else if(t.type==='code_inline') push(run(t.content,{font:'Consolas',size:(opts.size||22)-1}));
  else if(t.type==='softbreak'||t.type==='hardbreak') push(run(' '));
  else if(t.type==='text') {if(t.content!=='[!IMPORTANT]')push(run(t.content));}
  else if(t.type==='html_inline') push(run(t.content.replace(/<[^>]*>/g,'')));
 }
 return out;
}
function para(children, options={}) { return new Paragraph({spacing:{after:100,line:260},widowControl:true,children,...options}); }
function marker() {
 const list=lists.at(-1);
 if(!list?.pending) return {};
 list.pending=false;
 return {numbering:{reference:list.reference,level:Math.min(lists.length-1,8)}};
}
function heading(title, sourceLevel) {
 if(sourceLevel===1) return;
 const isContents=title==='Table of Contents';
 const main=sourceLevel===2 && /^\d+\./.test(title);
 if(main) {section=title;subsection='';}
 if(sourceLevel===3)subsection=title;
 const mapped=sourceLevel===2?HeadingLevel.HEADING_1:HeadingLevel.HEADING_2;
 body.push(new Paragraph({heading:mapped,pageBreakBefore:main||isContents||title.startsWith('1.3 '),keepNext:true,spacing:{before:180,after:140},children:[new Bookmark({id:anchors.get(slug(title)),children:[new TextRun({text:isContents?'Contents':title,bold:true,color:NAVY})]})]}));
}
function tableRows(start) {
 const rows=[];let row=null,cell=null,i=start;
 for(;i<tokens.length;i++) {
  const t=tokens[i];
  if(t.type==='tr_open') row=[];
  else if(t.type==='th_open'||t.type==='td_open') cell={header:t.type==='th_open',children:[]};
  else if(t.type==='inline'&&cell) cell.children.push(...t.children);
  else if(t.type==='th_close'||t.type==='td_close') {row.push(cell);cell=null;}
  else if(t.type==='tr_close') {rows.push(row);row=null;}
  else if(t.type==='table_close') break;
 }
 const count=rows[0].length;
 const widths=count===6?[1320,1750,1750,1700,1850,1854]:count===3?[2700,3000,4524]:Array(count).fill(Math.floor(10224/count));
 const size=count===6?18:20;
 const tableRows = rows.map((cells, ri) => {
  const children = cells.map((cell, ci) => new TableCell({
   width: {size:widths[ci], type:WidthType.DXA},
   verticalAlign:VerticalAlign.CENTER,
   shading:{fill:ri===0?'E7E7E7':ri%2?'F5F5F5':'FFFFFF', type:ShadingType.CLEAR},
   borders:Object.fromEntries(['top','bottom','left','right'].map(side=>[side,{style:BorderStyle.SINGLE,size:4,color:BORDER}])),
   children:[para(inlines(cell.children,{bold:ri===0,size,color:'000000'}),{spacing:{after:20,line:220}})]
  }));
  return new TableRow({tableHeader:ri===0,cantSplit:true,children});
 });
 body.push(new Table({width:{size:10224,type:WidthType.DXA},layout:TableLayoutType.FIXED,
  columnWidths:widths,margins:{top:95,bottom:95,left:100,right:100},rows:tableRows}));
 body.push(para([new TextRun('')],{spacing:{after:45}}));
 return i;
}
body.push(new Paragraph({heading:HeadingLevel.TITLE,spacing:{before:650,after:200},children:[new TextRun('Staff Operating Manual')]}));
body.push(para([new TextRun({text:'MICROGENESIS BUSINESS SYSTEMS',bold:true,size:30,color:NAVY})],{spacing:{after:40}}));
body.push(para([new TextRun({text:'Supply Chain Portal',size:27,color:GREY})],{spacing:{after:360}}));
body.push(para([new TextRun({text:'For Sales Coordinators, TASS, Logistics, Drivers and Administrators',size:24,bold:true,color:'000000'})],{spacing:{after:240}}));
body.push(para([new TextRun({text:`Version ${data.version} | ${data.date}`,size:22,color:'000000'})],{spacing:{after:220}}));
body.push(para([new TextRun({text:'Internal staff reference. Use section 8 for known limitations and verification status.',size:22,color:'000000'})]));
for(let i=0;i<tokens.length;i++) {
 const t=tokens[i];
 if(t.type==='heading_open') {heading(tokens[i+1].content,Number(t.tag.slice(1)));i+=2;}
 else if(t.type==='bullet_list_open'||t.type==='ordered_list_open') {
  const ref=t.type==='bullet_list_open'?'bullets':`ordered_${++listId}`;
  if(t.type==='ordered_list_open') numbering.push({reference:ref,levels:numLevels(LevelFormat.DECIMAL)});
  lists.push({reference:ref,pending:false});
 }
 else if(t.type==='bullet_list_close'||t.type==='ordered_list_close') lists.pop();
 else if(t.type==='list_item_open') lists.at(-1).pending=true;
 else if(t.type==='list_item_close'&&lists.length) lists.at(-1).pending=false;
 else if(t.type==='blockquote_open')quotes++;
 else if(t.type==='blockquote_close')quotes--;
 else if(t.type==='paragraph_open') {
  const inline=tokens[i+1];
  if(inline.type!=='inline')continue;
  if(inline.content.startsWith('Download the [')) {i+=2;continue;}
  const parts=[];let current=[];
  const metadata=inline.content.startsWith('**Document Version:**');
  for(const child of inline.children||[]) {
   if(metadata&&child.type==='softbreak'){parts.push(current);current=[];}else current.push(child);
  }
  parts.push(current);
  const keepGroup=(subsection.startsWith('2.3 ')&&!inline.content.startsWith('A slide-over panel'))||(subsection.startsWith('6.5 ')&&!inline.content.startsWith('Inspect **Timestamp**'));
  for(const part of parts) body.push(para(inlines(part),{...marker(),...(keepGroup?{keepNext:true}:{}),...(quotes?{shading:{fill:'F0F0F0',type:ShadingType.CLEAR},indent:{left:140,right:140}}:{})}));
  i+=2;
 }
 else if(t.type==='table_open')i=tableRows(i);
 else if(t.type==='fence') {
  if(t.info==='mermaid') {
   const [title,...steps]=workflows[workflow++];
   body.push(para([new TextRun({text:`Workflow overview — ${title}`,bold:true,color:NAVY})],{keepNext:true,spacing:{before:130,after:80}}));
   for(const step of steps) body.push(para([new TextRun({text:step,size:20,color:NAVY})],{numbering:{reference:'bullets',level:0},shading:{fill:'F5F5F5',type:ShadingType.CLEAR},spacing:{after:55,line:245}}));
  } else for(const line of t.content.split('\n').filter(Boolean))body.push(para([new TextRun({text:line,font:'Consolas',size:18})]));
 }
}
const doc=new Document({creator:'Microgenesis Business Systems',title:'Microgenesis Business Systems — Staff Operating Manual',subject:'Role workflows and known limitations',description:`Source ${data.source}; source SHA-256 ${data.source_sha256}; baseline ${data.baseline}; version ${data.version}.`,revision:'5',styles:{characterStyles:[{id:'Hyperlink',name:'Hyperlink',basedOn:'DefaultParagraphFont',run:{color:'000000',underline:{type:'single'}}}],default:{document:{run:{font:'Arial',size:22,color:'000000'},paragraph:{spacing:{after:100,line:260}}}},paragraphStyles:[
 {id:'Title',name:'Title',basedOn:'Normal',run:{font:'Arial',size:52,bold:true,color:NAVY},paragraph:{spacing:{after:220}}},
 {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Arial',size:31,bold:true,color:NAVY},paragraph:{outlineLevel:0,keepNext:true}},
 {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:'Arial',size:25,bold:true,color:NAVY},paragraph:{outlineLevel:1,keepNext:true}},
]},numbering:{config:numbering},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1008,bottom:1008,left:1008,right:1008,header:480,footer:480}}},headers:{default:new Header({children:[para([new TextRun({text:'MICROGENESIS BUSINESS SYSTEMS  |  SUPPLY CHAIN',size:16,color:GREY})],{spacing:{after:40}})]})},footers:{default:new Footer({children:[para([new TextRun({text:`Staff Manual v${data.version} | ${data.date}`,size:16,color:GREY}),new TextRun({text:'    |    Page ',size:16,color:GREY}),new TextRun({children:[PageNumber.CURRENT],size:16}),new TextRun({text:' of ',size:16}),new TextRun({children:[PageNumber.TOTAL_PAGES],size:16})],{alignment:AlignmentType.RIGHT,spacing:{after:0}})]})},children:body}]});
Packer.toBuffer(doc).then(buffer=>{
 fs.writeFileSync(path.join(root, 'docs/USER_MANUALS.docx'),buffer);
 console.log(`Created docs/USER_MANUALS.docx (${buffer.length} bytes); ${workflow} workflow summaries; source SHA-256 ${data.source_sha256}.`);
}).catch(error=>{console.error(error);process.exitCode=1;});
