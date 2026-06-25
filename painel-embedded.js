/* =========================================================================
   Painel Executivo — versão embedded (roda dentro do index.html)
   Sem iframe: chama window.rxBuild(), window.caixaHoje(), etc. diretamente.
   Expõe: window.painelRenderAll()
   ========================================================================= */
(function(){
'use strict';

/* paleta Mentat Professional */
const C={
  txt:'#64748b', line:'#1e2840',
  // semânticas
  green:'#10b981', red:'#f43f5e', amber:'#f59e0b', proj:'#60a5fa', brand:'#dcab5b',
  // categóricas (c1–c8 em ordem de uso)
  c1:'#4b7cf3', c2:'#f97316', c3:'#a78bfa', c4:'#22d3ee',
  c5:'#fbbf24', c6:'#fb7185', c7:'#34d399', c8:'#c084fc',
  // aliases para charts específicos (ver spec)
  chEbitda:'#4b7cf3',  // c1 — EBITDA barras
  chCaixa: '#22d3ee',  // c4 — geração de caixa barras
  chSaldo: '#4b7cf3',  // c1 — saldo rolling
  chFat:   '#4b7cf3',  // c1 — faturamento (azul = compromisso)
  chReceb: '#10b981',  // pos — recebido (verde = dinheiro real)
  chLine:  '#fbbf24',  // c5 — linhas de % (âmbar sobre barras)
};

/* helpers de formato */
const f0  = n => 'R$ '+Math.round(n||0).toLocaleString('pt-BR');
const fK  = n => { const v=Math.round((n||0)/1000); return 'R$ '+v.toLocaleString('pt-BR')+'k'; };
const p1  = n => n==null?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const MN  = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mLb = m => { const p=String(m).split('-'); return MN[(+p[1])-1]+'/'+String(p[0]).slice(2); };
const esc = s => String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

/* semáforos */
const rInad = p => p==null?'':(p<=8?'good':(p<=15?'warn':'bad'));
const rPos  = v => v==null?'':(v>0?'good':(v===0?'warn':'bad'));

/* chama função do app diretamente no window */
function wCall(fn){
  try{ if(typeof window[fn]==='function') return window[fn].apply(window,[].slice.call(arguments,1)); }
  catch(e){ console.warn('painelEmb:'+fn, e); }
  return null;
}

/* KPI card HTML */
function kpi(label,value,opts){ opts=opts||{};
  return `<div class="kpi ${opts.c||''}"><div class="label">${label}</div>`+
    `<div class="value">${value}</div>`+
    (opts.sub?`<div class="sub">${opts.sub}</div>`:'')+`</div>`;
}

/* gauge / régua */
function gauge(el,value,opts){
  const max=opts.max, bands=opts.bands;
  let segs='',prev=0,ticks='<span>0'+(opts.unit||'')+'</span>';
  bands.forEach(b=>{
    const to=Math.min(b.to,max);
    segs+=`<div class="gseg" style="left:${prev/max*100}%;width:${Math.max(0,(to-prev)/max*100)}%;background:${b.color}"></div>`;
    if(b.to<max) ticks+=`<span>${b.to}${opts.unit||''}</span>`;
    prev=to;
  });
  ticks+=`<span>${max}${opts.unit||''}+</span>`;
  const band=value==null?null:(bands.find(b=>value<=b.to)||bands[bands.length-1]);
  const pos=value==null?0:Math.max(0,Math.min(max,value))/max*100;
  const leg=bands.map(b=>`<span><i style="background:${b.color}"></i>${b.label}</span>`).join('');
  el.innerHTML=`<div class="gauge">
    <div class="gauge-head">
      <span class="gauge-val" style="color:${band?band.color:'#71717a'}">${value==null?'—':p1(value)}</span>
      ${band?`<span class="gauge-tag" style="background:${band.color}22;color:${band.color}">${band.label}</span>`:''}
    </div>
    <div class="gauge-track">${segs}${value==null?'':`<div class="gauge-needle" style="left:${pos}%"></div>`}</div>
    <div class="gauge-scale">${ticks}</div>
    <div class="gauge-legend">${leg}</div>
  </div>`;
}

/* barras comparação */
function bars(el,rows,max,fmt){
  el.innerHTML=rows.map(r=>{
    const w=max>0?Math.max(0,Math.min(100,r.v/max*100)):0;
    return `<div class="barcmp-row"><span class="lbl">${esc(r.lbl)}</span>`+
      `<div class="barcmp-bar"><i style="width:${w}%;background:${r.color}"></i></div>`+
      `<span class="vv">${fmt(r.v)}</span></div>`;
  }).join('');
}

/* charts — pool próprio p/ não colidir com charts do app */
const CH={};
function mkC(id,cfg){
  if(CH[id]) CH[id].destroy();
  const c=document.getElementById(id); if(!c) return;
  CH[id]=new Chart(c,cfg);
}
const aY = ex=>Object.assign({ticks:{color:C.txt,callback:v=>fK(v)},grid:{color:C.line}},ex||{});
const LEG={labels:{color:C.txt,font:{size:11}}};

/* ── renderResumo ── */
function renderResumo(rx,cx){
  const T=rx&&rx.T;
  const saldoHoje=cx?cx.saldoHoje:null;
  const sub=cx?('âncora '+f0(cx.saldoIni)+' + fluxo '+mLb(cx.primeiroMes)+'→'+mLb(cx.ultimoMes)):'saldo informado';
  const el=document.getElementById('kResumo'); if(!el) return;
  const paidCac=T&&T.cac>0?f0(T.cac):'—';
  const novos=T&&T.novos>0?T.novos:null;
  const inadV=T?T.inadPct:null;
  const inadRag=inadV==null?'rag-green':(inadV<=8?'rag-green':inadV<=15?'rag-amber':'rag-red');
  const inadLabel='<span class="rag '+inadRag+'"></span>Inadimplência';
  el.innerHTML=[
    kpi('Saldo em caixa hoje',saldoHoje==null?'—':f0(saldoHoje),{c:'info',sub}),
    kpi('Faturamento (período)',T?f0(T.faturamento):'—',{c:'info'}),
    kpi(inadLabel,inadV!=null?p1(inadV):'—',{c:rInad(inadV),sub:'meta ≤ 8%'}),
    kpi('Paid CAC',paidCac,{c:'info',sub:novos!=null?(novos+' novos · só marketing'):'marketing ÷ novos'}),
    kpi('Geração de caixa',T?f0(T.geracao):'—',{c:rPos(T?T.geracao:null),sub:'recebido − saídas'}),
  ].join('');
  const per=document.getElementById('pxPeriodo');
  if(per&&rx&&rx.months&&rx.months.length) per.textContent=mLb(rx.months[0])+' → '+mLb(rx.months[rx.months.length-1]);
}


/* ── renderCaixa (rolling 13 semanas — travado, ignora filtro de data) ── */
function renderCaixa(roll,cx){
  const box=document.getElementById('kCaixa'); if(!box) return;
  if(!roll){
    box.innerHTML='<div class="px-empty">Importe o <b>contas a receber</b> e o <b>extrato</b> no app.</div>';
    mkC('chCaixa',{type:'bar',data:{labels:[],datasets:[]}}); return;
  }
  box.innerHTML=[
    kpi('Saldo atual',f0(roll.saldo0),{c:'info',sub:cx?'realizado DFC':'manual'}),
    kpi('Fim da janela (13s)',f0(roll.saldoFim),{c:rPos(roll.saldoFim)}),
    kpi('Pior saldo',f0(roll.saldoMin),{c:rPos(roll.saldoMin),sub:roll.weekMin?'sem. '+roll.weekMin.label:''}),
  ].join('');
  const labels=roll.weeks.map(w=>w.label);
  mkC('chCaixa',{
    data:{labels,datasets:[
      {type:'bar',label:'Entradas líq.',data:roll.weeks.map(w=>roll.entLiq[w.key]),backgroundColor:'rgba(16,185,129,.55)'},
      {type:'bar',label:'Saídas',data:roll.weeks.map(w=>-roll.totSai[w.key]),backgroundColor:'rgba(244,63,94,.6)'},
      {type:'line',label:'Saldo projetado',data:roll.weeks.map(w=>roll.sFim[w.key]),borderColor:C.c1,borderWidth:2.5,tension:.25,pointRadius:2,fill:false},
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},
      scales:{x:{ticks:{color:C.txt},grid:{color:C.line}},y:aY()}}
  });
}

/* ── renderReceita ── */
function renderReceita(rx){
  const box=document.getElementById('kReceita'); if(!box) return;
  if(!rx){
    box.innerHTML='<div class="px-empty">Sem base de receita. Importe o extrato no app.</div>';
    mkC('chReceita',{data:{labels:[],datasets:[]}}); return;
  }
  const T=rx.T;
  box.innerHTML=[
    kpi('Faturamento',f0(T.faturamento),{c:'info'}),
    kpi('Cash collection',p1(T.cashCollPct),{c:'info',sub:'entrada+à vista ÷ faturamento'}),
    kpi('MRR realizado',f0(T.mrrReal),{c:'info',sub:(T.ativos>0?T.ativos+' clientes recorrentes':'recorrentes')}),
  ].join('');
  const labels=rx.months.map(mLb);
  mkC('chReceita',{
    data:{labels,datasets:[
      {type:'bar',label:'Faturamento',data:rx.months.map(m=>rx.M[m].faturamento),backgroundColor:'rgba(75,124,243,.7)'},
      {type:'bar',label:'Recebido em caixa',data:rx.months.map(m=>rx.M[m].recebidoCaixa),backgroundColor:'rgba(16,185,129,.65)'},
      {type:'line',label:'Conversão %',yAxisID:'y2',data:rx.months.map(m=>rx.M[m].faturamento>0?rx.M[m].recebidoCaixa/rx.M[m].faturamento*100:0),borderColor:C.chLine,borderWidth:2,tension:.25,pointRadius:2},
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{
      x:{ticks:{color:C.txt},grid:{color:C.line}},y:aY(),
      y2:{position:'right',ticks:{color:C.chLine,callback:v=>v+'%'},grid:{drawOnChartArea:false},min:0,max:100}
    }}
  });
}

/* ── renderInad ── */
function renderInad(rx){
  const T=rx&&rx.T, v=T?T.inadPct:null;
  const gi=document.getElementById('gaugeInad'); if(gi) gauge(gi,v,{
    max:28,unit:'%',
    bands:[{to:8,color:C.green,label:'Bom (≤ 8%)'},{to:15,color:C.amber,label:'Atenção (8–15%)'},{to:28,color:C.red,label:'Crítico (> 15%)'}]
  });
  const bench=[
    {lbl:'Evolving (atual)',color:v==null?C.c1:(v<=8?C.green:(v<=15?C.amber:C.red)),v:v==null?0:v},
    {lbl:'B2B Serviços (ACPCOB 2024)',color:C.c4,v:7.19},
    {lbl:'Ens. superior privado (Semesp 2024)',color:C.c4,v:9.33},
    {lbl:'Faixa-alvo Evolving (teto)',color:C.c4,v:15},
    {lbl:'Educação básica (Linx 2024)',color:C.c4,v:20.36},
    {lbl:'Cursos livres/profiss. (Linx 2024)',color:C.c4,v:25.89},
  ];
  const bb=document.getElementById('benchBars'); if(bb) bars(bb,bench,28,x=>p1(x));
  const box=document.getElementById('kInad'); if(!box) return;
  if(!T){ box.innerHTML=''; return; }
  box.innerHTML=[
    kpi('Carteira a receber',f0(T.carteira),{c:'info',sub:'em aberto (judicial fora)'}),
    kpi('Vencido em aberto',f0(T.inad),{c:rInad(T.inadPct),sub:p1(T.inadPct)+' da carteira'}),
    kpi('Recebidos atrasados',p1(T.atrasoPct),{c:rInad(T.atrasoPct),sub:f0(T.atrasado)+' no período'}),
  ].join('');
}

/* ── renderPE ── */
function renderPE(be,rx){
  const box=document.getElementById('kPE'), bridge=document.getElementById('peBridge'),
        fonte=document.getElementById('pxPEFonte'), nota=document.getElementById('pePeNota');
  if(!be||be.peReceita==null){
    if(box) box.innerHTML='<div class="px-empty">PE indisponível — MC não-positiva ou sem custos calibrados.</div>';
    if(bridge) bridge.innerHTML=''; if(fonte) fonte.textContent=''; if(nota) nota.textContent=''; return;
  }
  const dNow=new Date();
  const nowYM=dNow.getFullYear()+'-'+String(dNow.getMonth()+1).padStart(2,'0');
  const mesNome=MN[dNow.getMonth()];
  // usa meses FECHADOS do período filtrado (exclui mês atual, que está incompleto)
  let fatN=0, nMeses=0, gaoRange='';
  if(rx&&rx.months&&rx.months.length){
    const closed=rx.months.filter(m=>m<nowYM);
    const months=closed.length?closed:rx.months; // fallback: usa tudo se todos são "atuais"
    months.forEach(m=>fatN+=(rx.M[m]?rx.M[m].faturamento:0));
    nMeses=months.length;
    gaoRange=mLb(months[0])+(nMeses>1?'–'+mLb(months[nMeses-1]):'');
  } else {
    const fbm=wCall('fatByMesGet')||{};
    const compMeses=Object.keys(fbm).filter(m=>/^\d{4}-\d{2}$/.test(m)&&m<nowYM).sort();
    const lastN=compMeses.slice(-6);
    lastN.forEach(m=>fatN+=(fbm[m]||0)); nMeses=lastN.length;
    if(nMeses) gaoRange=mLb(lastN[0])+'–'+mLb(lastN[nMeses-1]);
  }
  // receita de referência: média dos meses fechados > mediana histórica
  let receita=0;
  if(nMeses) receita=fatN/nMeses;
  else if(be.temReal&&be.rbMes) receita=be.rbMes;
  const ms=receita>0?(receita-be.peReceita)/receita*100:null;
  const cmN=fatN*be.mcPct/100, oiN=cmN-be.custosFixos*nMeses;
  const gao=(nMeses&&oiN>0)?cmN/oiN:null;
  const caixaMes=(rx&&rx.M&&rx.M[nowYM])?(rx.M[nowYM].recebidoCaixa||0):null;
  const dia=dNow.getDate(), diasMes=new Date(dNow.getFullYear(),dNow.getMonth()+1,0).getDate();
  const caixaRun=(caixaMes!=null&&dia>0)?caixaMes/dia*diasMes:null;
  const peCx=be.peCaixaReceita;
  const cob=(caixaRun!=null&&peCx>0)?caixaRun/peCx*100:null;
  const rCx=cob==null?'':(cob>=100?'good':(cob>=85?'warn':'bad'));
  if(fonte) fonte.textContent=be.temReal?'base: DRE realizado':'base: premissas';
  if(box) box.innerHTML=[
    kpi('Caixa do mês ('+mesNome+')',caixaMes!=null?f0(caixaMes):'—',{c:rCx,sub:caixaMes==null?'sem dado':(caixaMes<=0?'dia '+dia+'/'+diasMes+' · sem entrada':'parcial dia '+dia+'/'+diasMes+' · run-rate '+f0(caixaRun))}),
    kpi('PE de caixa',peCx!=null?f0(peCx):'—',{c:'info',sub:'zera o caixa (c/ sócios)'}),
    kpi('Cobertura PE de caixa',cob!=null?p1(cob):'—',{c:rCx,sub:'run-rate ÷ PE de caixa'}),
    kpi('Ponto de equilíbrio',f0(be.peReceita),{c:'info',sub:'lucro zero (operacional)'}),
    kpi('Margem de contribuição',p1(be.mcPct),{c:be.mcPct>=50?'good':(be.mcPct>=30?'warn':'bad'),sub:'1 − custos variáveis'}),
    kpi('Alavancagem op. ('+nMeses+'m)',gao!=null?(gao.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'×'):'—',{c:gao==null?'warn':(gao<=2?'good':(gao<=4?'warn':'bad')),sub:gao!=null?(gaoRange+' · +1% venda → +'+gao.toFixed(1)+'% lucro'):'sem meses completos'}),
  ].join('');
  const mMax=Math.max(peCx||0,caixaMes||0,caixaRun||0,be.peReceita);
  if(bridge) bars(bridge,[
    {lbl:'PE de caixa (alvo)',color:C.c1,v:peCx||0},
    {lbl:'Caixa '+mesNome+' (realizado)',color:C.c4,v:caixaMes||0},
    {lbl:'Caixa '+mesNome+' (run-rate)',color:(cob!=null&&cob>=100?C.green:C.red),v:caixaRun||0},
  ],mMax,f0);
  if(nota) nota.innerHTML=(cob!=null?`Run-rate <b>${f0(caixaRun)}</b> cobre <b>${p1(cob)}</b> do PE de caixa. `:'')+
    `<b>GAO</b> = MC ÷ res. operacional (${nMeses}m). <b>PE de caixa</b> inclui sócios (${f0(be.socios||0)}).`;
}

/* ── renderUE ── */
function renderUE(opts){
  const base=wCall('dreUnitInputs',opts), rx=wCall('rxBuild',opts);
  const kpis=document.getElementById('kUE'), tbl=document.getElementById('uePxDre'), fonte=document.getElementById('uePxFonte');
  if(!base){
    if(kpis) kpis.innerHTML='<div class="px-empty">Abra a aba <b>Modelagem DRE</b> e calibre os dados.</div>';
    if(tbl) tbl.innerHTML=''; return;
  }
  let cpvPct;
  if(base.cpv3) cpvPct=base.cpv3Pct;
  else if(base.temReal&&base.cpvR2>0) cpvPct=base.cpvVarPct;
  else if(base.temReal&&base.rbMes>0) cpvPct=+(base.cpvMedMes/base.rbMes*100).toFixed(1);
  else cpvPct=base.cpvVarPct||0;
  let ueOv={}; try{ ueOv=(JSON.parse(localStorage.getItem('uniteco_v1'))||{}).ov||{}; }catch(e){}
  const comPct=ueOv.comissaoPct!=null?+ueOv.comissaoPct:5;
  const taxPct=ueOv.taxaPct!=null?+ueOv.taxaPct:3;
  const inadPct=(rx&&rx.T)?rx.T.inadPct:(ueOv.inadimpPct!=null?+ueOv.inadimpPct:0);
  // cashCollPct: % do ticket já recebido à vista/entrada — inadimplência só incide sobre o restante (parcelado/recorrente)
  const cashCollPct=(rx&&rx.T&&rx.T.cashCollPct>0)?rx.T.cashCollPct:0;
  const t=base.ticket||0;
  const cImp=t*base.simplesPct/100,cDed=t*base.deducaoPct/100,cCpv=t*cpvPct/100,cCom=t*comPct/100,cTax=t*taxPct/100;
  const contribFull=t-cImp-cDed-cCpv-cCom-cTax;
  const baseInad=t*(1-cashCollPct/100);  // parcela em risco: exclui o que já entrou no caixa
  const perda=baseInad*inadPct/100, contribExp=contribFull-perda;
  // Paid CAC: raiox (marketing ÷ novos) quando disponível; fallback: só mktFixo ÷ vendasMes
  const paidCac=(rx&&rx.T&&rx.T.cac>0)?rx.T.cac:(base.vendasMes?base.mktFixo/base.vendasMes:0);
  const fullCacVal=(rx&&rx.T&&rx.T.cacTotal>0)?rx.T.cacTotal:0;
  const novosUE=(rx&&rx.T&&rx.T.novos>0)?rx.T.novos:null;
  const lucroPaid=contribExp-paidCac, lucroFull=contribExp-(fullCacVal||paidCac);
  const razaoPaid=paidCac?contribExp/paidCac:0, razaoFull=fullCacVal?contribExp/fullCacVal:0;
  if(fonte) fonte.textContent=base.temReal?'base: DRE realizado':'base: premissas';
  if(kpis) kpis.innerHTML=[
    kpi('Paid CAC',paidCac>0?f0(paidCac):'—',{c:'info',sub:novosUE?(novosUE+' novos · só mkt'):'só marketing ÷ novos'}),
    kpi('Fully-loaded CAC',fullCacVal>0?f0(fullCacVal):'—',{c:'info',sub:'mkt + comercial ÷ novos'}),
    kpi('Lucro / cliente (Paid)',f0(lucroPaid),{c:lucroPaid>=0?'good':'bad',sub:'c/ Paid CAC · pré admin'}),
    kpi('Lucro / cliente (Full)',f0(lucroFull),{c:lucroFull>=0?'good':'bad',sub:'c/ Fully-loaded · pré admin'}),
    kpi('Contrib / Paid CAC',razaoPaid>0?razaoPaid.toFixed(1)+'×':'—',{c:razaoPaid>=3?'good':(razaoPaid>=1?'warn':'bad'),sub:'retorno s/ custo mkt'}),
    kpi('Contrib / Fully CAC',razaoFull>0?razaoFull.toFixed(1)+'×':'—',{c:razaoFull>=3?'good':(razaoFull>=1?'warn':'bad'),sub:'retorno s/ custo total aq.'}),
  ].join('');
  const pp=v=>t?(v/t*100).toFixed(0)+'%':'';
  const rowV=(l,v)=>`<tr><td class="lbl">${l}</td><td class="val">${f0(v)}</td><td class="pct">${pp(v)}</td></tr>`;
  const rowD=(l,v)=>`<tr class="ded"><td class="lbl">&nbsp;&nbsp;&nbsp;${l}</td><td class="val">(${f0(v)})</td><td class="pct">${pp(v)}</td></tr>`;
  const rowT=(l,v,cls)=>`<tr class="tot ${cls||''}"><td class="lbl">${l}</td><td class="val">${f0(v)}</td><td class="pct">${v&&t?(v/t*100).toFixed(0)+'%':''}</td></tr>`;
  // linhas comuns às duas tabelas
  const hdr=`<tr class="head"><td class="lbl">Por contrato</td><td class="val">R$</td><td class="pct">%</td></tr>`;
  let common=hdr;
  common+=rowV('Ticket médio',t);
  common+=rowD('Impostos / Simples ('+base.simplesPct+'%)',cImp);
  common+=rowD('Deduções ('+base.deducaoPct+'%)',cDed);
  common+=rowD('CPV / Entrega ('+cpvPct.toFixed(0)+'%)',cCpv);
  common+=rowD('Comissão closer ('+comPct+'%)',cCom);
  common+=rowD('Taxa cartão ('+taxPct+'%)',cTax);
  common+=rowT('= Margem de contribuição',contribFull,contribFull>=0?'acc':'bad');
  if(inadPct>0){
    const inadLbl='Inadimplência ('+p1(inadPct)+(cashCollPct>0?' × '+p1(100-cashCollPct)+' parc.':'')+')';
    common+=rowD(inadLbl,perda); common+=rowT('= Contribuição esperada',contribExp,contribExp>=0?'good':'bad');
  }
  // tabela Paid CAC
  let rPaid=common+`<tr class="sep"><td class="lbl">Aquisição</td><td></td><td></td></tr>`;
  rPaid+=rowD('Paid CAC',paidCac);
  rPaid+=rowT('= Lucro / cliente',lucroPaid,lucroPaid>=0?'good':'bad');
  // tabela Fully-loaded CAC
  let rFull=common+`<tr class="sep"><td class="lbl">Aquisição</td><td></td><td></td></tr>`;
  rFull+=rowD('Fully-loaded CAC',fullCacVal||paidCac);
  rFull+=rowT('= Lucro / cliente',lucroFull,lucroFull>=0?'good':'bad');
  const tblPaid=document.getElementById('uePxDrePaid'), tblFull=document.getElementById('uePxDreFull');
  if(tblPaid) tblPaid.innerHTML=rPaid;
  if(tblFull) tblFull.innerHTML=rFull;
  if(tbl) tbl.innerHTML='';
}

/* ── renderRentabilidade — top 7 categorias de saída (período selecionado) ── */
function renderRentabilidade(dreMeses,be){
  const kbox=document.getElementById('kRent');
  const rentPctEl=document.getElementById('rentPct');
  // pega até 40 categorias p/ cobrir todo o plano de contas
  const catData=wCall('dfcCategoriasTop',40);
  if(!catData||!catData.categorias.length){
    if(kbox) kbox.innerHTML=''; if(rentPctEl) rentPctEl.textContent='';
    _rentSetBars(null); return;
  }
  // filtra pelo período selecionado (mesmo filtro das outras tiles)
  const opts=pxGetRange();
  const meses=catData.meses.filter(m=>
    (!opts||!opts.de||m>=opts.de)&&(!opts||!opts.ate||m<=opts.ate)
  );
  // soma cada categoria no período
  const catSum={};
  catData.categorias.forEach(cat=>{
    const s=meses.reduce((t,m)=>t+(catData.byMonth[cat][m]||0),0);
    if(s>0) catSum[cat]=s;
  });
  // merge: Salários e Encargos + Honorários → "Salários e Honorários"
  const _merge=(key,from)=>{
    const v=from.reduce((s,k)=>s+(catSum[k]||0),0);
    from.forEach(k=>delete catSum[k]);
    if(v>0) catSum[key]=v;
  };
  _merge('Salários e Honorários',['Salários e Encargos','Honorários']);
  // merge: Distribuição de Lucros + Antecipação de Lucros → "Remuneração Sócios"
  _merge('Remuneração Sócios',['Distribuição de Lucros','Antecipação de Lucros']);
  // excluir pass-throughs financeiros do ranking visual (tarifas e pagamentos de cartão)
  Object.keys(catSum).forEach(function(k){ if(/cart[aã]o/i.test(k)) delete catSum[k]; });
  const totalSai=Object.values(catSum).reduce((s,v)=>s+v,0);
  const top7=Object.keys(catSum).sort((a,b)=>catSum[b]-catSum[a]).slice(0,7);
  const maxVal=top7.length?catSum[top7[0]]:1;
  const shr=s=>s.replace('Softwares e Plataformas','Softwares')
    .replace('Marketing e Publicidade','Marketing').replace('Custo Direto e Impostos','Custo Direto')
    .replace('Distribuição de Lucros','Dist. Lucros').replace('Antecipação de Lucros','Antec. Lucros')
    .replace('Máquinas, Computadores e Manutenção','Maq./Comp.').replace('Tarifa Cobrança da Plataforma','Tarifa Plat.')
    .replace('Comissões de Vendedores','Comissões').replace('Custas Judiciais','Custas Jud.')
    .replace('Serv. Terceiros','Serv. Terc.');
  const PAL=[C.c1,C.c2,C.c3,C.c4,C.c5,C.c6,C.c7];
  const nMeses=meses.length||1;
  const fK=v=>'R$ '+Math.round(v/1000).toLocaleString('pt-BR')+'k';
  const rows=top7.map((cat,i)=>{
    const v=catSum[cat]||0;
    const w=Math.max(8,v/maxVal*100).toFixed(1);
    const pct=totalSai>0?(v/totalSai*100).toFixed(1):'0';
    const vStr=fK(v)+' ~ '+fK(v/nMeses)+'/mês';
    return `<div class="cat-row"><span class="cat-lbl">${esc(shr(cat))}</span>`+
      `<div class="cat-bar-track"><div class="cat-bar-fill" style="width:${w}%;background:${PAL[i]}">`+
      `<span class="cat-bar-val">${vStr}</span></div></div>`+
      `<span class="cat-pct">${pct}%</span></div>`;
  }).join('');
  _rentSetBars(rows);
  if(rentPctEl){
    const top7pct=totalSai>0?(top7.reduce((s,c)=>s+(catSum[c]||0),0)/totalSai*100).toFixed(0):null;
    rentPctEl.textContent=top7pct?'top 7: '+top7pct+'% das saídas':'';
  }
  if(kbox) kbox.innerHTML='';
}
/* injeta/atualiza o container HTML de barras; oculta o canvas */
function _rentSetBars(html){
  const chEl=document.getElementById('chRent');
  if(chEl){ chEl.style.display='none'; if(CH['chRent']){CH['chRent'].destroy();delete CH['chRent'];} }
  const par=chEl?chEl.parentElement:null; if(!par) return;
  let barsEl=document.getElementById('rentCatBars');
  if(!barsEl){ barsEl=document.createElement('div'); barsEl.id='rentCatBars'; barsEl.className='cat-bars'; par.appendChild(barsEl); }
  barsEl.innerHTML=html||'<div class="px-empty">Importe o extrato no app.</div>';
}

/* ── renderEbitda — gráfico trimestral Q3-2025 em diante ── */
function renderEbitda(dreMeses){
  const box=document.getElementById('kEbitda');
  if(!dreMeses||!dreMeses.length){
    if(box) box.innerHTML='<div class="px-empty">Sem histórico DRE. Importe a planilha financeira na aba Modelagem DRE.</div>';
    mkC('chEbitda',{data:{labels:[],datasets:[]}}); return;
  }
  if(box) box.innerHTML='';

  // geração de caixa do DFC — cobre todos os meses do extrato (incl. Q3/Q4 2025)
  const dfcFluxo=wCall('dfcFluxoByMonth')||null;
  // fallback: raiox (só meses com entradas registradas)
  const rxAll=!dfcFluxo?(wCall('rxBuild')||{M:{}}):null;

  // filtra Q3-2025 em diante e agrupa por trimestre
  const START='2025-07';
  const rows=dreMeses.filter(r=>r.ym>=START);
  const qMap={};
  rows.forEach(r=>{
    const p=r.ym.split('-'); const yr=+p[0]; const mo=+p[1];
    const q=Math.ceil(mo/3);
    const key=yr+'Q'+q;
    if(!qMap[key]) qMap[key]={label:'Q'+q+'/'+String(yr).slice(2),ebitda:0,lucroLiq:0,RB:0,geracao:0};
    qMap[key].ebitda+=r.ebitda||0;
    qMap[key].lucroLiq+=r.lucroLiq||0;
    qMap[key].RB+=r.RB||0;
    // DFC fluxo = entradas − saídas (fonte mais completa); fallback: raiox.geracao
    const gm=dfcFluxo?(dfcFluxo[r.ym]||0):(rxAll&&rxAll.M&&rxAll.M[r.ym]?rxAll.M[r.ym].geracao||0:0);
    qMap[key].geracao+=gm;
  });
  const qs=Object.keys(qMap).sort();
  const labels=qs.map(k=>qMap[k].label);
  const ebitdaVals=qs.map(k=>qMap[k].ebitda);
  const geracaoVals=qs.map(k=>qMap[k].geracao);
  const mlVals=qs.map(k=>qMap[k].RB>0?qMap[k].lucroLiq/qMap[k].RB*100:0);
  const ebitdaPctVals=qs.map(k=>qMap[k].RB>0?qMap[k].ebitda/qMap[k].RB*100:null);

  // plugin inline: escreve % de EBITDA dentro de cada barra azul
  const pctLabelPlugin={
    id:'ebitdaPct',
    afterDatasetsDraw(chart){
      const ctx=chart.ctx;
      const meta=chart.getDatasetMeta(0); // dataset 0 = EBITDA bars
      ctx.save();
      ctx.font='bold 11px system-ui,sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      meta.data.forEach(function(bar,i){
        const pct=ebitdaPctVals[i];
        if(pct==null) return;
        const barH=Math.abs(bar.base-bar.y);
        if(barH<18) return; // barra muito pequena: não cabe
        const txt=(pct>=0?'+':'')+pct.toFixed(1)+'%';
        ctx.fillStyle='rgba(255,255,255,.9)';
        ctx.fillText(txt,bar.x,(bar.y+bar.base)/2);
      });
      ctx.restore();
    }
  };

  mkC('chEbitda',{
    data:{labels,datasets:[
      {type:'bar',label:'EBITDA',data:ebitdaVals,backgroundColor:'rgba(75,124,243,.78)',borderRadius:4},
      {type:'bar',label:'Geração de caixa',data:geracaoVals,backgroundColor:'rgba(34,211,238,.72)',borderRadius:4},
      {type:'line',label:'Margem líq. %',data:mlVals,yAxisID:'y2',borderColor:C.chLine,borderWidth:2.5,tension:.25,pointRadius:3,fill:false},
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{
      x:{ticks:{color:C.txt},grid:{color:C.line}},
      y:{ticks:{color:C.txt,callback:v=>fK(v)},grid:{color:C.line}},
      y2:{position:'right',ticks:{color:C.chLine,callback:v=>v.toFixed(0)+'%'},grid:{drawOnChartArea:false}},
    }},
    plugins:[pctLabelPlugin]
  });
}

/* ── helpers de data ── */
function _ymNow(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function _ymAdd(ym,n){ var p=ym.split('-'); var d=new Date(+p[0],(+p[1]-1)+n,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }

/* lê os inputs de filtro do dashboard; retorna {de,ate} ou null */
function pxGetRange(){
  var de=document.getElementById('pxDe'), ate=document.getElementById('pxAte');
  if(de&&ate&&de.value&&ate.value) return {de:de.value,ate:ate.value};
  return null;
}

/* define o range via inputs e atualiza destaque do botão de preset */
function pxSetRange(de,ate,presetEl){
  var deEl=document.getElementById('pxDe'), ateEl=document.getElementById('pxAte');
  if(deEl) deEl.value=de;
  if(ateEl) ateEl.value=ate;
  document.querySelectorAll('#dashboard .px-preset').forEach(function(b){ b.classList.remove('active'); });
  if(presetEl) presetEl.classList.add('active');
  painelRenderAll();
}

/* ── renderAll ── */
function painelRenderAll(){
  var opts=pxGetRange();
  var rx=wCall('rxBuild',opts), be=wCall('dreBreakeven'), cx=wCall('caixaHoje');
  var roll=(cx&&cx.saldoHoje!=null)?wCall('rollSeries',cx.saldoHoje,null):wCall('rollSeries');
  renderResumo(rx,cx);
  renderCaixa(roll,cx);
  renderReceita(rx);
  renderInad(rx);
  renderPE(be,rx);
  renderUE(opts);
  var dreMeses=wCall('dreHistMonthly');
  renderEbitda(dreMeses);
  renderRentabilidade(dreMeses,be);
}

window.painelRenderAll = painelRenderAll;

/* ── Publicar para Sócios — serializa estado atual e baixa JSON ── */
window.pxSerializar = function(){
  var cx=wCall('caixaHoje');
  var saldo=cx&&cx.saldoHoje!=null?cx.saldoHoje:null;
  var roll=saldo!=null?wCall('rollSeries',saldo,null):wCall('rollSeries');
  return {
    rx:wCall('rxBuild',null),
    dreBreakeven:wCall('dreBreakeven'),
    dreUnitInputs:wCall('dreUnitInputs',null),
    caixaHoje:cx,
    dreHist:wCall('dreHistMonthly'),
    dfcFluxo:wCall('dfcFluxoByMonth'),
    dfcCatTop:wCall('dfcCategoriasTop',40),
    roll:roll,
    ts:new Date().toISOString()
  };
};
window.pxPublicarSocios = function(){
  var d=window.pxSerializar();
  if(!d.rx&&!d.dreHist&&!d.dfcCatTop){
    alert('Importe o extrato financeiro antes de publicar.');
    return;
  }
  var blob=new Blob([JSON.stringify(d)],{type:'application/json'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='painel-dados.json'; a.click();
};

/* ── Configuração + Auto-publish JSONBin ── */
var PX_CFG_KEY='pxSocioConfig_v1';
function pxLoadCfg(){ try{ return JSON.parse(localStorage.getItem(PX_CFG_KEY)||'null'); }catch(e){ return null; } }
function pxSaveCfg(cfg){ localStorage.setItem(PX_CFG_KEY,JSON.stringify(cfg)); }
function pxSetPublishStatus(txt,cls){
  var el=document.getElementById('pxPublishStatus'); if(!el) return;
  el.textContent=txt; el.style.color=cls==='err'?'#f43f5e':cls==='ok'?'#10b981':'#94a3b8';
}

window.pxAutoPublish = async function(mudou){
  var cfg=pxLoadCfg();
  if(!cfg||!cfg.apiKey||!cfg.binId) return;
  var dados=window.pxSerializar();
  if(!dados.rx&&!dados.dreHist&&!dados.dfcCatTop) return;
  try{
    var r=await fetch('https://api.jsonbin.io/v3/b/'+cfg.binId,{
      method:'PUT',
      headers:{'Content-Type':'application/json','X-Master-Key':cfg.apiKey},
      body:JSON.stringify(dados)
    });
    if(!r.ok){ var je=await r.json().catch(()=>{}); throw new Error((je&&je.message)||'HTTP '+r.status); }
    var t=new Date().toLocaleTimeString('pt-BR');
    pxSetPublishStatus('✓ Publicado automaticamente · '+t,'ok');
    var st=document.getElementById('autoStatus');
    if(st&&mudou) st.title='Dashboard dos sócios atualizado · '+t;
  }catch(e){
    pxSetPublishStatus('✗ Falha ao publicar: '+e.message,'err');
    console.warn('pxAutoPublish erro:',e);
  }
};

window.pxAbrirConfig = function(){
  var cfg=pxLoadCfg()||{};
  var existing=document.getElementById('pxSocioConfig');
  if(existing){ existing.remove(); return; }
  var binUrl=cfg.binId?window.location.origin+window.location.pathname.replace('index.html','')+'painel-socio.html?bin='+cfg.binId:'';
  var div=document.createElement('div');
  div.id='pxSocioConfig';
  div.style.cssText='position:fixed;top:80px;right:20px;z-index:9999;background:#0f1520;border:1px solid #1e2840;border-radius:10px;padding:18px 20px;min-width:360px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.6);font-size:12px;color:#cbd5e1';
  div.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<b style="color:#dcab5b;font-size:13px">Painel Automático — Sócios</b>'
    +'<button onclick="document.getElementById(\'pxSocioConfig\').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;line-height:1">✕</button></div>'
    +'<div style="color:#64748b;font-size:11px;margin-bottom:12px;line-height:1.6">'
    +'1. Crie uma conta gratuita em <a href="https://jsonbin.io" target="_blank" style="color:#4b7cf3">jsonbin.io</a><br>'
    +'2. Copie sua <b style="color:#cbd5e1">Master Key</b> no painel do site<br>'
    +'3. Cole abaixo e clique <b style="color:#cbd5e1">Configurar</b></div>'
    +'<label style="display:block;margin-bottom:4px;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.5px">Master Key do JSONBin</label>'
    +'<input id="pxApiKey" type="password" placeholder="$2a$10$..." value="'+(cfg.apiKey||'')+'" style="width:100%;background:#080b10;border:1px solid #1e2840;border-radius:5px;padding:6px 10px;color:#e4e4e7;font-size:12px;margin-bottom:10px;box-sizing:border-box" />'
    +(cfg.binId?'<div style="margin-bottom:10px"><label style="display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Bin ID</label><div style="background:#080b10;border:1px solid #1e2840;border-radius:5px;padding:6px 10px;color:#64748b;font-size:11px;font-family:monospace">'+cfg.binId+'</div></div>':'')
    +(binUrl?'<div style="margin-bottom:12px"><label style="display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Link para os sócios</label><div style="display:flex;gap:6px;align-items:center"><div style="background:#080b10;border:1px solid #1e2840;border-radius:5px;padding:6px 10px;color:#4b7cf3;font-size:10px;font-family:monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="'+binUrl+'" onclick="navigator.clipboard.writeText(\''+binUrl+'\').then(()=>alert(\'Link copiado!\'))">'+binUrl+'</div><button onclick="navigator.clipboard.writeText(\''+binUrl+'\').then(()=>alert(\'Link copiado!\'))" style="background:rgba(75,124,243,.15);border:1px solid rgba(75,124,243,.3);border-radius:5px;padding:4px 8px;color:#4b7cf3;cursor:pointer;font-size:10px;white-space:nowrap">Copiar</button></div></div>':'')
    +'<div style="display:flex;gap:8px">'
    +'<button id="pxBtnCfg" onclick="window.pxSalvarConfig()" style="flex:1;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.3);border-radius:6px;padding:7px;color:#10b981;cursor:pointer;font-weight:600">'+(cfg.binId?'Atualizar configuração':'Configurar e criar bin')+'</button>'
    +'<button onclick="window.pxTestarPublish&&window.pxTestarPublish()" style="background:rgba(75,124,243,.1);border:1px solid rgba(75,124,243,.2);border-radius:6px;padding:7px 12px;color:#4b7cf3;cursor:pointer">Testar</button>'
    +'</div>'
    +'<div id="pxPublishStatus" style="margin-top:8px;font-size:11px;min-height:16px;color:#64748b"></div>';
  document.body.appendChild(div);
};

window.pxSalvarConfig = async function(){
  var key=(document.getElementById('pxApiKey')||{}).value||'';
  key=key.trim();
  if(!key){ pxSetPublishStatus('Informe a Master Key.','err'); return; }
  pxSetPublishStatus('Criando bin...','');
  var cfg=pxLoadCfg()||{};
  try{
    if(!cfg.binId){
      var r=await fetch('https://api.jsonbin.io/v3/b',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-Master-Key':key,'X-Bin-Name':'painel-evolving','X-Bin-Private':'false'},
        body:JSON.stringify({status:'aguardando primeiro update'})
      });
      if(!r.ok){ var je=await r.json().catch(()=>{}); throw new Error((je&&je.message)||'HTTP '+r.status); }
      var j=await r.json();
      cfg.binId=j.metadata&&j.metadata.id;
    }
    cfg.apiKey=key;
    pxSaveCfg(cfg);
    pxSetPublishStatus('✓ Configurado! Publicando dados agora...','ok');
    document.getElementById('pxSocioConfig').remove();
    await window.pxAutoPublish(true);
    window.pxAbrirConfig();
  }catch(e){
    pxSetPublishStatus('✗ '+e.message,'err');
  }
};

window.pxTestarPublish = async function(){
  pxSetPublishStatus('Publicando...','');
  await window.pxAutoPublish(true);
};

/* ── wira os botões de preset e inputs ao carregar ── */
(function(){
  // default: últimos 6 meses
  var now=_ymNow();
  var deEl=document.getElementById('pxDe'), ateEl=document.getElementById('pxAte');
  if(deEl&&!deEl.value) deEl.value=_ymAdd(now,-5);
  if(ateEl&&!ateEl.value) ateEl.value=now;

  // presets numéricos (data-px-n)
  document.querySelectorAll('#dashboard .px-preset[data-px-n]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var n=parseInt(btn.getAttribute('data-px-n'),10);
      var ate=_ymNow(), de=_ymAdd(ate,-(n-1));
      pxSetRange(de,ate,btn);
    });
  });
  // preset YTD
  document.querySelectorAll('#dashboard .px-preset[data-px-ytd]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var ate=_ymNow(), yr=ate.split('-')[0];
      pxSetRange(yr+'-01',ate,btn);
    });
  });
  // mudança manual nos inputs → re-render
  ['pxDe','pxAte'].forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.addEventListener('change',function(){
      document.querySelectorAll('#dashboard .px-preset').forEach(function(b){ b.classList.remove('active'); });
      painelRenderAll();
    });
  });
  // marca botão "6m" como ativo por default
  var btn6=document.querySelector('#dashboard .px-preset[data-px-n="6"]');
  if(btn6) btn6.classList.add('active');
})();

// Tenta renderizar; se rxBuild ainda não tiver dados, repola até 15s
function _tryInit(n){
  if(wCall('rxBuild')){ painelRenderAll(); return; }
  if(n<30) setTimeout(function(){_tryInit(n+1);},500);
}
setTimeout(function(){_tryInit(0);},100);

// Mantém atualizado a cada 30s
setInterval(painelRenderAll,30000);

// Re-renderiza toda vez que o painel ficar visível (troca de aba)
(function(){
  var el=document.getElementById('dashboard');
  if(!el||typeof MutationObserver==='undefined') return;
  new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){
      if(muts[i].target.classList.contains('active')){ setTimeout(painelRenderAll,80); break; }
    }
  }).observe(el,{attributes:true,attributeFilter:['class']});
})();

})();
