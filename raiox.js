/* =========================================================================
   Raio-X de Performance (MRR) — painel executivo mensal
   Consolida o que o diretor revisa primeiro em toda reunião:
   faturamento, vendas à vista, MRR projetado × realizado, churn,
   recebidos atrasados, novos clientes, CAC, ticket, LTV e caixa operacional.
   Fonte: dados REAIS importados (entRows/fatByMes do relatorio.js + lastDfc do dfc.js).
   Faturamento e MRR projetado = competência; o resto = caixa.
   ========================================================================= */

/* ---------- helpers locais (reaproveita globais quando existem) ---------- */
const rxFmt0  = (typeof fmt0==='function') ? fmt0 : n => 'R$ '+Math.round(n||0).toLocaleString('pt-BR');
const rxPct   = (typeof pct==='function')  ? pct  : n => (n||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const rxEsc   = (typeof esc==='function')  ? esc  : s => String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const rxNum1  = n => (n||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const RXMNOMES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function rxLabel(m){ const p=m.split('-'); return RXMNOMES[(+p[1])-1]+'/'+String(p[0]).slice(2); }
const rxNorm = (typeof norm==='function') ? norm : s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

/* benchmarks (mercado): verde dentro / amarelo atenção / vermelho fora */
function rxRagPos(v){ return v>0?'good':(v===0?'warn':'bad'); }       // geração de caixa
function rxRagInad(p){ return p<=5?'good':(p<=10?'warn':'bad'); }     // % atraso/inadimplência
function rxRagRoas(r){ return r>=4?'good':(r>=2?'warn':'bad'); }      // ROAS receita/investimento

/* ---------- painel comercial (Google Sheets publicado · SDR André) ---------- */
const RX_PAINEL_URL='https://docs.google.com/spreadsheets/d/e/2PACX-1vQzbgQrcB45gQ1j1oxv11GfAQbpIBbImJCILwZ1Gke9R181IGVDAF-nXJ6ihIlbl4lus82-zpXVz5mM/pub?gid=1868599365&single=true&output=csv';
let rxPainel=null;            // {YYYY-MM: {vendas, faturamento, ticket, cac, investimento, roas, roi, noshow, noshowPct, agendadas, feitas}}
let rxPainelStatus='';
const RX_MESNUM={janeiro:1,fevereiro:2,marco:3,abril:4,maio:5,junho:6,julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};
// delega ao parser canônico (app.js); fallback mantém o comportamento antigo
function rxNumBR(s){ if(typeof parseNum==='function') return parseNum(s);
  let t=String(s==null?'':s).replace(/[^\d.,-]/g,''); if(!t||/^[-.,]+$/.test(t)) return 0;
  if(t.includes('.')&&t.includes(',')) t=t.replace(/\./g,'').replace(',','.'); else if(t.includes(',')) t=t.replace(',','.');
  const n=parseFloat(t); return isNaN(n)?0:n; }
function rxParseCSV(text){ const rows=[]; let row=[],f='',q=false; text=String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(let i=0;i<text.length;i++){ const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=ch; }
    else if(ch==='"') q=true; else if(ch===','){ row.push(f); f=''; } else if(ch==='\n'){ row.push(f); rows.push(row); row=[]; f=''; } else f+=ch; }
  if(f.length||row.length){ row.push(f); rows.push(row); } return rows; }
async function rxFetchPainel(){
  try{
    rxPainelStatus='atualizando painel…';
    const r=await fetch(RX_PAINEL_URL+'&t='+Date.now(), {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const aoa=rxParseCSV(await r.text());
    const N=s=>rxNorm(s).replace(/\s+/g,' ').trim();
    let ano=new Date().getFullYear();
    for(const row of aoa){ const mm=row.join(' ').match(/20\d\d/); if(mm){ ano=+mm[0]; break; } }
    let h=-1; for(let i=0;i<aoa.length;i++){ const rr=aoa[i].map(N); if(rr.includes('mes') && rr.some(c=>c.includes('ticket'))){ h=i; break; } }
    if(h<0) throw new Error('cabeçalho RESUMO MENSAL não encontrado');
    const H=aoa[h].map(N), col=p=>H.findIndex(p);
    const ix={ mes:col(c=>c==='mes'), agend:col(c=>c==='agendadas'), feitas:col(c=>c==='feitas'),
      noshow:col(c=>c==='no-show'), noshowPct:col(c=>c.startsWith('%')&&c.includes('no-show')),
      vendas:col(c=>c==='vendas'), fat:col(c=>c==='faturamento'), ticket:col(c=>c.includes('ticket')),
      roas:col(c=>c==='roas'), roi:col(c=>c==='roi'), cac:col(c=>c==='cac'), invest:col(c=>c.includes('investimento')),
      cacTotal:col(c=>c.includes('cac') && c.includes('total')) };   // coluna "CAC TOTAL" (mkt+comercial ÷ vendas)
    const out={}; let started=false;
    for(let i=h+1;i<aoa.length;i++){ const rr=aoa[i]||[]; const mn=RX_MESNUM[N(rr[ix.mes])];
      if(!mn){ if(started) break; else continue; }   // para no fim do bloco (TOTAL ANUAL) — não invade outras seções
      started=true;
      const ym=ano+'-'+String(mn).padStart(2,'0');
      out[ym]={ agendadas:rxNumBR(rr[ix.agend]), feitas:rxNumBR(rr[ix.feitas]), noshow:rxNumBR(rr[ix.noshow]),
        noshowPct:rxNumBR(rr[ix.noshowPct]), vendas:rxNumBR(rr[ix.vendas]), faturamento:rxNumBR(rr[ix.fat]),
        ticket:rxNumBR(rr[ix.ticket]), roas:rxNumBR(rr[ix.roas]), roi:rxNumBR(rr[ix.roi]),
        cac:rxNumBR(rr[ix.cac]), investimento:rxNumBR(rr[ix.invest]),
        cacTotal: ix.cacTotal>=0 ? rxNumBR(rr[ix.cacTotal]) : 0 }; }
    rxPainel=out; rxPainelStatus='● painel ao vivo';
  }catch(e){ console.error('Painel:',e); rxPainelStatus='✗ painel sem conexão (publique a aba como CSV)'; }
  try{ rxRender(); }catch(e){}
}

/* ---------- meses disponíveis (união entRows + DFC) ---------- */
function rxAllMonths(){
  const set=new Set();
  if(typeof entRows!=='undefined' && entRows) entRows.forEach(r=>{
    if(/^\d{4}-\d{2}$/.test(r.mes)) set.add(r.mes);
    if(/^\d{4}-\d{2}$/.test(r.mesComp)) set.add(r.mesComp);
  });
  if(typeof lastDfc!=='undefined' && lastDfc && lastDfc.meses) lastDfc.meses.forEach(m=>{ if(/^\d{4}-\d{2}$/.test(m)) set.add(m); });
  return Array.from(set).sort();
}
/* helpers de mês (YYYY-MM) ancorados no calendário */
const rxYM = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
function rxAddMonths(ym,n){ const [y,m]=ym.split('-').map(Number); return rxYM(new Date(y,(m-1)+n,1)); }
/* range padrão: mês ATUAL do calendário + 5 anteriores = 6 meses (rola sozinho a cada mês) */
function rxDefaultRange(){ const ate=rxYM(new Date()); return { de: rxAddMonths(ate,-5), ate }; }
/* enumera todos os meses do calendário entre de..ate (inclui meses sem dados) */
function rxRangeMonths(de,ate){ const out=[]; let c=de, g=0; while(c<=ate && g<240){ out.push(c); c=rxAddMonths(c,1); g++; } return out; }
/* meses exibidos = intervalo De/Até (sem filtro → últimos 3 meses do calendário) */
function rxMonths(){
  const deEl=document.getElementById('rxDe'), ateEl=document.getElementById('rxAte');
  const r=rxDefaultRange();
  let de=(deEl&&deEl.value)||r.de, ate=(ateEl&&ateEl.value)||r.ate;
  if(de>ate){ const t=de; de=ate; ate=t; }
  return rxRangeMonths(de,ate);
}

/* ---------- marketing por mês para o CAC (input manual ou estimado pelo DFC) ---------- */
function rxMktByMonth(){
  const out={};
  const inp=document.getElementById('rxMkt');
  const manual=inp && inp.value!=='' ? (parseFloat(inp.value)||0) : null;
  if(manual!==null){ rxMonths().forEach(m=> out[m]=manual); return {map:out, fonte:'manual'}; }
  // estima pelo DFC: contas cuja categoria parece marketing/tráfego/anúncios
  if(typeof lastDfc!=='undefined' && lastDfc && lastDfc.V){
    const re=/(marketing|trafego|anuncio|publicidade|midia|ads|meta|google|propaganda|impuls)/;
    Object.keys(lastDfc.V).forEach(conta=>{
      if(re.test(rxNorm(conta))){ const byMes=lastDfc.V[conta]; Object.keys(byMes).forEach(m=> out[m]=(out[m]||0)+byMes[m]); }
    });
    if(Object.keys(out).length) return {map:out, fonte:'DFC'};
  }
  return {map:out, fonte:'—'};
}

/* ---------- núcleo: monta as métricas por mês ---------- */
function rxBuild(opts){
  const months=(opts&&opts.de&&opts.ate)?rxRangeMonths(opts.de,opts.ate):rxMonths();
  if(!months.length || typeof entRows==='undefined' || !entRows) return null;

  const isRecorrente = c => c==='Parcelado/Recorrente';
  const isVista      = c => c==='À vista';
  const isEntrada    = c => c==='Valor de Entrada';
  const isNovaVenda  = c => isEntrada(c) || isVista(c);

  // primeira aparição de cada cliente como NOVA venda (entrada/à vista) → mês de aquisição
  const firstSeen={};
  entRows.forEach(r=>{ if(isNovaVenda(r.cat) && /^\d{4}-\d{2}$/.test(r.mes)){
    if(!firstSeen[r.nome] || r.mes<firstSeen[r.nome]) firstSeen[r.nome]=r.mes; } });

  const mkt=rxMktByMonth();

  // acumuladores por mês
  const M={};
  months.forEach(m=> M[m]={
    faturamento:0, avista:0, recebidoCaixa:0, cashColl:0, dup:0, recPct:0,
    atrasado:0, recebTot:0, inad:0, vencidoTot:0, judic:0, recebParc:[], dso:0, dsoNum:0, dsoDen:0, saldo:0,
    novos:0, receitaNova:0, ativosRec:new Set(),
    invest:0, roas:0, roi:0, noshowPct:0, agendadas:0, feitas:0, noshow:0, fatVendas:0, cacTotal:0, painel:false,
    investPct:0, cacComPct:0, cacTotPct:0,
    entCaixa:0, saiCaixa:0, geracao:0, mkt:mkt.map[m]||0
  });
  const novosVistos={}; // nome -> contado uma vez

  entRows.forEach(r=>{
    const mk=r.mes;
    if(!M[mk]) return;
    // caixa recebido no mês
    M[mk].recebidoCaixa += r.valor||0;
    if(isVista(r.cat)) M[mk].avista += r.valor||0;
    // cash collection = Valor de Entrada + À vista (categorias do Relatório de Entradas)
    if(isNovaVenda(r.cat)) M[mk].cashColl += r.valor||0;
    if(isRecorrente(r.cat)){ M[mk].ativosRec.add(r.nome); M[mk].dup += r.valor||0; }   // duplicatas = parcelado/recorrente recebido (sem entrada/à vista)
    // novos clientes + receita de novos (no mês de aquisição)
    if(isNovaVenda(r.cat) && firstSeen[r.nome]===mk){
      M[mk].receitaNova += r.valorOrig||0;
      if(!novosVistos[r.nome]){ novosVistos[r.nome]=true; M[mk].novos += 1; }
    }
  });
  // Faturamento = por COMPETÊNCIA, do Relatório de Entradas (fatByMes: base completa, valor original, sem outras entradas)
  if(typeof fatByMes!=='undefined' && fatByMes) months.forEach(m=>{ if(M[m]) M[m].faturamento = fatByMes[m]||0; });

  // saídas de caixa do DFC (por mês); as ENTRADAS vêm do Relatório de Entradas (recebidoCaixa), abaixo
  if(typeof lastDfc!=='undefined' && lastDfc && lastDfc.calc){
    const c=lastDfc.calc;
    months.forEach(m=>{ if(M[m]) M[m].saiCaixa=c.totSai[m]||0; });
  }

  // Contas a Receber (recebAll, do prev.js): recebidos atrasados + inadimplentes do mês
  const rr=(typeof recebAll!=='undefined' && recebAll)?recebAll:[];
  const ymOf=d=> d ? (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')) : null;
  const hoje=new Date();
  let carteira=0;   // TOTAL de contas a receber em aberto (toda a carteira, col T)
  const vencGlobal={};   // MRR por COMPETÊNCIA = Σ parcelas que vencem no mês (TODOS os meses, p/ pegar o mês anterior)
  const aging={'A vencer':0,'1-30':0,'31-60':0,'61-90':0,'90+':0};   // aging dos recebíveis em aberto (snapshot hoje)
  rr.forEach(r=>{
    // RECEBIDOS ATRASADOS: TODOS os recebimentos do mês cuja data prevista de vencimento era de meses anteriores (INCLUI judicial)
    if(r.pagto && r.recebido>0){
      const mp=ymOf(r.pagto);
      if(M[mp]){
        M[mp].recebTot += r.recebido;                                  // total recebido no mês (denominador do %)
        const due=r.prev||r.venc;                                      // data prevista de vencimento
        if(due && ymOf(due) < mp) M[mp].atrasado += r.recebido;        // recebido de mês anterior
      }
    }
    // JUDICIAL: capturado em linha separada (em aberto, col T, por mês de vencimento) e segue FORA de carteira/inadimplentes/aging
    if(r.judicial){ if(r.venc && r.abertoT>0){ const mv=ymOf(r.venc); if(M[mv]) M[mv].judic += r.abertoT; } return; }
    if(r.abertoT>0) carteira += r.abertoT;   // soma toda a carteira a receber (a vencer + vencida)
    // DSO / prazo médio de recebimento: dias da VENDA (competência) até a BAIXA, ponderado pelo valor recebido
    if(r.pagto && r.recebido>0){ const base=r.comp||r.venc; if(base){ const mp=ymOf(r.pagto); if(M[mp]){ const dd=(r.pagto-base)/86400000; M[mp].dsoNum+=dd*r.recebido; M[mp].dsoDen+=r.recebido; } } }
    // AGING dos recebíveis em aberto (snapshot hoje), por dias de atraso
    if(r.abertoT>0 && r.venc){ const od=(hoje-r.venc)/86400000; const b= od<0?'A vencer':(od<=30?'1-30':(od<=60?'31-60':(od<=90?'61-90':'90+'))); aging[b]+=r.abertoT; }
    // INADIMPLENTES DO MÊS: Situação (col K) "Atrasado" ou "Quitado parcialmente" → soma Valor da parcela em aberto (col T)
    // Denominador (%): total do contas a receber do mês = Valor original das parcelas (col M), por mês de vencimento.
    if(r.venc){
      const mv=ymOf(r.venc);
      vencGlobal[mv]=(vencGlobal[mv]||0)+(r.original||0);             // MRR competência do mês (col M), todos os meses
      if(M[mv]){
        M[mv].vencidoTot += r.original||0;                            // total do contas a receber do mês (col M)
        const s=rxNorm(r.sit);
        const ehInad = s.includes('atrasad') || (s.includes('quitad') && s.includes('parcial'));
        if(ehInad) M[mv].inad += r.abertoT||0;                        // em aberto (col T) dos vencidos sem baixa
        M[mv].recebParc.push({cliente:r.cliente||'', venc:r.venc, sit:r.sit||'', original:r.original||0, abertoT:r.abertoT||0, inad:ehInad});
      }
    }
  });

  // MRR por COMPETÊNCIA: vem das parcelas que vencem no mês (contas a receber, vencGlobal acima).

  // derivadas por mês
  months.forEach(m=>{
    const x=M[m];
    x.ativos = x.ativosRec.size;
    x.mrrReal = x.dup;                          // Duplicatas = parcelado/recorrente recebido no mês (sem entrada/à vista)
    x.avistaPct = x.recebidoCaixa>0 ? x.avista/x.recebidoCaixa*100 : 0;
    x.cashCollPct = x.faturamento>0 ? x.cashColl/x.faturamento*100 : 0;
    x.atrasoPct = x.recebTot>0 ? x.atrasado/x.recebTot*100 : 0;          // % do recebido (contas a receber)
    x.inadPct   = x.mrrReal>0 ? x.inad/x.mrrReal*100 : 0;                // inadimplentes ÷ duplicatas (parcelado/recorrente)
    x.recPct    = x.faturamento>0 ? x.mrrReal/x.faturamento*100 : 0;     // % recorrente = duplicatas ÷ faturamento
    x.dso       = x.dsoDen>0 ? x.dsoNum/x.dsoDen : 0;                     // prazo médio de recebimento (dias após vencimento)
    x.ticket = x.novos>0 ? x.receitaNova/x.novos : 0;
    x.cac    = x.novos>0 ? x.mkt/x.novos : 0;
    x.ltv    = x.ticket;                        // LTV ≈ valor do contrato (ticket) — contrato finito
    x.ltvCac = x.cac>0 ? x.ltv/x.cac : 0;
    // Entradas de caixa = Relatório de Entradas (só o que efetivamente entrou); geração = recebimentos − saídas
    x.entCaixa = x.recebidoCaixa;
    x.geracao  = x.recebidoCaixa - x.saiCaixa;
  });

  // OVERRIDE pelo painel do Google (SDR André): vendas, ticket, CAC, investimento, ROAS, no-show
  months.forEach(m=>{ const x=M[m]; const p=rxPainel?rxPainel[m]:null; if(!p) return;
    x.novos=p.vendas; x.ticket=p.ticket; x.cac=p.cac; x.invest=p.investimento;
    x.roas=p.roas; x.roi=p.roi; x.noshowPct=p.noshowPct;
    x.agendadas=p.agendadas; x.feitas=p.feitas; x.noshow=p.noshow; x.fatVendas=p.faturamento;
    x.painel=true; x.ltv=x.ticket; x.ltvCac=x.cac>0?x.ltv/x.cac:0; });

  // CAC (Total) por mês = (marketing + comercial do mês, vindos do Unit Economics/DRE) ÷ vendas do mês
  if(typeof window.dreUnitInputs==='function'){
    months.forEach(m=>{ const x=M[m];
      try{ const ue=window.dreUnitInputs({de:m,ate:m}); const mktCom=(ue.mktFixo||0)+(ue.comFixo||0);
        x.cacTotal = x.novos>0 ? mktCom/x.novos : 0; }catch(e){ x.cacTotal=0; }
    });
  }
  // % do faturamento de cada gasto de aquisição (gasto do mês ÷ faturamento do mês)
  months.forEach(m=>{ const x=M[m];
    x.investPct = x.faturamento>0 ? x.invest/x.faturamento*100 : 0;   // marketing ÷ faturamento (gasto total ÷ receita)
    x.cacComPct = x.ticket>0 ? x.cac/x.ticket*100 : 0;                // Paid CAC ÷ ticket médio
    x.cacTotPct = x.ticket>0 ? x.cacTotal/x.ticket*100 : 0;           // Fully-loaded CAC ÷ ticket médio
  });

  // SALDO de caixa (DFC): saldo inicial + Σ fluxo acumulado, por mês (cadeia sobre TODOS os meses do DFC)
  if(typeof lastDfc!=='undefined' && lastDfc && lastDfc.calc){
    const s0=parseFloat(localStorage.getItem('dfc_saldo_inicial_v1'))||0;
    let acc=s0; const sFim={};
    (lastDfc.meses||[]).slice().sort().forEach(mm=>{ acc += (lastDfc.calc.fluxo[mm]||0); sFim[mm]=acc; });
    let lastSaldo=s0; months.forEach(m=>{ if(sFim[m]!==undefined) lastSaldo=sFim[m]; if(M[m]) M[m].saldo=lastSaldo; });
  }

  // totais do período (fluxos somam; taxas/médias recompõem)
  const T={ faturamento:0, avista:0, recebidoCaixa:0, cashColl:0, mrrReal:0,
            atrasado:0, recebTot:0, inad:0, vencidoTot:0, dsoNum:0, dsoDen:0,
            novos:0, receitaNova:0, mkt:0, entCaixa:0, saiCaixa:0, geracao:0,
            invest:0, agendadas:0, feitas:0, noshow:0, fatVendas:0 };
  months.forEach(m=>{ const x=M[m];
    ['faturamento','avista','recebidoCaixa','cashColl','mrrReal','atrasado','recebTot','inad','vencidoTot','judic','dsoNum','dsoDen','novos','receitaNova','mkt','entCaixa','saiCaixa','geracao','invest','agendadas','feitas','noshow','fatVendas'].forEach(k=>T[k]+=x[k]); });
  T.avistaPct=T.recebidoCaixa>0?T.avista/T.recebidoCaixa*100:0;
  T.cashCollPct=T.faturamento>0?T.cashColl/T.faturamento*100:0;
  T.atrasoPct=T.recebTot>0?T.atrasado/T.recebTot*100:0;
  T.recPct=T.faturamento>0?T.mrrReal/T.faturamento*100:0;             // % recorrente do período
  T.dso=T.dsoDen>0?T.dsoNum/T.dsoDen:0;                                // prazo médio de recebimento do período
  T.saldo=M[months[months.length-1]].saldo;                           // saldo de caixa no fim da janela
  { let burn=0,n=0; months.forEach(m=>{ burn += (M[m].saiCaixa-M[m].recebidoCaixa); n++; }); const avgBurn=n?burn/n:0;
    T.avgBurn=avgBurn; T.runway = avgBurn>0 ? T.saldo/avgBurn : Infinity; }   // runway em meses (∞ se gera caixa)
  T.carteira=carteira;
  T.inadPct=T.mrrReal>0?T.inad/T.mrrReal*100:0;   // inadimplentes ÷ duplicatas (parcelado/recorrente) do período
  // comercial: usa painel quando houver (faturamento/investimento de vendas), senão cai p/ proxy do extrato
  T.ticket=T.novos>0?((T.fatVendas>0?T.fatVendas:T.receitaNova)/T.novos):0;
  T.cac=T.novos>0?((T.invest>0?T.invest:T.mkt)/T.novos):0;
  let cacTotW=0; months.forEach(m=> cacTotW += (M[m].cacTotal||0)*(M[m].novos||0));
  T.cacTotal = T.novos>0 ? cacTotW/T.novos : 0;   // CAC total do período (média ponderada por vendas)
  T.investPct=T.faturamento>0?T.invest/T.faturamento*100:0;        // marketing ÷ faturamento
  T.cacComPct=T.ticket>0?T.cac/T.ticket*100:0;                     // Paid CAC ÷ ticket médio
  T.cacTotPct=T.ticket>0?T.cacTotal/T.ticket*100:0;                // Fully-loaded CAC ÷ ticket médio
  T.roas=T.invest>0?T.fatVendas/T.invest:0;
  T.roi=T.roas>0?T.roas-1:0;
  T.noshowPct=T.agendadas>0?T.noshow/T.agendadas*100:0;
  T.ltv=T.ticket;
  T.ltvCac=T.cac>0?T.ltv/T.cac:0;

  return { months, M, T, mktFonte:mkt.fonte, aging };
}
window.rxBuild = rxBuild;   // exposto p/ o Painel Executivo (painel-executivo.html) ler headless

/* ---------- render ---------- */
let rxChart=null;
let rxLastM=null;   // último M calculado, para o drill-down de inadimplentes
let rxLastMonths=null;   // meses exibidos (p/ sparklines)
let rxLastCarteira=0;   // total da carteira a receber em aberto

/* mini-gráfico (sparkline SVG) de evolução de um % por mês */
function rxSparkSVG(vals, xs, W){
  const h=44, pad=12;
  const fin=vals.filter(v=>isFinite(v)); if(!fin.length) return '';
  let mn=Math.min(...fin), mx=Math.max(...fin); if(mn>0)mn=0; if(mx===mn)mx=mn+1;
  const Y=v=> (h-pad) - ((v-mn)/(mx-mn))*(h-2*pad);
  const pts=vals.map((v,i)=>`${xs[i].toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  let s=`<svg width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" style="display:block">`;
  // guias verticais nas colunas
  xs.forEach(x=> s+=`<line x1="${x.toFixed(1)}" y1="2" x2="${x.toFixed(1)}" y2="${h-2}" stroke="#1c2530" stroke-width="1"/>`);
  s+=`<polyline points="${pts}" fill="none" stroke="#22d3ee" stroke-width="2"/>`;
  vals.forEach((v,i)=>{ s+=`<circle cx="${xs[i].toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.8" fill="#22d3ee"/>`;
    s+=`<text x="${xs[i].toFixed(1)}" y="${(Y(v)-5).toFixed(1)}" font-size="8.5" fill="#cdd7e1" text-anchor="middle">${rxNum1(v)}</text>`; });
  return s+`</svg>`;
}
/* clique numa linha de % → abre/fecha o mini-gráfico (pontos ALINHADOS às colunas dos meses) */
function rxToggleSpark(tr){
  const key=tr.getAttribute('data-rxspark');
  const nxt=tr.nextElementSibling;
  if(nxt && nxt.classList.contains('rx-spark-row') && nxt.getAttribute('data-key')===key){ nxt.remove(); return; }
  if(!rxLastM || !rxLastMonths) return;
  const cells=tr.children, n=rxLastMonths.length;       // cells: [0]=métrica, [1..n]=meses, [n+1]=período
  const W=tr.offsetWidth, xs=[], vals=[];
  for(let i=0;i<n;i++){ const c=cells[1+i]; if(!c) break; xs.push(c.offsetLeft + c.offsetWidth/2);
    const mm=rxLastMonths[i]; vals.push(rxLastM[mm]?(rxLastM[mm][key]||0):0); }
  const svg=rxSparkSVG(vals, xs, W); if(!svg) return;
  const row=document.createElement('tr'); row.className='rx-spark-row'; row.setAttribute('data-key',key);
  row.innerHTML=`<td colspan="${n+2}" style="padding:0">${svg}</td>`;
  tr.parentNode.insertBefore(row, tr.nextSibling);
}

/* detalhe (drill-down) de inadimplentes de um mês */
function rxInadDetail(m){
  const det=document.getElementById('rxInadDet'); if(!det) return;
  if(!rxLastM || !rxLastM[m]){ det.innerHTML=''; return; }
  const x=rxLastM[m], parc=x.recebParc||[];
  const byStatus={};
  parc.forEach(p=>{ const k=p.sit||'(sem situação)'; (byStatus[k]=byStatus[k]||{n:0,orig:0,abertoT:0}); byStatus[k].n++; byStatus[k].orig+=p.original; byStatus[k].abertoT+=p.abertoT; });
  const inadList=parc.filter(p=>p.inad).sort((a,b)=>b.abertoT-a.abertoT);
  const fmtD=d=> (d&&d.toLocaleDateString)? d.toLocaleDateString('pt-BR') : '';
  let h=`<div class="card"><h3>Inadimplentes — ${rxLabel(m)} <span class="pill">contas a receber</span> <button class="btn ghost mini" style="float:right" onclick="document.getElementById('rxInadDet').innerHTML=''">✕ fechar</button></h3>`;
  h+=`<p class="hint">Inadimplentes no mês (col T): <b style="color:#ef4444">${rxFmt0(x.inad)}</b> ÷ <b>Duplicatas do mês</b> (parcelado/recorrente recebido) ${rxFmt0(x.mrrReal)} = <b>${rxPct(x.inadPct)}</b>. Judicial fora.</p>`;
  h+=`<div class="table-wrap"><table><thead><tr><th>Situação (col K)</th><th>Parcelas</th><th>Valor original (col M)</th><th>Em aberto (col T)</th></tr></thead><tbody>`;
  Object.keys(byStatus).sort().forEach(k=>{ const s=byStatus[k]; h+=`<tr><td style="text-align:left">${rxEsc(k)}</td><td>${s.n}</td><td>${rxFmt0(s.orig)}</td><td>${rxFmt0(s.abertoT)}</td></tr>`; });
  h+=`<tr class="row-total"><td style="text-align:left">Total a receber do mês</td><td>${parc.length}</td><td>${rxFmt0(x.vencidoTot)}</td><td>${rxFmt0(parc.reduce((a,p)=>a+p.abertoT,0))}</td></tr></tbody></table></div>`;
  h+=`<h4 style="margin:14px 0 6px">Parcelas inadimplentes — Atrasado/Quitado parcialmente (${inadList.length})</h4><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Vencimento</th><th>Situação</th><th>Em aberto (col T)</th></tr></thead><tbody>`;
  h+= inadList.length? inadList.map(p=>`<tr><td style="text-align:left">${rxEsc(p.cliente)}</td><td>${fmtD(p.venc)}</td><td>${rxEsc(p.sit)}</td><td>${rxFmt0(p.abertoT)}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:14px">nenhuma</td></tr>';
  h+=`<tr class="row-total"><td colspan="3" style="text-align:left">Total inadimplente</td><td>${rxFmt0(x.inad)}</td></tr></tbody></table></div></div>`;
  det.innerHTML=h; det.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function rxRender(){
  const vazio=document.getElementById('rxVazio'), cont=document.getElementById('rxConteudo');
  if(!vazio||!cont) return;
  // primeira abertura: preenche o filtro com o range padrão (últimos 3 meses) e fixa limites
  const deEl=document.getElementById('rxDe'), ateEl=document.getElementById('rxAte');
  if(deEl && ateEl){
    const all=rxAllMonths(), def=rxDefaultRange();
    const lo = all.length ? (all[0]<def.de?all[0]:def.de) : def.de;
    const hi = all.length ? (all[all.length-1]>def.ate?all[all.length-1]:def.ate) : def.ate;
    deEl.min=ateEl.min=lo; deEl.max=ateEl.max=hi;
    if(!deEl.value && !ateEl.value){ deEl.value=def.de; ateEl.value=def.ate; }
  }
  const d=rxBuild();
  if(!d){ vazio.style.display='block'; cont.style.display='none'; return; }
  vazio.style.display='none'; cont.style.display='block';
  const {months,M,T,mktFonte,aging}=d;
  const last=months[months.length-1], lm=M[last];
  const runwayTxt = T.runway===Infinity ? '▲ gera caixa' : (rxNum1(T.runway)+' m');
  const runwayRag = T.runway===Infinity ? 'good' : (T.runway>=6?'good':(T.runway>=3?'warn':'bad'));
  document.getElementById('rxStatus').textContent=`${months.length} meses · ${rxLabel(months[0])}–${rxLabel(last)} · ${rxPainelStatus||'painel não carregado'}`;

  // ----- KPIs (último mês fechado) -----
  document.getElementById('rxKpis').innerHTML=[
    {l:`Faturamento · ${rxLabel(last)}`, v:rxFmt0(lm.faturamento), c:'info'},
    {l:`Cash collection · ${rxLabel(last)}`, v:`${rxFmt0(lm.cashColl)} (${rxPct(lm.cashCollPct)})`, c:'info'},
    {l:`Duplicatas · ${rxLabel(last)}`, v:rxFmt0(lm.mrrReal), c:'info'},
    {l:'% inadimplência', v:rxPct(lm.inadPct), c:rxRagInad(lm.inadPct)},
    {l:'Vendas · mês (painel)', v:String(Math.round(lm.novos)||0), c: lm.novos>0?'good':'warn'},
    {l:'Paid CAC (mídia)', v: lm.cac? rxFmt0(lm.cac) : '—', c:'info'},
    {l:'Geração de caixa op.', v:rxFmt0(lm.geracao), c:rxRagPos(lm.geracao)},
    {l:'Saldo · runway', v:`${rxFmt0(T.saldo)} · ${runwayTxt}`, c:runwayRag},
  ].map(c=>`<div class="kpi ${c.c}"><div class="label">${c.l}</div><div class="value">${c.v}</div></div>`).join('');

  // ----- tabela (métrica × mês + acumulado) -----
  const ragCell=(txt,c)=> c? `<td class="rx-${c}">${txt}</td>` : `<td>${txt}</td>`;
  const moneyRow=(label,key,total,hint)=> `<tr><td class="rx-metric" ${hint?`title="${rxEsc(hint)}"`:''}>${label}</td>`
    + months.map(m=>`<td>${rxFmt0(M[m][key])}</td>`).join('')
    + `<td class="rx-tot">${rxFmt0(total)}</td></tr>`;

  const secRow=(label)=> `<tr class="rx-section"><td colspan="${months.length+2}">${label}</td></tr>`;
  const rows=[];
  rows.push(secRow('① RECEITA & DUPLICATAS'));
  rows.push(moneyRow('Faturamento <span class="rx-sub">(competência)</span>','faturamento',T.faturamento,'Soma do valor faturado (bruto) por mês de competência.'));
  // cash collection (valor de entrada + à vista) + % do faturamento
  rows.push(`<tr><td class="rx-metric" title="Valor de Entrada + À vista recebidos no mês (Relatório de Entradas).">Cash collection <span class="rx-sub">(entrada + à vista)</span></td>`
    + months.map(m=>`<td>${rxFmt0(M[m].cashColl)}</td>`).join('')+`<td class="rx-tot">${rxFmt0(T.cashColl)}</td></tr>`);
  rows.push(`<tr data-rxspark="cashCollPct"><td class="rx-metric rx-ind" title="Cash collection ÷ faturamento (competência): quanto do faturado virou caixa.">Cash collection % <span class="rx-sub">(do faturamento)</span></td>`
    + months.map(m=>`<td class="rx-ind">${rxPct(M[m].cashCollPct)}</td>`).join('')+`<td class="rx-tot rx-ind">${rxPct(T.cashCollPct)}</td></tr>`);
  rows.push(moneyRow('Duplicatas <span class="rx-sub">(parcelado/recorrente)</span>','mrrReal',T.mrrReal,'Duplicatas = valores de parcelas/recorrentes recebidos no mês (Relatório de Entradas), excluindo entrada e à vista. É o denominador da inadimplência.'));
  rows.push(`<tr data-rxspark="recPct"><td class="rx-metric rx-ind" title="% recorrente = Duplicatas ÷ Faturamento. Quanto da receita do mês é recorrente (vs. venda única). Quanto maior, mais previsível o negócio.">% recorrente <span class="rx-sub">(do faturamento)</span></td>`
    + months.map(m=>`<td class="rx-ind">${rxPct(M[m].recPct)}</td>`).join('')+`<td class="rx-tot rx-ind">${rxPct(T.recPct)}</td></tr>`);
  rows.push(secRow('② RECEBÍVEIS & INADIMPLÊNCIA'));
  // recebidos atrasados (Contas a Receber: baixa em mês posterior ao vencimento previsto)
  rows.push(moneyRow('Recebidos atrasados','atrasado',T.atrasado,'Contas a Receber: TODOS os recebimentos do mês cuja data prevista de vencimento era de meses anteriores (pago atrasado) — inclui judicial.'));
  rows.push(`<tr data-rxspark="atrasoPct"><td class="rx-metric rx-ind" title="Recebidos atrasados ÷ total recebido no mês (Contas a Receber).">% do recebido</td>`
    + months.map(m=>ragCell(rxPct(M[m].atrasoPct),rxRagInad(M[m].atrasoPct))).join('')
    + ragCell(rxPct(T.atrasoPct),rxRagInad(T.atrasoPct)).replace('<td','<td data-tot="1"')+`</tr>`);
  // inadimplentes do mês (Contas a Receber: vencido no mês e sem baixa)
  rows.push(`<tr><td class="rx-metric" title="Situação Atrasado/Quitado parcialmente (col K), Valor da parcela em aberto (col T), por mês de vencimento. Clique para ver as parcelas.">Inadimplentes do mês <span class="rx-sub">(clique p/ detalhar)</span></td>`
    + months.map(m=>`<td class="rx-click" data-rxinad="${m}">${rxFmt0(M[m].inad)}</td>`).join('')
    + `<td class="rx-tot">${rxFmt0(T.inad)}</td></tr>`);
  rows.push(`<tr data-rxspark="inadPct"><td class="rx-metric rx-ind" title="Inadimplentes do mês ÷ Duplicatas do mês (parcelado/recorrente recebido). No período: ${rxFmt0(T.inad)} ÷ ${rxFmt0(T.mrrReal)}.">% inadimplência (sobre duplicatas)</td>`
    + months.map(m=>ragCell(rxPct(M[m].inadPct),rxRagInad(M[m].inadPct))).join('')
    + ragCell(rxPct(T.inadPct),rxRagInad(T.inadPct)).replace('<td','<td data-tot="1"')+`</tr>`);
  rows.push(moneyRow('Parcelas judiciais <span class="rx-sub">(em aberto)</span>','judic',T.judic,'Parcelas em situação JUDICIAL, em aberto (col T), por mês de vencimento. Ficam FORA da inadimplência e da carteira do Raio-X — mostradas aqui à parte.'));
  rows.push(`<tr><td class="rx-metric rx-ind" title="DSO / prazo médio de recebimento: dias da VENDA (data de competência) até a BAIXA (pagamento), ponderado pelo valor recebido. É o ciclo completo de caixa — quanto maior, mais devagar o dinheiro entra.">DSO · prazo médio receb. <span class="rx-sub">(dias)</span></td>`
    + months.map(m=>`<td class="rx-ind">${M[m].dso? rxNum1(M[m].dso)+'d':'—'}</td>`).join('')+`<td class="rx-tot rx-ind">${T.dso? rxNum1(T.dso)+'d':'—'}</td></tr>`);
  rows.push(secRow('③ COMERCIAL & AQUISIÇÃO'));
  // comercial — do PAINEL do Google (SDR André): vendas, ticket, CAC, investimento, ROAS, no-show
  rows.push(`<tr><td class="rx-metric" title="Nº de vendas fechadas no mês (painel SDR André).">Vendas <span class="rx-sub">(novos contratos)</span></td>`
    + months.map(m=>`<td>${Math.round(M[m].novos)||0}</td>`).join('')+`<td class="rx-tot">${Math.round(T.novos)||0}</td></tr>`);
  rows.push(moneyRow('Ticket médio <span class="rx-sub">(painel)</span>','ticket',T.ticket,'Faturamento de vendas ÷ nº de vendas (painel SDR André).'));
  const subPct=(label,key,total,hint)=> `<tr data-rxspark="${key}"><td class="rx-metric rx-ind" ${hint?`title="${rxEsc(hint)}"`:''}>${label}</td>`
    + months.map(m=>`<td class="rx-ind">${rxPct(M[m][key])}</td>`).join('')+`<td class="rx-tot rx-ind">${rxPct(total)}</td></tr>`;
  rows.push(moneyRow('Investimento mkt <span class="rx-sub">(painel)</span>','invest',T.invest,'Investimento de marketing no mês (painel SDR André).'));
  rows.push(subPct('↳ % do faturamento','investPct',T.investPct,'Investimento de marketing ÷ faturamento do mês.'));
  rows.push(`<tr><td class="rx-metric" title="Paid CAC = investimento de MÍDIA PAGA ÷ vendas (painel SDR André). É o CAC só de mídia — serve para otimizar canal/campanha.">Paid CAC <span class="rx-sub">(mídia paga)</span></td>`
    + months.map(m=>`<td>${M[m].cac?rxFmt0(M[m].cac):'—'}</td>`).join('')+`<td class="rx-tot">${T.cac?rxFmt0(T.cac):'—'}</td></tr>`);
  rows.push(subPct('↳ % do ticket médio','cacComPct',T.cacComPct,'Paid CAC ÷ ticket médio — quanto do valor do contrato você gasta de mídia para adquirir.'));
  rows.push(`<tr><td class="rx-metric" title="Fully-loaded CAC = TODO o custo de aquisição (mídia + salários de marketing/comercial + comissões + ferramentas + overhead, do Unit Economics/DRE) ÷ vendas. É o CAC para unit economics e LTV:CAC.">Fully-loaded CAC <span class="rx-sub">(mkt + comercial + salários)</span></td>`
    + months.map(m=>`<td>${M[m].cacTotal?rxFmt0(M[m].cacTotal):'—'}</td>`).join('')+`<td class="rx-tot">${T.cacTotal?rxFmt0(T.cacTotal):'—'}</td></tr>`);
  rows.push(subPct('↳ % do ticket médio','cacTotPct',T.cacTotPct,'Fully-loaded CAC ÷ ticket médio — quanto do valor do contrato é consumido pelo custo total de aquisição.'));
  rows.push(`<tr><td class="rx-metric" title="ROAS = faturamento de vendas ÷ investimento (painel).">ROAS</td>`
    + months.map(m=>{ const v=M[m].roas; return v? ragCell(rxNum1(v)+'x',rxRagRoas(v)) : '<td>—</td>'; }).join('')
    + (T.roas? ragCell(rxNum1(T.roas)+'x',rxRagRoas(T.roas)).replace('<td','<td data-tot="1"') : '<td class="rx-tot">—</td>')+`</tr>`);
  rows.push(`<tr data-rxspark="noshowPct"><td class="rx-metric rx-ind" title="% das reuniões agendadas que não compareceram (painel).">% No-show</td>`
    + months.map(m=>`<td class="rx-ind">${rxPct(M[m].noshowPct)}</td>`).join('')+`<td class="rx-tot rx-ind">${rxPct(T.noshowPct)}</td></tr>`);
  rows.push(secRow('④ CAIXA'));
  rows.push(moneyRow('Entradas de caixa <span class="rx-sub">(Relatório de Entradas)</span>','entCaixa',T.entCaixa,'Total efetivamente recebido no mês, do Relatório de Entradas (= "Total (caixa)"). Só o que entrou.'));
  rows.push(moneyRow('Saídas de caixa <span class="rx-sub">(DFC)</span>','saiCaixa',T.saiCaixa,'Total de saídas de caixa no mês (DFC).'));
  // geração com cor
  rows.push(`<tr><td class="rx-metric" title="Geração = Entradas de caixa (Relatório de Entradas) − Saídas de caixa (DFC)."><b>Geração de caixa operacional</b></td>`
    + months.map(m=>ragCell('<b>'+rxFmt0(M[m].geracao)+'</b>',rxRagPos(M[m].geracao))).join('')
    + ragCell('<b>'+rxFmt0(T.geracao)+'</b>',rxRagPos(T.geracao)).replace('<td','<td data-tot="1"')+`</tr>`);
  rows.push(moneyRow('Saldo de caixa <span class="rx-sub">(fim do mês · DFC)</span>','saldo',T.saldo,'Saldo de caixa no fim do mês = saldo inicial do DFC + geração acumulada. Runway (no topo) = saldo ÷ queima média mensal.'));

  const nowYM=rxYM(new Date());   // mês atual → coluna destacada
  const head='<thead><tr><th>Métrica</th>'+months.map(m=>`<th class="${m===nowYM?'rx-now':''}">${rxLabel(m)}${m===nowYM?' •':''}</th>`).join('')+'<th class="rx-tot">Período</th></tr></thead>';
  let tableHtml=`<table class="rx-table rx-main">${head}<tbody>${rows.join('')}</tbody></table>`;
  // ----- Aging dos recebíveis em aberto (snapshot hoje) -----
  const agOrder=['A vencer','1-30','31-60','61-90','90+'];
  const agTot=agOrder.reduce((s,k)=>s+(aging[k]||0),0);
  tableHtml += `<table class="rx-table" style="margin-top:16px"><thead><tr><th>Aging dos recebíveis (hoje)</th>`
    + agOrder.map(k=>`<th>${k==='A vencer'?k:k+' d'}</th>`).join('')+`<th class="rx-tot">Total em aberto</th></tr></thead><tbody>`
    + `<tr><td class="rx-metric" title="Recebíveis em aberto por faixa de dias de atraso (col T). Mostra o perfil de risco da carteira: quanto mais à direita (90+), pior.">Em aberto</td>`
    + agOrder.map(k=>`<td>${rxFmt0(aging[k]||0)}</td>`).join('')+`<td class="rx-tot">${rxFmt0(agTot)}</td></tr>`
    + `<tr><td class="rx-metric rx-ind">% da carteira</td>`
    + agOrder.map(k=>`<td class="rx-ind">${rxPct(agTot?100*(aging[k]||0)/agTot:0)}</td>`).join('')+`<td class="rx-tot rx-ind">${agTot?'100,0%':'—'}</td></tr>`
    + `</tbody></table>`;
  document.getElementById('rxTabela').innerHTML=tableHtml;
  // destaca TODA a coluna do mês atual (só na tabela principal)
  const nowIdx=months.indexOf(nowYM);
  let nowSt=document.getElementById('rx-now-style'); if(!nowSt){ nowSt=document.createElement('style'); nowSt.id='rx-now-style'; document.head.appendChild(nowSt); }
  nowSt.textContent = nowIdx>=0
    ? `.rx-main td:nth-child(${nowIdx+2}),.rx-main th:nth-child(${nowIdx+2}){background:rgba(34,211,238,.10)!important}
       .rx-main td:nth-child(${nowIdx+2}){border-left:1px solid rgba(34,211,238,.3);border-right:1px solid rgba(34,211,238,.3)}
       .rx-main th.rx-now{color:#22d3ee;font-weight:800}`
    : '';
  rxLastM=M; rxLastMonths=months; rxLastCarteira=T.carteira;
  let det=document.getElementById('rxInadDet');
  if(!det){ det=document.createElement('div'); det.id='rxInadDet'; det.style.marginTop='12px'; const tw=document.getElementById('rxTabela'); if(tw&&tw.parentNode) tw.parentNode.appendChild(det); }

  document.getElementById('rxNotas').innerHTML=
    `<b>Janela:</b> por padrão mostra 6 meses — o <b>mês atual</b> (${rxLabel(last)}, em tempo real/parcial) + 5 meses fechados; rola sozinha a cada mês. Use o filtro <b>De/Até</b> para outro período. `
   +`<b>Como ler:</b> abra a reunião por <b>Geração de caixa operacional</b> (verde = sobra caixa) e por <b>Churn rate</b> (alvo &lt; 5% a.m.; excelente &lt; 2–3%). `
   +`<b>Paid CAC</b> = só mídia paga ÷ vendas (painel) — para otimizar canal. <b>Fully-loaded CAC</b> = todo o custo de S&M (mídia + salários de mkt/comercial + comissões + ferramentas + overhead, do <b>Unit Economics/DRE</b>) ÷ vendas — é o CAC para unit economics e LTV:CAC. `
   +`<b>Recebidos atrasados</b> (Contas a Receber) = todos os recebimentos do mês com baixa posterior à data prevista de vencimento — <b>inclui judicial</b>. <b>Inadimplentes do mês</b> = Situação <i>Atrasado</i> + <i>Quitado parcialmente</i> (col K), somando o Valor da parcela em aberto (col T); <b>% inadimplência (sobre duplicatas)</b> = inadimplentes do mês ÷ <b>duplicatas do mês</b> — judicial fora. Fonte: <i>import_visao_contas_a_receber</i>. `
   +`<b>Bloco comercial</b> (Vendas, Ticket médio, Investimento, CAC, ROAS, % No-show) vem <b>ao vivo do painel do Google</b> (DASHBOARD DE VENDAS · SDR André). `
   +`<b>Cash collection</b> = Valor de Entrada + À vista (do Relatório de Entradas); <b>Cash collection %</b> = cash collection ÷ faturamento. `
   +`<b>Duplicatas:</b> valores de parcelas/recorrentes recebidos no mês (Relatório de Entradas), <b>excluindo entrada e à vista</b>. É o denominador da inadimplência. `
   +`<b>% recorrente</b> = duplicatas ÷ faturamento (quanto da receita é recorrente). <b>DSO</b> = prazo médio de recebimento (dias da venda/competência até a baixa — ciclo completo). <b>Saldo de caixa</b> = saldo inicial do DFC + geração acumulada; <b>Runway</b> = saldo ÷ queima média (∞ se gera caixa). <b>Aging</b> = recebíveis em aberto por faixa de atraso (hoje). `
   +`Definições: <i>faturamento</i> por competência; <i>duplicatas, cash collection, atrasados, caixa</i> por regime de caixa; <i>inadimplência</i> = vencido em aberto (contas a receber) ÷ duplicatas. Passe o mouse em cada métrica para a explicação. `;

  // ----- gráfico: Duplicatas (barras) + % inadimplência (linha) -----
  const C=(typeof COL!=='undefined')?COL:{txt:'#9aa7b4',line:'#2c3744'};
  if(rxChart) rxChart.destroy();
  const ctx=document.getElementById('rxChart');
  if(ctx) rxChart=new Chart(ctx,{
    data:{ labels:months.map(rxLabel), datasets:[
      {type:'bar',label:'Duplicatas (parcelado/recorrente)',data:months.map(m=>M[m].mrrReal),backgroundColor:'#22c55e',borderRadius:3,yAxisID:'y'},
      {type:'line',label:'% inadimplência',data:months.map(m=>M[m].inadPct),borderColor:'#ef4444',backgroundColor:'#ef4444',tension:.25,yAxisID:'y1',pointRadius:3}
    ]},
    options:{ responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:C.txt,font:{size:11}}}},
      scales:{
        x:{ticks:{color:C.txt},grid:{color:C.line}},
        y:{position:'left',ticks:{color:C.txt,callback:v=>'R$ '+(v/1000)+'k'},grid:{color:C.line}},
        y1:{position:'right',ticks:{color:'#ef4444',callback:v=>v+'%'},grid:{drawOnChartArea:false}}
      }}
  });
}

/* ---------- exportação ---------- */
function rxAOA(){
  const d=rxBuild(); if(!d) return null;
  const {months,M,T}=d;
  const head=['Métrica',...months.map(rxLabel),'Período'];
  const r=(label,fn)=>[label,...months.map(m=>fn(M[m])),fn(T)];
  return [head,
    r('Faturamento (competência)',x=>Math.round(x.faturamento)),
    r('Cash collection (entrada + à vista)',x=>Math.round(x.cashColl)),
    r('Cash collection % (do faturamento)',x=>+x.cashCollPct.toFixed(1)),
    r('Duplicatas (parcelado/recorrente)',x=>Math.round(x.mrrReal)),
    r('% recorrente (do faturamento)',x=>+x.recPct.toFixed(1)),
    r('Recebidos atrasados',x=>Math.round(x.atrasado)),
    r('Atrasados % do recebido',x=>+x.atrasoPct.toFixed(1)),
    r('Inadimplentes do mês',x=>Math.round(x.inad)),
    r('Inadimplência % (sobre duplicatas)',x=>+x.inadPct.toFixed(1)),
    r('Parcelas judiciais (em aberto)',x=>Math.round(x.judic||0)),
    r('DSO / prazo médio receb. (dias)',x=>+(x.dso||0).toFixed(1)),
    r('Vendas (painel)',x=>Math.round(x.novos)),
    r('Ticket médio (painel)',x=>Math.round(x.ticket)),
    r('Investimento mkt (painel)',x=>Math.round(x.invest)),
    r('  Investimento mkt % do faturamento',x=>+x.investPct.toFixed(1)),
    r('Paid CAC (mídia)',x=>Math.round(x.cac)),
    r('  Paid CAC % do ticket médio',x=>+x.cacComPct.toFixed(1)),
    r('Fully-loaded CAC (mkt+comercial)',x=>Math.round(x.cacTotal||0)),
    r('  Fully-loaded CAC % do ticket médio',x=>+x.cacTotPct.toFixed(1)),
    r('ROAS',x=>+(x.roas||0).toFixed(2)),
    r('% No-show',x=>+(x.noshowPct||0).toFixed(1)),
    r('Entradas de caixa (Relatório de Entradas)',x=>Math.round(x.entCaixa)),
    r('Saídas de caixa (DFC)',x=>Math.round(x.saiCaixa)),
    r('Geração de caixa operacional',x=>Math.round(x.geracao)),
    r('Saldo de caixa (fim do mês)',x=>Math.round(x.saldo||0)),
  ];
}
function rxExportXls(){
  const aoa=rxAOA(); if(!aoa){ alert('Sem dados para exportar.'); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Raio-X Performance');
  XLSX.writeFile(wb,'raio-x-performance.xlsx');
}
function rxExportPdf(){
  const d=rxBuild(); const aoa=rxAOA();
  if(!d||!aoa){ alert('Sem dados para exportar.'); return; }
  const { jsPDF }=window.jspdf;
  const doc=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
  // paleta = tema escuro do HTML
  const BG=[7,9,12], PANEL=[18,22,28], PANEL2=[13,16,21], HEAD=[26,33,41], LINE=[44,55,68],
        TXT=[230,237,243], MUTE=[154,167,180], GOLD=[220,171,91], SECT=[40,33,17],
        NOWBG=[11,40,46], NOWHEAD=[18,72,82], NOWTXT=[150,230,240], GREEN=[34,197,94], RED=[239,68,68];
  doc.setFillColor.apply(doc,BG); doc.rect(0,0,W,H,'F');                 // fundo escuro (página toda)
  const months=d.months, nowYM=rxYM(new Date());
  const nowCol = months.indexOf(nowYM)>=0 ? months.indexOf(nowYM)+1 : -1;   // col 0 = métrica
  doc.setFontSize(16); doc.setTextColor.apply(doc,GOLD); doc.setFont(undefined,'bold');
  doc.text('Raio-X de Performance', 40, 38); doc.setFont(undefined,'normal');
  doc.setFontSize(9); doc.setTextColor.apply(doc,MUTE);
  doc.text(`${rxLabel(months[0])}–${rxLabel(months[months.length-1])}   ·   runway ${d.T.runway===Infinity?'(gera caixa)':rxNum1(d.T.runway)+'m'}   ·   inadimplência ${rxPct(d.T.inadPct)}   ·   Mentat FP&A`, 40, 54);
  const money=new Set([1,2,4,6,8,10,13,14,16,18,22,23,24,25]);
  const numCols=aoa[0].length;
  const secAt={'Faturamento (competência)':'BLOCO 1   ·   RECEITA & DUPLICATAS','Recebidos atrasados':'BLOCO 2   ·   RECEBÍVEIS & INADIMPLÊNCIA','Vendas (painel)':'BLOCO 3   ·   COMERCIAL & AQUISIÇÃO','Entradas de caixa (Relatório de Entradas)':'BLOCO 4   ·   CAIXA'};
  // monta o corpo COM linhas de bloco e ESPAÇADOR entre eles (separação clara)
  const body=[]; let firstSec=true;
  aoa.slice(1).forEach((row,i)=>{
    const label=row[0];
    if(secAt[label]){
      if(!firstSec) body.push([{content:'', colSpan:numCols, styles:{fillColor:BG, lineWidth:0, minCellHeight:6, cellPadding:0, fontSize:1}}]);   // espaçador entre blocos
      body.push([{content:secAt[label], colSpan:numCols, styles:{fillColor:SECT,textColor:GOLD,fontStyle:'bold',halign:'left',fontSize:8,cellPadding:{top:3,bottom:3,left:8,right:8},lineColor:GOLD,lineWidth:0.7}}]);
      firstSec=false;
    }
    body.push(row.map((c,j)=> j===0? c : (money.has(i+1)? rxFmt0(c) : (typeof c==='number'? c.toLocaleString('pt-BR') : c)) ));
  });
  doc.autoTable({
    startY:60, theme:'grid', head:[aoa[0]], body, rowPageBreak:'avoid',
    tableWidth: W-72,
    styles:{fontSize:6.6,cellPadding:{top:1.6,bottom:1.6,left:4,right:4},lineColor:LINE,lineWidth:0.35,textColor:TXT,fillColor:PANEL},
    headStyles:{fillColor:HEAD,textColor:MUTE,fontStyle:'bold',halign:'right',lineColor:LINE,fontSize:6.6,cellPadding:{top:3,bottom:3,left:4,right:4}},
    bodyStyles:{halign:'right'},
    alternateRowStyles:{fillColor:PANEL2},
    columnStyles:{0:{cellWidth:158,halign:'left',fontStyle:'bold',textColor:TXT}},
    margin:{left:36,right:36},
    didParseCell:(data)=>{
      const isSec = data.row.raw && data.row.raw[0] && typeof data.row.raw[0]==='object';
      // coluna do mês atual: destaca a coluna inteira
      if(nowCol>=0 && data.column.index===nowCol && !isSec){
        if(data.section==='head'){ data.cell.styles.fillColor=NOWHEAD; data.cell.styles.textColor=NOWTXT; }
        else { data.cell.styles.fillColor=NOWBG; }
        data.cell.styles.fontStyle='bold';
      }
      // RAG por sinal: Geração de caixa e Saldo de caixa (verde/vermelho)
      if(data.section==='body' && !isSec && data.column.index>0){
        const lbl = (data.row.raw && typeof data.row.raw[0]==='string') ? data.row.raw[0] : '';
        if(lbl.indexOf('Geração de caixa')>=0 || lbl.indexOf('Saldo de caixa')>=0){
          data.cell.styles.textColor = String(data.cell.raw||'').indexOf('-')>=0 ? RED : GREEN;
          data.cell.styles.fontStyle='bold';
        }
      }
    },
    didDrawPage:()=>{ doc.setFontSize(7); doc.setTextColor.apply(doc,MUTE); doc.text('Mentat FP&A · Raio-X de Performance', 40, H-14); }
  });
  doc.save('raio-x-performance.pdf');
}

/* ---------- bind ---------- */
function rxBind(){
  const tab=document.querySelector('[data-tab="raiox"]');
  if(tab) tab.addEventListener('click', ()=>{ try{ rxRender(); }catch(e){ console.error('Raio-X falhou:',e); } try{ rxFetchPainel(); }catch(e){} });
  const mkt=document.getElementById('rxMkt'); if(mkt) mkt.addEventListener('change', ()=>{ try{ rxRender(); }catch(e){} });
  const tbl=document.getElementById('rxTabela'); if(tbl) tbl.addEventListener('click', e=>{
    const td=e.target.closest('[data-rxinad]'); if(td){ try{ rxInadDetail(td.getAttribute('data-rxinad')); }catch(err){ console.error(err); } return; }
    const tr=e.target.closest('tr[data-rxspark]'); if(tr){ try{ rxToggleSpark(tr); }catch(err){ console.error(err); } } });
  const de=document.getElementById('rxDe'); if(de) de.addEventListener('change', ()=>{ try{ rxRender(); }catch(e){} });
  const ate=document.getElementById('rxAte'); if(ate) ate.addEventListener('change', ()=>{ try{ rxRender(); }catch(e){} });
  const rst=document.getElementById('rxReset'); if(rst) rst.onclick=()=>{ const r=rxDefaultRange(); const a=document.getElementById('rxDe'),b=document.getElementById('rxAte'); if(r&&a&&b){ a.value=r.de; b.value=r.ate; } else { if(a)a.value=''; if(b)b.value=''; } try{ rxRender(); }catch(e){} };
  const p=document.getElementById('rxPdf'); if(p) p.onclick=rxExportPdf;
  const x=document.getElementById('rxXls'); if(x) x.onclick=rxExportXls;
  rxFetchPainel();   // carrega o painel comercial do Google ao iniciar
}
rxBind();
