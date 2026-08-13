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
const RX_PAINEL_URL='https://script.google.com/macros/s/AKfycbxZKU9xdsJ-VCvEPw0UGypHYxFYfwEEApHsMNRE9IG9jarR4wz2rHek6rXLwglixvCf/exec?token=evolving2025';
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
    // Fonte NOVA: endpoint /exec (Meta gasto + Pipe funil), JSON. Só alimenta agendadas/feitas/no-show/investimento
    // do bloco comercial — vendas/ticket/faturamento continuam vindo da planilha comercial (override final, linha ~276).
    const j=await r.json();
    if(!j || !j.ok || !Array.isArray(j.rows)) throw new Error('endpoint sem rows');
    const out={};
    j.rows.forEach(row=>{
      const ym=String(row.ym||''); if(!/^\d{4}-\d{2}$/.test(ym)) return;
      const agend=+row.agend||0, feitas=+row.reun||0, noshow=+row.noshow||0,
            vendas=+row.vendas||0, ticket=+row.ticket||0, invest=+row.investido||0;
      const fat=vendas*ticket;
      out[ym]={ agendadas:agend, feitas:feitas, noshow:noshow,
        noshowPct: agend>0 ? noshow/agend*100 : 0,
        vendas:vendas, faturamento:fat, ticket:ticket,
        roas: invest>0 ? fat/invest : 0, roi:0,
        cac: vendas>0 ? invest/vendas : 0, investimento:invest, cacTotal:0 };
    });
    rxPainel=out; rxPainelStatus='● painel ao vivo (Meta+Pipe)';
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
    atrasado:0, recebTot:0, inad:0, vencidoTot:0, judic:0, recebParc:[], prazoNeg:0, prazoEf:0, prazoHoriz:0, arrasto:0, pnNum:0, pnDen:0, peNum:0, peDen:0, hnNum:0, hnDen:0, nParc:0, saldo:0,
    novos:0, receitaNova:0, ativosRec:new Set(), safraOrig:0, safraReceb:0,
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
  // ENTRADA Assiny REMOVIDA (decisão do usuário 2026-08-03): não conta mais a transferência ASSINY → ASAAS como caixa.
  // (o DFC também parou de contar — as duas telas seguem ALINHADAS na Geração de caixa.)

  // FATURAMENTO = planilha de GESTÃO de contratos (Valor Contrato por Data de Venda), via commReceitaByMes()
  // — a MESMA planilha publicada que a aba Comissões lê (docs.google .../1CEiNzMp...). Decisão do usuário 2026-08-03.
  if(typeof window.commEnsureLoaded==='function'){ try{ window.commEnsureLoaded(); }catch(e){} }   // garante a planilha de contratos carregada mesmo sem abrir a aba Comissões
  // 1º) fallback: extrato por competência (fatByMes) enquanto a planilha de contratos não carregou.
  if(typeof fatByMes!=='undefined' && fatByMes) months.forEach(m=>{ if(M[m]) M[m].faturamento = fatByMes[m]||0; });
  // 2º) fonte primária: contratos vendidos (Valor Contrato) por Data de Venda. Cash collection = Vlr Entrada da MESMA planilha (entrada ÷ contrato).
  if(typeof window.commReceitaByMes==='function'){ const _cr=window.commReceitaByMes(); const _rv=_cr.venda||{}, _ve=_cr.vlrEntradaVenda||{};
    if(Object.keys(_rv).length) months.forEach(m=>{ if(M[m]){ M[m].faturamento = _rv[m]||0; M[m].cashColl = _ve[m]||0; } }); }

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
  const cHoriz={};   // horizonte por CONTRATO (safra): key mês|cliente|dataVenda -> {mc, maxTerm, val}; competência = data da venda (verificado: 97% constante por contrato)
  rr.forEach(r=>{
    // RECEBIDOS ATRASADOS: recuperações pagas com 20 DIAS OU MAIS de atraso, contado por DIAS (pagamento − vencimento), NÃO por mês. INCLUI judicial.
    if(r.pagto && r.recebido>0){
      const mp=ymOf(r.pagto);
      if(M[mp]){
        M[mp].recebTot += r.recebido;                                  // total recebido no mês (denominador do %)
        if(r.venc && (r.pagto-r.venc)/86400000 >= 20) M[mp].atrasado += r.recebido;   // pago 20 dias ou mais após o vencimento (por DIAS, não por mês)
      }
    }
    // CASH COLLECTION POR SAFRA: contratos vendidos no mês (competência=venda) → recebido ÷ valor contratado, MESMA fonte (Contas a Receber). Inclui judicial (foi contratado). Sempre ≤100%.
    // JUDICIAL: capturado em linha separada (em aberto, col T, por mês de vencimento) e segue FORA de carteira/inadimplentes/aging
    if(r.judicial){ if(r.venc && r.abertoT>0){ const mv=ymOf(r.venc); if(M[mv]) M[mv].judic += r.abertoT; } return; }
    if(r.abertoT>0) carteira += r.abertoT;   // soma toda a carteira a receber (a vencer + vencida)
    // PRAZOS DE RECEBIMENTO (parcelas negociadas; judicial já saiu acima). Exclui entrada/à vista (venc≈comp).
    // Agrega por mês da VENDA (competência), ponderado pelo valor original da parcela (col M).
    if(r.comp && r.venc){
      const tn=(r.venc-r.comp)/86400000;                                   // prazo NEGOCIADO: venda→vencimento
      if(tn>=7){                                                           // ignora entrada/à vista (imediato/quase-à-vista <7d)
        const mc=ymOf(r.comp), w=r.original||0;
        if(M[mc] && w>0){
          let te;                                                          // prazo EFETIVO
          if((r.abertoT||0)<=0.005) te=((r.pagto||r.venc)-r.comp)/86400000;       // quitada: venda→baixa
          else te=((hoje>r.venc?hoje:r.venc)-r.comp)/86400000;                    // aberta: venda→(hoje se vencida, senão vencimento)
          if(te<0) te=0;
          M[mc].pnNum+=tn*w; M[mc].pnDen+=w; M[mc].peNum+=te*w; M[mc].peDen+=w; M[mc].nParc++;
          // HORIZONTE por contrato/safra: maior prazo (última parcela), ponderado pelo valor do contrato
          const ck=mc+'|'+(r.cliente||'')+'|'+r.comp.getTime();
          const e=cHoriz[ck]||(cHoriz[ck]={mc, maxTerm:0, val:0});
          if(tn>e.maxTerm) e.maxTerm=tn; e.val+=w;
        }
      }
    }
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
  // HORIZONTE por safra: última parcela de cada contrato, ponderada pelo valor do contrato → média por mês de venda
  Object.values(cHoriz).forEach(e=>{ if(M[e.mc] && e.val>0){ M[e.mc].hnNum+=e.maxTerm*e.val; M[e.mc].hnDen+=e.val; } });

  // MRR por COMPETÊNCIA: vem das parcelas que vencem no mês (contas a receber, vencGlobal acima).

  // derivadas por mês
  months.forEach(m=>{
    const x=M[m];
    x.ativos = x.ativosRec.size;
    x.mrrReal = x.dup;                          // Duplicatas = parcelado/recorrente recebido no mês (sem entrada/à vista)
    x.avistaPct = x.recebidoCaixa>0 ? x.avista/x.recebidoCaixa*100 : 0;
    x.cashCollPct = x.faturamento>0 ? x.cashColl/x.faturamento*100 : 0;   // Cash collection % = Vlr Entrada ÷ Valor Contrato (mesma planilha, por Data de Venda) — ≤100%
    x.atrasoPct = x.recebTot>0 ? x.atrasado/x.recebTot*100 : 0;          // % do recebido (contas a receber)
    x.inadPct   = x.vencidoTot>0 ? x.inad/x.vencidoTot*100 : 0;           // inadimplentes (em aberto) ÷ total que venceu no mês (valor original) — judicial fora, sempre 0–100%
    x.recPct    = x.faturamento>0 ? x.mrrReal/x.faturamento*100 : 0;     // % recorrente = duplicatas ÷ faturamento
    x.prazoNeg   = x.pnDen>0 ? x.pnNum/x.pnDen : 0;                       // prazo negociado MÉDIO (WAM): venda→vencimento ponderado
    x.prazoHoriz = x.hnDen>0 ? x.hnNum/x.hnDen : 0;                       // horizonte: última parcela por contrato, ponderado
    x.prazoEf    = x.peDen>0 ? x.peNum/x.peDen : 0;                       // prazo efetivo (WACD): venda→baixa, ou até hoje se em aberto
    x.arrasto    = (x.prazoNeg>0 && x.prazoEf>0) ? x.prazoEf - x.prazoNeg : 0;   // arrasto ≈ atraso médio (efetivo − negociado)
    x.ticket = x.novos>0 ? x.receitaNova/x.novos : 0;
    x.cac    = x.novos>0 ? x.mkt/x.novos : 0;
    x.ltv    = x.ticket;                        // LTV ≈ valor do contrato (ticket) — contrato finito
    x.ltvCac = x.cac>0 ? x.ltv/x.cac : 0;
    // Entradas de caixa = Relatório de Entradas (só o que efetivamente entrou); geração = recebimentos − saídas
    x.entCaixa = x.recebidoCaixa;
    x.geracao  = x.recebidoCaixa - x.saiCaixa;
  });

  // OVERRIDE comercial: FONTE = PIPE (funnel-live: window.MKT_PAINEL, inclui o mês corrente). Fallback = planilha do André (rxPainel).
  const rxComm = m => {
    const pp = (typeof window!=='undefined' && window.MKT_PAINEL) ? window.MKT_PAINEL[m] : null;
    if(pp) return { agendadas:pp.agend||0, feitas:pp.reun||0, noshow:pp.noshow||0,
      noshowPct: (pp.agend>0 ? (pp.noshow||0)/pp.agend*100 : 0),
      invest:pp.investido||0, vendas:pp.vendas||0, ticket:pp.ticket||0,
      faturamento:(pp.vendas||0)*(pp.ticket||0), roas:0, roi:0, cac:0, fonte:'pipe' };
    const p = (typeof rxPainel!=='undefined' && rxPainel) ? rxPainel[m] : null;
    if(p) return { agendadas:p.agendadas||0, feitas:p.feitas||0, noshow:p.noshow||0, noshowPct:p.noshowPct||0,
      invest:p.investimento||0, vendas:p.vendas||0, ticket:p.ticket||0, faturamento:p.faturamento||0,
      roas:p.roas||0, roi:p.roi||0, cac:p.cac||0, fonte:'sdr' };
    return null;
  };
  months.forEach(m=>{ const x=M[m]; const p=rxComm(m); if(!p) return;
    x.novos=p.vendas; x.ticket=p.ticket; x.cac=p.cac; x.invest=p.invest;
    x.roas=p.roas; x.roi=p.roi; x.noshowPct=p.noshowPct;
    x.agendadas=p.agendadas; x.feitas=p.feitas; x.noshow=p.noshow; x.fatVendas=p.faturamento;
    x.painelFonte=p.fonte; x.painel=true; x.ltv=x.ticket; x.ltvCac=x.cac>0?x.ltv/x.cac:0; });

  // OVERRIDE FINAL (vence o painel): VENDAS e TICKET vêm da PLANILHA COMERCIAL — mesma fonte do faturamento.
  // vendas = nº de contratos com Data de Venda no mês; ticket = faturamento ÷ vendas (numerador e denominador
  // na mesma base); Paid CAC = investimento (painel) ÷ vendas. Só sobrescreve quando a planilha já carregou.
  if(typeof window.commReceitaByMes==='function'){
    const _rc=window.commReceitaByMes();
    if(_rc && _rc.nVenda && Object.keys(_rc.nVenda).length) months.forEach(m=>{ const x=M[m]; if(!x) return;
      x.novos     = _rc.nVenda[m]||0;
      x.fatVendas = x.faturamento;                          // mantém os TOTAIS (ticket/ROAS) na mesma base
      x.ticket    = x.novos>0 ? x.faturamento/x.novos : 0;
      x.cac       = x.novos>0 ? (x.invest||0)/x.novos : 0;  // Paid CAC = mídia paga (painel) ÷ vendas (planilha)
      x.roas      = x.invest>0 ? x.faturamento/x.invest : 0;
      x.ltv       = x.ticket; x.ltvCac = x.cac>0 ? x.ltv/x.cac : 0;
    });
  }
  // FUNIL comercial: Show Rate = feitas ÷ RESOLVIDAS (feitas + no-show) — pendentes NÃO entram no show (ainda não aconteceram).
  // Agendamentos segue mostrando TODAS as agendadas. Conversão do closer = vendas ÷ feitas.
  months.forEach(m=>{ const x=M[m]; const resolv=(x.feitas||0)+(x.noshow||0);
    x.showRate   = resolv>0 ? x.feitas/resolv*100 : 0;
    x.noshowPct  = resolv>0 ? x.noshow/resolv*100 : 0;   // complemento das resolvidas → show + no-show = 100%
    x.convCloser = x.feitas>0 ? x.novos/x.feitas*100 : 0;
  });

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

  // SALDO de caixa por mês = FONTE ÚNICA do DFC (window.dfcSaldoByMonth: âncora 152.117,80 + fluxo).
  // Antes usava 'dfc_saldo_inicial_v1' (chave que NUNCA é gravada = 0) e somava desde o 1º mês → saldo/runway
  // divergiam do DFC/Painel. Agora o Raio-X mostra exatamente o mesmo saldo das outras telas.
  if(typeof window.dfcSaldoByMonth==='function'){
    const sFim=window.dfcSaldoByMonth()||{};
    const cx=(typeof window.caixaHoje==='function')?window.caixaHoje():null;
    let lastSaldo=(cx&&isFinite(cx.saldoIni))?cx.saldoIni:0;
    months.forEach(m=>{ if(sFim[m]!==undefined) lastSaldo=sFim[m]; if(M[m]) M[m].saldo=lastSaldo; });
  }

  // totais do período (fluxos somam; taxas/médias recompõem)
  const T={ faturamento:0, avista:0, recebidoCaixa:0, cashColl:0, safraOrig:0, safraReceb:0, mrrReal:0,
            atrasado:0, recebTot:0, inad:0, vencidoTot:0, pnNum:0, pnDen:0, peNum:0, peDen:0, hnNum:0, hnDen:0, nParc:0,
            novos:0, receitaNova:0, mkt:0, entCaixa:0, saiCaixa:0, geracao:0,
            invest:0, agendadas:0, feitas:0, noshow:0, fatVendas:0 };
  months.forEach(m=>{ const x=M[m];
    ['faturamento','avista','recebidoCaixa','cashColl','safraOrig','safraReceb','mrrReal','atrasado','recebTot','inad','vencidoTot','judic','pnNum','pnDen','peNum','peDen','hnNum','hnDen','nParc','novos','receitaNova','mkt','entCaixa','saiCaixa','geracao','invest','agendadas','feitas','noshow','fatVendas'].forEach(k=>T[k]+=x[k]); });
  T.avistaPct=T.recebidoCaixa>0?T.avista/T.recebidoCaixa*100:0;
  T.cashCollPct=T.faturamento>0?T.cashColl/T.faturamento*100:0;   // cash collection do período = Σ Vlr Entrada ÷ Σ Valor Contrato (planilha)
  T.atrasoPct=T.recebTot>0?T.atrasado/T.recebTot*100:0;
  T.recPct=T.faturamento>0?T.mrrReal/T.faturamento*100:0;             // % recorrente do período
  T.prazoNeg=T.pnDen>0?T.pnNum/T.pnDen:0; T.prazoEf=T.peDen>0?T.peNum/T.peDen:0;   // prazos médios do período
  T.prazoHoriz=T.hnDen>0?T.hnNum/T.hnDen:0;
  T.arrasto=(T.prazoNeg>0&&T.prazoEf>0)?T.prazoEf-T.prazoNeg:0;
  T.saldo=M[months[months.length-1]].saldo;                           // saldo de caixa no fim da janela
  { let burn=0,n=0; months.forEach(m=>{ burn += (M[m].saiCaixa-M[m].recebidoCaixa); n++; }); const avgBurn=n?burn/n:0;
    T.avgBurn=avgBurn; T.runway = avgBurn>0 ? T.saldo/avgBurn : Infinity; }   // runway em meses (∞ se gera caixa)
  T.carteira=carteira;
  T.inadPct=T.vencidoTot>0?T.inad/T.vencidoTot*100:0;   // inadimplentes ÷ total que venceu no período
  // comercial: usa painel quando houver (faturamento/investimento de vendas), senão cai p/ proxy do extrato
  T.ticket=T.novos>0?((T.fatVendas>0?T.fatVendas:T.receitaNova)/T.novos):0;
  T.cac=T.novos>0?((T.invest>0?T.invest:T.mkt)/T.novos):0;
  let cacTotW=0; months.forEach(m=> cacTotW += (M[m].cacTotal||0)*(M[m].novos||0));
  T.cacTotal = T.novos>0 ? cacTotW/T.novos : 0;   // CAC total do período (média ponderada por vendas)
  T.investPct=T.faturamento>0?T.invest/T.faturamento*100:0;        // marketing ÷ faturamento
  T.cacComPct=T.ticket>0?T.cac/T.ticket*100:0;                     // Paid CAC ÷ ticket médio
  T.cacTotPct=T.ticket>0?T.cacTotal/T.ticket*100:0;                // Fully-loaded CAC ÷ ticket médio
  { let _fvI=0; months.forEach(m=>{ if((M[m].invest||0)>0) _fvI+=(M[m].fatVendas||0); }); T.roas=T.invest>0?_fvI/T.invest:0; }   // ROAS Período: só faturamento de meses COM investimento (senão infla vs colunas)
  T.roi=T.roas>0?T.roas-1:0;
  // MESES ATÍPICOS (SKIP_YM do funnel-live, ex.: jun/26 SDR saiu) SAEM do Período do FUNIL — distorcem a média. As colunas mensais seguem exibindo.
  { const _sk=(typeof window!=='undefined' && window.MKT_SKIP)?window.MKT_SKIP:[]; let _nf=T.novos;
    if(_sk.length){ let aA=0,aF=0,aN=0,aV=0; months.forEach(m=>{ if(_sk.indexOf(m)>=0) return; aA+=M[m].agendadas||0; aF+=M[m].feitas||0; aN+=M[m].noshow||0; aV+=M[m].novos||0; });
      T.agendadas=aA; T.feitas=aF; T.noshow=aN; _nf=aV; }
    T._novosFunnel=_nf; }
  { const _res=(T.feitas||0)+(T.noshow||0);                        // funil período: sobre resolvidas (feitas + no-show), pendentes e atípicos fora
    T.showRate = _res>0 ? T.feitas/_res*100 : 0;
    T.noshowPct= _res>0 ? T.noshow/_res*100 : 0; }
  T.convCloser=T.feitas>0?T._novosFunnel/T.feitas*100:0;           // funil: conversão do closer do período (atípicos fora)
  T.ltv=T.ticket;
  T.ltvCac=T.cac>0?T.ltv/T.cac:0;

  // ---- PREVISÕES do mês corrente (dos modelos do app: DRE, Modelagem de Caixa, Rolling 13 semanas) ----
  const _fc={ fcFat:null, fcEnt:null, fcGer:null, fcCaixaMes:null, fcCaixa13:null };
  const _nowYM=rxYM(new Date());
  try{ const rev=(typeof window.dreRevenueByMonth==='function')?window.dreRevenueByMonth():null;
    if(rev&&rev.byMonth&&rev.byMonth[_nowYM]) _fc.fcFat=rev.byMonth[_nowYM].p50; }catch(e){}
  try{ const pj=(typeof window.modProjCashByMonth==='function')?window.modProjCashByMonth('Realista'):null;
    if(pj&&pj[_nowYM]){ _fc.fcEnt=pj[_nowYM].receita; _fc.fcGer=(pj[_nowYM].receita||0)-(pj[_nowYM].despesa||0); } }catch(e){}
  try{ var _cxRoll=(typeof window.caixaHoje==='function')?window.caixaHoje():null;   // FONTE ÚNICA: parte do MESMO caixa de hoje que o Painel usa (não do override do Rolling)
    var _s0Roll=(_cxRoll&&isFinite(_cxRoll.saldoHoje))?_cxRoll.saldoHoje:null;
    const S=(typeof window.rollSeries==='function')?window.rollSeries(_s0Roll):null;
    if(S){ _fc.fcCaixa13=S.saldoFim;                                   // saldo projetado ao fim das 13 semanas
      const _ld=new Date(new Date().getFullYear(), new Date().getMonth()+1, 0);   // último dia do mês corrente
      let _best=null; (S.weeks||[]).forEach(w=>{ if(w.ws<=_ld && (!_best||w.ws>_best.ws)) _best=w; });
      if(_best) _fc.fcCaixaMes=S.sFim[_best.key];                      // saldo da semana que fecha o mês
    } }catch(e){}
  if(M[_nowYM]) Object.assign(M[_nowYM], _fc);   Object.assign(T, _fc);   // no mês corrente + no total (Período)

  return { months, M, T, mktFonte:mkt.fonte, aging };
}
window.rxBuild = rxBuild;   // exposto p/ o Painel Executivo (painel-executivo.html) ler headless

/* ---------- render ---------- */
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
  h+=`<p class="hint">Inadimplentes no mês (col T): <b style="color:#ef4444">${rxFmt0(x.inad)}</b> ÷ <b>Total que venceu no mês</b> (valor original das parcelas) ${rxFmt0(x.vencidoTot)} = <b>${rxPct(x.inadPct)}</b>. Judicial fora.</p>`;
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

  // ----- KPIs do topo: removidos a pedido (só a tabela) -----
  { const _k=document.getElementById('rxKpis'); if(_k){ _k.innerHTML=''; _k.style.display='none'; } }

  // ----- tabela (métrica × mês + acumulado) -----
  const ragCell=(txt,c)=> c? `<td class="rx-${c}">${txt}</td>` : `<td>${txt}</td>`;
  const moneyRow=(label,key,total,hint)=> `<tr><td class="rx-metric" ${hint?`title="${rxEsc(hint)}"`:''}>${label}</td>`
    + months.map(m=>`<td>${rxFmt0(M[m][key])}</td>`).join('')
    + `<td class="rx-tot">${rxFmt0(total)}</td></tr>`;

  const secRow=(label)=> `<tr class="rx-section"><td colspan="${months.length+2}">${label}</td></tr>`;
  const rows=[];
  rows.push(secRow('① RECEITA & DUPLICATAS'));
  rows.push(moneyRow('Faturamento <span class="rx-sub">(competência)</span>','faturamento',T.faturamento,'Valor do Contrato dos contratos fechados no mês (Data de Venda) — fonte: planilha de comissões (ao vivo). Fallback: entradas por competência do extrato enquanto a planilha comercial não carrega.'));
  // cash collection POR SAFRA: recebido ÷ contratado dos contratos vendidos no mês
  rows.push(`<tr><td class="rx-metric" title="Vlr Entrada (à vista/sinal) recebido na assinatura dos contratos vendidos no mês — da planilha de vendas, por Data de Venda. Mesma fonte do Faturamento.">Cash collection <span class="rx-sub">(entrada da venda)</span></td>`
    + months.map(m=>`<td>${rxFmt0(M[m].cashColl)}</td>`).join('')+`<td class="rx-tot">${rxFmt0(T.cashColl)}</td></tr>`);
  rows.push(`<tr data-rxspark="cashCollPct"><td class="rx-metric rx-ind" title="Cash collection % = Vlr Entrada ÷ Valor do Contrato dos contratos vendidos no mês — AMBOS da planilha de vendas (por Data de Venda). Sempre ≤ 100%. É quanto do faturado já entrou de caixa na assinatura (entrada/à vista); as parcelas seguintes não entram aqui.">Cash collection % <span class="rx-sub">(entrada ÷ contrato)</span></td>`
    + months.map(m=>`<td class="rx-ind">${M[m].faturamento>0? rxPct(M[m].cashCollPct):'—'}</td>`).join('')+`<td class="rx-tot rx-ind">${T.faturamento>0? rxPct(T.cashCollPct):'—'}</td></tr>`);
  rows.push(moneyRow('Duplicatas <span class="rx-sub">(parcelado/recorrente)</span>','mrrReal',T.mrrReal,'Duplicatas = valores de parcelas/recorrentes recebidos no mês (Relatório de Entradas), excluindo entrada e à vista.'));
  rows.push(secRow('② COMERCIAL & AQUISIÇÃO'));
  // FUNIL comercial (topo = PIPE/CRM via funnel-live; fundo = planilha comercial): agendamento → show → conversão → ticket → vendas → receita
  rows.push(`<tr><td class="rx-metric" title="Reuniões AGENDADAS no mês — direto do Pipe (CRM), via conectores. Topo do funil.">Agendamentos</td>`
    + months.map(m=>`<td>${M[m].agendadas?Math.round(M[m].agendadas):'—'}</td>`).join('')+`<td class="rx-tot">${T.agendadas?Math.round(T.agendadas):'—'}</td></tr>`);
  rows.push(`<tr data-rxspark="showRate"><td class="rx-metric rx-ind" title="Show Rate = reuniões FEITAS ÷ RESOLVIDAS (feitas + no-show), do Pipe/CRM. As reuniões PENDENTES (ainda não aconteceram) NÃO entram — por isso o mês corrente não é diluído. % dos que compareceram, entre os que já tiveram a reunião.">Show Rate <span class="rx-sub">(feitas ÷ resolvidas)</span></td>`
    + months.map(m=>`<td class="rx-ind">${((M[m].feitas||0)+(M[m].noshow||0))>0? rxPct(M[m].showRate):'—'}</td>`).join('')+`<td class="rx-tot rx-ind">${((T.feitas||0)+(T.noshow||0))>0? rxPct(T.showRate):'—'}</td></tr>`);
  rows.push(`<tr data-rxspark="noshowPct"><td class="rx-metric rx-ind" title="% das reuniões RESOLVIDAS que NÃO compareceram = no-show ÷ (feitas + no-show), do Pipe/CRM. Pendentes fora. É o complemento do Show Rate — show + no-show = 100%.">% No-show <span class="rx-sub">(não compareceram)</span></td>`
    + months.map(m=>`<td class="rx-ind">${((M[m].feitas||0)+(M[m].noshow||0))>0? rxPct(M[m].noshowPct):'—'}</td>`).join('')+`<td class="rx-tot rx-ind">${((T.feitas||0)+(T.noshow||0))>0? rxPct(T.noshowPct):'—'}</td></tr>`);
  rows.push(`<tr data-rxspark="convCloser"><td class="rx-metric rx-ind" title="Conversão do closer = VENDAS ÷ reuniões FEITAS. % das reuniões realizadas que viraram contrato. Vendas da planilha comercial; feitas do Pipe/CRM.">Conversão do closer <span class="rx-sub">(vendas ÷ feitas)</span></td>`
    + months.map(m=>`<td class="rx-ind">${M[m].feitas? rxPct(M[m].convCloser):'—'}</td>`).join('')+`<td class="rx-tot rx-ind">${T.feitas? rxPct(T.convCloser):'—'}</td></tr>`);
  rows.push(`<tr><td class="rx-metric" title="Nº de contratos com Data de Venda no mês (planilha comercial). Fundo do funil.">Vendas <span class="rx-sub">(novos contratos)</span></td>`
    + months.map(m=>`<td>${Math.round(M[m].novos)||0}</td>`).join('')+`<td class="rx-tot">${Math.round(T.novos)||0}</td></tr>`);
  rows.push(moneyRow('Ticket médio','ticket',T.ticket,'Faturamento ÷ nº de vendas — planilha comercial (Valor do Contrato / contratos com Data de Venda).'));
  rows.push(moneyRow('Receita Total <span class="rx-sub">(vendas × ticket)</span>','faturamento',T.faturamento,'Receita total do mês = Valor do Contrato dos contratos vendidos (planilha comercial). Fundo do funil — igual ao Faturamento do Bloco 1.'));
  const subPct=(label,key,total,hint)=> `<tr data-rxspark="${key}"><td class="rx-metric rx-ind" ${hint?`title="${rxEsc(hint)}"`:''}>${label}</td>`
    + months.map(m=>`<td class="rx-ind">${rxPct(M[m][key])}</td>`).join('')+`<td class="rx-tot rx-ind">${rxPct(total)}</td></tr>`;
  rows.push(moneyRow('Investimento mkt <span class="rx-sub">(Meta)</span>','invest',T.invest,'Gasto de mídia paga (Meta) no mês — via Pipe/conectores.'));
  rows.push(subPct('↳ % do faturamento','investPct',T.investPct,'Investimento de marketing ÷ faturamento do mês.'));
  rows.push(`<tr><td class="rx-metric" title="Paid CAC = investimento de MÍDIA PAGA (painel) ÷ vendas do mês (planilha comercial). É o CAC só de mídia — serve para otimizar canal/campanha.">Paid CAC <span class="rx-sub">(mídia paga)</span></td>`
    + months.map(m=>`<td>${M[m].cac?rxFmt0(M[m].cac):'—'}</td>`).join('')+`<td class="rx-tot">${T.cac?rxFmt0(T.cac):'—'}</td></tr>`);
  rows.push(subPct('↳ % do ticket médio','cacComPct',T.cacComPct,'Paid CAC ÷ ticket médio — quanto do valor do contrato você gasta de mídia para adquirir.'));
  rows.push(`<tr><td class="rx-metric" title="Fully-loaded CAC = TODO o custo de aquisição (mídia + salários de marketing/comercial + comissões + ferramentas + overhead, do Unit Economics/DRE) ÷ vendas. É o CAC para unit economics e LTV:CAC.">Fully-loaded CAC <span class="rx-sub">(mkt + comercial + salários)</span></td>`
    + months.map(m=>`<td>${M[m].cacTotal?rxFmt0(M[m].cacTotal):'—'}</td>`).join('')+`<td class="rx-tot">${T.cacTotal?rxFmt0(T.cacTotal):'—'}</td></tr>`);
  rows.push(subPct('↳ % do ticket médio','cacTotPct',T.cacTotPct,'Fully-loaded CAC ÷ ticket médio — quanto do valor do contrato é consumido pelo custo total de aquisição.'));
  rows.push(`<tr><td class="rx-metric" title="ROAS = faturamento de vendas ÷ investimento (painel).">ROAS</td>`
    + months.map(m=>{ const v=M[m].roas; return v? ragCell(rxNum1(v)+'x',rxRagRoas(v)) : '<td>—</td>'; }).join('')
    + (T.roas? ragCell(rxNum1(T.roas)+'x',rxRagRoas(T.roas)).replace('<td','<td data-tot="1"') : '<td class="rx-tot">—</td>')+`</tr>`);
  rows.push(secRow('③ RECEBÍVEIS & INADIMPLÊNCIA'));
  // recebidos atrasados (Contas a Receber: baixa em mês posterior ao vencimento previsto)
  rows.push(moneyRow('Recebidos atrasados <span class="rx-sub">(&ge;20d)</span>','atrasado',T.atrasado,'Contas a Receber: recuperações do mês pagas com 20 DIAS OU MAIS de atraso (data da baixa − vencimento ≥ 20 dias, contado por DIAS e não por mês). Ex.: venceu 30/07 e pagou 01/08 (2 dias) NÃO conta. Inclui judicial.'));
  rows.push(`<tr data-rxspark="atrasoPct"><td class="rx-metric rx-ind" title="Recebidos atrasados (≥20 dias após o vencimento) ÷ total recebido no mês (Contas a Receber).">% do recebido</td>`
    + months.map(m=>ragCell(rxPct(M[m].atrasoPct),rxRagInad(M[m].atrasoPct))).join('')
    + ragCell(rxPct(T.atrasoPct),rxRagInad(T.atrasoPct)).replace('<td','<td data-tot="1"')+`</tr>`);
  // inadimplentes do mês (Contas a Receber: vencido no mês e sem baixa)
  rows.push(`<tr><td class="rx-metric" title="Situação Atrasado/Quitado parcialmente (col K), Valor da parcela em aberto (col T), por mês de vencimento. Clique para ver as parcelas.">Inadimplentes do mês <span class="rx-sub">(clique p/ detalhar)</span></td>`
    + months.map(m=>`<td class="rx-click" data-rxinad="${m}">${rxFmt0(M[m].inad)}</td>`).join('')
    + `<td class="rx-tot">${rxFmt0(T.inad)}</td></tr>`);
  rows.push(`<tr data-rxspark="inadPct"><td class="rx-metric rx-ind" title="Inadimplentes do mês (em aberto, col T) ÷ Total que venceu no mês (valor original das parcelas, Contas a Receber). Sempre entre 0 e 100%. Judicial fora. No período: ${rxFmt0(T.inad)} ÷ ${rxFmt0(T.vencidoTot)}.">% inadimplência <span class="rx-sub">(do vencido no mês)</span></td>`
    + months.map(m=>ragCell(rxPct(M[m].inadPct),rxRagInad(M[m].inadPct))).join('')
    + ragCell(rxPct(T.inadPct),rxRagInad(T.inadPct)).replace('<td','<td data-tot="1"')+`</tr>`);
  rows.push(moneyRow('Parcelas judiciais <span class="rx-sub">(em aberto)</span>','judic',T.judic,'Parcelas em situação JUDICIAL, em aberto (col T), por mês de vencimento. Ficam FORA da inadimplência e da carteira do Raio-X — mostradas aqui à parte.'));
  // ---- PRAZOS DE RECEBIMENTO (por SAFRA de venda; competência do ContaAzul = data da venda, verificado 97% constante) ----
  const MINP=10;                                          // volume mínimo de parcelas financiadas p/ o mês ser representativo
  const pzCell=(val,np)=> `<td class="rx-ind">${(np>=MINP && val)? rxNum1(val)+'d':'—'}</td>`;
  const pzTot =(val)=> `<td class="rx-tot rx-ind">${val? rxNum1(val)+'d':'—'}</td>`;
  const ragArr=v=> v<=15?'good':(v<=30?'warn':'bad');    // arrasto: verde perto de 0, vermelho subindo
  // ordem: MÉDIO → EFETIVO → ARRASTO juntos (todos médias, comparação direta); HORIZONTE por último (contexto, é um máximo)
  rows.push(`<tr data-rxspark="prazoNeg"><td class="rx-metric rx-ind" title="Prazo médio NEGOCIADO (WAM): média ponderada dos vencimentos das parcelas, da venda até vencer. É a base de comparação do prazo efetivo (logo abaixo). Ponderado pelo valor, por safra. Exclui entrada/à vista e judicial.">Prazo negociado <span class="rx-sub">(médio, dias)</span></td>`
    + months.map(m=>pzCell(M[m].prazoNeg,M[m].nParc)).join('')+pzTot(T.prazoNeg)+`</tr>`);
  rows.push(`<tr data-rxspark="prazoEf"><td class="rx-metric rx-ind" title="Prazo EFETIVO (WACD): dias reais da venda até a BAIXA (se paga) ou até HOJE se em aberto e vencida (soma o atraso); a vencer conta até o vencimento. Ponderado pelo valor. Compare com o prazo médio negociado logo acima — a diferença é o arrasto.">Prazo efetivo <span class="rx-sub">(real, dias)</span></td>`
    + months.map(m=>pzCell(M[m].prazoEf,M[m].nParc)).join('')+pzTot(T.prazoEf)+`</tr>`);
  rows.push(`<tr data-rxspark="arrasto"><td class="rx-metric rx-ind" title="ARRASTO = prazo efetivo − prazo médio negociado. Quantos dias, em média, o recebimento atrasa além do combinado (≈ atraso médio da carteira). Negativo = pagando adiantado; perto de zero = no prazo.">Arrasto <span class="rx-sub">(efetivo − negociado, dias)</span></td>`
    + months.map(m=>(M[m].nParc>=MINP && M[m].prazoEf)? ragCell(rxNum1(M[m].arrasto)+'d', ragArr(M[m].arrasto)) : '<td class="rx-ind">—</td>').join('')
    + ((T.prazoEf)? ragCell(rxNum1(T.arrasto)+'d', ragArr(T.arrasto)).replace('<td','<td data-tot="1"') : '<td class="rx-tot rx-ind">—</td>')+`</tr>`);
  rows.push(`<tr data-rxspark="prazoHoriz"><td class="rx-metric rx-ind" title="Horizonte (contexto): dias da venda até a ÚLTIMA parcela de cada contrato (cronograma completo — ex.: 6 parcelas ≈ 180d), ponderado pelo valor, por safra. É um MÁXIMO, não a média — por isso é MAIOR que os prazos acima. Serve pra saber o horizonte total do contrato.">↳ horizonte <span class="rx-sub">(última parcela, dias)</span></td>`
    + months.map(m=>pzCell(M[m].prazoHoriz,M[m].nParc)).join('')+pzTot(T.prazoHoriz)+`</tr>`);
  rows.push(secRow('④ CAIXA'));
  rows.push(moneyRow('Entradas de caixa <span class="rx-sub">(Relatório de Entradas)</span>','entCaixa',T.entCaixa,'Total efetivamente recebido no mês, do Relatório de Entradas (= "Total (caixa)"). Só o que entrou.'));
  rows.push(moneyRow('Saídas de caixa <span class="rx-sub">(DFC)</span>','saiCaixa',T.saiCaixa,'Total de saídas de caixa no mês (DFC).'));
  // geração com cor
  rows.push(`<tr><td class="rx-metric" title="Geração = Entradas de caixa (Relatório de Entradas) − Saídas de caixa (DFC)."><b>Geração de caixa operacional</b></td>`
    + months.map(m=>ragCell('<b>'+rxFmt0(M[m].geracao)+'</b>',rxRagPos(M[m].geracao))).join('')
    + ragCell('<b>'+rxFmt0(T.geracao)+'</b>',rxRagPos(T.geracao)).replace('<td','<td data-tot="1"')+`</tr>`);
  rows.push(moneyRow('Saldo de caixa <span class="rx-sub">(fim do mês · DFC)</span>','saldo',T.saldo,'Saldo de caixa no fim do mês = saldo inicial do DFC + geração acumulada. Runway (no topo) = saldo ÷ queima média mensal.'));

  // ---- BLOCO ⑤ PREVISÕES (mês atual — dos modelos do app) ----
  rows.push(secRow('⑤ PREVISÕES — mês atual'));
  { const _ny=rxYM(new Date());
    const fcRow=(label,val,hint)=> `<tr><td class="rx-metric rx-ind" title="${rxEsc(hint)}">${label}</td>`
      + months.map(m=>`<td class="rx-ind">${(m===_ny && val!=null)? '<b>'+rxFmt0(val)+'</b>':'—'}</td>`).join('')
      + `<td class="rx-tot rx-ind">${val!=null? rxFmt0(val):'—'}</td></tr>`;
    rows.push(fcRow('Previsão de faturamento', T.fcFat, 'Faturamento projetado do mês corrente — Modelagem DRE (mediana P50).'));
    rows.push(fcRow('Previsão de entradas', T.fcEnt, 'Entradas de caixa projetadas do mês corrente — Modelagem de Caixa (cash collection, cenário Realista).'));
    rows.push(`<tr><td class="rx-metric rx-ind" title="Geração de caixa projetada do mês corrente = entradas projetadas − saídas projetadas (Modelagem de Caixa, cenário Realista). Verde = sobra caixa; vermelho = queima.">Previsão de geração de caixa</td>`
      + months.map(m=>(m===_ny && T.fcGer!=null)? ragCell('<b>'+rxFmt0(T.fcGer)+'</b>', rxRagPos(T.fcGer)) : '<td class="rx-ind">—</td>').join('')
      + (T.fcGer!=null? ragCell('<b>'+rxFmt0(T.fcGer)+'</b>', rxRagPos(T.fcGer)).replace('<td','<td data-tot="1"') : '<td class="rx-tot rx-ind">—</td>')+`</tr>`);
    rows.push(fcRow('Previsão final de caixa', T.fcCaixaMes, 'Saldo de caixa projetado ao FIM do mês corrente — Rolling 13 semanas, partindo do caixa de hoje.'));
    rows.push(fcRow('Previsão caixa fim 13 semanas', T.fcCaixa13, 'Saldo de caixa projetado ao fim das próximas 13 semanas — Rolling Forecast de caixa.'));
  }

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

  // ALARME de etapa do Pipe: etapas de "Vendas Gerais" tratadas como pré-funil que NÃO são as esperadas
  // (só Oportunidade/Contato). Qualquer outra = estágio novo/renomeado que o conector não reconhece → subcontagem.
  let rxStageWarn='';
  try{ const ps=(typeof window!=='undefined')?window.MKT_PRESTAGES:null;
    if(ps){ const desc=Object.keys(ps).filter(e=>!/oportunidade|contato|vazio/i.test(e));
      if(desc.length) rxStageWarn=`<div style="background:#3a1d1d;border:1px solid #ef4444;color:#fca5a5;padding:8px 12px;border-radius:8px;margin-bottom:10px;font-weight:600">⚠ Pipe: ${desc.length} etapa(s) do funil não reconhecida(s) — agendamentos/show podem estar subcontados: ${desc.map(e=>`${rxEsc(e)} (${ps[e]})`).join(', ')}. Ajuste o epNivel_ no endpoint ou padronize a etapa no Pipe.</div>`;
    } }catch(e){}
  document.getElementById('rxNotas').innerHTML= rxStageWarn +
    `<b>Janela:</b> por padrão mostra 6 meses — o <b>mês atual</b> (${rxLabel(last)}, em tempo real/parcial) + 5 meses fechados; rola sozinha a cada mês. Use o filtro <b>De/Até</b> para outro período. `
   +`<b>Como ler:</b> abra a reunião por <b>Geração de caixa operacional</b> (verde = sobra caixa) e por <b>Churn rate</b> (alvo &lt; 5% a.m.; excelente &lt; 2–3%). `
   +`<b>Paid CAC</b> = só mídia paga (painel) ÷ vendas (planilha) — para otimizar canal. <b>Fully-loaded CAC</b> = todo o custo de S&M (mídia + salários de mkt/comercial + comissões + ferramentas + overhead, do <b>Unit Economics/DRE</b>) ÷ vendas — é o CAC para unit economics e LTV:CAC. `
   +`<b>Recebidos atrasados (&ge;20d)</b> (Contas a Receber) = recuperações do mês pagas com <b>20 dias ou mais de atraso</b> (baixa − vencimento &ge; 20 dias, contado por DIAS e não por mês) — <b>inclui judicial</b>. <b>Inadimplentes do mês</b> = Situação <i>Atrasado</i> + <i>Quitado parcialmente</i> (col K), somando o Valor da parcela em aberto (col T); <b>% inadimplência (do vencido no mês)</b> = inadimplentes do mês (em aberto) ÷ <b>total que venceu no mês</b> (valor original das parcelas) — sempre 0–100%, judicial fora. Fonte: <i>import_visao_contas_a_receber</i>. `
   +`<b>Bloco comercial</b>: <b>Vendas</b> (nº de contratos com Data de Venda no mês) e <b>Ticket médio</b> (faturamento ÷ vendas) vêm da <b>planilha comercial</b> — mesma base do faturamento e das comissões. <b>Agendamentos</b>, <b>Show Rate</b>, <b>% No-show</b> e <b>Investimento</b> (gasto Meta) vêm <b>ao vivo do Pipe/CRM</b> (via conectores/funnel-live). <b>Paid CAC</b> = investimento ÷ vendas; <b>ROAS</b> = faturamento ÷ investimento. `
   +`<b>Cash collection</b> = Vlr Entrada (à vista/sinal) dos contratos vendidos no mês; <b>Cash collection %</b> = Vlr Entrada ÷ Valor do Contrato — ambos da planilha de vendas (por Data de Venda), sempre ≤100%. É o caixa que entra na assinatura; as parcelas seguintes não entram aqui. `
   +`<b>Duplicatas:</b> valores de parcelas/recorrentes recebidos no mês (Relatório de Entradas), <b>excluindo entrada e à vista</b>. `
   +`<b>% recorrente</b> = duplicatas ÷ faturamento (quanto da receita é recorrente). <b>Prazos por safra</b> (mês da venda; competência do ContaAzul = data da venda). <b>Prazo negociado (médio)</b> = média ponderada dos vencimentos (WAM), da venda até vencer; <b>Prazo efetivo</b> = dias da venda até a baixa (ou até hoje, somando o atraso, se em aberto) — o prazo REAL (WACD); <b>Arrasto</b> = efetivo − negociado médio (≈ atraso médio da carteira). <b>↳ horizonte</b> = vencimento da última parcela do contrato (contexto — é um MÁXIMO, por isso maior que a média). Todos ponderados pelo valor, sem entrada/à vista nem judicial; meses com menos de 10 parcelas financiadas mostram "—". <b>Saldo de caixa</b> = saldo inicial do DFC + geração acumulada; <b>Runway</b> = saldo ÷ queima média (∞ se gera caixa). <b>Aging</b> = recebíveis em aberto por faixa de atraso (hoje). `
   +`Definições: <i>faturamento</i> = Valor do Contrato dos contratos vendidos (Data de Venda), da planilha de comissões; <i>duplicatas, cash collection, atrasados, caixa</i> por regime de caixa; <i>inadimplência</i> = vencido em aberto ÷ total que venceu no mês (contas a receber). Passe o mouse em cada métrica para a explicação. `;

}

/* ---------- exportação ---------- */
function rxAOA(){
  const d=rxBuild(); if(!d) return null;
  const {months,M,T}=d;
  const head=['Métrica',...months.map(rxLabel),'Período'];
  const r=(label,fn)=>[label,...months.map(m=>fn(M[m])),fn(T)];
  return [head,
    r('Faturamento (competência)',x=>Math.round(x.faturamento)),
    r('Cash collection (entrada da venda)',x=>Math.round(x.cashColl)),
    r('Cash collection % (entrada ÷ contrato)',x=> x.faturamento>0 ? +x.cashCollPct.toFixed(1) : ''),
    r('Duplicatas (parcelado/recorrente)',x=>Math.round(x.mrrReal)),
    r('Agendamentos',x=>Math.round(x.agendadas||0)),
    r('Show Rate % (feitas ÷ resolvidas)',x=>+(x.showRate||0).toFixed(1)),
    r('% No-show',x=>+(x.noshowPct||0).toFixed(1)),
    r('Conversão do closer % (vendas ÷ feitas)',x=>+(x.convCloser||0).toFixed(1)),
    r('Vendas (novos contratos)',x=>Math.round(x.novos)),
    r('Ticket médio',x=>Math.round(x.ticket)),
    r('Receita Total (vendas × ticket)',x=>Math.round(x.faturamento)),
    r('Investimento mkt (painel)',x=>Math.round(x.invest)),
    r('  Investimento mkt % do faturamento',x=>+x.investPct.toFixed(1)),
    r('Paid CAC (mídia)',x=>Math.round(x.cac)),
    r('  Paid CAC % do ticket médio',x=>+x.cacComPct.toFixed(1)),
    r('Fully-loaded CAC (mkt+comercial)',x=>Math.round(x.cacTotal||0)),
    r('  Fully-loaded CAC % do ticket médio',x=>+x.cacTotPct.toFixed(1)),
    r('ROAS',x=>+(x.roas||0).toFixed(2)),
    r('Recebidos atrasados (>=20d)',x=>Math.round(x.atrasado)),
    r('Atrasados % do recebido',x=>+x.atrasoPct.toFixed(1)),
    r('Inadimplentes do mês',x=>Math.round(x.inad)),
    r('Inadimplência % (do vencido no mês)',x=>+x.inadPct.toFixed(1)),
    r('Parcelas judiciais (em aberto)',x=>Math.round(x.judic||0)),
    r('Prazo negociado — médio ponderado (dias)',x=>+(x.prazoNeg||0).toFixed(1)),
    r('Prazo efetivo (dias, real)',x=>+(x.prazoEf||0).toFixed(1)),
    r('Arrasto — efetivo − negociado (dias)',x=>+(x.arrasto||0).toFixed(1)),
    r('  Horizonte — última parcela (dias)',x=>+(x.prazoHoriz||0).toFixed(1)),
    r('Entradas de caixa (Relatório de Entradas)',x=>Math.round(x.entCaixa)),
    r('Saídas de caixa (DFC)',x=>Math.round(x.saiCaixa)),
    r('Geração de caixa operacional',x=>Math.round(x.geracao)),
    r('Saldo de caixa (fim do mês)',x=>Math.round(x.saldo||0)),
    r('Previsão de faturamento (mês)',x=> (x&&x.fcFat!=null)? rxFmt0(x.fcFat):''),
    r('Previsão de entradas (mês)',x=> (x&&x.fcEnt!=null)? rxFmt0(x.fcEnt):''),
    r('Previsão de geração de caixa (mês)',x=> (x&&x.fcGer!=null)? rxFmt0(x.fcGer):''),
    r('Previsão final de caixa (mês)',x=> (x&&x.fcCaixaMes!=null)? rxFmt0(x.fcCaixaMes):''),
    r('Previsão caixa fim 13 semanas',x=> (x&&x.fcCaixa13!=null)? rxFmt0(x.fcCaixa13):''),
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
  // paleta CLARA (impressão): fundo branco, números pretos; verde/vermelho só nos sinais
  const BG=[255,255,255], PANEL=[255,255,255], PANEL2=[247,249,251], HEAD=[233,238,243], LINE=[203,213,225],
        TXT=[15,23,32], MUTE=[100,112,126], GOLD=[161,98,7], SECT=[254,248,230],
        NOWBG=[226,242,246], NOWHEAD=[198,230,238], NOWTXT=[12,74,84], GREEN=[21,128,61], RED=[185,28,28];
  doc.setFillColor.apply(doc,BG); doc.rect(0,0,W,H,'F');                 // fundo escuro (página toda)
  const months=d.months, nowYM=rxYM(new Date());
  const nowCol = months.indexOf(nowYM)>=0 ? months.indexOf(nowYM)+1 : -1;   // col 0 = métrica
  doc.setFontSize(16); doc.setTextColor.apply(doc,GOLD); doc.setFont(undefined,'bold');
  doc.text('Raio-X de Performance', 40, 38); doc.setFont(undefined,'normal');
  doc.setFontSize(9); doc.setTextColor.apply(doc,MUTE);
  doc.text(`${rxLabel(months[0])}–${rxLabel(months[months.length-1])}   ·   runway ${d.T.runway===Infinity?'(gera caixa)':rxNum1(d.T.runway)+'m'}   ·   inadimplência ${rxPct(d.T.inadPct)}   ·   Mentat FP&A`, 40, 54);
  const money=new Set([1,2,4,10,11,12,14,16,19,21,23,28,29,30,31]);
  const numCols=aoa[0].length;
  const secAt={'Faturamento (competência)':'BLOCO 1   ·   RECEITA & DUPLICATAS','Agendamentos':'BLOCO 2   ·   COMERCIAL & AQUISIÇÃO','Recebidos atrasados (>=20d)':'BLOCO 3   ·   RECEBÍVEIS & INADIMPLÊNCIA','Entradas de caixa (Relatório de Entradas)':'BLOCO 4   ·   CAIXA','Previsão de faturamento (mês)':'BLOCO 5   ·   PREVISÕES (mês atual)'};
  // ---- ESCALA VERTICAL: preenche a página SEM NUNCA passar de 1 folha ----
  const TOP=60, FOOT=40, SPACER_H=7, SEC_H=18, SECFS=9;
  const LIMIT   = H - FOOT;                                       // y máximo que a tabela pode alcançar
  const nData   = aoa.length-1;                                   // linhas de métrica
  const nSec    = aoa.slice(1).filter(r=> secAt[r[0]]).length;    // cabeçalhos de bloco
  const nSpacer = Math.max(0, nSec-1);                            // espaçadores entre blocos
  // chute inicial: desconta blocos, espaçadores e a espessura das bordas
  let rowH = ((LIMIT-TOP) - nSpacer*SPACER_H - nSec*SEC_H - (nData+nSec+nSpacer+1)*0.35) / (nData+1);
  rowH = Math.max(7.5, Math.min(26, rowH));
  // monta o corpo COM linhas de bloco e ESPAÇADOR entre eles (separação clara)
  const body=[]; let firstSec=true;
  aoa.slice(1).forEach((row,i)=>{
    const label=row[0];
    if(secAt[label]){
      if(!firstSec) body.push([{content:'', colSpan:numCols, styles:{fillColor:BG, lineWidth:0, minCellHeight:SPACER_H, cellPadding:0, fontSize:1}}]);   // espaçador entre blocos
      body.push([{content:secAt[label], colSpan:numCols, styles:{fillColor:SECT,textColor:GOLD,fontStyle:'bold',halign:'left',valign:'middle',fontSize:SECFS,minCellHeight:SEC_H,cellPadding:{top:2,bottom:2,left:8,right:8},lineColor:GOLD,lineWidth:0.7}}]);
      firstSec=false;
    }
    body.push(row.map((c,j)=> j===0? c : (money.has(i+1)? rxFmt0(c) : (typeof c==='number'? c.toLocaleString('pt-BR') : c)) ));
  });
  // estilos derivados da altura de linha (fonte e padding acompanham)
  const mkStyles = rh => { const fs=Math.max(5.5,Math.min(11,rh*0.52)), pv=Math.max(0.8,(rh-fs*1.15)/2);
    return { styles:{fontSize:fs,cellPadding:{top:pv,bottom:pv,left:5,right:5},minCellHeight:rh,valign:'middle',lineColor:LINE,lineWidth:0.35,textColor:TXT,fillColor:PANEL},
             headStyles:{fillColor:HEAD,textColor:MUTE,fontStyle:'bold',halign:'right',valign:'middle',lineColor:LINE,fontSize:fs,minCellHeight:rh,cellPadding:{top:pv,bottom:pv,left:5,right:5}} }; };
  const baseOpts = { startY:TOP, theme:'grid', head:[aoa[0]], body, rowPageBreak:'avoid',
    tableWidth:W-72, bodyStyles:{halign:'right'}, alternateRowStyles:{fillColor:PANEL2},
    columnStyles:{0:{cellWidth:172,halign:'left',fontStyle:'bold',textColor:TXT}},
    margin:{left:36,right:36,top:TOP,bottom:FOOT} };
  // GARANTIA de 1 página: renderiza numa cópia descartável, mede e encolhe até caber
  for(let i=0;i<6;i++){
    const probe=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
    probe.autoTable(Object.assign({}, baseOpts, mkStyles(rowH)));
    const pages=probe.internal.getNumberOfPages(), fy=probe.lastAutoTable.finalY;
    if(pages===1 && fy<=LIMIT) break;                       // coube: mantém esta altura
    rowH = pages>1 ? rowH*0.92 : rowH*((LIMIT-TOP)/(fy-TOP))*0.99;
    if(rowH<=7.5){ rowH=7.5; break; }
  }
  doc.autoTable(Object.assign({}, baseOpts, mkStyles(rowH), {
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
        if(lbl.indexOf('eração de caixa')>=0 || lbl.indexOf('Saldo de caixa')>=0){
          data.cell.styles.textColor = String(data.cell.raw||'').indexOf('-')>=0 ? RED : GREEN;
          data.cell.styles.fontStyle='bold';
        }
      }
    },
    didDrawPage:()=>{ doc.setFontSize(7); doc.setTextColor.apply(doc,MUTE); doc.text('Mentat FP&A · Raio-X de Performance', 40, H-14); }
  }));
  doc.save('raio-x-performance.pdf');
}

/* ---------- bind ---------- */
function rxBind(){
  const tab=document.querySelector('[data-tab="raiox"]');
  if(tab) tab.addEventListener('click', ()=>{ try{ rxRender(); }catch(e){ console.error('Raio-X falhou:',e); } try{ rxFetchPainel(); }catch(e){} try{ if(typeof window.fetchMktLive==='function') window.fetchMktLive(); }catch(e){} });
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
