'use strict';

// Storage keys are initialized before any access-control callback can fire.
const OWNER_FLEET_KEY = 'grupoConect.ownerFleet.v2';
const OWNER_ROUTES_KEY = 'grupoConect.ownerRoutes.v1';
const OWNER_ROUTES_MIGRATED_KEY = 'grupoConect.ownerRoutesMigrated.v1';
const OWNER_CONTRACTS_KEY = 'grupoConect.municipalContracts.v1';
const OWNER_SCALE_KEY = 'grupoConect.ownerScalesByWeekday.v1';
const OPERATION_KEY = 'grupoConect.operationViewer.v1';
const DRIVER_COUNT_KEY = 'grupoConect.virtualDriverCounts.v1';
const FINANCED_BUSES_KEY = 'grupoConect.financedBuses.v1';
const CASH_LEDGER_KEY = 'grupoConect.cashLedger.v1';
const OPERATION_CASH_STATE_KEY = 'grupoConect.operationCashState.v1';
const GC_VALIDATOR_LOG_KEY = 'grupoConect.validatorDepartureLog.v1';
const GC_ZERO_KM_QUOTES_KEY = 'grupoConect.zeroKmQuotes.v1';

const DIESEL_DEFAULT = 7.99;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const HISTORY_KEY = 'grupoConect.tripHistory.v1';
const DAY_COUNT_KEY = 'grupoConect.dayCount.v1';
const ACTIVE_DAY_KEY = 'grupoConect.activeDay.v1';
const PHOTO_DB_NAME = 'grupoConectSchedulePhotos';
const PHOTO_STORE_NAME = 'photos';
const state = { free: 0, paid: 0, photos: [], objectUrls: new Map(), toastTimer: null, journey: null, pendingJourney: null, validatorCardRead: false, dayCount: 1, lastAiReport: '' };
let gcZeroKmCurrentQuote = null;

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(value) ? value : 0);
const numberPt = (value, digits = 1) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dayLabel = (dayId) => `Dia ${Math.max(1, Number(String(dayId || 'day-1').replace('day-', '')) || 1)}`;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function switchScreen(screenId) {
  if (screenId === 'calculatorScreen' && (!state.journey || state.pendingJourney?.type === 'normal')) {
    showToast('Para abrir o painel, primeiro identifique a viagem e confirme a partida no validador.');
    return;
  }
  $$('.screen').forEach((screen) => {
    const active = screen.id === screenId;
    screen.classList.toggle('active', active);
    screen.hidden = !active;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (screenId === 'calculatorScreen') { updateCalculation(); updateDayUI(); }
  if (screenId === 'startTripScreen') { if(typeof refreshRouteDatalists==='function') refreshRouteDatalists(); if(typeof refreshNormalTripDrivers==='function') refreshNormalTripDrivers(); }
  if (screenId === 'gpsTrackingScreen' && typeof gcRenderGps === 'function') { gcGpsSetAccess(); }
  if (screenId === 'intercityScreen' && typeof gcIcRenderIntercity === 'function') { gcIcRenderIntercity(); }
  if (screenId === 'validatorScreen' && typeof gcValidatorRender === 'function') gcValidatorRender();
}

$$('[data-screen]').forEach((button) => button.addEventListener('click', () => switchScreen(button.dataset.screen)));
$('#brandHome').addEventListener('click', () => switchScreen('homeScreen'));
$('#openMainMenu').addEventListener('click', () => switchScreen('homeScreen'));

// Abertura resiliente dos módulos do proprietário: usa delegação em captura para
// continuar funcionando mesmo se os cartões forem recriados por algum renderizador.
// Os módulos só abrem depois da seleção de Pablo; falhas de renderização não escondem a tela.
document.addEventListener('click', (event) => {
  const target = event.target && event.target.closest ? event.target : event.target?.parentElement;
  const button = target?.closest?.('#onlineOpenButton, #gcAgendaOpenButton');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (typeof ownerAllowed === 'function' && !ownerAllowed()) {
    showToast('Selecione Pablo no acesso do proprietário para abrir este módulo.');
    return;
  }
  try {
    if (button.id === 'onlineOpenButton') gcOnlineOpenPanel();
    else if (button.id === 'gcAgendaOpenButton') gcAgendaOpen();
  } catch (error) {
    console.error('Falha ao abrir módulo Grupo Conect:', button.id, error);
    const panelId = button.id === 'onlineOpenButton' ? 'onlineServicePanel' : 'gcAgendaPanel';
    const panel = document.getElementById(panelId);
    if (panel) { panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    showToast('A tela foi aberta, mas houve um erro ao atualizar os dados. Recarregue o módulo e tente novamente.');
  }
}, true);

function readNonNegative(input) {
  const raw = String(input?.value ?? '').trim().replace(',', '.');
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function readPercent(input) {
  const value = readNonNegative(input);
  return value !== null && value <= 100 ? value : null;
}
function getCurrentDayId() { return $('#daySelect')?.value || 'day-1'; }
function getDayTrips(dayId = getCurrentDayId()) { return loadHistory().filter((trip) => (trip.dayId || 'day-1') === dayId); }

// Empresas ativas neste cenário fictício.
const GROUP_COMPANIES = ['Progresso','Viação Cedro','Viação Conecta','Transportes Transportes','Galaxy Transportes'];
const GC_CITIES = ['Barra do Piraí','Vassouras','Paraíba do Sul','Três Rios','Valença','Resende','Niterói','Nova Friburgo','Rio de Janeiro — Setor intermunicipal / Baixada','Petrópolis','Miguel Pereira','Nova Iguaçu','Paracambi','Juiz de Fora','Teresópolis','Areal'];
const GC_INTERSTATE_ROUTES = ['RJ × POA','RJ × SP','RJ × BH','RJ × Curitiba','RJ × Vitória','RJ × Brasília','RJ × Florianópolis','RJ × Juiz de Fora'];

// Frota pré-cadastrada por empresa. Os prefixos e modelos refletem as informações do usuário;
// o tipo de serviço fica marcado somente quando foi informado explicitamente.
const FLEET = [
  { company:'Progresso', model:'Caio Apache Vip III 1721L', prefixes:['80'], service:'A definir' },
  { company:'Progresso', model:'Marcopolo Torino 17.230 ODS', prefixes:['200','201','202','203','204','205'], service:'A definir' },
  { company:'Progresso', model:'Marcopolo Torino 2007', prefixes:['195','196','197','198','199'], service:'A definir' },
  { company:'Progresso', model:'Marcopolo Ideale 800', prefixes:['205','206','207'], service:'A definir' },
  { company:'Progresso', model:'Mascarello Gran Micro S3', prefixes:['208','209','210'], service:'A definir', chassis:'Mascarello Gran Micro S3' },
  { company:'Progresso', model:'Caio Apache Vip III MB OF-1721', prefixes:['180'], service:'A definir', chassis:'Mercedes-Benz OF-1721' },
  { company:'Progresso', model:'Marcopolo Torino MB OF-1519', prefixes:['211','212','213'], service:'A definir', chassis:'Mercedes-Benz OF-1519' },

  { company:'Viação Cedro', model:'Neobus Spectrum Road MB OF-1722M', prefixes:['2500','2501'], service:'A definir', chassis:'Mercedes-Benz OF-1722M' },
  { company:'Viação Cedro', model:'Marcopolo Audace OF-1721L', prefixes:['2502','2503','2504','2505','2506','2507','2508','2509','2510'], service:'A definir', chassis:'Mercedes-Benz OF-1721L' },
  { company:'Viação Cedro', model:'Mascarello Gran Via 17.230 EOD', prefixes:['2511','2512','2513'], service:'A definir', chassis:'Volkswagen 17.230 EOD' },
  { company:'Viação Cedro', model:'Marcopolo Viaggio G7 1050 MB O500M', prefixes:['2514','2515','2516','2517','2518','2519','2520'], service:'A definir', chassis:'Mercedes-Benz O500M' },
  { company:'Viação Cedro', model:'Neobus N10 MB OF-1721L', prefixes:['2521','2522'], service:'A definir', chassis:'Mercedes-Benz OF-1721L' },
  { company:'Viação Cedro', model:'Caio Apache Vip IV MB OF-1721L', prefixes:['2523','2524','2525'], service:'A definir', chassis:'Mercedes-Benz OF-1721L' },
  { company:'Viação Cedro', model:'Marcopolo Torino 2007 MB OF-1722M', prefixes:['2526'], service:'Municipal e intermunicipal', chassis:'Mercedes-Benz OF-1722M' },
  { company:'Viação Cedro', model:'Caio Apache Vip II MB OF-1722M', prefixes:['2527'], service:'Municipal e intermunicipal', chassis:'Mercedes-Benz OF-1722M' },
  { company:'Viação Cedro', model:'Marcopolo Paradiso G6 Volvo', prefixes:['2529','2530','2531','2532','2533'], service:'Intermunicipal', chassis:'Volvo' }
];
function populateSelect(select, placeholder, values) {
  select.innerHTML = '';
  const first = document.createElement('option'); first.value = ''; first.textContent = placeholder; select.appendChild(first);
  values.forEach((entry) => {
    const option = document.createElement('option');
    if (typeof entry === 'string') { option.value = entry; option.textContent = entry; }
    else { option.value = entry.value; option.textContent = entry.label; }
    select.appendChild(option);
  });
}
function mergeCompanyFleet(company) {
  const rows = FLEET.filter(item => norm(item.company) === norm(company)).map(item => ({...item, prefixes:[...item.prefixes]}));
  // Veículos também registrados pelo proprietário ficam disponíveis no início de viagem.
  const saved = typeof ownerFleet === 'function' ? ownerFleet().filter(item => norm(item.company) === norm(company)) : [];
  saved.forEach(item => {
    let match = rows.find(row => norm(row.model) === norm(item.model));
    if (!match) { match = {company:item.company, model:item.model, prefixes:[], service:item.type || 'A definir', chassis:item.chassis || ''}; rows.push(match); }
    if (item.prefix && !match.prefixes.includes(String(item.prefix))) match.prefixes.push(String(item.prefix));
  });
  const seen = new Set();
  return rows.map(item => ({...item, prefixes:[...new Set(item.prefixes.map(String))]})).filter(item => {
    const key=norm(item.model); if(seen.has(key))return false; seen.add(key); return item.prefixes.length>0;
  });
}
function refreshBusFields() {
  const company = $('#companySelect').value;
  const rows = mergeCompanyFleet(company);
  const modelSelect = $('#busModelSelect'); const prefixSelect = $('#busPrefixSelect');
  const enabled = rows.length > 0;
  $('#busFields').classList.toggle('is-disabled', !enabled);
  modelSelect.disabled = !enabled; prefixSelect.disabled = !enabled;
  populateSelect(modelSelect, enabled ? 'Selecione o modelo' : 'Nenhum ônibus cadastrado para esta empresa', rows.map(item => item.model));
  populateSelect(prefixSelect, 'Selecione o modelo primeiro', []);
  if (enabled) {
    $('#companyNotice').textContent = `Frota de ${company} liberada. Escolha o modelo e o prefixo cadastrado.`;
    $('#companyNotice').classList.remove('notice-warning');
  } else {
    $('#companyNotice').textContent = `Ainda não há ônibus cadastrado para ${company}. Abra Colinha → Área do Dono e cadastre a frota primeiro.`;
    $('#companyNotice').classList.add('notice-warning');
  }
}
$('#companySelect').addEventListener('change', () => { refreshBusFields(); refreshNormalTripDrivers(); });
$('#busModelSelect').addEventListener('change', () => {
  const company = $('#companySelect').value;
  const model = mergeCompanyFleet(company).find(item => item.model === $('#busModelSelect').value);
  populateSelect($('#busPrefixSelect'), 'Selecione o prefixo', model ? model.prefixes : []);
});
$('#startJourneyForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const company = $('#companySelect').value;
  const bus = mergeCompanyFleet(company).find(item => item.model === $('#busModelSelect').value);
  const prefix = $('#busPrefixSelect').value;
  if (!company || !bus || !prefix || !bus.prefixes.includes(prefix)) {
    $('#companyNotice').textContent = 'Confira empresa, modelo e prefixo. Se a frota não aparecer, cadastre o ônibus na Área do Dono.';
    $('#companyNotice').classList.add('notice-warning');
    showToast('Selecione uma empresa e um ônibus válido para iniciar a viagem.');
    return;
  }
  if (typeof gcOnlineBusReservationReason === 'function') {
    const reservation=gcOnlineBusReservationReason({company,prefix,model:bus.model},dateTodayLocal());
    if(reservation){$('#companyNotice').textContent=`Ônibus indisponível: ${reservation.message} Escolha outro prefixo para hoje.`;$('#companyNotice').classList.add('notice-warning');showToast(`Viagem não iniciada: ${reservation.message}`);return;}
  }
  if (!$('#driverSelect').value) { showToast('Selecione o motorista.'); return; }
  const city = $('#tripCity').value.trim();
  const line = $('#tripLine').value.trim();
  if (!city || !line) { showToast('Informe a cidade e o nome/número da linha para vincular a viagem ao histórico.'); (!city ? $('#tripCity') : $('#tripLine')).focus(); return; }
  const journey = { id:makeId(), company, driver:$('#driverSelect').value, city, line, busModel:bus.model, busPrefix:prefix, service:bus.service || 'A definir', chassis:bus.chassis || '' };
  gcValidatorOpen({type:'normal',journey,company,driver:journey.driver,city,line,model:bus.model,prefix,service:journey.service});
  showToast('Identificação concluída. O motorista precisa validar o cartão antes da partida.');
});

function gcBeginNormalJourney(journey, validatorLogId) {
  state.journey = {...journey, validatorLogId};
  $('#journeyContext').innerHTML = `<strong>${escapeHtml(state.journey.company)} · ${escapeHtml(state.journey.driver)}</strong><span>${escapeHtml(state.journey.city)} · Linha ${escapeHtml(state.journey.line)}</span><span>${escapeHtml(state.journey.busModel)} · Prefixo ${escapeHtml(state.journey.busPrefix)}${state.journey.service && state.journey.service!=='A definir' ? ` · ${escapeHtml(state.journey.service)}` : ''}</span><span class="validator-trip-stamp">Partida validada · ${escapeHtml(new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))}</span>`;
  state.free = 0; state.paid = 0;
  $('#fareValue').value = '';
  $('#chassisSelect').value = '';
  // Preseleciona uma opção de chassi aproximada quando existe no cadastro informado.
  if (state.journey.chassis) {
    const target = norm(state.journey.chassis);
    const option = Array.from($('#chassisSelect').options).find(o => norm(o.textContent).includes(target) || target.includes(norm(o.textContent)));
    if (option) $('#chassisSelect').value = option.value;
  }
  $('#tankCapacity').value = $('#chassisSelect').selectedOptions[0]?.dataset.capacity || '';
  $('#tankInitialPercent').value = '';
  $('#tankCurrentPercent').value = '';
  $('#dieselLiters').value = '';
  $('#dieselPrice').value = DIESEL_DEFAULT.toFixed(2);
  $('#tripReport').hidden = true;
  updateCalculation();
  switchScreen('calculatorScreen');
  showToast('Partida validada. Viagem iniciada!');
}

// --- Validador de bordo simulado: aproximação do cartão, leitura, confirmação e registro ---
const GC_VALIDATOR_CARD_IDS = {Pablo:'GC-MOT-0001',Treinamento:'GC-MOT-0002',Kaio:'GC-MOT-0003'};
function gcValidatorCardId(name){
  const driver=String(name||'').trim();if(GC_VALIDATOR_CARD_IDS[driver])return GC_VALIDATOR_CARD_IDS[driver];
  let hash=0;for(let i=0;i<driver.length;i++)hash=(hash*31+driver.charCodeAt(i))>>>0;
  return `GC-MOT-${String(1000+(hash%8999)).padStart(4,'0')}`;
}
function gcValidatorLogs(){return readArrayKey(GC_VALIDATOR_LOG_KEY);}
function gcValidatorSaveLog(row){const rows=gcValidatorLogs();if(rows.some(x=>x.id===row.id))return true;rows.push(row);return writeArrayKey(GC_VALIDATOR_LOG_KEY,rows.slice(-300));}
function gcValidatorCardTapReset(){state.validatorCardRead=false;const button=$('#validatorConfirmStart');if(button)button.disabled=true;$('#validatorLed')?.classList.remove('validator-led-ready');$('#validatorReaderLight')?.classList.remove('validator-reader-ready');$('#validatorCardVisual')?.classList.remove('validator-card-read');}
function gcValidatorOpen(pending){state.pendingJourney=pending;gcValidatorCardTapReset();gcValidatorRender();switchScreen('validatorScreen');}
function gcValidatorRender(){
  const pending=state.pendingJourney;
  const context=$('#validatorContext');if(!context)return;
  const driver=pending?.driver||pending?.journey?.driver||'—';
  const company=pending?.company||pending?.journey?.company||'—';
  const model=pending?.model||pending?.journey?.busModel||'';
  const prefix=pending?.prefix||pending?.journey?.busPrefix||'';
  const city=pending?.city||pending?.journey?.city||'';
  const line=pending?.line||pending?.journey?.line||'';
  const kind=pending?.type==='intercity'?'Viagem intermunicipal':pending?.type==='online'?'Fretamento contratado':'Viagem normal';
  $('#validatorCardName').textContent=pending?driver:'Nenhum cartão carregado';
  $('#validatorCardNumber').textContent=pending?gcValidatorCardId(driver):'GC-000000';
  $('#validatorTapCard').disabled=!pending;
  $('#validatorConfirmStart').disabled=!pending||!state.validatorCardRead;
  $('#validatorCancel').disabled=!pending;
  $('#validatorPrepareTrip').hidden=Boolean(pending);
  $('#validatorStateBadge').textContent=pending?(state.validatorCardRead?'Cartão lido · aguardando confirmação':'Aguardando cartão'):'Aguardando dados';
  if(pending){context.innerHTML=`<div class="validator-context-grid"><span>Tipo de serviço<strong>${escapeHtml(kind)}</strong></span><span>Motorista<strong>${escapeHtml(driver)}</strong></span><span>Empresa<strong>${escapeHtml(company)}</strong></span><span>Ônibus / prefixo<strong>${escapeHtml(model)}${prefix?` · ${escapeHtml(prefix)}`:''}</strong></span><span>Cidade / linha<strong>${escapeHtml(city||'Não informada')} · ${escapeHtml(line||'Linha não informada')}</strong></span></div>`;$('#validatorStatus').textContent=state.validatorCardRead?'Cartão aceito. Confira os dados acima e pressione INICIAR VIAGEM.':'Viagem identificada. Aproxime o cartão funcional do motorista para fazer a leitura.';$('#validatorLcdMain').textContent=state.validatorCardRead?'CARTÃO ACEITO':'AGUARDANDO CARTÃO';$('#validatorLcdSub').textContent=state.validatorCardRead?`${driver} · confirme a partida`:`${company} · ${line||'linha não informada'}`;}
  else{context.innerHTML='<p><strong>Nenhuma viagem aguardando validação.</strong></p><p>Comece pelo formulário “Iniciar viagem”, pelo Painel intermunicipal ou pelo Atendimento Online. O Visualizador de Operação inicia o ciclo diretamente, sem usar este validador.</p>';$('#validatorStatus').textContent='Nenhuma viagem selecionada. O cartão não pode liberar uma viagem sem identificação.';$('#validatorLcdMain').textContent='AGUARDANDO VIAGEM';$('#validatorLcdSub').textContent='Identifique a viagem antes de aproximar o cartão.';}
  $('#validatorClock').textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  gcValidatorRenderLog();
}
function gcActivateOperation(op){
  if(!assertOwner())return;
  const rows=ownerOperations();
  if(rows.some(x=>x.id===op.id)){showToast('Esta operação já foi registrada.');return;}
  // O Visualizador de Operação tem partida própria: não exige cartão no validador.
  const loading=$('#ovLoading');const submitButton=$('#operationViewerForm button[type="submit"]');
  if(loading)loading.hidden=false;if(submitButton)submitButton.disabled=true;
  setTimeout(()=>{
    const eventHappened=Math.random()<0.10;
    if(eventHappened){const kinds=Object.keys(INCIDENT_RESPONSES),type=kinds[Math.floor(Math.random()*kinds.length)];op.status='fora de operação';op.lastEvent=`${INCIDENT_LABELS[type]} · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;op.currentIncidentType=type;op.incidentHistory.push({id:makeId(),type,occurredAt:new Date().toISOString(),resolution:''});}
    else{op.status='operando';op.clockAnchorAt=Date.now();op.startedAt=new Date().toISOString();}
    const current=ownerOperations();if(!current.some(x=>x.id===op.id))current.push(op);
    if(!writeArrayKey(OPERATION_KEY,current)){if(loading)loading.hidden=true;if(submitButton)submitButton.disabled=false;showToast('Não foi possível salvar a operação no navegador. Tente novamente.');return;}
    if(loading)loading.hidden=true;if(submitButton)submitButton.disabled=false;renderOperations();
    switchScreen('ownerAreaScreen');
    if(eventHappened){showToast('Operação iniciada; surgiu um imprevisto simulado (10%). Escolha uma decisão.');openIncidentFor(op,op.currentIncidentType);}
    else showToast(`Operação iniciada. Primeira viagem termina em ${opFormatCountdown(op.duration*60/op.speedMultiplier)} de tempo real.`);
  },500);
}
function gcValidatorRenderLog(){
  const target=$('#validatorLogList');if(!target)return;const rows=gcValidatorLogs().slice().reverse().slice(0,12);
  target.innerHTML=rows.length?rows.map(x=>`<article class="record-item validator-log-record"><div><strong>${escapeHtml(x.driver||'Motorista')} · ${escapeHtml(x.line||'Linha não informada')}</strong><small>${escapeHtml(x.company||'Empresa')} · ${escapeHtml(x.prefix||'Sem prefixo')} · ${escapeHtml(new Date(x.startedAt).toLocaleString('pt-BR'))}</small><span class="record-inline-tag">Cartão ${escapeHtml(x.cardId||'GC')}</span></div><span class="doc-status-tag">Partida autorizada</span></article>`).join(''):recordsEmpty('Nenhuma partida validada ainda.');
}
$('#validatorTapCard').addEventListener('click',()=>{
  const p=state.pendingJourney;if(!p){showToast('Identifique a viagem antes de apresentar o cartão.');return;}
  const driver=p.driver||p.journey?.driver;if(!driver){showToast('Não há motorista escalado para validar.');return;}
  state.validatorCardRead=true;$('#validatorConfirmStart').disabled=false;$('#validatorLed').classList.add('validator-led-ready');$('#validatorReaderLight').classList.add('validator-reader-ready');$('#validatorCardVisual').classList.add('validator-card-read');$('#validatorStateBadge').textContent='Cartão lido · pronto';$('#validatorStatus').textContent=`LEITURA ACEITA · ${driver}. Confirme os dados da viagem e pressione INICIAR VIAGEM.`;$('#validatorLcdMain').textContent='CARTÃO ACEITO';$('#validatorLcdSub').textContent=`${driver} · ${gcValidatorCardId(driver)}`;$('#validatorClock').textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});showToast('Bip! Cartão funcional reconhecido na simulação.');
});
$('#validatorConfirmStart').addEventListener('click',()=>{
  const p=state.pendingJourney;if(!p||!state.validatorCardRead){showToast('Aproxime o cartão antes de iniciar a viagem.');return;}
  const driver=p.driver||p.journey?.driver||'Motorista não identificado';
  const company=p.company||p.journey?.company||'';const model=p.model||p.journey?.busModel||'';const prefix=p.prefix||p.journey?.busPrefix||'';const city=p.city||p.journey?.city||'';const line=p.line||p.journey?.line||'';
  const log={id:makeId(),type:p.type,driver,company,model,prefix,city,line,cardId:gcValidatorCardId(driver),startedAt:new Date().toISOString(),status:'started'};
  if(!gcValidatorSaveLog(log)){showToast('Não foi possível salvar a partida validada no navegador.');return;}
  state.pendingJourney=null;state.validatorCardRead=false;
  if(p.type==='normal'){gcBeginNormalJourney({...p.journey,validatorLogId:log.id},log.id);}
  else if(p.type==='intercity'){gcIcCommitStartTrip(p,log.id);}
  else if(p.type==='online'){gcOnlineCommitServiceStart(p,log.id);}
  gcValidatorRenderLog();
});
$('#validatorPrepareTrip').addEventListener('click',()=>switchScreen('startTripScreen'));
$('#validatorCancel').addEventListener('click',()=>{
  const p=state.pendingJourney;if(!p)return;const type=p.type;state.pendingJourney=null;state.validatorCardRead=false;gcValidatorRender();
  switchScreen(type==='normal'?'startTripScreen':type==='intercity'?'intercityScreen':'ownerAreaScreen');showToast('Validação cancelada. A viagem não foi iniciada.');
});
$('#validatorClearLog').addEventListener('click',()=>{if(!window.confirm('Limpar os registros visuais de partidas validadas deste navegador? Isso não apaga o histórico normal de viagens.'))return;writeArrayKey(GC_VALIDATOR_LOG_KEY,[]);gcValidatorRenderLog();showToast('Histórico visual do validador limpo.');});

// Seleção do chassi e cálculo do consumo pelas porcentagens do painel.
$('#chassisSelect').addEventListener('change', () => {
  const option = $('#chassisSelect').selectedOptions[0];
  $('#tankCapacity').value = option?.dataset.capacity || '';
  $('#tankInitialPercent').value = '';
  $('#tankCurrentPercent').value = '';
  $('#dieselLiters').value = '';
  updateDieselCalculation(); updateCalculation();
});
['tankInitialPercent', 'tankCurrentPercent', 'dieselPrice'].forEach((id) => {
  $('#' + id).addEventListener('input', () => { updateDieselCalculation(); updateCalculation(); });
  $('#' + id).addEventListener('change', () => { updateDieselCalculation(); updateCalculation(); });
});
function updateDieselCalculation() {
  const capacity = readNonNegative($('#tankCapacity'));
  const initial = readPercent($('#tankInitialPercent'));
  const current = readPercent($('#tankCurrentPercent'));
  const price = readNonNegative($('#dieselPrice'));
  const litersInput = $('#dieselLiters');
  if (capacity === null || initial === null || current === null) {
    litersInput.value = '';
    $('#remainingFuelPreview').textContent = '—';
    $('#dieselCostPreview').textContent = '—';
    $('#dieselCalcStatus').textContent = capacity === null ? 'Selecione o chassi para carregar a capacidade do tanque.' : 'Informe porcentagens entre 0% e 100% no início e no final.';
    $('#dieselCalcStatus').classList.remove('warning');
    return false;
  }
  if (current > initial) {
    litersInput.value = '';
    $('#remainingFuelPreview').textContent = `${numberPt(capacity * current / 100, 2)} L`;
    $('#dieselCostPreview').textContent = '—';
    $('#dieselCalcStatus').textContent = 'A porcentagem final é maior que a inicial. Confira os valores ou registre o abastecimento separadamente.';
    $('#dieselCalcStatus').classList.add('warning');
    return false;
  }
  const consumed = capacity * (initial - current) / 100;
  const remaining = capacity * current / 100;
  litersInput.value = consumed.toFixed(2);
  $('#remainingFuelPreview').textContent = `${numberPt(remaining, 2)} L`;
  $('#dieselCostPreview').textContent = money(consumed * (price ?? DIESEL_DEFAULT));
  $('#dieselCalcStatus').textContent = `Consumo estimado de ${numberPt(consumed, 2)} L (${numberPt(initial - current, 2)}% da capacidade).`;
  $('#dieselCalcStatus').classList.remove('warning');
  return true;
}

function getCalculation() {
  const fare = readNonNegative($('#fareValue'));
  const liters = readNonNegative($('#dieselLiters'));
  const dieselPrice = readNonNegative($('#dieselPrice'));
  const revenue = (fare ?? 0) * state.paid;
  const fuelCost = (liters ?? 0) * (dieselPrice ?? DIESEL_DEFAULT);
  const net = revenue - fuelCost;
  const valid = fare !== null && liters !== null && dieselPrice !== null;
  return { fare, liters, dieselPrice, revenue, fuelCost, net, valid, total: state.free + state.paid };
}
function updateCalculation() {
  $('#freeCount').textContent = state.free;
  $('#paidCount').textContent = state.paid;
  $('#totalCount').textContent = state.free + state.paid;
  $('#freeSummary').textContent = state.free;
  $('#paidSummary').textContent = state.paid;
  const result = getCalculation();
  $('#revenueValue').textContent = money(result.revenue);
  $('#fuelCostValue').textContent = money(result.fuelCost);
  const net = $('#liveNet'); net.textContent = money(result.net); net.classList.remove('positive', 'negative', 'neutral');
  const status = $('#liveStatus');
  if (!result.valid) { net.classList.add('neutral'); status.textContent = 'Informe passagem, chassi e porcentagens do tanque para calcular.'; }
  else if (result.net > 0.004) { net.classList.add('positive'); status.textContent = 'Resultado positivo antes de outras despesas.'; }
  else if (result.net < -0.004) { net.classList.add('negative'); status.textContent = 'Resultado negativo considerando apenas o diesel.'; }
  else { net.classList.add('neutral'); status.textContent = 'A arrecadação cobre exatamente o diesel informado.'; }
  $('#breakEvenCount').textContent = result.fare !== null && result.fare > 0 && result.liters !== null ? `${Math.ceil(result.fuelCost / result.fare)} pagantes` : 'Informe a passagem';
}
$$('[data-counter]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.counter; const change = Number(button.dataset.change);
  state[key] = Math.max(0, state[key] + change); updateCalculation();
}));
['fareValue'].forEach((id) => { $('#' + id).addEventListener('input', updateCalculation); $('#' + id).addEventListener('change', updateCalculation); });

// Histórico: viagens agrupadas por dia, mantidas no navegador utilizado.
function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(data) ? data.map((trip) => ({ ...trip, dayId: trip.dayId || 'day-1' })) : [];
  } catch (error) { return []; }
}
function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 2000))); return true; }
  catch (error) { showToast('Não foi possível salvar o histórico neste navegador.'); return false; }
}
function loadDayCount() {
  const stored = Number(localStorage.getItem(DAY_COUNT_KEY) || 1);
  const maxDayFromTrips = loadHistory().reduce((max, trip) => Math.max(max, Number(String(trip.dayId || 'day-1').replace('day-', '')) || 1), 1);
  state.dayCount = Math.max(1, Number.isFinite(stored) ? stored : 1, maxDayFromTrips);
}
function renderDaySelect() {
  const select = $('#daySelect'); const previous = localStorage.getItem(ACTIVE_DAY_KEY) || select.value || 'day-1';
  select.innerHTML = '';
  for (let i=1; i<=state.dayCount; i++) { const option = document.createElement('option'); option.value=`day-${i}`; option.textContent=`Dia ${i}`; select.appendChild(option); }
  select.value = Number(previous.replace('day-', '')) <= state.dayCount && Number(previous.replace('day-', '')) >= 1 ? previous : 'day-1';
  localStorage.setItem(ACTIVE_DAY_KEY, select.value);
  $('#activeDayPill').textContent = `${dayLabel(select.value)} selecionado`;
}
function addDay() {
  state.dayCount += 1;
  localStorage.setItem(DAY_COUNT_KEY, String(state.dayCount));
  renderDaySelect();
  $('#daySelect').value = `day-${state.dayCount}`;
  localStorage.setItem(ACTIVE_DAY_KEY, $('#daySelect').value);
  updateDayUI();
  showToast(`${dayLabel($('#daySelect').value)} criado.`);
}
$('#addDay').addEventListener('click', addDay);
$('#daySelect').addEventListener('change', () => {
  localStorage.setItem(ACTIVE_DAY_KEY, $('#daySelect').value);
  $('#activeDayPill').textContent = `${dayLabel($('#daySelect').value)} selecionado`;
  updateDayUI();
  $('#tripReport').hidden = true;
  if (!$('#groupConectAiPanel').hidden) prefillAIInputs();
});
function sumTrips(trips) {
  return trips.reduce((acc, trip) => {
    acc.count += 1; acc.free += Number(trip.free) || 0; acc.paid += Number(trip.paid) || 0; acc.passengers += Number(trip.total) || 0;
    acc.revenue += Number(trip.revenue) || 0; acc.liters += Number(trip.liters) || 0; acc.fuelCost += Number(trip.fuelCost) || 0; acc.net += Number(trip.net) || 0;
    return acc;
  }, { count:0, free:0, paid:0, passengers:0, revenue:0, liters:0, fuelCost:0, net:0 });
}
function updateDayUI() {
  renderDaySelect();
  const trips = getDayTrips(); const total = sumTrips(trips);
  const stats = [
    ['Viagens', total.count], ['Passageiros', total.passengers], ['Gratuidades', total.free], ['Pagantes', total.paid],
    ['Arrecadação', money(total.revenue)], ['Diesel gasto', `${numberPt(total.liters, 2)} L`], ['Custo diesel', money(total.fuelCost)]
  ];
  $('#daySummary').innerHTML = stats.map(([label,value]) => `<div class="day-summary-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  const dayNet = $('#dayNet'); dayNet.textContent = money(total.net); dayNet.classList.toggle('positive', total.net >= 0); dayNet.classList.toggle('negative', total.net < 0);
  $('#daySummaryNote').textContent = total.count ? `${total.count} ${total.count === 1 ? 'viagem registrada' : 'viagens registradas'} neste dia.` : 'Nenhuma viagem registrada neste dia.';
  $('#historyTitle').textContent = `Viagens do ${dayLabel(getCurrentDayId())}`;
  renderHistory();
  const aiButton = $('#openGroupConectAI');
  aiButton.title = total.count >= 3 ? 'Há dados suficientes para calcular uma média, conforme o mínimo escolhido.' : `Registre pelo menos 3 viagens neste dia (atual: ${total.count}).`;
}
function renderHistory() {
  const trips = getDayTrips(); const container = $('#tripHistory');
  if (!trips.length) { container.innerHTML = '<p class="history-empty">Nenhuma viagem finalizada neste dia.</p>'; return; }
  container.innerHTML = trips.slice(0, 50).map((trip) => {
    const date = new Date(trip.timestamp);
    const dateText = Number.isNaN(date.getTime()) ? 'Data não disponível' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const klass = trip.net > 0.004 ? 'positive' : (trip.net < -0.004 ? 'negative' : '');
    const label = trip.net > 0.004 ? 'Lucro' : (trip.net < -0.004 ? 'Prejuízo' : 'Equilíbrio');
    const bus = trip.busModel ? ` · ${escapeHtml(trip.busModel)} ${escapeHtml(trip.busPrefix || '')}` : '';
    const route = trip.city || trip.line ? ` · ${escapeHtml(trip.city || 'Cidade não informada')} / ${escapeHtml(trip.line || 'Linha não informada')}` : ' · Cidade/linha não cadastradas';
    const needsRouteTag = !String(trip.city||'').trim() || !String(trip.line||'').trim();
    const routeEditor = needsRouteTag ? `<button type="button" class="text-button legacy-trip-edit-button" data-trip-route-edit="${escapeHtml(trip.id)}">Identificar cidade/linha para análise</button>` : '';
    return `<div class="history-item"><div class="history-left"><strong>${label} · ${Number(trip.total)||0} passageiros</strong><small>${dateText} · ${Number(trip.free)||0} gratuidades · ${Number(trip.paid)||0} pagantes${route}${bus}</small>${routeEditor}</div><div class="history-net ${klass}">${money(Number(trip.net)||0)}</div></div>`;
  }).join('');
}

function buildReportMarkup(trip) {
  const verdictClass = trip.net > 0.004 ? '' : (trip.net < -0.004 ? ' loss' : ' neutral');
  let verdict = 'A arrecadação cobriu o custo do diesel informado.';
  if (trip.net > 0.004) verdict = `Lucro de ${money(trip.net)} antes de outras despesas.`;
  if (trip.net < -0.004) verdict = `Prejuízo de ${money(Math.abs(trip.net))} considerando o diesel informado.`;
  return `<div class="report-summary">
    <div class="report-stat"><span>Empresa</span><strong>${escapeHtml(trip.company || 'Não informada')}</strong></div>
    <div class="report-stat"><span>Cidade / linha</span><strong>${escapeHtml(trip.city || 'Sem cidade')} · ${escapeHtml(trip.line || 'Linha não informada')}</strong></div>
    <div class="report-stat"><span>Motorista</span><strong>${escapeHtml(trip.driver || 'Não informado')}</strong></div>
    <div class="report-stat"><span>Ônibus / prefixo</span><strong>${escapeHtml(trip.busModel || 'Não informado')} · ${escapeHtml(trip.busPrefix || '—')}</strong></div>
    <div class="report-stat"><span>Chassi / tanque</span><strong>${escapeHtml(trip.chassis || '—')} · ${trip.tankCapacity ?? '—'} L</strong></div>
    <div class="report-stat"><span>Nível inicial → final</span><strong>${trip.initialPercent ?? '—'}% → ${trip.currentPercent ?? '—'}%</strong></div>
    <div class="report-stat"><span>Gratuidades</span><strong>${trip.free}</strong></div>
    <div class="report-stat"><span>Passagens vendidas</span><strong>${trip.paid}</strong></div>
    <div class="report-stat"><span>Total de passageiros</span><strong>${trip.total}</strong></div>
    <div class="report-stat"><span>Valor da passagem</span><strong>${trip.fare === null ? 'Não informado' : money(trip.fare)}</strong></div>
    <div class="report-stat"><span>Arrecadação</span><strong>${money(trip.revenue)}</strong></div>
    <div class="report-stat"><span>Diesel consumido</span><strong>${trip.liters === null ? 'Não informado' : `${numberPt(trip.liters, 2)} L`}</strong></div>
    <div class="report-stat"><span>Preço / custo do diesel</span><strong>${money(trip.dieselPrice)}/L · ${money(trip.fuelCost)}</strong></div>
  </div><div class="report-verdict${verdictClass}">${verdict}</div>`;
}
function tripText(trip, index) {
  const date = new Date(trip.timestamp).toLocaleString('pt-BR');
  const verdict = trip.net > 0.004 ? `Lucro: ${money(trip.net)}` : trip.net < -0.004 ? `Prejuízo: ${money(Math.abs(trip.net))}` : 'Resultado equilibrado';
  return `${index + 1}. ${date}\nEmpresa: ${trip.company || 'Não informada'}\nCidade: ${trip.city || 'Não informada'}\nLinha: ${trip.line || 'Não informada'}\nMotorista: ${trip.driver || 'Não informado'}\nÔnibus: ${trip.busModel || 'Não informado'} · Prefixo ${trip.busPrefix || '—'}\nChassi: ${trip.chassis || '—'} · Tanque ${trip.tankCapacity ?? '—'} L\nTanque: ${trip.initialPercent ?? '—'}% → ${trip.currentPercent ?? '—'}%\nGratuidades: ${trip.free} | Pagantes: ${trip.paid} | Total de passageiros: ${trip.total}\nPassagem: ${money(trip.fare ?? 0)} | Arrecadação: ${money(trip.revenue)}\nDiesel: ${numberPt(trip.liters ?? 0,2)} L | Preço: ${money(trip.dieselPrice ?? DIESEL_DEFAULT)}/L | Custo: ${money(trip.fuelCost)}\n${verdict}`;
}
function makeDayReport(dayId = getCurrentDayId()) {
  const trips = getDayTrips(dayId); const sum = sumTrips(trips);
  return [`GRUPO CONECT — RELATÓRIO ${dayLabel(dayId).toUpperCase()}`, `Gerado em: ${new Date().toLocaleString('pt-BR')}`, '', `Viagens: ${sum.count}`, `Passageiros: ${sum.passengers} (pagantes: ${sum.paid}; gratuidades: ${sum.free})`, `Arrecadação: ${money(sum.revenue)}`, `Diesel consumido: ${numberPt(sum.liters,2)} L`, `Custo do diesel: ${money(sum.fuelCost)}`, `Resultado estimado: ${money(sum.net)} (antes de outras despesas)`, '', ...trips.slice().reverse().map((trip,index)=>tripText(trip,index))].join('\n\n');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (error) {
    const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly','');
    area.style.position='fixed'; area.style.opacity='0'; document.body.appendChild(area); area.select();
    let copied=false; try { copied=document.execCommand('copy'); } catch (copyError) { copied=false; }
    area.remove(); return copied;
  }
}
$('#copyDayReport').addEventListener('click', async () => {
  const trips=getDayTrips(); if(!trips.length){showToast('Este dia ainda não tem viagens para relatar.');return;}
  showToast(await copyText(makeDayReport()) ? 'Relatório do dia copiado.' : 'Não foi possível copiar automaticamente.');
});
function csvCell(value) { const text=String(value ?? ''); return `"${text.replace(/"/g,'""')}"`; }
$('#exportDayCsv').addEventListener('click', () => {
  const dayId=getCurrentDayId(); const trips=getDayTrips(dayId);
  if(!trips.length){showToast('Este dia ainda não tem viagens para exportar.');return;}
  const headers=['Dia','Data','Empresa','Cidade','Linha','Motorista','Modelo do ônibus','Prefixo','Chassi','Tanque total (L)','Tanque inicial (%)','Tanque final (%)','Gratuidades','Pagantes','Passageiros totais','Valor da passagem (R$)','Arrecadação (R$)','Diesel consumido (L)','Preço diesel (R$/L)','Custo diesel (R$)','Resultado estimado (R$)'];
  const rows=trips.slice().reverse().map(t=>[dayLabel(t.dayId||dayId),new Date(t.timestamp).toLocaleString('pt-BR'),t.company,t.city||'',t.line||'',t.driver,t.busModel,t.busPrefix,t.chassis,t.tankCapacity,t.initialPercent,t.currentPercent,t.free,t.paid,t.total,t.fare,t.revenue,t.liters,t.dieselPrice,t.fuelCost,t.net]);
  const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`grupo-conect-${dayLabel(dayId).toLowerCase().replace(' ','-')}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  showToast('Relatório CSV exportado.');
});

let lastReportText = '';
$('#finishTrip').addEventListener('click', () => {
  if (!state.journey) { showToast('Inicie a viagem e identifique o ônibus primeiro.'); switchScreen('startTripScreen'); return; }
  const calc=getCalculation();
  if(calc.fare===null){$('#fareValue').focus();showToast('Informe o valor da passagem.');return;}
  if($('#chassisSelect').value===''){ $('#chassisSelect').focus();showToast('Selecione o chassi do ônibus.');return; }
  if(!updateDieselCalculation() || calc.liters===null || readPercent($('#tankInitialPercent'))===null || readPercent($('#tankCurrentPercent'))===null){
    $('#tankInitialPercent').focus();showToast('Confira o chassi e as porcentagens inicial e final do tanque.');return;
  }
  if(calc.dieselPrice===null){$('#dieselPrice').focus();showToast('Confira o preço do diesel por litro.');return;}
  if(calc.total===0 && !window.confirm('Nenhum passageiro foi registrado. Deseja finalizar a viagem assim mesmo?')) return;
  const timestamp=new Date().toISOString(); const dayId=getCurrentDayId();
  const trip={
    id:(window.crypto&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`, timestamp, dayId, dayLabel:dayLabel(dayId),
    ...state.journey, chassis:$('#chassisSelect').value, tankCapacity:Number($('#tankCapacity').value),
    initialPercent:Number($('#tankInitialPercent').value), currentPercent:Number($('#tankCurrentPercent').value),
    fare:calc.fare, liters:calc.liters, dieselPrice:calc.dieselPrice, free:state.free, paid:state.paid, total:calc.total,
    revenue:calc.revenue, fuelCost:calc.fuelCost, net:calc.net
  };
  $('#reportContent').innerHTML=buildReportMarkup(trip); $('#tripReport').hidden=false;
  const verdict=trip.net>0.004?`Lucro: ${money(trip.net)}`:trip.net< -0.004?`Prejuízo: ${money(Math.abs(trip.net))}`:'Resultado equilibrado';
  lastReportText=['GRUPO CONECT — RESUMO DA VIAGEM',`Dia: ${trip.dayLabel}`,`Data: ${new Date(timestamp).toLocaleString('pt-BR')}`,`Empresa: ${trip.company}`,`Cidade: ${trip.city || 'Não informada'}`,`Linha: ${trip.line || 'Não informada'}`,`Motorista: ${trip.driver}`,`Ônibus: ${trip.busModel} · Prefixo ${trip.busPrefix}`,`Chassi: ${trip.chassis} · Tanque ${trip.tankCapacity} L`,`Tanque inicial/final: ${trip.initialPercent}% → ${trip.currentPercent}%`,`Gratuidades: ${trip.free}`,`Passagens vendidas: ${trip.paid}`,`Total de passageiros: ${trip.total}`,`Valor da passagem: ${money(trip.fare)}`,`Arrecadação: ${money(trip.revenue)}`,`Diesel consumido: ${numberPt(trip.liters,2)} L`,`Preço do diesel: ${money(trip.dieselPrice)}/L`,`Custo do diesel: ${money(trip.fuelCost)}`,`${verdict} (antes de outras despesas).`].join('\n');
  const history=loadHistory(); history.unshift(trip); saveHistory(history);
  updateDayUI(); $('#tripReport').scrollIntoView({behavior:'smooth',block:'start'}); showToast('Viagem salva no '+trip.dayLabel+'.');
});
$('#copyReport').addEventListener('click', async () => { if(!lastReportText)return; showToast(await copyText(lastReportText)?'Resumo da viagem copiado.':'Não foi possível copiar automaticamente.'); });
$('#newTrip').addEventListener('click', () => {
  state.free=0; state.paid=0; $('#fareValue').value=''; $('#chassisSelect').value=''; $('#tankCapacity').value=''; $('#tankInitialPercent').value=''; $('#tankCurrentPercent').value=''; $('#dieselLiters').value=''; $('#dieselPrice').value=DIESEL_DEFAULT.toFixed(2); $('#tripReport').hidden=true; lastReportText=''; updateDieselCalculation(); updateCalculation(); window.scrollTo({top:0,behavior:'smooth'}); showToast('Dados zerados. Pronto para registrar a próxima viagem.');
});
$('#clearHistory').addEventListener('click', () => {
  const history=loadHistory(); const selected=getCurrentDayId(); const dayTrips=history.filter(t=>(t.dayId||'day-1')===selected);
  if(!dayTrips.length){showToast('Este dia já está vazio.');return;}
  if(window.confirm(`Deseja apagar apenas as viagens do ${dayLabel(selected)} neste navegador?`)) { saveHistory(history.filter(t=>(t.dayId||'day-1')!==selected)); updateDayUI(); showToast(`Histórico do ${dayLabel(selected)} apagado.`); }
});
$('#tripHistory').addEventListener('click',(event)=>{
  const button=event.target.closest('[data-trip-route-edit]');if(!button)return;
  const trip=loadHistory().find(item=>String(item.id)===String(button.dataset.tripRouteEdit));if(!trip){showToast('Não encontrei essa viagem no histórico.');return;}
  $('#legacyTripRouteId').value=String(trip.id);$('#legacyTripRouteCity').value=trip.city||'';$('#legacyTripRouteLine').value=trip.line||'';$('#legacyTripRouteEditor').hidden=false;$('#legacyTripRouteEditor').scrollIntoView({behavior:'smooth',block:'nearest'});
});
$('#cancelLegacyTripRouteEdit').addEventListener('click',()=>{$('#legacyTripRouteEditor').hidden=true;});
$('#legacyTripRouteForm').addEventListener('submit',(event)=>{
  event.preventDefault();const id=$('#legacyTripRouteId').value,city=$('#legacyTripRouteCity').value.trim(),line=$('#legacyTripRouteLine').value.trim();
  if(!id||!city||!line){showToast('Informe cidade e linha antes de salvar.');return;}
  const history=loadHistory(),index=history.findIndex(item=>String(item.id)===String(id));if(index<0){showToast('Não encontrei a viagem para atualizar.');return;}
  history[index]={...history[index],city,line};if(!saveHistory(history))return;
  $('#legacyTripRouteEditor').hidden=true;$('#legacyTripRouteForm').reset();currentProfitReportText='';renderHistory();showToast('Cidade e linha adicionadas ao histórico antigo. Agora ele pode entrar na análise da operação.');
});

// Grupo Conect AI — previsão simples e transparente baseada nas médias registradas.
function prefillAIInputs() {
  const trips=getDayTrips(); const sums=sumTrips(trips);
  $('#aiPassengerTotal').value=String(sums.passengers);
  $('#aiDieselTotal').value=sums.liters.toFixed(2);
  $('#aiMinTrips').value=Math.max(3,Number($('#aiMinTrips').value)||3);
  $('#aiResults').hidden=true; state.lastAiReport='';
  const min=Math.max(3,Number($('#aiMinTrips').value)||3);
  $('#aiStatus').className='ai-status'+(trips.length<min?' warning':'');
  $('#aiStatus').textContent=trips.length<min?`Este dia tem ${trips.length} viagem(ns) registrada(s). São necessárias pelo menos ${min} para calcular uma média confiável.`:`Este dia tem ${trips.length} viagens registradas. Preencha quantas viagens ainda estão previstas e calcule a projeção.`;
}
$('#openGroupConectAI').addEventListener('click', () => {
  $('#groupConectAiPanel').hidden=false; prefillAIInputs(); $('#groupConectAiPanel').scrollIntoView({behavior:'smooth',block:'start'});
});
$('#closeGroupConectAI').addEventListener('click', () => { $('#groupConectAiPanel').hidden=true; });
$('#refreshAiData').addEventListener('click', () => { prefillAIInputs(); showToast('Passageiros e diesel atualizados com os registros do dia.'); });
$('#aiMinTrips').addEventListener('change', () => { const value=Number($('#aiMinTrips').value); if(!Number.isFinite(value)||value<3) $('#aiMinTrips').value='3'; });
$('#aiForecastForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const trips=getDayTrips(); const count=trips.length; const minTrips=Number($('#aiMinTrips').value);
  const passengers=Number($('#aiPassengerTotal').value); const dieselTotal=Number(String($('#aiDieselTotal').value).replace(',','.'));
  const remainingTrips=Number($('#aiRemainingTrips').value); const schedules=$('#aiLineSchedules').value.trim();
  $('#aiResults').hidden=true;
  if(!Number.isInteger(minTrips)||minTrips<3){$('#aiStatus').className='ai-status warning';$('#aiStatus').textContent='O mínimo precisa ser 3 viagens ou mais.';return;}
  if(count<minTrips){$('#aiStatus').className='ai-status warning';$('#aiStatus').textContent=`Previsão bloqueada: ${dayLabel(getCurrentDayId())} tem ${count} viagem(ns). Finalize pelo menos ${minTrips} antes de calcular a média.`;return;}
  if(!Number.isFinite(passengers)||passengers<0||!Number.isFinite(dieselTotal)||dieselTotal<0||!Number.isInteger(remainingTrips)||remainingTrips<1){$('#aiStatus').className='ai-status warning';$('#aiStatus').textContent='Confira passageiros, litros de diesel e o número inteiro de viagens que ainda faltam.';return;}
  if(!schedules){$('#aiStatus').className='ai-status warning';$('#aiStatus').textContent='Informe os horários/linhas que pretende operar no restante do dia para documentar a projeção.';$('#aiLineSchedules').focus();return;}
  const sums=sumTrips(trips);
  const averageRevenue=sums.revenue/count;
  const averageDiesel= dieselTotal/count;
  const weightedPrice=sums.liters>0 ? sums.fuelCost/sums.liters : DIESEL_DEFAULT;
  const projectedDiesel=averageDiesel*remainingTrips;
  const projectedFuelCost=projectedDiesel*weightedPrice;
  const futureRevenue=averageRevenue*remainingTrips;
  const averageProfit=averageRevenue-(averageDiesel*weightedPrice);
  const futureProfit=averageProfit*remainingTrips;
  const averagePassengers=passengers/count;
  const projectedPassengers=averagePassengers*remainingTrips;
  const projectedDayEnd=sums.net+futureProfit;
  $('#aiAvgProfit').textContent=money(averageProfit);
  $('#aiFutureProfit').textContent=money(futureProfit);
  $('#aiAvgDiesel').textContent=`${numberPt(averageDiesel,2)} L`;
  $('#aiFutureDiesel').textContent=`${numberPt(projectedDiesel,2)} L`;
  $('#aiAvgPassengers').textContent=numberPt(averagePassengers,1);
  $('#aiDayEndProfit').textContent=money(projectedDayEnd);
  const summary=`Dia analisado: ${dayLabel(getCurrentDayId())}\nViagens consideradas: ${count} (mínimo definido: ${minTrips})\nHorários/linhas: ${schedules}\n\nMédia usada: ${money(averageRevenue)} de arrecadação por viagem; ${numberPt(averageDiesel,2)} L de diesel por viagem; preço médio de referência ${money(weightedPrice)}/L.\nPara as ${remainingTrips} viagens restantes, a estimativa é arrecadar ${money(futureRevenue)}, consumir ${numberPt(projectedDiesel,2)} L de diesel e obter resultado de ${money(futureProfit)} antes de outras despesas.\nSomando o resultado já registrado (${money(sums.net)}), o resultado projetado para o fim do dia é ${money(projectedDayEnd)}.\nPassageiros: aproximadamente ${numberPt(projectedPassengers,1)} a mais, com média de ${numberPt(averagePassengers,1)} por viagem.\n\nEsta é uma projeção matemática; os resultados reais podem mudar conforme linha, tarifa, trânsito, passageiros e condições do jogo.`;
  $('#aiSummaryText').textContent=summary;
  $('#aiResults').hidden=false;
  $('#aiStatus').className='ai-status success';
  $('#aiStatus').textContent=`Previsão calculada com ${count} viagens registradas em ${dayLabel(getCurrentDayId())}.`; 
  state.lastAiReport=`GRUPO CONECT AI — PREVISÃO\n${summary}`;
  $('#aiResults').scrollIntoView({behavior:'smooth',block:'nearest'});
});
$('#copyAiForecast').addEventListener('click', async () => { if(!state.lastAiReport)return; showToast(await copyText(state.lastAiReport)?'Previsão do Grupo Conect AI copiada.':'Não foi possível copiar automaticamente.'); });

// Ferramentas extras do menu: tarifa, abastecimento, duração, arrecadação, checklist e manutenção.
function readToolValue(id) { return readNonNegative(document.getElementById(id)); }
function toolResultError(containerId, message) {
  const container = document.getElementById(containerId);
  container.hidden = false;
  let error = container.querySelector('.tool-error');
  if (!error) { error = document.createElement('p'); error.className = 'tool-error'; error.setAttribute('role', 'alert'); container.prepend(error); }
  error.textContent = message;
}
function showToolResults(containerId) {
  const container = document.getElementById(containerId);
  container.hidden = false;
  const error = container.querySelector('.tool-error');
  if (error) error.remove();
}
function formatDuration(totalMinutes) {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

// 1) Tarifa estimada: diesel + outros custos opcionais, divididos por pagantes previstos.
$('#tariffForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const km = readToolValue('tariffKm');
  const consumption = readToolValue('tariffConsumption');
  const dieselPrice = readToolValue('tariffDieselPrice');
  const payers = readToolValue('tariffPayers');
  const otherCostsRaw = $('#tariffOtherCosts').value.trim();
  const marginRaw = $('#tariffMargin').value.trim();
  const otherCosts = otherCostsRaw === '' ? 0 : readToolValue('tariffOtherCosts');
  const margin = marginRaw === '' ? 0 : readToolValue('tariffMargin');
  if (km === null || km <= 0 || consumption === null || consumption <= 0 || dieselPrice === null || dieselPrice <= 0 || payers === null || !Number.isInteger(payers) || payers < 1 || otherCosts === null || margin === null || margin > 500) {
    toolResultError('tariffResults', 'Confira os quilômetros, o consumo médio em km/L, o preço do diesel e a quantidade inteira de pagantes.');
    return;
  }
  const liters = km / consumption;
  const fuelCost = liters * dieselPrice;
  const fuelOnlyFare = fuelCost / payers;
  const targetFare = ((fuelCost + otherCosts) * (1 + margin / 100)) / payers;
  showToolResults('tariffResults');
  $('#tariffLitersResult').textContent = `${numberPt(liters, 2)} L`;
  $('#tariffFuelCostResult').textContent = money(fuelCost);
  $('#tariffFuelOnlyResult').textContent = money(fuelOnlyFare);
  $('#tariffSuggestedResult').textContent = money(targetFare);
  $('#tariffExplanation').textContent = `Para ${numberPt(km, 2)} km, o modelo estima ${numberPt(liters, 2)} L de diesel a ${money(dieselPrice)}/L. O custo de combustível dividido por ${payers} pagantes resulta em ${money(fuelOnlyFare)} por pagante. Com ${money(otherCosts)} de outros custos e margem de ${numberPt(margin, 1)}%, a referência fica em ${money(targetFare)} por pagante. Use o consumo real do veículo e confira as regras de tarifa aplicáveis; este cálculo não define tarifa oficial.`;
});

// 2) Planejador de abastecimento pelo nível percentual do tanque.
$('#calculateFuelPlan').addEventListener('click', () => {
  const capacity = readToolValue('fuelPlanCapacity');
  const current = readToolValue('fuelPlanCurrent');
  const target = readToolValue('fuelPlanTarget');
  const price = readToolValue('fuelPlanPrice');
  if (capacity === null || capacity <= 0 || current === null || current > 100 || target === null || target > 100 || price === null || price <= 0) {
    toolResultError('fuelPlanResults', 'Informe a capacidade, porcentagens entre 0% e 100% e um preço de diesel válido.'); return;
  }
  if (target < current) { toolResultError('fuelPlanResults', 'O nível desejado é menor que o nível atual. Escolha uma porcentagem igual ou maior para calcular um abastecimento.'); return; }
  const currentLiters = capacity * current / 100;
  const targetLiters = capacity * target / 100;
  const needed = targetLiters - currentLiters;
  showToolResults('fuelPlanResults');
  $('#fuelPlanLiters').textContent = `${numberPt(needed, 2)} L`;
  $('#fuelPlanCost').textContent = money(needed * price);
  $('#fuelPlanCurrentLiters').textContent = `${numberPt(currentLiters, 2)} L`;
  $('#fuelPlanTargetLiters').textContent = `${numberPt(targetLiters, 2)} L`;
  $('#fuelPlanNote').textContent = needed === 0 ? 'O tanque já está no nível desejado; não seria necessário abastecer.' : `Para subir de ${numberPt(current, 1)}% para ${numberPt(target, 1)}%, a estimativa é abastecer ${numberPt(needed, 2)} L. O valor real pode variar conforme a bomba e a leitura do painel.`;
});

// 3) Estimador de duração de uma linha.
$('#durationForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const km = readToolValue('durationKm');
  const speed = readToolValue('durationSpeed');
  const stops = readToolValue('durationStops');
  const stopMinutes = readToolValue('durationStopMinutes');
  if (km === null || km <= 0 || speed === null || speed <= 0 || stops === null || !Number.isInteger(stops) || stopMinutes === null) {
    toolResultError('durationResults', 'Informe uma distância e velocidade maiores que zero, além de quantidades de paradas válidas.'); return;
  }
  const driving = km / speed * 60;
  const stopped = stops * stopMinutes;
  const total = driving + stopped;
  showToolResults('durationResults');
  $('#durationPretty').textContent = formatDuration(total);
  $('#durationDriveTime').textContent = formatDuration(driving);
  $('#durationStoppedTime').textContent = formatDuration(stopped);
});

// 4) Simulador de arrecadação e ocupação.
$('#revenueForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const fare = readToolValue('simFare');
  const paid = readToolValue('simPaid');
  const free = readToolValue('simFree');
  const capacity = readToolValue('simCapacity');
  if (fare === null || paid === null || free === null || !Number.isInteger(paid) || !Number.isInteger(free) || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) {
    toolResultError('revenueResults', 'Confira a tarifa e informe quantidades inteiras de passageiros. Se preencher a capacidade, ela deve ser pelo menos 1.'); return;
  }
  const total = paid + free;
  const revenue = fare * paid;
  const occupancy = capacity !== null ? (total / capacity * 100) : null;
  showToolResults('revenueResults');
  $('#simRevenueResult').textContent = money(revenue);
  $('#simTotalResult').textContent = String(total);
  $('#simPaidResult').textContent = String(paid);
  $('#simFreeResult').textContent = String(free);
  $('#simOccupancyResult').textContent = occupancy === null ? 'Não calculada' : `${numberPt(occupancy, 1)}%`;
  $('#simRevenueNote').textContent = occupancy !== null && occupancy > 100
    ? `A quantidade informada equivale a ${numberPt(occupancy, 1)}% da capacidade preenchida. Confira os dados: o total ultrapassa a capacidade informada.`
    : `Com ${paid} pagantes a ${money(fare)} e ${free} gratuidades, a arrecadação simulada é ${money(revenue)}. As gratuidades contam no total de passageiros, mas não geram receita nesta simulação.`;
});

// 5) Checklist pré-viagem persistente no navegador atual.
const CHECKLIST_KEY = 'grupoConect.checklist.v1';
const CHECKLIST_LAST_KEY = 'grupoConect.checklist.last.v1';
function loadChecklistState() {
  try { const stored = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '{}'); return stored && typeof stored === 'object' ? stored : {}; }
  catch (error) { return {}; }
}
function checklistItems() { return $$('[data-check-item]'); }
function renderChecklist() {
  const stored = loadChecklistState();
  checklistItems().forEach((box) => { box.checked = Boolean(stored[box.dataset.checkItem]); });
  const checked = checklistItems().filter((box) => box.checked).length;
  $('#checklistProgress').textContent = `${checked} de ${checklistItems().length}`;
  try {
    const last = JSON.parse(localStorage.getItem(CHECKLIST_LAST_KEY) || 'null');
    $('#checklistLastSaved').textContent = last ? `Último registro: ${new Date(last.timestamp).toLocaleString('pt-BR')} · ${last.checked}/${last.total} itens marcados.` : 'Nenhum registro de checklist salvo neste navegador.';
  } catch (error) { $('#checklistLastSaved').textContent = 'Nenhum registro de checklist salvo neste navegador.'; }
}
checklistItems().forEach((box) => box.addEventListener('change', () => {
  const stored = loadChecklistState(); stored[box.dataset.checkItem] = box.checked;
  try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(stored)); } catch (error) {}
  const checked = checklistItems().filter((item) => item.checked).length;
  $('#checklistProgress').textContent = `${checked} de ${checklistItems().length}`;
}));
$('#saveChecklist').addEventListener('click', () => {
  const items = checklistItems();
  const checked = items.filter((item) => item.checked);
  const saved = { timestamp: new Date().toISOString(), checked: checked.length, total: items.length, keys: checked.map((item) => item.dataset.checkItem) };
  try { localStorage.setItem(CHECKLIST_LAST_KEY, JSON.stringify(saved)); } catch (error) { showToast('Não foi possível salvar neste navegador.'); return; }
  renderChecklist();
  showToast(checked.length === items.length ? 'Checklist completo registrado.' : `Checklist parcial salvo: ${checked.length} de ${items.length} itens.`);
});
$('#resetChecklist').addEventListener('click', () => {
  checklistItems().forEach((item) => { item.checked = false; });
  try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify({})); } catch (error) {}
  $('#checklistProgress').textContent = `0 de ${checklistItems().length}`;
  showToast('Checklist desmarcado.');
});
$('#copyChecklist').addEventListener('click', async () => {
  const items = checklistItems(); const checked = items.filter((item) => item.checked);
  const report = ['GRUPO CONECT — CHECKLIST PRÉ-VIAGEM', `Data: ${new Date().toLocaleString('pt-BR')}`, `Progresso: ${checked.length}/${items.length}`, '', ...items.map((item) => `${item.checked ? '[X]' : '[ ]'} ${item.closest('.checklist-item').querySelector('strong').textContent}`), '', 'Este checklist é um lembrete de apoio e não substitui os procedimentos da empresa.'].join('\n');
  showToast(await copyText(report) ? 'Checklist copiado.' : 'Não foi possível copiar automaticamente.');
});

// 6) Agenda de manutenção salva localmente e com exclusão individual.
const MAINTENANCE_KEY = 'grupoConect.maintenance.v1';
function loadMaintenance() {
  try { const items = JSON.parse(localStorage.getItem(MAINTENANCE_KEY) || '[]'); return Array.isArray(items) ? items : []; }
  catch (error) { return []; }
}
function saveMaintenance(items) {
  try { localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(items.slice(0, 500))); return true; }
  catch (error) { showToast('Não foi possível salvar os lembretes neste navegador.'); return false; }
}
function maintenanceStatus(dateValue) {
  if (!dateValue) return { label: 'Sem data', className: 'maintenance-status neutral' };
  const due = new Date(`${dateValue}T00:00:00`); const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { label: 'Data vencida', className: 'maintenance-status overdue' };
  if (diff <= 7) return { label: diff === 0 ? 'Previsto para hoje' : `Previsto em ${diff} dia(s)`, className: 'maintenance-status soon' };
  return { label: 'Agendado', className: 'maintenance-status neutral' };
}
function renderMaintenance() {
  const items = loadMaintenance();
  $('#maintenanceCount').textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
  if (!items.length) { $('#maintenanceList').innerHTML = '<p class="empty-state-text">Nenhum lembrete cadastrado.</p>'; return; }
  $('#maintenanceList').innerHTML = items.slice().sort((a,b) => {
    if (!a.date && !b.date) return String(b.createdAt).localeCompare(String(a.createdAt));
    if (!a.date) return 1; if (!b.date) return -1; return a.date.localeCompare(b.date);
  }).map((item) => {
    const status = maintenanceStatus(item.date);
    const dateText = item.date ? new Date(`${item.date}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem data definida';
    const kmText = item.km !== null && item.km !== undefined && item.km !== '' ? `${numberPt(Number(item.km), 0)} km` : 'Quilometragem não informada';
    return `<article class="maintenance-item"><div class="maintenance-item-top"><div><strong>${escapeHtml(item.task)}</strong><small>${escapeHtml(item.vehicle || 'Veículo não especificado')} · ${escapeHtml(dateText)} · ${escapeHtml(kmText)}</small></div><span class="${status.className}">${escapeHtml(status.label)}</span></div><div class="maintenance-item-bottom"><span class="priority-badge priority-${String(item.priority || 'Normal').toLowerCase()}">Prioridade ${escapeHtml(item.priority || 'Normal')}</span><button type="button" class="maintenance-delete" data-maintenance-delete="${escapeHtml(item.id)}">Excluir</button></div></article>`;
  }).join('');
}
$('#maintenanceForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const task = $('#maintenanceTask').value.trim();
  const vehicle = $('#maintenanceVehicle').value.trim();
  const date = $('#maintenanceDate').value;
  const km = $('#maintenanceKm').value.trim();
  const priority = $('#maintenancePriority').value;
  if (!task) { $('#maintenanceTask').focus(); return; }
  if (km !== '' && (!Number.isFinite(Number(km)) || Number(km) < 0)) { showToast('Informe uma quilometragem válida.'); return; }
  const item = { id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`, task, vehicle, date, km: km === '' ? null : Number(km), priority, createdAt: new Date().toISOString() };
  const items = loadMaintenance(); items.push(item);
  if (!saveMaintenance(items)) return;
  $('#maintenanceForm').reset(); $('#maintenancePriority').value = 'Normal';
  renderMaintenance(); showToast('Lembrete de manutenção salvo.');
});
$('#maintenanceList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-maintenance-delete]');
  if (!button) return;
  const remaining = loadMaintenance().filter((item) => item.id !== button.dataset.maintenanceDelete);
  if (saveMaintenance(remaining)) { renderMaintenance(); showToast('Lembrete removido.'); }
});

// Banco local do navegador para que as fotos de horários continuem disponíveis após recarregar a página.
function openPhotoDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível'));
    const request = indexedDB.open(PHOTO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) db.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir banco de fotos'));
  });
}

async function dbPutPhoto(photo) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
    tx.objectStore(PHOTO_STORE_NAME).put(photo);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const err = tx.error; db.close(); reject(err); };
  });
}
async function dbGetPhotos() {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readonly');
    const req = tx.objectStore(PHOTO_STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('Falha ao ler fotos'));
    tx.oncomplete = () => db.close();
  });
}
async function dbDeletePhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
    tx.objectStore(PHOTO_STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const err = tx.error; db.close(); reject(err); };
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const tempUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(tempUrl);
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Não foi possível processar a imagem'));
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Não foi possível salvar esta imagem'));
        resolve(blob);
      }, 'image/jpeg', 0.84);
    };
    img.onerror = () => { URL.revokeObjectURL(tempUrl); reject(new Error('Arquivo de imagem inválido')); };
    img.src = tempUrl;
  });
}

function revokePhotoUrl(id) {
  const url = state.objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  state.objectUrls.delete(id);
}

function renderPhotos() {
  const grid = $('#photoGrid');
  grid.innerHTML = '';
  $('#photoCount').textContent = `${state.photos.length} ${state.photos.length === 1 ? 'foto' : 'fotos'}`;
  if (!state.photos.length) {
    grid.innerHTML = '<div class="empty-state" id="emptyPhotos"><div class="empty-icon" aria-hidden="true">▧</div><strong>Nenhuma foto por enquanto</strong><span>As fotos que você adicionar aparecerão aqui.</span></div>';
    return;
  }
  state.photos.forEach((photo) => {
    let url = state.objectUrls.get(photo.id);
    if (!url) {
      url = URL.createObjectURL(photo.blob);
      state.objectUrls.set(photo.id, url);
    }
    const card = document.createElement('article');
    card.className = 'photo-card';
    const img = document.createElement('img');
    img.src = url; img.alt = `Foto de horário: ${photo.name}`; img.loading = 'lazy';
    const caption = document.createElement('div'); caption.className = 'photo-card-caption';
    const name = document.createElement('span'); name.className = 'photo-name'; name.textContent = photo.name;
    name.title = photo.name;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-photo'; remove.textContent = 'Remover';
    remove.addEventListener('click', async () => {
      try { await dbDeletePhoto(photo.id); } catch (error) { /* a remoção visual ainda pode prosseguir */ }
      revokePhotoUrl(photo.id);
      state.photos = state.photos.filter((item) => item.id !== photo.id);
      renderPhotos();
      showToast('Foto removida.');
    });
    caption.append(name, remove); card.append(img, caption); grid.append(card);
  });
}

$('#scheduleUpload').addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;
  let added = 0;
  for (const file of files) {
    try {
      const blob = await compressImage(file);
      const photo = {
        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name || `horario-${added + 1}.jpg`,
        blob,
        addedAt: new Date().toISOString()
      };
      await dbPutPhoto(photo);
      state.photos.push(photo);
      added += 1;
    } catch (error) {
      showToast('Uma foto não pôde ser salva neste navegador.');
    }
  }
  renderPhotos();
  if (added) showToast(`${added} ${added === 1 ? 'foto adicionada' : 'fotos adicionadas'}.`);
  event.target.value = '';
});

async function initializePhotos() {
  try {
    state.photos = await dbGetPhotos();
    renderPhotos();
  } catch (error) {
    renderPhotos();
    showToast('O salvamento de fotos não está disponível neste navegador.');
  }
}





// Dez novas ferramentas operacionais. Todos os registros ficam no navegador deste aparelho.
const ODOMETER_KEY = 'grupoConect.odometerRecords.v1';
const FUEL_LOG_KEY = 'grupoConect.fuelLog.v1';
const INCIDENT_KEY = 'grupoConect.incidents.v1';
const ENDCHECK_KEY = 'grupoConect.endChecklist.v1';
const endChecklistIds = ['passageiros','objetos','limpeza','avarias','combustivel','documentos','comunicacao'];
function readArrayKey(key) { try { const data=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(data)?data:[]; } catch(error) { return []; } }
function writeArrayKey(key, items) { try { localStorage.setItem(key, JSON.stringify(items.slice(-1000))); return true; } catch(error) { showToast('Armazenamento cheio ou indisponível neste navegador.'); return false; } }
function dateTodayLocal() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function localDate(value) { if(!value)return 'Sem data'; const d=new Date(`${value}T00:00:00`); return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString('pt-BR'); }
function makeId() { return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function downloadTextFile(name, content, type='text/plain;charset=utf-8') { const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }

// 1. Diário de bordo: hodômetro, distância percorrida e histórico.
function renderOdometer() {
  const rows=readArrayKey(ODOMETER_KEY); const total=rows.reduce((sum,item)=>sum+Number(item.km||0),0);
  $('#odoRecordCount').textContent=String(rows.length); $('#odoTotalKm').textContent=`${numberPt(total,1)} km`;
  const list=$('#odoList'); if(!rows.length){list.innerHTML='<p class="empty-state-text">Nenhum percurso registrado ainda.</p>';return;}
  list.innerHTML=rows.slice().reverse().map(item=>`<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(item.vehicle)} · ${numberPt(item.km,1)} km</strong><small>${escapeHtml(localDate(item.date))} · hodômetro ${numberPt(item.start,1)} → ${numberPt(item.end,1)} km${item.notes?`\n${escapeHtml(item.notes)}`:''}</small></div><button class="record-danger" type="button" data-odo-delete="${escapeHtml(item.id)}">Excluir</button></div></article>`).join('');
  $('#odoRecordCount').textContent=String(rows.length); $('#odoTotalKm').textContent=`${numberPt(total,1)} km`;
}
$('#odoDate').value=dateTodayLocal();
$('#odometerForm').addEventListener('submit',event=>{event.preventDefault(); const date=$('#odoDate').value,vehicle=$('#odoVehicle').value.trim(),start=readToolValue('odoStart'),end=readToolValue('odoEnd'),notes=$('#odoNotes').value.trim(); if(!date||!vehicle||start===null||end===null||end<start){showToast('Confira o veículo e os hodômetros; o final precisa ser igual ou maior que o inicial.');return;} const km=end-start; const rows=readArrayKey(ODOMETER_KEY); rows.push({id:makeId(),date,vehicle,start,end,km,notes,createdAt:new Date().toISOString()}); if(!writeArrayKey(ODOMETER_KEY,rows))return; $('#odoTripKm').textContent=`${numberPt(km,1)} km`; $('#odoResults').hidden=false; $('#odometerForm').reset(); $('#odoDate').value=dateTodayLocal(); renderOdometer(); showToast('Quilometragem registrada.');});
$('#odoList').addEventListener('click',event=>{const b=event.target.closest('[data-odo-delete]');if(!b)return;writeArrayKey(ODOMETER_KEY,readArrayKey(ODOMETER_KEY).filter(x=>x.id!==b.dataset.odoDelete));renderOdometer();showToast('Registro de quilometragem excluído.');});
$('#copyOdoReport').addEventListener('click',async()=>{const rows=readArrayKey(ODOMETER_KEY);const text=['GRUPO CONECT — DIÁRIO DE BORDO',...rows.map(x=>`${localDate(x.date)} | ${x.vehicle} | ${numberPt(x.km,1)} km | ${numberPt(x.start,1)} → ${numberPt(x.end,1)} km${x.notes?' | '+x.notes:''}`),`Total registrado: ${numberPt(rows.reduce((s,x)=>s+Number(x.km||0),0),1)} km`].join('\n');showToast(await copyText(text)?'Relatório do diário de bordo copiado.':'Não foi possível copiar automaticamente.');});

// 2. Histórico de abastecimentos e soma de litros/custos.
function renderFuelLogs() { const rows=readArrayKey(FUEL_LOG_KEY); const liters=rows.reduce((s,x)=>s+Number(x.liters||0),0),cost=rows.reduce((s,x)=>s+Number(x.cost||0),0); $('#fuelLogTotalLiters').textContent=`${numberPt(liters,2)} L`;$('#fuelLogTotalCost').textContent=money(cost); const list=$('#fuelLogList'); if(!rows.length){list.innerHTML='<p class="empty-state-text">Nenhum abastecimento registrado ainda.</p>';return;} list.innerHTML=rows.slice().reverse().map(x=>`<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(x.vehicle)} · ${money(x.cost)}</strong><small>${escapeHtml(localDate(x.date))} · ${numberPt(x.liters,2)} L × ${money(x.price)}/L${x.odometer!==null?` · hodômetro ${numberPt(x.odometer,1)} km`:''}${x.note?`\n${escapeHtml(x.note)}`:''}</small></div><button class="record-danger" type="button" data-fuel-delete="${escapeHtml(x.id)}">Excluir</button></div></article>`).join(''); }
$('#fuelLogForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#fuelLogDate').value,vehicle=$('#fuelLogVehicle').value.trim(),liters=readToolValue('fuelLogLiters'),price=readToolValue('fuelLogPrice'),odomRaw=$('#fuelLogOdometer').value.trim(),odometer=odomRaw===''?null:Number(odomRaw),note=$('#fuelLogNote').value.trim();if(!date||!vehicle||liters===null||liters<=0||price===null||price<=0||(odometer!==null&&(!Number.isFinite(odometer)||odometer<0))){showToast('Preencha os dados do abastecimento corretamente.');return;}const cost=liters*price;const rows=readArrayKey(FUEL_LOG_KEY);rows.push({id:makeId(),date,vehicle,liters,price,cost,odometer,note,createdAt:new Date().toISOString()});if(!writeArrayKey(FUEL_LOG_KEY,rows))return;$('#fuelLogCostResult').textContent=money(cost);$('#fuelLogResults').hidden=false;$('#fuelLogForm').reset();$('#fuelLogDate').value=dateTodayLocal();$('#fuelLogPrice').value=DIESEL_DEFAULT.toFixed(2);renderFuelLogs();showToast('Abastecimento salvo.');});
$('#fuelLogList').addEventListener('click',event=>{const b=event.target.closest('[data-fuel-delete]');if(!b)return;writeArrayKey(FUEL_LOG_KEY,readArrayKey(FUEL_LOG_KEY).filter(x=>x.id!==b.dataset.fuelDelete));renderFuelLogs();showToast('Abastecimento excluído.');});
$('#copyFuelLogReport').addEventListener('click',async()=>{const rows=readArrayKey(FUEL_LOG_KEY);const text=['GRUPO CONECT — ABASTECIMENTOS',...rows.map(x=>`${localDate(x.date)} | ${x.vehicle} | ${numberPt(x.liters,2)} L | ${money(x.price)}/L | total ${money(x.cost)}${x.odometer!==null?' | hodômetro '+numberPt(x.odometer,1)+' km':''}`),`Total: ${numberPt(rows.reduce((s,x)=>s+Number(x.liters||0),0),2)} L / ${money(rows.reduce((s,x)=>s+Number(x.cost||0),0))}`].join('\n');showToast(await copyText(text)?'Relatório de abastecimentos copiado.':'Não foi possível copiar automaticamente.');});
$('#fuelLogDate').value=dateTodayLocal();

// 3. Indicadores de eficiência a partir de uma medição.
$('#efficiencyForm').addEventListener('submit',event=>{event.preventDefault();const km=readToolValue('effKm'),liters=readToolValue('effLiters'),price=readToolValue('effPrice');if(km===null||km<=0||liters===null||liters<=0||price===null){toolResultError('effResults','Informe km e litros maiores que zero e um preço válido.');return;}showToolResults('effResults');$('#effKmPerL').textContent=`${numberPt(km/liters,2)} km/L`;$('#effPer100').textContent=`${numberPt(liters/km*100,2)} L/100 km`;$('#effCostKm').textContent=money(liters*price/km);$('#effTotalCost').textContent=money(liters*price);});

// 4. Meta de arrecadação e pagantes adicionais necessários.
$('#goalForm').addEventListener('submit',event=>{event.preventDefault();const target=readToolValue('goalTarget'),current=readToolValue('goalCurrent'),fare=readToolValue('goalFare');if(target===null||target<=0||current===null||fare===null||fare<=0){toolResultError('goalResults','Informe uma meta positiva, arrecadação atual não negativa e uma tarifa maior que zero.');return;}const remaining=Math.max(0,target-current),need=Math.ceil(remaining/fare),progress=Math.min(100,current/target*100),projected=current+need*fare;showToolResults('goalResults');$('#goalRemaining').textContent=money(remaining);$('#goalPayers').textContent=String(need);$('#goalProgress').textContent=`${numberPt(progress,1)}%`;$('#goalProjected').textContent=money(projected);$('#goalNote').textContent=remaining===0?'Meta atingida. A arrecadação informada já alcançou ou superou o objetivo.':`Faltam ${money(remaining)}. Com tarifa de ${money(fare)}, seriam necessários ${need} pagantes adicionais; a arrecadação pode superar a meta em até ${money(projected-target)} por causa do arredondamento para uma pessoa inteira.`;});

// 5. Grade de saídas gerada por intervalo, com suporte a cruzar meia-noite.
function minToClock(total) { const m=((total%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
$('#timetableForm').addEventListener('submit',event=>{event.preventDefault();const route=$('#timeRoute').value.trim(),startVal=$('#timeStart').value,endVal=$('#timeEnd').value,interval=readToolValue('timeInterval');if(!route||!startVal||!endVal||interval===null||!Number.isInteger(interval)||interval<1||interval>1440){toolResultError('timeResults','Informe linha, horários e um intervalo inteiro entre 1 e 1440 minutos.');return;}const toM=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));let start=toM(startVal),end=toM(endVal);if(end<start)end+=1440;const times=[];for(let m=start;m<=end&&times.length<500;m+=interval)times.push(minToClock(m));if(!times.length){toolResultError('timeResults','Não foi possível gerar os horários.');return;}showToolResults('timeResults');$('#timeResultTitle').textContent=route;$('#timeDepartureCount').textContent=`${times.length} saídas`;$('#timeResultText').value=`GRUPO CONECT — GRADE DE HORÁRIOS\nLinha: ${route}\nIntervalo: ${interval} minuto(s)\n\n${times.map((t,i)=>`${String(i+1).padStart(2,'0')}. ${t}`).join('\n')}${times.length===500?'\n\nGrade limitada a 500 saídas.':''}`;});
$('#copyTimetable').addEventListener('click',async()=>showToast(await copyText($('#timeResultText').value)?'Grade de horários copiada.':'Não foi possível copiar automaticamente.'));

// 6. Turno, intervalo e tempo líquido com suporte a horários que passam da meia-noite.
function clockMinutes(v){return v?Number(v.slice(0,2))*60+Number(v.slice(3,5)):null;}
$('#shiftForm').addEventListener('submit',event=>{event.preventDefault();const start=clockMinutes($('#shiftStart').value),endInput=clockMinutes($('#shiftEnd').value),breakStartInput=clockMinutes($('#shiftBreakStart').value),breakEndInput=clockMinutes($('#shiftBreakEnd').value);if(start===null||endInput===null||start===endInput){toolResultError('shiftResults','Informe entrada e saída válidas, com horários diferentes.');return;}let end=endInput;if(end<=start)end+=1440;let pause=0;if((breakStartInput===null)!==(breakEndInput===null)){toolResultError('shiftResults','Preencha início e fim do intervalo ou deixe os dois vazios.');return;}if(breakStartInput!==null){let bs=breakStartInput,be=breakEndInput;while(bs<start)bs+=1440;while(be<bs)be+=1440;if(bs<start||be>end||be===bs){toolResultError('shiftResults','O intervalo precisa ocorrer dentro do turno e ter duração maior que zero.');return;}pause=be-bs;}const elapsed=end-start,net=elapsed-pause;showToolResults('shiftResults');$('#shiftElapsed').textContent=formatDuration(elapsed);$('#shiftBreak').textContent=formatDuration(pause);$('#shiftNet').textContent=formatDuration(net);$('#shiftNote').textContent=`Tempo líquido matemático: ${formatDuration(net)}. Esse cálculo é informativo e não determina pagamento, horas extras ou conformidade legal.`;});

// 7. Registro persistente de ocorrências com exclusão.
function renderIncidents(){const rows=readArrayKey(INCIDENT_KEY),list=$('#incidentList');if(!rows.length){list.innerHTML='<p class="empty-state-text">Nenhuma ocorrência registrada.</p>';return;}list.innerHTML=rows.slice().reverse().map(x=>`<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(x.type)} · ${escapeHtml(x.vehicle)}</strong><small>${escapeHtml(localDate(x.date))} ${escapeHtml(x.time)} · Prioridade ${escapeHtml(x.severity)}\n${escapeHtml(x.description)}</small><span class="record-inline-tag">${escapeHtml(x.severity)}</span></div><button class="record-danger" type="button" data-incident-delete="${escapeHtml(x.id)}">Excluir</button></div></article>`).join('');}
$('#incidentDate').value=dateTodayLocal();
$('#incidentForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#incidentDate').value,time=$('#incidentTime').value,vehicle=$('#incidentVehicle').value.trim(),type=$('#incidentType').value,severity=$('#incidentSeverity').value,description=$('#incidentDescription').value.trim();if(!date||!time||!vehicle||!type||!description){showToast('Preencha todos os campos obrigatórios da ocorrência.');return;}const rows=readArrayKey(INCIDENT_KEY);rows.push({id:makeId(),date,time,vehicle,type,severity,description,createdAt:new Date().toISOString()});if(!writeArrayKey(INCIDENT_KEY,rows))return;$('#incidentForm').reset();$('#incidentDate').value=dateTodayLocal();$('#incidentSeverity').value='Informativa';renderIncidents();showToast('Ocorrência registrada.');});
$('#incidentList').addEventListener('click',event=>{const b=event.target.closest('[data-incident-delete]');if(!b)return;writeArrayKey(INCIDENT_KEY,readArrayKey(INCIDENT_KEY).filter(x=>x.id!==b.dataset.incidentDelete));renderIncidents();showToast('Ocorrência excluída.');});
$('#copyIncidents').addEventListener('click',async()=>{const rows=readArrayKey(INCIDENT_KEY);const text=['GRUPO CONECT — RELATÓRIO DE OCORRÊNCIAS',...rows.map(x=>`${localDate(x.date)} ${x.time} | ${x.vehicle} | ${x.type} | ${x.severity}\n${x.description}`)].join('\n\n');showToast(await copyText(text)?'Relatório de ocorrências copiado.':'Não foi possível copiar automaticamente.');});

// 8. Checklist de encerramento de viagem, com estado salvo localmente.
function loadEndChecklist(){try{const x=JSON.parse(localStorage.getItem(ENDCHECK_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return{};}}
function renderEndChecklist(){const data=loadEndChecklist();$$('[data-endcheck]').forEach(box=>box.checked=Boolean(data[box.dataset.endcheck]));const count=$$('[data-endcheck]').filter(box=>box.checked).length;$('#endCheckProgress').textContent=`${count} de ${endChecklistIds.length}`;if(data.savedAt)$('#endCheckSaved').textContent=`Última conferência salva: ${new Date(data.savedAt).toLocaleString('pt-BR')} · ${count}/${endChecklistIds.length} itens marcados.`;}
$$('[data-endcheck]').forEach(box=>box.addEventListener('change',()=>{const data=loadEndChecklist();data[box.dataset.endcheck]=box.checked;try{localStorage.setItem(ENDCHECK_KEY,JSON.stringify(data));}catch(e){}renderEndChecklist();}));
$('#saveEndChecklist').addEventListener('click',()=>{const data=loadEndChecklist();data.savedAt=new Date().toISOString();try{localStorage.setItem(ENDCHECK_KEY,JSON.stringify(data));renderEndChecklist();showToast('Conferência de fim de viagem salva.');}catch(e){showToast('Não foi possível salvar a conferência.');}});
$('#resetEndChecklist').addEventListener('click',()=>{try{localStorage.removeItem(ENDCHECK_KEY);}catch(e){}renderEndChecklist();showToast('Checklist de encerramento desmarcado.');});
$('#copyEndChecklist').addEventListener('click',async()=>{const data=loadEndChecklist();const text=['GRUPO CONECT — CHECKLIST DE FIM DE VIAGEM',`Data: ${new Date().toLocaleString('pt-BR')}`,...$$('[data-endcheck]').map(box=>`${box.checked?'[X]':'[ ]'} ${box.closest('.checklist-item').querySelector('strong').textContent}`),'','Este checklist é um lembrete de apoio e não substitui os procedimentos oficiais.'].join('\n');showToast(await copyText(text)?'Checklist de encerramento copiado.':'Não foi possível copiar automaticamente.');});

// 9. Comparação estimada de duas linhas com a mesma referência de preço de diesel.
$('#routeCompareForm').addEventListener('submit',event=>{event.preventDefault();const diesel=readToolValue('compareDieselPrice');if(diesel===null||diesel<=0){toolResultError('routeCompareResults','Informe um preço válido do diesel.');return;}const routes=['A','B'].map(k=>({name:$('#compare'+k+'Name').value.trim(),km:readToolValue('compare'+k+'Km'),eff:readToolValue('compare'+k+'Eff'),fare:readToolValue('compare'+k+'Fare'),payers:readToolValue('compare'+k+'Payers')}));if(routes.some(r=>!r.name||r.km===null||r.km<=0||r.eff===null||r.eff<=0||r.fare===null||r.payers===null||!Number.isInteger(r.payers))){toolResultError('routeCompareResults','Confira o nome, km, consumo, tarifa e quantidade inteira de pagantes das duas linhas.');return;}const calc=r=>({...r,liters:r.km/r.eff,cost:r.km/r.eff*diesel,revenue:r.fare*r.payers,net:r.fare*r.payers-r.km/r.eff*diesel});const data=routes.map(calc);showToolResults('routeCompareResults');$('#routeCompareCards').innerHTML=data.map((r,i)=>`<article class="compare-route"><span class="route-card-tag">${i===0?'LINHA A':'LINHA B'}</span><h3>${escapeHtml(r.name)}</h3><div class="tool-result-grid"><article class="tool-stat"><span>Diesel estimado</span><strong>${numberPt(r.liters,2)} L</strong></article><article class="tool-stat"><span>Custo do diesel</span><strong>${money(r.cost)}</strong></article><article class="tool-stat"><span>Arrecadação</span><strong>${money(r.revenue)}</strong></article><article class="tool-stat ${r.net>=0?'tool-stat-highlight':''}"><span>Resultado antes de outros custos</span><strong>${money(r.net)}</strong></article></div></article>`).join('');const better=data[0].net===data[1].net?'As duas linhas têm o mesmo resultado estimado.':`${data[0].net>data[1].net?data[0].name:data[1].name} tem o maior resultado estimado nesta simulação.`;$('#routeCompareNote').textContent=`${better} O cálculo considera apenas arrecadação de pagantes menos diesel e depende das médias informadas; não inclui outros custos.`;});

// 10. Backup/restore dos dados no localStorage pertencentes ao Grupo Conect.
let selectedBackupFile=null;
function collectBackup(){const data={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith('grupoConect.'))data[key]=localStorage.getItem(key);}return {app:'Grupo Conect',format:'localStorage-backup',version:1,exportedAt:new Date().toISOString(),data};}
$('#downloadBackup').addEventListener('click',()=>{const backup=collectBackup();downloadTextFile(`grupo-conect-backup-${dateTodayLocal()}.json`,JSON.stringify(backup,null,2),'application/json;charset=utf-8');$('#backupStatus').textContent=`Backup gerado com ${Object.keys(backup.data).length} conjunto(s) de dados. Guarde o arquivo em local seguro.`;showToast('Backup JSON baixado.');});
$('#backupFile').addEventListener('change',event=>{selectedBackupFile=event.target.files?.[0]||null;$('#restoreBackup').disabled=!selectedBackupFile;$('#backupStatus').textContent=selectedBackupFile?`Arquivo selecionado: ${selectedBackupFile.name}. Clique em Restaurar para validar e importar.`:'Nenhum arquivo selecionado.';});
$('#restoreBackup').addEventListener('click',()=>{if(!selectedBackupFile)return;const reader=new FileReader();reader.onload=()=>{let backup;try{backup=JSON.parse(String(reader.result||''));}catch(e){$('#backupStatus').textContent='Arquivo inválido: não é um JSON legível.';return;}if(!backup||backup.app!=='Grupo Conect'||backup.format!=='localStorage-backup'||backup.version!==1||!backup.data||typeof backup.data!=='object'||Array.isArray(backup.data)){ $('#backupStatus').textContent='Arquivo não reconhecido como backup do Grupo Conect.';return;}if(!window.confirm('Restaurar este backup? Os valores locais das chaves incluídas no arquivo serão substituídos. Recomendamos baixar um backup atual antes de continuar.'))return;try{const entries=Object.entries(backup.data);if(entries.some(([key,value])=>!key.startsWith('grupoConect.')||typeof value!=='string')){ $('#backupStatus').textContent='Backup recusado: contém chaves ou valores fora do formato esperado.';return;}entries.forEach(([key,value])=>localStorage.setItem(key,value));$('#backupStatus').textContent=`Backup restaurado: ${entries.length} conjunto(s) de dados. A página será recarregada para atualizar os registros.`;showToast('Backup restaurado.');setTimeout(()=>window.location.reload(),900);}catch(e){$('#backupStatus').textContent='Não foi possível restaurar. Confira o espaço de armazenamento do navegador.';}};reader.onerror=()=>$('#backupStatus').textContent='Não foi possível ler o arquivo selecionado.';reader.readAsText(selectedBackupFile);});


// Funções Extras do Dono: análises práticas conectadas aos dados já salvos no simulador.
function oeRenderOverview(){
  const operations=syncOperationRows(Date.now()), cash=cashBreakdown();
  const active=operations.filter(operationIsRunning).length;
  const paused=operations.filter(x=>x.status==='pausada').length;
  const stopped=operations.filter(x=>x.status==='fora de operação'||x.status==='parada técnica').length;
  const trips=operations.reduce((sum,x)=>sum+Math.max(0,Number(x.completedTrips)||0),0);
  const gross=operations.reduce((sum,x)=>sum+(Number(operationSummary(x).totals.revenue)||0),0);
  const fuel=operations.reduce((sum,x)=>sum+(Number(operationSummary(x).totals.fuelCost)||0),0);
  const net=operations.reduce((sum,x)=>sum+operationLifetimeNet(x),0);
  $('#oeOverviewResult').innerHTML=[
    ['Linhas cadastradas',String(operations.length)],['Em operação',String(active)],['Pausadas',String(paused)],['Fora de operação',String(stopped)],
    ['Viagens concluídas',String(trips)],['Arrecadação da operação',money(gross)],['Diesel estimado',money(fuel)],['Lucro acumulado da operação',money(net),net>=0?'positive':'negative'],['Saldo atual do caixa',money(cash.balance),cash.balance>=0?'positive':'negative']
  ].map(([l,v,k])=>moneyStat(l,v,k||'')).join('');
  const drivers=new Map();
  operations.forEach(op=>Object.values(op.driverTotals||{}).forEach(d=>{const name=String(d.name||'Motorista não definido'),key=`${norm(op.company)}|${norm(name)}`;if(!drivers.has(key))drivers.set(key,{company:op.company||'Empresa',name,trips:0,revenue:0,fuel:0,net:0});const r=drivers.get(key);r.trips+=Number(d.trips)||0;r.revenue+=Number(d.revenue)||0;r.fuel+=Number(d.fuelCost)||0;r.net+=Number(d.net)||0;}));
  const ranked=[...drivers.values()].sort((a,b)=>b.net-a.net).slice(0,6);
  $('#oeOverviewDrivers').innerHTML=ranked.length?`<p class="tool-result-note"><strong>Melhores resultados acumulados por motorista (até 6):</strong></p>`+ranked.map(d=>`<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(d.name)} · ${escapeHtml(d.company)}</strong><small>${d.trips} viagem(ns) · arrecadação ${money(d.revenue)} · diesel ${money(d.fuel)}</small></div><strong class="${d.net>=0?'positive':'negative'}">${money(d.net)}</strong></div></article>`).join(''):recordsEmpty('Nenhum motorista tem viagem concluída na operação ainda.');
}
function oeUpdateProjectionOptions(){
  const select=$('#oeProjectionOperation');if(!select)return;
  const previous=select.value, operations=syncOperationRows(Date.now());
  populateSelect(select,operations.length?'Selecione uma operação':'Nenhuma operação cadastrada',operations.map(x=>({value:String(x.id),label:`${x.company} · ${x.city} · ${x.line} · prefixo ${x.prefix} (${x.status||'sem status'})`})));
  if(operations.some(x=>String(x.id)===previous))select.value=previous;
}
function oeRunProjection(){
  if(!assertOwner())return;
  const id=$('#oeProjectionOperation').value, extra=readToolValue('oeProjectionTrips');
  const operations=syncOperationRows(Date.now()),op=operations.find(x=>String(x.id)===String(id));
  if(!op||extra===null||!Number.isInteger(extra)||extra<0||extra>300){$('#oeProjectionResult').innerHTML=moneyStat('Aviso','Selecione uma operação e informe 0–300 viagens.');return;}
  const actualTrips=Math.max(0,Number(op.completedTrips)||0),actualNet=operationLifetimeNet(op);
  const economics=op.unitEconomics||operationEconomics(op.company,op.city,op.line),unitNet=Number(economics.unitNet)||0;
  const forecast=actualNet+extra*unitNet;
  $('#oeProjectionResult').innerHTML=[['Viagens concluídas',String(actualTrips)],['Resultado já registrado',money(actualNet),actualNet>=0?'positive':'negative'],['Média estimada por viagem',money(unitNet),unitNet>=0?'positive':'negative'],['Resultado das viagens adicionais',money(extra*unitNet),(extra*unitNet)>=0?'positive':'negative'],['Projeção após as viagens',money(forecast),forecast>=0?'positive':'negative']].map(([l,v,k])=>moneyStat(l,v,k||'')).join('')+`<p class="tool-result-note owner-extra-note">Base: ${escapeHtml(economics.sampleCount?`${economics.sampleCount} viagem(ns) do histórico normal`:'estimativa usada pela operação por falta de histórico compatível')}. A projeção não lança dinheiro no caixa; ele só muda quando a viagem realmente termina no simulador.</p>`;
}
function oeCheckCashReserve(){
  if(!assertOwner())return;
  const balance=cashBreakdown().balance,today=dateTodayLocal(),td=dateFromISO(today);td.setDate(td.getDate()+30);const horizon=`${td.getFullYear()}-${String(td.getMonth()+1).padStart(2,'0')}-${String(td.getDate()).padStart(2,'0')}`;
  const dueRows=financedBuses().filter(f=>(Number(f.paidCount)||0)<(Number(f.installmentCount)||0)).map(f=>{const due=addMonthsToISO(f.firstDueDate,Number(f.paidCount)||0),late=daysLateFrom(due),fine=late?Number(f.installmentAmount||0)*Number(f.lateFinePct||0)/100:0,interest=late?Number(f.installmentAmount||0)*Number(f.lateInterestPct||0)/100*(late/30):0;return {...f,due,late,total:Number(f.installmentAmount||0)+fine+interest};}).filter(f=>f.due&&f.due<=horizon).sort((a,b)=>a.due.localeCompare(b.due));
  const dueTotal=dueRows.reduce((sum,f)=>sum+f.total,0),after=balance-dueTotal;
  $('#oeCashReserveResult').innerHTML=[['Saldo disponível agora',money(balance),balance>=0?'positive':'negative'],['Parcelas vencidas/próximos 30 dias',String(dueRows.length)],['Valor estimado a reservar',money(dueTotal)],['Saldo após reservar parcelas',money(after),after>=0?'positive':'negative']].map(([l,v,k])=>moneyStat(l,v,k||'')).join('')+`<p class="tool-result-note owner-extra-note">Período analisado: ${localDate(today)} até ${localDate(horizon)}. Encargos de atraso são estimados com as taxas configuradas em cada contrato.</p>`;
  $('#oeCashReserveList').innerHTML=dueRows.length?dueRows.map(f=>`<article class="record-item"><div><strong>${escapeHtml(f.company)} · ${escapeHtml(f.prefix)} · ${escapeHtml(f.model)}</strong><small>Vencimento ${localDate(f.due)} · ${f.late?`${f.late} dia(s) em atraso`:'dentro do horizonte'} · ${f.installmentCount-f.paidCount} parcela(s) restante(s)</small></div><strong>${money(f.total)}</strong></article>`).join(''):recordsEmpty('Não há parcelas vencidas ou com vencimento nos próximos 30 dias.');
}
function oeRenderAudit(targetId,items,emptyText){
  const el=$('#'+targetId);if(!el)return;
  if(!items.length){el.innerHTML=`<div class="owner-extra-status success"><strong>✓ Nenhum conflito detectado</strong><p>${escapeHtml(emptyText)}</p></div>`;return;}
  el.innerHTML=`<div class="owner-extra-status warning"><strong>⚠ ${items.length} alerta(s) para revisar</strong><ul>${items.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><p>Confira os cadastros antes de considerar a escala definitiva.</p></div>`;
}
function oeAuditFleet(){
  if(!assertOwner())return;
  const alerts=[],groups=new Map();
  ownerScales().filter(x=>x.date&&x.company&&x.prefix).forEach(x=>{const key=`${x.date}|${norm(x.company)}|${norm(x.prefix)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);});
  groups.forEach(rows=>{const lines=[...new Set(rows.map(x=>`${x.city||''} · ${x.line||''}`))];if(lines.length>1)alerts.push(`${rows[0].company} · prefixo ${rows[0].prefix} · ${localDate(rows[0].date)} aparece em ${lines.join(' / ')}.`);});
  const running=ownerOperations().filter(operationIsRunning),opGroups=new Map();running.forEach(op=>{const key=`${norm(op.company)}|${norm(op.prefix)}`;if(!opGroups.has(key))opGroups.set(key,[]);opGroups.get(key).push(op);});
  opGroups.forEach(rows=>{const lines=[...new Set(rows.map(x=>`${x.city} · ${x.line}`))];if(lines.length>1)alerts.push(`${rows[0].company} · prefixo ${rows[0].prefix} está em ${rows.length} operações ativas: ${lines.join(' / ')}.`);});
  oeRenderAudit('oeFleetAuditResult',alerts,'Os prefixos das escalas salvas e das operações ativas não aparecem duplicados por data/linha.');
}
function oeAuditDrivers(){
  if(!assertOwner())return;
  const active=ownerOperations().filter(operationIsRunning),groups=new Map();
  active.forEach(op=>{[['manhã','morning'],['tarde','afternoon'],['noite','night']].forEach(([label,key])=>{const name=String(op.drivers?.[key]||'').trim();if(!name)return;const groupKey=`${profitMatchKey(name)}|${key}`;if(!groups.has(groupKey))groups.set(groupKey,{name,shift:label,ops:[]});groups.get(groupKey).ops.push(op);});});
  const alerts=[];groups.forEach(g=>{if(g.ops.length>1){const lines=[...new Set(g.ops.map(o=>`${o.company} · ${o.city} · ${o.line}`))];if(lines.length>1)alerts.push(`${g.name} aparece no turno da ${g.shift} em ${lines.join(' / ')}.`);}});
  oeRenderAudit('oeDriverAuditResult',alerts,'Nenhum motorista aparece em mais de uma linha ativa no mesmo turno. Linhas pausadas não entram nesta verificação.');
}
function oeRankRoutes(){
  if(!assertOwner())return;
  const groups=new Map();
  loadHistory().filter(t=>t.company&&t.city&&t.line).forEach(t=>{const key=[t.company,t.city,t.line].map(profitMatchKey).join('|');if(!groups.has(key))groups.set(key,{company:t.company,city:t.city,line:t.line,count:0,revenue:0,fuel:0,net:0,days:new Set()});const g=groups.get(key);g.count++;g.revenue+=Number(t.revenue)||0;g.fuel+=Number(t.fuelCost)||0;g.net+=historicalTripNet(t);g.days.add(t.dayId||t.dayLabel||'Dia sem identificação');});
  const rows=[...groups.values()].map(g=>({...g,average:g.count?g.net/g.count:0})).sort((a,b)=>b.average-a.average);
  if(!rows.length){$('#oeRouteRankingResult').innerHTML='<div class="owner-extra-status"><strong>Sem dados suficientes</strong><p>Finalize viagens normais e identifique empresa, cidade e nome da linha para montar o ranking.</p></div>';return;}
  const top=rows.slice(0,3), bottom=rows.slice(-Math.min(3,rows.length)).reverse();
  const render=(r,label)=>`<article class="record-item"><div class="record-item-top"><div><strong>${label} · ${escapeHtml(r.company)} · ${escapeHtml(r.line)}</strong><small>${escapeHtml(r.city)} · ${r.count} viagem(ns) em ${r.days.size} dia(s) · arrecadação ${money(r.revenue)} · diesel ${money(r.fuel)}</small></div><strong class="${r.average>=0?'positive':'negative'}">Média ${money(r.average)}<small class="oe-small-stat">Total ${money(r.net)}</small></strong></div></article>`;
  $('#oeRouteRankingResult').innerHTML=`<p class="tool-result-note"><strong>Melhores médias</strong></p>${top.map((r,i)=>render(r,`#${i+1}`)).join('')}<p class="tool-result-note"><strong>Menores médias</strong></p>${bottom.map(r=>render(r,'Revisar')).join('')}<p class="tool-result-note owner-extra-note">O resultado considera arrecadação menos diesel. Não inclui despesas que não foram registradas na viagem. O ranking só usa registros com empresa, cidade e linha.</p>`;
}
function oeCalcFare(event){
  event.preventDefault();if(!assertOwner())return;
  const payers=readToolValue('oeFarePayers'),diesel=readToolValue('oeFareDiesel'),labor=readToolValue('oeFareLabor'),maintenance=readToolValue('oeFareMaintenance'),fixed=readToolValue('oeFareFixed'),margin=readToolValue('oeFareMarginPct');
  if([payers,diesel,labor,maintenance,fixed,margin].some(v=>v===null)||!Number.isInteger(payers)||payers<1||margin>300){$('#oeFareResult').innerHTML=moneyStat('Aviso','Confira os números; pagantes precisa ser inteiro e margem entre 0% e 300%.');return;}
  const costs=diesel+labor+maintenance+fixed,required=costs*(1+margin/100)/payers,breakEven=costs/payers;
  $('#oeFareResult').innerHTML=[['Custos do período',money(costs)],['Tarifa para empatar',money(breakEven)],['Tarifa com margem',money(required)],['Receita necessária',money(required*payers)]].map(([l,v])=>moneyStat(l,v)).join('')+`<p class="tool-result-note owner-extra-note">Estimativa de ${money(required)} por pagante. Arredonde conforme a regra tarifária do seu cenário e confira se todos os custos correspondem ao mesmo período.</p>`;
}
function oeCalcFuel(event){
  event.preventDefault();if(!assertOwner())return;
  const km=readToolValue('oeFuelKm'),trips=readToolValue('oeFuelTrips'),eff=readToolValue('oeFuelEfficiency'),price=readToolValue('oeFuelPrice'),days=readToolValue('oeFuelDays');
  if([km,trips,eff,price,days].some(v=>v===null)||km<=0||eff<=0||price<0||!Number.isInteger(trips)||trips<1||!Number.isInteger(days)||days<1){$('#oeFuelResult').innerHTML=moneyStat('Aviso','Confira km, consumo, viagens, preço e dias de operação.');return;}
  const dailyKm=km*trips,dailyLiters=dailyKm/eff,dailyCost=dailyLiters*price,monthlyLiters=dailyLiters*days,monthlyCost=dailyCost*days;
  $('#oeFuelResult').innerHTML=[['Km por dia',`${numberPt(dailyKm,1)} km`],['Diesel por dia',`${numberPt(dailyLiters,2)} L`],['Custo diário',money(dailyCost)],['Diesel por mês',`${numberPt(monthlyLiters,1)} L`],['Custo mensal',money(monthlyCost)]].map(([l,v])=>moneyStat(l,v)).join('');
}
function oeCalcFleetReserve(){
  if(!assertOwner())return;
  const company=$('#oeReserveCompany').value,peak=readToolValue('oeReservePeak'),pct=readToolValue('oeReservePct');
  if(!company||peak===null||pct===null||!Number.isInteger(peak)||peak<1||!Number.isInteger(pct)||pct<0||pct>100){$('#oeFleetReserveResult').innerHTML=moneyStat('Aviso','Informe empresa, demanda inteira e reserva entre 0% e 100%.');return;}
  const buses=availableBusPool(company),count=buses.length,reserve=Math.ceil(peak*pct/100),needed=peak+reserve,short=Math.max(0,needed-count);
  $('#oeFleetReserveResult').innerHTML=[['Frota registrada',String(count)],['Ônibus necessários para operar',String(peak)],['Reserva recomendada',String(reserve)],['Total desejável',String(needed)],['Situação',short?`Faltam ${short} ônibus`:'Frota suficiente',short?'negative':'positive']].map(([l,v,k])=>moneyStat(l,v,k||'')).join('')+`<p class="tool-result-note owner-extra-note">A frota consultada considera ${escapeHtml(company)}. O cálculo não muda a escala: use o resultado como recomendação e confira veículos já atribuídos a outras linhas na mesma data.</p>`;
}
function oeRenderBackupSummary(){
  const backup=collectBackup(), data=backup.data;
  const countKey=(key)=>{try{const x=JSON.parse(data[key]||'null');return Array.isArray(x)?x.length:(x&&typeof x==='object'?Object.keys(x).length:(data[key]!==undefined?1:0));}catch(e){return data[key]!==undefined?1:0;}};
  const entries=[['Conjuntos de dados',String(Object.keys(data).length)],['Viagens normais',String(countKey(HISTORY_KEY))],['Linhas de operação',String(countKey(OPERATION_KEY))],['Escalas salvas',String(countKey(OWNER_SCALE_KEY))],['Ônibus financiados',String(countKey(FINANCED_BUSES_KEY))],['Movimentos manuais do caixa',String(countKey(CASH_LEDGER_KEY))],['Registros de GPS',String(countKey(GC_GPS_STORAGE_KEY))],['Dias do intermunicipal',String(countKey(GC_IC_STORAGE_KEY))]];
  $('#oeBackupSummary').innerHTML=entries.map(([l,v])=>moneyStat(l,v)).join('')+'<p class="tool-result-note owner-extra-note">O arquivo inclui todas as chaves localStorage que começam com “grupoConect.”. Fotos de horários guardadas separadamente no IndexedDB podem exigir exportação própria; confirme o backup antes de trocar de aparelho.</p>';
}
$('#ownerExtrasToggle').addEventListener('click',()=>{
  if(!assertOwner())return;
  const panel=$('#ownerExtraFunctionsPanel'),open=panel.hidden;
  panel.hidden=!open;$('#ownerExtrasToggle').setAttribute('aria-expanded',String(open));$('#ownerExtrasToggle').textContent=open?'🧰 Ocultar Funções Extras do Dono ↑':'🧰 Abrir Funções Extras do Dono →';
  if(open){oeUpdateProjectionOptions();oeRenderOverview();oeCheckCashReserve();oeAuditFleet();oeAuditDrivers();oeRankRoutes();oeRenderBackupSummary();panel.scrollIntoView({behavior:'smooth',block:'start'});}
});
$('#ownerExtrasClose').addEventListener('click',()=>{ $('#ownerExtraFunctionsPanel').hidden=true;$('#ownerExtrasToggle').setAttribute('aria-expanded','false');$('#ownerExtrasToggle').textContent='🧰 Abrir Funções Extras do Dono →';$('#ownerExtrasToggle').scrollIntoView({behavior:'smooth',block:'center'});});
$('#oeRefreshOverview').addEventListener('click',oeRenderOverview);
$('#oeRunProjection').addEventListener('click',oeRunProjection);
$('#oeCheckCashReserve').addEventListener('click',oeCheckCashReserve);
$('#oeAuditFleet').addEventListener('click',oeAuditFleet);
$('#oeAuditDrivers').addEventListener('click',oeAuditDrivers);
$('#oeRankRoutes').addEventListener('click',oeRankRoutes);
$('#oeFareForm').addEventListener('submit',oeCalcFare);
$('#oeFuelForm').addEventListener('submit',oeCalcFuel);
$('#oeCalcFleetReserve').addEventListener('click',oeCalcFleetReserve);
$('#oeRefreshBackup').addEventListener('click',oeRenderBackupSummary);
$('#oeDownloadBackup').addEventListener('click',()=>{if(!assertOwner())return;const backup=collectBackup();downloadTextFile(`grupo-conect-backup-dono-${dateTodayLocal()}.json`,JSON.stringify(backup,null,2),'application/json;charset=utf-8');$('#oeBackupSummary').insertAdjacentHTML('afterbegin','<div class="owner-extra-status success"><strong>✓ Backup exportado</strong><p>O arquivo JSON foi gerado. Guarde-o fora do aparelho antes de apagar os dados do navegador.</p></div>');showToast('Backup da gestão baixado.');});


// Inicialização geral
$('#currentYear').textContent = new Date().getFullYear();
loadDayCount();
renderDaySelect();
refreshBusFields();
updateDieselCalculation();
updateCalculation();
updateDayUI();
initializePhotos();
renderChecklist();
renderMaintenance();
renderOdometer();
renderFuelLogs();
renderIncidents();
renderEndChecklist();

// Dez novas funções operacionais com gravação local e relatórios copiáveis.
const FLOW_KEY = 'grupoConect.passengerFlow.v1';
const EXPENSE_KEY = 'grupoConect.operatingExpenses.v1';
const TIRE_KEY = 'grupoConect.tireInspections.v1';
const CLEAN_KEY = 'grupoConect.cleaningRecords.v1';
const DOC_KEY = 'grupoConect.documentDeadlines.v1';
const PUNCT_KEY = 'grupoConect.punctualityRecords.v1';
const HANDOVER_KEY = 'grupoConect.handoverRecords.v1';
const LOST_KEY = 'grupoConect.lostFoundRecords.v1';
const STOP_KEY = 'grupoConect.stopPlans.v1';
const RECON_KEY = 'grupoConect.fareReconciliations.v1';

function recordItem(title, details, deleteAttribute, id) {
  return `<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(details)}</small></div><button class="record-danger" type="button" ${deleteAttribute}="${escapeHtml(id)}">Excluir</button></div></article>`;
}
function recordsEmpty(message) { return `<p class="empty-state-text">${escapeHtml(message)}</p>`; }
async function copyRecordReport(title, lines, successMessage) {
  const content = [title, ...lines, '', `Gerado pelo Grupo Conect em ${new Date().toLocaleString('pt-BR')}.`].join('\n');
  showToast(await copyText(content) ? successMessage : 'Não foi possível copiar automaticamente.');
}
function setupToday(id) { const el = $('#' + id); if (el) el.value = dateTodayLocal(); }

// 1. Fluxo de passageiros por parada.
function renderPassengerFlow() {
  const rows = readArrayKey(FLOW_KEY);
  $('#flowList').innerHTML = rows.length ? rows.slice().reverse().map(x => recordItem(
    `${x.route} · ${x.stop}`, `${localDate(x.date)} · antes ${x.before} · +${x.board} embarcaram · −${x.alight} desembarcaram · após ${x.after} a bordo`, 'data-flow-delete', x.id
  )).join('') : recordsEmpty('Nenhuma parada registrada.');
}
setupToday('flowDate');
$('#passengerFlowForm').addEventListener('submit', event => {
  event.preventDefault();
  const date=$('#flowDate').value, route=$('#flowRoute').value.trim(), stop=$('#flowStop').value.trim();
  const before=readToolValue('flowBefore'), board=readToolValue('flowBoard'), alight=readToolValue('flowAlight');
  if(!date||!route||!stop||[before,board,alight].some(v=>v===null)||![before,board,alight].every(Number.isInteger)){showToast('Preencha a parada e informe quantidades inteiras válidas.');return;}
  if(alight>before){showToast('O número de desembarques não pode superar os passageiros a bordo antes da parada.');return;}
  const after=before+board-alight, item={id:makeId(),date,route,stop,before,board,alight,after,createdAt:new Date().toISOString()};
  const rows=readArrayKey(FLOW_KEY); rows.push(item); if(!writeArrayKey(FLOW_KEY,rows))return;
  $('#flowAfter').textContent=String(after); $('#flowChange').textContent=`${board-alight>0?'+':''}${board-alight}`; $('#flowResults').hidden=false;
  $('#flowStop').value=''; $('#flowBoard').value='0'; $('#flowAlight').value='0'; $('#flowBefore').value=String(after);
  renderPassengerFlow(); showToast('Parada registrada.');
});
$('#flowList').addEventListener('click',event=>{const b=event.target.closest('[data-flow-delete]');if(!b)return;writeArrayKey(FLOW_KEY,readArrayKey(FLOW_KEY).filter(x=>x.id!==b.dataset.flowDelete));renderPassengerFlow();showToast('Registro de parada excluído.');});
$('#copyFlowReport').addEventListener('click',()=>copyRecordReport('GRUPO CONECT — FLUXO DE PASSAGEIROS',readArrayKey(FLOW_KEY).map(x=>`${localDate(x.date)} | ${x.route} | ${x.stop} | antes ${x.before} | embarcaram ${x.board} | desembarcaram ${x.alight} | após ${x.after}`),'Relatório de passageiros copiado.'));

// 2. Lançamento de despesas adicionais.
function renderOperatingExpenses(){const rows=readArrayKey(EXPENSE_KEY);const total=rows.reduce((s,x)=>s+Number(x.amount||0),0);$('#expenseAllTotal').textContent=money(total);$('#expenseSummary').textContent=`${rows.length} despesa(s) registrada(s) · total acumulado ${money(total)}.`;$('#expenseList').innerHTML=rows.length?rows.slice().reverse().map(x=>recordItem(`${x.vehicle} · ${money(x.amount)}`,`${localDate(x.date)} · ${x.category}${x.note?' · '+x.note:''}`,'data-expense-delete',x.id)).join(''):recordsEmpty('Nenhuma despesa adicional registrada.');}
setupToday('expenseDate');
$('#operatingExpenseForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#expenseDate').value,vehicle=$('#expenseVehicle').value.trim(),category=$('#expenseCategory').value,amount=readToolValue('expenseAmount'),note=$('#expenseNote').value.trim();if(!date||!vehicle||!category||amount===null||amount<=0){showToast('Informe data, veículo, categoria e valor positivo.');return;}const item={id:makeId(),date,vehicle,category,amount,note,createdAt:new Date().toISOString()};const rows=readArrayKey(EXPENSE_KEY);rows.push(item);if(!writeArrayKey(EXPENSE_KEY,rows))return;$('#expenseSavedValue').textContent=money(amount);$('#expenseResults').hidden=false;$('#operatingExpenseForm').reset();setupToday('expenseDate');renderOperatingExpenses();showToast('Despesa registrada.');});
$('#expenseList').addEventListener('click',event=>{const b=event.target.closest('[data-expense-delete]');if(!b)return;writeArrayKey(EXPENSE_KEY,readArrayKey(EXPENSE_KEY).filter(x=>x.id!==b.dataset.expenseDelete));renderOperatingExpenses();showToast('Despesa excluída.');});
$('#copyExpenseReport').addEventListener('click',()=>{const rows=readArrayKey(EXPENSE_KEY);copyRecordReport('GRUPO CONECT — DESPESAS OPERACIONAIS',[...rows.map(x=>`${localDate(x.date)} | ${x.vehicle} | ${x.category} | ${money(x.amount)}${x.note?' | '+x.note:''}`),`TOTAL: ${money(rows.reduce((s,x)=>s+Number(x.amount||0),0))}`],'Relatório de despesas copiado.');});

// 3. Inspeção comparativa de pneus: a referência é informada pelo usuário da frota.
function renderTireInspections(){const rows=readArrayKey(TIRE_KEY);$('#tireList').innerHTML=rows.length?rows.slice().reverse().map(x=>recordItem(`${x.vehicle} · ${x.position} · ${x.status}`,`${localDate(x.date)} · medido ${numberPt(x.actual,1)} bar · referência ${numberPt(x.target,1)} bar · diferença ${numberPt(x.delta,1)} bar${x.note?' · '+x.note:''}`,'data-tire-delete',x.id)).join(''):recordsEmpty('Nenhuma inspeção de pneu registrada.');}
setupToday('tireDate');
$('#tireForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#tireDate').value,vehicle=$('#tireVehicle').value.trim(),position=$('#tirePosition').value,actual=readToolValue('tireActual'),target=readToolValue('tireTarget'),tolerance=readToolValue('tireTolerance'),note=$('#tireNote').value.trim();if(!date||!vehicle||!position||actual===null||actual<=0||target===null||target<=0||tolerance===null){showToast('Confira a data, o veículo e os valores de pressão.');return;}const delta=actual-target,status=Math.abs(delta)<=tolerance?'Dentro da tolerância informada':delta<0?'Abaixo da referência':'Acima da referência';const item={id:makeId(),date,vehicle,position,actual,target,tolerance,delta,status,note,createdAt:new Date().toISOString()};const rows=readArrayKey(TIRE_KEY);rows.push(item);if(!writeArrayKey(TIRE_KEY,rows))return;$('#tireDelta').textContent=`${delta>0?'+':''}${numberPt(delta,1)} bar`;$('#tireStatus').textContent=status;$('#tireResults').hidden=false;renderTireInspections();showToast('Inspeção de pneu registrada.');});
$('#tireList').addEventListener('click',event=>{const b=event.target.closest('[data-tire-delete]');if(!b)return;writeArrayKey(TIRE_KEY,readArrayKey(TIRE_KEY).filter(x=>x.id!==b.dataset.tireDelete));renderTireInspections();showToast('Inspeção excluída.');});
$('#copyTireReport').addEventListener('click',()=>copyRecordReport('GRUPO CONECT — INSPEÇÃO DE PNEUS',readArrayKey(TIRE_KEY).map(x=>`${localDate(x.date)} | ${x.vehicle} | ${x.position} | ${numberPt(x.actual,1)} bar (ref. ${numberPt(x.target,1)}) | ${x.status}${x.note?' | '+x.note:''}`),'Relatório de pneus copiado.'));

// 4. Registro de limpeza e conservação.
function renderCleaningRecords(){const rows=readArrayKey(CLEAN_KEY);$('#cleaningList').innerHTML=rows.length?rows.slice().reverse().map(x=>recordItem(`${x.vehicle} · ${x.doneCount}/4 itens concluídos`,`${localDate(x.date)} · interno ${x.interior?'OK':'pendente'} · externo ${x.exterior?'OK':'pendente'} · vidros ${x.windows?'OK':'pendente'} · resíduos ${x.waste?'OK':'pendente'}${x.note?' · '+x.note:''}`,'data-clean-delete',x.id)).join(''):recordsEmpty('Nenhuma limpeza registrada.');}
setupToday('cleanDate');
$('#cleaningForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#cleanDate').value,vehicle=$('#cleanVehicle').value.trim();if(!date||!vehicle){showToast('Informe a data e o veículo.');return;}const item={id:makeId(),date,vehicle,interior:$('#cleanInterior').checked,exterior:$('#cleanExterior').checked,windows:$('#cleanWindows').checked,waste:$('#cleanWaste').checked,note:$('#cleanNote').value.trim(),createdAt:new Date().toISOString()};item.doneCount=[item.interior,item.exterior,item.windows,item.waste].filter(Boolean).length;const rows=readArrayKey(CLEAN_KEY);rows.push(item);if(!writeArrayKey(CLEAN_KEY,rows))return;renderCleaningRecords();$('#cleaningForm').reset();setupToday('cleanDate');showToast('Registro de limpeza salvo.');});
$('#cleaningList').addEventListener('click',event=>{const b=event.target.closest('[data-clean-delete]');if(!b)return;writeArrayKey(CLEAN_KEY,readArrayKey(CLEAN_KEY).filter(x=>x.id!==b.dataset.cleanDelete));renderCleaningRecords();showToast('Registro de limpeza excluído.');});
$('#copyCleaningReport').addEventListener('click',()=>copyRecordReport('GRUPO CONECT — LIMPEZA DE VEÍCULOS',readArrayKey(CLEAN_KEY).map(x=>`${localDate(x.date)} | ${x.vehicle} | interno ${x.interior?'OK':'pendente'} | externo ${x.exterior?'OK':'pendente'} | vidros ${x.windows?'OK':'pendente'} | resíduos ${x.waste?'OK':'pendente'} | observação: ${x.note||'—'}`),'Relatório de limpeza copiado.'));

// 5. Vencimentos, com alertas calculados contra a data atual.
function documentStatus(due){const today=new Date(`${dateTodayLocal()}T00:00:00`),expiry=new Date(`${due}T00:00:00`),days=Math.round((expiry-today)/86400000);return {days,status:days<0?`Vencido há ${Math.abs(days)} dia(s)`:days===0?'Vence hoje':days<=30?`Vence em ${days} dia(s)`:'Em dia'};}
function renderDocuments(){const rows=readArrayKey(DOC_KEY);const ordered=rows.slice().sort((a,b)=>a.due.localeCompare(b.due));$('#documentList').innerHTML=ordered.length?ordered.map(x=>{const s=documentStatus(x.due);return recordItem(`${x.vehicle} · ${x.type} · ${s.status}`,`Vencimento: ${localDate(x.due)}${x.note?' · '+x.note:''}`,'data-doc-delete',x.id);}).join(''):recordsEmpty('Nenhum documento com prazo cadastrado.');}
$('#documentForm').addEventListener('submit',event=>{event.preventDefault();const vehicle=$('#docVehicle').value.trim(),type=$('#docType').value.trim(),due=$('#docDue').value,note=$('#docNote').value.trim();if(!vehicle||!type||!due){showToast('Informe veículo, documento e vencimento.');return;}const item={id:makeId(),vehicle,type,due,note,createdAt:new Date().toISOString()};const rows=readArrayKey(DOC_KEY);rows.push(item);if(!writeArrayKey(DOC_KEY,rows))return;$('#documentForm').reset();renderDocuments();showToast(`Prazo salvo: ${documentStatus(due).status}.`);});
$('#documentList').addEventListener('click',event=>{const b=event.target.closest('[data-doc-delete]');if(!b)return;writeArrayKey(DOC_KEY,readArrayKey(DOC_KEY).filter(x=>x.id!==b.dataset.docDelete));renderDocuments();showToast('Prazo removido.');});
$('#copyDocumentReport').addEventListener('click',()=>copyRecordReport('GRUPO CONECT — VALIDADE DE DOCUMENTOS',readArrayKey(DOC_KEY).map(x=>`${x.vehicle} | ${x.type} | vence ${localDate(x.due)} | ${documentStatus(x.due).status}${x.note?' | '+x.note:''}`),'Relatório de documentos copiado.'));

// 6. Pontualidade com ajuste para horários próximos da meia-noite.
function clockMinutes(value){if(!/^\d{2}:\d{2}$/.test(value||''))return null;const [h,m]=value.split(':').map(Number);return h<24&&m<60?h*60+m:null;}
function clockDelta(actual,planned){let delta=clockMinutes(actual)-clockMinutes(planned);if(delta>720)delta-=1440;if(delta<-720)delta+=1440;return delta;}
function deltaLabel(value){return value===0?'No horário':value>0?`${value} min de atraso`:`${Math.abs(value)} min adiantado`;}
function renderPunctuality(){const rows=readArrayKey(PUNCT_KEY);$('#punctList').innerHTML=rows.length?rows.slice().reverse().map(x=>recordItem(`${x.route} · saída ${deltaLabel(x.departureDelta)}`,`${localDate(x.date)} · chegada ${deltaLabel(x.arrivalDelta)} · previsto ${x.depPlan}/${x.arrPlan} · real ${x.depActual}/${x.arrActual}`,'data-punct-delete',x.id)).join(''):recordsEmpty('Nenhum registro de pontualidade.');}
setupToday('punctDate');
$('#punctualityForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#punctDate').value,route=$('#punctRoute').value.trim(),depPlan=$('#punctDepPlan').value,depActual=$('#punctDepActual').value,arrPlan=$('#punctArrPlan').value,arrActual=$('#punctArrActual').value;if(!date||!route||[depPlan,depActual,arrPlan,arrActual].some(x=>clockMinutes(x)===null)){showToast('Preencha a linha e os quatro horários válidos.');return;}const departureDelta=clockDelta(depActual,depPlan),arrivalDelta=clockDelta(arrActual,arrPlan),item={id:makeId(),date,route,depPlan,depActual,arrPlan,arrActual,departureDelta,arrivalDelta,createdAt:new Date().toISOString()};const rows=readArrayKey(PUNCT_KEY);rows.push(item);if(!writeArrayKey(PUNCT_KEY,rows))return;$('#punctDepDelta').textContent=deltaLabel(departureDelta);$('#punctArrDelta').textContent=deltaLabel(arrivalDelta);$('#punctResults').hidden=false;renderPunctuality();showToast('Pontualidade registrada.');});
$('#punctList').addEventListener('click',event=>{const b=event.target.closest('[data-punct-delete]');if(!b)return;writeArrayKey(PUNCT_KEY,readArrayKey(PUNCT_KEY).filter(x=>x.id!==b.dataset.punctDelete));renderPunctuality();showToast('Registro removido.');});
$('#copyPunctReport').addEventListener('click',()=>copyRecordReport('GRUPO CONECT — PONTUALIDADE',readArrayKey(PUNCT_KEY).map(x=>`${localDate(x.date)} | ${x.route} | saída: ${deltaLabel(x.departureDelta)} (previsto ${x.depPlan}, real ${x.depActual}) | chegada: ${deltaLabel(x.arrivalDelta)} (previsto ${x.arrPlan}, real ${x.arrActual})`),'Relatório de pontualidade copiado.'));

// 7. Passagem de turno, registrando leitura de tanque e hodômetro.
function renderHandovers(){const rows=readArrayKey(HANDOVER_KEY);$('#handoverList').innerHTML=rows.length?rows.slice().reverse().map(x=>recordItem(`${x.vehicle} · ${x.outgoing} → ${x.incoming}`,`${localDate(x.date)} · tanque ${numberPt(x.fuel,1)}% · hodômetro ${numberPt(x.odo,1)} km${x.notes?' · '+x.notes:''}`,'data-handover-delete',x.id)).join(''):recordsEmpty('Nenhuma passagem de turno registrada.');}
setupToday('handoverDate');
$('#handoverForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#handoverDate').value,vehicle=$('#handoverVehicle').value.trim(),outgoing=$('#handoverOutgoing').value.trim(),incoming=$('#handoverIncoming').value.trim(),fuel=readToolValue('handoverFuel'),odo=readToolValue('handoverOdo'),notes=$('#handoverNotes').value.trim();if(!date||!vehicle||!outgoing||!incoming||fuel===null||fuel>100||odo===null){showToast('Confira os campos da passagem de turno e o nível de tanque (0 a 100%).');return;}const item={id:makeId(),date,vehicle,outgoing,incoming,fuel,odo,notes,createdAt:new Date().toISOString()};const rows=readArrayKey(HANDOVER_KEY);rows.push(item);if(!writeArrayKey(HANDOVER_KEY,rows))return;$('#handoverForm').reset();setupToday('handoverDate');renderHandovers();showToast('Passagem de turno registrada.');});
$('#handoverList').addEventListener('click',event=>{const b=event.target.closest('[data-handover-delete]');if(!b)return;writeArrayKey(HANDOVER_KEY,readArrayKey(HANDOVER_KEY).filter(x=>x.id!==b.dataset.handoverDelete));renderHandovers();showToast('Passagem de turno excluída.');});
$('#copyHandoverReport').addEventListener('click',()=>copyRecordReport('GRUPO CONECT — PASSAGEM DE TURNO',readArrayKey(HANDOVER_KEY).map(x=>`${localDate(x.date)} | ${x.vehicle} | entrega: ${x.outgoing} | recebe: ${x.incoming} | tanque ${numberPt(x.fuel,1)}% | hodômetro ${numberPt(x.odo,1)} km | pendências: ${x.notes||'nenhuma anotada'}`),'Relatório de passagem de turno copiado.'));

// 8. Achados e perdidos sem necessidade de armazenar dados pessoais do passageiro.
function renderLostFound(){const rows=readArrayKey(LOST_KEY);$('#lostList').innerHTML=rows.length?rows.slice().reverse().map(x=>recordItem(`${x.item} · ${x.status}`,`${localDate(x.date)} ${x.time} · ${x.vehicle} · local: ${x.location}${x.note?' · '+x.note:''}`,'data-lost-delete',x.id)).join(''):recordsEmpty('Nenhum item registrado.');}
setupToday('lostDate');
$('#lostFoundForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#lostDate').value,time=$('#lostTime').value,vehicle=$('#lostVehicle').value.trim(),location=$('#lostLocation').value.trim(),itemText=$('#lostItem').value.trim(),status=$('#lostStatus').value,note=$('#lostNote').value.trim();if(!date||!time||!vehicle||!location||!itemText){showToast('Preencha data, horário, veículo, local e descrição do item.');return;}const row={id:makeId(),date,time,vehicle,location,item:itemText,status,note,createdAt:new Date().toISOString()};const rows=readArrayKey(LOST_KEY);rows.push(row);if(!writeArrayKey(LOST_KEY,rows))return;$('#lostFoundForm').reset();setupToday('lostDate');renderLostFound();showToast('Item registrado.');});
$('#lostList').addEventListener('click',event=>{const b=event.target.closest('[data-lost-delete]');if(!b)return;writeArrayKey(LOST_KEY,readArrayKey(LOST_KEY).filter(x=>x.id!==b.dataset.lostDelete));renderLostFound();showToast('Item removido.');});
$('#copyLostReport').addEventListener('click',()=>copyRecordReport('GRUPO CONECT — ACHADOS E PERDIDOS',readArrayKey(LOST_KEY).map(x=>`${localDate(x.date)} ${x.time} | ${x.vehicle} | ${x.item} | local: ${x.location} | situação: ${x.status}${x.note?' | '+x.note:''}`),'Relatório de achados e perdidos copiado.'));

// 9. Planejamento de paradas por linha.
function currentStopRoute(){return $('#stopRoute').value.trim();}
function renderStopPlans(){const rows=readArrayKey(STOP_KEY),route=currentStopRoute(),view=route?rows.filter(x=>x.route.toLowerCase()===route.toLowerCase()):rows;$('#stopList').innerHTML=view.length?view.slice().sort((a,b)=>a.route.localeCompare(b.route)||a.order-b.order).map(x=>recordItem(`${x.route} · ${x.order}. ${x.stop}`,`${x.dwell} min de permanência${x.notes?' · '+x.notes:''}`,'data-stop-delete',x.id)).join(''):recordsEmpty(route?'Nenhuma parada cadastrada para esta linha.':'Informe uma linha para ver seu plano ou adicione a primeira parada.');if(route){$('#stopResults').hidden=false;$('#stopCount').textContent=String(view.length);$('#stopTotalMinutes').textContent=`${view.reduce((s,x)=>s+Number(x.dwell||0),0)} min`;}else{$('#stopResults').hidden=true;}}
$('#stopRoute').addEventListener('input',renderStopPlans);
$('#stopPlannerForm').addEventListener('submit',event=>{event.preventDefault();const route=$('#stopRoute').value.trim(),stop=$('#stopName').value.trim(),dwell=readToolValue('stopDwell'),notes=$('#stopNotes').value.trim();if(!route||!stop||dwell===null||!Number.isInteger(dwell)){showToast('Informe linha, parada e um tempo inteiro em minutos.');return;}const rows=readArrayKey(STOP_KEY),routeRows=rows.filter(x=>x.route.toLowerCase()===route.toLowerCase()),order=routeRows.reduce((m,x)=>Math.max(m,Number(x.order)||0),0)+1;rows.push({id:makeId(),route,stop,dwell,notes,order,createdAt:new Date().toISOString()});if(!writeArrayKey(STOP_KEY,rows))return;$('#stopName').value='';$('#stopNotes').value='';renderStopPlans();showToast('Parada adicionada ao itinerário.');});
$('#stopList').addEventListener('click',event=>{const b=event.target.closest('[data-stop-delete]');if(!b)return;writeArrayKey(STOP_KEY,readArrayKey(STOP_KEY).filter(x=>x.id!==b.dataset.stopDelete));renderStopPlans();showToast('Parada removida.');});
$('#copyStopPlan').addEventListener('click',()=>{const route=currentStopRoute();if(!route){showToast('Informe a linha para copiar o plano.');return;}const rows=readArrayKey(STOP_KEY).filter(x=>x.route.toLowerCase()===route.toLowerCase()).sort((a,b)=>a.order-b.order);if(!rows.length){showToast('Não há paradas cadastradas para esta linha.');return;}copyRecordReport(`GRUPO CONECT — PLANO DE PARADAS: ${route}`,[...rows.map(x=>`${x.order}. ${x.stop} — ${x.dwell} min${x.notes?' | '+x.notes:''}`),`TEMPO TOTAL PARADO: ${rows.reduce((s,x)=>s+Number(x.dwell||0),0)} minutos`],'Plano de paradas copiado.');});
$('#clearStopPlan').addEventListener('click',()=>{const route=currentStopRoute();if(!route){showToast('Informe a linha que deseja limpar.');return;}if(!window.confirm(`Remover todas as paradas cadastradas para “${route}”?`))return;writeArrayKey(STOP_KEY,readArrayKey(STOP_KEY).filter(x=>x.route.toLowerCase()!==route.toLowerCase()));renderStopPlans();showToast('Plano da linha limpo.');});

// 10. Conciliação da arrecadação esperada com os meios de pagamento informados.
function renderReconciliations(){const rows=readArrayKey(RECON_KEY);$('#reconList').innerHTML=rows.length?rows.slice().reverse().map(x=>recordItem(`${x.route} · diferença ${money(x.difference)}`,`${localDate(x.date)} · esperado ${money(x.expected)} · recebido ${money(x.received)} · ${x.status}`,'data-recon-delete',x.id)).join(''):recordsEmpty('Nenhuma conferência de arrecadação salva.');}
setupToday('reconDate');
$('#fareReconForm').addEventListener('submit',event=>{event.preventDefault();const date=$('#reconDate').value,route=$('#reconRoute').value.trim(),fare=readToolValue('reconFare'),payers=readToolValue('reconPayers'),cash=readToolValue('reconCash'),pix=readToolValue('reconPix'),card=readToolValue('reconCard');if(!date||!route||fare===null||fare<=0||payers===null||!Number.isInteger(payers)||[cash,pix,card].some(x=>x===null)){showToast('Confira tarifa, pagantes e os valores recebidos.');return;}const expected=fare*payers,received=cash+pix+card,difference=received-expected,status=Math.abs(difference)<0.01?'Conferido':difference<0?'Falta valor':'Recebido acima do esperado';const item={id:makeId(),date,route,fare,payers,cash,pix,card,expected,received,difference,status,createdAt:new Date().toISOString()};const rows=readArrayKey(RECON_KEY);rows.push(item);if(!writeArrayKey(RECON_KEY,rows))return;$('#reconExpected').textContent=money(expected);$('#reconReceived').textContent=money(received);$('#reconDifference').textContent=(difference>0?'+':'')+money(difference);$('#reconStatus').textContent=status;$('#reconNote').textContent=difference<0?`Verifique uma diferença de ${money(Math.abs(difference))} abaixo do esperado.`:difference>0?`O total recebido está ${money(difference)} acima do cálculo esperado; confirme se todas as fontes e passagens foram registradas.`:'Os valores informados correspondem à arrecadação esperada.';$('#reconResults').hidden=false;renderReconciliations();showToast('Conferência de arrecadação salva.');});
$('#reconList').addEventListener('click',event=>{const b=event.target.closest('[data-recon-delete]');if(!b)return;writeArrayKey(RECON_KEY,readArrayKey(RECON_KEY).filter(x=>x.id!==b.dataset.reconDelete));renderReconciliations();showToast('Conferência removida.');});
$('#copyReconReport').addEventListener('click',()=>copyRecordReport('GRUPO CONECT — CONFERÊNCIA DE ARRECADAÇÃO',readArrayKey(RECON_KEY).map(x=>`${localDate(x.date)} | ${x.route} | ${x.payers} pagantes × ${money(x.fare)} = ${money(x.expected)} esperado | dinheiro ${money(x.cash)} | Pix ${money(x.pix)} | cartão/outro ${money(x.card)} | recebido ${money(x.received)} | diferença ${money(x.difference)} (${x.status})`),'Relatório de arrecadação copiado.'));

// Os registros das novas ferramentas são incluídos automaticamente no backup JSON
// por utilizarem chaves com o prefixo grupoConect.
renderPassengerFlow();
renderOperatingExpenses();
renderTireInspections();
renderCleaningRecords();
renderDocuments();
renderPunctuality();
renderHandovers();
renderLostFound();
renderStopPlans();
renderReconciliations();


// Gerador de fichas internas de ônibus: interface liberada apenas quando o usuário escolhe Pablo.
// Aviso: em um site estático público, isso não substitui autenticação real no servidor.
const BUS_DOC_KEY = 'grupoConect.busDocumentRecords.v1';
let currentBusDoc = null;
function busDocField(label, value) { return { label, value: (value === undefined || value === null || String(value).trim() === '') ? 'Não informado' : String(value).trim() }; }
function readBusDocForm() {
  const value = id => ($('#' + id).value || '').trim();
  return {
    id: makeId(), createdAt: new Date().toISOString(), date: value('busDocDate'), responsible: 'Pablo',
    documentType: value('busDocType'), prefix: value('busDocPrefix'), status: value('busDocStatus'),
    bodyBrand: value('busDocBodyBrand'), bodyModel: value('busDocBodyModel'), bodyYear: value('busDocBodyYear'), bodyModelYear: value('busDocBodyModelYear'),
    chassisBrand: value('busDocChassisBrand'), chassisModel: value('busDocChassisModel'), chassisYear: value('busDocChassisYear'), chassisModelYear: value('busDocChassisModelYear'),
    chassisNumber: value('busDocChassisNumber'), plate: value('busDocPlate').toUpperCase(), renavam: value('busDocRenavam'), fuel: value('busDocFuel'),
    tank: value('busDocTank'), seats: value('busDocSeats'), odometer: value('busDocOdometer'), air: value('busDocAir'), accessibility: value('busDocAccessibility'), notes: value('busDocNotes')
  };
}
function validateBusDocForm(d) {
  if (!d.date || !d.prefix || !d.bodyModel || !d.bodyYear || !d.bodyModelYear || !d.chassisBrand || !d.chassisModel || !d.chassisYear || !d.chassisModelYear) return 'Preencha a data, prefixo, modelo e os anos de fabricação/modelo da carroceria e do chassi.';
  const bodyYear=Number(d.bodyYear), bodyModelYear=Number(d.bodyModelYear), chassisYear=Number(d.chassisYear), chassisModelYear=Number(d.chassisModelYear), now=new Date().getFullYear();
  if ([bodyYear,bodyModelYear,chassisYear,chassisModelYear].some(y=>!Number.isInteger(y)||y<1950||y>now+1)) return `Informe anos válidos entre 1950 e ${now+1}.`;
  if (bodyModelYear < bodyYear) return 'O ano-modelo da carroceria não pode ser anterior ao ano de fabricação informado.';
  if (chassisModelYear < chassisYear) return 'O ano-modelo do chassi não pode ser anterior ao ano de fabricação informado.';
  if (d.tank !== '' && (!Number.isFinite(Number(d.tank)) || Number(d.tank)<0 || Number(d.tank)>2000)) return 'Confira a capacidade do tanque.';
  if (d.seats !== '' && (!Number.isInteger(Number(d.seats)) || Number(d.seats)<0 || Number(d.seats)>300)) return 'Confira a capacidade de passageiros.';
  if (d.odometer !== '' && (!Number.isFinite(Number(d.odometer)) || Number(d.odometer)<0)) return 'Confira o valor do hodômetro.';
  return '';
}
function formatBusDocText(d) {
  return [
    'GRUPO CONECT — DOCUMENTO INTERNO DA FROTA',
    d.documentType,
    `Documento gerado em: ${new Date(d.createdAt).toLocaleString('pt-BR')}`,
    `Data de referência: ${localDate(d.date)}`,
    '', 'IDENTIFICAÇÃO DO VEÍCULO',
    `Empresa / prefixo: ${d.prefix}`,
    `Situação operacional: ${d.status}`,
    `Carroceria: ${d.bodyBrand || 'Não informado'} — ${d.bodyModel}`,
    `Ano de fabricação da carroceria: ${d.bodyYear}`,
    `Ano-modelo da carroceria: ${d.bodyModelYear}`,
    '', 'IDENTIFICAÇÃO DO CHASSI',
    `Marca do chassi: ${d.chassisBrand}`,
    `Modelo do chassi: ${d.chassisModel}`,
    `Ano de fabricação do chassi: ${d.chassisYear}`,
    `Ano-modelo do chassi: ${d.chassisModelYear}`,
    `Número do chassi / VIN: ${d.chassisNumber || 'Não informado'}`,
    '', 'DADOS COMPLEMENTARES',
    `Placa: ${d.plate || 'Não informado'}`,
    `RENAVAM: ${d.renavam || 'Não informado'}`,
    `Combustível: ${d.fuel || 'Não informado'}`,
    `Capacidade do tanque: ${d.tank ? `${d.tank} litros` : 'Não informado'}`,
    `Capacidade de passageiros: ${d.seats || 'Não informado'}`,
    `Hodômetro: ${d.odometer ? `${numberPt(Number(d.odometer),1)} km` : 'Não informado'}`,
    `Ar-condicionado: ${d.air || 'Não informado'}`,
    `Acessibilidade: ${d.accessibility || 'Não informado'}`,
    '', 'OBSERVAÇÕES / PENDÊNCIAS', d.notes || 'Nenhuma observação informada.',
    '', 'Responsável pelo preenchimento: Pablo',
    '', 'DOCUMENTO INTERNO: este registro foi montado a partir das informações digitadas e não substitui CRLV, CRV, licenciamento ou documento oficial emitido por autoridade competente.'
  ].join('\n');
}
function busDocDetail(label,value) { return `<div class="bus-doc-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value === undefined || value === null || String(value).trim()==='' ? 'Não informado' : String(value))}</strong></div>`; }
function renderBusDocPreview(d) {
  $('#busDocPreviewHeading').textContent = `${d.documentType} · ${d.prefix}`;
  const vehicle = [busDocDetail('Empresa / prefixo',d.prefix),busDocDetail('Situação operacional',d.status),busDocDetail('Carroceria / modelo',`${d.bodyBrand ? d.bodyBrand+' — ' : ''}${d.bodyModel}`),busDocDetail('Ano fabricação / ano-modelo da carroceria',`${d.bodyYear} / ${d.bodyModelYear}`)].join('');
  const chassis = [busDocDetail('Marca do chassi',d.chassisBrand),busDocDetail('Modelo do chassi',d.chassisModel),busDocDetail('Ano fabricação / ano-modelo do chassi',`${d.chassisYear} / ${d.chassisModelYear}`),busDocDetail('Número do chassi / VIN',d.chassisNumber),busDocDetail('Placa',d.plate),busDocDetail('RENAVAM',d.renavam)].join('');
  const extras = [busDocDetail('Combustível',d.fuel),busDocDetail('Capacidade do tanque',d.tank ? `${d.tank} litros` : ''),busDocDetail('Capacidade de passageiros',d.seats),busDocDetail('Hodômetro',d.odometer ? `${numberPt(Number(d.odometer),1)} km` : ''),busDocDetail('Ar-condicionado',d.air),busDocDetail('Acessibilidade',d.accessibility),busDocDetail('Responsável',d.responsible),busDocDetail('Data de referência',localDate(d.date))].join('');
  $('#busDocPreview').innerHTML = `<div class="doc-print-brand">GRUPO CONECT · DOCUMENTAÇÃO INTERNA</div><h3>${escapeHtml(d.documentType)}</h3><p class="doc-subtitle">Gerado em ${escapeHtml(new Date(d.createdAt).toLocaleString('pt-BR'))}. Revise todos os dados antes de utilizar ou compartilhar.</p><div class="doc-section-title">Identificação do veículo</div><div class="bus-doc-details">${vehicle}</div><div class="doc-section-title">Identificação do chassi</div><div class="bus-doc-details">${chassis}</div><div class="doc-section-title">Dados complementares</div><div class="bus-doc-details">${extras}</div><div class="doc-section-title">Observações / pendências</div><div class="bus-doc-note">${escapeHtml(d.notes || 'Nenhuma observação informada.')}</div><div class="bus-doc-signature"><div>Responsável pelo cadastro<br><strong>Pablo</strong></div><div>Conferência / aprovação</div></div><p class="doc-subtitle" style="margin-top:22px">Documento interno preenchido pelo usuário. Não substitui CRLV, CRV, licenciamento ou documento oficial emitido por órgão competente.</p>`;
  $('#busDocPreviewPanel').hidden = false;
}
function renderBusDocList() {
  const rows=readArrayKey(BUS_DOC_KEY);
  $('#busDocList').innerHTML = rows.length ? rows.slice().reverse().map(d=>`<article class="record-item"><div class="record-item-top"><div><strong class="doc-item-title">${escapeHtml(d.prefix)} · ${escapeHtml(d.bodyModel)}</strong><small>${escapeHtml(d.documentType)} · ${escapeHtml(localDate(d.date))} · chassi ${escapeHtml(d.chassisBrand)} ${escapeHtml(d.chassisModel)} · gerado por ${escapeHtml(d.responsible)}</small><div class="bus-doc-list-actions"><button type="button" data-busdoc-view="${escapeHtml(d.id)}">Abrir ficha</button><button type="button" data-busdoc-download="${escapeHtml(d.id)}">Baixar TXT</button><button type="button" data-busdoc-print="${escapeHtml(d.id)}">Imprimir / PDF</button><button type="button" class="danger" data-busdoc-delete="${escapeHtml(d.id)}">Excluir</button></div></div></div></article>`).join('') : recordsEmpty('Nenhuma ficha interna foi gerada ainda.');
}
function activateBusDocAccess() {
  const user=$('#docAccessUser').value, panel=$('#busDocumentProtected'), message=$('#docAccessMessage');
  const allowed=user==='Pablo';
  panel.hidden=!allowed;
  message.classList.toggle('allowed',allowed); message.classList.toggle('denied',Boolean(user)&&!allowed);
  message.textContent=allowed?'Acesso liberado para Pablo. Preencha os dados do veículo para gerar a ficha.':user?`Acesso não liberado para ${user}. Esta ferramenta está disponível na interface somente para Pablo.`:'Selecione Pablo para abrir o gerador de documentos.';
  if(allowed) renderBusDocList();
}
$('#docAccessUser').addEventListener('change',activateBusDocAccess);
$('#busDocDate').value=dateTodayLocal();
$('#busDocumentForm').addEventListener('submit',event=>{
  event.preventDefault();
  if($('#docAccessUser').value!=='Pablo'){showToast('Acesso não autorizado para esta ferramenta.');activateBusDocAccess();return;}
  const d=readBusDocForm(),error=validateBusDocForm(d);
  if(error){showToast(error);return;}
  d.text=formatBusDocText(d);
  const rows=readArrayKey(BUS_DOC_KEY); rows.push(d);
  if(!writeArrayKey(BUS_DOC_KEY,rows))return;
  currentBusDoc=d; renderBusDocPreview(d); renderBusDocList(); showToast('Ficha interna gerada e salva neste navegador.');
});
function printBusDoc(d) {
  const text=formatBusDocText(d);
  const popup=window.open('','_blank','width=900,height=700');
  if(!popup){showToast('O navegador bloqueou a janela de impressão. Permita pop-ups para imprimir ou salvar em PDF.');return;}
  popup.opener=null;
  const escapedText=escapeHtml(text);
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(d.documentType)} - ${escapeHtml(d.prefix)}</title><style>body{font-family:Arial,sans-serif;color:#182b3c;margin:0;padding:32px;line-height:1.55}header{border-bottom:3px solid #128579;padding-bottom:16px;margin-bottom:22px}h1{font-size:22px;margin:0 0 6px;color:#10243a}small{color:#657987}.doc{white-space:pre-wrap;font-size:12px;overflow-wrap:anywhere}.actions{margin:0 0 20px}button{padding:10px 14px;border:0;border-radius:8px;background:#10243a;color:#fff;font-weight:bold}@media print{body{padding:0}.actions{display:none}}@page{margin:16mm}</style></head><body><header><h1>GRUPO CONECT</h1><small>Documento interno da frota · Não substitui documento oficial do veículo</small></header><div class="actions"><button onclick="window.print()">Imprimir / Salvar como PDF</button></div><div class="doc">${escapedText}</div></body></html>`);
  popup.document.close();
  setTimeout(()=>popup.print(),350);
}
$('#busDocPrint').addEventListener('click',()=>{if(currentBusDoc)printBusDoc(currentBusDoc);else showToast('Gere ou abra uma ficha primeiro.');});
$('#busDocDownload').addEventListener('click',()=>{if(!currentBusDoc){showToast('Gere ou abra uma ficha primeiro.');return;}downloadTextFile(`grupo-conect-ficha-${String(currentBusDoc.prefix).replace(/[^a-z0-9_-]+/gi,'-')}.txt`,formatBusDocText(currentBusDoc));});
$('#busDocCopy').addEventListener('click',async()=>{if(!currentBusDoc){showToast('Gere ou abra uma ficha primeiro.');return;}showToast(await copyText(formatBusDocText(currentBusDoc))?'Documento copiado.':'Não foi possível copiar automaticamente.');});
$('#busDocList').addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;const rows=readArrayKey(BUS_DOC_KEY),id=b.dataset.busdocView||b.dataset.busdocDownload||b.dataset.busdocPrint||b.dataset.busdocDelete;const d=rows.find(x=>x.id===id);if(!d)return;
  if(b.hasAttribute('data-busdoc-view')){currentBusDoc=d;renderBusDocPreview(d);$('#busDocPreviewPanel').scrollIntoView({behavior:'smooth',block:'start'});}
  else if(b.hasAttribute('data-busdoc-download'))downloadTextFile(`grupo-conect-ficha-${String(d.prefix).replace(/[^a-z0-9_-]+/gi,'-')}.txt`,formatBusDocText(d));
  else if(b.hasAttribute('data-busdoc-print'))printBusDoc(d);
  else if(b.hasAttribute('data-busdoc-delete')){if(!window.confirm(`Excluir a ficha de ${d.prefix}?`))return;writeArrayKey(BUS_DOC_KEY,rows.filter(x=>x.id!==id));if(currentBusDoc&&currentBusDoc.id===id){currentBusDoc=null;$('#busDocPreviewPanel').hidden=true;}renderBusDocList();showToast('Ficha removida.');}
});
$('#busDocCopyAll').addEventListener('click',async()=>{if($('#docAccessUser').value!=='Pablo'){showToast('Acesso não autorizado.');return;}const rows=readArrayKey(BUS_DOC_KEY);if(!rows.length){showToast('Não há fichas para copiar.');return;}const report=['GRUPO CONECT — FICHAS INTERNAS DOS ÔNIBUS',...rows.map((d,i)=>`\n${i+1}. ${d.prefix} | ${d.bodyBrand||'Carroceria não informada'} ${d.bodyModel} (${d.bodyYear}/${d.bodyModelYear}) | Chassi ${d.chassisBrand} ${d.chassisModel} (${d.chassisYear}/${d.chassisModelYear}) | Placa ${d.plate||'não informada'} | Situação: ${d.status}`)].join('\n');showToast(await copyText(report)?'Lista de fichas copiada.':'Não foi possível copiar automaticamente.');});

// ÁREA DO DONO — escala por dia da semana, operação, mercado, financiamento e caixa.
// Todos os dados são locais ao navegador; este é um simulador de gestão para OMSI 2.


const WEEKDAY_LABELS = {segunda:'Segunda-feira',terca:'Terça-feira',quarta:'Quarta-feira',quinta:'Quinta-feira',sexta:'Sexta-feira',sabado:'Sábado',domingo:'Domingo'};
let ownerScalePreview = null;
let currentFinanceId = null;
let currentIncidentOperationId = null;
let currentProfitOperationId = null;
let currentProfitReportText = '';
let marketPage = 0;
let marketViewRows = [];

function readObjectKey(key) { try { const value=JSON.parse(localStorage.getItem(key)||'{}'); return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; } catch(e) { return {}; } }
function writeObjectKey(key, value) { try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch(e) { showToast('Não foi possível salvar os dados neste navegador.'); return false; } }
function ownerAllowed() { return $('#ownerUserSelect')?.value === 'Pablo'; }
function assertOwner() { if(ownerAllowed()) return true; showToast('Acesso disponível na interface somente para Pablo.'); return false; }
function ownerScales() { return readArrayKey(OWNER_SCALE_KEY); }
function ownerFleet() { return readArrayKey(OWNER_FLEET_KEY); }
function ownerRoutes() {
  let rows=readArrayKey(OWNER_ROUTES_KEY);
  try {
    if(localStorage.getItem(OWNER_ROUTES_MIGRATED_KEY)!=='1') {
      const known=new Set(rows.map(r=>`${norm(r.city)}|${norm(r.line)}`));
      ownerFleet().forEach(v=>{
        if(v.city&&v.line) { const key=`${norm(v.city)}|${norm(v.line)}`; if(!known.has(key)) { rows.push({id:`migrated-${v.id||makeId()}`,city:v.city,line:v.line,serviceType:v.type||'Municipal',createdAt:v.createdAt||new Date().toISOString(),migratedFromLegacyFleet:true});known.add(key); } }
      });
      writeArrayKey(OWNER_ROUTES_KEY,rows);localStorage.setItem(OWNER_ROUTES_MIGRATED_KEY,'1');
    }
  } catch(e) { /* A página pode estar em modo de armazenamento restrito; mantém os registros disponíveis. */ }
  return rows;
}
function ownerContracts() { return readArrayKey(OWNER_CONTRACTS_KEY); }
function ownerOperations() { return readArrayKey(OPERATION_KEY); }
function financedBuses() { return readArrayKey(FINANCED_BUSES_KEY); }
function cashLedger() { return readArrayKey(CASH_LEDGER_KEY); }
function norm(value) { return String(value||'').trim().toLocaleLowerCase('pt-BR'); }
function avg(list, field) { return list.length ? list.reduce((s,x)=>s+Number(x[field]||0),0)/list.length : 0; }
function dateFromISO(value) { if(!value) return null; const d=new Date(`${value}T00:00:00`); return Number.isNaN(d.getTime())?null:d; }
function daysLateFrom(value) { const due=dateFromISO(value); if(!due)return 0; const today=dateFromISO(dateTodayLocal()); return Math.max(0,Math.floor((today-due)/86400000)); }
function addMonthsToISO(iso, months) { const d=dateFromISO(iso); if(!d)return ''; const day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+months); const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); d.setDate(Math.min(day,last)); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function loanMonthlyPayment(principal, count, monthlyRatePercent) { if(!(principal>0)||!(count>0))return 0; const r=Math.max(0,Number(monthlyRatePercent)||0)/100; if(r===0)return principal/count; return principal*r/(1-Math.pow(1+r,-count)); }
function weekdayFromISO(iso) { const d=dateFromISO(iso); if(!d)return ''; return ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][d.getDay()]; }
function moneyStat(label,value,klass='') { return `<div class="tool-result-stat ${klass}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`; }

// Gate the owner screen. This is a visual guard only, not real authentication on GitHub Pages.
function activateOwnerArea() {
  const user=$('#ownerUserSelect').value, allowed=user==='Pablo';
  $('#ownerProtected').hidden=!allowed;
  const message=$('#ownerAccessMessage');
  message.classList.toggle('allowed',allowed); message.classList.toggle('denied',Boolean(user)&&!allowed);
  message.textContent=allowed?'Acesso liberado para Pablo. Os módulos estão em modo de simulação local.':user?`Acesso não liberado para ${user}. Selecione Pablo para abrir as ferramentas do proprietário.`:'Selecione Pablo para liberar a Área do Dono.';
  if(allowed){renderOwnerRoutes();renderOwnerFleet();renderOwnerScales();renderOwnerContractHistory();refreshOperationChoices();renderOperations();renderMarket();renderFinanceList();renderCashDashboard();gcZeroKmRenderHistory();}
}
$('#ownerUserSelect').addEventListener('change',activateOwnerArea);
$('#ownerProtected').hidden=true;

// Cadastro independente de rotas e frota: nenhum veículo fica preso a uma linha.
function routeKey(city,line){return `${norm(city)}|${norm(line)}`;}
function findRegisteredRoute(city,line){
  const routes=ownerRoutes();
  return routes.find(r=>norm(r.city)===norm(city)&&norm(r.line)===norm(line)) || null;
}
function displayDateValue(value){
  if(!value)return 'Sem data';const raw=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return localDate(raw);
  const d=new Date(raw);return Number.isNaN(d.getTime())?raw:d.toLocaleDateString('pt-BR');
}
function refreshRouteDatalists(){
  const cities=new Set(GC_CITIES), routes=new Set(GC_INTERSTATE_ROUTES);
  ownerRoutes().forEach(r=>{if(r.city)cities.add(r.city);if(r.line)routes.add(r.line);});
  const c=$('#gcCities'),l=$('#gcRoutes');
  if(c)c.innerHTML=Array.from(cities).map(x=>`<option value="${escapeHtml(x)}"></option>`).join('');
  if(l)l.innerHTML=Array.from(routes).map(x=>`<option value="${escapeHtml(x)}"></option>`).join('');
}
// Mercado 0 km: famílias de carrocerias e chassis referenciadas em catálogos oficiais.
// Preços, opcionais, lotação e prazos são estimativas para a simulação, nunca cotações comerciais.
const ZERO_KM_MODELS = [
 {id:'mp-torino-2027',make:'Marcopolo',model:'Torino 2027',segments:['urbano'],length:12.56,width:2.55,height:3.26,seated:38,standing:42,doors:3,floor:'Entrada baixa (low entry)',base:980000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania'],url:'https://onibus.marcopolo.com.br/produtos/urbanos/torino'},
 {id:'mp-torino-low',make:'Marcopolo',model:'Torino Low Entry',segments:['urbano','midibus'],length:12.5,width:2.55,height:3.3,seated:36,standing:44,doors:3,floor:'Entrada baixa (low entry)',base:1050000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania'],url:'https://onibus.marcopolo.com.br/produtos/urbanos'},
 {id:'mp-torino-rear',make:'Marcopolo',model:'Torino Motor Traseiro',segments:['urbano'],length:13.2,width:2.55,height:3.3,seated:38,standing:46,doors:3,floor:'Piso baixo integral',base:1180000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania'],url:'https://onibus.marcopolo.com.br/produtos/urbanos'},
 {id:'mp-torino-express',make:'Marcopolo',model:'Torino Express Articulado',segments:['articulado','urbano'],length:18.6,width:2.55,height:3.5,seated:46,standing:90,doors:4,floor:'Piso baixo integral',base:1850000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania'],url:'https://onibus.marcopolo.com.br/produtos/urbanos'},
 {id:'mp-attivi',make:'Marcopolo',model:'Attivi Integral 100% elétrico',segments:['eletrico','urbano'],length:12.95,width:2.55,height:3.675,seated:32,standing:50,doors:3,floor:'Piso baixo integral',base:2850000,brands:['Volare (integral)'],electric:true,url:'https://onibus.marcopolo.com.br/produtos/urbanos/attivi'},
 {id:'mp-attivi-express',make:'Marcopolo',model:'Attivi Express Articulado elétrico',segments:['eletrico','articulado','urbano'],length:22,width:2.6,height:3.73,seated:48,standing:100,doors:4,floor:'Piso baixo integral',base:4400000,brands:['Volare (integral)'],electric:true,url:'https://onibus.marcopolo.com.br/produtos/urbanos/attivi-express'},
 {id:'mp-senior-urbano',make:'Marcopolo',model:'Senior Urbano',segments:['micro','midibus','urbano'],length:9.2,width:2.4,height:3.05,seated:28,standing:15,doors:2,floor:'Piso alto',base:590000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Volare (integral)'],url:'https://onibus.marcopolo.com.br/produtos/urbanos'},
 {id:'mp-senior-fret',make:'Marcopolo',model:'Senior Fretamento',segments:['micro','fretamento','escolar'],length:9.2,width:2.4,height:3.15,seated:31,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:630000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Volare (integral)'],url:'https://onibus.marcopolo.com.br/produtos'},
 {id:'mp-ideale800',make:'Marcopolo',model:'Ideale 800',segments:['intermunicipal','fretamento'],length:12.5,width:2.55,height:3.45,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1180000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos'},
 {id:'mp-audace',make:'Marcopolo',model:'Audace',segments:['intermunicipal','fretamento','rodoviario'],length:13.2,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1550000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos'},
 {id:'mp-viaggio800',make:'Marcopolo',model:'Viaggio 800',segments:['intermunicipal','fretamento','rodoviario'],length:12.5,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1370000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos'},
 {id:'mp-viaggio900',make:'Marcopolo',model:'Viaggio G8 900',segments:['intermunicipal','fretamento','rodoviario'],length:12.5,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1490000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos'},
 {id:'mp-viaggio1050',make:'Marcopolo',model:'Viaggio G8 1050',segments:['intermunicipal','fretamento','rodoviario'],length:13.2,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1690000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos'},
 {id:'mp-paradiso1050',make:'Marcopolo',model:'Paradiso G8 1050',segments:['rodoviario','fretamento'],length:13.2,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1850000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos/paradiso-g8'},
 {id:'mp-paradiso1200',make:'Marcopolo',model:'Paradiso G8 1200',segments:['rodoviario','fretamento'],length:13.2,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:2150000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos/paradiso-g8'},
 {id:'mp-paradiso1350',make:'Marcopolo',model:'Paradiso G8 1350',segments:['rodoviario','fretamento'],length:14,width:2.6,height:3.75,seated:50,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:2480000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos/paradiso-g8'},
 {id:'mp-paradiso1600',make:'Marcopolo',model:'Paradiso G8 1600 LD',segments:['rodoviario'],length:14,width:2.6,height:3.9,seated:52,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:3150000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos/paradiso-g8'},
 {id:'mp-paradiso1800',make:'Marcopolo',model:'Paradiso G8 1800 DD',segments:['rodoviario'],length:14,width:2.6,height:4.1,seated:60,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:3850000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos/paradiso-g8'},
 {id:'mp-paradiso-tec',make:'Marcopolo',model:'Paradiso G8 TEC 1800 DD',segments:['rodoviario'],length:14,width:2.6,height:4.1,seated:60,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:4100000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://onibus.marcopolo.com.br/produtos'},
 {id:'caio-apachev',make:'Caio',model:'Apache VIP V',segments:['urbano','midibus','intermunicipal'],length:12.5,width:2.55,height:3.35,seated:38,standing:42,doors:3,floor:'Piso alto',base:970000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://caio.com.br/'},
 {id:'caio-millv',make:'Caio',model:'Millennium V',segments:['urbano'],length:13.2,width:2.55,height:3.5,seated:36,standing:48,doors:3,floor:'Piso baixo integral',base:1240000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania'],url:'https://caio.com.br/produto/millennium-10.html'},
 {id:'caio-emillennium',make:'Caio',model:'eMillennium elétrico',segments:['eletrico','urbano'],length:12.5,width:2.55,height:3.5,seated:32,standing:50,doors:3,floor:'Piso baixo integral',base:2850000,brands:['BYD','Volare (integral)'],electric:true,url:'https://caio.com.br/'},
 {id:'caio-mill-art',make:'Caio',model:'Millennium V Articulado',segments:['articulado','urbano'],length:18.6,width:2.55,height:3.5,seated:46,standing:88,doors:4,floor:'Piso baixo integral',base:1940000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania'],url:'https://caio.com.br/'},
 {id:'caio-brt-super',make:'Caio',model:'Millennium BRT Superarticulado',segments:['articulado','urbano'],length:23,width:2.55,height:3.5,seated:54,standing:110,doors:5,floor:'Piso baixo integral',base:2650000,brands:['Mercedes-Benz','Scania'],url:'https://caio.com.br/'},
 {id:'caio-f2400',make:'Caio',model:'F2400',segments:['micro','escolar','fretamento'],length:7.8,width:2.2,height:2.9,seated:24,standing:0,doors:1,floor:'Piso alto',base:480000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://caio.com.br/'},
 {id:'caio-f2500',make:'Caio',model:'F2500 Midi',segments:['micro','midibus','escolar','fretamento'],length:9,width:2.4,height:3.05,seated:29,standing:8,doors:2,floor:'Piso alto',base:610000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://caio.com.br/'},
 {id:'masc-granvia',make:'Mascarello',model:'New Gran Via Urbano',segments:['urbano','midibus'],length:12.5,width:2.55,height:3.35,seated:38,standing:42,doors:3,floor:'Piso alto',base:930000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://mascarello.com.br/documentos/'},
 {id:'masc-granmidi',make:'Mascarello',model:'Gran Midi',segments:['midibus','urbano','escolar'],length:10.5,width:2.45,height:3.2,seated:32,standing:18,doors:2,floor:'Piso alto',base:720000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://mascarello.com.br/documentos/'},
 {id:'masc-granmicro3',make:'Mascarello',model:'Gran Micro S3',segments:['micro','escolar','fretamento'],length:8.5,width:2.35,height:3.05,seated:27,standing:8,doors:1,floor:'Piso alto',base:545000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://mascarello.com.br/documentos/'},
 {id:'masc-micros2',make:'Mascarello',model:'Micro S2 Onurea',segments:['micro','escolar'],length:7.8,width:2.2,height:2.9,seated:24,standing:0,doors:1,floor:'Piso alto',base:465000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://mascarello.com.br/documentos/'},
 {id:'masc-newroma4',make:'Mascarello',model:'New Roma NR4',segments:['intermunicipal','fretamento','escolar'],length:10.5,width:2.45,height:3.25,seated:36,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:790000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://mascarello.com.br/documentos/'},
 {id:'masc-newroma6',make:'Mascarello',model:'New Roma NR6',segments:['intermunicipal','fretamento','rodoviario'],length:12.5,width:2.55,height:3.45,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1190000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://mascarello.com.br/documentos/'},
 {id:'comil-svelto',make:'Comil',model:'Svelto Urbano',segments:['urbano'],length:12.5,width:2.55,height:3.35,seated:38,standing:42,doors:3,floor:'Piso alto',base:950000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-svelto-midi',make:'Comil',model:'Svelto Midi',segments:['midibus','urbano'],length:10.5,width:2.45,height:3.2,seated:32,standing:18,doors:2,floor:'Piso alto',base:735000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-camp325',make:'Comil',model:'Campione 3.25 Fretamento',segments:['fretamento','intermunicipal'],length:10.5,width:2.6,height:3.45,seated:39,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:980000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-camp345',make:'Comil',model:'Campione 3.45 Fretamento',segments:['fretamento','intermunicipal'],length:12.5,width:2.6,height:3.55,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1260000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-versatile',make:'Comil',model:'Versatile V4',segments:['fretamento','intermunicipal','escolar'],length:12.5,width:2.6,height:3.45,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1190000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-micro-pia',make:'Comil',model:'Micro Piá Rodoviário',segments:['micro','fretamento','escolar'],length:8.5,width:2.35,height:3.05,seated:28,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:570000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-invictus1050',make:'Comil',model:'Campione Invictus 1050',segments:['rodoviario','fretamento'],length:13.2,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1680000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-invictus1200',make:'Comil',model:'Campione Invictus 1200',segments:['rodoviario'],length:13.2,width:2.6,height:3.75,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1990000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-invictushd',make:'Comil',model:'Campione Invictus HD',segments:['rodoviario'],length:14,width:2.6,height:3.95,seated:50,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:2580000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'comil-invictusdd',make:'Comil',model:'Campione Invictus DD',segments:['rodoviario'],length:14,width:2.6,height:4.1,seated:60,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:3400000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://www2.comilonibus.com.br/produtos'},
 {id:'busscar-el320',make:'Busscar',model:'El Buss 320',segments:['intermunicipal','fretamento','escolar'],length:10.5,width:2.6,height:3.45,seated:38,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:970000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus'],url:'https://busscar.com.br/produtos/'},
 {id:'busscar-el340',make:'Busscar',model:'El Buss 340',segments:['intermunicipal','fretamento','rodoviario'],length:12.5,width:2.6,height:3.55,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1280000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://busscar.com.br/produtos/'},
 {id:'busscar-vissta340',make:'Busscar',model:'Vissta Buss 340 NB1',segments:['intermunicipal','fretamento','rodoviario'],length:12.5,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1470000,brands:['Mercedes-Benz','Volkswagen Caminhões e Ônibus','Scania','Volvo'],url:'https://busscar.com.br/produtos/'},
 {id:'busscar-vissta345',make:'Busscar',model:'Vissta Buss 345 NB1',segments:['intermunicipal','rodoviario'],length:13.2,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1650000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://busscar.com.br/produtos/'},
 {id:'busscar-vissta360',make:'Busscar',model:'Vissta Buss 360',segments:['rodoviario'],length:13.2,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1740000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://busscar.com.br/produtos/'},
 {id:'busscar-vissta365',make:'Busscar',model:'Vissta Buss 365 NB1',segments:['rodoviario'],length:13.2,width:2.6,height:3.65,seated:46,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:1890000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://busscar.com.br/produtos/'},
 {id:'busscar-vissta400',make:'Busscar',model:'Vissta Buss 400',segments:['rodoviario'],length:14,width:2.6,height:3.85,seated:50,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:2520000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://busscar.com.br/produtos/'},
 {id:'busscar-visstadd',make:'Busscar',model:'Vissta Buss DD',segments:['rodoviario'],length:14,width:2.6,height:4.1,seated:60,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:3450000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://busscar.com.br/produtos/'},
 {id:'busscar-panoramico',make:'Busscar',model:'Panorâmico DD NB1',segments:['rodoviario'],length:14,width:2.6,height:4.1,seated:60,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:3650000,brands:['Mercedes-Benz','Scania','Volvo'],url:'https://busscar.com.br/produtos/'},
 {id:'volare-attack8',make:'Volare',model:'Attack 8',segments:['micro','escolar','fretamento'],length:7.7,width:2.2,height:2.9,seated:24,standing:0,doors:1,floor:'Piso alto',base:460000,brands:['Volare (integral)'],url:'https://www.volare.com.br/'},
 {id:'volare-attack9',make:'Volare',model:'Attack 9',segments:['micro','escolar','fretamento'],length:8.5,width:2.35,height:3.05,seated:29,standing:0,doors:1,floor:'Piso alto',base:535000,brands:['Volare (integral)'],url:'https://www.volare.com.br/'},
 {id:'volare-attack10',make:'Volare',model:'Attack 10',segments:['micro','escolar','fretamento'],length:9.1,width:2.4,height:3.1,seated:32,standing:0,doors:1,floor:'Piso alto',base:610000,brands:['Volare (integral)'],url:'https://www.volare.com.br/'},
 {id:'volare-fly10',make:'Volare',model:'Fly 10',segments:['micro','intermunicipal','fretamento'],length:9.2,width:2.4,height:3.15,seated:32,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:660000,brands:['Volare (integral)'],url:'https://www.volare.com.br/'},
 {id:'volare-fly12',make:'Volare',model:'Fly 12',segments:['intermunicipal','fretamento','rodoviario'],length:10.5,width:2.45,height:3.25,seated:36,standing:0,doors:1,floor:'Rodoviário com salão elevado',base:790000,brands:['Volare (integral)'],url:'https://www.volare.com.br/'},
 {id:'volare-w9',make:'Volare',model:'W9',segments:['micro','escolar','fretamento'],length:8.5,width:2.35,height:3.05,seated:28,standing:0,doors:1,floor:'Piso alto',base:520000,brands:['Volare (integral)'],url:'https://www.volare.com.br/'}
];
const ZERO_KM_CHASSIS = [
 {brand:'Mercedes-Benz',model:'LO 916',engine:'OM 924 LA · 163 cv · diesel P-8',segments:['micro','escolar','fretamento'],axles:'4x2',baseAdd:0},
 {brand:'Mercedes-Benz',model:'LO 1116',engine:'OM 924 LA · 163 cv · diesel P-8',segments:['micro','escolar','fretamento'],axles:'4x2',baseAdd:25000},
 {brand:'Mercedes-Benz',model:'OF 1519 R',engine:'OM 924 LA · 185 cv · 700 Nm · diesel P-8',segments:['micro','midibus','urbano','escolar','fretamento','intermunicipal'],axles:'4x2',baseAdd:80000},
 {brand:'Mercedes-Benz',model:'OF 1721',engine:'OM 924 LA · 208 cv · 780 Nm · diesel P-8',segments:['midibus','urbano','escolar','fretamento','intermunicipal'],axles:'4x2',baseAdd:110000},
 {brand:'Mercedes-Benz',model:'OF 1721L',engine:'OM 924 LA · 208 cv · 780 Nm · diesel P-8',segments:['urbano','intermunicipal','fretamento'],axles:'4x2',baseAdd:125000},
 {brand:'Mercedes-Benz',model:'OF 1726',engine:'OM 926 LA · 260 cv · 980 Nm · diesel P-8',segments:['urbano','intermunicipal','fretamento'],axles:'4x2',baseAdd:160000},
 {brand:'Mercedes-Benz',model:'OF 1726L',engine:'OM 926 LA · 260 cv · 980 Nm · diesel P-8',segments:['urbano','intermunicipal','fretamento'],axles:'4x2',baseAdd:175000},
 {brand:'Mercedes-Benz',model:'O 500 U',engine:'OM 926 LA · 286 cv · 1.100 Nm · diesel P-8',segments:['urbano'],axles:'4x2',baseAdd:220000},
 {brand:'Mercedes-Benz',model:'O 500 M',engine:'OM 926 LA · 286 cv · 1.100 Nm · diesel P-8',segments:['urbano'],axles:'4x2',baseAdd:255000},
 {brand:'Mercedes-Benz',model:'O 500 UA articulado',engine:'OM 460 LA · 381 cv · diesel P-8',segments:['urbano','articulado'],axles:'6x2',baseAdd:400000},
 {brand:'Mercedes-Benz',model:'O 500 R',engine:'OM 926 LA · 310 cv · 1.250 Nm · diesel P-8',segments:['fretamento','intermunicipal','rodoviario'],axles:'4x2',baseAdd:240000},
 {brand:'Mercedes-Benz',model:'O 500 RS',engine:'OM 460 LA · 381 cv · 1.900 Nm · diesel P-8',segments:['fretamento','intermunicipal','rodoviario'],axles:'4x2',baseAdd:340000},
 {brand:'Mercedes-Benz',model:'O 500 RSD 2438/2445',engine:'OM 460 LA · 381–449 cv · diesel P-8',segments:['rodoviario'],axles:'6x2',baseAdd:520000},
 {brand:'Mercedes-Benz',model:'O 500 RSDD',engine:'OM 460 LA · 449 cv · diesel P-8',segments:['rodoviario'],axles:'8x2',baseAdd:680000},
 {brand:'Mercedes-Benz',model:'eO500U',engine:'Propulsão elétrica a bateria · especificação conforme proposta',segments:['eletrico','urbano'],axles:'4x2',electric:true,baseAdd:900000},
 {brand:'Mercedes-Benz',model:'eO500UA articulado',engine:'Propulsão elétrica a bateria · especificação conforme proposta',segments:['eletrico','articulado','urbano'],axles:'6x2',electric:true,baseAdd:1500000},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 8.180 E ORE 1',engine:'Diesel P-8 · configuração escolar',segments:['micro','escolar'],axles:'4x2',baseAdd:0},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 9.180 / S',engine:'Cummins ISF 3.8 · 175 cv · diesel P-8',segments:['micro','urbano','escolar','fretamento'],axles:'4x2',baseAdd:0},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 11.180 / S',engine:'Cummins ISF 3.8 · 175 cv · diesel P-8',segments:['micro','midibus','urbano','escolar','fretamento'],axles:'4x2',baseAdd:30000},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 11.180 R',engine:'Diesel P-8 · suspensão rural reforçada',segments:['escolar','fretamento','micro'],axles:'4x2',baseAdd:35000},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 15.210 / S',engine:'D08 · 205 cv · diesel P-8',segments:['midibus','urbano','escolar','fretamento','intermunicipal'],axles:'4x2',baseAdd:85000},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 17.230 / S',engine:'D08 · 225 cv · diesel P-8',segments:['urbano','intermunicipal','fretamento'],axles:'4x2',baseAdd:120000},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 17.260 / S',engine:'D08 · 260 cv · diesel P-8',segments:['urbano','intermunicipal','fretamento'],axles:'4x2',baseAdd:160000},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 18.320 SL',engine:'Diesel P-8 · piso baixo',segments:['urbano','articulado'],axles:'4x2',baseAdd:250000},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 18.320 SH',engine:'Diesel P-8 · fretamento / rodoviário',segments:['fretamento','intermunicipal','rodoviario'],axles:'4x2',baseAdd:260000},
 {brand:'Volkswagen Caminhões e Ônibus',model:'Volksbus 22.260 S 6x2i',engine:'Diesel P-8 · configuração 6x2i',segments:['urbano','articulado'],axles:'6x2',baseAdd:300000},
 {brand:'Scania',model:'K 230 4x2',engine:'Diesel P-8 · 230 cv',segments:['urbano'],axles:'4x2',baseAdd:150000},
 {brand:'Scania',model:'K 280 4x2',engine:'Diesel P-8 · 280 cv',segments:['urbano'],axles:'4x2',baseAdd:220000},
 {brand:'Scania',model:'K 320 4x2',engine:'Diesel P-8 · 320 cv',segments:['fretamento','intermunicipal','rodoviario'],axles:'4x2',baseAdd:250000},
 {brand:'Scania',model:'K 370 4x2',engine:'Diesel P-8 · 370 cv',segments:['fretamento','intermunicipal','rodoviario'],axles:'4x2',baseAdd:330000},
 {brand:'Scania',model:'K 410 6x2',engine:'Diesel P-8 · 410 cv',segments:['rodoviario'],axles:'6x2',baseAdd:490000},
 {brand:'Scania',model:'K 450 6x2',engine:'Diesel P-8 · 450 cv',segments:['rodoviario'],axles:'6x2',baseAdd:560000},
 {brand:'Scania',model:'K 500 6x2',engine:'Diesel P-8 · 500 cv',segments:['rodoviario'],axles:'6x2',baseAdd:650000},
 {brand:'Scania',model:'Super K 350 4x2',engine:'Scania Super · 350 cv · diesel',segments:['fretamento','intermunicipal','rodoviario'],axles:'4x2',baseAdd:340000},
 {brand:'Scania',model:'Super K 390 4x2',engine:'Scania Super · 390 cv · diesel',segments:['rodoviario'],axles:'4x2',baseAdd:410000},
 {brand:'Scania',model:'Super K 430 4x2',engine:'Scania Super · 430 cv · diesel',segments:['rodoviario'],axles:'4x2',baseAdd:480000},
 {brand:'Scania',model:'Super K 460 6x2',engine:'Scania Super · 460 cv · diesel',segments:['rodoviario'],axles:'6x2',baseAdd:600000},
 {brand:'Scania',model:'Super K 500 6x2',engine:'Scania Super · 500 cv · diesel',segments:['rodoviario'],axles:'6x2',baseAdd:690000},
 {brand:'Volvo',model:'B 320R 4x2',engine:'Diesel P-8 · 320 cv',segments:['fretamento','intermunicipal','rodoviario'],axles:'4x2',baseAdd:240000},
 {brand:'Volvo',model:'B 360R 4x2',engine:'Diesel P-8 · 360 cv',segments:['rodoviario'],axles:'4x2',baseAdd:300000},
 {brand:'Volvo',model:'B 380R 4x2',engine:'Diesel P-8 · 380 cv',segments:['rodoviario'],axles:'4x2',baseAdd:360000},
 {brand:'Volvo',model:'B 420R 4x2',engine:'Diesel P-8 · 420 cv',segments:['rodoviario'],axles:'4x2',baseAdd:430000},
 {brand:'Volvo',model:'B 380R 6x2',engine:'Diesel P-8 · 380 cv',segments:['rodoviario'],axles:'6x2',baseAdd:460000},
 {brand:'Volvo',model:'B 420R 6x2',engine:'Diesel P-8 · 420 cv',segments:['rodoviario'],axles:'6x2',baseAdd:520000},
 {brand:'Volvo',model:'B 460R 6x2',engine:'Diesel P-8 · 460 cv',segments:['rodoviario'],axles:'6x2',baseAdd:610000},
 {brand:'Volvo',model:'B 510R 6x2',engine:'Diesel P-8 · 510 cv',segments:['rodoviario'],axles:'6x2',baseAdd:720000},
 {brand:'BYD',model:'D9W ePadron elétrico',engine:'Tração elétrica a bateria · ficha do importador a confirmar',segments:['eletrico','urbano'],axles:'6x2',electric:true,baseAdd:880000},
 {brand:'Volare (integral)',model:'Conjunto integral Volare',engine:'Motorização e plataforma integradas pela Volare',segments:['micro','escolar','fretamento','intermunicipal'],axles:'4x2',baseAdd:0}
];
function gcZeroKmSelectedModel(){return ZERO_KM_MODELS.find(x=>x.id===$('#zeroKmModel')?.value)||null;}
function gcZeroKmAllowedModels(){const make=$('#zeroKmBodyBuilder')?.value,segment=$('#zeroKmSegment')?.value;return ZERO_KM_MODELS.filter(x=>(!make||x.make===make)&&(!segment||x.segments.includes(segment)||segment==='eletrico'&&x.electric));}
function gcZeroKmRefreshModels(preferred=''){
  const select=$('#zeroKmModel');if(!select)return;const rows=gcZeroKmAllowedModels();select.innerHTML='<option value="">Selecione um modelo</option>'+rows.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.model)} · ${escapeHtml(x.segments.join('/'))}</option>`).join('');select.disabled=!rows.length;select.value=rows.some(x=>x.id===preferred)?preferred:(rows[0]?.id||'');gcZeroKmApplyModelDefaults();
}
function gcZeroKmAvailableChassis(model,brand){if(!model)return[];return ZERO_KM_CHASSIS.filter(x=>(model.brands||[]).includes(x.brand)&&(!brand||x.brand===brand)&&(x.segments.includes($('#zeroKmSegment').value)||x.electric&&$('#zeroKmSegment').value==='eletrico'));}
function gcZeroKmRefreshChassis(preferredBrand='',preferredModel=''){
  const model=gcZeroKmSelectedModel(),brandSelect=$('#zeroKmChassisBrand'),modelSelect=$('#zeroKmChassisModel');if(!model||!brandSelect||!modelSelect)return;
  const brands=model.brands||[];brandSelect.innerHTML='<option value="">Selecione fabricante do chassi</option>'+brands.map(x=>`<option>${escapeHtml(x)}</option>`).join('');brandSelect.value=brands.includes(preferredBrand)?preferredBrand:(brands[0]||'');
  const rows=gcZeroKmAvailableChassis(model,brandSelect.value);modelSelect.innerHTML='<option value="">Selecione o chassi</option>'+rows.map(x=>`<option value="${escapeHtml(x.model)}">${escapeHtml(x.model)} · ${escapeHtml(x.engine)}</option>`).join('');modelSelect.disabled=!rows.length;modelSelect.value=rows.some(x=>x.model===preferredModel)?preferredModel:(rows[0]?.model||'');gcZeroKmApplyChassisDefaults();
}
function gcZeroKmApplyModelDefaults(){const model=gcZeroKmSelectedModel();if(!model)return;
  $('#zeroKmLength').value=model.length;$('#zeroKmWidth').value=model.width;$('#zeroKmHeight').value=model.height;$('#zeroKmSeated').value=model.seated;$('#zeroKmStanding').value=model.standing;$('#zeroKmDoors').value=String(model.doors);$('#zeroKmFloor').value=model.floor;
  if(model.electric){$('#zeroKmEmission').value='Elétrico a bateria (BEV)';$('#zeroKmEnginePosition').value='Elétrico / integrado';$('#zeroKmTransmission').value='Elétrica / redução integrada';$('#zeroKmAir').value='Ar-condicionado padrão';}
  else{if($('#zeroKmEmission').value==='Elétrico a bateria (BEV)')$('#zeroKmEmission').value='Diesel Proconve P-8 / Euro VI';if($('#zeroKmEnginePosition').value==='Elétrico / integrado')$('#zeroKmEnginePosition').value='Traseiro';if($('#zeroKmTransmission').value==='Elétrica / redução integrada')$('#zeroKmTransmission').value='Manual';}
  gcZeroKmRefreshChassis();gcZeroKmUpdateCapacity();gcZeroKmInvalidateQuote();
}
function gcZeroKmApplyChassisDefaults(){const model=gcZeroKmSelectedModel(),chassis=gcZeroKmAvailableChassis(model,$('#zeroKmChassisBrand').value).find(x=>x.model===$('#zeroKmChassisModel').value);if(!chassis)return;$('#zeroKmEngine').value=chassis.engine;$('#zeroKmAxles').value=chassis.axles.includes('6x2')?'6x2 · 3 eixos':chassis.axles==='8x2'?'8x2 · 4 eixos':'4x2 · 2 eixos';$('#zeroKmEmission').value=chassis.electric?'Elétrico a bateria (BEV)':'Diesel Proconve P-8 / Euro VI';$('#zeroKmEnginePosition').value=chassis.electric?'Elétrico / integrado':(['O 500 U','O 500 M','O 500 UA articulado','18.320 SL'].some(x=>chassis.model.includes(x))?'Traseiro':'Dianteiro');if(chassis.electric)$('#zeroKmTransmission').value='Elétrica / redução integrada';gcZeroKmInvalidateQuote();}
function gcZeroKmUpdateCapacity(){const seats=Number($('#zeroKmSeated').value)||0,standing=Number($('#zeroKmStanding').value)||0;$('#zeroKmCapacityNote').textContent=`Lotação estimada: ${seats+standing} passageiros (${seats} sentados + ${standing} em pé). Confirme os limites homologados e a distribuição de peso na proposta oficial.`;}
function gcZeroKmInvalidateQuote(){gcZeroKmCurrentQuote=null;if($('#zeroKmSaveQuote'))$('#zeroKmSaveQuote').disabled=true;if($('#zeroKmAcquire'))$('#zeroKmAcquire').disabled=true;}
function gcZeroKmReadConfig(){const model=gcZeroKmSelectedModel(),chassis=gcZeroKmAvailableChassis(model,$('#zeroKmChassisBrand').value).find(x=>x.model===$('#zeroKmChassisModel').value);if(!model||!chassis)return null;const number=id=>Number($('#'+id).value);return {id:makeId(),company:$('#zeroKmCompany').value,prefix:$('#zeroKmPrefix').value.trim(),quantity:Math.max(1,Math.min(100,Math.floor(number('zeroKmQuantity')))),year:$('#zeroKmYear').value,deliveryMonths:number('zeroKmDelivery'),region:$('#zeroKmQuoteRegion').value,segment:$('#zeroKmSegment').value,make:model.make,model:model.model,modelId:model.id,chassisBrand:chassis.brand,chassisModel:chassis.model,engine:$('#zeroKmEngine').value.trim()||chassis.engine,emission:$('#zeroKmEmission').value,enginePosition:$('#zeroKmEnginePosition').value,length:number('zeroKmLength'),width:number('zeroKmWidth'),height:number('zeroKmHeight'),seated:number('zeroKmSeated'),standing:number('zeroKmStanding'),doors:$('#zeroKmDoors').value,floor:$('#zeroKmFloor').value,axles:$('#zeroKmAxles').value,suspension:$('#zeroKmSuspension').value,transmission:$('#zeroKmTransmission').value,air:$('#zeroKmAir').value,seatsType:$('#zeroKmSeatsType').value,accessibility:$('#zeroKmAccessibility').value,usb:$('#zeroKmUSB').value,wifi:$('#zeroKmWifi').value,cameras:$('#zeroKmCameras').value,led:$('#zeroKmLED').value,gps:$('#zeroKmGPS').value,validator:$('#zeroKmValidator').value,paint:$('#zeroKmPaint').value,interior:$('#zeroKmInterior').value,warrantyMonths:number('zeroKmWarranty'),maintenance:$('#zeroKmMaintenance').value,payment:$('#zeroKmPayment').value,downPct:number('zeroKmDownPct'),months:number('zeroKmMonths'),rate:number('zeroKmRate'),basePrice:model.base,chassisAddon:chassis.baseAdd||0,source:model.url};}
function gcZeroKmCalculatePrice(c){let price=c.basePrice+(c.chassisAddon||0);if(/Ar-condicionado padrão/.test(c.air))price+=35000;else if(/alta capacidade/.test(c.air))price+=60000;else if(/zonal|executivo/.test(c.air))price+=85000;if(c.transmission==='Automática')price+=30000;if(c.transmission.includes('retarder'))price+=65000;if(c.suspension.includes('integral'))price+=60000;else if(c.suspension.includes('traseiro'))price+=25000;if(c.accessibility==='Plataforma elevatória')price+=28000;else if(c.accessibility==='Rampa de acesso')price+=12000;else if(c.accessibility.includes('Piso baixo'))price+=35000;if(c.usb==='USB por fileira')price+=9000;else if(c.usb.includes('individual'))price+=22000;if(c.wifi.includes('instalados'))price+=9500;if(c.cameras.includes('4 câmeras'))price+=12500;else if(c.cameras.includes('6 câmeras'))price+=18000;else if(c.cameras.includes('8 câmeras'))price+=26000;if(c.led.includes('Frontal +'))price+=12500;else if(c.led.includes('Destino frontal'))price+=17500;if(c.gps.includes('Preparação'))price+=3500;else if(c.gps.includes('Telemetria'))price+=12500;if(c.validator.includes('Prodata'))price+=15000;else if(c.validator.includes('Digicon'))price+=12500;else if(c.validator.includes('Tacom'))price+=11000;else if(c.validator.includes('Conjunto'))price+=14000;if(c.seatsType==='Executiva / turismo')price+=22000;else if(c.seatsType==='Semileito')price+=65000;else if(c.seatsType==='Leito')price+=130000;else if(c.seatsType.includes('Leito-cama'))price+=210000;if(c.paint.includes('personalizada'))price+=18000;else if(c.paint.includes('Verde')||c.paint.includes('Azul'))price+=6500;if(c.interior==='Turismo premium')price+=28000;else if(c.interior==='Executivo')price+=18000;if(c.warrantyMonths>=36)price+=35000;if(c.maintenance.includes('Preventiva básica'))price+=18000;else if(c.maintenance.includes('Preventiva completa'))price+=42000;else if(c.maintenance.includes('estendido'))price+=70000;price*=1+Math.max(0,c.deliveryMonths<=3?0.035:0);return Math.round(price/100)*100;}
function gcZeroKmCurrentQuoteText(q){const c=q.config;return `GRUPO CONECT — COTAÇÃO SIMULADA DE ÔNIBUS 0 KM\nCotação: ${q.id}\nData: ${new Date(q.createdAt).toLocaleString('pt-BR')}\nComprador: ${c.company}\nUnidades: ${c.quantity} · Prefixo inicial: ${c.prefix}\nAno/modelo: ${c.year} · Entrega em ${c.deliveryMonths} meses (estimativa) · Destino: ${c.region}\nCarroceria: ${c.make} ${c.model}\nAplicação: ${c.segment}\nChassi: ${c.chassisBrand} ${c.chassisModel}\nMotor: ${c.engine}\nPropulsão: ${c.emission} · motor ${c.enginePosition}\nDimensões C×L×A: ${c.length} × ${c.width} × ${c.height} m\nLotação estimada: ${c.seated} sentados + ${c.standing} em pé = ${c.seated+c.standing}\nPortas: ${c.doors} · piso: ${c.floor} · eixos: ${c.axles} · suspensão: ${c.suspension}\nTransmissão: ${c.transmission} · ar: ${c.air} · poltronas: ${c.seatsType}\nAcessibilidade: ${c.accessibility}\nUSB: ${c.usb} · Wi-Fi: ${c.wifi} · câmeras: ${c.cameras} · letreiros: ${c.led}\nGPS/telemetria: ${c.gps} · validador: ${c.validator}\nPintura: ${c.paint} · interior: ${c.interior}\nGarantia desejada: ${c.warrantyMonths} meses · manutenção: ${c.maintenance}\nPreço unitário estimado: ${money(q.unitPrice)}\nQuantidade: ${c.quantity} · Total estimado: ${money(q.totalPrice)}\nForma: ${c.payment==='cash'?'À vista (simulação)':c.payment==='finance'?'Financiamento simulado':'Somente cotação'}${c.payment==='finance'?`\nEntrada estimada: ${money(q.downTotal)} · ${c.months} parcelas estimadas de ${money(q.installmentPerBus)}/ônibus por mês · taxa fictícia ${c.rate}% a.m.`:''}\n\nIMPORTANTE: valores, prazos, opcionais e compatibilidade são estimativas fictícias. Não é oferta comercial ou pedido de fábrica. Confirme ficha técnica, lotação homologada, compatibilidade carroceria/chassi, preço e prazo com as empresas responsáveis.\nFicha de referência: ${c.source}`;}
function gcZeroKmRenderQuote(q){$('#zeroKmQuoteResult').hidden=false;$('#zeroKmQuoteTitle').textContent=`${q.config.make} ${q.config.model} · ${q.config.quantity} unidade(s)`;$('#zeroKmQuoteStats').innerHTML=[['Preço estimado por unidade',money(q.unitPrice)],['Quantidade',String(q.config.quantity)],['Total estimado',money(q.totalPrice)],['Prazo estimado de entrega',`${q.config.deliveryMonths} mês(es)`],['Entrada simulada',money(q.downTotal||0)],['Parcela estimada por unidade',q.config.payment==='finance'?money(q.installmentPerBus):'—']].map(([l,v])=>moneyStat(l,v)).join('');$('#zeroKmQuoteSpec').innerHTML=`<div><strong>Configuração selecionada</strong><p>${escapeHtml(q.config.company)} · ${escapeHtml(q.config.prefix)} · ${escapeHtml(q.config.year)}<br>${escapeHtml(q.config.chassisBrand)} ${escapeHtml(q.config.chassisModel)} · ${escapeHtml(q.config.engine)}<br>${escapeHtml(q.config.length+' × '+q.config.width+' × '+q.config.height)} m · ${q.config.seated} sentados + ${q.config.standing} em pé<br>${escapeHtml(q.config.transmission)} · ${escapeHtml(q.config.suspension)} · ${escapeHtml(q.config.accessibility)}<br>${escapeHtml(q.config.validator)} · ${escapeHtml(q.config.paint)}</p></div><p class="tool-result-note">Preço ilustrativo de simulação. A combinação real depende de validação técnica e cotação oficial.</p>`;$('#zeroKmSaveQuote').disabled=false;$('#zeroKmAcquire').disabled=q.config.payment==='quote';$('#zeroKmCopyQuote').dataset.quoteId=q.id;$('#zeroKmDownloadQuote').dataset.quoteId=q.id;}
function gcZeroKmRenderHistory(){const el=$('#zeroKmQuoteHistory');if(!el)return;const rows=readArrayKey(GC_ZERO_KM_QUOTES_KEY).slice().reverse().slice(0,20);el.innerHTML=rows.length?rows.map(q=>`<article class="record-item"><div><strong>${escapeHtml(q.config.make)} ${escapeHtml(q.config.model)} · ${escapeHtml(q.config.company)}</strong><small>${escapeHtml(q.config.chassisBrand)} ${escapeHtml(q.config.chassisModel)} · ${q.config.quantity} unidade(s) · total ${money(q.totalPrice)} · ${escapeHtml(new Date(q.createdAt).toLocaleDateString('pt-BR'))}</small></div><button class="secondary-action-button" type="button" data-zero-km-load="${escapeHtml(q.id)}">Carregar cotação</button></article>`).join(''):recordsEmpty('Nenhuma cotação guardada ainda.');}
function gcZeroKmInvalidateOnEdit(){gcZeroKmInvalidateQuote();}
function gcZeroKmCalculateQuote(){if(!assertOwner())return;const c=gcZeroKmReadConfig();if(!c||!c.company||!c.prefix||!c.quantity||c.length<=0||c.width<=0||c.height<=0||c.seated<1||c.standing<0){showToast('Confira comprador, prefixo, modelo, chassi, dimensões e lotação.');return;}if(c.downPct<0||c.downPct>100||c.rate<0||c.rate>10||c.months<1){showToast('Confira entrada e condições de financiamento.');return;}const unitPrice=gcZeroKmCalculatePrice(c),totalPrice=unitPrice*c.quantity,downTotal=c.payment==='finance'?totalPrice*c.downPct/100:0,principalPerBus=unitPrice*(1-c.downPct/100),installmentPerBus=c.payment==='finance'?loanMonthlyPayment(principalPerBus,c.months,c.rate):0;gcZeroKmCurrentQuote={id:makeId(),createdAt:new Date().toISOString(),config:c,unitPrice,totalPrice,downTotal,installmentPerBus};gcZeroKmRenderQuote(gcZeroKmCurrentQuote);}
$('#zeroKmOpenButton').addEventListener('click',()=>{if(!assertOwner())return;$('#zeroKmMarketPanel').hidden=false;gcZeroKmRenderHistory();gcZeroKmRefreshModels();$('#zeroKmMarketPanel').scrollIntoView({behavior:'smooth',block:'start'});});
$('#zeroKmCloseButton').addEventListener('click',()=>{$('#zeroKmMarketPanel').hidden=true;$('#zeroKmOpenButton').scrollIntoView({behavior:'smooth',block:'center'});});
$('#ownerValidatorOpenButton')?.addEventListener('click',()=>{if(!assertOwner())return;gcValidatorRender();switchScreen('validatorScreen');});
$('#zeroKmSegment').addEventListener('change',()=>gcZeroKmRefreshModels());
$('#zeroKmBodyBuilder').addEventListener('change',()=>gcZeroKmRefreshModels());
$('#zeroKmModel').addEventListener('change',()=>{const m=gcZeroKmSelectedModel();gcZeroKmApplyModelDefaults();if(m){const brand=m.brands?.[0]||'';gcZeroKmRefreshChassis(brand);}});
$('#zeroKmChassisBrand').addEventListener('change',()=>gcZeroKmRefreshChassis($('#zeroKmChassisBrand').value));
$('#zeroKmChassisModel').addEventListener('change',gcZeroKmApplyChassisDefaults);
['zeroKmCompany','zeroKmPrefix','zeroKmQuantity','zeroKmYear','zeroKmDelivery','zeroKmQuoteRegion','zeroKmEngine','zeroKmEmission','zeroKmEnginePosition','zeroKmLength','zeroKmWidth','zeroKmHeight','zeroKmSeated','zeroKmStanding','zeroKmDoors','zeroKmFloor','zeroKmAxles','zeroKmSuspension','zeroKmTransmission','zeroKmAir','zeroKmSeatsType','zeroKmAccessibility','zeroKmUSB','zeroKmWifi','zeroKmCameras','zeroKmLED','zeroKmGPS','zeroKmValidator','zeroKmPaint','zeroKmInterior','zeroKmWarranty','zeroKmMaintenance','zeroKmPayment','zeroKmDownPct','zeroKmMonths','zeroKmRate'].forEach(id=>{const el=$('#'+id);el.addEventListener('input',()=>{gcZeroKmInvalidateOnEdit();if(id==='zeroKmSeated'||id==='zeroKmStanding')gcZeroKmUpdateCapacity();});el.addEventListener('change',()=>{gcZeroKmInvalidateOnEdit();if(id==='zeroKmSeated'||id==='zeroKmStanding')gcZeroKmUpdateCapacity();if(id==='zeroKmPayment'){const financ=$('#zeroKmPayment').value==='finance';$('#zeroKmDownPct').disabled=!financ;$('#zeroKmMonths').disabled=!financ;$('#zeroKmRate').disabled=!financ;}});});
$('#zeroKmConfigForm').addEventListener('submit',event=>{event.preventDefault();gcZeroKmCalculateQuote();});
$('#zeroKmSaveQuote').addEventListener('click',()=>{if(!assertOwner()||!gcZeroKmCurrentQuote)return;const rows=readArrayKey(GC_ZERO_KM_QUOTES_KEY);if(rows.some(x=>x.id===gcZeroKmCurrentQuote.id)){showToast('Esta cotação já foi guardada.');return;}rows.push(gcZeroKmCurrentQuote);if(!writeArrayKey(GC_ZERO_KM_QUOTES_KEY,rows))return;gcZeroKmRenderHistory();showToast('Cotação 0 km guardada no histórico local.');});
$('#zeroKmCopyQuote').addEventListener('click',async()=>{if(!gcZeroKmCurrentQuote)return;showToast(await copyText(gcZeroKmCurrentQuoteText(gcZeroKmCurrentQuote))?'Ficha da cotação copiada.':'Não foi possível copiar automaticamente.');});
$('#zeroKmDownloadQuote').addEventListener('click',()=>{if(!gcZeroKmCurrentQuote)return;downloadTextFile(`grupo-conect-cotacao-0km-${gcZeroKmCurrentQuote.config.prefix}.txt`,gcZeroKmCurrentQuoteText(gcZeroKmCurrentQuote),'text/plain;charset=utf-8');showToast('Ficha da cotação baixada.');});
function gcZeroKmPrefixList(base,qty){const raw=String(base||'').trim(),m=raw.match(/^(.*?)(\d+)$/);return Array.from({length:qty},(_,i)=>qty===1?raw:m?m[1]+String(Number(m[2])+i).padStart(m[2].length,'0'):`${raw}-${String(i+1).padStart(2,'0')}`);}
function gcZeroKmAcquire(){if(!assertOwner()||!gcZeroKmCurrentQuote)return;const q=gcZeroKmCurrentQuote,c=q.config;if(c.payment==='quote'){showToast('Escolha compra à vista ou financiamento para registrar a aquisição.');return;}const prefixes=gcZeroKmPrefixList(c.prefix,c.quantity),existing=GROUP_COMPANIES.flatMap(company=>availableBusPool(company).map(x=>({company:x.company||company,prefix:x.prefix}))).concat(ownerFleet());const conflicts=prefixes.filter(prefix=>existing.some(x=>norm(x.company)===norm(c.company)&&norm(x.prefix)===norm(prefix)));if(conflicts.length){showToast(`Prefixo já existente: ${conflicts.join(', ')}. Escolha um prefixo inicial livre.`);return;}const cash=cashBreakdown();let downTotal=0;const finance=c.payment==='finance'&&c.downPct<100;if(c.payment==='cash'||c.payment==='finance'&&!finance){downTotal=q.totalPrice;}else if(finance)downTotal=q.totalPrice*c.downPct/100;if(downTotal>cash.balance+0.005){showToast(`Aquisição recusada: o caixa disponível é ${money(cash.balance)} e a entrada exigida é ${money(downTotal)}. Registre um aporte ou escolha outra condição.`);return;}const newFleet=[],newFinance=[];prefixes.forEach(prefix=>{const row={id:makeId(),company:c.company,prefix,model:`${c.make} ${c.model}`,chassis:`${c.chassisBrand} ${c.chassisModel}`,createdAt:new Date().toISOString(),source:'zero-km-market',isZeroKm:true,year:c.year,seats:c.seated,standing:c.standing,lengthM:c.length,widthM:c.width,heightM:c.height,bodyBuilder:c.make,engine:c.engine,segment:c.segment,doors:c.doors,floor:c.floor,transmission:c.transmission,air:c.air,validator:c.validator,paint:c.paint,sourceQuoteId:q.id};newFleet.push(row);if(finance){const price=q.unitPrice,down=price*c.downPct/100,principal=price-down;newFinance.push({id:makeId(),company:c.company,model:row.model,chassis:row.chassis,year:c.year,prefix,price,downPayment:down,principal,installmentCount:c.months,monthlyRate:c.rate,installmentAmount:loanMonthlyPayment(principal,c.months,c.rate),firstDueDate:addMonthsToISO(dateTodayLocal(),1),lateFinePct:2,lateInterestPct:1,paidCount:0,payments:[],createdAt:new Date().toISOString(),zeroKmQuoteId:q.id});}});const fl=ownerFleet();fl.push(...newFleet);if(!writeArrayKey(OWNER_FLEET_KEY,fl))return;if(newFinance.length){const fr=financedBuses();fr.push(...newFinance);if(!writeArrayKey(FINANCED_BUSES_KEY,fr))return;}if(downTotal>0){const led=cashLedger();led.push({id:`zero-km-cash-${q.id}`,date:dateTodayLocal(),direction:'out',category:finance?'Entrada de ônibus 0 km financiado':'Compra de ônibus 0 km',amount:downTotal,description:`${c.quantity} × ${c.make} ${c.model} · ${prefixes.join(', ')} · cotação ${q.id}`,createdAt:new Date().toISOString(),source:'zeroKmPurchase',quoteId:q.id});if(!writeArrayKey(CASH_LEDGER_KEY,led))return;}renderOwnerFleet();refreshOperationChoices();renderFinanceList();renderCashDashboard();const quotes=readArrayKey(GC_ZERO_KM_QUOTES_KEY);const ix=quotes.findIndex(x=>x.id===q.id);if(ix>=0){quotes[ix]={...quotes[ix],status:'Aquisição registrada',prefixes};writeArrayKey(GC_ZERO_KM_QUOTES_KEY,quotes);}showToast(`${newFleet.length} ônibus 0 km adicionado(s) à frota. ${finance?`${newFinance.length} financiamento(s) cadastrado(s).`:c.payment==='cash'?'Compra simulada lançada no Caixa.':'Aquisição registrada.'}`);gcZeroKmRenderHistory();$('#zeroKmAcquire').disabled=true;}
$('#zeroKmAcquire').addEventListener('click',gcZeroKmAcquire);
$('#zeroKmQuoteHistory').addEventListener('click',event=>{const b=event.target.closest('[data-zero-km-load]');if(!b)return;if(!assertOwner())return;const q=readArrayKey(GC_ZERO_KM_QUOTES_KEY).find(x=>x.id===b.dataset.zeroKmLoad);if(!q)return;const c=q.config;$('#zeroKmCompany').value=c.company;$('#zeroKmPrefix').value=c.prefix;$('#zeroKmQuantity').value=c.quantity;$('#zeroKmYear').value=c.year;$('#zeroKmDelivery').value=String(c.deliveryMonths);$('#zeroKmQuoteRegion').value=c.region;$('#zeroKmSegment').value=c.segment;$('#zeroKmBodyBuilder').value=c.make;gcZeroKmRefreshModels(c.modelId);gcZeroKmRefreshChassis(c.chassisBrand,c.chassisModel);for(const [id,key] of Object.entries({zeroKmEngine:'engine',zeroKmEmission:'emission',zeroKmEnginePosition:'enginePosition',zeroKmLength:'length',zeroKmWidth:'width',zeroKmHeight:'height',zeroKmSeated:'seated',zeroKmStanding:'standing',zeroKmDoors:'doors',zeroKmFloor:'floor',zeroKmAxles:'axles',zeroKmSuspension:'suspension',zeroKmTransmission:'transmission',zeroKmAir:'air',zeroKmSeatsType:'seatsType',zeroKmAccessibility:'accessibility',zeroKmUSB:'usb',zeroKmWifi:'wifi',zeroKmCameras:'cameras',zeroKmLED:'led',zeroKmGPS:'gps',zeroKmValidator:'validator',zeroKmPaint:'paint',zeroKmInterior:'interior',zeroKmWarranty:'warrantyMonths',zeroKmMaintenance:'maintenance',zeroKmPayment:'payment',zeroKmDownPct:'downPct',zeroKmMonths:'months',zeroKmRate:'rate'})){const el=$('#'+id);if(el)el.value=String(c[key]);}gcZeroKmCalculateQuote();$('#zeroKmMarketPanel').scrollIntoView({behavior:'smooth',block:'start'});});

function renderOwnerRoutes(){
  refreshRouteDatalists();
  const list=$('#ownerRouteList');if(!list)return;
  const rows=ownerRoutes();
  list.innerHTML=rows.length?rows.slice().reverse().map(r=>`<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(r.city)} · ${escapeHtml(r.line)}</strong><small>${escapeHtml(r.serviceType||'Municipal')} · cadastrada em ${escapeHtml(displayDateValue(r.createdAt||dateTodayLocal()))}</small><span class="record-inline-tag">${escapeHtml(r.serviceType||'Municipal')}</span></div><div class="inline-toolbar"><button class="secondary-action-button" type="button" data-owner-route-scale="${escapeHtml(r.id)}">Usar na escala</button><button class="secondary-action-button" type="button" data-owner-route-contract="${escapeHtml(r.id)}">Solicitar contrato</button><button class="record-danger" type="button" data-owner-route-delete="${escapeHtml(r.id)}">Excluir</button></div></div></article>`).join(''):recordsEmpty('Nenhuma rota cadastrada. Cadastre cidade, linha e tipo de serviço; depois use a rota na escala diária ou peça uma proposta municipal.');
}
$('#ownerRouteForm').addEventListener('submit',event=>{
  event.preventDefault();if(!assertOwner())return;
  const city=$('#orCity').value.trim(),line=$('#orLine').value.trim(),serviceType=$('#orType').value;
  if(!city||!line){showToast('Informe a cidade e a linha.');return;}
  const rows=ownerRoutes(),old=rows.find(r=>routeKey(r.city,r.line)===routeKey(city,line));
  if(old){old.serviceType=serviceType;old.updatedAt=new Date().toISOString();}
  else rows.push({id:makeId(),city,line,serviceType,createdAt:new Date().toISOString()});
  if(!writeArrayKey(OWNER_ROUTES_KEY,rows))return;
  $('#ownerRouteForm').reset();$('#orType').value='Municipal';renderOwnerRoutes();
  showToast(old?'Tipo de serviço da rota atualizado.':'Cidade e linha cadastradas; já podem ser usadas na escala e nos contratos.');
});
$('#ownerRouteList').addEventListener('click',event=>{
  const useScale=event.target.closest('[data-owner-route-scale]'),useContract=event.target.closest('[data-owner-route-contract]'),del=event.target.closest('[data-owner-route-delete]');
  const routeId=(useScale||useContract||del)?.dataset.ownerRouteScale||(useContract?.dataset.ownerRouteContract)||(del?.dataset.ownerRouteDelete);
  if(!routeId)return;if(!assertOwner())return;
  const route=ownerRoutes().find(r=>r.id===routeId);if(!route)return;
  if(del){if(!window.confirm(`Excluir a rota ${route.city} · ${route.line}? As escalas e contratos já salvos serão preservados.`))return;writeArrayKey(OWNER_ROUTES_KEY,ownerRoutes().filter(r=>r.id!==routeId));renderOwnerRoutes();showToast('Rota excluída do cadastro.');return;}
  if(useScale){ownerScalePreview=null;latestScaleText='';$('#ownerScaleResults').hidden=true;$('#osCity').value=route.city;$('#osLine').value=route.line;$('#osServiceType').value='auto';suggestDemandFromHistory();$('#ownerScaleForm').scrollIntoView({behavior:'smooth',block:'start'});showToast('Rota carregada na escala. Escolha a empresa e informe a demanda do dia.');}
  if(useContract){currentOwnerContract=null;currentOwnerContractText='';$('#ownerContractResults').hidden=true;$('#ocCity').value=route.city;$('#ocLine').value=route.line;$('#ownerContractForm').scrollIntoView({behavior:'smooth',block:'start'});showToast('Cidade e linha carregadas para solicitar uma proposta municipal.');}
});

function vehicleFromStaticFleet(company){
  const result=[];
  FLEET.filter(m=>norm(m.company)===norm(company)).forEach(m=>(m.prefixes||[]).forEach(prefix=>result.push({company:m.company,prefix:String(prefix),model:m.model,chassis:m.chassis||'',source:'base',service:m.service||'A definir'})));
  return result;
}
function availableBusPool(company,date='',city='',line=''){
  const map=new Map();
  vehicleFromStaticFleet(company).forEach(x=>map.set(`${norm(x.company)}|${norm(x.prefix)}`,x));
  ownerFleet().filter(x=>norm(x.company)===norm(company)&&x.prefix&&x.model).forEach(x=>map.set(`${norm(x.company)}|${norm(x.prefix)}`,{...x,source:'custom',company:x.company,prefix:String(x.prefix),model:x.model,chassis:x.chassis||'',service:x.type||'A definir'}));
  let rows=Array.from(map.values());
  if(date){
    // Um prefixo só pode atender uma viagem por data: desconta escalas diárias,
    // operações recorrentes, fretamentos aceitos e viagens normais já registradas.
    const occupied=new Set(ownerScales().filter(x=>x.date===date&&norm(x.company)===norm(company)).map(x=>norm(x.prefix)));
    rows=rows.filter(x=>!occupied.has(norm(x.prefix)));
    if(typeof gcOnlineBusReservationReason==='function'){
      rows=rows.filter(x=>!gcOnlineBusReservationReason(x,date));
    }
  }
  return rows;
}
function renderOwnerFleet(){
  const list=$('#ownerFleetList');if(!list)return;
  const rows=GROUP_COMPANIES.flatMap(company=>availableBusPool(company).map(x=>({...x,company}))).sort((a,b)=>a.company.localeCompare(b.company,'pt-BR')||String(a.prefix).localeCompare(String(b.prefix),'pt-BR',{numeric:true}));
  list.innerHTML=rows.length?rows.map(x=>`<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(x.company)} · prefixo ${escapeHtml(x.prefix)} · ${escapeHtml(x.model)}</strong><small>Chassi: ${escapeHtml(x.chassis||'não informado')} · o veículo pode ser escalado para linhas diferentes em dias diferentes</small><span class="record-inline-tag">${x.source==='base'?'Frota base':'Cadastro do proprietário'}</span></div>${x.source==='custom'?`<button class="record-danger" type="button" data-owner-fleet-delete="${escapeHtml(x.id)}">Excluir</button>`:''}</div></article>`).join(''):recordsEmpty('Nenhum veículo disponível. Cadastre modelos e prefixos da empresa.');
}
$('#ownerFleetForm').addEventListener('submit',event=>{
  event.preventDefault();if(!assertOwner())return;
  const row={id:makeId(),company:$('#ofCompany').value.trim(),prefix:$('#ofPrefix').value.trim(),model:$('#ofModel').value.trim(),chassis:$('#ofChassis').value.trim(),createdAt:new Date().toISOString(),source:'owner'};
  if(!row.company||!row.prefix||!row.model){showToast('Informe empresa, prefixo e modelo. O chassi é opcional.');return;}
  if(availableBusPool(row.company).some(x=>norm(x.prefix)===norm(row.prefix))){showToast('Este prefixo já está disponível nessa empresa. Confira o cadastro para evitar duplicidade.');return;}
  const rows=ownerFleet();rows.push(row);if(!writeArrayKey(OWNER_FLEET_KEY,rows))return;
  $('#ownerFleetForm').reset();renderOwnerFleet();refreshOperationChoices();renderMarket();showToast('Veículo adicionado ao conjunto de ônibus que a escala pode recomendar.');
});
$('#ownerFleetList').addEventListener('click',event=>{const b=event.target.closest('[data-owner-fleet-delete]');if(!b)return;if(!assertOwner())return;if(!window.confirm('Excluir este veículo personalizado da frota disponível? Escalas e financiamentos antigos serão preservados.'))return;writeArrayKey(OWNER_FLEET_KEY,ownerFleet().filter(x=>x.id!==b.dataset.ownerFleetDelete));renderOwnerFleet();refreshOperationChoices();showToast('Veículo removido da frota disponível.');});
$('#ownerExportFleet').addEventListener('click',()=>{
  if(!assertOwner())return;const rows=GROUP_COMPANIES.flatMap(company=>availableBusPool(company).map(x=>({...x,company})));
  if(!rows.length){showToast('Não há veículos para exportar.');return;}
  const header=['Empresa','Prefixo','Modelo','Chassi','Origem'];const data=rows.map(x=>[x.company,x.prefix,x.model,x.chassis,x.source==='base'?'Frota base':'Cadastro do proprietário']);
  downloadTextFile('grupo-conect-frota.csv',[header,...data].map(r=>r.map(csvCell).join(';')).join('\n'),'text/csv;charset=utf-8');showToast('Frota exportada em CSV.');
});

function scalesForProfile(weekday,city,line,company=''){
  return ownerScales().filter(x=>x.weekday===weekday&&norm(x.city)===norm(city)&&norm(x.line)===norm(line)&&(!company||norm(x.company)===norm(company)));
}
['osWeekday','osCity','osLine','osCompany'].forEach(id=>$('#'+id).addEventListener('change',suggestDemandFromHistory));
$('#osDate').value=dateTodayLocal();
if(weekdayFromISO($('#osDate').value))$('#osWeekday').value=weekdayFromISO($('#osDate').value);
$('#osDate').addEventListener('change',()=>{const d=weekdayFromISO($('#osDate').value);if(d)$('#osWeekday').value=d;suggestDemandFromHistory();});
let latestScaleText='';
function suggestDemandFromHistory(){
  if(!$('#ownerDemandNote'))return;
  const weekday=$('#osWeekday').value,city=$('#osCity').value.trim(),line=$('#osLine').value.trim(),company=$('#osCompany').value;
  const note=$('#ownerDemandNote');
  const route=findRegisteredRoute(city,line);
  const rows=city&&line?scalesForProfile(weekday,city,line,company):[];
  const busCount=company?availableBusPool(company,$('#osDate').value,city,line).length:0;
  const parts=[];
  if(route)parts.push(`Rota cadastrada como ${route.serviceType||'Municipal'}.`);
  else if(city&&line)parts.push('Rota não cadastrada: será analisada com o tipo de serviço informado.');
  if(rows.length){
    $('#osPassengers').value=Math.round(avg(rows,'passengers'));
    $('#osFree').value=Math.min(Number($('#osPassengers').value),Math.round(avg(rows,'free')));
    $('#osTripsDay').value=Math.max(1,Math.round(avg(rows,'tripsDay')));
    parts.push(`Demanda sugerida por ${rows.length} escala(s) anterior(es) do mesmo dia, empresa, cidade e linha.`);
  }else if(city&&line)parts.push(`Sem histórico para ${WEEKDAY_LABELS[weekday]}, ${city} · ${line}; serão usados os dados de demanda informados agora.`);
  if(company)parts.push(`${busCount} veículo(s) disponível(is) de ${company} para essa data, descontando prefixos usados em outras linhas no mesmo dia.`);
  parts.push('A escolha final do ônibus considera categoria do serviço, capacidade estimada, distância, intervalos e consumo de referência.');
  note.textContent=parts.join(' ');
}
function matchMarketBus(model,chassis=''){
  if(!Array.isArray(BUS_MARKET))return null;
  const clean=s=>norm(s).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(t=>t.length>2&&!['marcopolo','caio','neobus','mascarello','volare','busscar','comil','mercedes','benz','volkswagen','mb','of','ods','eod','euro','iii','iv','ii','2007','2019','2020','2021','2022','2023','2024'].includes(t));
  const wanted=clean(model), wantedAll=norm(model), chassisKey=norm(chassis);
  let best=null,bestScore=0;
  BUS_MARKET.forEach(item=>{
    const candidate=clean(item.model), candidateAll=norm(item.model);let score=0;
    if(wantedAll===candidateAll)score+=30;
    else if(wantedAll.includes(candidateAll)||candidateAll.includes(wantedAll))score+=16;
    const common=wanted.filter(t=>candidate.includes(t));score+=common.length*8;
    const union=new Set([...wanted,...candidate]).size; if(union)score+=common.length/union*6;
    if(/articulad|double|dd/.test(candidateAll)&&!/articulad|double|dd/.test(wantedAll))score-=15;
    if(/micro|volare|senior|foz|fly|attack 8/.test(candidateAll)&&!/micro|volare|senior|foz|fly|attack 8/.test(wantedAll))score-=8;
    if(chassisKey&&norm(item.chassis)&& (chassisKey.includes(norm(item.chassis))||norm(item.chassis).includes(chassisKey)))score+=4;
    if(score>bestScore){best=item;bestScore=score;}
  });
  return bestScore>=12?best:null;
}
function busOperationalProfile(vehicle){
  const model=String(vehicle.model||''),chassis=String(vehicle.chassis||''),name=norm(model),market=matchMarketBus(model,chassis);
  if(market){
    const type=String(market.type||'');
    const cls=/articulad|brt/.test(norm(type+' '+model))?'articulated':/micro|volare|senior|foz|fly|attack 8/.test(norm(type+' '+model))?'micro':/rodovi|double|high.?deck|viaggio|paradiso|audace|ideale|spectrum road/.test(norm(type+' '+model))?'coach':'urban';
    return {seated:Math.max(1,Number(market.seated||market.seats||40)),standing:Math.max(0,Number(market.standing||0)),capacity:Math.max(1,Number(market.totalCapacity||market.seated||market.seats||40)),kmpl:Number(market.kmL)||(/micro/.test(cls)?4.2:cls==='coach'?2.6:2.1),tank:Number(market.tankL)||(/micro/.test(cls)?150:cls==='coach'?480:280),length:Number(market.lengthM)||12,serviceClass:cls,profileSource:'ficha de referência do mercado'};
  }
  let cls='urban',seated=40,standing=28,kmpl=2.1,tank=280,length=12;
  if(/articulad|brt/.test(name)){cls='articulated';seated=55;standing=55;kmpl=1.25;tank=350;length=18.5;}
  else if(/micro|gran micro|volare|senior|foz|fly 8|fly 9|fly 10|fly 12|attack 8/.test(name)){cls='micro';seated=26;standing=/urbano/.test(name)?8:0;kmpl=4.2;tank=150;length=8.5;}
  else if(/rodovi|road|paradiso|viaggio|audace|ideale|double.?decker/.test(name)){cls='coach';seated=45;standing=0;kmpl=2.6;tank=480;length=/double.?decker/.test(name)?14:12.5;}
  else if(/torino|apache vip|gran via|spectrum|n10/.test(name)){cls='urban';seated=42;standing=30;kmpl=2.05;tank=280;length=12.5;}
  return {seated,standing,capacity:seated+standing,kmpl,tank,length,serviceClass:cls,profileSource:'estimativa pelo nome do modelo'};
}
function serviceTypeForScale(){
  const chosen=$('#osServiceType').value;
  if(chosen!=='auto')return chosen;
  const route=findRegisteredRoute($('#osCity').value,$('#osLine').value);
  if(route)return route.serviceType||'Municipal';
  if(/\brj\s*[×x]\s*(poa|sp|bh|curitiba|vit[oó]ria|bras[ií]lia|florian[oó]polis|juiz de fora)/i.test($('#osLine').value))return 'Interestadual';
  return 'Municipal';
}
function rankVehiclesForScale(vehicles,x,serviceType){
  const expected=Number(x.passengers)||0;
  return vehicles.map(v=>{
    const profile=busOperationalProfile(v),ratio=profile.capacity?expected/profile.capacity:2;let score=60;
    if(expected<=profile.capacity){score+=ratio>=0.45&&ratio<=0.9?24:ratio<0.25?8:14;}else score-=Math.min(90,45+(ratio-1)*65);
    if(serviceType==='Municipal')score+=profile.serviceClass==='urban'?32:profile.serviceClass==='articulated'?28:profile.serviceClass==='micro'?18:-48;
    else if(serviceType==='Intermunicipal'||serviceType==='Municipal e intermunicipal')score+=profile.serviceClass==='coach'?28:profile.serviceClass==='micro'?12:profile.serviceClass==='urban'?10:18;
    else if(serviceType==='Interestadual')score+=profile.serviceClass==='coach'?38:profile.serviceClass==='articulated'?-50:profile.serviceClass==='micro'?-30:-65;
    if(x.km>150)score+=profile.serviceClass==='coach'?25:profile.serviceClass==='urban'?-30:0;
    else if(x.km>60)score+=profile.serviceClass==='coach'?12:profile.serviceClass==='urban'?-14:0;
    else if(x.km<25)score+=profile.serviceClass==='urban'?10:profile.serviceClass==='coach'?-10:0;
    score+=Math.min(4.5,profile.kmpl)*3;
    if(profile.capacity<expected)score-=20;
    return {...v,profile,score};
  }).sort((a,b)=>b.score-a.score||b.profile.kmpl-a.profile.kmpl||String(a.prefix).localeCompare(String(b.prefix),'pt-BR',{numeric:true}));
}
function calculateOwnerScale(){
  const x={date:$('#osDate').value,weekday:$('#osWeekday').value,company:$('#osCompany').value.trim(),city:$('#osCity').value.trim(),line:$('#osLine').value.trim(),serviceType:serviceTypeForScale(),passengers:readToolValue('osPassengers'),free:readToolValue('osFree'),fare:readToolValue('osFare'),km:readToolValue('osKm'),minutes:readToolValue('osMinutes'),upKm:readToolValue('osUpKm'),flatKm:readToolValue('osFlatKm'),downKm:readToolValue('osDownKm'),diesel:readToolValue('osDieselPrice'),maintKm:readToolValue('osMaintKm'),laborHour:readToolValue('osLaborHour'),fixedTrip:readToolValue('osFixedCost'),tripsDay:readToolValue('osTripsDay'),headway:readToolValue('osHeadway')};
  if(!x.date||!x.weekday||!x.company||!x.city||!x.line||[x.passengers,x.free,x.fare,x.km,x.minutes,x.upKm,x.flatKm,x.downKm,x.diesel,x.maintKm,x.laborHour,x.fixedTrip,x.tripsDay,x.headway].some(v=>v===null)||x.passengers<0||x.free>x.passengers||x.km<=0||x.minutes<=0||x.diesel<=0||x.tripsDay<1||x.headway<1){showToast('Confira data, empresa, cidade, linha e os valores operacionais. As gratuidades não podem superar os passageiros previstos.');return null;}
  const terrainTotal=x.upKm+x.flatKm+x.downKm;
  if(Math.abs(terrainTotal-x.km)>Math.max(0.2,x.km*0.03)){showToast(`A soma de subidas, retas e descidas (${numberPt(terrainTotal,1)} km) precisa aproximar-se dos ${numberPt(x.km,1)} km totais.`);return null;}
  const all=availableBusPool(x.company,x.date,x.city,x.line);
  if(!all.length){showToast(`Nenhum ônibus de ${x.company} está disponível para essa data. Cadastre mais veículos ou confira as escalas já salvas.`);return null;}
  const ranked=rankVehiclesForScale(all,x,x.serviceType),chosen=ranked[0],profile=chosen.profile;
  if(!chosen){showToast('Não foi possível encontrar um veículo adequado para essa linha.');return null;}
  x.model=chosen.model;x.chassis=chosen.chassis||'Não informado';x.prefix=String(chosen.prefix);x.seats=profile.capacity;x.seated=profile.seated;x.standing=profile.standing;x.kmpl=profile.kmpl;x.tank=profile.tank;x.vehicleProfile=profile.profileSource;x.score=chosen.score;x.alternatives=ranked.slice(1,4).map(v=>({model:v.model,prefix:v.prefix,capacity:v.profile.capacity,kmpl:v.profile.kmpl,score:v.score}));
  const terrainFactor=Math.max(0.75,Math.min(1.6,1+(x.upKm/x.km)*0.30-(x.downKm/x.km)*0.07));
  const vehicleUnits=Math.max(1,Math.ceil(x.passengers/x.seats));
  const dailyVehicleRuns=x.tripsDay*vehicleUnits;
  const simultaneousBuses=Math.max(vehicleUnits,Math.ceil((x.minutes/x.headway)*vehicleUnits));
  const kmDaily=x.km*dailyVehicleRuns,litersTrip=(x.km/x.kmpl)*terrainFactor,litersDay=litersTrip*dailyVehicleRuns,dieselCost=litersDay*x.diesel;
  const maintenanceCost=kmDaily*x.maintKm,laborHours=(x.minutes/60)*dailyVehicleRuns,laborCost=laborHours*x.laborHour,fixedCost=dailyVehicleRuns*x.fixedTrip,dailyCost=dieselCost+maintenanceCost+laborCost+fixedCost;
  const payers=Math.max(0,x.passengers-x.free),revenue=payers*x.fare*x.tripsDay,profit=revenue-dailyCost,dailyPayers=payers*x.tripsDay,breakEven=dailyPayers>0?dailyCost/dailyPayers:null;
  const profileRows=scalesForProfile(x.weekday,x.city,x.line,x.company);
  Object.assign(x,{terrainFactor,vehicleUnits,dailyVehicleRuns,simultaneousBuses,kmDaily,litersTrip,litersDay,dieselCost,maintenanceCost,laborHours,laborCost,fixedCost,dailyCost,payers,revenue,profit,breakEven,profileCount:profileRows.length,demandSource:profileRows.length?'Perfil histórico do dia da semana':'Estimativa manual (sem histórico suficiente)'});
  $('#ownerScaleHeading').textContent=`${WEEKDAY_LABELS[x.weekday]} · ${x.company} · ${x.line}`;
  $('#ownerScaleStats').innerHTML=[['Ônibus recomendado',`${x.model} · prefixo ${x.prefix}`],['Capacidade estimada',`${x.seats} total (${x.seated} sentados + ${x.standing} em pé)`],['Perfil do veículo',`${x.serviceType} · consumo de referência ${numberPt(x.kmpl,2)} km/L`],['Ônibus simultâneos estimados',`${simultaneousBuses}`],['Passageiros/partida',`${x.passengers} (${x.payers} pagantes + ${x.free} gratuidades)`],['Partidas/dia',x.tripsDay],['Km da frota/dia',`${numberPt(kmDaily,1)} km`],['Diesel/dia',`${numberPt(litersDay,1)} L · ${money(dieselCost)}`],['Custo diário estimado',money(dailyCost)],['Arrecadação diária',money(revenue)],['Resultado diário estimado',money(profit)],['Tarifa de equilíbrio',breakEven===null?'Sem pagantes':money(breakEven)]].map(([l,v])=>moneyStat(l,v,l.includes('Resultado')?(profit>=0?'positive':'negative'):'')).join('');
  const alternatives=x.alternatives.length?` Alternativas próximas: ${x.alternatives.map(a=>`${a.model} prefixo ${a.prefix} (${a.capacity} passageiros estimados, ${numberPt(a.kmpl,1)} km/L)`).join('; ')}.`:' Não há outro veículo livre para comparar nesse dia.';
  $('#ownerScaleNarrative').textContent=`Recomendação: ${x.model}, prefixo ${x.prefix}. Escolha feita pela compatibilidade do tipo de serviço (${x.serviceType}), demanda por partida, capacidade aproximada, distância e economia estimada. Demanda: ${x.demandSource}${x.profileCount?` (${x.profileCount} escala(s) anterior(es))`:''}. Perfil técnico: ${x.vehicleProfile}; valores aproximados do catálogo ou estimados pelo nome do modelo. Fator de terreno ${numberPt(terrainFactor,2)}; são estimados ${vehicleUnits} ônibus por partida e ${simultaneousBuses} simultâneos pelo intervalo informado. Os custos incluem apenas os itens preenchidos.${alternatives}`;
  $('#ownerScaleResults').hidden=false;
  latestScaleText=`GRUPO CONECT — ESCALA DIÁRIA RECOMENDADA\nData: ${localDate(x.date)} · ${WEEKDAY_LABELS[x.weekday]}\nEmpresa: ${x.company}\nCidade/linha: ${x.city} · ${x.line}\nTipo de serviço: ${x.serviceType}\nÔnibus recomendado: ${x.model} · Prefixo ${x.prefix} · Chassi ${x.chassis}\nCapacidade estimada: ${x.seats} (${x.seated} sentados + ${x.standing} em pé) · Consumo de referência ${numberPt(x.kmpl,2)} km/L\nJustificativa: demanda, categoria de serviço, quilometragem e consumo. Perfil técnico: ${x.vehicleProfile}.\nPassageiros/partida: ${x.passengers} (pagantes ${x.payers} + gratuidades ${x.free})\nPartidas: ${x.tripsDay}/dia · Tempo ${x.minutes} min · intervalo ${x.headway} min\nÔnibus/partida ${vehicleUnits} · ônibus simultâneos estimados ${simultaneousBuses}\nKm/dia da frota: ${numberPt(kmDaily,1)} · Diesel/dia ${numberPt(litersDay,1)} L · custo diesel ${money(dieselCost)}\nManutenção ${money(maintenanceCost)} · mão de obra ${money(laborCost)} · fixos ${money(fixedCost)}\nCusto diário ${money(dailyCost)} · arrecadação ${money(revenue)} · resultado ${money(profit)}\nTarifa de equilíbrio por pagante: ${breakEven===null?'não calculada':money(breakEven)}\nAlternativas: ${x.alternatives.map(a=>`${a.model} prefixo ${a.prefix}`).join('; ')||'Nenhuma alternativa disponível'}\nValores simulados; capacidades/consumo são estimativas e não garantias de operação.`;
  ownerScalePreview=x;return x;
}
$('#ownerScaleForm').addEventListener('input',()=>{if(ownerScalePreview){ownerScalePreview=null;latestScaleText='';$('#ownerScaleResults').hidden=true;}});
$('#ownerScaleForm').addEventListener('submit',event=>{event.preventDefault();if(!assertOwner())return;calculateOwnerScale();});
$('#ownerSaveScale').addEventListener('click',()=>{if(!assertOwner()||!ownerScalePreview){showToast('Analise a linha antes de salvar a escala.');return;}const x={...ownerScalePreview,id:makeId(),createdAt:new Date().toISOString()};const rows=ownerScales();rows.push(x);if(!writeArrayKey(OWNER_SCALE_KEY,rows))return;ownerScalePreview=x;renderOwnerScales();refreshOperationChoices();renderOwnerFleet();showToast(`Escala salva: ${x.model} prefixo ${x.prefix} para ${x.line} em ${localDate(x.date)}.`);});
$('#ownerCopyScale').addEventListener('click',async()=>{if(!latestScaleText){showToast('Analise uma escala antes de copiar.');return;}showToast(await copyText(latestScaleText)?'Escala e justificativa copiadas.':'Não foi possível copiar automaticamente.');});
function renderOwnerScales(){const rows=ownerScales();$('#ownerScaleList').innerHTML=rows.length?rows.slice().reverse().map(x=>recordItem(`${localDate(x.date)} · ${WEEKDAY_LABELS[x.weekday]||x.weekday} · ${x.company} · ${x.line}`,`${x.model||'Modelo antigo'} · prefixo ${x.prefix||'—'} · ${x.tripsDay} viagens/dia · ${x.passengers} passageiros/viagem · resultado ${money(x.profit)}`,'data-owner-scale-delete',x.id)).join(''):recordsEmpty('Nenhuma escala salva. Informe o dia, linha e demanda; o sistema vai recomendar o ônibus e depois guardar essa referência para o histórico.');}
$('#ownerScaleList').addEventListener('click',event=>{const b=event.target.closest('[data-owner-scale-delete]');if(!b)return;if(!assertOwner())return;if(!window.confirm('Excluir esta escala? Ela deixará de compor o perfil histórico e liberar o prefixo para outra escala nessa data.'))return;writeArrayKey(OWNER_SCALE_KEY,ownerScales().filter(x=>x.id!==b.dataset.ownerScaleDelete));renderOwnerScales();refreshOperationChoices();suggestDemandFromHistory();renderOwnerFleet();showToast('Escala excluída.');});

// Contratos municipais simulados: a prefeitura apresenta proposta e pode recusar a contraproposta.
let currentOwnerContractText='';
let currentOwnerContract=null;
$('#ocStartDate').value=dateTodayLocal();
function renderOwnerContractHistory(){
  const el=$('#ownerContractHistory');if(!el)return;const rows=ownerContracts();
  el.innerHTML=rows.length?rows.slice().reverse().map(x=>`<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(x.city)} · ${escapeHtml(x.line)}</strong><small>${escapeHtml(x.company)} · aceita em ${escapeHtml(displayDateValue(x.acceptedAt||x.createdAt||dateTodayLocal()))}\nValor mensal aceito: ${money(Number(x.offer||0))} · custo estimado: ${money(Number(x.totalCost||0))} · resultado: ${money(Number(x.profit||0))}</small><span class="record-inline-tag">Contrato aceito na simulação</span></div><button class="record-danger" type="button" data-owner-contract-delete="${escapeHtml(x.id)}">Excluir</button></div></article>`).join(''):recordsEmpty('Nenhuma proposta aceita ainda. Solicite uma proposta à prefeitura e aceite quando fizer sentido no cenário.');
}
$('#ownerContractHistory').addEventListener('click',event=>{const b=event.target.closest('[data-owner-contract-delete]');if(!b)return;if(!assertOwner())return;if(!window.confirm('Excluir este registro de contrato aceito?'))return;writeArrayKey(OWNER_CONTRACTS_KEY,ownerContracts().filter(x=>x.id!==b.dataset.ownerContractDelete));renderOwnerContractHistory();showToast('Registro de contrato removido do histórico.');});
function updateContractProposalText(){
  if(!currentOwnerContract)return;
  const c=currentOwnerContract;
  currentOwnerContractText=[`GRUPO CONECT — PROPOSTA MUNICIPAL (SIMULAÇÃO)`,`Data: ${new Date().toLocaleDateString('pt-BR')}`,`Município: ${c.city}`,`Empresa: ${c.company}`,`Linha/lote: ${c.line}`,`Tipo da rota: ${c.serviceType}`,`Vigência sugerida: ${localDate(c.start)}`,`Situação: ${c.status}`,``,`PROPOSTA DA PREFEITURA`,`Valor mensal oferecido: ${money(c.offer)}`,`Pedido de aumento: ${c.counterPercent?`+${c.counterPercent}% (${money(c.counterOffer)})`:'não solicitado'}`,``,`RESUMO OPERACIONAL`,`Frota estimada: ${c.buses} ônibus · ${c.trips} viagens/ônibus/dia · ${c.days} dias por mês`,`Percurso completo: ${numberPt(c.km,1)} km · total mensal estimado ${numberPt(c.monthlyKm,1)} km`,`Consumo: ${numberPt(c.kmpl,2)} km/L · diesel ${money(c.diesel)}/L`,`Custo mensal estimado: ${money(c.totalCost)}`,`Resultado com a proposta atual: ${money(c.offer-c.totalCost)}`,`Referência calculada antes da negociação: ${money(c.referenceRevenue)}`,``,`Esta proposta é gerada por regras aleatórias e custos informados no simulador do Grupo Conect. Não é proposta pública real, licitação, contrato jurídico, tarifa oficial ou garantia de aceitação.`].join('\n');
  $('#ownerContractText').textContent=currentOwnerContractText;$('#ownerContractText').hidden=false;
}
function refreshContractStats(){
  const c=currentOwnerContract;if(!c)return;
  const profit=c.offer-c.totalCost;
  $('#ownerContractStats').innerHTML=[['Oferta mensal da prefeitura',money(c.offer)],['Custo mensal estimado',money(c.totalCost)],['Saldo projetado',money(profit)],['Margem sobre a oferta',c.offer>0?`${numberPt(profit/c.offer*100,1)}%`:'—']].map(([l,val])=>moneyStat(l,val,l==='Saldo projetado'?(profit>=0?'positive':'negative'):'' )).join('');
  $('#ownerContractNote').textContent=`A prefeitura de ${c.city} apresentou uma proposta simulada para ${c.line}. A oferta está ${c.offer>=c.totalCost?'acima':'abaixo'} do custo mensal estimado em ${money(Math.abs(c.offer-c.totalCost))}. Confira os números antes de aceitar.`;
  $('#ownerContractNegotiationNote').textContent=c.statusMessage||'Escolha aceitar a proposta ou solicitar um aumento. Se pedir aumento, a prefeitura pode aceitar ou recusar dependendo do percentual e do orçamento simulado.';
  $('#ownerContractAccept').disabled=c.accepted===true;
  $('#ownerContractAccept').textContent=c.accepted?'Proposta já aceita':'Aceitar proposta';
  $('#ownerContractIncrease').disabled=c.accepted===true||c.hasCountered===true;
  updateContractProposalText();
}
$('#ownerContractForm').addEventListener('submit',event=>{
  event.preventDefault();if(!assertOwner())return;
  const v=id=>String($('#'+id).value||'').trim(),n=id=>readToolValue(id);
  const city=v('ocCity'),company=v('ocCompany'),line=v('ocLine'),start=v('ocStartDate'),km=n('ocKmTrip'),trips=n('ocTripsDay'),days=n('ocDaysMonth'),buses=n('ocBuses'),kmpl=n('ocKmpl'),diesel=n('ocDiesel'),rate=n('ocRateKm'),payers=n('ocPayersTrip'),fare=n('ocFare'),free=n('ocGratuities'),maint=n('ocMaintKm'),labor=n('ocLaborHour'),minutes=n('ocMinutesTrip'),fixed=n('ocFixedBus'),admin=n('ocAdminPercent'),freeComp=n('ocFreeComp'),model=v('ocModel');
  if(!city||!company||!line||!start||[km,trips,days,buses,kmpl,diesel,rate,payers,fare,free,maint,labor,minutes,fixed,admin,freeComp].some(x=>x===null)||km<=0||trips<1||days<1||buses<1||kmpl<=0||diesel<=0||payers<0||free<0){showToast('Confira a cidade, linha e todos os dados de custo e operação.');return;}
  const monthlyKm=km*trips*days*buses,liters=monthlyKm/kmpl,fuel=liters*diesel,maintenance=monthlyKm*maint,laborCost=(minutes/60)*trips*days*buses*labor,fixedCost=fixed*buses,baseCost=fuel+maintenance+laborCost+fixedCost,adminCost=baseCost*admin/100,totalCost=baseCost+adminCost;
  const referenceRevenue=model==='km'?monthlyKm*rate:(payers*fare*trips*days*buses)+(free*freeComp*trips*days*buses);
  const route=findRegisteredRoute(city,line),serviceType=route?.serviceType||(/\brj\s*[×x]/i.test(line)?'Interestadual':'Municipal');
  // A cidade cadastrada, o tipo do serviço e a presença da rota no cadastro alteram a faixa-base da oferta.
  // A prefeitura ainda começa abaixo/ao redor da remuneração de referência e pode recusar contrapropostas.
  const cityFactor=/rio de janeiro|niter[oó]i|nova iguaçu/i.test(city)?1.03:/petr[oó]polis|nova friburgo|juiz de fora|resende/i.test(city)?1.01:0.98;
  const serviceFactor=serviceType==='Interestadual'?1.04:serviceType==='Intermunicipal'?1.025:serviceType==='Municipal e intermunicipal'?1.015:0.99;
  const routeFactor=route?1.02:0.95;
  const offer=Math.max(0,Math.round(referenceRevenue*(0.86+Math.random()*0.15)*cityFactor*serviceFactor*routeFactor*100)/100);
  currentOwnerContract={id:makeId(),city,company,line,start,km,trips,days,buses,kmpl,diesel,rate,payers,fare,free,maint,labor,minutes,fixed,admin,freeComp,model,monthlyKm,totalCost,referenceRevenue,offer,initialOffer:offer,counterPercent:0,counterOffer:0,hasCountered:false,accepted:false,serviceType,routeRegistered:Boolean(route),createdAt:new Date().toISOString(),status:'Proposta inicial',statusMessage:`A prefeitura de ${city} apresentou ${money(offer)} por mês. A oferta foi simulada com base na remuneração de referência e no município/serviço selecionado.`};
  $('#ownerContractResults').hidden=false;refreshContractStats();showToast('Proposta municipal simulada recebida. Agora você pode aceitar ou negociar um aumento.');
});
$('#ownerContractForm').addEventListener('input',()=>{if(currentOwnerContract){currentOwnerContract=null;currentOwnerContractText='';$('#ownerContractResults').hidden=true;}});
$('#ownerContractIncrease').addEventListener('click',()=>{
  if(!assertOwner()||!currentOwnerContract||currentOwnerContract.accepted)return;
  if(currentOwnerContract.hasCountered){showToast('Esta proposta já teve uma contraproposta. Gere uma nova proposta para negociar novamente.');return;}
  const c=currentOwnerContract,pct=Number($('#ocIncreasePercent').value)||8;let chance=68-(pct*2.5);
  if(c.offer<c.totalCost)chance+=10;else if(c.offer>=c.totalCost*1.25)chance-=8;
  if(c.routeRegistered)chance+=3;else chance-=3;
  chance=Math.max(8,Math.min(78,Math.round(chance)));
  c.counterPercent=pct;c.counterOffer=Math.round(c.offer*(1+pct/100)*100)/100;c.hasCountered=true;
  if(Math.random()*100<chance){c.offer=c.counterOffer;c.status='Contraproposta aceita';c.statusMessage=`A prefeitura aceitou o aumento de ${pct}% (chance simulada de aceitação: ${chance}%). Nova proposta: ${money(c.offer)}/mês. Você ainda precisa tocar em “Aceitar proposta” para fechar o contrato no cenário.`;}
  else{c.status='Aumento recusado';c.statusMessage=`A prefeitura recusou o aumento de ${pct}% (chance simulada de aceitação: ${chance}%). A oferta original de ${money(c.initialOffer)}/mês continua disponível para você aceitar; para tentar de novo, solicite uma nova proposta.`;}
  refreshContractStats();showToast(c.status==='Contraproposta aceita'?'A prefeitura aceitou a contraproposta!':'A prefeitura recusou o aumento. A proposta original continua disponível.');
});
$('#ownerContractAccept').addEventListener('click',()=>{
  if(!assertOwner()||!currentOwnerContract||currentOwnerContract.accepted){if(!currentOwnerContract)showToast('Solicite uma proposta antes de aceitar.');return;}
  const c=currentOwnerContract;const record={...c,accepted:true,status:'Contrato aceito',acceptedAt:new Date().toISOString(),profit:c.offer-c.totalCost};
  const rows=ownerContracts();rows.push(record);if(!writeArrayKey(OWNER_CONTRACTS_KEY,rows))return;
  currentOwnerContract.accepted=true;currentOwnerContract.status='Contrato aceito';currentOwnerContract.statusMessage=`Contrato aceito no simulador por ${money(c.offer)}/mês. Resultado projetado após custo estimado: ${money(c.offer-c.totalCost)}. Registro salvo no histórico local.`;
  renderOwnerContractHistory();refreshContractStats();showToast('Proposta aceita e contrato salvo no histórico do cenário.');
});
$('#ownerCopyContract').addEventListener('click',async()=>{if(!assertOwner()||!currentOwnerContract)return;showToast(await copyText(currentOwnerContractText)?'Proposta copiada.':'Não foi possível copiar automaticamente.');});
$('#ownerDownloadContract').addEventListener('click',()=>{if(!assertOwner()||!currentOwnerContract)return;downloadTextFile('grupo-conect-proposta-municipal.txt',currentOwnerContractText);});
$('#ownerPrintContract').addEventListener('click',()=>{if(!assertOwner()||!currentOwnerContract)return;const w=window.open('','_blank','width=900,height=700');if(!w){showToast('Permita pop-ups para imprimir ou salvar em PDF.');return;}w.opener=null;w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Proposta municipal Grupo Conect</title><style>body{font:13px Arial;line-height:1.65;margin:25mm;color:#203040}pre{white-space:pre-wrap;font:inherit}h1{color:#14786b}@media print{button{display:none}}</style><h1>Grupo Conect</h1><button onclick="window.print()">Imprimir / Salvar PDF</button><pre>${escapeHtml(currentOwnerContractText)}</pre></html>`);w.document.close();});

// Visualizador de Operação com roster de motoristas virtuais e 10% de chance de ocorrência.
const INCIDENT_RESPONSES={
 acidente:['Parar em local seguro antes da área afetada e comunicar a central.','Manter passageiros protegidos e aguardar instruções das autoridades/central.','Usar apenas desvio oficial autorizado pela operação.','Registrar ponto e horário e aguardar liberação segura da via.','Se houver risco ou feridos, acionar os serviços de emergência e não avançar pela área insegura.'],
 obra:['Seguir sinalização temporária e o desvio autorizado para a linha.','Reduzir a velocidade e respeitar as orientações da obra.','Parar em local seguro e pedir instrução à central se não houver desvio claro.','Registrar o atraso e comunicar a previsão atualizada aos passageiros.','Retomar o itinerário original somente quando a via estiver liberada e segura.'],
 mecanica:['Encostar em local seguro, sinalizar e comunicar a central/manutenção.','Não tentar reparo no meio do tráfego; solicitar equipe de apoio.','Solicitar veículo reserva e organizar a transferência conforme procedimento da operação.','Registrar a pane, local, horário e sintomas para a equipe técnica.','Manter a linha parada até o veículo ser avaliado e liberado.'],
 transito:['Manter-se em rota aprovada e informar a central sobre o atraso.','Solicitar à central um desvio previamente autorizado.','Aguardar se não existir uma rota alternativa segura e autorizada.','Atualizar a previsão de chegada sem prometer horário não confirmado.','Reprogramar as partidas seguintes no simulador para recuperar o intervalo.'],
 clima:['Não entrar em trecho alagado; parar em local seguro e pedir orientação.','Aguardar avaliação ou liberação oficial se a via estiver perigosa.','Informar a central e registrar o ponto afetado.','Usar somente alternativa previamente aprovada e segura.','Retomar o trajeto quando as condições estiverem liberadas e seguras.']
};
const INCIDENT_LABELS={acidente:'Acidente / via bloqueada',obra:'Obra na rua',mecanica:'Falha mecânica do ônibus',transito:'Trânsito intenso / congestionamento',clima:'Alagamento / condição climática'};
function driverCounts(){return readObjectKey(DRIVER_COUNT_KEY);}
function driverRoster(company){const count=Math.max(3,Math.min(60,Number(driverCounts()[company]||12)));const base=['Pablo','Kaio','Treinamento'];const items=[];for(let i=0;i<count;i++)items.push(i<base.length?base[i]:`Motorista ${String(i+1).padStart(2,'0')} · ${company}`);return items;}
function refreshNormalTripDrivers(){const select=$('#driverSelect'),company=$('#companySelect')?.value||'Progresso';if(!select)return;const previous=select.value;const options=typeof driverRoster==='function'?driverRoster(company):['Pablo','Treinamento','Kaio'];populateSelect(select,'Escolha o motorista',options);if(options.includes(previous))select.value=previous;}
function populateShiftDrivers(preserve=true){const company=$('#ovCompany').value||'Progresso';const rows=driverRoster(company);['ovMorningDriver','ovAfternoonDriver','ovNightDriver'].forEach((id,idx)=>{const el=$('#'+id),old=preserve?el.value:'';populateSelect(el,'Selecione motorista',rows);if(rows.includes(old))el.value=old;else el.selectedIndex=idx<rows.length?idx+1:0;});$('#ovDriverCount').value=driverCounts()[company]||12;$('#ovDriverCountNote').textContent=`${driverRoster(company).length} motorista(s) virtual(is) disponíveis para ${company}.`;
}
function uniqueVehicleOptions(){const out=[];const seen=new Set();const add=x=>{if(!x)return;const key=`${norm(x.company)}|${norm(x.prefix)}|${norm(x.model)}`;if(seen.has(key))return;seen.add(key);out.push({company:x.company||'',prefix:x.prefix||'',model:x.model||'',chassis:x.chassis||'',city:x.city||'',line:x.line||'',duration:x.minutes||x.duration||60,weekday:x.weekday||''});};ownerFleet().forEach(add);ownerScales().forEach(add);FLEET.forEach(m=>m.prefixes.forEach(prefix=>add({company:m.company,prefix,model:m.model,chassis:m.chassis||'A selecionar',city:'',line:'',duration:60,service:m.service||'A definir'})));return out;}
function refreshOperationChoices(){
  if(!$('#ovScalePick'))return;
  const scales=ownerScales();$('#ovScalePick').innerHTML='<option value="">Escolher escala salva...</option>'+scales.slice().reverse().map(x=>`<option value="scale:${escapeHtml(x.id)}">${escapeHtml(WEEKDAY_LABELS[x.weekday]||x.weekday)} · ${escapeHtml(x.company)} · ${escapeHtml(x.line)} · ${escapeHtml(x.prefix)}</option>`).join('')+ownerFleet().map(x=>`<option value="fleet:${escapeHtml(x.id)}">Frota · ${escapeHtml(x.company)} · ${escapeHtml(x.prefix)} · ${escapeHtml(x.model)}</option>`).join('');
  const currentCompany=$('#ovCompany').value||'Progresso';
  const companyBuses=uniqueVehicleOptions().filter(x=>norm(x.company)===norm(currentCompany));
  const allModels=[...new Set(companyBuses.map(x=>x.model).filter(Boolean))];
  populateSelect($('#ovBus'),allModels.length?'Selecione ônibus cadastrado':'Nenhum ônibus cadastrado para esta empresa',allModels);
  $('#ovBus').disabled=!allModels.length;
  updateOperationPrefixOptions();
  populateShiftDrivers();
}
function updateOperationPrefixOptions(){
  const company=$('#ovCompany')?.value||'Progresso', model=$('#ovBus')?.value||'';
  const rows=uniqueVehicleOptions().filter(x=>norm(x.company)===norm(company)&&norm(x.model)===norm(model));
  const prefixes=[...new Set(rows.map(x=>String(x.prefix)).filter(Boolean))];
  const list=$('#gcPrefixes'); if(list)list.innerHTML=prefixes.map(x=>`<option value="${escapeHtml(x)}"></option>`).join('');
  if(prefixes.length===1 && !$('#ovPrefix').value)$('#ovPrefix').value=prefixes[0];
  if(prefixes.length && !prefixes.includes($('#ovPrefix').value)) $('#ovPrefix').value=prefixes.length===1?prefixes[0]:'';
}
$('#ovScalePick').addEventListener('change',()=>{
  const val=$('#ovScalePick').value;if(!val)return;const [kind,id]=val.split(':');let x=kind==='scale'?ownerScales().find(r=>r.id===id):ownerFleet().find(r=>r.id===id);if(!x)return;
  $('#ovCompany').value=x.company||'Progresso';refreshOperationChoices();if(x.model)$('#ovBus').value=x.model;$('#ovPrefix').value=x.prefix||'';$('#ovCity').value=x.city||'';$('#ovLine').value=x.line||'';$('#ovDuration').value=x.minutes||60;if(x.weekday)$('#ovWeekday').value=WEEKDAY_LABELS[x.weekday]||x.weekday;showToast('Dados da escala/frota carregados. Revise e complete os campos da operação.');
});
$('#ovCompany').addEventListener('change',refreshOperationChoices);
$('#ovBus').addEventListener('change',()=>{ $('#ovPrefix').value=''; updateOperationPrefixOptions(); });
$('#ovApplyDriverCount').addEventListener('click',()=>{if(!assertOwner())return;const company=$('#ovCompany').value,count=readToolValue('ovDriverCount');if(!company||count===null||!Number.isInteger(count)||count<3||count>60){showToast('Informe de 3 a 60 motoristas virtuais para a empresa.');return;}const counts=driverCounts();counts[company]=count;if(!writeObjectKey(DRIVER_COUNT_KEY,counts))return;populateShiftDrivers(false);showToast(`Roster de ${count} motorista(s) atualizado para ${company}.`);});
function operationIsRunning(op){return op.status==='operando'||op.status==='operando com desvio';}
function opParseTime(value){const m=String(value||'06:00').match(/^(\d{1,2}):(\d{2})$/);return m?((Number(m[1])*60+Number(m[2]))%1440):360;}
function opFormatTime(minute){const m=((Math.floor(Number(minute)||0)%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function opFormatCountdown(seconds){const value=Math.max(0,Math.ceil(Number(seconds)||0));const m=Math.floor(value/60),s=value%60;return m?`${m} min ${String(s).padStart(2,'0')} s`:`${s} s`;}
function opShiftKey(minute){const m=((Math.floor(Number(minute)||0)%1440)+1440)%1440;return m>=300&&m<720?'morning':m>=720&&m<1080?'afternoon':'night';}
function opShiftLabel(key){return key==='morning'?'manhã':key==='afternoon'?'tarde':'noite';}
const OP_SERVICE_OPEN_MINUTE=5*60;
const OP_SERVICE_CLOSE_MINUTE=23*60;
const OP_DAY_MINUTES=24*60;
function opMinuteOfDay(absMinute){return ((Math.floor(Number(absMinute)||0)%OP_DAY_MINUTES)+OP_DAY_MINUTES)%OP_DAY_MINUTES;}
function opIsServiceOpen(absMinute){const m=opMinuteOfDay(absMinute);return m>=OP_SERVICE_OPEN_MINUTE&&m<OP_SERVICE_CLOSE_MINUTE;}
function opNextOpenAtOrAfter(absMinute){
  const value=Math.max(0,Number(absMinute)||0),day=Math.floor(value/OP_DAY_MINUTES),minute=value-day*OP_DAY_MINUTES;
  if(minute<OP_SERVICE_OPEN_MINUTE)return day*OP_DAY_MINUTES+OP_SERVICE_OPEN_MINUTE;
  if(minute>=OP_SERVICE_CLOSE_MINUTE)return (day+1)*OP_DAY_MINUTES+OP_SERVICE_OPEN_MINUTE;
  return value;
}
function opNextDepartureAfterTrip(startAbs,durationMinutes){return opNextOpenAtOrAfter(Number(startAbs)+Math.max(1,Number(durationMinutes)||60));}
function opTripScheduleAt(op,tripIndex){
  const duration=Math.max(1,Number(op.duration)||60);
  const baseCount=Number.isFinite(Number(op.scheduleBaseTripCount))?Math.max(0,Number(op.scheduleBaseTripCount)):0;
  let start=Number.isFinite(Number(op.scheduleBaseStartAbs))?Number(op.scheduleBaseStartAbs):opParseTime(op.startTime);
  const count=Math.max(0,Math.floor(Number(tripIndex)||0)-baseCount);
  for(let i=0;i<count;i++)start=opNextDepartureAfterTrip(start,duration);
  return {start,end:start+duration};
}
function opElapsedSeconds(op,now=Date.now()){
  const saved=Math.max(0,Number(op.elapsedSeconds)||0);
  if(operationIsRunning(op)&&Number(op.clockAnchorAt)>0){const speed=Math.max(1,Number(op.speedMultiplier)||1);return saved+Math.max(0,now-Number(op.clockAnchorAt))/1000*speed;}
  return saved;
}
function freezeOperationClock(op,now=Date.now()){
  op.elapsedSeconds=opElapsedSeconds(op,now);op.clockAnchorAt=null;
}
function operationRouteHistory(company,city,line){
  const c=profitMatchKey(company),ct=profitMatchKey(city),l=profitMatchKey(line);
  return loadHistory().filter(t=>t.company&&t.city&&t.line&&profitMatchKey(t.company)===c&&profitMatchKey(t.city)===ct&&profitMatchKey(t.line)===l);
}
function operationEconomics(company,city,line,fallbackPayers=30,fallbackFare=5.5,fallbackFuelCost=35){
  const matches=operationRouteHistory(company,city,line);
  if(matches.length){
    const sum=matches.reduce((a,t)=>({revenue:a.revenue+(Number(t.revenue)||0),fuelCost:a.fuelCost+(Number(t.fuelCost)||0),net:a.net+historicalTripNet(t)}),{revenue:0,fuelCost:0,net:0});
    return {basis:'histórico das linhas normais',sampleCount:matches.length,unitRevenue:sum.revenue/matches.length,unitFuelCost:sum.fuelCost/matches.length,unitNet:sum.net/matches.length};
  }
  const revenue=Math.max(0,Number(fallbackPayers)||0)*Math.max(0,Number(fallbackFare)||0),fuel=Math.max(0,Number(fallbackFuelCost)||0);
  return {basis:'estimativa manual (sem histórico compatível)',sampleCount:0,unitRevenue:revenue,unitFuelCost:fuel,unitNet:revenue-fuel};
}
function opDriverForTrip(op,tripIndex,startAbsOverride){
  const duration=Math.max(1,Number(op.duration)||60),schedule=Number.isFinite(Number(startAbsOverride))?{start:Number(startAbsOverride),end:Number(startAbsOverride)+duration}:opTripScheduleAt(op,tripIndex);
  const shift=opShiftKey(schedule.start),name=String(op.drivers?.[shift]||op.drivers?.morning||'Motorista não definido');
  return {name,shift,simStart:opFormatTime(schedule.start),simEnd:opFormatTime(schedule.end),startAbs:schedule.start,endAbs:schedule.end};
}
function opEnsureSimulation(op,now=Date.now()){
  let changed=false;
  if(!Number.isFinite(Number(op.completedTrips))){op.completedTrips=0;changed=true;}
  if(!Number.isFinite(Number(op.elapsedSeconds))){op.elapsedSeconds=0;changed=true;}
  if(!Array.isArray(op.tripLog)){op.tripLog=[];changed=true;}
  if(!op.driverTotals||typeof op.driverTotals!=='object'){op.driverTotals={};changed=true;}
  if(!Number.isFinite(Number(op.speedMultiplier))||Number(op.speedMultiplier)<1){op.speedMultiplier=10;changed=true;}
  if(!op.unitEconomics){op.unitEconomics=operationEconomics(op.company,op.city,op.line);changed=true;}
  // Upgrade existing running lines into the 05:00–23:00 daily departure cycle without erasing saved profits.
  if(Number(op.scheduleVersion)!==2||!Number.isFinite(Number(op.scheduleBaseStartAbs))||!Number.isFinite(Number(op.scheduleBaseTripCount))){
    const already=Math.max(0,Number(op.completedTrips)||0),elapsed=opElapsedSeconds(op,now),duration=Math.max(1,Number(op.duration)||60),currentAbs=opParseTime(op.startTime)+elapsed/60,within=(elapsed/60)%duration;
    op.scheduleVersion=2;op.scheduleBaseTripCount=already;
    op.scheduleBaseStartAbs=within>0.001?currentAbs-within:opNextOpenAtOrAfter(currentAbs);
    changed=true;
  }
  if(operationIsRunning(op)&&!(Number(op.clockAnchorAt)>0)){op.clockAnchorAt=now;changed=true;}
  if(!operationIsRunning(op)&&op.clockAnchorAt){op.elapsedSeconds=opElapsedSeconds(op,now);op.clockAnchorAt=null;changed=true;}
  return changed;
}
function syncOneOperationProgress(op,now=Date.now()){
  let changed=opEnsureSimulation(op,now);
  if(!operationIsRunning(op))return changed;
  const duration=Math.max(1,Number(op.duration)||60),elapsed=opElapsedSeconds(op,now),virtualNow=opParseTime(op.startTime)+elapsed/60;
  const already=Math.max(0,Number(op.completedTrips)||0),speed=Math.max(1,Number(op.speedMultiplier)||1),econ=op.unitEconomics||operationEconomics(op.company,op.city,op.line);
  let idx=already,schedule=opTripScheduleAt(op,idx),processed=0;
  while(schedule.end<=virtualNow&&processed<5000){
    const driver=opDriverForTrip(op,idx,schedule.start),revenue=Number(econ.unitRevenue)||0,fuelCost=Number(econ.unitFuelCost)||0,net=Number(econ.unitNet??(revenue-fuelCost));
    const driverKey=driver.name;
    if(!op.driverTotals[driverKey])op.driverTotals[driverKey]={name:driver.name,trips:0,revenue:0,fuelCost:0,net:0};
    const dt=op.driverTotals[driverKey];dt.trips+=1;dt.revenue+=revenue;dt.fuelCost+=fuelCost;dt.net+=net;
    const lateSimSeconds=Math.max(0,(virtualNow-schedule.end)*60);
    const completedAt=new Date(Math.max(0,now-(lateSimSeconds/speed)*1000)).toISOString();
    const tripRow={id:makeId(),tripNumber:idx+1,driver:driver.name,shift:driver.shift,simStart:driver.simStart,simEnd:driver.simEnd,completedAt,revenue,fuelCost,net,basis:econ.basis,distanceKm:Number(op.distanceKm)||20};
    op.tripLog.push(tripRow);
    const garageBreakdown=typeof gcGarageOnOperationTrip==='function'&&gcGarageOnOperationTrip(op,tripRow);
    idx++;processed++;const nextStart=opNextDepartureAfterTrip(schedule.start,duration);schedule={start:nextStart,end:nextStart+duration};
    if(garageBreakdown)break;
  }
  if(processed){
    op.completedTrips=idx;
    // Rebase at the next scheduled trip so the repeating daily cycle remains lightweight over long simulations.
    op.scheduleBaseTripCount=idx;
    op.scheduleBaseStartAbs=schedule.start;
    if(op.tripLog.length>250)op.tripLog=op.tripLog.slice(-250);
    op.lastTripCompletedAt=op.tripLog.length?op.tripLog[op.tripLog.length-1].completedAt:op.lastTripCompletedAt;
    op.lastEvent=`Viagem ${op.completedTrips} concluída · ${op.tripLog[op.tripLog.length-1]?.driver||'motorista'} · lucro ${money(Number(econ.unitNet)||0)} por percurso`;
    changed=true;
  }
  return changed;
}
function syncOperationRows(now=Date.now()){
  const rows=ownerOperations();let changed=false;
  for(const op of rows)if(syncOneOperationProgress(op,now))changed=true;
  if(changed)writeArrayKey(OPERATION_KEY,rows);
  // Cada lucro novo da operação é contabilizado no caixa sem depender de abrir essa tela.
  const cashChanged=syncOperationCashState(rows);
  if(cashChanged && $('#cashSummary')) renderCashDashboard();
  return rows;
}
function operationSummary(op,now=Date.now()){
  const elapsed=opElapsedSeconds(op,now),currentAbs=opParseTime(op.startTime)+elapsed/60,currentMinute=Math.floor(currentAbs),duration=Math.max(1,Number(op.duration)||60),already=Math.max(0,Number(op.completedTrips)||0),next=opTripScheduleAt(op,already),inTrip=currentAbs>=next.start&&currentAbs<next.end;
  const driverInfo=opDriverForTrip(op,already,next.start),shift=driverInfo.shift,driver=driverInfo.name;
  const totals=Object.values(op.driverTotals||{}).reduce((a,d)=>({trips:a.trips+(Number(d.trips)||0),revenue:a.revenue+(Number(d.revenue)||0),fuelCost:a.fuelCost+(Number(d.fuelCost)||0),net:a.net+(Number(d.net)||0)}),{trips:0,revenue:0,fuelCost:0,net:0});
  const progress=inTrip?Math.min(100,Math.max(0,(currentAbs-next.start)/duration*100)):0,remaining=Math.max(0,(next.end-currentAbs)*60/Math.max(1,Number(op.speedMultiplier)||1)),serviceOpen=opIsServiceOpen(currentAbs);
  return {elapsed,remaining,currentTime:opFormatTime(currentMinute),shift,driver,totals,progress,serviceOpen,inTrip,nextDeparture:opFormatTime(next.start),nextCompletion:opFormatTime(next.end)};
}
function renderOperations(){
  const rows=syncOperationRows(),now=Date.now();
  $('#operationList').innerHTML=rows.length?rows.slice().reverse().map(x=>{
    const isPaused=x.status==='pausada',isOut=x.status==='fora de operação'||x.status==='parada técnica'||isPaused,isDetour=x.status==='operando com desvio';
    const cls=isOut?'offline':isDetour?'detour':'online',status=isPaused?'PAUSADA':x.status==='parada técnica'?'PARADA TÉCNICA':x.status==='fora de operação'?'FORA DE OPERAÇÃO':isDetour?'OPERANDO COM DESVIO':'OPERANDO';
    const sums=operationSummary(x,now),econ=x.unitEconomics||operationEconomics(x.company,x.city,x.line),sourceLabel=econ.sampleCount?`${econ.sampleCount} viagem(ns) histórica(s) usada(s)`:'valores manuais estimados';
    const resultClass=sums.totals.net>0.004?'positive':sums.totals.net< -0.004?'negative':'';
    const recent=(x.tripLog||[]).slice(-5).reverse();
    const tripRows=recent.length?`<details class="operation-trip-details"><summary>Ver últimas viagens concluídas (${x.completedTrips||0} no total)</summary><div class="operation-trip-log">${recent.map(t=>`<div class="operation-trip-row"><span><b>Viagem ${t.tripNumber}</b> · ${escapeHtml(t.driver)} (${escapeHtml(opShiftLabel(t.shift))})<small>Horário simulado ${escapeHtml(t.simStart)}–${escapeHtml(t.simEnd)} · concluída ${escapeHtml(new Date(t.completedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))}</small></span><strong class="${Number(t.net)>=0?'positive':'negative'}">${money(Number(t.net)||0)}</strong></div>`).join('')}</div></details>`:'<p class="tool-result-note">A primeira viagem ainda está em andamento. O lucro aparecerá quando o tempo definido para o percurso terminar.</p>';
    const driverLiveRows=Object.values(x.driverTotals||{}).sort((a,b)=>(Number(b.trips)||0)-(Number(a.trips)||0)).map(d=>`<div class="operation-driver-live-row"><span><b>${escapeHtml(d.name)}</b><small>${Number(d.trips)||0} viagem(ns) concluída(s) · arrecadação ${money(Number(d.revenue)||0)} · diesel ${money(Number(d.fuelCost)||0)}</small></span><strong class="${Number(d.net)>=0?'positive':'negative'}">${money(Number(d.net)||0)}</strong></div>`).join('');
    const driverBreakdown=driverLiveRows?`<section class="operation-driver-live"><strong>Lucro acumulado por motorista</strong>${driverLiveRows}</section>`:'<section class="operation-driver-live"><strong>Lucro acumulado por motorista</strong><p class="tool-result-note">Ainda não há viagem concluída. Assim que o percurso atingir o tempo configurado, o resultado será lançado para o motorista do turno correspondente.</p></section>';
    const canProgress=operationIsRunning(x);
    return `<article class="operation-card"><div class="operation-card-top"><div><strong>${escapeHtml(x.company)} · ${escapeHtml(x.line)}</strong><small>${escapeHtml(x.city)} · ${escapeHtml(x.busModel)} · prefixo ${escapeHtml(x.prefix)} · ${escapeHtml(x.weekday)} às ${escapeHtml(x.startTime)} · ${x.duration} min por percurso</small><small>Turnos: manhã ${escapeHtml(x.drivers?.morning||'—')} · tarde ${escapeHtml(x.drivers?.afternoon||'—')} · noite ${escapeHtml(x.drivers?.night||'—')}</small><small>Funcionamento diário: 05:00–23:00 · ciclo automático</small></div><span class="operation-status ${cls}"><i></i>${status}</span></div><div class="operation-live-progress"><div class="operation-live-heading"><strong>${canProgress?(!sums.serviceOpen&&!sums.inTrip?'Serviço encerrado · retoma às 05:00':'Operação em andamento'):'Relógio da operação parado'}</strong><span>Horário simulado: ${escapeHtml(sums.currentTime)}</span></div><div class="operation-progress-track"><span style="width:${canProgress?sums.progress:0}%"></span></div><div class="operation-live-meta"><span>Motorista da próxima viagem <b>${escapeHtml(sums.driver)}</b> · turno da ${escapeHtml(opShiftLabel(sums.shift))}</span><span>${canProgress?(!sums.serviceOpen&&!sums.inTrip?`Próxima partida às ${escapeHtml(sums.nextDeparture)} · chegada prevista ${escapeHtml(sums.nextCompletion)}`:'Próxima viagem conclui em '+opFormatCountdown(sums.remaining)):'Retome para continuar a contagem'}</span></div></div><div class="operation-live-stats"><article><span>Viagens concluídas</span><strong>${Number(x.completedTrips)||0}</strong></article><article><span>Arrecadação acumulada</span><strong>${money(sums.totals.revenue)}</strong></article><article><span>Diesel estimado</span><strong>${money(sums.totals.fuelCost)}</strong></article><article class="${resultClass}"><span>Lucro acumulado</span><strong>${money(sums.totals.net)}</strong></article></div><p class="tool-result-note operation-economics-note">Cálculo por percurso: ${money(Number(econ.unitRevenue)||0)} de arrecadação − ${money(Number(econ.unitFuelCost)||0)} de diesel = <b>${money(Number(econ.unitNet)||0)}</b>. Fonte: ${escapeHtml(sourceLabel)}. ${!econ.sampleCount?'Estimativa usada porque ainda não existe histórico compatível; ajuste os valores ao cadastrar a operação.':'A média vem das viagens normais desta mesma empresa, cidade e linha.'}</p>${driverBreakdown}${tripRows}${x.lastEvent?`<p class="operation-last-event">Último evento: ${escapeHtml(x.lastEvent)}</p>`:''}<div class="operation-actions"><button type="button" class="primary-button" data-op-profit="${escapeHtml(x.id)}">Ver lucro histórico por motorista</button><button type="button" class="secondary-action-button" data-op-incident="${escapeHtml(x.id)}">Registrar / resolver ocorrência</button><button type="button" class="secondary-action-button" data-op-random="${escapeHtml(x.id)}">Teste aleatório (10%)</button><button type="button" class="secondary-action-button" data-op-toggle="${escapeHtml(x.id)}">${canProgress?'Pausar operação':'Retomar operação'}</button><button type="button" class="secondary-action-button" data-op-delete="${escapeHtml(x.id)}">Remover</button></div></article>`;
  }).join(''):recordsEmpty('Nenhuma linha cadastrada no Visualizador de Operação.');
}
function openIncidentFor(op,type){currentIncidentOperationId=op.id;$('#ovIncidentPanel').hidden=false;$('#ovIncidentType').value=type||'acidente';$('#ovIncidentTitle').textContent=`${INCIDENT_LABELS[$('#ovIncidentType').value]} · ${op.company} / ${op.line}`;$('#ovIncidentQuestion').textContent=`Ocorrência em ${op.city}: o que a central/Pablo decide registrar para esta linha?`;populateIncidentResponses();$('#ovIncidentPanel').scrollIntoView({behavior:'smooth',block:'nearest'});}
function populateIncidentResponses(){const type=$('#ovIncidentType').value;populateSelect($('#ovIncidentResponse'),'Selecione uma decisão',INCIDENT_RESPONSES[type]||INCIDENT_RESPONSES.acidente);}
$('#ovIncidentType').addEventListener('change',()=>{if(currentIncidentOperationId){const op=ownerOperations().find(x=>x.id===currentIncidentOperationId);if(op){$('#ovIncidentTitle').textContent=`${INCIDENT_LABELS[$('#ovIncidentType').value]} · ${op.company} / ${op.line}`;$('#ovIncidentQuestion').textContent=`Ocorrência em ${op.city}: escolha uma resposta simulada.`;}}populateIncidentResponses();});
function updateOperationEconomicsHint(){
  const el=$('#ovEconomicsHint');if(!el)return;
  const company=$('#ovCompany').value,city=$('#ovCity').value.trim(),line=$('#ovLine').value.trim();
  if(!company||!city||!line){el.textContent='Informe empresa, cidade e linha. O simulador pesquisará essas três informações no histórico das linhas normais e usará os valores manuais abaixo somente se não encontrar viagens compatíveis.';return;}
  const matches=operationRouteHistory(company,city,line);
  if(matches.length)el.textContent=`Encontrei ${matches.length} viagem(ns) histórica(s) compatível(is). A operação usará média de ${money(matches.reduce((s,t)=>s+(Number(t.revenue)||0),0)/matches.length)} de arrecadação, ${money(matches.reduce((s,t)=>s+(Number(t.fuelCost)||0),0)/matches.length)} de diesel e ${money(matches.reduce((s,t)=>s+historicalTripNet(t),0)/matches.length)} de resultado por percurso. Os valores manuais serão ignorados.`;
  else el.textContent='Ainda não encontrei essa combinação no histórico normal. Para a simulação começar mesmo assim, serão usados os pagantes, a tarifa e o diesel estimados que você informou. Assim que houver histórico compatível em uma nova operação, ele será priorizado.';
}
['ovCompany','ovCity','ovLine','ovFallbackPayers','ovFallbackFare','ovFallbackFuelCost'].forEach(id=>{const el=$('#'+id);if(el){el.addEventListener('input',updateOperationEconomicsHint);el.addEventListener('change',updateOperationEconomicsHint);}});
function gcDriverForOperationStart(op){const minute=opParseTime(op.startTime);const shift=opShiftKey(minute);return String(op.drivers?.[shift]||'');}
$('#operationViewerForm').addEventListener('submit',event=>{
  event.preventDefault();if(!assertOwner())return;
  const company=$('#ovCompany').value,model=$('#ovBus').value,prefix=$('#ovPrefix').value.trim(),city=$('#ovCity').value.trim(),line=$('#ovLine').value.trim(),duration=readToolValue('ovDuration'),distanceKm=readToolValue('ovTripDistance')||20,startTime=$('#ovStartTime').value,weekday=$('#ovWeekday').value;
  const fallbackPayers=Number($('#ovFallbackPayers').value),fallbackFare=Number($('#ovFallbackFare').value),fallbackFuelCost=Number($('#ovFallbackFuelCost').value),speedMultiplier=Number($('#ovSimSpeed').value)||10;
  if(!company||!model||!prefix||!city||!line||duration===null||duration<1||!startTime){showToast('Preencha empresa, ônibus, prefixo, cidade, linha, tempo e horário.');return;}
  const firstDepartureMinute=opParseTime(startTime);
  if(firstDepartureMinute<OP_SERVICE_OPEN_MINUTE||firstDepartureMinute>OP_SERVICE_CLOSE_MINUTE){showToast('A primeira partida deve ficar entre 05:00 e 23:00. Fora desse horário, o ciclo aguarda até 05:00.');return;}
  if(!Number.isInteger(fallbackPayers)||fallbackPayers<0||!Number.isFinite(fallbackFare)||fallbackFare<0||!Number.isFinite(fallbackFuelCost)||fallbackFuelCost<0){showToast('Confira pagantes estimados, tarifa e custo de diesel (não podem ser negativos).');return;}
  const repeatedConflict=gcOnlineRecurringOperationConflict({company,prefix,model},weekday);
  if(repeatedConflict){showToast(`Ônibus indisponível: ${repeatedConflict.message}`);return;}
  const economics=operationEconomics(company,city,line,fallbackPayers,fallbackFare,fallbackFuelCost);
  const op={id:makeId(),company,busModel:model,prefix,city,line,duration,distanceKm,startTime,weekday,drivers:{morning:$('#ovMorningDriver').value,afternoon:$('#ovAfternoonDriver').value,night:$('#ovNightDriver').value},status:'initializing',createdAt:new Date().toISOString(),lastEvent:'',incidentHistory:[],speedMultiplier,elapsedSeconds:0,clockAnchorAt:null,completedTrips:0,tripLog:[],driverTotals:{},unitEconomics:economics,scheduleVersion:2,scheduleBaseTripCount:0,scheduleBaseStartAbs:opParseTime(startTime)};
  const startingDriver=gcDriverForOperationStart(op);if(!startingDriver){showToast('Escolha o motorista escalado para o turno que contém a primeira partida.');return;}
  gcActivateOperation(op);
});

// O relatório usa todo o histórico das viagens municipais salvas no navegador, não apenas o dia selecionado.
// Normalização insensível a maiúsculas, acentos e pontuação reduz divergências como "32 - Nova Suíça"/"32 Nova Suica".
function profitMatchKey(value){return norm(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function historicalTripNet(trip){const direct=trip?.net;if(direct!==undefined&&direct!==null&&Number.isFinite(Number(direct)))return Number(direct);return (Number(trip?.revenue)||0)-(Number(trip?.fuelCost)||0);}
function renderOperationProfitReport(operationId){
  const op=ownerOperations().find(row=>row.id===operationId);
  if(!op){showToast('Não encontrei essa operação para analisar.');return;}
  currentProfitOperationId=op.id;
  const history=loadHistory();
  const cityKey=profitMatchKey(op.city),lineKey=profitMatchKey(op.line),companyKey=profitMatchKey(op.company);
  const locationMatches=history.filter(t=>t.city&&t.line&&profitMatchKey(t.city)===cityKey&&profitMatchKey(t.line)===lineKey);
  const matches=locationMatches.filter(t=>profitMatchKey(t.company)===companyKey);
  const totalResult=matches.reduce((sum,t)=>sum+historicalTripNet(t),0);
  const average=matches.length?totalResult/matches.length:0;
  const days=new Set(matches.map(t=>t.dayId||t.dayLabel||'day-1'));
  $('#operationProfitTitle').textContent=`Lucro histórico · ${op.line}`;
  $('#operationProfitSubtitle').textContent=`Operação: ${op.company} · ${op.city} · Linha ${op.line}. Busca em todos os dias do histórico normal, com comparação por empresa, cidade e nome/número da linha.`;
  $('#operationProfitSummary').innerHTML=[['Viagens compatíveis encontradas',String(matches.length)],['Resultado acumulado das viagens',money(totalResult)],['Resultado médio por viagem',money(average)],['Dias com registros',String(days.size)]].map(([label,value])=>`<article class="tool-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
  const shiftNames=[['Manhã','morning'],['Tarde','afternoon'],['Noite','night']].map(([label,key])=>({shift:label,name:String(op.drivers?.[key]||'').trim()})).filter(row=>row.name);
  const grouped=new Map();shiftNames.forEach(row=>{const key=profitMatchKey(row.name);if(!grouped.has(key))grouped.set(key,{name:row.name,shifts:[]});grouped.get(key).shifts.push(row.shift);});
  const driverRows=Array.from(grouped.values()).map(driver=>{
    const trips=matches.filter(t=>profitMatchKey(t.driver)===profitMatchKey(driver.name));
    const result=trips.reduce((sum,t)=>sum+historicalTripNet(t),0);
    return {...driver,trips,result,average:trips.length?result/trips.length:0,days:new Set(trips.map(t=>t.dayId||t.dayLabel||'day-1')).size};
  });
  $('#operationProfitDrivers').innerHTML=driverRows.length?driverRows.map(driver=>{
    const resultClass=driver.result>0.004?'positive':driver.result< -0.004?'negative':'';
    return `<article class="record-item operation-profit-driver"><div class="record-item-top"><div><strong>${escapeHtml(driver.name)}</strong><small>Turno(s): ${escapeHtml(driver.shifts.join(', '))} · ${driver.trips.length} viagem(ns) encontrada(s) · ${driver.days} dia(s) no histórico</small><small>Resultado médio por viagem: <b>${money(driver.average)}</b></small></div><span class="operation-profit-total ${resultClass}">${money(driver.result)}</span></div></article>`;
  }).join(''):recordsEmpty('Nenhum motorista está atribuído aos turnos desta operação.');
  const missingTags=history.filter(t=>!String(t.city||'').trim()||!String(t.line||'').trim()).length;
  const otherCompanies=locationMatches.filter(t=>profitMatchKey(t.company)!==companyKey);
  let note='O resultado registrado é a arrecadação da viagem menos o custo do diesel. É o resultado operacional da viagem atribuída ao motorista, não o salário ou comissão pessoal dele. Não inclui manutenção, salários, pneus, pedágios ou demais despesas que não foram registradas no histórico.';
  if(!matches.length){
    if(otherCompanies.length){const companyNames=[...new Set(otherCompanies.map(t=>t.company||'Empresa não informada'))].join(', ');note=`Encontrei ${otherCompanies.length} viagem(ns) com a mesma cidade e linha, mas de outra empresa (${companyNames}). Não misturei os valores para evitar erro. Confira o cadastro da empresa e mantenha cidade/linha consistentes. ${note}`;}
    else note=`Ainda não há viagens compatíveis nesta combinação de empresa, cidade e linha. Ao registrar viagens normais, informe exatamente a empresa, a cidade e o nome da linha; o sistema ignora diferenças de acento, maiúsculas e pontuação. ${note}`;
  } else if(otherCompanies.length){note+=` Também encontrei ${otherCompanies.length} viagem(ns) com a mesma cidade/linha de outra(s) empresa(s); elas foram excluídas deste resultado.`;}
  if(missingTags) note+=` ${missingTags} registro(s) antigo(s) não possuem cidade e/ou linha cadastradas e foram excluídos da análise. Na tela do histórico normal, use “Identificar cidade/linha para análise” em cada viagem antiga para completá-los.`;
  $('#operationProfitLimit').textContent=note;
  currentProfitReportText=[`GRUPO CONECT — RESULTADO HISTÓRICO POR MOTORISTA`,`Empresa: ${op.company}`,`Cidade: ${op.city}`,`Linha: ${op.line}`,`Viagens compatíveis: ${matches.length}`,`Resultado acumulado: ${money(totalResult)}`,`Média por viagem: ${money(average)}`,'',...driverRows.map(d=>`${d.name} (${d.shifts.join(', ')}): ${d.trips.length} viagem(ns), acumulado ${money(d.result)}, média por viagem ${money(d.average)}`),'',note].join('\n');
  $('#operationProfitPanel').hidden=false;
  $('#operationProfitPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('#ovCloseProfit').addEventListener('click',()=>{$('#operationProfitPanel').hidden=true;});
$('#ovRefreshProfit').addEventListener('click',()=>{if(currentProfitOperationId)renderOperationProfitReport(currentProfitOperationId);else showToast('Abra o relatório a partir de uma linha da operação.');});
$('#ovCopyProfit').addEventListener('click',async()=>{if(!currentProfitReportText){showToast('Abra um relatório antes de copiar.');return;}showToast(await copyText(currentProfitReportText)?'Relatório de lucros copiado.':'Não foi possível copiar o relatório automaticamente.');});
$('#operationList').addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-op-profit')){if(!assertOwner())return;renderOperationProfitReport(b.dataset.opProfit);return;}
  const rows=ownerOperations();const id=b.dataset.opIncident||b.dataset.opRandom||b.dataset.opDelete||b.dataset.opResume||b.dataset.opToggle;let op=rows.find(x=>x.id===id);if(!op)return;if(!assertOwner())return;
  if(b.hasAttribute('data-op-toggle')||b.hasAttribute('data-op-resume')){if(operationIsRunning(op)){freezeOperationClock(op);op.status='pausada';op.lastEvent=(op.lastEvent||'Operação')+' · relógio pausado por Pablo';writeArrayKey(OPERATION_KEY,rows);renderOperations();showToast('Operação pausada; o tempo e os lucros pararam de avançar.');}else{op.status='operando';op.clockAnchorAt=Date.now();op.lastEvent=(op.lastEvent||'Operação')+' · operação retomada por Pablo';writeArrayKey(OPERATION_KEY,rows);renderOperations();showToast('Operação retomada; o cronômetro voltou a contar.');}return;}
  if(b.hasAttribute('data-op-delete')){if(!window.confirm(`Remover a linha ${op.line} do visualizador? O histórico de caixa e escala ficará preservado.`))return;writeArrayKey(OPERATION_KEY,rows.filter(x=>x.id!==id));renderOperations();return;}
  if(b.hasAttribute('data-op-random')){if(Math.random()>=0.10){showToast('Nenhuma ocorrência nesta verificação (90% de chance de seguir operando).');return;}freezeOperationClock(op);const kinds=Object.keys(INCIDENT_RESPONSES),type=kinds[Math.floor(Math.random()*kinds.length)];op.status='fora de operação';op.currentIncidentType=type;op.lastEvent=`${INCIDENT_LABELS[type]} · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;op.incidentHistory=op.incidentHistory||[];op.incidentHistory.push({id:makeId(),type,occurredAt:new Date().toISOString(),resolution:''});writeArrayKey(OPERATION_KEY,rows);renderOperations();openIncidentFor(op,type);showToast('Ocorrência simulada; a linha foi parada.');return;}
  const type=op.currentIncidentType||'transito';openIncidentFor(op,type);
});
$('#ovApplyIncidentResponse').addEventListener('click',()=>{
  if(!assertOwner())return;const rows=ownerOperations(),op=rows.find(x=>x.id===currentIncidentOperationId);if(!op){showToast('Selecione uma linha para registrar a decisão.');return;}const type=$('#ovIncidentType').value,response=$('#ovIncidentResponse').value;if(!response){showToast('Selecione uma resposta pronta.');return;}
  op.currentIncidentType=type;op.lastEvent=`${INCIDENT_LABELS[type]} — decisão: ${response}`;op.incidentHistory=op.incidentHistory||[];let last=op.incidentHistory[op.incidentHistory.length-1];if(!last||last.resolution){last={id:makeId(),type,occurredAt:new Date().toISOString(),resolution:''};op.incidentHistory.push(last);}last.resolution=response;last.resolvedAt=new Date().toISOString();
  if(type==='mecanica'||type==='acidente'){freezeOperationClock(op);op.status='parada técnica';}else{op.status='operando com desvio';if(!(Number(op.clockAnchorAt)>0))op.clockAnchorAt=Date.now();}
  writeArrayKey(OPERATION_KEY,rows);renderOperations();$('#ovIncidentPanel').hidden=true;showToast('Decisão registrada. Estado da linha atualizado.');
});
$('#ovDismissIncident').addEventListener('click',()=>{if(!assertOwner())return;const rows=ownerOperations(),op=rows.find(x=>x.id===currentIncidentOperationId);if(op){freezeOperationClock(op);op.status='fora de operação';writeArrayKey(OPERATION_KEY,rows);renderOperations();}$('#ovIncidentPanel').hidden=true;showToast('Linha mantida fora de operação.');});
$('#ovChanceEvent').addEventListener('click',()=>{if(!assertOwner())return;const rows=ownerOperations(),active=rows.filter(x=>x.status==='operando'||x.status==='operando com desvio');if(!active.length){showToast('Não há linha em operação para testar.');return;}if(Math.random()>=0.10){showToast('Nenhuma ocorrência nesta verificação (90%).');return;}const op=active[Math.floor(Math.random()*active.length)],kinds=Object.keys(INCIDENT_RESPONSES),type=kinds[Math.floor(Math.random()*kinds.length)];freezeOperationClock(op);op.status='fora de operação';op.currentIncidentType=type;op.lastEvent=`${INCIDENT_LABELS[type]} · ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;op.incidentHistory=op.incidentHistory||[];op.incidentHistory.push({id:makeId(),type,occurredAt:new Date().toISOString(),resolution:''});writeArrayKey(OPERATION_KEY,rows);renderOperations();openIncidentFor(op,type);showToast(`Ocorrência em ${op.line}: escolha uma resposta.`);});

// Ficha técnica padrão de simulação. Dimensões/capacidades mudam de acordo com o ano,
// carroceria, chassi e layout interno; quilometragens e preços são valores fictícios de jogo.
function enrichMarketBus(x,i){
  const yearMatch=String(x.year||'2020').match(/(19|20)\d{2}/);const year=yearMatch?Number(yearMatch[0]):2020;
  const type=String(x.type||'').toLowerCase(),model=String(x.model||'').toLowerCase(),chassis=String(x.chassis||'');
  const isElectric=/elétric|eletric/i.test(type+' '+model+' '+chassis);
  const isDouble=/dd|double-decker|dois andares/.test(type+' '+model);
  const isArtic=/articulad/.test(type+' '+model);
  const isMicro=/micro|volare|senior|fox|foz|attack 8|fly 9|fly 10|fly 12/.test(type+' '+model);
  const isMidi=/midi|midibus/.test(type+' '+model);
  const isUrban=/urbano|escolar|brt|padron|midi/.test(type);
  let length= x.lengthM || (isArtic?18.9:isDouble?14.5:isMicro?(model.includes('senior')?8.2:8.5):isMidi?10.8:isUrban?12.5:12.8);
  if(/paradiso g8 1800|g8 1800 dd/.test(model)) length=15.0;
  let width=x.widthM || (isMicro?2.40:(isUrban?2.55:2.60));
  let height=x.heightM || (isDouble?4.10:isMicro?3.15:(isUrban?3.30:3.75));
  if(/torino/.test(model)){width=x.widthM||2.55;height=x.heightM||3.26;length=x.lengthM||12.565;}
  if(/senior urbano/.test(model)){width=2.35;height=3.09;length=8.3;}
  if(/senior rodoviário|senior interprovincial/.test(model)){width=2.40;height=3.295;length=9.155;}
  if(/apache vip/.test(model)){width=2.53;height=3.48;}
  if(/granvia/.test(model)){width=2.60;height=3.20;}
  const seated=Number(x.seats)||0;
  const seatedOnly=/escolar|rodoviário|intermunicipal|fretamento|turismo/.test(type);
  let standing=Number.isFinite(x.standing)?x.standing:(isDouble||seatedOnly?0:isElectric?Math.max(0,Math.round(length*2.8)):isArtic?90:isMicro?(isUrban?8:0):isMidi?(isUrban?18:0):isUrban?(length>=14.5?50:length>=12?35:25):0);
  const total=Number.isFinite(x.totalCapacity)?x.totalCapacity:seated+standing;
  const age=Math.max(0,2026-year);const annualKm=isUrban?65000:isMicro?48000:85000;const multiplier=0.82+(i%8)*0.045;
  const mileage=Number.isFinite(x.kmDriven)?x.kmDriven:Math.round(Math.max(8000,age*annualKm*multiplier)/5000)*5000;
  const fuel=x.fuel||(isElectric?'Elétrico (bateria)':'Diesel S-10');
  const tank=x.tankL??(isElectric?0:isMicro?150:isUrban?(length>=14?350:280):(isDouble?550:480));
  const kmL=x.kmL??(isElectric?null:isMicro?4.6:isUrban?(isArtic?1.25:length>=14?1.8:2.2):(isDouble?2.0:2.7));
  const traction=x.traction||(chassis.match(/(?:4x2|6x2|6x4|8x2|8x4)/i)?.[0]|| (isArtic?'6x2':isDouble?'8x2':'4x2'));
  const axles=x.axles||(traction.startsWith('8')?4:traction.startsWith('6')?3:2);
  return {...x,lengthM:length,widthM:width,heightM:height,seated,standing,totalCapacity:total,kmDriven:mileage,fuel,tankL:tank,kmL,traction,axles,
    engine:x.engine||chassis,
    transmission:x.transmission||'Manual ou automática, conforme a versão',
    airConditioning:x.airConditioning||'Com ou sem ar-condicionado, conforme a unidade',
    accessibility:x.accessibility||'Elevador/DPM e espaços reservados dependem da configuração',
    doors:x.doors||(isArtic?4:isUrban?(length>=14?4:3):isMicro?1:2),
    configuration:x.configuration||(isArtic?'Urbano articulado, alta capacidade':isDouble?'Rodoviário double-decker':isUrban?'Urbano: piso alto ou configuração conforme versão':isMicro?'Micro-ônibus para urbano, fretamento ou turismo':'Rodoviário/intermunicipal, salão de poltronas'),
    kmLLabel:isElectric?'Consumo elétrico depende do ciclo (kWh/km)':`aprox. ${String(kmL).replace('.',',')} km/L`,source:'Modelo de referência; preço/odômetro simulados',dataStatus:'Ficha técnica aproximada para simulação; confirme a unidade real'};
}

// Catálogo de ônibus para simulação — preços e odômetros abaixo são estimativas fictícias,
// não anúncios ativos nem quilometragens atribuídas a veículos reais.
const BUS_MARKET=[
{id:'m01',model:'Caio Apache VIP III',year:'2013/2013',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:46,price:170000,source:'Revenda de Ônibus'},
{id:'m02',model:'Caio Apache VIP II',year:'2011/2011',chassis:'Mercedes-Benz OF-1722',type:'Urbano',seats:46,price:110000,source:'Revenda de Ônibus'},
{id:'m03',model:'Caio Apache',year:'2015/2015',chassis:'Volkswagen 17.230',type:'Urbano',seats:39,price:220000,source:'Revenda de Ônibus'},
{id:'m04',model:'Caio Apache',year:'2016/2016',chassis:'Volkswagen 17.230',type:'Urbano',seats:33,price:240000,source:'Revenda de Ônibus'},
{id:'m05',model:'Caio Apache',year:'2016/2016',chassis:'Volkswagen 17.230',type:'Urbano',seats:33,price:265000,source:'Revenda de Ônibus'},
{id:'m06',model:'Marcopolo Torino',year:'2014/2014',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:44,price:190000,source:'Revenda de Ônibus'},
{id:'m07',model:'Marcopolo Torino',year:'2015/2015',chassis:'Mercedes-Benz OF-1724',type:'Urbano',seats:39,price:310000,source:'Revenda de Ônibus'},
{id:'m08',model:'Marcopolo Torino',year:'2017/2017',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:31,price:380000,source:'Revenda de Ônibus'},
{id:'m09',model:'Marcopolo Torino',year:'2018/2019',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:36,price:470000,source:'Revenda de Ônibus'},
{id:'m10',model:'Marcopolo Torino',year:'2019/2020',chassis:'Mercedes-Benz OF-1519 Euro V',type:'Urbano',seats:34,price:560000,source:'Revenda de Ônibus'},
{id:'m11',model:'Marcopolo Torino',year:'2020/2021',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:41,price:640000,source:'Revenda de Ônibus'},
{id:'m12',model:'Caio Torino',year:'2022/2023',chassis:'Mercedes-Benz OF-1721 Euro V',type:'Urbano',seats:39,price:650000,source:'Revenda de Ônibus'},
{id:'m13',model:'Caio Apache VIP II',year:'2014/2015',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:46,price:199000,source:'Revenda de Ônibus'},
{id:'m14',model:'Caio Apache VIP',year:'2017/2017',chassis:'Mercedes-Benz OF-1519',type:'Urbano',seats:36,price:450000,source:'CISIOTAR'},
{id:'m15',model:'Marcopolo New Torino',year:'2015/2015',chassis:'Mercedes-Benz OF-721',type:'Urbano',seats:35,price:320000,source:'CISIOTAR'},
{id:'m16',model:'Mascarello Gran Via',year:'2019/2020',chassis:'Mercedes-Benz OF-1519',type:'Urbano',seats:30,price:490000,source:'Revenda de Ônibus'},
{id:'m17',model:'Mascarello Gran Via',year:'2021/2022',chassis:'Mercedes-Benz OF-1519',type:'Urbano',seats:31,price:580000,source:'Revenda de Ônibus'},
{id:'m18',model:'Marcopolo Senior',year:'2018/2019',chassis:'Mercedes-Benz LO-916',type:'Micro-ônibus urbano',seats:23,price:370000,source:'Revenda de Ônibus'},
{id:'m19',model:'Marcopolo Senior',year:'2019/2020',chassis:'Mercedes-Benz LO-916',type:'Micro-ônibus urbano',seats:25,price:380000,source:'Revenda de Ônibus'},
{id:'m20',model:'Caio Fox',year:'2018/2019',chassis:'Mercedes-Benz LO-916',type:'Micro-ônibus urbano',seats:23,price:340000,source:'Revenda de Ônibus'},
{id:'m21',model:'Neobus Mega com elevador',year:'2012/2012',chassis:'Mercedes-Benz OF-1519',type:'Urbano acessível',seats:32,price:120000,source:'CISIOTAR'},
{id:'m22',model:'Marcopolo Paradiso G7 1050',year:'2011/2012',chassis:'Scania K310 4x2',type:'Rodoviário',seats:46,price:300000,source:'Revenda de Ônibus'},
{id:'m23',model:'Marcopolo Paradiso G7 1050',year:'2012/2013',chassis:'Volvo B340',type:'Rodoviário',seats:46,price:360000,source:'Revenda de Ônibus'},
{id:'m24',model:'Marcopolo Paradiso G7 1050',year:'2013/2014',chassis:'Scania K310 4x2',type:'Rodoviário',seats:46,price:460000,source:'Revenda de Ônibus'},
{id:'m25',model:'Marcopolo Paradiso G7 1050',year:'2013/2014',chassis:'Scania K310 4x2',type:'Rodoviário',seats:46,price:449000,source:'Revenda de Ônibus'},
{id:'m26',model:'Marcopolo Paradiso G7 1050',year:'2015/2015',chassis:'Mercedes-Benz O500 R',type:'Rodoviário',seats:50,price:470000,source:'SuperCaminhões'},
{id:'m27',model:'Marcopolo Viaggio G7 1050',year:'2017/2017',chassis:'Mercedes-Benz O500 RS',type:'Rodoviário',seats:46,price:650000,source:'Revenda de Ônibus'},
{id:'m28',model:'Marcopolo Paradiso G7 1200',year:'2013/2013',chassis:'Mercedes-Benz O500 RSD',type:'Rodoviário',seats:46,price:425000,source:'Revenda de Ônibus'},
{id:'m29',model:'Marcopolo New G7 1200',year:'2019/2020',chassis:'Mercedes-Benz O500 RS',type:'Rodoviário',seats:46,price:900000,source:'Revenda de Ônibus'},
{id:'m30',model:'Marcopolo New G7 1600 LD',year:'2019/2020',chassis:'Mercedes-Benz O500 RSD',type:'Rodoviário',seats:46,price:1000000,source:'Revenda de Ônibus'},
{id:'m31',model:'Marcopolo New G7 1800 DD',year:'2019/2020',chassis:'Mercedes-Benz O500 RSD',type:'Rodoviário double-decker',seats:56,price:1100000,source:'Revenda de Ônibus'},
{id:'m32',model:'Marcopolo New G7 1800 DD 4 eixos',year:'2019/2020',chassis:'Mercedes-Benz O500 RSD 4 eixos',type:'Rodoviário double-decker',seats:54,price:1200000,source:'Revenda de Ônibus'},
{id:'m33',model:'Marcopolo Paradiso DD 1800 G8',year:'2023/2024',chassis:'Mercedes-Benz O500 RSD 8x2',type:'Rodoviário double-decker',seats:54,price:2150000,source:'Revenda de Ônibus'},
{id:'m34',model:'Comil Campione 345',year:'2019/2020',chassis:'Volkswagen 17.230 S',type:'Rodoviário',seats:46,price:650000,source:'Revenda de Ônibus'},
{id:'m35',model:'Busscar El Bus 320L',year:'2021/2022',chassis:'Volkswagen 17.230 S',type:'Rodoviário',seats:46,price:720000,source:'Revenda de Ônibus'},
{id:'m36',model:'Comil Versatile Gold',year:'2024/2025',chassis:'Volkswagen 17.230 S',type:'Rodoviário',seats:46,price:850000,source:'Revenda de Ônibus'},
{id:'m37',model:'Marcopolo Ideale 770',year:'2013/2013',chassis:'Mercedes-Benz OF-1721',type:'Fretamento / rodoviário',seats:46,price:330000,source:'Revenda de Ônibus'},
{id:'m38',model:'Marcopolo Viaggio 900 G7',year:'2013/2013',chassis:'Mercedes-Benz OF-1721',type:'Rodoviário',seats:50,price:360000,source:'Revenda de Ônibus'},
{id:'m39',model:'Marcopolo Ideale 800',year:'2017/2018',chassis:'Volkswagen 17.230',type:'Fretamento / rodoviário',seats:46,price:530000,source:'Revenda de Ônibus'},
{id:'m40',model:'Irizar Century S',year:'2011/2011',chassis:'Scania K310 4x2',type:'Rodoviário',seats:46,price:270000,source:'Referência simulada'},
{id:'m41',model:'Caio Apache VIP IV',year:'2018/2019',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:39,price:390000,source:'Estimativa de simulação'},
{id:'m42',model:'Caio Apache VIP V',year:'2022/2023',chassis:'Mercedes-Benz OF-1721 Euro V',type:'Urbano',seats:40,price:680000,source:'Estimativa de simulação'},
{id:'m43',model:'Caio Apache VIP VI',year:'2025/2026',chassis:'Mercedes-Benz OF-1726 Euro VI',type:'Urbano',seats:42,price:920000,source:'Estimativa de simulação'},
{id:'m44',model:'Caio Millennium V Padron',year:'2020/2021',chassis:'Mercedes-Benz O-500U',type:'Urbano padron',seats:42,price:720000,source:'Estimativa de simulação'},
{id:'m45',model:'Caio Millennium V Articulado',year:'2021/2022',chassis:'Mercedes-Benz O-500 UA 6x2',type:'Urbano articulado',seats:55,price:1350000,source:'Estimativa de simulação'},
{id:'m46',model:'Caio eMillennium elétrico',year:'2024/2025',chassis:'Chassi elétrico — especificação depende da versão',type:'Urbano elétrico',seats:35,price:2450000,fuel:'Elétrico (bateria)',tankL:0,kmL:null,source:'Estimativa de simulação',lengthM:12.5,widthM:2.55,heightM:3.4},
{id:'m47',model:'Caio Foz Super',year:'2018/2019',chassis:'Mercedes-Benz LO-916',type:'Micro-ônibus urbano',seats:24,price:290000,source:'Estimativa de simulação',lengthM:8.0,widthM:2.35,heightM:3.0},
{id:'m48',model:'Caio Foz 2400',year:'2021/2022',chassis:'Mercedes-Benz LO-916',type:'Micro-ônibus urbano',seats:25,price:410000,source:'Estimativa de simulação',lengthM:8.5,widthM:2.35,heightM:3.05},
{id:'m49',model:'Marcopolo Torino S',year:'2023/2024',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:40,price:780000,source:'Estimativa de simulação'},
{id:'m50',model:'Marcopolo Torino articulado',year:'2018/2019',chassis:'Scania K320 UA 6x2',type:'Urbano articulado',seats:55,price:990000,source:'Estimativa de simulação',lengthM:18.6,widthM:2.60,heightM:3.35},
{id:'m51',model:'Marcopolo Viale BRT',year:'2012/2013',chassis:'Volvo B340M 6x2',type:'Urbano articulado BRT',seats:50,price:430000,source:'Estimativa de simulação',lengthM:18.8,widthM:2.60,heightM:3.45},
{id:'m52',model:'Marcopolo Viale',year:'2010/2011',chassis:'Mercedes-Benz OF-1722',type:'Urbano',seats:42,price:150000,source:'Estimativa de simulação'},
{id:'m53',model:'Marcopolo Attivi elétrico',year:'2024/2025',chassis:'Plataforma elétrica — versão a confirmar',type:'Urbano elétrico',seats:34,price:2350000,fuel:'Elétrico (bateria)',tankL:0,kmL:null,source:'Estimativa de simulação',lengthM:12.5,widthM:2.55,heightM:3.4},
{id:'m54',model:'Marcopolo Senior Urbano',year:'2022/2023',chassis:'Mercedes-Benz LO-916',type:'Micro-ônibus urbano',seats:24,price:430000,source:'Estimativa de simulação',lengthM:8.3,widthM:2.35,heightM:3.09},
{id:'m55',model:'Volare Attack 8 Escolar',year:'2020/2021',chassis:'Agrale MA 10.0',type:'Micro-ônibus escolar',seats:30,price:330000,source:'Estimativa de simulação',lengthM:7.0,widthM:2.3,heightM:3.0},
{id:'m56',model:'Volare Fly 10 Urbano',year:'2023/2024',chassis:'Agrale MA 10.0',type:'Micro-ônibus urbano',seats:30,price:510000,source:'Estimativa de simulação',lengthM:8.5,widthM:2.35,heightM:3.1},
{id:'m57',model:'Volare Fly 12',year:'2024/2025',chassis:'Agrale MA 12.0',type:'Micro-ônibus intermunicipal',seats:42,price:660000,source:'Estimativa de simulação',lengthM:9.5,widthM:2.4,heightM:3.3},
{id:'m58',model:'Mascarello Granmidi',year:'2021/2022',chassis:'Mercedes-Benz OF-1519',type:'Urbano midi',seats:30,price:520000,source:'Estimativa de simulação',lengthM:10.8,widthM:2.55,heightM:3.25},
{id:'m59',model:'Mascarello Granmetro',year:'2018/2019',chassis:'Mercedes-Benz O-500U',type:'Urbano padron',seats:42,price:650000,source:'Estimativa de simulação'},
{id:'m60',model:'Mascarello Horizon Escolar',year:'2022/2023',chassis:'Volkswagen 9.180',type:'Micro-ônibus escolar',seats:29,price:390000,source:'Estimativa de simulação',lengthM:8.5,widthM:2.35,heightM:3.1},
{id:'m61',model:'Mascarello Roma R6',year:'2022/2023',chassis:'Volkswagen 17.230',type:'Intermunicipal / fretamento',seats:46,price:720000,source:'Estimativa de simulação'},
{id:'m62',model:'Comil Svelto',year:'2015/2016',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:42,price:260000,source:'Estimativa de simulação'},
{id:'m63',model:'Comil Svelto Midi',year:'2023/2024',chassis:'Mercedes-Benz OF-1519',type:'Urbano midi',seats:30,price:590000,source:'Estimativa de simulação',lengthM:10.8,widthM:2.55,heightM:3.25},
{id:'m64',model:'Comil Campione 3.25',year:'2019/2020',chassis:'Mercedes-Benz OF-1721',type:'Fretamento / rodoviário',seats:46,price:610000,source:'Estimativa de simulação'},
{id:'m65',model:'Comil Campione 3.45',year:'2023/2024',chassis:'Mercedes-Benz OF-1724',type:'Fretamento / rodoviário',seats:46,price:890000,source:'Estimativa de simulação'},
{id:'m66',model:'Comil Campione Invictus 1050',year:'2024/2025',chassis:'Volvo B340R 4x2',type:'Rodoviário',seats:46,price:1450000,source:'Estimativa de simulação'},
{id:'m67',model:'Comil Campione Invictus 1200',year:'2023/2024',chassis:'Mercedes-Benz O-500 RS',type:'Rodoviário',seats:46,price:1350000,source:'Estimativa de simulação'},
{id:'m68',model:'Comil Campione Invictus HD',year:'2024/2025',chassis:'Scania K410 4x2',type:'Rodoviário high-deck',seats:44,price:1650000,source:'Estimativa de simulação'},
{id:'m69',model:'Comil Campione Invictus DD',year:'2022/2023',chassis:'Scania K440 8x2',type:'Rodoviário double-decker',seats:60,price:1950000,source:'Estimativa de simulação',lengthM:14.0,widthM:2.6,heightM:4.1},
{id:'m70',model:'Busscar El Buss 320',year:'2018/2019',chassis:'Volkswagen 17.230',type:'Rodoviário / fretamento',seats:46,price:590000,source:'Estimativa de simulação'},
{id:'m71',model:'Busscar El Buss 340',year:'2022/2023',chassis:'Mercedes-Benz OF-1724',type:'Intermunicipal / fretamento',seats:46,price:790000,source:'Estimativa de simulação'},
{id:'m72',model:'Busscar Vissta Buss 340',year:'2023/2024',chassis:'Volkswagen 17.230',type:'Rodoviário',seats:46,price:890000,source:'Estimativa de simulação'},
{id:'m73',model:'Busscar Vissta Buss 360',year:'2024/2025',chassis:'Mercedes-Benz O-500 RS',type:'Rodoviário',seats:46,price:1450000,source:'Estimativa de simulação'},
{id:'m74',model:'Busscar Vissta Buss DD',year:'2020/2021',chassis:'Scania K440 8x2',type:'Rodoviário double-decker',seats:58,price:1650000,source:'Estimativa de simulação',lengthM:14.0,widthM:2.6,heightM:4.1},
{id:'m75',model:'Irizar i6',year:'2017/2018',chassis:'Scania K360 4x2',type:'Rodoviário',seats:46,price:820000,source:'Estimativa de simulação'},
{id:'m76',model:'Irizar i8',year:'2022/2023',chassis:'Volvo B420R 6x2',type:'Rodoviário',seats:46,price:1550000,source:'Estimativa de simulação'},
{id:'m77',model:'Neobus Mega Plus',year:'2019/2020',chassis:'Mercedes-Benz OF-1721',type:'Urbano',seats:42,price:520000,source:'Estimativa de simulação'},
{id:'m78',model:'Neobus New Mega BRT articulado',year:'2021/2022',chassis:'Volvo B340M 6x2',type:'Urbano articulado BRT',seats:55,price:1300000,source:'Estimativa de simulação',lengthM:18.8,widthM:2.6,heightM:3.5},
{id:'m79',model:'Marcopolo Viaggio G8 900',year:'2024/2025',chassis:'Volvo B320R 4x2',type:'Rodoviário',seats:44,price:1320000,source:'Estimativa de simulação'},
{id:'m80',model:'Marcopolo Paradiso G8 1350',year:'2023/2024',chassis:'Mercedes-Benz O-500 RS 4x2',type:'Rodoviário high-deck',seats:46,price:1750000,source:'Estimativa de simulação',lengthM:13.2,widthM:2.6,heightM:3.9}
].map(enrichMarketBus);
function renderMarket(){
  if(!$('#busMarketGrid'))return;
  const q=norm($('#marketSearch').value);const rows=BUS_MARKET.filter(x=>!q||norm(`${x.model} ${x.chassis} ${x.type} ${x.year} ${x.seats} ${x.totalCapacity} ${x.standing} ${x.traction} ${x.configuration} ${x.fuel}`).includes(q));
  const pageCount=Math.max(1,Math.ceil(rows.length/20));marketPage=Math.min(marketPage,pageCount-1);marketViewRows=rows.slice(marketPage*20,marketPage*20+20);
  $('#marketPageLabel').textContent=rows.length?`Mostrando ${marketPage*20+1}–${Math.min((marketPage+1)*20,rows.length)} de ${rows.length} veículos. Quilometragem e preço são dados de simulação; confirme a ficha real antes de qualquer compra.`:'Nenhum ônibus corresponde à busca.';
  $('#marketPrev').disabled=marketPage===0;$('#marketNext').disabled=marketPage>=pageCount-1;
  $('#busMarketGrid').innerHTML=marketViewRows.map(x=>{const down=x.price*0.2,monthly=loanMonthlyPayment(x.price-down,48,1.8);const km=Number(x.kmDriven||0).toLocaleString('pt-BR');const dim=`${numberPt(x.lengthM,2)} m × ${numberPt(x.widthM,2)} m × ${numberPt(x.heightM,2)} m`;const tank=x.fuel==='Elétrico (bateria)'?'Bateria elétrica':`${x.tankL} L`;const consumption=x.kmL==null?'kWh/km varia por ciclo':`~${numberPt(x.kmL,1)} km/L`;return `<article class="market-bus-card"><div class="market-bus-top"><span class="market-category">${escapeHtml(x.type)}</span><span class="market-year">${escapeHtml(x.year)}</span></div><h3>${escapeHtml(x.model)}</h3><p class="market-chassis">${escapeHtml(x.chassis)}</p><div class="market-specs"><span><small>Passageiros sentados</small><strong>${x.seated}</strong></span><span><small>Em pé (estimativa)</small><strong>${x.standing}</strong></span><span><small>Capacidade total estimada</small><strong>${x.totalCapacity} passageiros</strong></span><span><small>Quilometragem simulada</small><strong>${km} km</strong></span></div><details class="market-detail"><summary>Ver ficha técnica completa</summary><div class="market-detail-grid"><div><small>Dimensões (C × L × A)</small><strong>${dim}</strong></div><div><small>Configuração</small><strong>${escapeHtml(x.configuration)}</strong></div><div><small>Chassi / motor informado</small><strong>${escapeHtml(x.engine)}</strong></div><div><small>Tração / eixos</small><strong>${escapeHtml(x.traction)} · ${x.axles} eixos</strong></div><div><small>Combustível</small><strong>${escapeHtml(x.fuel)}</strong></div><div><small>Tanque / bateria</small><strong>${tank}</strong></div><div><small>Consumo de referência</small><strong>${consumption}</strong></div><div><small>Câmbio</small><strong>${escapeHtml(x.transmission)}</strong></div><div><small>Portas</small><strong>${x.doors}</strong></div><div><small>Ar-condicionado</small><strong>${escapeHtml(x.airConditioning)}</strong></div><div><small>Acessibilidade</small><strong>${escapeHtml(x.accessibility)}</strong></div><div><small>Perfil</small><strong>${escapeHtml(x.type)}</strong></div></div><p class="market-data-disclaimer">${escapeHtml(x.dataStatus)}. Lotação em pé é apenas estimativa para o simulador, não autorização legal de capacidade.</p></details><div class="market-price">${money(x.price)}<small>preço ilustrativo do mercado simulado — não é anúncio ativo</small></div><div class="market-finance-estimate"><strong>${money(monthly)}/mês</strong><small>Simulação: entrada ${money(down)} + 48 parcelas a 1,8% a.m.</small></div><p class="market-source">Ficha de referência: ${escapeHtml(x.source)}. Hodômetro, preço, estado, documentos e disponibilidade são fictícios ou precisam de conferência.</p><button class="primary-button market-finance-button" type="button" data-market-finance="${escapeHtml(x.id)}">Simular compra / financiamento</button></article>`;}).join('');
}
$('#marketSearch').addEventListener('input',()=>{marketPage=0;renderMarket();});
$('#marketNext').addEventListener('click',()=>{marketPage++;renderMarket();});
$('#marketPrev').addEventListener('click',()=>{marketPage=Math.max(0,marketPage-1);renderMarket();});
$('#marketRefresh').addEventListener('click',()=>{marketPage=marketPage+1>=Math.ceil(BUS_MARKET.filter(x=>!norm($('#marketSearch').value)||norm(`${x.model} ${x.chassis} ${x.type} ${x.year} ${x.seats} ${x.totalCapacity} ${x.standing} ${x.traction} ${x.configuration} ${x.fuel}`).includes(norm($('#marketSearch').value))).length/20)?0:marketPage+1;renderMarket();showToast(`Catálogo atualizado: lote ${marketPage+1}. Os preços e hodômetros são fictícios e servem apenas para a simulação.`);});
$('#busMarketGrid').addEventListener('click',event=>{const b=event.target.closest('[data-market-finance]');if(!b)return;if(!assertOwner())return;const item=BUS_MARKET.find(x=>x.id===b.dataset.marketFinance);if(!item)return;$('#finCompany').value=GROUP_COMPANIES.includes($('#finCompany').value)?$('#finCompany').value:'Progresso';$('#finModel').value=`${item.model} ${item.year}`;$('#finChassis').value=item.chassis;$('#finYear').value=item.year;$('#finPrice').value=String(item.price);$('#finPrefix').value=$('#finPrefix').value||`GC-${String(BUS_MARKET.indexOf(item)+1).padStart(3,'0')}`;updateFinancePreview();$('#financedBusForm').scrollIntoView({behavior:'smooth',block:'start'});showToast('Modelo e preço de referência enviados ao simulador de financiamento.');});

// Caixa: histórico de viagens normais + resultado líquido das operações simuladas + lançamentos manuais.
function readOperationCashState(){
  try{
    const raw=JSON.parse(localStorage.getItem(OPERATION_CASH_STATE_KEY)||'null');
    if(!raw||typeof raw!=='object')return {totalNet:0,operationNets:{},lastTripCounts:{},entries:[]};
    return {totalNet:Number(raw.totalNet)||0,operationNets:raw.operationNets&&typeof raw.operationNets==='object'?raw.operationNets:{},lastTripCounts:raw.lastTripCounts&&typeof raw.lastTripCounts==='object'?raw.lastTripCounts:{},entries:Array.isArray(raw.entries)?raw.entries:[]};
  }catch(error){return {totalNet:0,operationNets:{},lastTripCounts:{},entries:[]};}
}
function writeOperationCashState(value){
  try{localStorage.setItem(OPERATION_CASH_STATE_KEY,JSON.stringify({...value,entries:(value.entries||[]).slice(-5000)}));return true;}
  catch(error){showToast('Não foi possível salvar o lucro da operação no caixa. Verifique o espaço livre do navegador.');return false;}
}
function operationLifetimeNet(op){
  const values=Object.values(op.driverTotals&&typeof op.driverTotals==='object'?op.driverTotals:{});
  if(values.length)return values.reduce((sum,item)=>sum+(Number(item.net)||0),0);
  return (Array.isArray(op.tripLog)?op.tripLog:[]).reduce((sum,item)=>sum+(Number(item.net)||0),0);
}
function operationCashEntry(op,net,kind,trip){
  const positive=Number(net)>=0,stamp=trip?.completedAt||op.lastTripCompletedAt||op.startedAt||op.createdAt||new Date().toISOString();
  const d=new Date(stamp);const date=Number.isNaN(d.getTime())?dateTodayLocal():`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const route=`${op.company||'Empresa'} · ${op.city||'Cidade não informada'} · Linha ${op.line||'sem nome'}`;
  const desc=kind==='trip'?`${route} · ${trip?.driver||'Motorista não definido'} · viagem ${trip?.tripNumber||''} · ${op.busModel||'Ônibus'} prefixo ${op.prefix||'—'}`:`${route} · lucro acumulado anterior à integração (${Number(op.completedTrips)||0} viagem(ns), motoristas escalados)`;
  return {id:kind==='trip'?`opcash-${op.id}-${trip.tripNumber}`:`opcash-baseline-${op.id}`,date,direction:positive?'in':'out',amount:Math.abs(Number(net)||0),category:positive?(kind==='trip'?'Lucro de operação de linha':'Lucro acumulado anterior da operação'):(kind==='trip'?'Prejuízo de operação de linha':'Prejuízo acumulado anterior da operação'),description:desc,auto:true,source:'operationSimulation',operationId:op.id,tripNumber:trip?.tripNumber||null,createdAt:stamp};
}
function syncOperationCashState(operations){
  const state=readOperationCashState();let changed=false;
  for(const op of operations){
    const id=String(op.id||'');if(!id)continue;
    const currentNet=operationLifetimeNet(op),currentTrips=Math.max(0,Number(op.completedTrips)||0);
    if(!Object.prototype.hasOwnProperty.call(state.lastTripCounts,id)){
      // Migra o lucro já acumulado na versão anterior para o caixa uma única vez.
      state.operationNets[id]=currentNet;state.lastTripCounts[id]=currentTrips;state.totalNet+=currentNet;
      if(Math.abs(currentNet)>0.004)state.entries.push(operationCashEntry(op,currentNet,'baseline'));
      changed=true;continue;
    }
    const priorNet=Number(state.operationNets[id])||0,priorTrips=Math.max(0,Number(state.lastTripCounts[id])||0),delta=currentNet-priorNet;
    const fresh=(Array.isArray(op.tripLog)?op.tripLog:[]).filter(t=>Number(t.tripNumber)>priorTrips&&Number(t.tripNumber)<=currentTrips).sort((a,b)=>Number(a.tripNumber)-Number(b.tripNumber));
    let freshNet=0;for(const trip of fresh){const net=Number(trip.net)||0;freshNet+=net;if(Math.abs(net)>0.004)state.entries.push(operationCashEntry(op,net,'trip',trip));}
    const missedNet=delta-freshNet;
    // Se o navegador ficou fechado por muitas viagens e o log rotativo já as removeu,
    // lança a diferença restante como recuperação consolidada, sem perder o lucro.
    if(Math.abs(missedNet)>0.004){state.entries.push({...operationCashEntry(op,missedNet,'trip',{tripNumber:`${priorTrips+1}–${currentTrips}`,driver:'Motoristas escalados',completedAt:op.lastTripCompletedAt}),id:`opcash-recovery-${id}-${priorTrips}-${currentTrips}`,category:missedNet>=0?'Lucro recuperado de viagens da operação':'Prejuízo recuperado de viagens da operação',description:`${op.company||'Empresa'} · ${op.city||'Cidade não informada'} · Linha ${op.line||'sem nome'} · viagens recuperadas após reabertura do site (${priorTrips+1} a ${currentTrips})`});}
    if(Math.abs(delta)>0.004||currentTrips!==priorTrips){state.totalNet+=delta;changed=true;}
    state.operationNets[id]=currentNet;state.lastTripCounts[id]=currentTrips;
  }
  if(changed&&!writeOperationCashState(state))return false;
  return changed;
}
function cashBreakdown(){
  const trips=loadHistory(),ledger=cashLedger(),ops=readOperationCashState();
  const revenue=trips.reduce((s,x)=>s+Number(x.revenue||0),0),diesel=trips.reduce((s,x)=>s+Number(x.fuelCost||0),0);
  const manualAndOther=ledger.filter(x=>x.source!=='operationSimulation');
  const income=manualAndOther.filter(x=>x.direction==='in').reduce((s,x)=>s+Number(x.amount||0),0),expenses=manualAndOther.filter(x=>x.direction==='out').reduce((s,x)=>s+Number(x.amount||0),0);
  const operationProfit=Number(ops.totalNet)||0;
  return{trips:trips.length,revenue,diesel,tripNet:revenue-diesel,operationProfit,otherIncome:income,otherExpenses:expenses,balance:revenue-diesel+operationProfit+income-expenses};
}
function allCashMovements(){
  const tripRows=[];
  loadHistory().forEach(t=>{const date=t.timestamp?new Date(t.timestamp):new Date();const iso=Number.isNaN(date.getTime())?dateTodayLocal():`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;tripRows.push({id:`triprev-${t.id}`,date:iso,direction:'in',amount:Number(t.revenue||0),category:'Arrecadação de viagem',description:`${t.dayLabel||'Dia'} · ${t.company||'Empresa'} · ${t.busPrefix||t.busModel||'Ônibus'} · ${t.paid||0} pagantes`,auto:true,source:'normalTrip'});if(Number(t.fuelCost||0)>0)tripRows.push({id:`tripdiesel-${t.id}`,date:iso,direction:'out',amount:Number(t.fuelCost||0),category:'Diesel da viagem',description:`${t.dayLabel||'Dia'} · ${t.company||'Empresa'} · diesel ${numberPt(t.liters||0,2)} L`,auto:true,source:'normalTrip'});});
  const opState=readOperationCashState(),opEntries=opState.entries||[];
  const listedNet=opEntries.reduce((sum,x)=>sum+(x.direction==='in'?1:-1)*Number(x.amount||0),0),unlistedNet=(Number(opState.totalNet)||0)-listedNet;
  const summary= Math.abs(unlistedNet)>0.004?[{id:'opcash-archive-summary',date:dateTodayLocal(),direction:unlistedNet>=0?'in':'out',amount:Math.abs(unlistedNet),category:unlistedNet>=0?'Lucro acumulado de operações anteriores':'Prejuízo acumulado de operações anteriores',description:'Resumo de movimentos antigos da Operação de Linha; os últimos 5.000 lançamentos detalhados são mantidos.',auto:true,source:'operationSimulation'}]:[];
  return [...tripRows,...opEntries,...summary,...cashLedger().map(x=>({...x,auto:!!x.auto}))].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));
}
function renderCashDashboard(){if(!$('#cashSummary'))return;const c=cashBreakdown();$('#cashSummary').innerHTML=[['Arrecadação total das viagens normais',money(c.revenue)],['Diesel registrado nas viagens normais',`− ${money(c.diesel)}`],['Resultado das viagens normais antes de outros custos',money(c.tripNet),c.tripNet>=0?'positive':'negative'],['Lucro líquido das operações em linha',money(c.operationProfit),c.operationProfit>=0?'positive':'negative'],['Outras entradas',money(c.otherIncome)],['Outras saídas',money(c.otherExpenses)],['Saldo disponível do caixa',money(c.balance),c.balance>=0?'positive':'negative']].map(([l,v,k])=>moneyStat(l,v,k||'')).join('');
  const rows=allCashMovements();$('#cashLedgerList').innerHTML=rows.length?rows.slice(0,40).map(x=>`<article class="record-item"><div class="record-item-top"><div><strong class="cash-${x.direction}">${x.direction==='in'?'+ ':'− '}${money(x.amount)} · ${escapeHtml(x.category)}</strong><small>${escapeHtml(localDate(x.date))} · ${escapeHtml(x.description||'Sem descrição')}${x.auto?(x.source==='operationSimulation'?' · automático da Operação de Linha':x.source==='onlineFretamento'?' · Atendimento Online':' · automático das viagens'):''}</small></div>${x.auto?'<span class="doc-status-tag">Automático</span>':`<button type="button" class="record-danger" data-cash-delete="${escapeHtml(x.id)}">Excluir</button>`}</div></article>`).join(''):recordsEmpty('Sem movimentos. As viagens finalizadas aparecerão automaticamente aqui.');}
$('#cashDate').value=dateTodayLocal();
$('#cashEntryForm').addEventListener('submit',event=>{event.preventDefault();if(!assertOwner())return;const date=$('#cashDate').value,direction=$('#cashDirection').value,category=$('#cashCategory').value,amount=readToolValue('cashAmount'),description=$('#cashDescription').value.trim();if(!date||!description||amount===null||amount<=0){showToast('Informe data, descrição e valor maior que zero.');return;}if(direction==='out'&&amount>cashBreakdown().balance+0.005){showToast(`Saída recusada: o caixa disponível é ${money(cashBreakdown().balance)}.`);return;}const rows=cashLedger();rows.push({id:makeId(),date,direction,category,amount,description,createdAt:new Date().toISOString()});if(!writeArrayKey(CASH_LEDGER_KEY,rows))return;$('#cashEntryForm').reset();$('#cashDate').value=dateTodayLocal();renderCashDashboard();renderFinanceList();showToast('Movimento do caixa registrado.');});
$('#cashLedgerList').addEventListener('click',event=>{const b=event.target.closest('[data-cash-delete]');if(!b)return;if(!assertOwner())return;if(!window.confirm('Excluir este movimento manual do caixa?'))return;writeArrayKey(CASH_LEDGER_KEY,cashLedger().filter(x=>x.id!==b.dataset.cashDelete));renderCashDashboard();renderFinanceList();showToast('Movimento removido.');});
$('#cashExportCsv').addEventListener('click',()=>{if(!assertOwner())return;const rows=allCashMovements();const header=['Data','Tipo','Categoria','Valor','Descrição','Origem'];const content=[header,...rows.map(x=>[x.date,x.direction==='in'?'Entrada':'Saída',x.category,x.amount,x.description||'',x.source==='operationSimulation'?'Operação de linha automática':x.auto?'Viagem automática':'Manual'])].map(r=>r.map(csvCell).join(';')).join('\n');downloadTextFile('grupo-conect-caixa.csv',content,'text/csv;charset=utf-8');showToast('Livro-caixa exportado em CSV.');});

// Financiamentos pelo sistema Price, com caixa obrigatório para entrada e para cada parcela.
function renderFinanceList(){if(!$('#financeList'))return;const rows=financedBuses();$('#financeList').innerHTML=rows.length?rows.slice().reverse().map(x=>{const rem=Math.max(0,x.installmentCount-x.paidCount),due=addMonthsToISO(x.firstDueDate,x.paidCount),late=daysLateFrom(due);return `<article class="record-item finance-list-item"><div class="record-item-top"><div><strong>${escapeHtml(x.company)} · ${escapeHtml(x.prefix)} · ${escapeHtml(x.model)}</strong><small>${escapeHtml(x.chassis)} · ano/modelo ${escapeHtml(x.year)} · ${x.paidCount}/${x.installmentCount} parcelas pagas · ${rem} restantes · parcela-base ${money(x.installmentAmount)}${rem?` · vencimento ${localDate(due)}${late?` · ${late} dia(s) em atraso`:''}`:' · quitado'}</small></div><button type="button" class="secondary-action-button" data-fin-view="${escapeHtml(x.id)}">Ver parcelas</button></div></article>`;}).join(''):recordsEmpty('Nenhum financiamento cadastrado. Você também pode enviar um ônibus do Mercado para este formulário.');}
function updateFinancePreview(){const price=readToolValue('finPrice'),down=readToolValue('finDownPayment'),n=readToolValue('finInstallments'),rate=readToolValue('finMonthlyRate');if(price===null||down===null||n===null||rate===null||price<=0||down>price||n<1){$('#finPreview').textContent='Confira o preço, a entrada, o prazo e a taxa.';return;}const principal=price-down,payment=loanMonthlyPayment(principal,n,rate);$('#finPreview').innerHTML=`<strong>Crédito financiado: ${money(principal)}</strong><span>Parcela estimada: <b>${money(payment)}</b> · total das parcelas ${money(payment*n)} · juros estimados ${money(payment*n-principal)}. Entrada de ${money(down)} não inclui custos acessórios ou seguros.`;}
['finPrice','finDownPayment','finInstallments','finMonthlyRate'].forEach(id=>$('#'+id).addEventListener('input',updateFinancePreview));
$('#finFirstDue').value=addMonthsToISO(dateTodayLocal(),1);
// Inicializa o configurador 0 km com opções compatíveis com o segmento selecionado.
gcZeroKmRefreshModels();$('#zeroKmDownPct').disabled=true;$('#zeroKmMonths').disabled=true;$('#zeroKmRate').disabled=true;gcZeroKmRenderHistory();
function renderFinanceDetail(id){const f=financedBuses().find(x=>x.id===id);if(!f)return;currentFinanceId=id;$('#financeDetailTitle').textContent=`${f.prefix} · ${f.model}`;const remaining=Math.max(0,f.installmentCount-f.paidCount),due=addMonthsToISO(f.firstDueDate,f.paidCount),daysLate=remaining?daysLateFrom(due):0,lateFine=daysLate?f.installmentAmount*(f.lateFinePct/100):0,lateInterest=daysLate?f.installmentAmount*(f.lateInterestPct/100)*(daysLate/30):0,totalDue=remaining?f.installmentAmount+lateFine+lateInterest:0;
  $('#financeDetailStats').innerHTML=[['Preço do ônibus',money(f.price)],['Entrada paga',money(f.downPayment)],['Valor financiado',money(f.principal)],['Parcelas pagas',`${f.paidCount}/${f.installmentCount}`],['Parcelas restantes',remaining],['Parcela-base',money(f.installmentAmount)]].map(([l,v])=>moneyStat(l,v)).join('');
  $('#financeDueInfo').textContent=remaining?`Próximo vencimento: ${localDate(due)}. ${daysLate?`Atraso de ${daysLate} dia(s): multa simulada de ${money(lateFine)} + juros de mora de ${money(lateInterest)}. `:'Sem atraso até a data de hoje. '}Total necessário para pagar a próxima parcela: ${money(totalDue)}. Taxas de atraso aplicadas conforme os percentuais informados no cadastro do contrato; confira seu contrato real.`:'Financiamento quitado: não há parcelas pendentes.';
  $('#financePayInstallment').disabled=remaining===0;$('#financePayInstallment').textContent=remaining?`Pagar próxima parcela com o caixa · ${money(totalDue)}`:'Financiamento quitado';
  const payments=f.payments||[];$('#financePaymentHistory').innerHTML=payments.length?payments.slice().reverse().map(p=>`<article class="record-item"><div><strong>Parcela ${p.number} paga · ${money(p.total)}</strong><small>Vencimento ${localDate(p.dueDate)} · paga ${new Date(p.paidAt).toLocaleDateString('pt-BR')} · ${p.daysLate} dia(s) de atraso · encargos ${money(p.charges)}</small></div></article>`).join(''):recordsEmpty('Nenhuma parcela paga ainda.');$('#financeDetailPanel').hidden=false;
}
$('#financedBusForm').addEventListener('submit',event=>{event.preventDefault();if(!assertOwner())return;const company=$('#finCompany').value,model=$('#finModel').value.trim(),chassis=$('#finChassis').value.trim(),year=$('#finYear').value.trim(),prefix=$('#finPrefix').value.trim(),price=readToolValue('finPrice'),down=readToolValue('finDownPayment'),count=readToolValue('finInstallments'),rate=readToolValue('finMonthlyRate'),firstDue=$('#finFirstDue').value,fine=readToolValue('finLateFine'),lateRate=readToolValue('finLateInterest');
  if(!company||!model||!chassis||!year||!prefix||price===null||price<=0||down===null||down<0||down>price||count===null||count<1||rate===null||rate<0||!firstDue||fine===null||lateRate===null){showToast('Confira os dados do ônibus e do financiamento.');return;}
  const c=cashBreakdown();if(down>c.balance+0.005){showToast(`Entrada recusada: o caixa disponível é ${money(c.balance)} e a entrada informada é ${money(down)}. Registre um aporte ou reduza a entrada.`);return;}
  const principal=price-down,payment=loanMonthlyPayment(principal,count,rate);if(principal<=0){showToast('A entrada cobre o preço inteiro; use o cadastro de frota para compra à vista, sem financiamento.');return;}
  const row={id:makeId(),company,model,chassis,year,prefix,price,downPayment:down,principal,installmentCount:count,monthlyRate:rate,installmentAmount:payment,firstDueDate:firstDue,lateFinePct:fine,lateInterestPct:lateRate,paidCount:0,payments:[],createdAt:new Date().toISOString()};
  const frows=financedBuses();frows.push(row);if(!writeArrayKey(FINANCED_BUSES_KEY,frows))return;
  if(down>0){const led=cashLedger();led.push({id:makeId(),date:dateTodayLocal(),direction:'out',category:'Entrada de ônibus financiado',amount:down,description:`Entrada do ${prefix} · ${model}`,createdAt:new Date().toISOString()});writeArrayKey(CASH_LEDGER_KEY,led);}
  const fleet=ownerFleet();if(!fleet.some(x=>norm(x.company)===norm(company)&&norm(x.prefix)===norm(prefix))){fleet.push({id:makeId(),company,city:'',line:'',type:'Frota financeira',prefix,model,chassis,seats:45,tank:300,kmpl:2.5,fare:7.99,dieselPrice:7.99,createdAt:new Date().toISOString(),source:'financiamento'});writeArrayKey(OWNER_FLEET_KEY,fleet);}
  $('#financedBusForm').reset();$('#finInstallments').value='48';$('#finMonthlyRate').value='1.8';$('#finDownPayment').value='0';$('#finLateFine').value='2';$('#finLateInterest').value='1';$('#finFirstDue').value=addMonthsToISO(dateTodayLocal(),1);updateFinancePreview();renderFinanceList();renderCashDashboard();renderOwnerFleet();refreshOperationChoices();showToast(`Financiamento salvo: parcela estimada de ${money(payment)}.`);
});
$('#financeList').addEventListener('click',event=>{const b=event.target.closest('[data-fin-view]');if(!b)return;if(!assertOwner())return;renderFinanceDetail(b.dataset.finView);$('#financeDetailPanel').scrollIntoView({behavior:'smooth',block:'start'});});
$('#financeCloseDetail').addEventListener('click',()=>{$('#financeDetailPanel').hidden=true;currentFinanceId=null;});
$('#financePayInstallment').addEventListener('click',()=>{
  if(!assertOwner()||!currentFinanceId)return;const rows=financedBuses(),f=rows.find(x=>x.id===currentFinanceId);if(!f)return;const remaining=f.installmentCount-f.paidCount;if(remaining<=0){showToast('Este financiamento já está quitado.');return;}
  const due=addMonthsToISO(f.firstDueDate,f.paidCount),lateDays=daysLateFrom(due),fine=lateDays?f.installmentAmount*f.lateFinePct/100:0,interest=lateDays?f.installmentAmount*f.lateInterestPct/100*(lateDays/30):0,total=f.installmentAmount+fine+interest,breakdown=cashBreakdown();
  if(breakdown.balance+0.005<total){showToast(`Pagamento recusado: caixa ${money(breakdown.balance)}; necessário ${money(total)}. Registre uma entrada ou espere mais lucros de viagens.`);return;}
  const description=`Parcela ${f.paidCount+1}/${f.installmentCount} · ${f.prefix} · ${f.model}`;if(!window.confirm(`Confirmar pagamento de ${money(total)}?\nParcela: ${money(f.installmentAmount)}\nMulta: ${money(fine)}\nJuros de mora: ${money(interest)}\nCaixa após pagamento: ${money(breakdown.balance-total)}`))return;
  const payment={id:makeId(),number:f.paidCount+1,dueDate:due,paidAt:new Date().toISOString(),base:f.installmentAmount,fine,interest,charges:fine+interest,total,daysLate:lateDays};f.payments=f.payments||[];f.payments.push(payment);f.paidCount+=1;
  const ledger=cashLedger();ledger.push({id:makeId(),date:dateTodayLocal(),direction:'out',category:'Parcela de financiamento',amount:total,description,createdAt:new Date().toISOString()});
  if(!writeArrayKey(FINANCED_BUSES_KEY,rows)||!writeArrayKey(CASH_LEDGER_KEY,ledger))return;
  renderFinanceList();renderFinanceDetail(f.id);renderCashDashboard();showToast(`Parcela ${payment.number} paga e registrada no caixa.`);
});
$('#financeCopyContract').addEventListener('click',async()=>{if(!assertOwner()||!currentFinanceId)return;const f=financedBuses().find(x=>x.id===currentFinanceId);if(!f)return;const due=addMonthsToISO(f.firstDueDate,f.paidCount);const text=`GRUPO CONECT — RESUMO DE FINANCIAMENTO\nEmpresa: ${f.company}\nÔnibus: ${f.model} · ${f.year}\nPrefixo: ${f.prefix}\nChassi: ${f.chassis}\nPreço: ${money(f.price)} · Entrada: ${money(f.downPayment)} · Principal financiado: ${money(f.principal)}\nTaxa contratual simulada: ${numberPt(f.monthlyRate,2)}% a.m.\nParcela: ${money(f.installmentAmount)}\nPagas: ${f.paidCount}/${f.installmentCount} · Restantes: ${f.installmentCount-f.paidCount}\nPróximo vencimento: ${localDate(due)}\nMulta por atraso: ${f.lateFinePct}% · Juros de mora simulados: ${f.lateInterestPct}% a.m. simples\nDocumento de simulação para OMSI 2; confirme condições em contratos reais.`;showToast(await copyText(text)?'Resumo do financiamento copiado.':'Não foi possível copiar automaticamente.');});

// Relógio em tempo real da simulação. O timestamp persistido permite recuperar viagens concluídas
// depois de trocar de tela ou recarregar a página; não depende de um trabalho em segundo plano externo.
function refreshLiveOperations(){
  const rows=syncOperationRows(Date.now());
  const panel=$('#operationViewerPanel');
  if(rows.some(operationIsRunning)&&panel&&panel.getClientRects().length>0)renderOperations();
}
setInterval(refreshLiveOperations,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLiveOperations();});
window.addEventListener('focus',refreshLiveOperations);

// Inicialização dos módulos da Área do Dono.
setupToday('cashDate');
refreshOperationChoices();
populateIncidentResponses();
updateOperationEconomicsHint();
renderOwnerFleet();renderOwnerScales();renderOperations();renderMarket();renderFinanceList();renderCashDashboard();updateFinancePreview();

// Atalhos da Colinha para abrir o módulo correspondente e descer ao painel indicado.
$$('[data-cheat-go]').forEach(button=>button.addEventListener('click',()=>{
  const target=button.dataset.cheatGo;
  if(target==='gps'){switchScreen('gpsTrackingScreen');$('#gpsUserSelect').value='Pablo';gcGpsSetAccess();return;}
  $('#ownerUserSelect').value='Pablo'; if(typeof activateOwnerArea==='function')activateOwnerArea();
  switchScreen('ownerAreaScreen');
  const anchor=target==='installments'?'ownerFinancePanel':target==='cash'?'ownerCashPanel':target==='operation'?'operationViewerPanel':'ownerFleetForm';
  window.setTimeout(()=>{const el=document.getElementById(anchor);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});if(target==='operation')toggleOperationCheatSheet(true);},80);
}));

// Colinha contextual da operação: pode ser aberta pelo painel principal ou durante uma ocorrência.
function toggleOperationCheatSheet(forceOpen){
  const panel=$('#ovOperationCheatSheet');
  const button=$('#ovToggleOperationCheatSheet');
  if(!panel||!button)return;
  const open=typeof forceOpen==='boolean'?forceOpen:panel.hidden;
  panel.hidden=!open;
  button.setAttribute('aria-expanded',String(open));
  button.textContent=open?'📘 Ocultar colinha da operação':'📘 Colinha da operação de linha';
  if(open)panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('#ovToggleOperationCheatSheet')?.addEventListener('click',()=>toggleOperationCheatSheet());
$('#ovOpenCheatFromIncident')?.addEventListener('click',()=>toggleOperationCheatSheet(true));


/* Correções e módulos completos: GPS de paradas + intermunicipal independente. */
const GC_GPS_STORAGE_KEY = 'grupoConect.gpsStops.v1';
const GC_IC_STORAGE_KEY = 'grupoConect.intercity.v2';
const GC_IC_SEATED_CAPACITY = 44;
const GC_IC_STANDING_CAPACITY = 36;
const GC_IC_TOTAL_CAPACITY = GC_IC_SEATED_CAPACITY + GC_IC_STANDING_CAPACITY;
let gcGpsEditingId = null;

function gcSafeRead(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (error) { return fallback; }
}
function gcSafeWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) { showToast('Não foi possível salvar neste navegador. Verifique o espaço disponível.'); return false; }
}
function gcNowLocalInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function gcFormatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function gcMakeId(prefix = 'gc') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
function gcNormalizeText(value) { return String(value ?? '').trim().toLocaleLowerCase('pt-BR'); }

// GPS manual: consulta por linha/ônibus, histórico, criação, edição e exclusão.
function gcGpsRows() {
  const rows = gcSafeRead(GC_GPS_STORAGE_KEY, []);
  return Array.isArray(rows) ? rows.filter((row) => row && row.id) : [];
}
function gcGpsSaveRows(rows) { return gcSafeWrite(GC_GPS_STORAGE_KEY, rows.slice(-1000)); }
function gcGpsIsPablo() { return $('#gpsUserSelect')?.value === 'Pablo'; }
function gcGpsSetAccess() {
  const pablo = gcGpsIsPablo();
  $('#gpsEditPanel').hidden = !pablo;
  $('#gpsAccessMessage').textContent = pablo
    ? 'Modo Pablo liberado nesta interface: você pode registrar, editar e excluir paradas. A seleção é demonstrativa, não é autenticação segura.'
    : 'Modo somente leitura: consulte as últimas paradas e o histórico. Selecione Pablo para liberar a edição neste navegador.';
  $('#gpsAccessMessage').classList.toggle('success', pablo);
  if (!pablo && gcGpsEditingId) gcGpsResetForm();
  gcRenderGps();
}
function gcGpsResetForm() {
  gcGpsEditingId = null;
  $('#gpsStopForm').reset();
  $('#gpsStopDateTime').value = gcNowLocalInput();
  const submit = $('#gpsStopForm button[type="submit"]');
  if (submit) submit.textContent = 'Registrar parada →';
  const cancel = $('#gpsCancelEdit'); if (cancel) cancel.hidden = true;
}
function gcGpsBeginEdit(id) {
  if (!gcGpsIsPablo()) { showToast('Selecione Pablo para editar as paradas.'); return; }
  const row = gcGpsRows().find((item) => item.id === id);
  if (!row) return;
  gcGpsEditingId = id;
  $('#gpsVehicle').value = row.vehicle || '';
  $('#gpsLine').value = row.line || '';
  $('#gpsStopName').value = row.stop || '';
  const parsed = new Date(row.dateTime || row.createdAt);
  $('#gpsStopDateTime').value = Number.isNaN(parsed.getTime()) ? gcNowLocalInput() : new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $('#gpsStopNote').value = row.note || '';
  const submit = $('#gpsStopForm button[type="submit"]');
  if (submit) submit.textContent = 'Salvar alterações →';
  const cancel = $('#gpsCancelEdit'); if (cancel) cancel.hidden = false;
  $('#gpsStopForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Parada carregada para edição.');
}
function gcRenderGps() {
  const rows = gcGpsRows().sort((a, b) => new Date(b.dateTime || b.createdAt) - new Date(a.dateTime || a.createdAt));
  const isPablo = gcGpsIsPablo();
  const latestByLine = new Map();
  rows.forEach((row) => {
    const key = `${gcNormalizeText(row.vehicle)}|${gcNormalizeText(row.line)}`;
    if (!latestByLine.has(key)) latestByLine.set(key, row);
  });
  const current = Array.from(latestByLine.values());
  $('#gpsCurrentList').innerHTML = current.length ? current.map((row) => `
    <article class="record-item gps-record">
      <div class="gps-record-main"><div><strong>${escapeHtml(row.line || 'Linha sem nome')}</strong><small>Ônibus/prefixo: ${escapeHtml(row.vehicle || 'Não informado')}</small><small>Última parada: ${escapeHtml(row.stop || 'Não informada')} · ${escapeHtml(gcFormatDate(row.dateTime || row.createdAt))}</small>${row.note ? `<small>Obs.: ${escapeHtml(row.note)}</small>` : ''}<span class="gps-current-status">PARADA REGISTRADA</span></div><span class="record-inline-tag">Manual</span></div>
      ${isPablo ? `<div class="gps-record-actions"><button type="button" data-gps-edit="${escapeHtml(row.id)}">Editar parada</button><button type="button" data-gps-delete="${escapeHtml(row.id)}">Excluir registro</button></div>` : ''}
    </article>`).join('') : '<div class="empty-state"><span class="empty-icon">📍</span><strong>Nenhuma parada registrada ainda</strong><span>Quando Pablo registrar o ônibus, a linha e o ponto aparecerão aqui para consulta.</span></div>';
  $('#gpsHistoryList').innerHTML = rows.length ? rows.slice(0, 100).map((row) => `
    <article class="record-item gps-record"><div class="gps-record-main"><div><strong>${escapeHtml(row.vehicle || 'Ônibus não informado')} · ${escapeHtml(row.line || 'Linha sem nome')}</strong><small>${escapeHtml(row.stop || 'Parada não informada')} · ${escapeHtml(gcFormatDate(row.dateTime || row.createdAt))}</small>${row.note ? `<small>${escapeHtml(row.note)}</small>` : ''}</div></div>
      ${isPablo ? `<div class="gps-record-actions"><button type="button" data-gps-edit="${escapeHtml(row.id)}">Editar</button><button type="button" data-gps-delete="${escapeHtml(row.id)}">Excluir</button></div>` : ''}</article>`).join('') : '<div class="empty-state"><span class="empty-icon">🗂️</span><strong>Histórico vazio</strong><span>Os registros serão organizados do mais recente para o mais antigo.</span></div>';
  const operations = typeof ownerOperations === 'function' ? ownerOperations().slice().reverse() : [];
  $('#gpsOperationLinesList').innerHTML = operations.length ? operations.map((op) => {
    const status = String(op.status || 'operando').toLocaleLowerCase('pt-BR');
    const off = status.includes('fora') || status.includes('parada técnica') || status.includes('parada tecnica');
    const detour = status.includes('desvio');
    const statusLabel = off ? 'PARADA / FORA DE OPERAÇÃO' : detour ? 'OPERANDO COM DESVIO' : 'OPERANDO';
    const statusClass = off ? 'offline' : detour ? 'detour' : 'online';
    const vehicle = `${op.company || ''} ${op.prefix || op.busModel || ''}`.trim();
    const matching = rows.find((row) => gcNormalizeText(row.line) === gcNormalizeText(op.line) && (gcNormalizeText(row.vehicle).includes(gcNormalizeText(op.prefix || op.busModel)) || gcNormalizeText(row.vehicle) === gcNormalizeText(vehicle)));
    return `<article class="record-item gps-operation-item"><div class="gps-record-main"><div><strong>${escapeHtml(op.line || 'Linha sem nome')}</strong><small>${escapeHtml(op.company || 'Empresa não informada')} · ${escapeHtml(op.city || 'Cidade não informada')}</small><small>Ônibus: ${escapeHtml(vehicle || 'Não informado')} · Motorista: ${escapeHtml(op.driver || op.drivers?.morning || 'Não informado')}</small>${matching ? `<small>Última parada: ${escapeHtml(matching.stop)} · ${escapeHtml(gcFormatDate(matching.dateTime || matching.createdAt))}</small>` : '<small>Última parada: ainda não registrada no GPS manual</small>'}</div><span class="operation-status ${statusClass}"><i></i>${statusLabel}</span></div>${isPablo ? `<div class="gps-record-actions"><button type="button" data-gps-prefill="${escapeHtml(op.id)}">Registrar parada</button>${matching ? `<button type="button" data-gps-edit="${escapeHtml(matching.id)}">Editar parada</button>` : ''}</div>` : ''}</article>`;
  }).join('') : '<div class="empty-state"><span class="empty-icon">🚌</span><strong>Nenhuma linha cadastrada no Visualizador de Operação</strong><span>As linhas cadastradas na Área do Dono aparecerão aqui. Você também pode registrar uma parada manualmente pelo formulário.</span></div>';
}
function gcGpsPrefillOperation(operationId) {
  if (!gcGpsIsPablo()) { showToast('Selecione Pablo para registrar ou editar paradas.'); return; }
  const op = typeof ownerOperations === 'function' ? ownerOperations().find((item) => item.id === operationId) : null;
  if (!op) { showToast('Não encontrei essa linha no Visualizador de Operação.'); return; }
  const vehicle = `${op.company || ''} ${op.prefix || op.busModel || ''}`.trim();
  const existing = gcGpsRows().filter((row) => gcNormalizeText(row.line) === gcNormalizeText(op.line) && (gcNormalizeText(row.vehicle).includes(gcNormalizeText(op.prefix || op.busModel)) || gcNormalizeText(row.vehicle) === gcNormalizeText(vehicle))).sort((a,b) => new Date(b.dateTime || b.createdAt) - new Date(a.dateTime || a.createdAt))[0];
  if (existing) { gcGpsBeginEdit(existing.id); return; }
  gcGpsResetForm();
  $('#gpsVehicle').value = vehicle; $('#gpsLine').value = op.line || ''; $('#gpsStopDateTime').value = gcNowLocalInput();
  $('#gpsEditPanel').hidden = false; $('#gpsStopName').focus(); $('#gpsStopForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Linha carregada. Informe o ponto onde o ônibus parou e salve.');
}
$('#gpsStopDateTime').value = gcNowLocalInput();
$('#gpsCancelEdit')?.addEventListener('click', gcGpsResetForm);
$('#gpsUserSelect').addEventListener('change', gcGpsSetAccess);
$('#gpsStopForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!gcGpsIsPablo()) { showToast('Somente o modo Pablo pode salvar registros nesta interface.'); return; }
  const vehicle = $('#gpsVehicle').value.trim(), line = $('#gpsLine').value.trim(), stop = $('#gpsStopName').value.trim(), dateTime = $('#gpsStopDateTime').value;
  if (!vehicle || !line || !stop || !dateTime) { showToast('Preencha ônibus, linha, ponto e data/horário.'); return; }
  const rows = gcGpsRows();
  const existing = gcGpsEditingId ? rows.find((item) => item.id === gcGpsEditingId) : null;
  const item = { id: gcGpsEditingId || gcMakeId('gps'), vehicle, line, stop, dateTime: new Date(dateTime).toISOString(), note: $('#gpsStopNote').value.trim(), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  const next = existing ? rows.map((row) => row.id === gcGpsEditingId ? item : row) : [item, ...rows];
  if (!gcGpsSaveRows(next)) return;
  gcGpsResetForm(); gcRenderGps(); showToast(existing ? 'Parada atualizada.' : 'Nova parada registrada.');
});
$('#gpsCurrentList').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-gps-edit]'); const del = event.target.closest('[data-gps-delete]');
  if (edit) gcGpsBeginEdit(edit.dataset.gpsEdit);
  if (del) { if (!gcGpsIsPablo()) return; if (!window.confirm('Excluir este registro de parada?')) return; gcGpsSaveRows(gcGpsRows().filter((row) => row.id !== del.dataset.gpsDelete)); if (gcGpsEditingId === del.dataset.gpsDelete) gcGpsResetForm(); gcRenderGps(); showToast('Registro excluído.'); }
});
$('#gpsHistoryList').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-gps-edit]'); const del = event.target.closest('[data-gps-delete]');
  if (edit) gcGpsBeginEdit(edit.dataset.gpsEdit);
  if (del) { if (!gcGpsIsPablo()) return; if (!window.confirm('Excluir este registro de parada?')) return; gcGpsSaveRows(gcGpsRows().filter((row) => row.id !== del.dataset.gpsDelete)); if (gcGpsEditingId === del.dataset.gpsDelete) gcGpsResetForm(); gcRenderGps(); showToast('Registro excluído.'); }
});
$('#gpsOperationLinesList').addEventListener('click', (event) => {
  const prefill = event.target.closest('[data-gps-prefill]'); const edit = event.target.closest('[data-gps-edit]');
  if (prefill) gcGpsPrefillOperation(prefill.dataset.gpsPrefill);
  if (edit) gcGpsBeginEdit(edit.dataset.gpsEdit);
});
$('#gpsCopyReport').addEventListener('click', async () => {
  const rows = gcGpsRows().sort((a,b) => new Date(b.dateTime || b.createdAt) - new Date(a.dateTime || a.createdAt));
  const report = ['GRUPO CONECT — RELATÓRIO DE PARADAS', ...rows.map((row) => `${gcFormatDate(row.dateTime || row.createdAt)} | ${row.vehicle} | ${row.line} | Parada: ${row.stop}${row.note ? ` | Obs.: ${row.note}` : ''}`)].join('\n');
  showToast(await copyText(report) ? 'Relatório de paradas copiado.' : 'Não foi possível copiar automaticamente.');
});
gcGpsSetAccess();

// Intermunicipal independente: todos os controles salvam por dia neste navegador.
function gcIcNewDay() { return { paid: 0, free: 0, turnstile: 0, tickets: [], soldSpots: {}, selectedSpot: '', report: '', closedAt: null, tripStarted: false, tripStartAt: null, tripEndedAt: null, tripDriver: '', tripCompany: '', tripModel: '', tripPrefix: '', tripValidatorLogId: '' }; }
function gcIcDefaultState() {
  return { driver: 'Pablo', lineName: '', activeDay: 'ic-day-1', nextDayNumber: 2,
    destinations: [{ name: 'Destino A', fare: 8 }, { name: 'Destino B', fare: 12 }, { name: 'Destino C', fare: 18 }, { name: 'Destino D', fare: 25 }],
    days: { 'ic-day-1': gcIcNewDay() } };
}
function gcIcLoadState() {
  const fallback = gcIcDefaultState(); const value = gcSafeRead(GC_IC_STORAGE_KEY, fallback);
  if (!value || typeof value !== 'object' || !value.days || typeof value.days !== 'object') return fallback;
  value.driver = value.driver || 'Pablo'; value.lineName = value.lineName || ''; value.activeDay = value.activeDay || 'ic-day-1';
  value.destinations = Array.isArray(value.destinations) && value.destinations.length === 4 ? value.destinations : fallback.destinations;
  if (!Object.keys(value.days).length) value.days = { 'ic-day-1': gcIcNewDay() };
  Object.keys(value.days).forEach((key) => {
    const day = value.days[key] || gcIcNewDay();
    day.paid = Math.max(0, Number(day.paid) || 0); day.free = Math.max(0, Number(day.free) || 0); day.turnstile = Math.max(0, Number(day.turnstile) || 0);
    day.tickets = Array.isArray(day.tickets) ? day.tickets : []; day.soldSpots = day.soldSpots && typeof day.soldSpots === 'object' ? day.soldSpots : {}; day.selectedSpot = day.selectedSpot || ''; day.report = day.report || '';
    value.days[key] = day;
  });
  if (!value.days[value.activeDay]) value.activeDay = Object.keys(value.days)[0];
  value.nextDayNumber = Math.max(Number(value.nextDayNumber) || 2, Object.keys(value.days).length + 1);
  return value;
}
const gcIcState = gcIcLoadState();
function gcIcActiveDay() {
  if (!gcIcState.days[gcIcState.activeDay]) gcIcState.days[gcIcState.activeDay] = gcIcNewDay();
  const day=gcIcState.days[gcIcState.activeDay];
  for(const [key,value] of Object.entries(gcIcNewDay()))if(day[key]===undefined)day[key]=value;
  return day;
}
function gcIcOccupancy(day = gcIcActiveDay()) { return Math.max(0, Number(day.paid) || 0) + Math.max(0, Number(day.free) || 0); }
function gcIcFormatDayName(id) { const match = String(id).match(/ic-day-(\d+)/); return match ? `Dia ${match[1]}` : id; }
function gcIcSyncFieldsToState() {
  gcIcState.driver = $('#icDriver').value || 'Pablo';
  gcIcState.lineName = $('#icLineName').value.trim();
  gcIcState.destinations = [1,2,3,4].map((n, index) => ({ name: $(`#icDest${n}Name`).value.trim() || `Destino ${String.fromCharCode(64+n)}`, fare: Math.max(0, Number($(`#icDest${n}Fare`).value) || 0) }));
  if ($('#icDaySelect').value && gcIcState.days[$('#icDaySelect').value]) gcIcState.activeDay = $('#icDaySelect').value;
}
function gcIcSave() { gcIcSyncFieldsToState(); return gcSafeWrite(GC_IC_STORAGE_KEY, gcIcState); }
function gcIcPopulateDays() {
  const select = $('#icDaySelect');
  const entries = Object.keys(gcIcState.days).sort((a,b) => Number(a.replace('ic-day-','')) - Number(b.replace('ic-day-','')));
  select.innerHTML = entries.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(gcIcFormatDayName(id))}</option>`).join('');
  if (!gcIcState.days[gcIcState.activeDay]) gcIcState.activeDay = entries[0] || 'ic-day-1';
  select.value = gcIcState.activeDay;
}
function gcIcDestinations() { return [1,2,3,4].map((n, index) => ({ index: n, name: $(`#icDest${n}Name`).value.trim() || `Destino ${String.fromCharCode(64+n)}`, fare: Math.max(0, Number($(`#icDest${n}Fare`).value) || 0) })); }
function gcIcGetSelectedDestination() { const n = Math.max(1, Math.min(4, Number($('#icTicketDestination').value) || 1)); return gcIcDestinations()[n-1]; }
function gcIcUpdateTerminalDisplay(message = null, status = null) {
  const destination = gcIcGetSelectedDestination();
  $('#icTerminalAmount').value = money(destination.fare);
  $('#icPosAmount').textContent = money(destination.fare);
  if (status !== null) $('#icPosStatus').textContent = status;
  if (message !== null) $('#icPosMessage').textContent = message;
  else {
    const selected = gcIcActiveDay().selectedSpot;
    $('#icPosMessage').textContent = selected ? `Posição selecionada: ${selected}. Pronta para venda.` : 'Selecione o trecho e uma posição livre para iniciar.';
  }
}
function gcIcSpotMarkup(spot, standing, day) {
  const sold = Boolean(day.soldSpots[spot]); const selected = day.selectedSpot === spot; const cls = `${standing ? 'standing-place' : 'seat-place'}${sold ? ' sold' : selected ? ' chosen' : ''}`;
  const stateLabel = sold ? 'VENDIDA' : selected ? 'SELECIONADA' : standing ? 'LIVRE EM PÉ' : 'LIVRE';
  return `<button class="${cls}" type="button" data-ic-spot="${spot}" aria-label="${standing ? 'Posição em pé' : 'Poltrona'} ${spot}${sold ? ', vendida' : ''}" ${sold ? 'disabled' : ''}><span>${spot}</span><small>${stateLabel}</small></button>`;
}
function gcIcRenderSeats() {
  const day = gcIcActiveDay(); let rows = '<div class="seat-map-front">FRENTE DO ÔNIBUS · MOTORISTA</div>';
  for (let row = 0; row < 11; row++) {
    const nums = [row*4+1, row*4+2, row*4+3, row*4+4];
    rows += `<div class="seat-row">${gcIcSpotMarkup(`S${String(nums[0]).padStart(2,'0')}`, false, day)}${gcIcSpotMarkup(`S${String(nums[1]).padStart(2,'0')}`, false, day)}<div class="seat-aisle">${row===5?'CORREDOR':'│'}</div>${gcIcSpotMarkup(`S${String(nums[2]).padStart(2,'0')}`, false, day)}${gcIcSpotMarkup(`S${String(nums[3]).padStart(2,'0')}`, false, day)}</div>`;
  }
  $('#icSeatMap').innerHTML = rows;
  $('#icStandingMap').innerHTML = Array.from({length: GC_IC_STANDING_CAPACITY}, (_, index) => gcIcSpotMarkup(`E${String(index+1).padStart(2,'0')}`, true, day)).join('');
  const selected = day.selectedSpot;
  if (!selected) $('#icSeatStatus').textContent = `Selecione uma posição livre. Capacidade total: ${GC_IC_SEATED_CAPACITY} sentados + ${GC_IC_STANDING_CAPACITY} em pé = ${GC_IC_TOTAL_CAPACITY} passageiros.`;
  else $('#icSeatStatus').textContent = `${selected.startsWith('E') ? 'Posição para passageiro em pé' : 'Poltrona'} ${selected} selecionada. ${gcIcOccupancy(day)}/${GC_IC_TOTAL_CAPACITY} passageiros registrados.`;
  $('#icSeatStatus').classList.toggle('notice-warning', Boolean(selected && day.soldSpots[selected]));
}
function gcIcRenderCounters() {
  const day = gcIcActiveDay(); const total = gcIcOccupancy(day);
  $('#icPaidCount').textContent = String(day.paid); $('#icFreeCount').textContent = String(day.free); $('#icTotalCount').textContent = String(total); $('#icTurnstileCount').textContent = String(day.turnstile);
  $('#icPaidCounterDisplay').textContent = String(day.paid); $('#icFreeCounterDisplay').textContent = String(day.free);
  // Keep controls clickable at capacity so the user receives an explanation instead of a dead button.
  $('#icPaidPlus').disabled = false; $('#icFreePlus').disabled = false;
  $('#icTicketForm button[type="submit"]').disabled = false;
  const capacityHint = $('#icCapacityHint');
  if (capacityHint) {
    const full = total >= GC_IC_TOTAL_CAPACITY;
    capacityHint.textContent = full
      ? `Lotação máxima atingida (${total}/${GC_IC_TOTAL_CAPACITY}). Use − para corrigir a contagem ou crie outro dia para começar uma nova operação.`
      : `Ocupação atual: ${total}/${GC_IC_TOTAL_CAPACITY}. Restam ${GC_IC_TOTAL_CAPACITY-total} lugares para o limite simulado (44 sentados + 36 em pé).`;
    capacityHint.classList.toggle('notice-warning', full);
  }
}
function gcIcMakeReport() {
  const day = gcIcActiveDay(), sales = day.tickets || [], revenue = sales.reduce((sum, ticket) => sum + Number(ticket.fare || 0), 0);
  return [
    'GRUPO CONECT — FECHAMENTO INTERMUNICIPAL (SIMULAÇÃO)', `Dia de operação: ${gcIcFormatDayName(gcIcState.activeDay)}`,
    `Data do fechamento: ${new Date().toLocaleString('pt-BR')}`, `Motorista: ${gcIcState.driver || 'Não informado'}`,
    `Linha: ${gcIcState.lineName || 'Não informada'}`, `Pagantes registrados: ${day.paid}`, `Gratuidades: ${day.free}`,
    `Total de passageiros registrados: ${gcIcOccupancy(day)}/${GC_IC_TOTAL_CAPACITY}`, `Contador físico simulado da catraca: ${day.turnstile}`,
    `Passagens vendidas no sistema: ${sales.length}`, `Arrecadação das vendas fictícias: ${money(revenue)}`,
    '', 'PASSAGENS FICTÍCIAS', ...(sales.length ? sales.map((ticket) => `${ticket.serial} | ${ticket.createdAt ? gcFormatDate(ticket.createdAt) : ''} | ${ticket.destination} | ${ticket.spot} | ${money(ticket.fare)} | ${ticket.payment} | ${ticket.passenger || 'Sem nome'}`) : ['Nenhuma passagem vendida neste dia.']),
    '', 'Este relatório pertence a um simulador e não comprova transporte ou pagamento real.'
  ].join('\n');
}
function gcIcRenderSummary() {
  const day = gcIcActiveDay(), sales = day.tickets || [], revenue = sales.reduce((sum, ticket) => sum + Number(ticket.fare || 0), 0);
  const cards = [ ['Pagantes', day.paid], ['Gratuidades', day.free], ['A bordo', `${gcIcOccupancy(day)}/${GC_IC_TOTAL_CAPACITY}`], ['Vendas fictícias', sales.length], ['Arrecadação fictícia', money(revenue)], ['Poltronas vendidas', Object.keys(day.soldSpots).filter((spot) => spot.startsWith('S')).length], ['Posições em pé vendidas', Object.keys(day.soldSpots).filter((spot) => spot.startsWith('E')).length], ['Catraca', day.turnstile] ];
  $('#icDaySummary').innerHTML = cards.map(([label, value]) => `<article class="tool-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`).join('');
  $('#icTicketHistory').innerHTML = sales.length ? sales.slice().reverse().map((ticket) => `<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(ticket.serial)} · ${escapeHtml(ticket.destination)}</strong><small>${escapeHtml(ticket.spot)} · ${money(Number(ticket.fare)||0)} · ${escapeHtml(ticket.payment)}</small><small>${escapeHtml(ticket.passenger || 'Passageiro não identificado')} · ${escapeHtml(gcFormatDate(ticket.createdAt))}</small></div><span class="record-inline-tag">APROVADA · SIMULAÇÃO</span></div></article>`).join('') : '<div class="empty-state"><span class="empty-icon">🎟️</span><strong>Nenhuma passagem neste dia</strong><span>As vendas fictícias aparecerão aqui após o processamento.</span></div>';
  if (day.report) { $('#icReportOutput').hidden = false; $('#icReportOutput').textContent = day.report; }
  else { $('#icReportOutput').hidden = true; $('#icReportOutput').textContent = ''; }
}
function gcIcRenderIntercity() {
  gcIcPopulateDays();
  $('#icDriver').value = gcIcState.driver || 'Pablo'; $('#icLineName').value = gcIcState.lineName || '';
  gcIcPopulateTripVehicleFields();
  gcIcState.destinations.forEach((dest, index) => { const n = index+1; $(`#icDest${n}Name`).value = dest.name || `Destino ${String.fromCharCode(64+n)}`; $(`#icDest${n}Fare`).value = String(Math.max(0, Number(dest.fare)||0)); });
  const day = gcIcActiveDay();
  gcIcRenderSeats(); gcIcRenderCounters(); gcIcRenderSummary(); gcIcUpdateTerminalDisplay();gcIcUpdateTripStartStatus();
  $('#intercityScreen').dataset.independent = 'true';
  if (day.report) { $('#icReportOutput').hidden = false; $('#icReportOutput').textContent = day.report; }
}
function gcIcPopulateTripVehicleFields(){
  const companySelect=$('#icTripCompany'),modelSelect=$('#icTripModel'),prefixSelect=$('#icTripPrefix');if(!companySelect||!modelSelect||!prefixSelect)return;
  const company=companySelect.value;const previousModel=modelSelect.value,previousPrefix=prefixSelect.value;
  const models=company?mergeCompanyFleet(company):[];
  modelSelect.innerHTML='<option value="">Selecione o modelo</option>'+models.map(x=>`<option value="${escapeHtml(x.model)}">${escapeHtml(x.model)}</option>`).join('');modelSelect.disabled=!models.length;
  if(models.some(x=>x.model===previousModel))modelSelect.value=previousModel;else modelSelect.value=models[0]?.model||'';
  const picked=models.find(x=>x.model===modelSelect.value);const prefixes=picked?.prefixes||[];
  prefixSelect.innerHTML='<option value="">Selecione o prefixo</option>'+prefixes.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');prefixSelect.disabled=!prefixes.length;
  prefixSelect.value=prefixes.includes(previousPrefix)?previousPrefix:(prefixes[0]||'');
}
function gcIcUpdateTripStartStatus(){const day=gcIcActiveDay();const status=$('#icTripStatus');if(!status)return;const started=Boolean(day.tripStarted);$('#icStartTripButton').disabled=started;$('#icEndTripButton').disabled=!started;status.textContent=started?`VIAGEM INICIADA · ${day.tripCompany||''} · ${day.tripModel||''} prefixo ${day.tripPrefix||''} · motorista ${day.tripDriver||gcIcState.driver} · partida ${new Date(day.tripStartAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}. Passe pelo botão “Encerrar viagem” ao finalizar.`:'Antes da partida, escolha empresa, modelo e prefixo. O motorista precisa validar o cartão funcional.';status.classList.toggle('allowed',started);}
function gcIcCommitStartTrip(p,validatorLogId){
  const day=gcIcActiveDay();if(day.tripStarted){showToast('Já existe uma viagem aberta neste dia intermunicipal. Encerre antes de iniciar outra.');switchScreen('intercityScreen');return;}
  day.tripStarted=true;day.tripStartAt=new Date().toISOString();day.tripDriver=p.driver;day.tripCompany=p.company;day.tripModel=p.model;day.tripPrefix=p.prefix;day.tripValidatorLogId=validatorLogId;gcIcSave();gcIcRenderIntercity();switchScreen('intercityScreen');showToast('Validador autorizou a viagem intermunicipal.');
}
$('#icTripCompany').addEventListener('change',gcIcPopulateTripVehicleFields);
$('#icTripModel').addEventListener('change',gcIcPopulateTripVehicleFields);
$('#icStartTripButton').addEventListener('click',()=>{
  const day=gcIcActiveDay();if(day.tripStarted){showToast('A viagem atual já está iniciada.');return;}
  const company=$('#icTripCompany').value,model=$('#icTripModel').value,prefix=$('#icTripPrefix').value,driver=$('#icDriver').value,line=$('#icLineName').value.trim();
  if(!line){showToast('Informe o nome da linha intermunicipal antes da partida.');$('#icLineName').focus();return;}
  if(!company||!model||!prefix){showToast('Selecione empresa, modelo e prefixo do ônibus intermunicipal.');return;}
  const bus=mergeCompanyFleet(company).find(x=>x.model===model);if(!bus||!bus.prefixes.map(String).includes(String(prefix))){showToast('O prefixo não corresponde ao modelo escolhido.');return;}
  const reservation=typeof gcOnlineBusReservationReason==='function'?gcOnlineBusReservationReason({company,prefix,model},dateTodayLocal()):null;if(reservation){showToast(`Ônibus indisponível: ${reservation.message}`);return;}
  const pool=availableBusPool(company,dateTodayLocal(),'',line);if(!pool.some(x=>norm(x.prefix)===norm(prefix))){showToast('Este prefixo está reservado em outra viagem ou escala para hoje. Escolha outro ônibus.');return;}
  gcIcSyncFieldsToState();gcValidatorOpen({type:'intercity',driver,company,model,prefix,city:'Intermunicipal',line});
});
$('#icEndTripButton').addEventListener('click',()=>{const day=gcIcActiveDay();if(!day.tripStarted){showToast('Não há uma viagem aberta para encerrar.');return;}day.tripStarted=false;day.tripEndedAt=new Date().toISOString();gcIcSave();gcIcRenderIntercity();showToast('Viagem intermunicipal encerrada e registrada no histórico de partida.');});

function gcIcSelectSpot(spot) {
  const day = gcIcActiveDay();
  if (day.soldSpots[spot]) { showToast('Esta posição já está vendida neste dia.'); return; }
  day.selectedSpot = spot; gcIcSave(); gcIcRenderSeats(); $('#icPosScreen').classList.remove('approved');
  gcIcUpdateTerminalDisplay(`${spot.startsWith('E') ? 'Passageiro em pé' : 'Poltrona'} ${spot} selecionada.`, 'AGUARDANDO PAGAMENTO');
  $('#icTicketReceipt').hidden = true;
}
function gcIcRenderFakeQr(serial) {
  let seed = Array.from(String(serial)).reduce((total, char) => (total*31 + char.charCodeAt(0)) >>> 0, 7);
  const bits = [];
  for (let i=0; i<169; i++) { seed = (seed*1664525 + 1013904223) >>> 0; bits.push((seed >>> 27) % 2 === 1); }
  // Fixed finder-like corners improve the appearance of the fictional QR image.
  const setFinder = (ox, oy) => { for (let y=0; y<5; y++) for (let x=0; x<5; x++) bits[(oy+y)*13+ox+x] = x===0 || x===4 || y===0 || y===4 || (x>=2 && x<=2 && y>=2 && y<=2); };
  setFinder(0,0); setFinder(8,0); setFinder(0,8);
  $('#icFakeQr').innerHTML = bits.map((on) => `<span class="${on?'on':''}"></span>`).join('');
}
function gcIcShowTicket(ticket) {
  $('#icTicketReceiptTitle').textContent = `Passagem Grupo Conect · ${ticket.serial}`;
  const fields = [ ['Status','PAGAMENTO APROVADO (SIMULAÇÃO)'], ['Linha',gcIcState.lineName || 'Linha intermunicipal'], ['Destino',ticket.destination], ['Posição',ticket.spot], ['Valor',money(ticket.fare)], ['Pagamento',ticket.payment], ['Passageiro',ticket.passenger || 'Não identificado'], ['Dia',gcIcFormatDayName(gcIcState.activeDay)], ['Horário',gcFormatDate(ticket.createdAt)] ];
  $('#icTicketReceiptFields').innerHTML = fields.map(([label, value]) => `<div class="ticket-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('');
  gcIcRenderFakeQr(ticket.serial); $('#icTicketReceipt').hidden = false;
  gcIcUpdateTerminalDisplay(`PAGAMENTO APROVADO! Bilhete ${ticket.serial}.`, '✓ APROVADO');
  $('#icPosScreen')?.classList.add('approved');
  $('#icTerminalInstruction').textContent = `Venda aprovada na simulação. Bilhete ${ticket.serial} registrado no ${gcIcFormatDayName(gcIcState.activeDay)}.`;
}
function gcIcSellTicket() {
  gcIcSyncFieldsToState();
  const day = gcIcActiveDay(); const destination = gcIcGetSelectedDestination(); const spot = day.selectedSpot;
  if (!spot) { gcIcUpdateTerminalDisplay('Selecione primeiro uma poltrona ou uma posição em pé.', 'SELECIONE A POSIÇÃO'); showToast('Selecione uma posição livre no mapa antes de vender.'); return; }
  if (day.soldSpots[spot]) { day.selectedSpot = ''; gcIcSave(); gcIcRenderSeats(); gcIcUpdateTerminalDisplay('A posição selecionada já foi vendida.', 'POSIÇÃO INDISPONÍVEL'); showToast('Escolha outra posição livre.'); return; }
  if (gcIcOccupancy(day) >= GC_IC_TOTAL_CAPACITY) { gcIcUpdateTerminalDisplay('Lotação simulada atingida: 80 passageiros.', 'CAPACIDADE ESGOTADA'); showToast('Capacidade máxima de 80 passageiros atingida.'); return; }
  if (destination.fare < 0 || !Number.isFinite(destination.fare)) { showToast('Confira a tarifa selecionada.'); return; }
  const ticket = { id: gcMakeId('ticket'), serial: `GC${Date.now().toString().slice(-8)}`, spot, destination: destination.name, fare: destination.fare, payment: $('#icPaymentMethod').value, passenger: $('#icPassengerName').value.trim(), createdAt: new Date().toISOString() };
  day.tickets.push(ticket); day.soldSpots[spot] = ticket.id; day.paid += 1; day.turnstile += 1; day.selectedSpot = ''; day.report = '';
  if (!gcIcSave()) return;
  $('#icPassengerName').value = '';
  gcIcRenderSeats(); gcIcRenderCounters(); gcIcRenderSummary(); gcIcShowTicket(ticket);
  $('#icPosScreen').classList.add('approved'); showToast('Pagamento aprovado na simulação; passagem registrada.');
}
$('#icDaySelect').addEventListener('change', () => {
  gcIcSyncFieldsToState(); gcIcState.activeDay = $('#icDaySelect').value; gcIcSave();
  $('#icTicketReceipt').hidden = true; gcIcRenderIntercity();
});
$('#icAddDay').addEventListener('click', () => {
  gcIcSyncFieldsToState();
  const n = Math.max(1, Number(gcIcState.nextDayNumber)||2); const id = `ic-day-${n}`;
  gcIcState.days[id] = gcIcNewDay(); gcIcState.nextDayNumber = n + 1; gcIcState.activeDay = id;
  gcIcPopulateDays(); gcIcSave(); gcIcRenderIntercity();
  $('#icTicketReceipt').hidden = true; showToast(`${gcIcFormatDayName(id)} criado, sem apagar os registros dos dias anteriores.`);
});
['icDriver','icLineName','icDest1Name','icDest2Name','icDest3Name','icDest4Name','icDest1Fare','icDest2Fare','icDest3Fare','icDest4Fare'].forEach((id) => {
  const el = $('#'+id); el.addEventListener('input', () => { gcIcSave(); gcIcUpdateTerminalDisplay(); });
  el.addEventListener('change', () => { gcIcSave(); gcIcUpdateTerminalDisplay(); });
});
$('#icTicketDestination').addEventListener('change', () => gcIcUpdateTerminalDisplay());
$('#icSeatMap').addEventListener('click', (event) => { const button = event.target.closest('[data-ic-spot]'); if (button && button.dataset.icSpot.startsWith('S')) gcIcSelectSpot(button.dataset.icSpot); });
$('#icStandingMap').addEventListener('click', (event) => { const button = event.target.closest('[data-ic-spot]'); if (button && button.dataset.icSpot.startsWith('E')) gcIcSelectSpot(button.dataset.icSpot); });
function gcIcAdjustCounter(kind, direction) {
  const day = gcIcActiveDay(); const total = gcIcOccupancy(day);
  if (direction > 0 && total >= GC_IC_TOTAL_CAPACITY) { showToast('Capacidade máxima de 80 passageiros atingida.'); return; }
  const key = kind === 'paid' ? 'paid' : 'free';
  if (direction < 0 && day[key] <= 0) return;
  day[key] = Math.max(0, day[key] + direction);
  if (direction > 0) day.turnstile += 1;
  day.report = ''; gcIcSave(); gcIcRenderCounters(); gcIcRenderSummary(); gcIcRenderSeats();
}
$('#icPaidPlus').addEventListener('click', () => gcIcAdjustCounter('paid',1));
$('#icPaidMinus').addEventListener('click', () => gcIcAdjustCounter('paid',-1));
$('#icFreePlus').addEventListener('click', () => gcIcAdjustCounter('free',1));
$('#icFreeMinus').addEventListener('click', () => gcIcAdjustCounter('free',-1));
$('#icTicketForm').addEventListener('submit', (event) => { event.preventDefault(); gcIcSellTicket(); });
$('#icPosTapCard').addEventListener('click', () => { if ($('#icTicketForm').requestSubmit) $('#icTicketForm').requestSubmit(); else gcIcSellTicket(); });
$('#icHideTicket').addEventListener('click', () => { $('#icTicketReceipt').hidden = true; $('#icPosScreen').classList.remove('approved'); gcIcUpdateTerminalDisplay('Selecione o trecho e uma posição livre para iniciar.', 'PRONTA PARA VENDA'); });
$('#icPrintTicket').addEventListener('click', () => {
  const fields = Array.from($('#icTicketReceiptFields').querySelectorAll('.ticket-field')).map((field) => `<tr><th>${escapeHtml(field.querySelector('span')?.textContent || '')}</th><td>${escapeHtml(field.querySelector('strong')?.textContent || '')}</td></tr>`).join('');
  const w = window.open('', '_blank', 'width=650,height=800');
  if (!w) { showToast('Permita pop-ups para imprimir ou salvar a passagem como PDF.'); return; }
  w.opener = null; w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Passagem Grupo Conect</title><style>body{font:14px Arial;color:#172d3d;margin:24px}h1{font-size:22px}p{color:#18744f;font-weight:bold}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce5e9}th{color:#627581;width:35%}small{font-size:10px;color:#6d7f89}@media print{button{display:none}}</style><h1>Grupo Conect — Passagem</h1><p>✓ APROVADO — SIMULAÇÃO FICTÍCIA</p><table>${fields}</table><small>Documento ilustrativo. Nenhuma cobrança real foi realizada; não é válido para embarque.</small><p><button onclick="window.print()">Imprimir / Salvar PDF</button></p></html>`); w.document.close();
});
$('#icFinishDay').addEventListener('click', () => {
  gcIcSyncFieldsToState(); const day = gcIcActiveDay(); day.closedAt = new Date().toISOString(); day.report = gcIcMakeReport();
  gcIcSave(); gcIcRenderSummary(); $('#icReportOutput').hidden = false; $('#icReportOutput').textContent = day.report; showToast(`${gcIcFormatDayName(gcIcState.activeDay)} finalizado; relatório gerado.`);
});
$('#icCopyDayReport').addEventListener('click', async () => {
  gcIcSyncFieldsToState(); const report = gcIcActiveDay().report || gcIcMakeReport();
  showToast(await copyText(report) ? 'Relatório intermunicipal copiado.' : 'Não foi possível copiar automaticamente.');
});
$('#icDownloadDayReport').addEventListener('click', () => {
  gcIcSyncFieldsToState(); const report = gcIcActiveDay().report || gcIcMakeReport();
  downloadTextFile(`grupo-conect-intermunicipal-${gcIcState.activeDay}.txt`, report, 'text/plain;charset=utf-8'); showToast('Relatório TXT baixado.');
});
gcIcRenderIntercity();


/* Atendimento Online: turismo, fretamento e escolar com clientes simulados do Brasil. */
const GC_ONLINE_STORAGE_KEY = 'grupoConect.onlineFretamento.v1';
const GC_ONLINE_CASH_SOURCE = 'onlineFretamento';
const GC_ONLINE_DIESEL_DEFAULT = 7.99;
let gcOnlineSelectedLeadId = null;
let gcOnlineActiveTab = 'clients';
let gcOnlineCurrentState = null;

const GC_ONLINE_REGIONS = [
  {city:'Três Rios',state:'RJ',lat:-22.116,lon:-43.209},
  {city:'Rio de Janeiro',state:'RJ',lat:-22.906,lon:-43.172},
  {city:'Petrópolis',state:'RJ',lat:-22.505,lon:-43.178},
  {city:'Nova Friburgo',state:'RJ',lat:-22.282,lon:-42.531},
  {city:'Juiz de Fora',state:'MG',lat:-21.760,lon:-43.350},
  {city:'Belo Horizonte',state:'MG',lat:-19.916,lon:-43.934},
  {city:'Uberlândia',state:'MG',lat:-18.918,lon:-48.277},
  {city:'São Paulo',state:'SP',lat:-23.551,lon:-46.633},
  {city:'Campinas',state:'SP',lat:-22.906,lon:-47.061},
  {city:'Santos',state:'SP',lat:-23.961,lon:-46.333},
  {city:'Vitória',state:'ES',lat:-20.315,lon:-40.312},
  {city:'Curitiba',state:'PR',lat:-25.428,lon:-49.273},
  {city:'Londrina',state:'PR',lat:-23.305,lon:-51.169},
  {city:'Florianópolis',state:'SC',lat:-27.595,lon:-48.548},
  {city:'Porto Alegre',state:'RS',lat:-30.034,lon:-51.217},
  {city:'Brasília',state:'DF',lat:-15.794,lon:-47.883},
  {city:'Goiânia',state:'GO',lat:-16.687,lon:-49.264},
  {city:'Salvador',state:'BA',lat:-12.977,lon:-38.501},
  {city:'Recife',state:'PE',lat:-8.047,lon:-34.878},
  {city:'Fortaleza',state:'CE',lat:-3.732,lon:-38.527},
  {city:'Manaus',state:'AM',lat:-3.119,lon:-60.021},
  {city:'Belém',state:'PA',lat:-1.455,lon:-48.502},
  {city:'Campo Grande',state:'MS',lat:-20.469,lon:-54.620},
  {city:'Cuiabá',state:'MT',lat:-15.601,lon:-56.097},
  {city:'Natal',state:'RN',lat:-5.794,lon:-35.211},
  {city:'João Pessoa',state:'PB',lat:-7.119,lon:-34.845},
  {city:'Maceió',state:'AL',lat:-9.650,lon:-35.708},
  {city:'São Luís',state:'MA',lat:-2.530,lon:-44.306}
];
const GC_ONLINE_CLIENT_SEEDS = [
  {name:'Colégio Horizonte',type:'Turismo escolar'},
  {name:'Instituto Caminhos do Saber',type:'Turismo escolar'},
  {name:'Escola Sementes do Futuro',type:'Turismo escolar'},
  {name:'Colégio Integração',type:'Turismo escolar'},
  {name:'Escola Mundo Novo',type:'Turismo escolar'},
  {name:'Centro Educacional Prisma',type:'Turismo escolar'},
  {name:'Universidade Central',type:'Turismo escolar'},
  {name:'Secretaria de Educação Regional',type:'Turismo escolar'},
  {name:'Clube Esportivo União',type:'Fretamento'},
  {name:'Associação Atlética Nacional',type:'Fretamento'},
  {name:'Alpha Tecnologia',type:'Fretamento'},
  {name:'Grupo Logística Brasil',type:'Fretamento'},
  {name:'Metalúrgica Vale Verde',type:'Fretamento'},
  {name:'Cooperativa Saúde Vida',type:'Fretamento'},
  {name:'Hospital Regional',type:'Fretamento'},
  {name:'Indústria Caminho Forte',type:'Fretamento'},
  {name:'Hotel Serra Azul',type:'Turismo'},
  {name:'Agência Rota Brasil',type:'Turismo'},
  {name:'Agência Viaje Mais',type:'Turismo'},
  {name:'Turismo Raízes do Brasil',type:'Turismo'},
  {name:'Associação Cultural Brasil',type:'Turismo'},
  {name:'Organização Celebra Eventos',type:'Fretamento'},
  {name:'Comunidade Esperança',type:'Turismo'},
  {name:'Paróquia São Lucas',type:'Turismo'},
  {name:'Família Ferreira',type:'Turismo'},
  {name:'Família Oliveira',type:'Turismo'},
  {name:'Família Santos',type:'Turismo'},
  {name:'Produtora Palco Vivo',type:'Fretamento'},
  {name:'Centro de Convenções Metropolitano',type:'Fretamento'},
  {name:'Associação de Guias e Excursões',type:'Turismo'},
  {name:'Prefeitura Municipal',type:'Contrato de fretamento'},
  {name:'Secretaria Municipal de Educação',type:'Contrato de fretamento'},
  {name:'Prefeitura / Secretaria de Turismo',type:'Contrato de fretamento'},
  {name:'Consórcio Intermunicipal de Saúde',type:'Contrato de fretamento'},
  {name:'Empresa Pública de Serviços Urbanos',type:'Contrato de fretamento'},
  {name:'Consórcio Municipal de Cultura',type:'Contrato de fretamento'},
  {name:'Rede Hospitalar Vida',type:'Contrato de fretamento'},
  {name:'Grupo Industrial Vale do Paraíba',type:'Contrato de fretamento'},
  {name:'Centro de Distribuição Nacional',type:'Contrato de fretamento'},
  {name:'Universidade Regional Integrada',type:'Contrato de fretamento'},
  {name:'Secretaria Regional de Educação',type:'Contrato de fretamento'},
  {name:'Complexo Industrial Sudeste',type:'Contrato de fretamento'},
  {name:'Operadora de Transporte de Funcionários',type:'Contrato de fretamento'},
  {name:'Cooperativa Regional de Serviços',type:'Contrato de fretamento'}
];
function gcOnlineBuildCatalog(){
  const rows=[]; let id=1;
  GC_ONLINE_CLIENT_SEEDS.forEach((seed,seedIndex)=>GC_ONLINE_REGIONS.forEach((region,regionIndex)=>{
    let destIndex=(regionIndex+4+(seedIndex%7))%GC_ONLINE_REGIONS.length;
    if(destIndex===regionIndex)destIndex=(destIndex+1)%GC_ONLINE_REGIONS.length;
    const destination=GC_ONLINE_REGIONS[destIndex];
    rows.push({id:`client-${String(id).padStart(4,'0')}`,name:`${seed.name} · ${region.city}`,organization:seed.name,clientType:seed.type,city:region.city,state:region.state,origin:`${region.city}/${region.state}`,destination:`${destination.city}/${destination.state}`,originRegion:region,destinationRegion:destination});
    id++;
  }));
  return rows;
}
const GC_ONLINE_CLIENT_CATALOG = gcOnlineBuildCatalog(); // 44 perfis-base × 28 regiões = 1.232 clientes potenciais.
function gcOnlineHaversine(a,b){
  const rad=x=>x*Math.PI/180, dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);
  const v=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));
}
function gcOnlineDateAdd(iso,days){const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function gcOnlineDateGap(from,to){const a=new Date(`${from}T12:00:00`),b=new Date(`${to}T12:00:00`);if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return 0;return Math.max(0,Math.floor((b-a)/86400000));}
function gcOnlineRandomTime(min=330,max=600){const minute=Math.floor((min+Math.random()*(max-min))/15)*15;return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;}
function gcOnlinePlusTime(value,minutes){const [hh,mm]=String(value||'06:00').split(':').map(Number);const total=((hh*60+mm+(Number(minutes)||0))%1440+1440)%1440;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;}
function gcOnlineDateTimeValue(date,time){return `${date}T${time}`;}
function gcOnlineFormatDateTime(iso){if(!iso)return 'Não informado';const d=new Date(iso);return Number.isNaN(d.getTime())?String(iso):d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function gcOnlineMakeEstimate(lead,vehicleModel=''){
  const model=String(vehicleModel||'').toLocaleLowerCase('pt-BR');
  const electric=/elétric|eletric/.test(model), coach=/paradiso|viaggio|audace|spectrum road|rodovi|ideale|irizar|double|dd\b/.test(model), micro=/micro|lo-916|lo-915|9\.160|volare/.test(model), urban=/apache|torino|gran via|gran micro|neobus n10/.test(model);
  const efficiency=electric?0:(micro?3.2:coach?2.65:urban?2.35:2.5);
  const distance=Math.max(0,Number(lead.totalKm)||0),hours=Math.max(1,Number(lead.serviceHours)||1),budget=Math.max(0,Number(lead.budget)||0);
  const journeys=Math.max(1,Math.min(120,Math.round(Number(lead.monthlyTrips)||1)));
  const fuel=(electric?0:(distance/Math.max(.5,efficiency))*GC_ONLINE_DIESEL_DEFAULT)*journeys;
  const energy=(electric?distance*.48:0)*journeys;
  const driver=(hours*58+45)*journeys;
  const maintenance=distance*(coach ? 0.88 : 0.82)*journeys;
  const tolls=(distance*(lead.oneWayKm>250?.14:.08)+(lead.oneWayKm>250?95:25))*journeys;
  const serviceExtra=(lead.serviceType==='Turismo escolar'?105:(lead.serviceType==='Turismo'?175:140))*journeys;
  const contingency=(fuel+energy+maintenance+tolls)*.055;
  const total=fuel+energy+driver+maintenance+tolls+serviceExtra+contingency;
  const profit=budget-total,margin=budget>0?profit/budget*100:-100,recommended=total*1.2;
  const monthly=Number(lead.contractDurationMonths)>0;
  let verdict,level,explanation;
  if(profit<=0){verdict=monthly?'A mensalidade não cobre os custos':'Não vale a pena neste valor';level='bad';explanation=monthly?'A mensalidade oferecida não cobre os custos mensais estimados para a frequência solicitada. Negocie outro valor ou recuse.':'O orçamento não cobre os custos estimados. Negocie um valor maior ou recuse se o cliente não aceitar.';}
  else if(margin<12){verdict=monthly?'Contrato com margem apertada — negocie':'Margem apertada — negocie';level='caution';explanation='Há resultado estimado positivo, mas pouca folga para atraso, desvio, pedágio ou consumo maior que o esperado.';}
  else{verdict=monthly?'Contrato com margem estimada positiva':'Parece valer a pena';level='good';explanation='O orçamento supera os custos previstos e deixa margem estimada. Confira ônibus, capacidade e horários antes de aceitar.';}
  return {distance,hours,budget,efficiency,journeys,fuel,energy,driver,maintenance,tolls,serviceExtra,contingency,total,profit,margin,recommended,verdict,level,explanation,monthly};
}
function gcOnlineBuildProposal(state,receivedDate){
  let seen=new Set(state.seenClientIds||[]);
  let unused=GC_ONLINE_CLIENT_CATALOG.filter(x=>!seen.has(x.id));
  if(!unused.length){state.seenClientIds=[];unused=GC_ONLINE_CLIENT_CATALOG.slice();seen=new Set();}
  const profile=unused[Math.floor(Math.random()*unused.length)];
  state.seenClientIds.push(profile.id);
  const contractProfile=profile.clientType==='Contrato de fretamento';
  // Mesmo empresas listadas para contratos contínuos podem pedir um fretamento pontual.
  const recurringContract=contractProfile && Math.random()<.52;
  const originRegion=profile.originRegion;
  let destinationRegion=profile.destinationRegion;
  if(recurringContract){
    const near=GC_ONLINE_REGIONS.filter(r=>r.city!==originRegion.city && gcOnlineHaversine(originRegion,r)<=160);
    if(near.length)destinationRegion=near[Math.floor(Math.random()*near.length)];
  }
  const destination=`${destinationRegion.city}/${destinationRegion.state}`;
  const rawKm=gcOnlineHaversine(originRegion,destinationRegion)*1.25;
  const oneWayKm=recurringContract?Math.max(12,Math.round(Math.min(160,rawKm)/5)*5):Math.max(35,Math.round(rawKm/5)*5);
  const roundTrip=recurringContract?true:Math.random() < (oneWayKm > 300 ? 0.88 : 0.78);
  const totalKm=Math.round((oneWayKm*(roundTrip?2:1)+Math.max(12,oneWayKm*.07))/5)*5;
  let serviceType=profile.clientType;
  if(recurringContract)serviceType='Contrato de fretamento';
  else if(contractProfile)serviceType='Fretamento';
  else if(serviceType!=='Turismo escolar'&&Math.random()<.23)serviceType=serviceType==='Turismo'?'Fretamento':'Turismo';
  const passengers=recurringContract?15+Math.floor(Math.random()*36):(serviceType==='Turismo escolar'?25+Math.floor(Math.random()*23):serviceType==='Turismo'?12+Math.floor(Math.random()*34):18+Math.floor(Math.random()*35));
  const hours=Math.max(2,Math.round(((totalKm/51)+(recurringContract?1.8:2.6))*2)/2);
  const tripDate=gcOnlineDateAdd(receivedDate,3+Math.floor(Math.random()*43));
  const requestedDeparture=gcOnlineRandomTime(recurringContract?330:315,recurringContract?510:570);
  const requestedArrivalMinutes=Math.max(60,Math.round(oneWayKm/48*60+20));
  const requestedArrival=gcOnlinePlusTime(requestedDeparture,requestedArrivalMinutes);
  const requestedArrivalDate=gcOnlineDateAdd(tripDate,Math.floor((Number(requestedDeparture.split(':')[0])*60+Number(requestedDeparture.split(':')[1])+requestedArrivalMinutes)/1440));
  const contractDurationMonths=recurringContract?[12,18,24,24,30,36,42,48][Math.floor(Math.random()*8)]:0;
  const monthlyTrips=recurringContract?[20,22,22,24,26][Math.floor(Math.random()*5)]:1;
  const temp={oneWayKm,totalKm,serviceHours:hours,budget:0,serviceType,monthlyTrips,contractDurationMonths};
  const cost=gcOnlineMakeEstimate(temp).total;
  const offeredFactor = recurringContract ? (0.72 + Math.random()*0.62) : (0.78 + Math.random()*0.78);
  const budget=Math.max(recurringContract?Math.max(6000,cost*.76):250,Math.round((cost*offeredFactor)/(recurringContract?100:50))*(recurringContract?100:50));
  const leadNumber=Number(state.nextLeadId)||1;state.nextLeadId=leadNumber+1;
  return {id:`online-lead-${leadNumber}`,clientId:profile.id,clientName:profile.name,organization:profile.organization,clientCity:profile.city,clientState:profile.state,clientType:contractProfile&&!recurringContract?'Empresa/prefeitura':profile.clientType,origin:`${originRegion.city}/${originRegion.state}`,destination,originRegion:originRegion.city,originState:originRegion.state,destinationRegion:destinationRegion.city,destinationState:destinationRegion.state,oneWayKm,totalKm,roundTrip,serviceType,passengers,serviceDate:tripDate,requestedDeparture,requestedArrival,requestedArrivalDate,serviceHours:hours,budget,receivedDate,receivedAt:new Date().toISOString(),status:'pending',contractDurationMonths,monthlyTrips,contractServiceDays:recurringContract?['segunda','terca','quarta','quinta','sexta']:[],monthlyKm:recurringContract?totalKm*monthlyTrips:0};
}
function gcOnlineDurationLabel(months){const m=Math.max(0,Number(months)||0);if(!m)return 'serviço pontual';if(m%12===0)return `${m/12} ${m===12?'ano':'anos'} (${m} meses)`;const years=Math.floor(m/12),rest=m%12;return years?`${years} ano${years===1?'':'s'} e ${rest} mês${rest===1?'':'es'} (${m} meses)`:`${m} meses`;}
function gcOnlineMonthOffset(anchorISO,todayISO){const start=new Date(anchorISO),end=new Date(`${todayISO}T12:00:00`);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start)return 0;let months=(end.getFullYear()-start.getFullYear())*12+(end.getMonth()-start.getMonth());if(end.getDate()<start.getDate())months--;return Math.max(0,months);}
function gcOnlineAddMonthsISO(anchorISO,months){const source=new Date(anchorISO);if(Number.isNaN(source.getTime()))return dateTodayLocal();const y=source.getFullYear(),m=source.getMonth()+Number(months||0),day=source.getDate(),targetYear=y+Math.floor(m/12),targetMonth=((m%12)+12)%12,last=new Date(targetYear,targetMonth+1,0).getDate(),d=new Date(targetYear,targetMonth,Math.min(day,last),12,0,0);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function gcOnlineSyncContractReceipts(state,todayISO=dateTodayLocal()){
  const ledger=cashLedger(),existing=new Set(ledger.map(x=>String(x.id))),additions=[];
  (state.contracts||[]).filter(c=>Number(c.contractDurationMonths)>0&&c.status==='accepted').forEach(c=>{
    const duration=Math.max(1,Number(c.contractDurationMonths)||1),anchor=c.acceptedAt||c.createdAt||new Date().toISOString(),elapsed=gcOnlineMonthOffset(anchor,todayISO),periods=Math.min(duration,1+elapsed),monthlyAmount=Number(c.monthlyAmount||c.budget)||0;
    for(let period=1;period<=periods;period++){
      const id=`online-contract-cash-${c.leadId||c.id}-${period}`;
      if(existing.has(id)||!(monthlyAmount>0))continue;
      const dueDate=period===1?gcOnlineLocalDatePart(anchor):gcOnlineAddMonthsISO(anchor,period-1);
      additions.push({id,date:dueDate,direction:'in',category:'Mensalidade de contrato de fretamento',amount:monthlyAmount,description:`Mensalidade ${period}/${duration} · ${c.clientName} · ${c.origin} → ${c.destination} · ${c.company} · ${c.model} prefixo ${c.prefix} · prazo total ${gcOnlineDurationLabel(duration)}`,createdAt:new Date().toISOString(),auto:true,source:GC_ONLINE_CASH_SOURCE,onlineLeadId:c.leadId||c.id,onlineContractPeriod:period,onlineContractDurationMonths:duration});
      existing.add(id);
    }
  });
  if(additions.length&&writeArrayKey(CASH_LEDGER_KEY,[...ledger,...additions])){if($('#cashSummary')){renderCashDashboard();renderFinanceList();}return additions.length;}
  return 0;
}
function gcOnlineLoadState(){
  try{const raw=JSON.parse(localStorage.getItem(GC_ONLINE_STORAGE_KEY)||'null');if(raw&&typeof raw==='object'&&!Array.isArray(raw))return {version:1,initialized:false,lastCheckedDate:'',lastManualCheckAt:0,nextLeadId:1,leads:[],contracts:[],seenClientIds:[],...raw,leads:Array.isArray(raw.leads)?raw.leads:[],contracts:Array.isArray(raw.contracts)?raw.contracts:[],seenClientIds:Array.isArray(raw.seenClientIds)?raw.seenClientIds:[]};}catch(e){}
  return {version:1,initialized:false,lastCheckedDate:'',lastManualCheckAt:0,nextLeadId:1,leads:[],contracts:[],seenClientIds:[]};
}
function gcOnlineSaveState(state){try{state.leads=(state.leads||[]).slice(-1200);state.contracts=(state.contracts||[]).slice(-1200);state.seenClientIds=(state.seenClientIds||[]).slice(-600);localStorage.setItem(GC_ONLINE_STORAGE_KEY,JSON.stringify(state));gcOnlineCurrentState=state;return true;}catch(e){showToast('Não foi possível salvar o Atendimento Online. Libere espaço no armazenamento do navegador.');return false;}}
function gcOnlineSyncArrivals(manual=false){
  const state=gcOnlineLoadState(),today=dateTodayLocal();let newCount=0;
  if(!state.initialized){state.initialized=true;state.lastCheckedDate=today;state.initializedAt=new Date().toISOString();for(let i=0;i<4;i++){const lead=gcOnlineBuildProposal(state,today);lead.receivedDate=gcOnlineDateAdd(today,-(3-i));lead.receivedAt=new Date(`${lead.receivedDate}T${String(9+i*2).padStart(2,'0')}:20:00`).toISOString();state.leads.push(lead);newCount++;}state.lastManualCheckAt=Date.now();}
  else{
    const gap=Math.min(180,gcOnlineDateGap(state.lastCheckedDate||today,today));
    for(let offset=gap;offset>0;offset--){const day=gcOnlineDateAdd(today,-offset);if(Math.random()<.57){let n=1+(Math.random()<.28?1:0)+(Math.random()<.07?1:0);for(let i=0;i<n;i++){state.leads.push(gcOnlineBuildProposal(state,day));newCount++;}}}
    if(gap>0)state.lastCheckedDate=today;
    const elapsed=Date.now()-(Number(state.lastManualCheckAt)||0);
    if(manual&&newCount===0&&elapsed>4*60*60*1000&&Math.random()<.22&&state.leads.filter(x=>x.status==='pending').length<35){state.leads.push(gcOnlineBuildProposal(state,today));newCount++;}
    if(manual)state.lastManualCheckAt=Date.now();
  }
  state.lastCheckedDate=today;const recurringReceipts=gcOnlineSyncContractReceipts(state,today);gcOnlineSaveState(state);return {state,newCount,recurringReceipts};
}
function gcOnlinePending(){return (gcOnlineCurrentState?.leads||[]).filter(x=>x.status==='pending').sort((a,b)=>String(b.receivedDate).localeCompare(String(a.receivedDate))||String(b.id).localeCompare(String(a.id)));}
function gcOnlineFindLead(id){return (gcOnlineCurrentState?.leads||[]).find(x=>x.id===id)||null;}
function gcOnlineMoneyRow(label,value){return `<div class="gc-cost-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(money(Number(value)||0))}</strong></div>`;}
function gcOnlineVerdictMarkup(estimate){return `<div class="gc-profit-verdict ${estimate.level}"><strong>${escapeHtml(estimate.verdict)} · ${escapeHtml(money(estimate.profit))}</strong><p>${escapeHtml(estimate.explanation)} Margem estimada: ${numberPt(estimate.margin,1)}%. Valor sugerido para margem de 20%: ${money(estimate.recommended)}.</p></div>`;}
function gcOnlineLeadMarkup(lead){
  const est=gcOnlineMakeEstimate(lead),statusText=est.level==='good'?'Boa margem estimada':est.level==='caution'?'Vale negociar':'Risco de prejuízo',isContract=Number(lead.contractDurationMonths)>0;
  const term=isContract?`<br><strong>Contrato solicitado pelo cliente:</strong> ${escapeHtml(gcOnlineDurationLabel(lead.contractDurationMonths))} · ${Number(lead.monthlyTrips)||22} jornadas/mês` :'';
  return `<article class="gc-lead-card"><div class="gc-lead-card-top"><div><strong class="gc-lead-client">${escapeHtml(lead.clientName)}</strong><span class="gc-lead-location">${escapeHtml(lead.clientCity||lead.originRegion)}/${escapeHtml(lead.clientState||lead.originState)} · recebido ${escapeHtml(displayDateValue(lead.receivedDate))}</span></div><span class="gc-service-pill">${escapeHtml(lead.serviceType)}</span></div><div class="gc-lead-route"><strong>${escapeHtml(lead.origin)}</strong> → <strong>${escapeHtml(lead.destination)}</strong><br>${escapeHtml(displayDateValue(lead.serviceDate))} · saída ${escapeHtml(lead.requestedDeparture)} · previsão destino ${escapeHtml(displayDateValue(lead.requestedArrivalDate||lead.serviceDate))} ${escapeHtml(lead.requestedArrival)} · ${lead.passengers} passageiros${term}</div><div class="gc-lead-budget"><div><small>${isContract?'Mensalidade oferecida':'Orçamento do cliente'}</small><strong>${escapeHtml(money(lead.budget))}${isContract?'<small> / mês</small>':''}</strong></div><div style="text-align:right"><small>${isContract?'Resultado mensal estimado':'Resultado estimado'}</small><strong class="${est.profit>=0?'positive':'negative'}">${escapeHtml(money(est.profit))}</strong></div></div><div class="gc-lead-card-bottom"><span class="gc-lead-status ${est.level}">${escapeHtml(statusText)}</span><button type="button" class="gc-mini-button" data-online-view="${escapeHtml(lead.id)}">Analisar proposta →</button></div></article>`;
}
function gcOnlineRenderKpis(){
  const state=gcOnlineCurrentState||gcOnlineLoadState(),pending=state.leads.filter(x=>x.status==='pending').length,accepted=state.contracts.length,acceptedIds=new Set(state.contracts.map(x=>x.leadId||x.id)),revenue=cashLedger().filter(x=>x.source===GC_ONLINE_CASH_SOURCE&&acceptedIds.has(x.onlineLeadId)&&x.direction==='in').reduce((s,x)=>s+Number(x.amount||0),0);
  $('#onlinePhoneKpis').innerHTML=[[String(GC_ONLINE_CLIENT_CATALOG.length),'clientes-base'],[String(pending),'pendentes'],[String(accepted),'aceitas']].map(([v,l])=>`<div class="gc-phone-kpi"><strong>${escapeHtml(v)}</strong><span>${escapeHtml(l)}</span></div>`).join('');
  $('#onlineInboxCount').textContent=`${pending} pendente${pending===1?'':'s'}`;$('#onlineSideCatalogCount').textContent=String(GC_ONLINE_CLIENT_CATALOG.length);$('#onlineSidePendingCount').textContent=String(pending);$('#onlineSideRevenue').textContent=money(revenue);
}
function gcOnlineRenderLeadList(){
  const rows=gcOnlinePending();$('#onlineLeadList').innerHTML=rows.length?rows.map(gcOnlineLeadMarkup).join(''):'<div class="gc-empty-state">Nenhuma proposta pendente agora. O simulador pode receber novas consultas em outros dias. Use ↻ para conferir se houve chegada desde sua última visita.</div>';
}
function gcOnlineRenderAgenda(){
  const state=gcOnlineCurrentState||gcOnlineLoadState(),rows=state.contracts.slice().sort((a,b)=>String(a.departureAt).localeCompare(String(b.departureAt)));
  const ids=new Set(rows.map(x=>x.leadId||x.id));
  const revenue=cashLedger().filter(x=>x.source===GC_ONLINE_CASH_SOURCE&&ids.has(x.onlineLeadId)&&x.direction==='in').reduce((sum,row)=>sum+Number(row.amount||0),0);
  $('#onlineAgendaKpis').innerHTML=[[''+rows.length,'serviços aceitos'],[money(revenue),'recebido no Caixa'],[String(rows.filter(x=>String(x.serviceDate)>=dateTodayLocal()).length),'futuros']].map(([v,l])=>`<div class="gc-phone-kpi"><strong>${escapeHtml(v)}</strong><span>${escapeHtml(l)}</span></div>`).join('');
  $('#onlineAgendaList').innerHTML=rows.length?rows.map(x=>{
    const term=Number(x.contractDurationMonths)>0;
    const termLine=term?`<br>Contrato contínuo: ${escapeHtml(gcOnlineDurationLabel(x.contractDurationMonths))} · ${Number(x.monthlyTrips)||22} jornadas/mês<br>Mensalidade: ${escapeHtml(money(Number(x.monthlyAmount||x.budget)||0))} · parcelas recebidas ${Math.max(1,cashLedger().filter(e=>e.source===GC_ONLINE_CASH_SOURCE&&(e.onlineLeadId===x.leadId||e.onlineLeadId===x.id)&&e.direction==='in').length)}/${Number(x.contractDurationMonths)||1}`:'';
    const runs=Array.isArray(x.startedRuns)?x.startedRuns:[];const todayRun=runs.find(run=>run.date===dateTodayLocal());
    let launch='';
    if(todayRun)launch=`<div class="gc-inline-notice good"><strong>Partida validada hoje</strong><br>${escapeHtml(todayRun.driver||x.driver||'Motorista')} · ${escapeHtml(new Date(todayRun.startedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))} · cartão reconhecido</div>`;
    else if(gcOnlineContractCoversDate(x,dateTodayLocal()))launch=`<button type="button" class="gc-primary-action" data-online-start-run="${escapeHtml(x.id)}">▣ Iniciar serviço no validador</button>`;
    else launch=`<p class="gc-small-note">${term?'O serviço contínuo só pode partir nas datas de vigência e dias de serviço contratados.':`Data marcada: ${escapeHtml(displayDateValue(x.serviceDate))}. O validador será liberado na data agendada.`}</p>`;
    return `<article class="gc-lead-card"><div class="gc-lead-card-top"><div><strong class="gc-lead-client">${escapeHtml(x.clientName)}</strong><span class="gc-lead-location">${escapeHtml(x.company)} · ${escapeHtml(x.model)} · prefixo ${escapeHtml(x.prefix)} · motorista ${escapeHtml(x.driver||'não definido')}</span></div><span class="gc-service-pill">${term?'Contrato contínuo':'Confirmado'}</span></div><div class="gc-lead-route"><strong>${escapeHtml(x.origin)}</strong> → <strong>${escapeHtml(x.destination)}</strong><br>Serviço: ${escapeHtml(displayDateValue(x.serviceDate))}<br>Saída da garagem: ${escapeHtml(gcOnlineFormatDateTime(x.departureAt))}<br>Chegada prevista: ${escapeHtml(gcOnlineFormatDateTime(x.arrivalAt))}${termLine}</div><div class="gc-lead-budget"><div><small>${term?'Mensalidade contratada':'Receita no Caixa'}</small><strong>${escapeHtml(money(Number(x.monthlyAmount||x.budget)||0))}</strong></div><div style="text-align:right"><small>${term?'Resultado mensal estimado':'Resultado estimado'}</small><strong class="${Number(x.estimatedProfit)>=0?'positive':'negative'}">${escapeHtml(money(Number(x.estimatedProfit)||0))}</strong></div></div>${x.note?`<p class="gc-small-note">${escapeHtml(x.note)}</p>`:''}<div class="gc-online-trip-start">${launch}</div></article>`;
  }).join(''):'<div class="gc-empty-state">Nenhum fretamento aceito ainda. Analise uma proposta e confirme a escala para preencher a agenda.</div>';
}
function gcOnlineRenderDirectory(){
  const q=norm($('#onlineDirectorySearch').value),kind=$('#onlineDirectoryType').value;
  const rows=GC_ONLINE_CLIENT_CATALOG.filter(x=>(!q||norm(`${x.name} ${x.organization} ${x.city} ${x.state} ${x.origin} ${x.destination}`).includes(q))&&(!kind||x.clientType===kind));
  $('#onlineDirectorySummary').textContent=`Exibindo ${Math.min(rows.length,15)} de ${rows.length} resultado(s) · base total: ${GC_ONLINE_CLIENT_CATALOG.length.toLocaleString('pt-BR')} clientes potenciais, incluindo prefeituras e empresas que podem solicitar contratos contínuos.`;
  $('#onlineDirectoryResults').innerHTML=rows.length?rows.slice(0,15).map(x=>`<div class="gc-directory-row"><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml(x.clientType)} · ${escapeHtml(x.city)}/${escapeHtml(x.state)}<br>Rotas de referência: ${escapeHtml(x.origin)} → ${escapeHtml(x.destination)}</small></div>`).join(''):'<div class="gc-empty-state">Nenhum cliente corresponde à pesquisa.</div>';
}
function gcOnlineRenderMessagePreview(){
  const template=$('#onlineMessageTemplate').value,lead=gcOnlineFindLead(gcOnlineSelectedLeadId)||gcOnlinePending()[0];
  const name=lead?.organization||lead?.clientName||'Cliente',route=lead?`${lead.origin} → ${lead.destination}`:'o trajeto solicitado';
  const messages={moreInfo:`Olá, ${name}! Aqui é do Grupo Conect. Recebemos sua consulta para ${route}. Para preparar uma proposta correta, poderia confirmar a data, o número de passageiros, o tempo de espera e se haverá retorno no mesmo dia?`,counterOffer:`Olá, ${name}! Obrigado por consultar o Grupo Conect para ${route}. Considerando veículo, combustível, equipe e despesas operacionais, nossa contraproposta para o serviço é de ${money(lead?gcOnlineMakeEstimate(lead).recommended:0)}. Podemos conversar sobre os detalhes?`,accepted:`Olá, ${name}! O Grupo Conect confirma o recebimento e o agendamento simulado do serviço ${route}. A escala prevista e os horários foram registrados no nosso controle. Obrigado pela preferência!`,declined:`Olá, ${name}! Agradecemos por consultar o Grupo Conect para ${route}. Neste momento, não conseguimos atender nas condições informadas. Ficamos à disposição para avaliar outra data ou orçamento.`};
  $('#onlineMessagePreview').textContent=messages[template]||messages.moreInfo;return messages[template]||messages.moreInfo;
}
function gcOnlineShowTab(tab){
  if(!assertOwner())return;gcOnlineActiveTab=['clients','agenda','tools'].includes(tab)?tab:'clients';
  $('#onlineClientsView').hidden=gcOnlineActiveTab!=='clients';$('#onlineAgendaView').hidden=gcOnlineActiveTab!=='agenda';$('#onlineToolsView').hidden=gcOnlineActiveTab!=='tools';
  $$('[data-online-tab]').forEach(b=>b.classList.toggle('active',b.dataset.onlineTab===gcOnlineActiveTab));
  if(gcOnlineActiveTab==='agenda')gcOnlineRenderAgenda();if(gcOnlineActiveTab==='tools'){gcOnlineRenderDirectory();gcOnlineRenderMessagePreview();}
}
function gcOnlineRender(){
  const state=gcOnlineCurrentState||gcOnlineLoadState();gcOnlineCurrentState=state;
  gcOnlineRenderKpis();gcOnlineRenderLeadList();gcOnlineRenderAgenda();gcOnlineRenderDirectory();gcOnlineRenderMessagePreview();
}
function gcOnlineShowLead(id){
  if(!assertOwner())return;const lead=gcOnlineFindLead(id);if(!lead){showToast('Esta proposta não está mais disponível.');return;}
  gcOnlineSelectedLeadId=id;$('#onlineDispatchPanel').hidden=true;$('#onlineLeadDetail').hidden=false;
  const est=gcOnlineMakeEstimate(lead),already=lead.status!=='pending',isContract=Number(lead.contractDurationMonths)>0;
  const facts=[['Origem',lead.origin],['Destino',lead.destination],['Data solicitada',displayDateValue(lead.serviceDate)],['Saída solicitada',lead.requestedDeparture],['Previsão ao destino',`${displayDateValue(lead.requestedArrivalDate||lead.serviceDate)} ${lead.requestedArrival}`],['Passageiros',String(lead.passengers)],['Km de ida estimados',`${numberPt(lead.oneWayKm,0)} km`],['Km por serviço/dia',`${numberPt(lead.totalKm,0)} km`],['Duração diária estimada',`${numberPt(lead.serviceHours,1)} h`],...(isContract? [['Prazo escolhido pelo cliente',gcOnlineDurationLabel(lead.contractDurationMonths)],['Jornadas estimadas por mês',String(lead.monthlyTrips)],['Km estimados por mês',`${numberPt(lead.monthlyKm||lead.totalKm*lead.monthlyTrips,0)} km`]]:[]),[isContract?'Mensalidade oferecida':'Orçamento oferecido',money(lead.budget)]];
  $('#onlineLeadDetail').innerHTML=`<div class="gc-section-title"><div><span class="gc-app-eyebrow">ANÁLISE DA PROPOSTA</span><h3>${escapeHtml(lead.clientName)}</h3></div><button type="button" class="gc-icon-button" id="onlineCloseLeadDetail" aria-label="Fechar detalhes">×</button></div><p class="gc-small-note">${escapeHtml(lead.clientCity||lead.originRegion)}/${escapeHtml(lead.clientState||lead.originState)} · ${escapeHtml(lead.clientType)} · proposta recebida ${escapeHtml(displayDateValue(lead.receivedDate))}</p><div class="gc-detail-facts">${facts.map(([k,v])=>`<div class="gc-detail-fact"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div><div class="gc-cost-breakdown"><strong style="display:block;margin-bottom:5px;color:#193f4c;font-size:10px">${isContract?'Estimativa mensal do contrato':'Estimativa financeira antes de escolher o ônibus'}</strong>${gcOnlineMoneyRow('Combustível estimado',est.fuel+est.energy)}${gcOnlineMoneyRow('Motorista / equipe',est.driver)}${gcOnlineMoneyRow('Manutenção e pneus',est.maintenance)}${gcOnlineMoneyRow('Pedágios e deslocamentos',est.tolls)}${gcOnlineMoneyRow('Limpeza / preparação',est.serviceExtra)}${gcOnlineMoneyRow('Reserva para imprevistos',est.contingency)}${gcOnlineMoneyRow(isContract?'Custo total mensal estimado':'Custo estimado total',est.total)}</div>${gcOnlineVerdictMarkup(est)}${isContract?'<p class="gc-small-note">O prazo mostrado foi escolhido pelo cliente/prefeitura nesta proposta. O valor oferecido é mensal, não o total de todos os anos. Ao aceitar, a primeira mensalidade entra no Caixa e as seguintes são registradas conforme os meses transcorram e o aplicativo voltar a ser aberto.</p>':''}${already?`<div class="gc-inline-notice">Esta proposta já foi ${lead.status==='accepted'?'aceita':'recusada'}.</div>`:`<div class="gc-detail-actions"><button type="button" class="gc-primary-action" data-online-accept="${escapeHtml(lead.id)}">Escolher ônibus e aceitar</button><button type="button" class="gc-secondary-action" data-online-reject="${escapeHtml(lead.id)}">Recusar proposta</button></div>`}<button type="button" class="gc-secondary-action" id="onlineBackToLeadList" style="margin-top:7px">← Voltar à caixa de entrada</button>`;
  $('#onlineLeadDetail').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function gcOnlineVehicleRows(company){
  const rows=typeof uniqueVehicleOptions==='function'?uniqueVehicleOptions():[];return rows.filter(x=>norm(x.company)===norm(company)&&x.model&&x.prefix).map(x=>({company:x.company,model:x.model,prefix:String(x.prefix),chassis:x.chassis||''}));
}
function gcOnlineBusKey(x){return `${norm(x?.company)}|${norm(x?.prefix)}`;}
function gcOnlineWeekdayKey(value){const n=norm(value).replace(/-feira/g,'').trim();const first=n.split(/\s+/)[0];return ({segunda:'segunda',terca:'terca',terça:'terca',quarta:'quarta',quinta:'quinta',sexta:'sexta',sabado:'sabado',sábado:'sabado',domingo:'domingo'})[first]||first;}
function gcOnlineWeekdayForDate(iso){const d=new Date(`${iso}T12:00:00`);return Number.isNaN(d.getTime())?'':['domingo','segunda','terca','quarta','quinta','sexta','sabado'][d.getDay()];}
function gcOnlineDateAddMonths(iso,months){const [y,m,d]=String(iso||'').split('-').map(Number);if(!y||!m||!d)return iso;const total=(m-1)+Number(months||0),yy=y+Math.floor(total/12),mm=((total%12)+12)%12,last=new Date(yy,mm+1,0).getDate();return `${yy}-${String(mm+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;}
function gcOnlineContractCoversDate(contract,date){
  const start=String(contract.serviceDate||contract.departureAt||'').slice(0,10),months=Number(contract.contractDurationMonths)||0;
  if(!start||!date)return false;
  if(!months)return date===start;
  const end=gcOnlineDateAddMonths(start,months);if(date<start||date>=end)return false;
  const serviceDays=Array.isArray(contract.contractServiceDays)&&contract.contractServiceDays.length?contract.contractServiceDays:['segunda','terca','quarta','quinta','sexta'];
  return serviceDays.includes(gcOnlineWeekdayForDate(date));
}
function gcOnlineLocalDatePart(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value||'').slice(0,10);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function gcOnlineBusReservationReason(vehicle,date,ignoreLeadId=''){
  if(!vehicle||!date)return null;const key=gcOnlineBusKey(vehicle),onlineState=gcOnlineCurrentState||gcOnlineLoadState();
  const contract=(onlineState.contracts||[]).find(x=>x.status==='accepted'&&(x.leadId||x.id)!==ignoreLeadId&&gcOnlineBusKey(x)===key&&gcOnlineContractCoversDate(x,date));
  if(contract)return {kind:'Atendimento Online',message:`prefixo ${vehicle.prefix} já está reservado para ${contract.clientName} nessa data${Number(contract.contractDurationMonths)>0?' por um contrato contínuo':''}.`};
  const scale=ownerScales().find(x=>String(x.date||'').slice(0,10)===date&&gcOnlineBusKey(x)===key);
  if(scale)return {kind:'Escala diária',message:`prefixo ${vehicle.prefix} já está escalado para ${scale.company} · ${scale.city} · ${scale.line} em ${date}.`};
  const weekday=gcOnlineWeekdayForDate(date);
  const op=ownerOperations().find(x=>gcOnlineBusKey({company:x.company,prefix:x.prefix})===key&&gcOnlineWeekdayKey(x.weekday)===weekday&&x.status!=='pausada');
  if(op)return {kind:'Operação de Linha',message:`prefixo ${vehicle.prefix} já está reservado na Operação de Linha ${op.city} · ${op.line} nesse dia da semana (${xSafeLabel(op.weekday)}).`};
  const priorTrip=loadHistory().find(t=>gcOnlineBusKey({company:t.company,prefix:t.busPrefix})===key&&gcOnlineLocalDatePart(t.timestamp||dateTodayLocal())===date);
  if(priorTrip)return {kind:'Histórico de viagens',message:`prefixo ${vehicle.prefix} já foi usado em uma viagem normal nessa data (${priorTrip.city||'cidade não informada'} · ${priorTrip.line||'linha não informada'}).`};
  if(date===dateTodayLocal()&&typeof state==='object'&&state.journey&&gcOnlineBusKey({company:state.journey.company,prefix:state.journey.busPrefix})===key)return {kind:'Viagem em andamento',message:`prefixo ${vehicle.prefix} já está selecionado em uma viagem normal em andamento hoje.`};
  return null;
}
function gcOnlineRecurringOperationConflict(vehicle,weekdayLabel){
  if(!vehicle)return null;
  const key=gcOnlineBusKey(vehicle),targetWeekday=gcOnlineWeekdayKey(weekdayLabel),today=dateTodayLocal();
  const onlineState=gcOnlineCurrentState||gcOnlineLoadState();
  const contracts=(onlineState.contracts||[]).filter(x=>x.status==='accepted'&&gcOnlineBusKey(x)===key);
  for(const contract of contracts){
    const start=String(contract.serviceDate||contract.departureAt||'').slice(0,10);
    const months=Number(contract.contractDurationMonths)||0;
    if(!start)continue;
    if(!months){
      if(start>=today&&gcOnlineWeekdayForDate(start)===targetWeekday){
        return {kind:'Atendimento Online',message:`prefixo ${vehicle.prefix} já está contratado para ${contract.clientName} em ${start}. Como esta operação se repete toda ${weekdayLabel}, o mesmo ônibus não pode ser reservado também para essa linha.`};
      }
      continue;
    }
    const end=gcOnlineDateAddMonths(start,months);
    const serviceDays=Array.isArray(contract.contractServiceDays)&&contract.contractServiceDays.length?contract.contractServiceDays:['segunda','terca','quarta','quinta','sexta'];
    if(end<=today||!serviceDays.includes(targetWeekday))continue;
    const from=start>today?start:today;
    for(let offset=0;offset<7;offset++){
      const d=new Date(`${from}T12:00:00`);d.setDate(d.getDate()+offset);
      const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if(iso>=end)break;
      if(gcOnlineWeekdayForDate(iso)===targetWeekday&&gcOnlineContractCoversDate(contract,iso)){
        return {kind:'Contrato contínuo de fretamento',message:`prefixo ${vehicle.prefix} já está reservado para o contrato contínuo de ${contract.clientName} (${gcOnlineDurationLabel(months)}). Escolha outro ônibus para uma operação recorrente às ${weekdayLabel}.`};
      }
    }
  }
  const scale=ownerScales().find(x=>gcOnlineBusKey(x)===key&&String(x.date||'')>=today&&gcOnlineWeekdayForDate(String(x.date||'').slice(0,10))===targetWeekday);
  if(scale)return {kind:'Escala diária',message:`prefixo ${vehicle.prefix} já está escalado em ${scale.city} · ${scale.line} no dia ${scale.date}; não pode ser atribuído também a uma linha recorrente de ${weekdayLabel}.`};
  const existingOperation=ownerOperations().find(x=>gcOnlineBusKey({company:x.company,prefix:x.prefix})===key&&gcOnlineWeekdayKey(x.weekday)===targetWeekday&&x.status!=='pausada');
  if(existingOperation)return {kind:'Operação de Linha',message:`prefixo ${vehicle.prefix} já está na operação ${existingOperation.city} · ${existingOperation.line} às ${weekdayLabel}.`};
  return null;
}
function xSafeLabel(value){return String(value||'dia cadastrado');}
function gcOnlineAvailableVehicleRows(company,date,ignoreLeadId=''){
  return gcOnlineVehicleRows(company).map(v=>({...v,reservation:gcOnlineBusReservationReason(v,date,ignoreLeadId)}));
}
function gcOnlinePopulateModels(){
  const company=$('#onlineDispatchCompany').value,lead=gcOnlineFindLead(gcOnlineSelectedLeadId),date=lead?.serviceDate||'',old=$('#onlineDispatchModel').value;
  const rows=gcOnlineAvailableVehicleRows(company,date,lead?.id),models=[...new Set(rows.filter(x=>!x.reservation).map(x=>x.model))];
  populateSelect($('#onlineDispatchModel'),models.length?'Selecione o modelo disponível':'Nenhum ônibus livre nessa data',models);
  if(models.includes(old))$('#onlineDispatchModel').value=old;else if(models.length)$('#onlineDispatchModel').value=models[0];
  gcOnlinePopulatePrefixes();
}
function gcOnlinePopulatePrefixes(){
  const company=$('#onlineDispatchCompany').value,model=$('#onlineDispatchModel').value,lead=gcOnlineFindLead(gcOnlineSelectedLeadId),date=lead?.serviceDate||'',all=gcOnlineAvailableVehicleRows(company,date,lead?.id).filter(x=>norm(x.model)===norm(model)),old=$('#onlineDispatchPrefix').value;
  const unique=[...new Map(all.map(x=>[x.prefix,x])).values()];
  const select=$('#onlineDispatchPrefix');select.innerHTML='';const first=document.createElement('option');first.value='';first.textContent=unique.some(x=>!x.reservation)?'Selecione o prefixo livre':'Nenhum prefixo livre';select.appendChild(first);
  unique.forEach(x=>{const o=document.createElement('option');o.value=x.prefix;o.textContent=x.reservation?`${x.prefix} · INDISPONÍVEL (${x.reservation.kind})`:x.prefix;o.disabled=!!x.reservation;select.appendChild(o);});
  const free=unique.filter(x=>!x.reservation);if(free.some(x=>x.prefix===old))select.value=old;else if(free.length)select.value=free[0].prefix;
  gcOnlineUpdateDispatchAssessment();
}
function gcOnlineSelectedVehicle(){const company=$('#onlineDispatchCompany')?.value,model=$('#onlineDispatchModel')?.value,prefix=$('#onlineDispatchPrefix')?.value;return gcOnlineVehicleRows(company).find(x=>norm(x.model)===norm(model)&&String(x.prefix)===String(prefix))||null;}
function gcOnlineCapacity(model){const s=String(model||'').toLocaleLowerCase('pt-BR');if(/articul|biarticul/.test(s))return 100;if(/gran micro|micro|volare|lo-916|lo-915|9\.160/.test(s))return 30;if(/paradiso|viaggio|audace|spectrum road|rodovi|ideale|irizar/.test(s))return 48;if(/apache|torino|gran via|neobus n10/.test(s))return 70;return 45;}
function gcOnlineUpdateDispatchAssessment(){
  const lead=gcOnlineFindLead(gcOnlineSelectedLeadId),vehicle=gcOnlineSelectedVehicle(),box=$('#onlineDispatchAssessment');if(!box)return;
  if(!lead){box.className='gc-inline-notice';box.textContent='Selecione uma proposta primeiro.';return;}
  const company=$('#onlineDispatchCompany').value||'',allRows=gcOnlineVehicleRows(company),available=gcOnlineAvailableVehicleRows(company,lead.serviceDate,lead.id).filter(x=>!x.reservation);
  if(!vehicle){box.className=allRows.length&&!available.length?'gc-inline-notice bad':'gc-inline-notice';box.textContent=allRows.length&&!available.length?`Nenhum ônibus de ${company} está livre em ${displayDateValue(lead.serviceDate)}. Prefixos escalados em outra viagem, numa escala diária ou numa operação recorrente ficam bloqueados para esse dia.`:'Selecione empresa, modelo e prefixo livre. O sistema impede o uso do mesmo ônibus em outra viagem na mesma data.';return;}
  const reservation=gcOnlineBusReservationReason(vehicle,lead.serviceDate,lead.id);if(reservation){box.className='gc-inline-notice bad';box.textContent=`Ônibus indisponível: ${reservation.message} Escolha outro prefixo ou outra data.`;return;}
  const capacity=gcOnlineCapacity(vehicle.model),est=gcOnlineMakeEstimate(lead,vehicle.model),isContract=Number(lead.contractDurationMonths)>0;
  if(lead.passengers>capacity){box.className='gc-inline-notice bad';box.textContent=`Atenção: o veículo comporta aproximadamente ${capacity} passageiros, mas a solicitação é de ${lead.passengers}. Escolha outro ônibus com capacidade suficiente.`;}
  else if(est.profit<=0){box.className='gc-inline-notice warn';box.textContent=`Capacidade compatível (${capacity} estimados). ${isContract?'Resultado mensal':'Resultado'} previsto: ${money(est.profit)}. Você ainda pode aceitar por decisão própria, mas o orçamento parece insuficiente.`;}
  else{box.className='gc-inline-notice good';box.textContent=`Capacidade aproximada: ${capacity} passageiros. ${isContract?'Resultado mensal estimado':'Resultado estimado'} com este ônibus: ${money(est.profit)} (${numberPt(est.margin,1)}% de margem). ${isContract?`Prazo solicitado pelo cliente: ${gcOnlineDurationLabel(lead.contractDurationMonths)}. A mensalidade de ${money(lead.budget)} será lançada no Caixa ao confirmar.`:`O orçamento de ${money(lead.budget)} será lançado no Caixa ao confirmar.`}`;}
}
function gcOnlineDefaultDispatchTimes(lead){
  const dep=new Date(`${lead.serviceDate}T${lead.requestedDeparture}:00`);dep.setMinutes(dep.getMinutes()-45);
  const travelMinutes=Math.max(30,Math.round(Number(lead.oneWayKm||50)/45*60+30));const eta=new Date(dep.getTime()+travelMinutes*60000);
  const localValue=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return {departure:localValue(dep),arrival:localValue(eta)};
}
function gcOnlinePopulateDispatchDrivers(){
  const select=$('#onlineDispatchDriver');if(!select)return;
  const company=$('#onlineDispatchCompany').value||GROUP_COMPANIES[0]||'Progresso';
  const rows=typeof driverRoster==='function'?driverRoster(company):['Pablo','Treinamento','Kaio'];
  const old=select.value;populateSelect(select,'Selecione o motorista',rows);select.value=rows.includes(old)?old:(rows[0]||'');
}
function gcOnlineStartDispatch(id){
  if(!assertOwner())return;const lead=gcOnlineFindLead(id);if(!lead||lead.status!=='pending'){showToast('A proposta não está pendente.');return;}
  gcOnlineSelectedLeadId=id;$('#onlineDispatchPanel').hidden=false;$('#onlineDispatchCompany').innerHTML='';populateSelect($('#onlineDispatchCompany'),'Selecione a empresa',GROUP_COMPANIES);$('#onlineDispatchCompany').value=GROUP_COMPANIES[0]||'';gcOnlinePopulateModels();gcOnlinePopulateDispatchDrivers();
  const times=gcOnlineDefaultDispatchTimes(lead);$('#onlineGarageDeparture').value=times.departure;$('#onlineExpectedArrival').value=times.arrival;$('#onlineDispatchNote').value='';gcOnlineUpdateDispatchAssessment();$('#onlineDispatchPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function gcOnlineConfirmAcceptance(event){
  event.preventDefault();if(!assertOwner())return;const state=gcOnlineCurrentState||gcOnlineLoadState(),lead=state.leads.find(x=>x.id===gcOnlineSelectedLeadId);
  if(!lead||lead.status!=='pending'){showToast('Esta proposta já foi resolvida ou não foi encontrada.');return;}
  const vehicle=gcOnlineSelectedVehicle(),departure=$('#onlineGarageDeparture').value,arrival=$('#onlineExpectedArrival').value,company=$('#onlineDispatchCompany').value,driver=$('#onlineDispatchDriver')?.value||'',note=$('#onlineDispatchNote').value.trim();
  if(!vehicle||!company||!driver||!departure||!arrival){showToast('Escolha empresa, ônibus, prefixo, motorista e os dois horários.');return;}
  const depDate=new Date(departure),arrDate=new Date(arrival);if(Number.isNaN(depDate.getTime())||Number.isNaN(arrDate.getTime())||arrDate<=depDate){showToast('A chegada prevista deve ser posterior à saída da garagem.');return;}
  const reservation=gcOnlineBusReservationReason(vehicle,lead.serviceDate,lead.id);if(reservation){showToast(`Escala recusada: ${reservation.message} Este ônibus não pode fazer outra viagem nessa data.`);gcOnlinePopulateModels();return;}
  const capacity=gcOnlineCapacity(vehicle.model);if(lead.passengers>capacity){showToast(`Este ônibus comporta aproximadamente ${capacity} passageiros; a proposta pede ${lead.passengers}. Escolha um maior.`);return;}
  if(state.contracts.some(x=>x.leadId===lead.id)){showToast('Esta proposta já está aceita e consta no histórico.');return;}
  const estimate=gcOnlineMakeEstimate(lead,vehicle.model),isContract=Number(lead.contractDurationMonths)>0,cashEntryId=isContract?`online-contract-cash-${lead.id}-1`:`online-cash-${lead.id}`,existingEntry=cashLedger().find(x=>x.id===cashEntryId||(!isContract&&x.onlineLeadId===lead.id&&x.source===GC_ONLINE_CASH_SOURCE));
  const entry=existingEntry||{id:cashEntryId,date:dateTodayLocal(),direction:'in',category:isContract?'Mensalidade de contrato de fretamento':'Receita de turismo / fretamento',amount:Number(lead.budget)||0,description:isContract?`Mensalidade 1/${lead.contractDurationMonths} · ${lead.clientName} · ${lead.origin} → ${lead.destination} · ${company} · ${vehicle.model} prefixo ${vehicle.prefix} · prazo ${gcOnlineDurationLabel(lead.contractDurationMonths)}`:`${lead.clientName} · ${lead.origin} → ${lead.destination} · ${company} · ${vehicle.model} prefixo ${vehicle.prefix} · saída ${gcOnlineFormatDateTime(departure)} · chegada ${gcOnlineFormatDateTime(arrival)}`,createdAt:new Date().toISOString(),auto:true,source:GC_ONLINE_CASH_SOURCE,onlineLeadId:lead.id,onlineContractPeriod:isContract?1:undefined,onlineContractDurationMonths:isContract?lead.contractDurationMonths:undefined};
  if(!(Number(entry.amount)>0)){showToast(isContract?'A mensalidade da proposta precisa ser maior que zero.':'O valor da proposta precisa ser maior que zero para registrar a receita.');return;}
  if(!existingEntry){const ledger=cashLedger();ledger.push(entry);if(!writeArrayKey(CASH_LEDGER_KEY,ledger))return;}
  const contract={id:`online-contract-${lead.id}`,leadId:lead.id,clientId:lead.clientId,clientName:lead.clientName,organization:lead.organization,origin:lead.origin,destination:lead.destination,serviceType:lead.serviceType,serviceDate:lead.serviceDate,requestedDeparture:lead.requestedDeparture,passengers:lead.passengers,budget:Number(lead.budget),monthlyAmount:isContract?Number(lead.budget):0,contractDurationMonths:isContract?Number(lead.contractDurationMonths):0,monthlyTrips:isContract?Number(lead.monthlyTrips)||22:1,monthlyKm:isContract?Number(lead.monthlyKm)||Number(lead.totalKm)*Number(lead.monthlyTrips||22):0,contractServiceDays:isContract?(lead.contractServiceDays||['segunda','terca','quarta','quinta','sexta']):[],estimatedCost:estimate.total,estimatedProfit:estimate.profit,company,model:vehicle.model,prefix:vehicle.prefix,chassis:vehicle.chassis,departureAt:departure,arrivalAt:arrival,driver,note,startedRuns:[],acceptedAt:new Date().toISOString(),status:'accepted',cashEntryId:entry.id};
  lead.status='accepted';lead.resolvedAt=new Date().toISOString();lead.contractId=contract.id;state.contracts.push(contract);
  if(!gcOnlineSaveState(state)){showToast('A receita foi registrada no Caixa, mas o contrato não pôde ser salvo no Atendimento Online. Não repita a operação; confira a agenda/caixa.');return;}
  gcOnlineSelectedLeadId=lead.id;$('#onlineDispatchPanel').hidden=true;$('#onlineLeadDetail').hidden=true;renderCashDashboard();renderFinanceList();gcOnlineRender();gcOnlineShowTab('agenda');showToast(isContract?`Contrato aceito por ${gcOnlineDurationLabel(lead.contractDurationMonths)}. A 1ª mensalidade (${money(entry.amount)}) entrou no Caixa. As demais serão lançadas mensalmente enquanto o simulador for aberto.`:`Proposta aceita. ${money(entry.amount)} entrou no Caixa do Grupo Conect automaticamente.`);
}
function gcOnlineStartContractRun(id){
  if(!assertOwner())return;
  const current=gcOnlineCurrentState||gcOnlineLoadState(),contract=current.contracts.find(x=>x.id===id&&x.status==='accepted');
  if(!contract){showToast('Serviço não encontrado na agenda.');return;}
  const today=dateTodayLocal();if(!gcOnlineContractCoversDate(contract,today)){showToast('Este serviço ainda não está previsto para hoje ou o contrato está fora da vigência.');return;}
  const runs=Array.isArray(contract.startedRuns)?contract.startedRuns:[];if(runs.some(run=>run.date===today)){showToast('A viagem deste contrato já teve partida validada hoje.');gcOnlineRenderAgenda();return;}
  const vehicle={company:contract.company,model:contract.model,prefix:contract.prefix};const conflict=gcOnlineBusReservationReason(vehicle,today,contract.leadId||contract.id);
  if(conflict){showToast(`Partida bloqueada: ${conflict.message}`);return;}
  gcValidatorOpen({type:'online',onlineContractId:contract.id,onlineLeadId:contract.leadId||contract.id,driver:contract.driver||'Pablo',company:contract.company,model:contract.model,prefix:contract.prefix,city:contract.origin,line:`${contract.serviceType||'Fretamento'} · ${contract.clientName}`});
}
function gcOnlineCommitServiceStart(p,validatorLogId){
  if(!assertOwner())return;
  const current=gcOnlineCurrentState||gcOnlineLoadState(),contract=current.contracts.find(x=>x.id===p.onlineContractId&&x.status==='accepted');
  if(!contract){showToast('O contrato não foi encontrado; nenhuma partida foi registrada.');switchScreen('ownerAreaScreen');return;}
  const today=dateTodayLocal();if(!gcOnlineContractCoversDate(contract,today)){showToast('O serviço não está previsto para hoje; a partida não foi registrada.');switchScreen('ownerAreaScreen');return;}
  if(!Array.isArray(contract.startedRuns))contract.startedRuns=[];
  if(contract.startedRuns.some(run=>run.date===today)){showToast('Já existe uma partida validada para este serviço hoje.');switchScreen('ownerAreaScreen');gcOnlineShowTab('agenda');return;}
  const conflict=gcOnlineBusReservationReason({company:contract.company,model:contract.model,prefix:contract.prefix},today,contract.leadId||contract.id);
  if(conflict){showToast(`Partida bloqueada: ${conflict.message}`);switchScreen('ownerAreaScreen');gcOnlineShowTab('agenda');return;}
  contract.startedRuns.push({id:makeId(),date:today,driver:p.driver,validatorLogId,startedAt:new Date().toISOString(),status:'partida validada'});
  if(!gcOnlineSaveState(current)){showToast('Não foi possível salvar a partida do contrato. Confira o histórico antes de tentar novamente.');return;}
  gcOnlineRender();gcOnlineShowTab('agenda');switchScreen('ownerAreaScreen');showToast(`Partida validada para ${contract.clientName}. O cartão de ${p.driver} foi registrado no simulador.`);
}
$('#onlineAgendaList')?.addEventListener('click',event=>{const button=event.target.closest('[data-online-start-run]');if(button)gcOnlineStartContractRun(button.dataset.onlineStartRun);});
function gcOnlineHandleOfferAction(event){
  const view=event.target.closest('[data-online-view]');if(view){gcOnlineShowLead(view.dataset.onlineView);return;}
  const accept=event.target.closest('[data-online-accept]');if(accept){gcOnlineStartDispatch(accept.dataset.onlineAccept);return;}
  const reject=event.target.closest('[data-online-reject]');if(reject){if(!assertOwner())return;const state=gcOnlineCurrentState||gcOnlineLoadState(),lead=state.leads.find(x=>x.id===reject.dataset.onlineReject);if(!lead||lead.status!=='pending')return;if(!window.confirm(`Recusar a proposta de ${lead.clientName}?`))return;lead.status='rejected';lead.resolvedAt=new Date().toISOString();gcOnlineSaveState(state);$('#onlineLeadDetail').hidden=true;$('#onlineDispatchPanel').hidden=true;gcOnlineRender();showToast('Proposta recusada e arquivada.');return;}
  if(event.target.closest('#onlineCloseLeadDetail')){$('#onlineLeadDetail').hidden=true;$('#onlineDispatchPanel').hidden=true;return;}
  if(event.target.closest('#onlineBackToLeadList')){$('#onlineLeadDetail').hidden=true;$('#onlineDispatchPanel').hidden=true;return;}
}
function gcOnlineCalculateTool(event){
  event.preventDefault();if(!assertOwner())return;
  const km=readToolValue('onlineCalcKm'),hours=readToolValue('onlineCalcHours'),eff=readToolValue('onlineCalcEfficiency'),price=readToolValue('onlineCalcDieselPrice'),other=readToolValue('onlineCalcOtherCosts'),offer=readToolValue('onlineCalcOffer');
  if([km,hours,eff,price,other,offer].some(x=>x===null)||km<=0||hours<=0||eff<=0){$('#onlineQuoteCalcResult').innerHTML='<div class="gc-inline-notice warn">Preencha todos os campos com valores válidos. Km, horas e consumo precisam ser maiores que zero.</div>';return;}
  const fuel=km/eff*price,driver=hours*58+45,wear=km*.82,contingency=(fuel+driver+wear+other)*.055,total=fuel+driver+wear+other+contingency,profit=offer-total,margin=offer?profit/offer*100:-100,level=profit<=0?'bad':margin<12?'warn':'good';
  $('#onlineQuoteCalcResult').innerHTML=`<div class="gc-cost-breakdown">${gcOnlineMoneyRow('Combustível',fuel)}${gcOnlineMoneyRow('Equipe / motorista',driver)}${gcOnlineMoneyRow('Manutenção e pneus',wear)}${gcOnlineMoneyRow('Outras despesas informadas',other)}${gcOnlineMoneyRow('Reserva para imprevistos',contingency)}${gcOnlineMoneyRow('Custo estimado total',total)}</div><div class="gc-inline-notice ${level}"><strong>${profit<=0?'Não cobre os custos':margin<12?'Margem apertada':'Margem estimada positiva'}</strong><br>Resultado: ${escapeHtml(money(profit))} · margem ${numberPt(margin,1)}%<br>Valor sugerido para margem de 20%: ${escapeHtml(money(total*1.2))}.</div>`;
}
function gcOnlineAcceptMessageCopy(){
  if(!assertOwner())return;const text=gcOnlineRenderMessagePreview();copyText(text).then(ok=>showToast(ok?'Mensagem copiada.':'Não foi possível copiar; selecione e copie o texto manualmente.'));
}
function gcOnlineOpenPanel(){
  if(!assertOwner())return;
  const panel=$('#onlineServicePanel');
  if(!panel){showToast('A tela do Atendimento Online não foi encontrada.');return;}
  // Exibe antes de sincronizar: um problema de armazenamento/renderização não
  // pode fazer o botão parecer inoperante.
  panel.hidden=false;
  $('#gcAgendaPanel').hidden=true;
  try{
    const result=gcOnlineSyncArrivals(false);gcOnlineCurrentState=result.state;
    gcOnlineShowTab('clients');
    gcOnlineRender();
    try{if(typeof gcGarageRenderCandidatesAndPhone==='function')gcGarageRenderCandidatesAndPhone();}catch(renderError){console.warn('Painel de equipe/peças indisponível nesta abertura:',renderError);}
    if(result.newCount)showToast(`${result.newCount} nova(s) proposta(s) disponível(is).`);else showToast('Atendimento Online aberto. Confira a caixa de entrada.');
  }catch(error){
    console.error('Erro ao atualizar Atendimento Online:',error);
    try{gcOnlineCurrentState=gcOnlineLoadState();}catch(_){gcOnlineCurrentState={leads:[],contracts:[]};}
    const list=$('#onlineLeadList');
    if(list&&!list.innerHTML.trim())list.innerHTML='<div class="gc-inline-notice warn">O aplicativo abriu, mas não foi possível atualizar as propostas neste momento. Seus registros locais foram preservados. Tente atualizar novamente.</div>';
    showToast('Atendimento Online aberto com aviso: não foi possível atualizar as propostas.');
  }
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
$('#onlineCloseButton')?.addEventListener('click',()=>{if(!assertOwner())return;$('#onlineServicePanel').hidden=true;$('#onlineOpenButton').scrollIntoView({behavior:'smooth',block:'center'});});
$('#onlineRefreshProposals')?.addEventListener('click',()=>{if(!assertOwner())return;const result=gcOnlineSyncArrivals(true);gcOnlineCurrentState=result.state;gcOnlineRender();showToast(result.newCount?`${result.newCount} nova(s) proposta(s) encontrada(s).`:'Nenhuma nova proposta desta vez; tente novamente após algum tempo.');});
$('#onlineCheckArrivals')?.addEventListener('click',()=>$('#onlineRefreshProposals').click());
$$('[data-online-tab]').forEach(b=>b.addEventListener('click',()=>gcOnlineShowTab(b.dataset.onlineTab)));
$('#onlineLeadList')?.addEventListener('click',gcOnlineHandleOfferAction);
$('#onlineLeadDetail')?.addEventListener('click',gcOnlineHandleOfferAction);
$('#onlineDispatchCompany')?.addEventListener('change',gcOnlinePopulateModels);
$('#onlineDispatchCompany')?.addEventListener('change',gcOnlinePopulateDispatchDrivers);
$('#onlineDispatchModel')?.addEventListener('change',gcOnlinePopulatePrefixes);
$('#onlineDispatchPrefix')?.addEventListener('change',gcOnlineUpdateDispatchAssessment);
$('#onlineGarageDeparture')?.addEventListener('change',()=>{const dep=new Date($('#onlineGarageDeparture').value);if(Number.isNaN(dep.getTime()))return;const lead=gcOnlineFindLead(gcOnlineSelectedLeadId);const minutes=Math.max(30,Math.round(Number(lead?.oneWayKm||50)/45*60+30));const arr=new Date(dep.getTime()+minutes*60000);const localValue=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;$('#onlineExpectedArrival').value=localValue(arr);});
$('#onlineCancelDispatch')?.addEventListener('click',()=>{$('#onlineDispatchPanel').hidden=true;});
$('#onlineDispatchForm')?.addEventListener('submit',gcOnlineConfirmAcceptance);
$('#onlineQuoteCalcForm')?.addEventListener('submit',gcOnlineCalculateTool);
$('#onlineMessageTemplate')?.addEventListener('change',gcOnlineRenderMessagePreview);
$('#onlineCopyMessage')?.addEventListener('click',gcOnlineAcceptMessageCopy);
$('#onlineDirectorySearch')?.addEventListener('input',gcOnlineRenderDirectory);
$('#onlineDirectoryType')?.addEventListener('change',gcOnlineRenderDirectory);

/* Banco Grupo Conect + Agenda de Frota. Valores e movimentações são de simulação local. */
const GC_BANK_STAFF_KEY='grupoConect.bankStaff.v1';
const GC_BANK_CARD_KEY='grupoConect.bankCard.v1';
const GC_BANK_IPVA_KEY='grupoConect.bankIpva.v1';
const GC_BANK_PAYROLL_KEY='grupoConect.bankPayroll.v1';
const GC_BANK_LOANS_KEY='grupoConect.bankBusinessLoans.v1';
const GC_AGENDA_PROFILES_KEY='grupoConect.agendaFleet.v1';
const GC_AGENDA_EVENTS_KEY='grupoConect.agendaEvents.v1';
const GC_AGENDA_DONE_KEY='grupoConect.agendaCompleted.v1';
let gcAgendaMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);
let gcAgendaSelectedDate=dateTodayLocal();
let gcBankCurrentReceipt='';
let gcAgendaInitialized=false;
const gcAgendaMonthNames=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function gcReadObject(key){try{const v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch(e){return {};}}
function gcWriteObject(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){showToast('Armazenamento cheio ou indisponível neste navegador.');return false;}}
function gcBankLoanRows(){return readArrayKey(GC_BANK_LOANS_KEY);}
function gcBankLoanMonthlyDebt(){return gcBankLoanRows().filter(x=>['Ativo','Aprovado'].includes(x.status)&&Number(x.paidCount||0)<Number(x.term||x.installmentCount||0)).reduce((s,x)=>s+Number(x.installmentAmount||0),0);}
function gcBankLoanCashProfile(){
  const today=dateTodayLocal(),cutoff=gcAgendaDateAdd(today,-180);
  const rows=allCashMovements().filter(x=>!['gcBankLoan','gcBankLoanPayment'].includes(x.source)&&String(x.date||today).slice(0,10)>=cutoff&&String(x.date||today).slice(0,10)<=today&&Number(x.amount)>0);
  const incoming=rows.filter(x=>x.direction==='in').reduce((s,x)=>s+Number(x.amount||0),0);
  const outgoing=rows.filter(x=>x.direction==='out').reduce((s,x)=>s+Number(x.amount||0),0);
  const dates=rows.map(x=>String(x.date||today).slice(0,10)).sort();
  const days=dates.length?Math.max(1,Math.floor((new Date(`${today}T12:00:00`).getTime()-new Date(`${dates[0]}T12:00:00`).getTime())/86400000)+1):30;
  const months=Math.max(1,Math.min(6,days/30));
  return {rows,incoming,outgoing,months,monthlyIncoming:incoming/months,monthlyOutgoing:outgoing/months,monthlyNet:(incoming-outgoing)/months,balance:Number(cashBreakdown().balance)||0,activeMonthlyDebt:gcBankLoanMonthlyDebt()};
}
function gcBankLoanAnalyze(){
  const amount=Number($('#gcBankLoanAmount')?.value)||0,term=Number($('#gcBankLoanTerm')?.value)||24,guarantee=$('#gcBankLoanGuarantee')?.value||'none',purpose=$('#gcBankLoanPurpose')?.value||'capital de giro';
  const profile=gcBankLoanCashProfile(),activeLoans=gcBankLoanRows().filter(x=>['Ativo','Aprovado'].includes(x.status)&&Number(x.paidCount||0)<Number(x.term||x.installmentCount||0));
  const referencePayment=loanMonthlyPayment(amount,term,2.0),net=Math.max(0,profile.monthlyNet),debt=profile.activeMonthlyDebt,ratio=referencePayment>0?net/Math.max(1,referencePayment+debt):0,cashRatio=amount>0?Math.max(0,profile.balance)/amount:0;
  let score=420;
  if(profile.rows.length>=30)score+=100;else if(profile.rows.length>=10)score+=60;else if(profile.rows.length>=3)score+=25;else score-=35;
  if(ratio>=3)score+=210;else if(ratio>=2)score+=155;else if(ratio>=1.2)score+=95;else if(ratio>=.6)score+=40;else score-=85;
  if(cashRatio>=1)score+=120;else if(cashRatio>=.5)score+=80;else if(cashRatio>=.2)score+=50;else if(cashRatio>=.05)score+=20;
  if(guarantee==='receivables')score+=75;else if(guarantee==='fleet')score+=95;else if(guarantee==='property')score+=125;
  if(activeLoans.some(x=>x.status==='Quitado'))score+=35;
  if(net>0&&debt/net>.5)score-=120;else if(net>0&&debt/net>.25)score-=60;
  if(amount>250000)score-=20;if(amount>1000000)score-=45;if(amount>5000000)score-=80;
  if(amount>2000000&&guarantee==='none')score-=80;
  if(amount>5000000&&!['fleet','property'].includes(guarantee))score-=100;
  score=Math.max(250,Math.min(950,Math.round(score)));
  let rate=score>=850?.95:score>=760?1.25:score>=680?1.65:score>=600?2.05:2.45;
  if(amount>1000000)rate+=.2;if(amount>3000000)rate+=.25;if(guarantee==='property')rate-=.1;rate=Math.max(.75,Math.min(2.95,Number(rate.toFixed(2))));
  const zeroRateEligible=amount>0&&amount<=50000&&term<=12&&score>=850&&guarantee!=='none'&&net>=referencePayment*1.5&&(debt+referencePayment)<=net*.35;
  if(zeroRateEligible)rate=0;
  const monthlyPayment=Number(loanMonthlyPayment(amount,term,rate).toFixed(2));
  const totalRepayment=rate===0?Number(amount.toFixed(2)):Number((monthlyPayment*term).toFixed(2));
  let probability=14+(score-250)*.105;
  const burden=net>0?(debt+monthlyPayment)/net:Infinity;
  if(net<=0)probability-=12;else if(burden<=.25)probability+=7;else if(burden>.45)probability-=12;if(burden>.7)probability-=15;
  if(amount>2000000&&guarantee==='none')probability=Math.min(probability,20);
  if(amount>5000000&&!['fleet','property'].includes(guarantee))probability=Math.min(probability,8);
  if(profile.rows.length<3)probability-=5;
  probability=Math.max(5,Math.min(92,Math.round(probability)));
  let reason='A solicitação será avaliada pelo fluxo de caixa, endividamento, garantia e valor pedido.';
  if(amount>10000000)reason='O limite máximo simulado é R$ 10.000.000.';
  else if(amount<5000)reason='O valor mínimo para solicitar é R$ 5.000.';
  else if(amount>5000000&&guarantee==='none')reason='Crédito acima de R$ 5 milhões normalmente exige garantias empresariais substanciais.';
  else if(net<=0&&cashRatio<.05)reason='O histórico ainda não demonstra fluxo de caixa livre suficiente; uma garantia e um histórico operacional melhor podem fortalecer uma nova solicitação.';
  else if(burden>.7)reason='A parcela estimada comprometeria grande parte do fluxo de caixa livre e aumenta o risco de inadimplência.';
  else if(zeroRateEligible)reason='Perfil elegível para uma campanha simulada de taxa zero, limitada a valores baixos, prazo curto e garantia.';
  else if(score>=760)reason='Perfil simulado forte: histórico/caixa e capacidade de pagamento favorecem a análise, sem garantir aprovação.';
  else reason='Perfil intermediário ou de risco elevado: a taxa e a chance de aprovação refletem a capacidade de pagamento e as garantias.';
  return {amount,term,guarantee,purpose,profile,score,probability,rate,monthlyPayment,totalRepayment,totalInterest:Math.max(0,Number((totalRepayment-amount).toFixed(2))),burden,zeroRateEligible,reason,activeLoanCount:activeLoans.length};
}
function gcBankLoanRenderPreview(){
  const target=$('#gcBankLoanPreview');if(!target)return;const a=gcBankLoanAnalyze();
  if(!Number.isFinite(a.amount)||a.amount<5000||a.amount>10000000){target.innerHTML='<strong>Confira o valor solicitado.</strong><p>Informe um valor entre R$ 5.000 e R$ 10.000.000.</p>';$('#gcBankLoanApplyButton').disabled=true;return;}
  $('#gcBankLoanApplyButton').disabled=false;
  target.innerHTML=`<div class="gc-bank-loan-preview-grid"><div><span>Score empresarial simulado</span><strong>${a.score}/950</strong></div><div><span>Chance estimada de aprovação</span><strong>${a.probability}%</strong></div><div><span>Juros ao mês</span><strong>${a.rate===0?'0% · taxa zero':`${numberPt(a.rate,2)}% a.m.`}</strong></div><div><span>Parcela estimada</span><strong>${money(a.monthlyPayment)}</strong></div><div><span>Total a devolver</span><strong>${money(a.totalRepayment)}</strong></div><div><span>Juros totais estimados</span><strong>${money(a.totalInterest)}</strong></div></div><p><b>Fluxo mensal líquido estimado:</b> ${money(a.profile.monthlyNet)} · <b>compromissos mensais atuais:</b> ${money(a.profile.activeMonthlyDebt)} · <b>saldo atual do Caixa:</b> ${money(a.profile.balance)}.</p><p>${escapeHtml(a.reason)}</p><small>Taxa fixa simulada. As parcelas seguem tabela Price, salvo campanha de taxa zero. A chance é uma estimativa lúdica, não uma decisão de crédito real.</small>`;
}
function gcBankLoanNextPaymentAmount(loan){const term=Number(loan.term||loan.installmentCount||0),paid=Number(loan.paidCount||0),total=Number(loan.totalRepayment||Number(loan.installmentAmount||0)*term),repaid=(loan.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0);return Number((paid>=term?0:paid===term-1?Math.max(0,total-repaid):Number(loan.installmentAmount||0)).toFixed(2));}
function gcBankLoanScheduleMarkup(loan){
  const term=Number(loan.term||loan.installmentCount||0);if(!term||term>48)return '';
  const payments=new Map((loan.payments||[]).map(p=>[Number(p.number),p]));let running=0;const amount=Number(loan.amount||0),regular=Number(loan.installmentAmount||0),total=Number(loan.totalRepayment||regular*term);
  const items=Array.from({length:term},(_,i)=>{const n=i+1,part=Number((n===term?Math.max(0,total-running):regular).toFixed(2));running+=part;const payment=payments.get(n),due=addMonthsToISO(loan.firstDueDate,i);return `<div class="gc-bank-loan-schedule-row ${payment?'paid':''}"><span><b>${n}/${term}</b> · ${escapeHtml(localDate(due))}${payment?` · Pago em ${escapeHtml(localDate(payment.date))}`:' · Pendente'}</span><strong>${money(payment?payment.amount:part)}</strong></div>`;});
  return `<details class="gc-bank-loan-payments"><summary>Ver cronograma completo · ${term} parcelas</summary><div class="gc-bank-loan-schedule">${items.join('')}</div></details>`;
}
function gcBankLoanRender(){
  const rows=gcBankLoanRows().slice().reverse(),approved=rows.filter(x=>['Ativo','Aprovado','Quitado'].includes(x.status)),active=approved.filter(x=>Number(x.paidCount||0)<Number(x.term||x.installmentCount||0));
  const borrowed=approved.reduce((s,x)=>s+Number(x.amount||0),0),remaining=active.reduce((s,x)=>s+Math.max(0,Number(x.totalRepayment||Number(x.installmentAmount||0)*Number(x.term||0))-Number((x.payments||[]).reduce((p,y)=>p+Number(y.amount||0),0))),0),monthly=gcBankLoanMonthlyDebt();
  $('#gcBankLoanSummary').innerHTML=[moneyStat('Crédito empresarial liberado',money(borrowed),'positive'),moneyStat('Saldo de parcelas por pagar',money(remaining),remaining>0?'negative':'positive'),moneyStat('Contratos ativos',String(active.length)),moneyStat('Compromisso mensal estimado',money(monthly),monthly>0?'negative':'')].join('');
  $('#gcBankLoanHistory').innerHTML=rows.length?rows.map(x=>{const term=Number(x.term||x.installmentCount||0),paid=Number(x.paidCount||0),left=Math.max(0,term-paid),repaid=(x.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0),balance=['Ativo','Aprovado','Quitado'].includes(x.status)?Math.max(0,Number(x.totalRepayment||0)-repaid):0,nextDue=left?addMonthsToISO(x.firstDueDate,paid):'';const active=['Ativo','Aprovado'].includes(x.status)&&left>0;return `<article class="gc-bank-loan-record"><div class="gc-bank-loan-record-head"><div><strong>${escapeHtml(x.contractNumber||x.id)} · ${money(x.amount)}</strong><small>${escapeHtml(x.purpose||'Crédito empresarial')} · solicitado em ${escapeHtml(localDate(String(x.date||x.createdAt||dateTodayLocal()).slice(0,10)))}</small></div><span class="gc-bank-loan-status ${active?'active':x.status==='Quitado'?'paid':'declined'}">${escapeHtml(x.status||'Em análise')}</span></div><div class="gc-bank-loan-details"><span>Taxa: <b>${Number(x.monthlyRate||0)===0?'0%':`${numberPt(x.monthlyRate,2)}% a.m.`}</b></span><span>Prazo: <b>${term}x</b></span><span>Parcela: <b>${money(x.installmentAmount||0)}</b></span><span>Pagas: <b>${paid}/${term}</b></span><span>Saldo parcelado: <b>${money(balance)}</b></span>${active?`<span>Próximo vencimento: <b>${escapeHtml(localDate(nextDue))}</b></span>`:''}</div>${active||x.status==='Quitado'?gcBankLoanScheduleMarkup(x):''}<p>${escapeHtml(x.reason||'Análise simulada.')}</p><div class="gc-bank-movement-actions">${active?`<button type="button" class="primary-button gc-bank-loan-pay-button" data-bank-loan-pay="${escapeHtml(x.id)}">Pagar próxima parcela · ${money(gcBankLoanNextPaymentAmount(x))}</button>`:''}<button type="button" class="gc-bank-small-button" data-bank-loan-receipt="${escapeHtml(x.id)}">Ver contrato / comprovante</button></div>${(x.payments||[]).length?`<details class="gc-bank-loan-payments"><summary>Histórico de parcelas (${x.payments.length})</summary>${x.payments.map(p=>`<div class="gc-bank-movement-actions"><span>${escapeHtml(localDate(p.date))} · parcela ${Number(p.number)||''} · ${money(p.amount)}</span><button type="button" class="gc-bank-small-button" data-bank-receipt="${escapeHtml(p.ledgerId)}">Comprovante</button></div>`).join('')}</details>`:''}</article>`;}).join(''):recordsEmpty('Ainda não há solicitações. Faça uma simulação acima para avaliar a proposta.');
}
function gcBankLoanContractText(loan,caption='CONTRATO SIMULADO · EMPRÉSTIMO EMPRESARIAL'){
 return [caption,'BANCO GRUPO CONECT · SIMULAÇÃO LOCAL','Este documento é fictício e não representa crédito bancário real.','',`Contrato: ${loan.contractNumber||loan.id}`,`Status: ${loan.status}`,`Data da solicitação: ${localDate(String(loan.date||dateTodayLocal()).slice(0,10))}`,`Finalidade: ${loan.purpose}`,`Valor solicitado/liberado: ${money(loan.amount)}`,`Prazo: ${loan.term} parcelas mensais`,`Taxa fixa: ${Number(loan.monthlyRate||0)===0?'0% ao mês':`${numberPt(loan.monthlyRate,2)}% ao mês`}`,`Parcela estimada: ${money(loan.installmentAmount)}`,`Total previsto: ${money(loan.totalRepayment)}`,`Juros totais previstos: ${money(loan.totalInterest)}`,`Garantia declarada na simulação: ${({none:'Sem garantia específica',receivables:'Recebíveis de contratos',fleet:'Ônibus / frota',property:'Imóvel empresarial'})[loan.guarantee]||loan.guarantee}`,`Score: ${loan.score}/950 · chance estimada: ${loan.probability}%`,`Próximo vencimento: ${!['Ativo','Aprovado'].includes(loan.status)?(loan.status==='Quitado'?'Quitado':'Não se aplica — crédito recusado'):localDate(addMonthsToISO(loan.firstDueDate,loan.paidCount))}`,`Crédito: ${['Ativo','Aprovado','Quitado'].includes(loan.status)?'lançado imediatamente no Caixa na aprovação':'não liberado'}`,`Observação: ${loan.reason||''}`].join('\n');
}
function gcBankLoanApply(event){
 event.preventDefault();if(!assertOwner())return;const a=gcBankLoanAnalyze();if(!Number.isFinite(a.amount)||a.amount<5000||a.amount>10000000||![6,12,18,24,36,48].includes(a.term)){showToast('Informe valor entre R$ 5.000 e R$ 10 milhões e prazo de até 48 parcelas.');return;}
 const existing=gcBankLoanRows(),id=`emp-${makeId()}`,contractNumber=`GC-EMP-${dateTodayLocal().replaceAll('-','')}-${id.slice(-6).toUpperCase()}`;
 const hardRisk=(a.amount>5000000&&!['fleet','property'].includes(a.guarantee))||(a.profile.monthlyNet<=0&&a.profile.balance<a.amount*.05&&a.amount>500000);
 const approved=!hardRisk&&(Math.random()*100<a.probability);
 const record={id,contractNumber,date:dateTodayLocal(),createdAt:new Date().toISOString(),amount:a.amount,term:a.term,installmentCount:a.term,purpose:a.purpose,guarantee:a.guarantee,score:a.score,probability:a.probability,monthlyRate:a.rate,installmentAmount:a.monthlyPayment,totalRepayment:a.totalRepayment,totalInterest:a.totalInterest,paidCount:0,payments:[],status:approved?'Ativo':'Recusado',firstDueDate:addMonthsToISO(dateTodayLocal(),1),reason:approved?(a.zeroRateEligible?'Aprovado pela campanha promocional simulada de taxa zero.':'Aprovado pela análise simulada. O crédito foi depositado imediatamente no Caixa.'):(hardRisk?'Recusa automática simulada: fluxo de caixa/garantia insuficiente para o risco solicitado.':'A proposta não foi aprovada nesta análise. Você pode tentar outro valor, prazo ou garantia.')};
 if(approved){
  const ledgerId=`loan-credit-${record.id}`;const mov={id:ledgerId,date:dateTodayLocal(),direction:'in',amount:record.amount,category:'Crédito de empréstimo empresarial (passivo)',description:`Contrato ${contractNumber} · ${record.term} parcelas · ${record.purpose}`,payee:'Banco Grupo Conect · crédito empresarial simulado',reference:contractNumber,source:'gcBankLoan',loanId:record.id,auto:true};
  mov.receiptText=gcBankLoanContractText(record,'COMPROVANTE DE LIBERAÇÃO IMEDIATA · CRÉDITO SIMULADO');
  if(cashLedger().some(x=>x.id===ledgerId)){showToast('Este empréstimo já está registrado no Caixa.');return;}
  const oldLedger=cashLedger();if(!writeArrayKey(CASH_LEDGER_KEY,[...oldLedger,mov]))return;
  if(!writeArrayKey(GC_BANK_LOANS_KEY,[...existing,record])){writeArrayKey(CASH_LEDGER_KEY,oldLedger);return;}
  renderCashDashboard();renderFinanceList();gcBankRender();gcBankLoanRender();gcBankShowReceipt(mov.receiptText,`liberacao-${contractNumber}.txt`);showToast(`Empréstimo aprovado! ${money(record.amount)} entrou imediatamente no Caixa.`);
 }else{
  record.receiptText=gcBankLoanContractText(record,'RESULTADO DA ANÁLISE · EMPRÉSTIMO EMPRESARIAL');if(!writeArrayKey(GC_BANK_LOANS_KEY,[...existing,record]))return;gcBankLoanRender();gcBankShowReceipt(record.receiptText,`analise-${contractNumber}.txt`);showToast('Solicitação não aprovada desta vez. O saldo do Caixa não foi alterado.');
 }
}
function gcBankLoanPay(id){
 if(!assertOwner())return;const rows=gcBankLoanRows(),idx=rows.findIndex(x=>x.id===id);if(idx<0)return;const loan=rows[idx],term=Number(loan.term||loan.installmentCount||0),paid=Number(loan.paidCount||0);if(!['Ativo','Aprovado'].includes(loan.status)||paid>=term){showToast('Este contrato não possui parcelas pendentes.');return;}
 const ledgerId=`loan-payment-${loan.id}-${paid+1}`,oldLedger=cashLedger(),already=oldLedger.find(x=>x.id===ledgerId);if(already){loan.paidCount=Math.max(paid,paid+1);loan.payments=Array.isArray(loan.payments)?loan.payments:[];if(!loan.payments.some(x=>x.ledgerId===ledgerId))loan.payments.push({number:paid+1,date:already.date,amount:Number(already.amount),ledgerId});if(loan.paidCount>=term)loan.status='Quitado';writeArrayKey(GC_BANK_LOANS_KEY,rows);gcBankRender();gcBankLoanRender();showToast('A parcela já estava contabilizada; o histórico do contrato foi sincronizado.');return;}
 const total=Number(loan.totalRepayment||Number(loan.installmentAmount)*term),repaid=(loan.payments||[]).reduce((s,p)=>s+Number(p.amount||0),0),amount=Number((paid===term-1?Math.max(0,total-repaid):Number(loan.installmentAmount)).toFixed(2));if(amount>cashBreakdown().balance+0.005){showToast(`Saldo insuficiente para esta parcela de ${money(amount)}. Saldo disponível ${money(cashBreakdown().balance)}.`);return;}
 const date=dateTodayLocal(),mov={id:ledgerId,date,direction:'out',amount,category:'Parcela de empréstimo empresarial',description:`Contrato ${loan.contractNumber||loan.id} · parcela ${paid+1}/${term}`,payee:'Banco Grupo Conect · pagamento de crédito simulado',reference:loan.contractNumber||loan.id,source:'gcBankLoanPayment',loanId:loan.id,auto:true};mov.receiptText=[gcBankLoanContractText(loan,'COMPROVANTE SIMULADO DE PAGAMENTO DE PARCELA'),' ',`Parcela paga: ${paid+1}/${term}`,`Valor debitado: ${money(amount)}`,`Data do pagamento: ${localDate(date)}`].join('\n');if(!writeArrayKey(CASH_LEDGER_KEY,[...oldLedger,mov]))return;
 loan.paidCount=paid+1;loan.payments=Array.isArray(loan.payments)?loan.payments:[];loan.payments.push({number:paid+1,date,amount,ledgerId});loan.status=loan.paidCount>=term?'Quitado':'Ativo';loan.lastPaidAt=new Date().toISOString();if(!writeArrayKey(GC_BANK_LOANS_KEY,rows)){writeArrayKey(CASH_LEDGER_KEY,oldLedger);return;}renderCashDashboard();gcBankRender();gcBankLoanRender();gcBankShowReceipt(mov.receiptText,`parcela-${loan.contractNumber||loan.id}-${paid+1}.txt`);showToast(`Parcela ${paid+1}/${term} paga. Saldo do Caixa atualizado.`);
}

function gcBankOpen(){if(!assertOwner())return;$('#gcAgendaPanel').hidden=true;$('#gcBankPanel').hidden=false;gcBankPopulateVehicles();gcBankRender();$('#gcBankPanel').scrollIntoView({behavior:'smooth',block:'start'});}
function gcBankClose(){if(!assertOwner())return;$('#gcBankPanel').hidden=true;$('#gcBankReceiptPanel').hidden=true;}
function gcAgendaOpen(){
  if(!assertOwner())return;
  const panel=$('#gcAgendaPanel');
  if(!panel){showToast('A tela da Agenda de Frota não foi encontrada.');return;}
  $('#gcBankPanel').hidden=true;
  $('#onlineServicePanel').hidden=true;
  panel.hidden=false;
  gcAgendaSelectedDate=dateTodayLocal();
  gcAgendaMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  try{
    gcAgendaSyncFleet();
    gcAgendaRender();
    showToast('Agenda de Frota aberta.');
  }catch(error){
    console.error('Erro ao atualizar Agenda de Frota:',error);
    const summary=$('#gcAgendaSummary');
    if(summary&&!summary.innerHTML.trim())summary.innerHTML='<div class="gc-inline-notice warn">A agenda foi aberta, mas houve um erro ao montar o calendário. Seus registros não foram apagados; atualize o módulo para tentar novamente.</div>';
    showToast('Agenda aberta com aviso: não foi possível atualizar todos os dados.');
  }
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function gcAgendaClose(){if(!assertOwner())return;$('#gcAgendaPanel').hidden=true;}
function gcBankSetTab(tab){if(!assertOwner())return;const names=['overview','transfer','loans','payroll','financed','ipva','statement'];names.forEach(name=>{const panel=$('#gcBankView'+name[0].toUpperCase()+name.slice(1));if(panel)panel.hidden=name!==tab;});$$('[data-bank-tab]').forEach(b=>b.classList.toggle('active',b.dataset.bankTab===tab));$('#gcBankReceiptPanel').hidden=true;if(tab==='statement')gcBankRenderStatement();if(tab==='loans'){gcBankLoanRenderPreview();gcBankLoanRender();}if(tab==='payroll')gcBankRefreshEmployees();if(tab==='financed')gcBankRenderFinanced();if(tab==='ipva'){gcBankPopulateVehicles();gcBankRenderIpva();}if(tab==='overview')gcBankRenderRecent();}
function gcBankVehicleKey(v){return `${norm(v?.company)}|${norm(v?.prefix)}`;}
function gcBankVehicles(){
  const map=new Map();const companies=new Set([...(GROUP_COMPANIES||[]),...(FLEET||[]).map(x=>x.company),...ownerFleet().map(x=>x.company),...financedBuses().map(x=>x.company),...ownerOperations().map(x=>x.company)]);
  try{const online=gcOnlineLoadState();(online.contracts||[]).forEach(x=>{if(x.company)companies.add(x.company);});}catch(e){}
  companies.forEach(company=>{try{availableBusPool(company).forEach(v=>{if(v.prefix&&v.model)map.set(gcBankVehicleKey({...v,company}),{...v,company,prefix:String(v.prefix),model:v.model});});}catch(e){}});
  ownerFleet().forEach(v=>{if(v.prefix&&v.model)map.set(gcBankVehicleKey(v),{...map.get(gcBankVehicleKey(v)),...v,company:v.company,prefix:String(v.prefix)});});
  financedBuses().forEach(f=>{const k=gcBankVehicleKey(f),old=map.get(k)||{};map.set(k,{...old,...f,company:f.company,prefix:String(f.prefix),model:f.model||old.model,chassis:f.chassis||old.chassis,source:old.source||'financed'});});
  ownerOperations().forEach(op=>{if(op.company&&op.prefix){const k=gcBankVehicleKey({company:op.company,prefix:op.prefix});if(!map.has(k))map.set(k,{company:op.company,prefix:String(op.prefix),model:op.busModel||'Modelo não informado',chassis:'',source:'operation'});}});
  loadHistory().forEach(t=>{const company=t.company||'Empresa não informada',prefix=String(t.busPrefix||'');if(prefix){const k=gcBankVehicleKey({company,prefix});if(!map.has(k))map.set(k,{company,prefix,model:t.busModel||'Modelo não informado',chassis:'',source:'history'});}});
  try{const online=gcOnlineLoadState();(online.contracts||[]).forEach(t=>{if(t.company&&t.prefix){const k=gcBankVehicleKey(t);if(!map.has(k))map.set(k,{company:t.company,prefix:String(t.prefix),model:t.model||'Modelo não informado',chassis:'',source:'online'});}});}catch(e){}
  return Array.from(map.values()).sort((a,b)=>String(a.company).localeCompare(String(b.company),'pt-BR')||String(a.prefix).localeCompare(String(b.prefix),'pt-BR',{numeric:true}));
}
function gcBankVehicleValue(v){
  const fin=financedBuses().find(x=>gcBankVehicleKey(x)===gcBankVehicleKey(v));if(fin&&Number(fin.price)>0)return Number(fin.price);
  const quote=readArrayKey(GC_ZERO_KM_QUOTES_KEY).find(q=>(q.prefixes||[]).some(p=>norm(p)===norm(v.prefix))&&norm(q.config?.company)===norm(v.company));if(quote&&Number(quote.unitPrice)>0)return Number(quote.unitPrice);
  const text=norm(`${v.model||''} ${v.chassis||''}`);if(/articulad|biarticulad/.test(text))return 950000;if(/el[eé]tric|electric/.test(text))return 1800000;if(/paradiso|viaggio|rodovi[aá]rio|double.?decker|irizar/.test(text))return 850000;if(/micro|lo-916|lo-915|volare/.test(text))return 280000;if(/midi|midibus/.test(text))return 420000;return 520000;
}
function gcBankPopulateSelect(selectId,includeBlank=true){const el=$('#'+selectId);if(!el)return;const current=el.value,vehicles=gcBankVehicles();el.innerHTML=(includeBlank?`<option value="">${selectId==='gcAgendaEventVehicle'?'Frota geral / sem veículo específico':'Selecione um ônibus...'}</option>`:'')+vehicles.map(v=>`<option value="${escapeHtml(encodeURIComponent(JSON.stringify({company:v.company,prefix:v.prefix})))}">${escapeHtml(v.company)} · ${escapeHtml(v.prefix)} · ${escapeHtml(v.model)}</option>`).join('');if(Array.from(el.options).some(o=>o.value===current))el.value=current;}
function gcBankVehicleFromSelect(id){try{const val=$('#'+id)?.value;if(!val)return null;const parsed=JSON.parse(decodeURIComponent(val));return gcBankVehicles().find(v=>gcBankVehicleKey(v)===gcBankVehicleKey(parsed))||parsed;}catch(e){return null;}}
function gcBankCardIsBlocked(){return localStorage.getItem(GC_BANK_CARD_KEY)==='blocked';}
function gcBankFormatReceipt(row,caption='COMPROVANTE GRUPO CONECT'){return [caption,'GRUPO CONECT · BANCO FICTÍCIO','Documento de simulação — não representa movimentação bancária real.','',`Código: ${row.id||makeId()}`,`Data: ${localDate(String(row.date||dateTodayLocal()).slice(0,10))}`,`Tipo: ${row.direction==='in'?'ENTRADA':'SAÍDA'}`,`Valor: ${money(Number(row.amount)||0)}`,`Categoria: ${row.category||'Movimentação'}`,`Descrição: ${row.description||'Sem descrição'}`,row.payee?`Favorecido/origem: ${row.payee}`:'',row.reference?`Referência: ${row.reference}`:'',row.company?`Empresa: ${row.company}`:'',row.prefix?`Prefixo: ${row.prefix}`:'',row.competence?`Competência: ${row.competence}`:'',`Gerado em: ${new Date().toLocaleString('pt-BR')}`].filter(Boolean).join('\n');}
function gcBankShowReceipt(text,filename='comprovante-grupo-conect.txt'){if(!assertOwner())return;gcBankCurrentReceipt=String(text||'');$('#gcBankReceiptText').textContent=gcBankCurrentReceipt;$('#gcBankReceiptPanel').hidden=false;$('#gcBankReceiptDownload').dataset.filename=filename;$('#gcBankReceiptPanel').scrollIntoView({behavior:'smooth',block:'nearest'});}
function gcBankMovementRow(row){const receipt=row.receiptText||gcBankFormatReceipt(row);return `<article class="gc-bank-movement"><div class="gc-bank-movement-main"><strong>${escapeHtml(row.category||'Movimentação')}</strong><small>${escapeHtml(localDate(String(row.date||'').slice(0,10)))} · ${escapeHtml(row.description||'Sem descrição')}${row.payee?` · Favorecido/origem: ${escapeHtml(row.payee)}`:''}${row.source==='operationSimulation'?' · automático da Operação de Linha':row.source==='onlineFretamento'?' · Atendimento Online':''}</small><div class="gc-bank-movement-actions"><button class="gc-bank-small-button" type="button" data-bank-receipt="${escapeHtml(row.id)}">Ver comprovante</button></div></div><div class="gc-bank-movement-amount ${row.direction==='in'?'in':'out'}">${row.direction==='in'?'+':'−'} ${money(Number(row.amount)||0)}</div></article>`;}
function gcBankRows(){try{return allCashMovements().filter(x=>Number.isFinite(Number(x.amount))&&Number(x.amount)!==0);}catch(e){return cashLedger();}}
function gcBankRenderRecent(){const rows=gcBankRows().slice(0,6);$('#gcBankRecentMovements').innerHTML=rows.length?rows.map(gcBankMovementRow).join(''):recordsEmpty('Nenhum movimento registrado. As viagens, entradas e saídas aparecerão aqui.');}
function gcBankRenderStatement(){const all=gcBankRows();const month=$('#gcBankStatementMonth')?.value||'',search=norm($('#gcBankStatementSearch')?.value||'');const rows=all.filter(x=>(!month||String(x.date||'').slice(0,7)===month)&&(!search||norm(`${x.category} ${x.description} ${x.payee||''} ${x.company||''} ${x.prefix||''}`).includes(search)));const incoming=rows.filter(x=>x.direction==='in').reduce((s,x)=>s+Number(x.amount||0),0),outgoing=rows.filter(x=>x.direction==='out').reduce((s,x)=>s+Number(x.amount||0),0);$('#gcBankStatementSummary').textContent=`${rows.length} movimentação(ões) · Entradas ${money(incoming)} · Saídas ${money(outgoing)} · Saldo atual ${money(cashBreakdown().balance)}. Extrato consolidado com os movimentos dos sistemas existentes.`;$('#gcBankStatementList').innerHTML=rows.length?rows.map(gcBankMovementRow).join(''):recordsEmpty('Nenhuma movimentação corresponde ao filtro.');}
function gcBankRenderOverview(){const c=cashBreakdown(),rows=gcBankRows(),inTotal=rows.filter(x=>x.direction==='in').reduce((s,x)=>s+Number(x.amount||0),0),outTotal=rows.filter(x=>x.direction==='out').reduce((s,x)=>s+Number(x.amount||0),0);$('#gcBankBalance').textContent=money(c.balance);$('#gcBankOverviewStats').innerHTML=[moneyStat('Saldo atual do Caixa espelhado',money(c.balance),c.balance>=0?'positive':'negative'),moneyStat('Total de entradas registradas',money(inTotal),'positive'),moneyStat('Total de saídas registradas',money(outTotal),'negative'),moneyStat('Ônibus financiados',String(financedBuses().length))].join('');const blocked=gcBankCardIsBlocked();$('#gcBankCardStatus').textContent=blocked?'Cartão virtual BLOQUEADO para operações simuladas.':'Cartão virtual desbloqueado para pagamentos fictícios.';$('#gcBankCardToggle').textContent=blocked?'Desbloquear cartão':'Bloquear cartão';gcBankRenderRecent();}
function gcBankRenderFinanced(){const financed=financedBuses().slice().reverse();$('#gcBankFinancedList').innerHTML=financed.length?financed.map(f=>{const rem=Math.max(0,Number(f.installmentCount||0)-Number(f.paidCount||0));return `<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(f.company)} · ${escapeHtml(f.prefix)} · ${escapeHtml(f.model)}</strong><small>${escapeHtml(f.chassis||'Chassi não informado')} · ano ${escapeHtml(f.year||'—')} · preço ${money(Number(f.price)||0)} · parcelas ${Number(f.paidCount)||0}/${Number(f.installmentCount)||0} · ${rem} restantes · próxima ${rem?localDate(addMonthsToISO(f.firstDueDate,Number(f.paidCount)||0)):'quitado'}</small></div><button class="secondary-action-button" type="button" data-bank-view-finance="${escapeHtml(f.id)}">Abrir contrato</button></div></article>`;}).join(''):recordsEmpty('Nenhum ônibus financiado cadastrado no sistema original.');const vehicles=gcBankVehicles();$('#gcBankFleetCopy').innerHTML=vehicles.length?vehicles.map(v=>`<article class="record-item"><div><strong>${escapeHtml(v.company)} · ${escapeHtml(v.prefix)} · ${escapeHtml(v.model)}</strong><small>Chassi: ${escapeHtml(v.chassis||'não informado')} · valor de referência ${money(gcBankVehicleValue(v))} · cópia de consulta, cadastro original preservado.</small></div></article>`).join(''):recordsEmpty('Nenhum veículo foi encontrado na frota.');}
function gcBankRender(){if(!$('#gcBankPanel'))return;gcBankPopulateSelect('gcBankTaxVehicle');gcBankRenderOverview();gcBankRenderStatement();gcBankRenderPayrollHistory();gcBankRenderIpva();gcBankLoanRenderPreview();gcBankLoanRender();}
function gcBankRefreshEmployees(){const el=$('#gcPayrollEmployee');if(!el)return;const current=el.value;const roster=new Map();ownerOperations().forEach(op=>{Object.values(op.drivers||{}).forEach(name=>{const n=String(name||'').trim();if(n&&norm(n)!==norm('—')&&norm(n)!==norm('Não escalado'))roster.set(`${norm(op.company)}|${norm(n)}`,{company:op.company||'Grupo Conect',name:n});});});const ordered=Array.from(roster.values()).sort((a,b)=>a.company.localeCompare(b.company,'pt-BR')||a.name.localeCompare(b.name,'pt-BR'));el.innerHTML='<option value="">Selecione um motorista escalado...</option>'+ordered.map(x=>`<option value="${escapeHtml(encodeURIComponent(JSON.stringify(x)))}">${escapeHtml(x.name)} · ${escapeHtml(x.company)}</option>`).join('');if(Array.from(el.options).some(o=>o.value===current))el.value=current;else if(ordered.length===1)el.value=el.options[1].value;gcBankLoadStaffSettings();}
function gcBankSelectedEmployee(){try{return JSON.parse(decodeURIComponent($('#gcPayrollEmployee').value||''));}catch(e){return null;}}
function gcBankSalaryDefaults(employee){const op=ownerOperations().find(x=>norm(x.company)===norm(employee?.company)&&Object.values(x.drivers||{}).some(d=>norm(d)===norm(employee?.name)));const text=norm(op?.busModel||'');return {base:/articulad/.test(text)?4104.18:/micro|midi|lo-91/.test(text)?2907.15:3420.16,meal:660,mealCopay:20,dental:27.5,includeMeal:true,includeDental:true,includeCharges:true};}
function gcBankStaffKey(employee){return `${norm(employee?.company)}|${norm(employee?.name)}`;}
function gcBankLoadStaffSettings(){const e=gcBankSelectedEmployee();if(!e)return;const prefs=gcReadObject(GC_BANK_STAFF_KEY),v=prefs[gcBankStaffKey(e)]||gcBankSalaryDefaults(e);$('#gcPayrollBase').value=Number(v.base??3420.16).toFixed(2);$('#gcPayrollMeal').value=Number(v.meal??660).toFixed(2);$('#gcPayrollMealCopay').value=Number(v.mealCopay??20).toFixed(2);$('#gcPayrollDental').value=Number(v.dental??27.5).toFixed(2);$('#gcPayrollIncludeMeal').checked=v.includeMeal!==false;$('#gcPayrollIncludeDental').checked=v.includeDental!==false;$('#gcPayrollIncludeEmployerCharges').checked=v.includeCharges!==false;if(!$('#gcPayrollCompetence').value)$('#gcPayrollCompetence').value=dateTodayLocal().slice(0,7);gcBankUpdatePayrollPreview();}
function gcBankGetPayrollInput(){const employee=gcBankSelectedEmployee(),base=Number($('#gcPayrollBase').value),meal=Number($('#gcPayrollMeal').value),copay=Math.min(meal,Number($('#gcPayrollMealCopay').value)),dental=Number($('#gcPayrollDental').value),includeMeal=$('#gcPayrollIncludeMeal').checked,includeDental=$('#gcPayrollIncludeDental').checked,includeCharges=$('#gcPayrollIncludeEmployerCharges').checked;const gross=Number.isFinite(base)&&base>=0?base:0;const inss=gcBankInss2026(gross);const mealCost=includeMeal?meal:0,actualCopay=includeMeal?copay:0,dentalCost=includeDental?dental:0,fgts=includeCharges?gross*.08:0,employerInss=includeCharges?gross*.20:0,net=Math.max(0,gross-inss-actualCopay),total=net+inss+mealCost+dentalCost+fgts+employerInss;return {employee,gross,inss,meal:mealCost,mealCopay:actualCopay,dental:dentalCost,fgts,employerInss,net,total,competence:$('#gcPayrollCompetence').value,includeMeal,includeDental,includeCharges};}
function gcBankInss2026(gross){let remain=Math.max(0,gross),last=0,total=0;const bands=[{limit:1621,rate:.075},{limit:2902.84,rate:.09},{limit:4354.27,rate:.12},{limit:8475.55,rate:.14}];for(const b of bands){const portion=Math.max(0,Math.min(remain,b.limit-last));total+=portion*b.rate;remain-=portion;last=b.limit;if(remain<=0)break;}return Math.round(total*100)/100;}
function gcBankUpdatePayrollPreview(){if(!$('#gcPayrollPreview'))return;const p=gcBankGetPayrollInput();if(!p.employee){$('#gcPayrollPreview').textContent='Cadastre e escale um motorista no Visualizador de Operação para montar a folha.';return;}const payRows=readArrayKey(GC_BANK_PAYROLL_KEY),duplicate=payRows.some(x=>gcBankStaffKey(x)===gcBankStaffKey(p.employee)&&x.competence===p.competence);$('#gcPayrollPreview').innerHTML=`<div class="finance-preview-grid"><div><span>Salário bruto</span><strong>${money(p.gross)}</strong></div><div><span>INSS estimado do empregado</span><strong>− ${money(p.inss)}</strong></div><div><span>Salário líquido a transferir</span><strong>${money(p.net)}</strong></div><div><span>Vale-alimentação</span><strong>${money(p.meal)}</strong></div><div><span>Plano odontológico</span><strong>${money(p.dental)}</strong></div><div><span>Encargos estimados (FGTS + patronal)</span><strong>${money(p.fgts+p.employerInss)}</strong></div><div><span>Custo total simulado</span><strong>${money(p.total)}</strong></div></div><p class="tool-result-note">${duplicate?'⚠ Esta competência já foi paga para este motorista.':'O INSS segue as faixas progressivas de 2026; os demais encargos são aproximações e a folha não inclui horas extras.'} Saldo disponível: ${money(cashBreakdown().balance)}.</p>`;const submit=$('#gcBankPayrollForm button[type="submit"]');if(submit)submit.disabled=duplicate||!p.employee||p.total<=0;}
function gcBankSavePayrollSettings(){if(!assertOwner())return;const p=gcBankGetPayrollInput();if(!p.employee){showToast('Selecione um motorista escalado.');return;}const values={base:p.gross,meal:Number($('#gcPayrollMeal').value)||0,mealCopay:Number($('#gcPayrollMealCopay').value)||0,dental:Number($('#gcPayrollDental').value)||0,includeMeal:p.includeMeal,includeDental:p.includeDental,includeCharges:p.includeCharges};const settings=gcReadObject(GC_BANK_STAFF_KEY);settings[gcBankStaffKey(p.employee)]=values;if(gcWriteObject(GC_BANK_STAFF_KEY,settings))showToast('Valores salvos para este motorista.');}
function gcBankRenderPayrollHistory(){const rows=readArrayKey(GC_BANK_PAYROLL_KEY).slice().reverse();$('#gcBankPayrollHistory').innerHTML=rows.length?rows.map(p=>`<article class="record-item"><div class="record-item-top"><div><strong>${escapeHtml(p.name)} · ${escapeHtml(p.company)}</strong><small>Competência ${escapeHtml(p.competence)} · líquido ${money(p.net)} · custo total ${money(p.total)} · pago em ${escapeHtml(new Date(p.paidAt).toLocaleDateString('pt-BR'))}</small></div><button class="secondary-action-button" type="button" data-bank-payroll-receipt="${escapeHtml(p.id)}">Comprovante de folha</button></div></article>`).join(''):recordsEmpty('Nenhuma folha foi paga pelo banco ainda.');}
function gcBankPayPayroll(event){event.preventDefault();if(!assertOwner()||gcBankCardIsBlocked()){showToast('Desbloqueie o cartão empresarial para realizar pagamentos simulados.');return;}const p=gcBankGetPayrollInput();if(!p.employee||!p.competence||p.gross<=0){showToast('Selecione um motorista, competência e salário válido.');return;}const existing=readArrayKey(GC_BANK_PAYROLL_KEY);if(existing.some(x=>gcBankStaffKey(x)===gcBankStaffKey(p.employee)&&x.competence===p.competence)){showToast('Esta folha já foi paga para esse motorista nesta competência.');return;}if(p.total>cashBreakdown().balance+0.005){showToast(`Saldo insuficiente. Custo da folha ${money(p.total)}; saldo ${money(cashBreakdown().balance)}.`);return;}const record={id:makeId(),company:p.employee.company,name:p.employee.name,competence:p.competence,gross:p.gross,inss:p.inss,net:p.net,meal:p.meal,mealCopay:p.mealCopay,dental:p.dental,fgts:p.fgts,employerInss:p.employerInss,total:p.total,paidAt:new Date().toISOString()};record.receiptText=['RECIBO SIMULADO DE FOLHA — GRUPO CONECT','Não é holerite legal nem documento de pagamento real.','',`Motorista: ${record.name}`,`Empresa: ${record.company}`,`Competência: ${record.competence}`,`Salário bruto: ${money(record.gross)}`,`INSS empregado (estimado): ${money(record.inss)}`,`Desconto participação VA: ${money(record.mealCopay)}`,`Líquido do salário: ${money(record.net)}`,`Vale-alimentação custeado: ${money(record.meal)}`,`Plano odontológico: ${money(record.dental)}`,`FGTS estimado: ${money(record.fgts)}`,`Contribuição patronal estimada: ${money(record.employerInss)}`,`Custo total registrado: ${money(record.total)}`,`Data do processamento: ${new Date(record.paidAt).toLocaleString('pt-BR')}`].join('\n');const rows=cashLedger(),date=dateTodayLocal(),baseId=`payroll-${record.id}`;const additions=[{id:`${baseId}-net`,date,direction:'out',amount:record.net,category:'Salário líquido · folha simulada',description:`${record.name} · ${record.company} · competência ${record.competence}`,payee:record.name,company:record.company,competence:record.competence,source:'gcBankPayroll',payrollId:record.id,receiptText:record.receiptText,auto:true},{id:`${baseId}-inss`,date,direction:'out',amount:record.inss,category:'Recolhimento INSS · folha simulada',description:`INSS retido de ${record.name} · ${record.competence}`,payee:'Recolhimento simulado',company:record.company,competence:record.competence,source:'gcBankPayroll',payrollId:record.id,receiptText:record.receiptText,auto:true}];if(record.meal>0)additions.push({id:`${baseId}-meal`,date,direction:'out',amount:record.meal,category:'Vale-alimentação · folha simulada',description:`Benefício de ${record.name} · ${record.competence}`,payee:'Benefício alimentação',company:record.company,competence:record.competence,source:'gcBankPayroll',payrollId:record.id,receiptText:record.receiptText,auto:true});if(record.dental>0)additions.push({id:`${baseId}-dental`,date,direction:'out',amount:record.dental,category:'Plano odontológico · folha simulada',description:`Benefício de ${record.name} · ${record.competence}`,payee:'Plano odontológico',company:record.company,competence:record.competence,source:'gcBankPayroll',payrollId:record.id,receiptText:record.receiptText,auto:true});if(record.fgts>0)additions.push({id:`${baseId}-fgts`,date,direction:'out',amount:record.fgts,category:'FGTS estimado · folha simulada',description:`Reserva de FGTS de ${record.name} · ${record.competence}`,payee:'FGTS simulado',company:record.company,competence:record.competence,source:'gcBankPayroll',payrollId:record.id,receiptText:record.receiptText,auto:true});if(record.employerInss>0)additions.push({id:`${baseId}-patronal`,date,direction:'out',amount:record.employerInss,category:'INSS patronal estimado · folha simulada',description:`Encargo de ${record.name} · ${record.competence}`,payee:'INSS patronal simulado',company:record.company,competence:record.competence,source:'gcBankPayroll',payrollId:record.id,receiptText:record.receiptText,auto:true});if(!writeArrayKey(CASH_LEDGER_KEY,[...rows,...additions]))return;if(!writeArrayKey(GC_BANK_PAYROLL_KEY,[...existing,record]))return;gcBankRender();renderCashDashboard();renderFinanceList();gcBankShowReceipt(record.receiptText,`folha-${record.competence}-${record.name.replace(/[^a-z0-9]+/gi,'-')}.txt`);showToast(`Folha simulada de ${record.name} paga e lançada no Caixa.`);}
function gcBankTaxHistory(){return readArrayKey(GC_BANK_IPVA_KEY);}
function gcBankTaxEstimate(v){return gcBankVehicleValue(v);}
function gcBankUpdateTaxPreview(){const v=gcBankVehicleFromSelect('gcBankTaxVehicle'),year=Number($('#gcBankTaxYear').value)||new Date().getFullYear(),value=Number($('#gcBankTaxValue').value)||0,rate=Number($('#gcBankTaxRate').value)||2,count=Number($('#gcBankTaxInstallments').value)||1,total=value*rate/100,rows=gcBankTaxHistory(),rec=v&&rows.find(x=>gcBankVehicleKey(x)===gcBankVehicleKey(v)&&Number(x.year)===year);if(!v){$('#gcBankTaxPreview').textContent='Selecione um ônibus para calcular o IPVA estimado.';return;}const amount=rec?Number(rec.total):total,inst=rec?Number(rec.installments):count,paid=rec?Number(rec.paidCount||0):0;$('#gcBankTaxPreview').innerHTML=`<strong>${escapeHtml(v.company)} · ${escapeHtml(v.prefix)} · ${escapeHtml(v.model)}</strong><p>Valor venal: ${money(rec?.baseValue??value)} · alíquota: ${numberPt(rec?.rate??rate,2)}% · IPVA estimado: ${money(amount)}.</p><p>Forma: ${inst===1?'cota única':`${inst} cotas de ${money(amount/inst)}`} · cotas pagas ${paid}/${inst}.</p><p class="tool-result-note">Estimativa para a simulação. No RJ, a referência legal para ônibus/micro-ônibus é 2%; elétricos puros podem ter alíquota de 0,5%. Confira o enquadramento e valor venal real.</p>`;const submit=$('#gcBankTaxForm button[type="submit"]');if(submit)submit.disabled=Boolean(rec&&Number(rec.paidCount)>=Number(rec.installments));}
function gcBankRenderIpva(){if(!$('#gcBankTaxHistory'))return;const rows=gcBankTaxHistory().slice().reverse();$('#gcBankTaxHistory').innerHTML=rows.length?rows.map(r=>`<article class="gc-bank-tax-record"><strong>${escapeHtml(r.company)} · ${escapeHtml(r.prefix)} · ${escapeHtml(r.model)} · IPVA ${escapeHtml(r.year)}</strong><small>Valor venal ${money(r.baseValue)} · total ${money(r.total)} · ${Number(r.paidCount)||0}/${Number(r.installments)||1} cotas pagas.</small>${(r.payments||[]).slice().reverse().map(p=>`<div class="gc-bank-movement-actions"><span>${escapeHtml(localDate(p.date))} · ${money(p.amount)} · ${escapeHtml(p.label)}</span><button class="gc-bank-small-button" type="button" data-bank-receipt="${escapeHtml(p.ledgerId)}">Comprovante</button></div>`).join('')}</article>`).join(''):recordsEmpty('Nenhum IPVA foi pago pelo banco ainda.');gcBankUpdateTaxPreview();}
function gcBankPayIpva(event){event.preventDefault();if(!assertOwner()||gcBankCardIsBlocked()){showToast('Desbloqueie o cartão empresarial para pagar o IPVA simulado.');return;}const vehicle=gcBankVehicleFromSelect('gcBankTaxVehicle');if(!vehicle){showToast('Selecione um ônibus.');return;}const year=Number($('#gcBankTaxYear').value),value=Number($('#gcBankTaxValue').value),rate=Number($('#gcBankTaxRate').value),installments=Number($('#gcBankTaxInstallments').value);if(!Number.isInteger(year)||year<2020||!Number.isFinite(value)||value<=0||![2,.5].includes(rate)||![1,3].includes(installments)){showToast('Confira o exercício, o valor venal, a alíquota e as cotas.');return;}const rows=gcBankTaxHistory();let rec=rows.find(x=>gcBankVehicleKey(x)===gcBankVehicleKey(vehicle)&&Number(x.year)===year);if(!rec){rec={id:makeId(),company:vehicle.company,prefix:vehicle.prefix,model:vehicle.model,year,baseValue:value,rate,total:Number((value*rate/100).toFixed(2)),installments,paidCount:0,payments:[],createdAt:new Date().toISOString()};}else if(rec.paidCount>=rec.installments){showToast('Todas as cotas deste IPVA já foram pagas.');return;}const index=Number(rec.paidCount)||0;if(index===0){rec.installments=installments;rec.rate=rate;rec.baseValue=value;rec.total=Number((value*rate/100).toFixed(2));}const due=Number(rec.paidCount)>=Number(rec.installments);if(due){showToast('IPVA já quitado.');return;}const dueIndex=Number(rec.paidCount)||0,paymentAmount=dueIndex===Number(rec.installments)-1?Number((Number(rec.total)-Number((Number(rec.total)/Number(rec.installments))*(Number(rec.installments)-1))).toFixed(2)):Number((Number(rec.total)/Number(rec.installments)).toFixed(2));if(paymentAmount>cashBreakdown().balance+0.005){showToast(`Saldo insuficiente para pagar ${money(paymentAmount)}. Saldo atual ${money(cashBreakdown().balance)}.`);return;}const ledgerId=`ipva-${rec.id}-cota-${dueIndex+1}`;if(cashLedger().some(x=>x.id===ledgerId)){showToast('Esta cota já aparece no livro-caixa. Reabra o extrato para consultar o comprovante.');rec.paidCount=Math.max(Number(rec.paidCount)||0,dueIndex+1);if(!rows.some(x=>x.id===rec.id))rows.push(rec);else rows[rows.findIndex(x=>x.id===rec.id)]=rec;writeArrayKey(GC_BANK_IPVA_KEY,rows);gcBankRenderIpva();return;}const mov={id:ledgerId,date:dateTodayLocal(),direction:'out',amount:paymentAmount,category:'IPVA · DETRAN fictício',description:`Ônibus ${rec.company} · prefixo ${rec.prefix} · ${rec.model} · exercício ${rec.year} · cota ${dueIndex+1}/${rec.installments}`,payee:'DETRAN fictício do RJ',company:rec.company,prefix:rec.prefix,source:'gcBankIpva',auto:true,receiptText:''};mov.receiptText=gcBankFormatReceipt(mov,'COMPROVANTE SIMULADO · IPVA');if(!writeArrayKey(CASH_LEDGER_KEY,[...cashLedger(),mov]))return;rec.paidCount=dueIndex+1;rec.payments=Array.isArray(rec.payments)?rec.payments:[];rec.payments.push({ledgerId,date:mov.date,amount:paymentAmount,label:`Cota ${rec.paidCount}/${rec.installments}`});if(!rows.some(x=>x.id===rec.id))rows.push(rec);else rows[rows.findIndex(x=>x.id===rec.id)]=rec;if(!writeArrayKey(GC_BANK_IPVA_KEY,rows))return;gcBankRender();renderCashDashboard();gcBankShowReceipt(mov.receiptText,`ipva-${rec.prefix}-${rec.year}-cota-${rec.paidCount}.txt`);showToast('Cota do IPVA fictício paga. O Caixa foi atualizado.');}
function gcBankExport(){if(!assertOwner())return;const rows=gcBankRows(),content=[['Data','Tipo','Categoria','Valor','Descrição','Origem'],...rows.map(x=>[x.date,x.direction==='in'?'Entrada':'Saída',x.category,x.amount,x.description||'',x.source||'Caixa existente'])].map(r=>r.map(csvCell).join(';')).join('\n');downloadTextFile('grupo-conect-extrato-banco.csv',content,'text/csv;charset=utf-8');showToast('Extrato consolidado exportado.');}

function gcAgendaDateAdd(iso,days){const d=dateFromISO(iso)||new Date();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function gcAgendaVehicleLabel(v){return `${v.company} · ${v.prefix} · ${v.model}`;}
function gcAgendaVehicleKey(v){return gcBankVehicleKey(v);}
function gcAgendaVehicleList(){return gcBankVehicles();}
function gcAgendaReadProfiles(){return gcReadObject(GC_AGENDA_PROFILES_KEY);}
function gcAgendaSyncFleet(){const profiles=gcAgendaReadProfiles(),vehicles=gcAgendaVehicleList(),odo=readArrayKey(ODOMETER_KEY);let changed=false;vehicles.forEach(v=>{const k=gcAgendaVehicleKey(v);let p=profiles[k];if(!p){p={key:k,company:v.company,prefix:String(v.prefix),model:v.model,currentKm:null,odoDate:'',lastOilAtKm:null,lastPreventiveAtKm:null,lastTireAtKm:null,updatedAt:''};changed=true;}else{if(p.model!==v.model||p.company!==v.company){p.model=v.model;p.company=v.company;changed=true;}}if(p.currentKm===null||p.currentKm===undefined){const candidate=odo.filter(r=>{const label=norm(r.vehicle||'');const parts=label.split(/[·|]/).map(z=>z.trim());const prefixToken=parts.includes(norm(v.prefix))||label.includes(norm(`${v.company} · ${v.prefix} ·`));return prefixToken&&Number.isFinite(Number(r.end));}).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];if(candidate){p.currentKm=Number(candidate.end);p.odoDate=candidate.date||dateTodayLocal();p.lastOilAtKm=Number(candidate.end);p.lastPreventiveAtKm=Number(candidate.end);p.lastTireAtKm=Number(candidate.end);changed=true;}}profiles[k]=p;});if(changed)gcWriteObject(GC_AGENDA_PROFILES_KEY,profiles);return profiles;}
function gcAgendaSelectedVehicle(id){return gcBankVehicleFromSelect(id);}
function gcAgendaPopulateVehicles(){['gcAgendaOdometerVehicle','gcAgendaEventVehicle'].forEach(id=>gcBankPopulateSelect(id));const first=$('#gcAgendaEventVehicle');if(first&&first.options.length&&first.options[0].value!=='')first.insertAdjacentHTML('afterbegin','<option value="">Sem veículo específico</option>');}
function gcAgendaHash(text){let h=0;for(let i=0;i<String(text).length;i++)h=(h*31+String(text).charCodeAt(i))|0;return Math.abs(h);}
function gcAgendaDoneMap(){return gcReadObject(GC_AGENDA_DONE_KEY);}
function gcAgendaHasKm(p){return Boolean(p&&p.currentKm!==null&&p.currentKm!==undefined&&p.currentKm!==''&&Number.isFinite(Number(p.currentKm)));}
function gcAgendaIsDone(id){return Boolean(gcAgendaDoneMap()[id]);}
function gcAgendaMarkDone(id){if(!assertOwner())return;const all=gcAgendaEventsForDate(gcAgendaSelectedDate),ev=all.find(x=>x.id===id)||gcAgendaFindEvent(id);if(!ev)return;const done=gcAgendaDoneMap();done[id]=new Date().toISOString();if(!gcWriteObject(GC_AGENDA_DONE_KEY,done))return;if(ev.vehicleKey){const profiles=gcAgendaReadProfiles(),p=profiles[ev.vehicleKey];if(p){const km=Number(p.currentKm);if(ev.type==='oil'&&gcAgendaHasKm(p))p.lastOilAtKm=km;if(ev.type==='tires'&&gcAgendaHasKm(p))p.lastTireAtKm=km;if(ev.type==='maintenance'&&gcAgendaHasKm(p))p.lastPreventiveAtKm=km;profiles[ev.vehicleKey]=p;gcWriteObject(GC_AGENDA_PROFILES_KEY,profiles);}if(ev.type==='clean'||ev.type==='wash'){const vehicle=gcAgendaVehicleList().find(v=>gcAgendaVehicleKey(v)===ev.vehicleKey);const row={id:makeId(),date:gcAgendaSelectedDate,vehicle:vehicle?gcAgendaVehicleLabel(vehicle):ev.vehicleLabel||ev.vehicle||'Veículo',interior:ev.type==='clean',exterior:ev.type==='wash',windows:ev.type==='clean',waste:ev.type==='clean',doneCount:ev.type==='clean'?4:1,source:'agenda-frota',notes:ev.title};writeArrayKey(CLEAN_KEY,[...readArrayKey(CLEAN_KEY),row]);}}gcAgendaRender();gcAgendaRenderHomeAlert();showToast('Tarefa marcada como concluída.');}
function gcAgendaFindEvent(id){const today=dateTodayLocal(),events=gcAgendaEventsForDate(today);return events.find(x=>x.id===id)||gcAgendaBuildAllEventForSingleId(id);}
function gcAgendaBuildAllEventForSingleId(id){const manual=readArrayKey(GC_AGENDA_EVENTS_KEY).find(x=>x.id===id);if(manual)return {...manual,vehicleKey:manual.vehicleKey||''};const legacy=loadMaintenance().find(x=>x.id===id);if(legacy)return {id:legacy.id,date:legacy.date||dateTodayLocal(),type:'maintenance',title:legacy.task,vehicle:legacy.vehicle,priority:legacy.priority||'Normal',source:'legacy'};return null;}
function gcAgendaIcon(type,urgent=false){if(urgent)return '⚠️';return ({turismo:'🧳',escolar:'🎒',fretamento:'🚌',operation:'🚌',clean:'🧽',wash:'🚿',oil:'🛢️',maintenance:'🔧',tires:'🛞',document:'📄',other:'📌',ipva:'💳'})[type]||'•';}
function gcAgendaDateForProfile(p,threshold,currentIso){const current=Number(p.currentKm),base=Number(threshold);if(!Number.isFinite(current)||!Number.isFinite(base))return null;if(current>=base)return currentIso;const daily=/paradiso|viaggio|rodovi[aá]rio|coach|irizar/.test(norm(p.model))?260:155;const kmLeft=base-current;const predicted=gcAgendaDateAdd(p.odoDate||currentIso,Math.max(1,Math.ceil(kmLeft/daily)));return predicted<currentIso?currentIso:predicted;}
function gcAgendaCreateEvent(events,obj,date){const ev={...obj,date:date||obj.date||dateTodayLocal()};if(gcAgendaIsDone(ev.id))ev.completed=true;if(!events.some(x=>x.id===ev.id))events.push(ev);}
function gcAgendaEventsForDate(targetDate){
  const target=String(targetDate||dateTodayLocal()).slice(0,10),today=dateTodayLocal(),events=[],profiles=gcAgendaSyncFleet(),vehicles=gcAgendaVehicleList(),vehicleMap=new Map(vehicles.map(v=>[gcAgendaVehicleKey(v),v])),done=gcAgendaDoneMap();
  const add=(obj,date)=>{const ev={priority:'Normal',...obj,date:date||obj.date||target};if(ev.date!==target)return;if(done[ev.id])ev.completed=true;if(!events.some(x=>x.id===ev.id))events.push(ev);};
  readArrayKey(GC_AGENDA_EVENTS_KEY).forEach(e=>{let date=e.date;if(date<today&&['maintenance','oil','tires','document'].includes(e.type))date=today;if(date===target)add({...e,vehicleKey:e.vehicleKey||'',source:'manual'},date);});
  loadMaintenance().forEach(m=>{if(!m.date)return;let date=m.date,overdue=false;const profile=vehicles.find(v=>norm(gcAgendaVehicleLabel(v))===norm(m.vehicle)||norm(`${v.company} ${v.prefix} ${v.model}`)===norm(m.vehicle)||norm(m.vehicle).includes(norm(v.prefix)));if(date<today){date=today;overdue=true;}if(m.km!==null&&m.km!==undefined&&m.km!==''&&profile){const p=profiles[gcAgendaVehicleKey(profile)];if(p&&Number(p.currentKm)>=Number(m.km)){date=today;overdue=true;}}if(date===target)add({id:m.id||`legacy-maint-${gcAgendaHash(m.task+m.vehicle+m.date)}`,type:'maintenance',title:m.task||'Manutenção cadastrada',vehicle:m.vehicle||'Veículo não especificado',company:profile?.company||'',prefix:profile?.prefix||'',vehicleKey:profile?gcAgendaVehicleKey(profile):'',priority:overdue?'Urgente':m.priority||'Normal',description:`Lembrete do sistema de manutenção${overdue?' · ATRASADO':''}${m.km?` · previsto em ${numberPt(Number(m.km),0)} km`:''}`,source:'legacy',overdue,alertImportant:overdue||['alta','urgente'].includes(norm(m.priority))||/freio|oleo|óleo|pneu|motor|dire[cç][aã]o|temperatura|superaquec|arrefecimento/.test(norm(m.task))},date);});
  ownerOperations().forEach(op=>{if(!op.id||op.status==='pausada'||gcOnlineWeekdayKey(op.weekday)!==gcOnlineWeekdayForDate(target))return;const v={company:op.company,prefix:String(op.prefix),model:op.busModel||''},key=gcAgendaVehicleKey(v);add({id:`agenda-op-${op.id}-${target}`,type:'operation',title:`Linha ${op.line||'sem nome'} · ${op.city||'cidade não informada'}`,vehicleKey:key,vehicle:gcAgendaVehicleLabel(v),company:op.company,prefix:op.prefix,description:`Operação de Linha · ${Object.values(op.drivers||{}).filter(Boolean).join(', ')||'motorista não informado'} · início ${op.startTime||'05:00'}`,priority:'Normal',source:'operation'},target);});
  try{const online=gcOnlineLoadState();(online.contracts||[]).filter(c=>c.status==='accepted'&&gcOnlineContractCoversDate(c,target)).forEach(c=>{const type=norm(c.serviceType).includes('escolar')?'escolar':norm(c.serviceType).includes('turismo')?'turismo':'fretamento';const v={company:c.company,prefix:String(c.prefix),model:c.model||''};add({id:`agenda-online-${c.id}-${target}`,type,title:`${c.clientName||'Cliente'} · ${c.origin||'origem'} → ${c.destination||'destino'}`,vehicleKey:gcAgendaVehicleKey(v),vehicle:gcAgendaVehicleLabel(v),company:c.company,prefix:c.prefix,description:`Atendimento Online · ${c.requestedDeparture||c.departureAt||'horário a confirmar'} · ${c.driver||'motorista não informado'}`,priority:'Normal',source:'online'},target);});}catch(e){}
  const serviceVehicles=events.filter(e=>['operation','tourismo','turismo','escolar','fretamento'].includes(e.type)&&e.vehicleKey);serviceVehicles.forEach(ev=>{const vehicle=vehicleMap.get(ev.vehicleKey);if(!vehicle)return;add({id:`agenda-pretrip-${ev.id}`,type:'maintenance',title:'Inspeção preventiva antes da saída',vehicleKey:ev.vehicleKey,vehicle:gcAgendaVehicleLabel(vehicle),company:vehicle.company,prefix:vehicle.prefix,description:'Conferir pneus, freios, luzes, vazamentos, níveis, portas e acessibilidade antes de qualquer viagem.',priority:'Alta',alertImportant:true,source:'auto-pretrip'},target);const alreadyClean=readArrayKey(CLEAN_KEY).some(r=>String(r.date||'').slice(0,10)===target&&norm(r.vehicle||'').includes(norm(vehicle.prefix))&&((r.doneCount||0)>=3||r.interior&&r.exterior));if(!alreadyClean)add({id:`agenda-after-clean-${ev.vehicleKey}-${target}`,type:'clean',title:'Limpeza interna após serviço',vehicleKey:ev.vehicleKey,vehicle:gcAgendaVehicleLabel(vehicle),company:vehicle.company,prefix:vehicle.prefix,description:'Rotina sugerida após operação, turismo ou fretamento.',priority:'Normal',source:'auto-clean'},target);});
  vehicles.forEach(v=>{const key=gcAgendaVehicleKey(v),p=profiles[key],current=Number(p?.currentKm);if(gcAgendaHasKm(p)){[['oil','lastOilAtKm',10000,'Troca de óleo e filtros'],['tires','lastTireAtKm',5000,'Inspeção de pneus'],['maintenance','lastPreventiveAtKm',20000,'Revisão preventiva por hodômetro']].forEach(([type,field,interval,title])=>{if(p[field]===null||p[field]===undefined)return;const threshold=Number(p[field])+interval,date=gcAgendaDateForProfile(p,threshold,today);if(date===target){const overdue=current>=threshold;add({id:`agenda-mileage-${key}-${type}-${threshold}`,type,title,vehicleKey:key,vehicle:gcAgendaVehicleLabel(v),company:v.company,prefix:v.prefix,priority:overdue?'Urgente':'Alta',description:overdue?`Hodômetro ${numberPt(current,0)} km · ultrapassou o marco de ${numberPt(threshold,0)} km.`:`Previsão por uso médio · próximo marco ${numberPt(threshold,0)} km.`,source:'odometer',dueKm:threshold,alertImportant:overdue},target);}});}
    // Rotina visual mensal: cada prefixo recebe um dia previsível, sem criar tarefas diárias excessivas.
    const d=1+(gcAgendaHash(key)%27),monthly=`${target.slice(0,7)}-${String(d).padStart(2,'0')}`;if(monthly===target)add({id:`agenda-monthly-check-${key}-${monthly}`,type:'maintenance',title:'Inspeção preventiva mensal',vehicleKey:key,vehicle:gcAgendaVehicleLabel(v),company:v.company,prefix:v.prefix,priority:'Normal',description:'Conferir freios, luzes, vazamentos, extintor e itens de segurança.',source:'monthly'},target);
    const washDay=gcAgendaHash(key+'wash')%7;const dayObj=dateFromISO(target);if(dayObj&&dayObj.getDay()===washDay&&!readArrayKey(CLEAN_KEY).some(r=>String(r.date||'').slice(0,10)===target&&norm(r.vehicle||'').includes(norm(v.prefix))&&r.exterior))add({id:`agenda-wash-${key}-${target}`,type:'wash',title:'Banho / lavagem externa semanal',vehicleKey:key,vehicle:gcAgendaVehicleLabel(v),company:v.company,prefix:v.prefix,priority:'Normal',description:'Rotina semanal de conservação e apresentação da frota.',source:'weekly-wash'},target);
  });
  gcBankTaxHistory().forEach(t=>{if(Number(t.paidCount)>=Number(t.installments))return;const due=gcAgendaDateAdd(`${t.year}-02-01`,Number(t.paidCount||0)*30);if(due===target)add({id:`agenda-ipva-${t.id}-${t.paidCount||0}`,type:'document',title:`IPVA pendente · exercício ${t.year}`,vehicleKey:gcAgendaVehicleKey(t),vehicle:`${t.company} · ${t.prefix} · ${t.model}`,company:t.company,prefix:t.prefix,priority:'Alta',description:`Revisar a próxima cota do DETRAN fictício: ${money(Number(t.total)/Math.max(1,Number(t.installments)))}`,source:'ipva'},target);});
  return events.sort((a,b)=>({Urgente:0,Alta:1,Normal:2,Baixa:3}[a.priority]??2)-({Urgente:0,Alta:1,Normal:2,Baixa:3}[b.priority]??2)||String(a.time||'').localeCompare(String(b.time||''))||String(a.title).localeCompare(String(b.title),'pt-BR'));
}
function gcAgendaEventsForMonth(iso){const d=dateFromISO(iso)||new Date();const year=d.getFullYear(),month=d.getMonth();const days=new Date(year,month+1,0).getDate(),map={};for(let day=1;day<=days;day++){const date=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;map[date]=gcAgendaEventsForDate(date);}return map;}
function gcAgendaRenderSummary(){const today=gcAgendaEventsForDate(dateTodayLocal()),fleet=gcAgendaVehicleList(),profiles=gcAgendaSyncFleet(),missing=fleet.filter(v=>!gcAgendaHasKm(profiles[gcAgendaVehicleKey(v)])).length,maint=today.filter(e=>['maintenance','oil','tires'].includes(e.type)&&!e.completed).length,service=today.filter(e=>['operation','turismo','fretamento','escolar'].includes(e.type)&&!e.completed).length;$('#gcAgendaSummary').innerHTML=[['Ônibus reconhecidos',fleet.length],['Serviços / linhas hoje',service],['Manutenções hoje',maint],['Sem hodômetro atualizado',missing]].map(([l,v])=>`<div class="gc-agenda-summary-card"><span>${escapeHtml(l)}</span><strong>${escapeHtml(String(v))}</strong></div>`).join('');}
function gcAgendaEventMarkup(ev){const isDone=ev.completed||gcAgendaIsDone(ev.id),vehicle=ev.vehicle||((ev.company||ev.prefix)?`${ev.company||''} · ${ev.prefix||''}`:'Frota geral'),urg=ev.priority==='Urgente'||ev.alertImportant;return `<article class="gc-agenda-event ${isDone?'completed':''}"><div class="gc-agenda-event-top"><div class="gc-agenda-event-main"><strong>${gcAgendaIcon(ev.type,urg)} ${escapeHtml(ev.title||'Tarefa da frota')}</strong><small>${escapeHtml(vehicle)}${ev.time?` · ${escapeHtml(ev.time)}`:''}${ev.description?` · ${escapeHtml(ev.description)}`:''}</small><div class="gc-agenda-event-badges"><span class="gc-agenda-badge ${urg?'urgent':''}">${escapeHtml(ev.priority||'Normal')}</span><span class="gc-agenda-badge">${escapeHtml(({turismo:'Turismo',escolar:'Escolar',fretamento:'Fretamento',operation:'Operação de linha',clean:'Limpeza',wash:'Lavagem',oil:'Óleo / filtros',maintenance:'Manutenção',tires:'Pneus',document:'Documento / IPVA',ipva:'IPVA',other:'Outro'})[ev.type]||'Agenda')}</span>${isDone?'<span class="gc-agenda-badge done">Concluído</span>':''}${ev.dueKm?`<span class="gc-agenda-badge">Marco ${numberPt(ev.dueKm,0)} km</span>`:''}</div></div>${!isDone?`<button type="button" class="secondary-action-button" data-agenda-done="${escapeHtml(ev.id)}">Concluir</button>`:''}</div></article>`;}
function gcAgendaRenderDay(){const iso=gcAgendaSelectedDate,events=gcAgendaEventsForDate(iso);$('#gcAgendaSelectedDayTitle').textContent=`Agenda de ${localDate(iso)}`;$('#gcAgendaDayCount').textContent=`${events.length} ${events.length===1?'item':'itens'}`;$('#gcAgendaDayEvents').innerHTML=events.length?events.map(gcAgendaEventMarkup).join(''):recordsEmpty('Nenhuma rotina cadastrada neste dia. A agenda gera linhas, serviços e lembretes de frota automaticamente quando há dados suficientes.');}
function gcAgendaRenderCalendar(){const label=$('#gcAgendaMonthLabel');if(!label)return;label.textContent=`${gcAgendaMonthNames[gcAgendaMonth.getMonth()]} ${gcAgendaMonth.getFullYear()}`;const year=gcAgendaMonth.getFullYear(),month=gcAgendaMonth.getMonth(),first=new Date(year,month,1),offset=(first.getDay()+6)%7,start=new Date(year,month,1-offset),today=dateTodayLocal();const map=gcAgendaEventsForMonth(`${year}-${String(month+1).padStart(2,'0')}-01`);let html='';for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const events=map[iso]||gcAgendaEventsForDate(iso),alerts=events.filter(e=>!e.completed&&(e.alertImportant||e.priority==='Urgente'||(e.priority==='Alta'&&['maintenance','oil','tires'].includes(e.type)))),icons=[];events.forEach(e=>{const icon=gcAgendaIcon(e.type,alerts.includes(e));if(!icons.includes(icon)&&icons.length<4)icons.push(icon);});html+=`<button type="button" class="gc-agenda-day ${d.getMonth()!==month?'outside':''} ${iso===today?'today':''} ${iso===gcAgendaSelectedDate?'selected':''}" data-agenda-date="${iso}" role="gridcell" aria-label="${escapeHtml(localDate(iso))}, ${events.length} itens"><span class="gc-agenda-day-number">${d.getDate()}</span><span class="gc-agenda-day-icons">${icons.join(' ')}</span>${events.length?`<span class="gc-agenda-day-count">${events.length} ${events.length===1?'item':'itens'}</span>`:''}</button>`;}$('#gcAgendaCalendar').innerHTML=html;}
function gcAgendaRenderFleetStatus(){const vehicles=gcAgendaVehicleList(),profiles=gcAgendaSyncFleet();$('#gcAgendaFleetStatus').innerHTML=vehicles.length?vehicles.map(v=>{const p=profiles[gcAgendaVehicleKey(v)],km=Number(p?.currentKm),hasKm=gcAgendaHasKm(p),status=hasKm?`${numberPt(km,0)} km · leitura ${localDate(p.odoDate)}`:'Hodômetro não informado';return `<article class="record-item"><div><strong>${escapeHtml(gcAgendaVehicleLabel(v))}</strong><small>${escapeHtml(status)} · próximo óleo ${hasKm&&p.lastOilAtKm!==null?`${numberPt(Number(p.lastOilAtKm)+10000,0)} km`:'definir após primeira leitura'} · revisão ${hasKm&&p.lastPreventiveAtKm!==null?`${numberPt(Number(p.lastPreventiveAtKm)+20000,0)} km`:'definir após primeira leitura'}</small></div></article>`;}).join(''):recordsEmpty('Cadastre ônibus na frota ou registre linhas para começar.');}
function gcAgendaRender(){if(!$('#gcAgendaPanel'))return;gcAgendaSyncFleet();gcAgendaPopulateVehicles();if(!$('#gcAgendaEventDate').value)$('#gcAgendaEventDate').value=dateTodayLocal();if(!$('#gcAgendaKmDate').value)$('#gcAgendaKmDate').value=dateTodayLocal();if(!gcAgendaSelectedDate)gcAgendaSelectedDate=dateTodayLocal();gcAgendaRenderSummary();gcAgendaRenderCalendar();gcAgendaRenderDay();gcAgendaRenderFleetStatus();gcAgendaRenderHomeAlert();}
function gcAgendaRenderHomeAlert(){const banner=$('#gcAgendaHomeAlert');if(!banner)return;try{const today=gcAgendaEventsForDate(dateTodayLocal());const urgent=today.filter(e=>!e.completed&&['maintenance','oil','tires'].includes(e.type)&&(e.alertImportant||e.priority==='Urgente'||e.priority==='Alta'));if(!urgent.length){banner.hidden=true;return;}const shown=urgent.slice(0,3);$('#gcAgendaAlertTitle').textContent=urgent.some(e=>e.priority==='Urgente')?'MANUTENÇÃO URGENTE PENDENTE':'Atenção: manutenção importante hoje';$('#gcAgendaAlertText').textContent=shown.map(e=>`${e.vehicle||e.company||'Frota'} — ${e.title}${e.priority==='Urgente'?' (URGENTE)':''}`).join(' · ')+(urgent.length>shown.length?` · +${urgent.length-shown.length} item(ns)`:'');banner.hidden=false;}catch(e){banner.hidden=true;}}
function gcAgendaSaveOdometer(event){event.preventDefault();if(!assertOwner())return;const v=gcAgendaSelectedVehicle('gcAgendaOdometerVehicle'),km=Number($('#gcAgendaCurrentKm').value),date=$('#gcAgendaKmDate').value;if(!v||!date||!Number.isFinite(km)||km<0){showToast('Escolha o ônibus, a data e um hodômetro válido.');return;}const key=gcAgendaVehicleKey(v),profiles=gcAgendaSyncFleet(),p=profiles[key]||{key,company:v.company,prefix:v.prefix,model:v.model,lastOilAtKm:null,lastPreventiveAtKm:null,lastTireAtKm:null};if(gcAgendaHasKm(p)&&km<Number(p.currentKm)){if(!window.confirm(`O novo hodômetro (${numberPt(km,0)} km) é menor que o anterior (${numberPt(p.currentKm,0)} km). Registrar mesmo assim?`))return;}const old=gcAgendaHasKm(p)?Number(p.currentKm):null;p.currentKm=km;p.odoDate=date;if(p.lastOilAtKm===null||p.lastOilAtKm===undefined)p.lastOilAtKm=km;if(p.lastPreventiveAtKm===null||p.lastPreventiveAtKm===undefined)p.lastPreventiveAtKm=km;if(p.lastTireAtKm===null||p.lastTireAtKm===undefined)p.lastTireAtKm=km;p.updatedAt=new Date().toISOString();profiles[key]=p;if(!gcWriteObject(GC_AGENDA_PROFILES_KEY,profiles))return;const odoRows=readArrayKey(ODOMETER_KEY);odoRows.push({id:makeId(),date,vehicle:gcAgendaVehicleLabel(v),start:old!==null?old:km,end:km,km:old!==null?km-old:0,notes:'Leitura atual registrada pela Agenda de Frota',source:'agenda-frota'});if(!writeArrayKey(ODOMETER_KEY,odoRows))return;gcAgendaRender();$('#gcAgendaCurrentKm').value='';showToast('Hodômetro atualizado. A agenda recalculou as rotinas de manutenção.');}
function gcAgendaSaveEvent(event){event.preventDefault();if(!assertOwner())return;const date=$('#gcAgendaEventDate').value,type=$('#gcAgendaEventType').value,title=$('#gcAgendaEventTitle').value.trim(),vehicle=gcAgendaSelectedVehicle('gcAgendaEventVehicle'),priority=$('#gcAgendaEventPriority').value,time=$('#gcAgendaEventTime').value,kmRaw=$('#gcAgendaEventKm').value;if(!date||!title){showToast('Informe uma data e uma descrição.');return;}const row={id:makeId(),date,type,title,time,priority,vehicle:vehicle?gcAgendaVehicleLabel(vehicle):'Frota geral',company:vehicle?.company||'',prefix:vehicle?.prefix||'',vehicleKey:vehicle?gcAgendaVehicleKey(vehicle):'',description:kmRaw?`Hodômetro previsto: ${numberPt(Number(kmRaw),0)} km`:'',dueKm:kmRaw?Number(kmRaw):null,createdAt:new Date().toISOString(),source:'manual',alertImportant:['Alta','Urgente'].includes(priority)&&['maintenance','oil','tires'].includes(type)};if(!writeArrayKey(GC_AGENDA_EVENTS_KEY,[...readArrayKey(GC_AGENDA_EVENTS_KEY),row]))return;gcAgendaSelectedDate=date;gcAgendaMonth=new Date(dateFromISO(date).getFullYear(),dateFromISO(date).getMonth(),1);$('#gcAgendaEventForm').reset();$('#gcAgendaEventDate').value=date;gcAgendaRender();showToast('Rotina adicionada ao calendário.');}
function gcAgendaOpenAlert(){if(!$('#gcAgendaHomeAlert')||$('#gcAgendaHomeAlert').hidden)return;$('#ownerUserSelect').value='Pablo';activateOwnerArea();switchScreen('ownerAreaScreen');gcAgendaOpen();}

// Eventos e sincronização dos dois aplicativos adicionais.
$('#gcBankOpenButton')?.addEventListener('click',gcBankOpen);
$('#gcBankCloseButton')?.addEventListener('click',gcBankClose);
$$('[data-bank-tab]').forEach(b=>b.addEventListener('click',()=>gcBankSetTab(b.dataset.bankTab)));
$('#gcBankCardToggle')?.addEventListener('click',()=>{if(!assertOwner())return;localStorage.setItem(GC_BANK_CARD_KEY,gcBankCardIsBlocked()?'active':'blocked');gcBankRenderOverview();showToast(gcBankCardIsBlocked()?'Cartão empresarial simulado bloqueado.':'Cartão empresarial simulado desbloqueado.');});
$('#gcBankTransactionForm')?.addEventListener('submit',event=>{event.preventDefault();if(!assertOwner()||gcBankCardIsBlocked()){showToast('Desbloqueie o cartão empresarial simulado para prosseguir.');return;}const type=$('#gcBankTransactionType').value,amount=Number($('#gcBankTransactionAmount').value),payee=$('#gcBankTransactionRecipient').value.trim(),reference=$('#gcBankTransactionKey').value.trim(),description=$('#gcBankTransactionDescription').value.trim(),direction=type.endsWith('In')?'in':'out';if(!Number.isFinite(amount)||amount<=0||!payee||!description){showToast('Preencha favorecido/origem, descrição e valor positivo.');return;}if(direction==='out'&&amount>cashBreakdown().balance+0.005){showToast(`Saldo insuficiente. Disponível ${money(cashBreakdown().balance)}.`);return;}const cat=({pixOut:'Pix enviado',transferOut:'Transferência enviada',billOut:'Pagamento de conta / boleto fictício',withdrawOut:'Saque simulado',pixIn:'Pix recebido',depositIn:'Depósito / aporte recebido'})[type]||'Movimentação bancária';const row={id:`bank-txn-${makeId()}`,date:dateTodayLocal(),direction,amount:Number(amount.toFixed(2)),category:cat,description,payee,reference,source:'gcBankTransaction',auto:true,createdAt:new Date().toISOString()};row.receiptText=gcBankFormatReceipt(row,'COMPROVANTE DE OPERAÇÃO · BANCO GRUPO CONECT');if(!writeArrayKey(CASH_LEDGER_KEY,[...cashLedger(),row]))return;$('#gcBankTransactionForm').reset();gcBankRender();renderCashDashboard();gcBankShowReceipt(row.receiptText,`comprovante-${row.id}.txt`);showToast('Movimentação simulada registrada no Caixa e no banco.');});
$('#gcBankPayrollForm')?.addEventListener('submit',gcBankPayPayroll);
$('#gcBankLoanForm')?.addEventListener('submit',gcBankLoanApply);
['gcBankLoanAmount','gcBankLoanTerm','gcBankLoanPurpose','gcBankLoanGuarantee'].forEach(id=>$('#'+id)?.addEventListener('input',gcBankLoanRenderPreview));
['gcBankLoanTerm','gcBankLoanPurpose','gcBankLoanGuarantee'].forEach(id=>$('#'+id)?.addEventListener('change',gcBankLoanRenderPreview));
$('#gcPayrollEmployee')?.addEventListener('change',gcBankLoadStaffSettings);
['gcPayrollBase','gcPayrollMeal','gcPayrollMealCopay','gcPayrollDental','gcPayrollCompetence','gcPayrollIncludeMeal','gcPayrollIncludeDental','gcPayrollIncludeEmployerCharges'].forEach(id=>$('#'+id)?.addEventListener('input',gcBankUpdatePayrollPreview));
$('#gcPayrollSaveSettings')?.addEventListener('click',gcBankSavePayrollSettings);
function gcBankLoadTaxForm(){const v=gcBankVehicleFromSelect('gcBankTaxVehicle');if(!v){gcBankUpdateTaxPreview();return;}const y=Number($('#gcBankTaxYear').value)||new Date().getFullYear(),saved=gcBankTaxHistory().find(x=>gcBankVehicleKey(x)===gcBankVehicleKey(v)&&Number(x.year)===y);if(saved){$('#gcBankTaxValue').value=Number(saved.baseValue).toFixed(2);$('#gcBankTaxRate').value=String(saved.rate);$('#gcBankTaxInstallments').value=String(saved.installments);}else{$('#gcBankTaxValue').value=gcBankTaxEstimate(v).toFixed(2);$('#gcBankTaxRate').value=/el[eé]tric|electric/.test(norm(`${v.model} ${v.chassis}`))?'0.5':'2';$('#gcBankTaxInstallments').value='1';}gcBankUpdateTaxPreview();}
$('#gcBankTaxVehicle')?.addEventListener('change',gcBankLoadTaxForm);$('#gcBankTaxYear')?.addEventListener('change',gcBankLoadTaxForm);
['gcBankTaxValue','gcBankTaxRate','gcBankTaxInstallments'].forEach(id=>$('#'+id)?.addEventListener('input',gcBankUpdateTaxPreview));
$('#gcBankTaxForm')?.addEventListener('submit',gcBankPayIpva);
$('#gcBankExportStatement')?.addEventListener('click',gcBankExport);
$('#gcBankStatementMonth')?.addEventListener('input',gcBankRenderStatement);
$('#gcBankStatementSearch')?.addEventListener('input',gcBankRenderStatement);
$('#gcBankReceiptClose')?.addEventListener('click',()=>$('#gcBankReceiptPanel').hidden=true);
$('#gcBankReceiptDownload')?.addEventListener('click',()=>{if(!assertOwner())return;downloadTextFile($('#gcBankReceiptDownload').dataset.filename||'comprovante-grupo-conect.txt',gcBankCurrentReceipt);showToast('Comprovante baixado.');});
$('#gcBankReceiptPrint')?.addEventListener('click',()=>{if(!assertOwner())return;const w=window.open('','_blank','width=720,height=780');if(!w){showToast('Permita a abertura da janela para imprimir o comprovante.');return;}w.document.write(`<html><head><title>Comprovante Grupo Conect</title><meta charset="utf-8"><style>body{font:15px Arial,sans-serif;padding:28px}pre{white-space:pre-wrap;line-height:1.5}</style></head><body><pre>${escapeHtml(gcBankCurrentReceipt)}</pre><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();});
$('#gcBankReceiptCopy')?.addEventListener('click',async()=>{if(!assertOwner())return;showToast(await copyText(gcBankCurrentReceipt)?'Comprovante copiado.':'Não foi possível copiar automaticamente.');});
$('#gcBankPanel')?.addEventListener('click',event=>{const loanPay=event.target.closest('[data-bank-loan-pay]');if(loanPay){gcBankLoanPay(loanPay.dataset.bankLoanPay);return;}const loanReceipt=event.target.closest('[data-bank-loan-receipt]');if(loanReceipt){const loan=gcBankLoanRows().find(x=>x.id===loanReceipt.dataset.bankLoanReceipt);if(loan)gcBankShowReceipt(gcBankLoanContractText(loan),'contrato-'+(loan.contractNumber||loan.id)+'.txt');return;}const b=event.target.closest('[data-bank-receipt]');if(b){if(!assertOwner())return;const row=gcBankRows().find(x=>String(x.id)===b.dataset.bankReceipt);if(row)gcBankShowReceipt(row.receiptText||gcBankFormatReceipt(row),`comprovante-${row.id}.txt`);return;}const p=event.target.closest('[data-bank-payroll-receipt]');if(p){const row=readArrayKey(GC_BANK_PAYROLL_KEY).find(x=>x.id===p.dataset.bankPayrollReceipt);if(row)gcBankShowReceipt(row.receiptText,`folha-${row.competence}-${row.name}.txt`);return;}const f=event.target.closest('[data-bank-view-finance]');if(f){if(!assertOwner())return;$('#gcBankPanel').hidden=true;renderFinanceDetail(f.dataset.bankViewFinance);$('#ownerFinancePanel').scrollIntoView({behavior:'smooth',block:'start'});$('#financeDetailPanel').scrollIntoView({behavior:'smooth',block:'start'});return;}});
$('#gcAgendaCloseButton')?.addEventListener('click',gcAgendaClose);
$('#gcAgendaPrev')?.addEventListener('click',()=>{if(!assertOwner())return;gcAgendaMonth=new Date(gcAgendaMonth.getFullYear(),gcAgendaMonth.getMonth()-1,1);gcAgendaRenderCalendar();});
$('#gcAgendaNext')?.addEventListener('click',()=>{if(!assertOwner())return;gcAgendaMonth=new Date(gcAgendaMonth.getFullYear(),gcAgendaMonth.getMonth()+1,1);gcAgendaRenderCalendar();});
$('#gcAgendaCalendar')?.addEventListener('click',event=>{const b=event.target.closest('[data-agenda-date]');if(!b)return;if(!assertOwner())return;gcAgendaSelectedDate=b.dataset.agendaDate;gcAgendaMonth=new Date(dateFromISO(gcAgendaSelectedDate).getFullYear(),dateFromISO(gcAgendaSelectedDate).getMonth(),1);gcAgendaRenderCalendar();gcAgendaRenderDay();});
$('#gcAgendaDayEvents')?.addEventListener('click',event=>{const b=event.target.closest('[data-agenda-done]');if(b)gcAgendaMarkDone(b.dataset.agendaDone);});
$('#gcAgendaOdometerForm')?.addEventListener('submit',gcAgendaSaveOdometer);
$('#gcAgendaEventForm')?.addEventListener('submit',gcAgendaSaveEvent);
$('#gcAgendaOdometerVehicle')?.addEventListener('change',()=>{const v=gcAgendaSelectedVehicle('gcAgendaOdometerVehicle'),p=v&&gcAgendaReadProfiles()[gcAgendaVehicleKey(v)];if(gcAgendaHasKm(p))$('#gcAgendaCurrentKm').value=String(p.currentKm);});
$('#gcAgendaOpenFromAlert')?.addEventListener('click',gcAgendaOpenAlert);

// Atualize as vistas ao mudar os cadastros ou receber lançamentos do caixa em outros módulos.
const gcOriginalWriteArrayKey=writeArrayKey;
writeArrayKey=function(key,items){const ok=gcOriginalWriteArrayKey(key,items);if(ok&&typeof gcBankRender==='function'&&key===CASH_LEDGER_KEY&&$('#gcBankPanel')&&!$('#gcBankPanel').hidden)gcBankRender();if(ok&&typeof gcAgendaSyncFleet==='function'&&[OWNER_FLEET_KEY,FINANCED_BUSES_KEY,ODOMETER_KEY].includes(key)){gcAgendaSyncFleet();if($('#gcAgendaPanel')&&!$('#gcAgendaPanel').hidden)gcAgendaRender();}return ok;};
const gcOriginalCashRender=renderCashDashboard;
renderCashDashboard=function(){gcOriginalCashRender();if(typeof gcBankRender==='function'&&$('#gcBankPanel')&&!$('#gcBankPanel').hidden)gcBankRender();if(typeof gcAgendaRenderHomeAlert==='function')gcAgendaRenderHomeAlert();};
const gcOriginalSwitchScreen=switchScreen;
switchScreen=function(screenId){gcOriginalSwitchScreen(screenId);if(screenId==='homeScreen')gcAgendaRenderHomeAlert();if(screenId==='ownerAreaScreen'&&ownerAllowed())gcAgendaRenderHomeAlert();};
const gcOriginalActivateOwnerArea=activateOwnerArea;
activateOwnerArea=function(){gcOriginalActivateOwnerArea();if(ownerAllowed()){gcBankRender();gcAgendaSyncFleet();gcAgendaRenderHomeAlert();}};
const gcBankInitialDate=dateTodayLocal().slice(0,7);
if($('#gcPayrollCompetence')&&!$('#gcPayrollCompetence').value)$('#gcPayrollCompetence').value=gcBankInitialDate;
if($('#gcBankTaxYear')&&!$('#gcBankTaxYear').value)$('#gcBankTaxYear').value=String(new Date().getFullYear());
if($('#gcAgendaKmDate')&&!$('#gcAgendaKmDate').value)$('#gcAgendaKmDate').value=dateTodayLocal();
if($('#gcAgendaEventDate')&&!$('#gcAgendaEventDate').value)$('#gcAgendaEventDate').value=dateTodayLocal();
if($('#gcBankTaxVehicle')){gcBankPopulateSelect('gcBankTaxVehicle');gcBankLoadTaxForm();}
if($('#gcBankPayrollForm'))gcBankRefreshEmployees();
if($('#gcAgendaPanel')){gcAgendaSyncFleet();gcAgendaPopulateVehicles();gcAgendaRenderHomeAlert();}
setInterval(()=>{try{if(ownerAllowed()){if($('#gcBankPanel')&&!$('#gcBankPanel').hidden)gcBankRender();gcAgendaRenderHomeAlert();}}catch(e){}},12000);

/* ============================================================
   GARAGEM, MECÂNICA, RH, MERCADO DE PEÇAS E RELATÓRIO DE OFICINA
   Grupo Conect — módulo integrado, dados locais de simulação.
   ============================================================
/* ============================================================
   GARAGEM / MECÂNICA / RH / MERCADO DE PEÇAS / OFICINA
   Módulos fictícios do Grupo Conect. Todos os valores, prazos e
   probabilidades são parâmetros de simulação, editáveis no site.
   ============================================================ */
const GC_GARAGE_PROFILES_KEY='grupoConect.garageProfiles.v1';
const GC_GARAGE_JOBS_KEY='grupoConect.garageJobs.v1';
const GC_GARAGE_REPORTS_KEY='grupoConect.garageReports.v1';
const GC_HR_EMPLOYEES_KEY='grupoConect.staff.v2';
const GC_PARTS_ORDERS_KEY='grupoConect.garagePartsOrders.v1';
const GC_PARTS_STOCK_KEY='grupoConect.garagePartsStock.v1';
const GC_PARTS_SUPPLY_KEY='grupoConect.garagePartsSupply.v1';
let gcGarageActiveView='mechanics';
let gcGarageSelectedVehicleKey='';
let gcGarageCurrentReviewId='';
let gcGaragePendingAgendaEventId='';
let gcGarageLinkedOperationId='';
let gcGarageLastTick=0;

const GC_GARAGE_COMPONENTS=[
  {id:'engineOil',label:'Óleo do motor',area:'Motor e filtros',lifeKm:20000,months:12,kind:'fluid'},
  {id:'oilFilter',label:'Filtro de óleo',area:'Motor e filtros',lifeKm:20000,months:12,kind:'filter'},
  {id:'fuelFilter',label:'Filtros de combustível / separador',area:'Motor e filtros',lifeKm:20000,months:12,kind:'filter'},
  {id:'airFilter',label:'Filtro de ar do motor',area:'Motor e filtros',lifeKm:30000,months:12,kind:'filter'},
  {id:'coolant',label:'Líquido de arrefecimento',area:'Arrefecimento',lifeKm:60000,months:24,kind:'fluid'},
  {id:'radiatorHoses',label:'Mangueiras e abraçadeiras',area:'Arrefecimento',lifeKm:90000,months:36,kind:'rubber'},
  {id:'waterPump',label:'Bomba d’água e termostática',area:'Arrefecimento',lifeKm:180000,months:60,kind:'mechanical'},
  {id:'belts',label:'Correias e tensionadores',area:'Motor e filtros',lifeKm:80000,months:36,kind:'rubber'},
  {id:'injectors',label:'Bicos injetores / alimentação',area:'Motor e filtros',lifeKm:300000,months:72,kind:'mechanical'},
  {id:'turbo',label:'Turbocompressor / intercooler',area:'Motor e filtros',lifeKm:350000,months:84,kind:'mechanical'},
  {id:'clutch',label:'Embreagem / atuador',area:'Transmissão',lifeKm:220000,months:72,kind:'mechanical'},
  {id:'gearbox',label:'Caixa de câmbio / lubrificante',area:'Transmissão',lifeKm:100000,months:48,kind:'fluid'},
  {id:'differential',label:'Diferencial / cruzetas / cardã',area:'Transmissão',lifeKm:120000,months:48,kind:'mechanical'},
  {id:'brakeLinings',label:'Lonas / pastilhas de freio',area:'Freios e pneumática',lifeKm:60000,months:36,kind:'wear'},
  {id:'brakeDrums',label:'Tambores / discos de freio',area:'Freios e pneumática',lifeKm:180000,months:72,kind:'wear'},
  {id:'airCompressor',label:'Compressor de ar',area:'Freios e pneumática',lifeKm:300000,months:84,kind:'mechanical'},
  {id:'airDryer',label:'Secador de ar / cartucho',area:'Freios e pneumática',lifeKm:60000,months:24,kind:'filter'},
  {id:'airChambers',label:'Câmaras de freio / válvulas',area:'Freios e pneumática',lifeKm:240000,months:72,kind:'mechanical'},
  {id:'steering',label:'Caixa de direção / terminais',area:'Suspensão e direção',lifeKm:180000,months:72,kind:'mechanical'},
  {id:'suspension',label:'Amortecedores / molas / buchas',area:'Suspensão e direção',lifeKm:120000,months:60,kind:'wear'},
  {id:'tires',label:'Pneus / recapagem / sulco',area:'Pneus e rodas',lifeKm:80000,months:60,kind:'wear'},
  {id:'wheelBearings',label:'Cubos / rolamentos / retentores',area:'Pneus e rodas',lifeKm:180000,months:72,kind:'mechanical'},
  {id:'battery',label:'Baterias e terminais',area:'Elétrica',lifeKm:100000,months:30,kind:'electrical'},
  {id:'alternator',label:'Alternador / regulador',area:'Elétrica',lifeKm:220000,months:72,kind:'electrical'},
  {id:'starter',label:'Motor de partida',area:'Elétrica',lifeKm:240000,months:84,kind:'electrical'},
  {id:'lighting',label:'Faróis / lanternas / chicote',area:'Elétrica',lifeKm:260000,months:84,kind:'electrical'},
  {id:'doors',label:'Portas / válvulas / sensores',area:'Carroceria e acessibilidade',lifeKm:160000,months:60,kind:'mechanical'},
  {id:'ramp',label:'Elevador / rampa de acessibilidade',area:'Carroceria e acessibilidade',lifeKm:120000,months:60,kind:'mechanical'},
  {id:'airConditioning',label:'Ar-condicionado / compressor / filtros',area:'Ar-condicionado',lifeKm:100000,months:24,kind:'service'},
  {id:'body',label:'Carroceria / vedação / vidros / espelhos',area:'Carroceria e acessibilidade',lifeKm:400000,months:120,kind:'body'},
  {id:'cleaning',label:'Limpeza interna / higienização',area:'Limpeza',lifeKm:2500,months:1,kind:'clean'}
];
const GC_SCR_COMPONENTS=[
  {id:'arlaFluid',label:'Nível de ARLA 32 / AdBlue',area:'SCR / emissões',lifeKm:2800,months:3,kind:'fluid'},
  {id:'arlaFilter',label:'Filtro do sistema ARLA 32',area:'SCR / emissões',lifeKm:240000,months:24,kind:'filter'},
  {id:'noxSensors',label:'Sensores NOx / sensores de temperatura',area:'SCR / emissões',lifeKm:250000,months:72,kind:'electrical'},
  {id:'adbluePump',label:'Bomba / dosador ARLA 32',area:'SCR / emissões',lifeKm:300000,months:84,kind:'mechanical'},
  {id:'scrCatalyst',label:'Catalisador SCR / tubulação',area:'SCR / emissões',lifeKm:500000,months:120,kind:'mechanical'}
];
const GC_GARAGE_ALL_COMPONENTS=[...GC_GARAGE_COMPONENTS,...GC_SCR_COMPONENTS];
function gcGarageHash(text){let h=2166136261;for(let i=0;i<String(text).length;i++){h^=String(text).charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function gcGarageClamp(n,min=0,max=100){return Math.max(min,Math.min(max,Number(n)||0));}
function gcGarageProfileKey(v){return gcBankVehicleKey(v);}
function gcGarageReadProfiles(){return readObjectKey(GC_GARAGE_PROFILES_KEY);}
function gcGarageWriteProfiles(rows){return writeObjectKey(GC_GARAGE_PROFILES_KEY,rows);}
function gcGarageEmployees(){return readArrayKey(GC_HR_EMPLOYEES_KEY);}
function gcGarageJobs(){return readArrayKey(GC_GARAGE_JOBS_KEY);}
function gcGaragePartsOrders(){return readArrayKey(GC_PARTS_ORDERS_KEY);}
function gcGaragePartsStock(){return readArrayKey(GC_PARTS_STOCK_KEY);}
function gcGarageReports(){return readArrayKey(GC_GARAGE_REPORTS_KEY);}
function gcGarageVehicleByKey(key){return gcBankVehicles().find(v=>gcGarageProfileKey(v)===key)||null;}
function gcGarageFindBusDoc(v){return readArrayKey(BUS_DOC_KEY).filter(d=>norm(d.prefix)===norm(v.prefix)).find(d=>!d.company||norm(d.company)===norm(v.company))||null;}
function gcGarageFindOdometer(v){const rows=readArrayKey(ODOMETER_KEY).filter(r=>{const label=norm(r.vehicle||'');return label.includes(norm(v.prefix))&&(!r.company||norm(r.company)===norm(v.company))&&Number.isFinite(Number(r.end));}).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));return rows[0]||null;}
function gcGarageInferYear(v,doc){const year=Number(v.year||v.bodyYear||doc?.bodyYear||doc?.chassisYear);if(year>=1980&&year<=new Date().getFullYear()+1)return year;const m=String(v.model||'').match(/\b(19\d{2}|20\d{2})\b/);return m?Number(m[1]):null;}
function gcGarageEmission(v,year,doc,stored){const text=norm(`${v.model||''} ${v.chassis||''} ${doc?.notes||''} ${doc?.fuel||''}`);if(stored&&['Euro III','Euro IV','Euro V','Euro VI'].includes(stored))return stored;if(/euro\s*vi|proconve\s*p.?8/.test(text))return 'Euro VI';if(/euro\s*v|proconve\s*p.?7|scr/.test(text))return 'Euro V';if(year>=2023)return 'Euro VI';if(year>=2012)return 'Euro V';if(year>=2006)return 'Euro IV';return 'Euro III';}
function gcGarageComponentInitial(def,age,km,isNew,seed){if(isNew)return 100;const h=seed%11;let base=78-age*1.25;const k=Math.max(0,km||0);const life=Number(def.lifeKm)||100000;const fraction=(k%life)/life;switch(def.kind){case'filter':base=54+(h*1.2)-fraction*20-age*.4;break;case'fluid':base=63+(h*.9)-fraction*24-age*.55;break;case'wear':base=82+(h*.7)-fraction*62-age*.65;break;case'rubber':base=75+(h*.8)-fraction*37-age*.65;break;case'electrical':base=83+(h*.6)-age*2.1-fraction*8;break;case'clean':base=72+(h*.6)-fraction*48;break;case'body':base=91-age*1.15-fraction*8;break;case'service':base=77+(h*.6)-fraction*33-age*.9;break;default:base=81+(h*.6)-age*1.55-fraction*31;}
return gcGarageClamp(base,8,98);}
function gcGarageOverall(p){if(!p?.components)return 0;const defs=GC_GARAGE_ALL_COMPONENTS.filter(d=>p.arlaRequired||!GC_SCR_COMPONENTS.some(x=>x.id===d.id));const vals=defs.map(d=>gcGarageClamp(p.components[d.id]?.health??75));return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;}
function gcGarageCondition(p){const n=gcGarageOverall(p);return n>=85?'Boa':n>=70?'Atenção':n>=50?'Manutenção necessária':n>=30?'Ruim':'Crítica';}
function gcGarageHealthColor(n){return n>=75?'good':n>=50?'attention':'critical';}
function gcGarageSyncFleet(){
  const vehicles=gcBankVehicles(),profiles=gcGarageReadProfiles(),agendaProfiles=typeof gcAgendaReadProfiles==='function'?gcAgendaReadProfiles():{},nowYear=new Date().getFullYear();let changed=false;
  vehicles.forEach(v=>{
    const key=gcGarageProfileKey(v),doc=gcGarageFindBusDoc(v),old=profiles[key]||{},year=gcGarageInferYear(v,doc),isZero=Boolean(v.isZeroKm||v.source==='zero-km-market'||old.isZeroKm),odo=gcGarageFindOdometer(v),agendaP=agendaProfiles[key];
    let km=old.currentKm!==undefined&&old.currentKm!==null?Number(old.currentKm):Number(v.odometer||doc?.odometer||agendaP?.currentKm||odo?.end);
    if(!Number.isFinite(km)||km<0)km=isZero?0:null;
    if(km===null&&!isZero&&year){const years=Math.max(1,nowYear-year);km=Math.round(years*(/paradiso|viaggio|rodovi[aá]rio|coach|irizar/i.test(v.model)?65000:45000));}
    const p={...old,key,company:v.company,prefix:String(v.prefix),model:v.model,chassis:v.chassis||old.chassis||doc?.chassisModel||'',year:year||old.year||null,isZeroKm:isZero,currentKm:km,odoEstimated:!isZero&&!odo&&!agendaP&&(old.odoEstimated===true||old.currentKm===undefined),usage:old.usage||'urban',updatedAt:old.updatedAt||new Date().toISOString()};
    const unknownYear=!p.year&&!isZero,unknownKm=(p.currentKm===null||p.currentKm===undefined)&&!isZero;
    p.needsBaseInput=unknownYear||unknownKm||Boolean(p.odoEstimated)||Boolean(old.needsBaseInput);
    p.emission=gcGarageEmission(v,p.year||2015,doc,old.emission);
    p.arlaRequired=['Euro V','Euro VI'].includes(p.emission);
    if(!p.components||Object.keys(p.components).length<GC_GARAGE_ALL_COMPONENTS.length){
      const age=Math.max(0,nowYear-(p.year||2015)),baseKm=Number(p.currentKm)||0,seed=gcGarageHash(key);
      p.components={...(p.components||{})};
      GC_GARAGE_ALL_COMPONENTS.forEach((def,i)=>{if(!p.components[def.id])p.components[def.id]={health:gcGarageComponentInitial(def,age,baseKm,isZero,seed+i*13),lastChangedKm:isZero?0:Math.max(0,baseKm-(baseKm%def.lifeKm)),lastChangedAt:isZero?dateTodayLocal():'',lastInspectionAt:''};});
      p.componentsSeeded=true;
      if(isZero){GC_GARAGE_ALL_COMPONENTS.forEach(def=>{p.components[def.id].health=100;});p.currentKm=Number(p.currentKm)||0;p.needsBaseInput=false;p.odoEstimated=false;}
      changed=true;
    }
    if(p.year!==old.year||p.emission!==old.emission||p.model!==old.model||p.currentKm!==old.currentKm||p.needsBaseInput!==old.needsBaseInput){profiles[key]=p;changed=true;}else if(!profiles[key]){profiles[key]=p;changed=true;}
    if(!profiles[key])profiles[key]=p;
  });
  if(changed)gcGarageWriteProfiles(profiles);
  return profiles;
}
function gcGarageGetProfile(v){const p=gcGarageSyncFleet()[gcGarageProfileKey(v)];return p||null;}
function gcGarageVehicleOption(selectId,includeBlank=true){const el=$('#'+selectId);if(!el)return;const prev=el.value;gcBankPopulateSelect(selectId,includeBlank);if(prev&&Array.from(el.options).some(o=>o.value===prev))el.value=prev;}
function gcGarageDecodeVehicleValue(value){try{return value?JSON.parse(decodeURIComponent(value)):null;}catch(e){return null;}}
function gcGarageFillSelects(){['gcGarageIntakeVehicle','gcGarageRepairVehicle','gcPartsVehicle','gcWorkshopReportVehicle'].forEach(id=>gcGarageVehicleOption(id,id==='gcPartsVehicle'||id==='gcWorkshopReportVehicle'));}
function gcGaragePopulateMechanics(){const el=$('#gcGarageRepairMechanic');if(!el)return;const previous=el.value;const rows=gcGarageEmployees().filter(x=>x.role==='mechanic'&&x.status!=='Desligado');el.innerHTML='<option value="">Selecione um mecânico contratado...</option>'+rows.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)} · Nível ${x.level||1} · ${escapeHtml(x.company||'Grupo')}</option>`).join('');if(rows.some(x=>x.id===previous))el.value=previous;}
function gcGarageRenderSummary(){const v=gcBankVehicles(),p=gcGarageSyncFleet(),rows=v.map(x=>p[gcGarageProfileKey(x)]),critical=rows.filter(x=>gcGarageOverall(x)<50).length,without=rows.filter(x=>x.needsBaseInput).length,jobs=gcGarageJobs(),active=jobs.filter(x=>['Em execução','Aguardando peças','Aguardando entrega','Reavaliação'].includes(x.status)).length,ready=jobs.filter(x=>x.status==='Aguardando conferência').length;$('#gcGarageSummary').innerHTML=[['Ônibus reconhecidos',v.length],['Manutenção crítica',critical],['Fichas a completar',without],['Serviços em andamento',active+ready]].map(([l,n])=>`<div class="gc-agenda-summary-card"><span>${escapeHtml(l)}</span><strong>${n}</strong></div>`).join('');}
function gcGarageRenderVehicleList(){const root=$('#gcGarageVehicleList');if(!root)return;const vehicles=gcBankVehicles(),profiles=gcGarageSyncFleet();root.innerHTML=vehicles.length?vehicles.map(v=>{const p=profiles[gcGarageProfileKey(v)],n=gcGarageOverall(p),cls=gcGarageHealthColor(n),pending=p.needsBaseInput?'<span class="gc-garage-tag pending">Completar ano / km</span>':'',used=p.isZeroKm?'<span class="gc-garage-tag new">0 km</span>':'<span class="gc-garage-tag">Usado / frota</span>';return `<article class="gc-garage-bus-card"><div class="gc-garage-bus-head"><div><strong>${escapeHtml(v.company)} · ${escapeHtml(v.prefix)}</strong><small>${escapeHtml(v.model)} · Chassi: ${escapeHtml(v.chassis||'não informado')}</small></div><span class="gc-garage-percent ${cls}">${n}%</span></div><div class="gc-garage-progress"><span class="${cls}" style="width:${n}%"></span></div><div class="gc-garage-bus-meta">${used}${pending}<span>${escapeHtml(gcGarageCondition(p))}</span><span>${p.currentKm!==null&&p.currentKm!==undefined?`${numberPt(Number(p.currentKm),0)} km${p.odoEstimated?' · estimado':''}`:'Hodômetro pendente'}</span><span>${escapeHtml(p.emission)}${p.arlaRequired?' · ARLA 32':''}</span></div><div class="gc-garage-actions"><button type="button" class="gc-mini-button" data-garage-detail="${escapeHtml(gcGarageProfileKey(v))}">Ver situação completa</button><button type="button" class="gc-mini-button primary" data-garage-repair-vehicle="${escapeHtml(encodeURIComponent(JSON.stringify({company:v.company,prefix:v.prefix})))}">Conserto</button></div></article>`;}).join(''):'<div class="gc-empty-state">Nenhum ônibus foi localizado na frota. Cadastre ou adquira um veículo para iniciar a mecânica.</div>';}
function gcGarageRenderDetail(key){const root=$('#gcGarageDetail');if(!root)return;const v=gcGarageVehicleByKey(key),p=v&&gcGarageGetProfile(v);if(!v||!p){root.hidden=true;return;}gcGarageSelectedVehicleKey=key;const groups={};GC_GARAGE_ALL_COMPONENTS.filter(d=>p.arlaRequired||!GC_SCR_COMPONENTS.some(x=>x.id===d.id)).forEach(d=>(groups[d.area]??=[]).push(d));const cards=Object.entries(groups).map(([area,defs])=>`<section class="gc-garage-component-group"><h4>${escapeHtml(area)}</h4><div class="gc-garage-component-grid">${defs.map(d=>{const c=p.components[d.id]||{health:75},h=gcGarageClamp(c.health),cls=gcGarageHealthColor(h),last=c.lastChangedAt?` · trocado ${escapeHtml(localDate(c.lastChangedAt))}`:'';return `<div class="gc-garage-component"><div><strong>${escapeHtml(d.label)}</strong><span>${Math.round(h)}%</span></div><div class="gc-garage-progress mini"><span class="${cls}" style="width:${h}%"></span></div><small>${h>=80?'Em boas condições':h>=60?'Acompanhar desgaste':h>=40?'Programar serviço':'Intervenção recomendada'}${last}</small></div>`;}).join('')}</div></section>`).join('');root.hidden=false;root.innerHTML=`<div class="utility-subheading"><div><span class="eyebrow">FICHA TÉCNICA DE MANUTENÇÃO</span><h3>${escapeHtml(v.company)} · ${escapeHtml(v.prefix)} · ${escapeHtml(v.model)}</h3><p>Chassi ${escapeHtml(v.chassis||'não informado')} · fabricação ${p.year||'não informada'} · ${escapeHtml(p.emission)} · hodômetro ${p.currentKm!==null?`${numberPt(Number(p.currentKm),0)} km${p.odoEstimated?' (estimado)':''}`:'não informado'}</p></div><button type="button" class="secondary-action-button" data-garage-close-detail>Fechar</button></div><div class="gc-garage-detail-summary"><strong>${gcGarageOverall(p)}% · ${escapeHtml(gcGarageCondition(p))}</strong><span>${p.arlaRequired?'Este veículo possui sistema SCR/ARLA 32: conferir nível do reagente, filtro, dosador, sensores NOx e catalisador.':'Sistema SCR/ARLA 32 não foi identificado para esta configuração.'}</span></div>${p.needsBaseInput?'<div class="gc-inline-notice">Esta condição é provisória. Complete ano de fabricação e hodômetro na ficha de usados para recalcular o desgaste com mais precisão.</div>':''}${cards}<div class="gc-garage-actions"><button type="button" class="primary-button" data-garage-repair-vehicle="${escapeHtml(encodeURIComponent(JSON.stringify({company:v.company,prefix:v.prefix})))}">Abrir conserto deste ônibus →</button></div>`;}
function gcGarageSetView(view){if(!assertOwner())return;gcGarageActiveView=['mechanics','repairs','reports'].includes(view)?view:'mechanics';['mechanics','repairs','reports'].forEach(k=>$('#gcGarageView'+k[0].toUpperCase()+k.slice(1)).hidden=k!==gcGarageActiveView);$$('[data-garage-view]').forEach(b=>b.classList.toggle('active',b.dataset.garageView===gcGarageActiveView));if(view==='mechanics'){gcGarageRenderVehicleList();gcGarageRenderDetail(gcGarageSelectedVehicleKey);}if(view==='repairs'){gcGarageRenderJobs();gcGaragePopulateMechanics();}if(view==='reports')gcGarageRenderReports();}
function gcGarageOpen(view='mechanics'){if(!assertOwner()){if($('#ownerUserSelect'))$('#ownerUserSelect').value='Pablo';activateOwnerArea();}if(!assertOwner())return;$('#gcBankPanel').hidden=true;$('#gcAgendaPanel').hidden=true;$('#onlineServicePanel').hidden=true;$('#gcGaragePanel').hidden=false;gcGarageTick();gcGarageFillSelects();gcGaragePopulateMechanics();gcGarageRenderAll();gcGarageSetView(view);$('#gcGaragePanel').scrollIntoView({behavior:'smooth',block:'start'});}
function gcGarageClose(){if(!assertOwner())return;$('#gcGaragePanel').hidden=true;}
function gcGarageRenderAll(){gcGarageSyncFleet();gcGarageFillSelects();gcGaragePopulateMechanics();gcGarageRenderSummary();gcGarageRenderVehicleList();gcGarageRenderBreakdownQueue();gcGarageRenderJobs();gcGarageRenderReports();gcGarageRenderHomeAlert();}
function gcGarageIntakeLoad(){const v=gcBankVehicleFromSelect('gcGarageIntakeVehicle');if(!v)return;const p=gcGarageGetProfile(v);$('#gcGarageIntakeYear').value=p.year||'';$('#gcGarageIntakeKm').value=p.odoEstimated?'':(p.currentKm??'');$('#gcGarageIntakeKm').placeholder=p.odoEstimated?`Estimativa ${numberPt(Number(p.currentKm)||0,0)} km — informe a leitura real`: 'Informe a leitura atual do painel';$('#gcGarageIntakeEmission').value=p.emission||'unknown';$('#gcGarageIntakeUsage').value=p.usage||'urban';}
function gcGarageIntakeSave(event){event.preventDefault();if(!assertOwner())return;const v=gcBankVehicleFromSelect('gcGarageIntakeVehicle'),year=Number($('#gcGarageIntakeYear').value),km=Number($('#gcGarageIntakeKm').value);if(!v||!Number.isInteger(year)||year<1980||year>new Date().getFullYear()||!Number.isFinite(km)||km<0){showToast('Informe ônibus, ano de fabricação válido e hodômetro atual.');return;}const profiles=gcGarageSyncFleet(),key=gcGarageProfileKey(v),p=profiles[key],oldKm=Number(p.currentKm)||0;p.year=year;p.currentKm=km;p.odoEstimated=false;p.needsBaseInput=false;p.emission=$('#gcGarageIntakeEmission').value==='unknown'?gcGarageEmission(v,year,gcGarageFindBusDoc(v),''):$('#gcGarageIntakeEmission').value;p.arlaRequired=['Euro V','Euro VI'].includes(p.emission);p.usage=$('#gcGarageIntakeUsage').value;p.updatedAt=new Date().toISOString();const age=new Date().getFullYear()-year,seed=gcGarageHash(key);GC_GARAGE_ALL_COMPONENTS.forEach((d,i)=>{const old=p.components[d.id];if(old&&old.lastChangedAt)return;p.components[d.id]={health:gcGarageComponentInitial(d,age,km,false,seed+i*13),lastChangedKm:Math.max(0,km-(km%(d.lifeKm||100000))),lastChangedAt:'',lastInspectionAt:''};});if(!gcGarageWriteProfiles(profiles))return;const ag=gcAgendaReadProfiles();ag[key]={...(ag[key]||{}),key,company:v.company,prefix:v.prefix,model:v.model,currentKm:km,odoDate:dateTodayLocal()};gcWriteObject(GC_AGENDA_PROFILES_KEY,ag);gcGarageRenderAll();gcGarageRenderDetail(key);$('#gcGarageIntakeForm').reset();showToast('Ficha técnica salva. Condição estimada recalculada pelo ano e hodômetro.');}
function gcGarageMechanicById(id){return gcGarageEmployees().find(x=>x.id===id&&x.role==='mechanic'&&x.status!=='Desligado')||null;}
function gcGarageTaskInfo(type){return ({inspection:{label:'Inspeção preventiva completa',hours:3,parts:[],affected:['engineOil','oilFilter','fuelFilter','airFilter','brakeLinings','tires','lighting','doors']},oil:{label:'Troca de óleo e filtros',hours:4,parts:[['engine-oil',1],['oil-filter',1],['fuel-filter',1],['air-filter',1]],affected:['engineOil','oilFilter','fuelFilter','airFilter']},clean:{label:'Limpeza interna e higienização',hours:2,parts:[['cleaning-kit',1]],affected:['cleaning']},wash:{label:'Lavagem externa',hours:1.5,parts:[['cleaning-kit',1]],affected:['cleaning']},tires:{label:'Pneus, alinhamento e balanceamento',hours:7,parts:[['bus-tire',2],['wheel-bearing-kit',1]],affected:['tires','wheelBearings']},brakes:{label:'Freios e sistema pneumático',hours:12,parts:[['brake-lining-kit',1],['air-chamber',1],['air-dryer-cartridge',1]],affected:['brakeLinings','brakeDrums','airChambers','airDryer']},suspension:{label:'Suspensão e direção',hours:30,parts:[['shock-absorber',2],['suspension-bushing-kit',1],['steering-terminal',1]],affected:['suspension','steering']},electrical:{label:'Elétrica e sistema de carga',hours:14,parts:[['bus-battery',1],['alternator',1],['starter-motor',1]],affected:['battery','alternator','starter','lighting']},cooling:{label:'Arrefecimento / radiador',hours:20,parts:[['radiator-hose-kit',1],['water-pump',1],['coolant',2]],affected:['coolant','radiatorHoses','waterPump']},transmission:{label:'Embreagem / transmissão',hours:60,parts:[['clutch-kit',1],['gearbox-oil',1],['transmission-filter',1]],affected:['clutch','gearbox','differential']},engine:{label:'Motor / injeção / turbo',hours:240,parts:[['engine-gasket-kit',1],['diesel-injector',1],['engine-oil',1],['oil-filter',1],['fuel-filter',1],['turbocharger',1]],affected:['engineOil','oilFilter','fuelFilter','injectors','turbo','belts','radiatorHoses']},scr:{label:'SCR / ARLA 32 / emissões',hours:24,parts:[['arla32',2],['arla-filter',1],['nox-sensor',1],['adblue-pump',1]],affected:['arlaFluid','arlaFilter','noxSensors','adbluePump','scrCatalyst']},body:{label:'Carroceria, portas e acessibilidade',hours:36,parts:[['pneumatic-door-valve',1],['door-actuator',1],['bus-light-kit',1]],affected:['body','doors','ramp','lighting']},ac:{label:'Ar-condicionado',hours:18,parts:[['ac-compressor',1],['ac-filter',1],['ac-refrigerant',1]],affected:['airConditioning']},other:{label:'Diagnóstico / outro conserto',hours:12,parts:[['diagnostic-sensor-kit',1]],affected:['engineOil','brakeLinings','lighting']}})[type]||{label:'Diagnóstico / outro conserto',hours:12,parts:[],affected:['body']};}
function gcGarageMechanicDuration(baseHours,mechanic,task){const lvl=Math.max(1,Math.min(5,Number(mechanic?.level)||1)),skill=norm(mechanic?.specialty||'');const taskKey=norm(task.label);const match=(/freio|pneum/.test(taskKey)&&/freio|pneum/.test(skill))||(/motor|inje|turbo/.test(taskKey)&&/motor|diesel|inje/.test(skill))||(/el[eé]tric|scr|arla/.test(taskKey)&&/el[eé]tric|eletr[oô]nica|scr/.test(skill))||(/transmiss|embreagem/.test(taskKey)&&/transmiss/.test(skill))||(/suspens|pneu/.test(taskKey)&&/suspens|pneu/.test(skill));const factor=Math.max(.72,1.22-lvl*.075-(match?.12:0));return Math.max(.5,Number(baseHours)*factor);}
function gcGaragePartsCatalog(){
  if(gcGaragePartsCatalog.cache)return gcGaragePartsCatalog.cache;
  const fam=[
    ['engine-oil','Óleo diesel 15W40 / 10W40','Motor e filtros',145,'diesel'],['oil-filter','Filtro de óleo lubrificante','Motor e filtros',95,'diesel'],['fuel-filter','Filtro diesel primário / secundário','Motor e filtros',130,'diesel'],['air-filter','Elemento filtro de ar','Motor e filtros',260,'diesel'],['coolant','Aditivo / fluido de arrefecimento 20L','Arrefecimento',220,'all'],['radiator-hose-kit','Kit mangueiras e abraçadeiras','Arrefecimento',460,'all'],['water-pump','Bomba d’água','Arrefecimento',980,'diesel'],['bus-tire','Pneu radial ônibus 275/80 R22.5','Pneus e rodas',2850,'heavy'],['bus-tire-17','Pneu radial 215/75 R17.5','Pneus e rodas',1650,'micro'],['wheel-bearing-kit','Rolamento / retentor de cubo','Pneus e rodas',780,'heavy'],['wheel-bearing-kit-17','Rolamento / retentor de cubo para micro-ônibus','Pneus e rodas',520,'micro'],['brake-lining-kit','Jogo de lonas / pastilhas de freio','Freios e pneumática',690,'all'],['brake-disc','Disco / tambor de freio','Freios e pneumática',1180,'all'],['air-chamber','Câmara de freio pneumática','Freios e pneumática',420,'pneumatic'],['air-dryer-cartridge','Cartucho secador de ar','Freios e pneumática',390,'pneumatic'],['shock-absorber','Amortecedor de ônibus','Suspensão e direção',780,'heavy'],['suspension-bushing-kit','Kit buchas / pinos de suspensão','Suspensão e direção',620,'all'],['steering-terminal','Terminal / barra de direção','Suspensão e direção',410,'all'],['bus-battery','Bateria pesada 150–200 Ah','Elétrica',1450,'electrical'],['alternator','Alternador 24V','Elétrica',1950,'electrical'],['starter-motor','Motor de partida 24V','Elétrica',1850,'electrical'],['bus-light-kit','Kit iluminação / lanternas LED','Elétrica',340,'electrical'],['belt-kit','Kit correias e tensionadores','Motor e filtros',520,'diesel'],['diesel-injector','Bico injetor diesel eletrônico','Motor e filtros',1680,'diesel'],['turbocharger','Turbocompressor diesel','Motor e filtros',6200,'diesel'],['engine-gasket-kit','Jogo de juntas / cabeçote','Motor e filtros',2450,'diesel'],['clutch-kit','Kit embreagem pesado','Transmissão',4800,'heavy'],['gearbox-oil','Óleo de transmissão / caixa','Transmissão',380,'all'],['transmission-filter','Filtro de transmissão','Transmissão',270,'all'],['differential-oil','Lubrificante diferencial','Transmissão',310,'all'],['radiator','Radiador / colmeia','Arrefecimento',2950,'heavy'],['thermostat','Válvula termostática','Arrefecimento',220,'diesel'],['air-compressor','Compressor de ar do sistema pneumático','Freios e pneumática',3400,'pneumatic'],['air-valve','Válvula pneumática de freio','Freios e pneumática',780,'pneumatic'],['air-line-kit','Tubulação / conexões pneumáticas','Freios e pneumática',330,'pneumatic'],['arla32','ARLA 32 / AdBlue 20L','SCR e ARLA 32',115,'scr'],['arla-filter','Filtro do sistema ARLA 32','SCR e ARLA 32',420,'scr'],['nox-sensor','Sensor NOx / temperatura SCR','SCR e ARLA 32',1950,'scr'],['adblue-pump','Bomba / dosador ARLA 32','SCR e ARLA 32',2900,'scr'],['scr-catalyst','Catalisador SCR','SCR e ARLA 32',7800,'scr'],['diagnostic-sensor-kit','Sensores / chicote diagnóstico','Elétrica',680,'electrical'],['pneumatic-door-valve','Válvula pneumática da porta','Carroceria e portas',490,'pneumatic'],['door-actuator','Atuador / motor de porta','Carroceria e portas',950,'electrical'],['bus-seat','Poltrona de passageiro','Carroceria e portas',850,'all'],['accessibility-ramp-kit','Peças de elevador / rampa','Carroceria e portas',1650,'all'],['windshield','Para-brisa / vidro frontal','Carroceria e portas',2950,'all'],['mirror-kit','Kit espelho retrovisor','Carroceria e portas',620,'all'],['wiper-kit','Palhetas / braço limpador','Carroceria e portas',260,'all'],['ac-compressor','Compressor ar-condicionado','Ar-condicionado',3200,'all'],['ac-filter','Filtro secador / cabine A/C','Ar-condicionado',240,'all'],['ac-refrigerant','Fluido refrigerante / óleo A/C','Ar-condicionado',360,'all'],['ac-condenser','Condensador de ar-condicionado','Ar-condicionado',1850,'all'],['cleaning-kit','Kit limpeza / higienização interna','Limpeza e oficina',180,'all'],['degreaser','Desengraxante oficina 5L','Limpeza e oficina',95,'all'],['grease-kit','Graxa / lubrificação de chassis','Limpeza e oficina',170,'all'],['fire-extinguisher','Extintor e suporte conforme aplicação','Limpeza e oficina',210,'all'],['fuse-relay-kit','Kit fusíveis e relés 24V','Elétrica',180,'electrical'],['headlamp','Farol / conjunto óptico','Elétrica',720,'electrical'],['fuel-hose','Mangueira alimentação diesel','Motor e filtros',160,'diesel'],['turbo-hose','Mangueira intercooler reforçada','Motor e filtros',285,'diesel'],['engine-mount','Coxim de motor','Motor e filtros',580,'diesel'],['kingpin-kit','Pino mestre / reparo manga de eixo','Suspensão e direção',780,'heavy'],['hub-seal','Retentor / vedação de cubo','Pneus e rodas',130,'heavy'],['steering-oil','Óleo hidráulico direção','Suspensão e direção',180,'all'],['battery-switch','Chave geral / corta-corrente','Elétrica',290,'electrical']
  ];
  const brands={
    'Motor e filtros':['MANN-FILTER','Mahle','Fleetguard','Donaldson','Bosch','Mercedes-Benz Genuine','Volkswagen Genuine','Cummins Filtration','Tecfil'],
    'Arrefecimento':['Mahle Behr','Valeo','Gates','Dayco','Bosch','Mercedes-Benz Genuine','Volkswagen Genuine'],
    'Pneus e rodas':['Michelin','Bridgestone','Goodyear','Continental','Pirelli','Firestone','Dunlop'],
    'Freios e pneumática':['Knorr-Bremse','WABCO','Fras-le','Cobreq','Meritor','Bendix','Bosch'],
    'Suspensão e direção':['ZF','Schaeffler','SKF','Timken','Monroe','Cofap','Nakata'],
    'Elétrica':['Bosch','Hella','Valeo','Moura','Heliar','WEG','Mercedes-Benz Genuine'],
    'Transmissão':['ZF','Eaton','Sachs','LuK','Dana','Mercedes-Benz Genuine','Volkswagen Genuine'],
    'SCR e ARLA 32':['Bosch','Continental','Cummins Emission Solutions','Dinex','Eberspächer','Mercedes-Benz Genuine','Volkswagen Genuine'],
    'Carroceria e portas':['FSS','Spheros','WABCO','Bosch','Marcopolo Peças','Caio Peças'],
    'Ar-condicionado':['Valeo','Spheros','Thermo King','Denso','Mahle Behr','Marcopolo Peças'],
    'Limpeza e oficina':['3M','Vonixx','Würth','Car80','Kärcher','Lusqtoff']
  };
  const qualities=[['Original / genuína',1.38],['Premium',1.16],['Reposição confiável',1],['Econômica',.78]];
  const specs=['Padrão urbano','Aplicação rodoviária','Aplicação severa','Alta durabilidade','Série atual'];
  const rows=[];
  fam.forEach((f,fi)=>{const[family,name,category,base,compat]=f;const set=brands[category]||brands['Motor e filtros'];set.forEach((brand,bi)=>{qualities.forEach((q,qi)=>{specs.forEach((spec,si)=>{const seed=gcGarageHash(`${family}|${brand}|${q[0]}|${spec}`),variant=.91+(seed%21)/100,price=Number((base*q[1]*variant).toFixed(2)),id=`part-${family}-${bi}-${qi}-${si}`;rows.push({id,family,name,category,brand,quality:q[0],spec,compatibility:compat,reference:`GC-${String(seed).slice(0,7)}-${String(fi+1).padStart(2,'0')}`,price,localStock:seed%23===0?2:seed%23===1?1:0,promo:seed%19===0,promoPct:seed%19===0?10+(seed%11):0,description:`${name} · ${brand} · ${spec}. Confirmar código OEM e aplicação pelo chassi.`,seed});});});});});
  gcGaragePartsCatalog.cache=rows;return rows;
}
function gcGaragePartPrice(part){return Number((part.price*(part.promo?1-part.promoPct/100:1)).toFixed(2));}
function gcGaragePartCompatible(part,v,p){const text=norm(`${v?.model||''} ${v?.chassis||''}`);if(part.compatibility==='scr'&&!p?.arlaRequired)return false;if(part.compatibility==='micro'&&!/micro|volare|lo-9|9\.160|916/.test(text))return false;if(part.compatibility==='heavy'&&/micro|volare|lo-9|9\.160|916/.test(text))return false;if(part.compatibility==='pneumatic'&&!/of-|o500|17\.|15\.|volvo|scania|iveco|volkswagen|mercedes/.test(text))return false;return true;}
function gcGarageVehicleIsMicro(v){return /micro|volare|lo-9|lo-916|lo-915|9\.160|916/.test(norm(`${v?.model||''} ${v?.chassis||''}`));}
function gcGaragePartsNeed(task,vehicle=null){let list=(task.parts||[]).map(([family,qty])=>({family,qty}));const text=norm(`${vehicle?.model||''} ${vehicle?.chassis||''}`);if(gcGarageVehicleIsMicro(vehicle)){list=list.map(x=>x.family==='bus-tire'?{...x,family:'bus-tire-17'}:x.family==='wheel-bearing-kit'?{...x,family:'wheel-bearing-kit-17'}:x);if(/lo-916|lo-915/.test(text)&&list.some(x=>x.family==='air-chamber')){list=list.filter(x=>!['air-chamber','air-dryer-cartridge'].includes(x.family));list.push({family:'brake-disc',qty:1});}}return list.map(x=>({...x,label:gcGaragePartsCatalog().find(p=>p.family===x.family)?.name||x.family}));}
function gcGarageStockCount(family){return gcGaragePartsStock().filter(x=>x.family===family).reduce((s,x)=>s+Number(x.qty||0),0);}
function gcGarageConsumeAvailableStock(job){
  const stock=gcGaragePartsStock(),catalog=gcGaragePartsCatalog(),used=Array.isArray(job.partsUsedFromStock)?job.partsUsedFromStock:[],vehicle=gcGarageVehicleByKey(job.vehicleKey),profile=vehicle&&gcGarageGetProfile(vehicle);
  (job.requiredParts||[]).forEach(req=>{
    let need=Math.max(0,Number(req.qty||1)-Number(job.partsReceived?.[req.family]||0));
    if(!need)return;
    for(let i=stock.length-1;i>=0&&need>0;i--){const row=stock[i];if(row.family!==req.family)continue;const product=catalog.find(x=>x.id===row.productId);if(!product||vehicle&&!gcGaragePartCompatible(product,vehicle,profile))continue;if(job.requiresOriginal&&product.quality!=='Original / genuína')continue;const take=Math.min(need,Number(row.qty)||0);if(!take)continue;need-=take;job.partsReceived=job.partsReceived||{};job.partsReceived[req.family]=(Number(job.partsReceived[req.family])||0)+take;const unitPrice=Number(row.unitPrice??(product?gcGaragePartPrice(product):0));used.push({productId:row.productId,family:req.family,quantity:take,quality:product?.quality||'Desconhecida',name:product?.name||req.label,unitPrice,total:Number((unitPrice*take).toFixed(2)),source:'estoque'});row.qty=Number(row.qty)-take;if(row.qty<=0)stock.splice(i,1);}
  });
  job.partsUsedFromStock=used;writeArrayKey(GC_PARTS_STOCK_KEY,stock);return job;
}
function gcGarageJobPartsReady(job){return (job.requiredParts||[]).every(x=>Number(job.partsReceived?.[x.family]||0)>=Number(x.qty||1));}
function gcGarageAddBusinessDays(start,days){const d=new Date(start),time=[d.getHours(),d.getMinutes(),d.getSeconds(),d.getMilliseconds()];let left=Math.max(1,Number(days)||1),guard=0;while(left>0&&guard++<40){d.setDate(d.getDate()+1);if(d.getDay()===0||d.getDay()===6)continue;left--;}d.setHours(...time);if(d.getHours()>=17){d.setDate(d.getDate()+1);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);d.setHours(17,0,0,0);}return d;}
function gcGarageAddWorkingHours(start,hours){let d=new Date(start),remaining=Math.max(.5,Number(hours)||.5),guard=0;const nextWorkday=()=>{d.setDate(d.getDate()+1);d.setHours(8,0,0,0);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);};while(remaining>.0001&&guard++<1500){const day=d.getDay();if(day===0||day===6){nextWorkday();continue;}const h=d.getHours()+d.getMinutes()/60+d.getSeconds()/3600;if(h<8){d.setHours(8,0,0,0);continue;}if(h>=17){nextWorkday();continue;}if(h>=12&&h<13){d.setHours(13,0,0,0);continue;}const end=h<12?12:17,available=Math.max(.0001,end-h),take=Math.min(remaining,available);d=new Date(d.getTime()+take*3600000);remaining-=take;}return d;}
function gcGarageStartJob(job){const jobs=gcGarageJobs(),ix=jobs.findIndex(x=>x.id===job.id);if(ix<0)return;const mechanic=gcGarageMechanicById(job.mechanicId),task=gcGarageTaskInfo(job.taskType);job.status='Em execução';job.startedAt=job.startedAt||new Date().toISOString();job.estimatedHours=gcGarageMechanicDuration(task.hours,mechanic,task);job.finishAt=gcGarageAddWorkingHours(new Date(),job.estimatedHours).toISOString();job.statusMessage=`Serviço iniciado por ${mechanic?.name||'mecânico'}. Previsão de ${gcGarageFormatDuration(job.estimatedHours)}; conclusão estimada ${new Date(job.finishAt).toLocaleString('pt-BR')}.`;jobs[ix]=job;writeArrayKey(GC_GARAGE_JOBS_KEY,jobs);}
function gcGarageTryStartJob(job){if(gcGarageJobPartsReady(job)){gcGarageStartJob(job);return true;}job.status='Aguardando peças';job.statusMessage='Aguardando todos os itens da ordem chegarem ao estoque da oficina.';return false;}
function gcGarageApplyDeliveredOrder(order){const orders=gcGaragePartsOrders(),oi=orders.findIndex(x=>x.id===order.id);if(oi<0||order.status==='Entregue')return;order.status='Entregue';order.deliveredAt=new Date().toISOString();orders[oi]=order;writeArrayKey(GC_PARTS_ORDERS_KEY,orders);if(order.jobId){const jobs=gcGarageJobs(),ix=jobs.findIndex(x=>x.id===order.jobId);if(ix>=0){const j=jobs[ix];if(!j.requiresOriginal||order.quality==='Original / genuína'){j.partsReceived=j.partsReceived||{};j.partsReceived[order.family]=(Number(j.partsReceived[order.family])||0)+Number(order.quantity||1);}else{order.jobId='';order.statusNote='Peça recebida para estoque geral; OS exige peça original.';orders[oi]=order;writeArrayKey(GC_PARTS_ORDERS_KEY,orders);const stock=gcGaragePartsStock();stock.push({id:makeId(),productId:order.productId,family:order.family,qty:Number(order.quantity)||1,unitPrice:Number(order.unitPrice)||0,quality:order.quality||'',receivedAt:order.deliveredAt,company:order.company||''});writeArrayKey(GC_PARTS_STOCK_KEY,stock);}jobs[ix]=j;writeArrayKey(GC_GARAGE_JOBS_KEY,jobs);gcGarageTryStartJob(j);}}else{const stock=gcGaragePartsStock();stock.push({id:makeId(),productId:order.productId,family:order.family,qty:Number(order.quantity)||1,unitPrice:Number(order.unitPrice)||0,quality:order.quality||'',receivedAt:order.deliveredAt,company:order.company||''});writeArrayKey(GC_PARTS_STOCK_KEY,stock);}}
function gcGarageTick(){const now=Date.now();if(now-gcGarageLastTick<900)return;gcGarageLastTick=now;let changed=false;const orders=gcGaragePartsOrders();orders.forEach(o=>{if(o.status!=='Entregue'&&Number(o.dueAt)<=now){gcGarageApplyDeliveredOrder(o);changed=true;}});const jobs=gcGarageJobs();jobs.forEach(j=>{if(['Em execução','Reavaliação'].includes(j.status)&&j.finishAt&&new Date(j.finishAt).getTime()<=now){j.status='Aguardando conferência';j.readyAt=new Date(now).toISOString();j.statusMessage='Serviço terminado. Aguardando conferência e liberação do proprietário.';changed=true;}});if(changed)writeArrayKey(GC_GARAGE_JOBS_KEY,jobs);gcGarageRenderHomeAlert();if($('#gcGaragePanel')&&!$('#gcGaragePanel').hidden){gcGarageRenderSummary();gcGarageRenderJobs();gcGarageRenderBreakdownQueue();gcGarageRenderReports();}}
function gcGarageRequiredPartsText(job){return (job.requiredParts||[]).map(x=>`${x.label||x.family} × ${x.qty} (${job.partsReceived?.[x.family]||0}/${x.qty})`).join(' · ')||'Sem peças de reposição';}
function gcGarageFormatDuration(hours){const h=Math.max(.5,Number(hours)||.5);if(h<8)return `${numberPt(h,1)} hora(s) útil(is)`;const days=h/8;if(days<5)return `${numberPt(days,1)} dia(s) útil(is) · ${numberPt(h,0)} h de oficina`;return `${numberPt(days/5,1)} semana(s) útil(is) · ${numberPt(h,0)} h de oficina`;}
function gcGarageEstimateRepair(){const task=gcGarageTaskInfo($('#gcGarageRepairType')?.value||'inspection'),vehicle=gcBankVehicleFromSelect('gcGarageRepairVehicle'),mech=gcGarageMechanicById($('#gcGarageRepairMechanic')?.value),hours=gcGarageMechanicDuration(task.hours,mech,task),parts=gcGaragePartsNeed(task,vehicle);if($('#gcGarageRepairEstimate'))$('#gcGarageRepairEstimate').innerHTML=`<strong>Prazo estimado:</strong> ${gcGarageFormatDuration(hours)} com ${escapeHtml(mech?.name||'mecânico nível 1')}. <strong>Peças previstas:</strong> ${escapeHtml(parts.map(x=>`${x.label} × ${x.qty}`).join(', ')||'nenhuma')}. O prazo começa quando os itens necessários estiverem disponíveis.`;}
function gcGarageCreateJob(event){event.preventDefault();if(!assertOwner())return;const v=gcBankVehicleFromSelect('gcGarageRepairVehicle'),mechanic=gcGarageMechanicById($('#gcGarageRepairMechanic').value),type=$('#gcGarageRepairType').value,location=$('#gcGarageRepairLocation').value,task=gcGarageTaskInfo(type),p=v&&gcGarageGetProfile(v);if(!v||!mechanic){showToast(!mechanic?'Contrate um mecânico em Atendimento Online → Equipe antes de abrir a ordem.':'Selecione um ônibus.');return;}if(type==='scr'&&!p?.arlaRequired){showToast('Este ônibus não foi identificado com sistema SCR/ARLA 32. Confirme a norma de emissões na ficha técnica.');return;}const requiredParts=gcGaragePartsNeed(task,v),job={id:`os-${makeId()}`,company:v.company,prefix:String(v.prefix),model:v.model,chassis:v.chassis||'',vehicleKey:gcGarageProfileKey(v),garage:location,mechanicId:mechanic.id,mechanicName:mechanic.name,mechanicLevel:mechanic.level||1,mechanicSpecialty:mechanic.specialty||'',taskType:type,taskLabel:task.label,description:$('#gcGarageRepairDescription').value.trim(),urgency:$('#gcGarageRepairUrgency').value,requiredParts,partsReceived:{},partsOrders:[],partsUsedFromStock:[],requiresOriginal:false,affectedComponents:task.affected,agendaEventId:gcGaragePendingAgendaEventId||'',operationId:gcGarageLinkedOperationId||'',status:'Aguardando peças',createdAt:new Date().toISOString(),createdDate:dateTodayLocal(),laborRate:48+Number(mechanic.level||1)*9};const jobs=gcGarageJobs();jobs.push(job);if(!writeArrayKey(GC_GARAGE_JOBS_KEY,jobs))return;gcGaragePendingAgendaEventId='';gcGarageLinkedOperationId='';gcGarageConsumeAvailableStock(job);if(!requiredParts.length||gcGarageJobPartsReady(job)){job.status='Em execução';gcGarageStartJob(job);}else{job.status='Aguardando peças';job.statusMessage='Aguardando itens da ordem. Confira o Mercado de Peças para completar a lista.';const saved=gcGarageJobs(),si=saved.findIndex(x=>x.id===job.id);if(si>=0){saved[si]=job;writeArrayKey(GC_GARAGE_JOBS_KEY,saved);}}$('#gcGarageRepairForm').reset();gcGaragePopulateMechanics();gcGarageFillSelects();gcGarageRenderAll();gcGarageSetView('repairs');showToast(`Ordem ${job.id} criada. ${job.status==='Em execução'?'O mecânico iniciou o serviço.':'Confira as peças necessárias no Mercado de Peças do celular.'}`);}
function gcGarageRenderJobs(){const root=$('#gcGarageJobsList');if(!root)return;const rows=gcGarageJobs().slice().reverse();root.innerHTML=rows.length?rows.slice(0,80).map(j=>`<article class="gc-garage-job-card"><div class="gc-garage-job-head"><div><strong>${escapeHtml(j.company)} · ${escapeHtml(j.prefix)} · ${escapeHtml(j.taskLabel)}</strong><small>${escapeHtml(j.model)} · ${escapeHtml(j.mechanicName)} · ${escapeHtml(j.garage)}</small></div><span class="gc-garage-tag ${j.status==='Aguardando conferência'?'ready':j.status==='Em execução'?'working':j.status==='Concluído'?'new':'pending'}">${escapeHtml(j.status)}</span></div><p>${escapeHtml(j.description||'Serviço programado')}${j.finishAt?` · Previsão: ${new Date(j.finishAt).toLocaleString('pt-BR')} · ${gcGarageFormatDuration(j.estimatedHours||0)}`:''}</p><small>Peças: ${escapeHtml(gcGarageRequiredPartsText(j))}</small><div class="gc-garage-actions">${j.status==='Aguardando conferência'?`<button type="button" class="gc-mini-button primary" data-garage-review="${escapeHtml(j.id)}">Conferir serviço</button>`:''}${j.status==='Aguardando peças'?`<button type="button" class="gc-mini-button" data-garage-job-parts="${escapeHtml(j.id)}">Comprar peças</button>`:''}</div></article>`).join(''):'<div class="gc-empty-state">Nenhuma ordem de serviço aberta. O botão Conserto está sempre disponível na ficha de cada ônibus.</div>';}
function gcGarageReview(jobId){const j=gcGarageJobs().find(x=>x.id===jobId),root=$('#gcGarageReviewPanel');if(!j||!root)return;gcGarageCurrentReviewId=jobId;const v=gcGarageVehicleByKey(j.vehicleKey),p=v&&gcGarageGetProfile(v);const components=(j.affectedComponents||[]).map(id=>GC_GARAGE_ALL_COMPONENTS.find(c=>c.id===id)).filter(Boolean);root.hidden=false;root.innerHTML=`<div class="utility-subheading"><div><span class="eyebrow">CONFERÊNCIA DO PROPRIETÁRIO</span><h3>Ônibus pronto para avaliação · ${escapeHtml(j.prefix)}</h3><p>${escapeHtml(j.model)} · ${escapeHtml(j.taskLabel)} · mecânico ${escapeHtml(j.mechanicName)} (nível ${j.mechanicLevel})</p></div></div><div class="gc-inline-notice">O mecânico informa o serviço executado. Confira cada item antes de liberar o ônibus.</div><div class="gc-garage-component-grid">${components.map(c=>`<div class="gc-garage-component"><strong>${escapeHtml(c.label)}</strong><small>Condição atual estimada: ${Math.round(p?.components?.[c.id]?.health??70)}% → após aprovação: ${j.taskType==='clean'||j.taskType==='wash'?'limpeza atualizada':'componente revisado / substituído'}</small></div>`).join('')}</div><p><strong>Peças e quantidades:</strong> ${escapeHtml(gcGarageRequiredPartsText(j))}</p><p><strong>Peças adquiridas nesta OS:</strong> ${escapeHtml(gcGarageJobsPartsSummary(j))}</p><p><strong>Tempo de serviço:</strong> ${numberPt(j.estimatedHours||0,1)} h · <strong>Garagem:</strong> ${escapeHtml(j.garage)}</p><label class="gc-field"><span>Motivo se você recusar</span><select id="gcGarageRefusalReason"><option value="forgot">Mecânico pode ter esquecido outra peça</option><option value="original">Quero que use peça original / genuína</option><option value="notfixed">O problema continua</option><option value="other">Outro ajuste / acabamento</option></select></label><label class="gc-field"><span>Observação da conferência</span><textarea id="gcGarageReviewNote" rows="2" maxlength="300" placeholder="Descreva o que precisa ser revisto..."></textarea></label><div class="gc-garage-actions"><button type="button" class="gc-primary-action" data-garage-approve="${escapeHtml(j.id)}">✓ Confirmar boas condições</button><button type="button" class="gc-secondary-action" data-garage-refuse="${escapeHtml(j.id)}">Recusar e pedir reavaliação</button></div>`;root.scrollIntoView({behavior:'smooth',block:'nearest'});}
function gcGarageJobsPartsSummary(j){const orders=gcGaragePartsOrders().filter(o=>o.jobId===j.id).map(o=>`${o.productName} × ${o.quantity} · ${money(o.total)}`),stock=(j.partsUsedFromStock||[]).map(o=>`${o.name} × ${o.quantity} · estoque`).join('; ');return [orders.join('; '),stock].filter(Boolean).join('; ')||'Nenhuma peça comprada';}
function gcGarageConfirmJob(id){if(!assertOwner())return;const jobs=gcGarageJobs(),ix=jobs.findIndex(x=>x.id===id);if(ix<0)return;const j=jobs[ix];if(j.status!=='Aguardando conferência'){showToast('Esta ordem ainda não está aguardando conferência.');return;}const labor=Number((Number(j.estimatedHours||0)*Number(j.laborRate||55)).toFixed(2)),ledgerId=`garage-labor-${j.id}`;if(!cashLedger().some(x=>x.id===ledgerId)){if(labor>cashBreakdown().balance+0.005){showToast(`Saldo insuficiente para lançar a mão de obra (${money(labor)}). Reforce o Caixa antes de liberar o ônibus.`);return;}const mov={id:ledgerId,date:dateTodayLocal(),direction:'out',amount:labor,category:'Mão de obra de oficina',description:`OS ${j.id} · ${j.company} ${j.prefix} · ${j.taskLabel} · mecânico ${j.mechanicName}`,payee:j.mechanicName,company:j.company,prefix:j.prefix,source:'garageLabor',auto:true};mov.receiptText=gcBankFormatReceipt(mov,'COMPROVANTE · SERVIÇO DE OFICINA');if(!writeArrayKey(CASH_LEDGER_KEY,[...cashLedger(),mov]))return;}
  const profiles=gcGarageReadProfiles(),p=profiles[j.vehicleKey];if(p){(j.affectedComponents||[]).forEach(id=>{if(!p.components[id])p.components[id]={health:70,lastChangedKm:p.currentKm||0};const c=p.components[id];c.lastInspectionAt=dateTodayLocal();if(j.taskType!=='inspection'){c.health=j.taskType==='clean'||j.taskType==='wash'?100:Math.max(92,Number(c.health||0)+35);c.lastChangedKm=Number(p.currentKm)||0;c.lastChangedAt=dateTodayLocal();}});if(j.taskType==='oil')p.lastOilAtKm=Number(p.currentKm)||0;if(j.taskType==='tires')p.lastTireAtKm=Number(p.currentKm)||0;if(j.taskType==='brakes')p.lastBrakeAtKm=Number(p.currentKm)||0;if(j.taskType==='inspection')p.lastPreventiveAtKm=Number(p.currentKm)||0;p.lastServiceAt=dateTodayLocal();profiles[j.vehicleKey]=p;gcGarageWriteProfiles(profiles);}
  j.status='Concluído';j.completedAt=new Date().toISOString();j.ownerApprovedAt=j.completedAt;j.ownerReviewNote=$('#gcGarageReviewNote')?.value||'';j.laborCost=labor;j.partsCost=Number((gcGaragePartsOrders().filter(o=>o.jobId===j.id).reduce((s,o)=>s+Number(o.total||0),0)+(j.partsUsedFromStock||[]).reduce((s,o)=>s+Number(o.total||0),0)).toFixed(2));jobs[ix]=j;writeArrayKey(GC_GARAGE_JOBS_KEY,jobs);
  const reports=gcGarageReports();reports.push({id:`report-${j.id}`,jobId:j.id,date:dateTodayLocal(),company:j.company,prefix:j.prefix,model:j.model,mechanic:j.mechanicName,task:j.taskLabel,description:j.description,parts:[...gcGaragePartsOrders().filter(o=>o.jobId===j.id).map(o=>({name:o.productName,brand:o.brand,family:o.family,quantity:o.quantity,total:o.total,deliveredAt:o.deliveredAt||o.createdAt})),...(j.partsUsedFromStock||[]).map(o=>({name:o.name,brand:'Estoque Grupo Conect',family:o.family,quantity:o.quantity,total:Number(o.total||0),deliveredAt:j.startedAt}))],partsCost:j.partsCost,laborCost:labor,totalCost:Number((j.partsCost+labor).toFixed(2)),components:j.affectedComponents||[],agendaEventId:j.agendaEventId});writeArrayKey(GC_GARAGE_REPORTS_KEY,reports);
  if(j.agendaEventId){const done=gcAgendaDoneMap();done[j.agendaEventId]=new Date().toISOString();gcWriteObject(GC_AGENDA_DONE_KEY,done);}
  if(j.operationId){const ops=ownerOperations(),op=ops.find(x=>x.id===j.operationId);if(op&&op.breakdownPending){op.breakdownPending=null;op.status='operando';op.clockAnchorAt=Date.now();op.lastEvent=`Ônibus liberado após conferência da OS ${j.id}. Operação retomada.`;writeArrayKey(OPERATION_KEY,ops);}}
  $('#gcGarageReviewPanel').hidden=true;gcGarageRenderAll();gcGarageRenderHomeAlert();renderCashDashboard();showToast(`Ônibus ${j.prefix} liberado. Serviço registrado no relatório da oficina e mão de obra lançada no Caixa.`);
}
function gcGarageRefuseJob(id){if(!assertOwner())return;const jobs=gcGarageJobs(),ix=jobs.findIndex(x=>x.id===id);if(ix<0)return;const j=jobs[ix],reason=$('#gcGarageRefusalReason')?.value||'forgot',note=$('#gcGarageReviewNote')?.value||'';j.refusalHistory=Array.isArray(j.refusalHistory)?j.refusalHistory:[];j.refusalHistory.push({date:new Date().toISOString(),reason,note});j.ownerRefusalReason=reason;j.ownerRefusalNote=note;if(reason==='original'){j.requiresOriginal=true;j.partsReceived={};j.requiredParts=(j.requiredParts||[]).map(x=>({...x,qty:x.qty||1,originalRequired:true}));j.status='Aguardando peças';j.statusMessage='Proprietário solicitou peças originais/genuínas. Aguardando compra e entrega.';}else{const mech=gcGarageMechanicById(j.mechanicId);j.status='Reavaliação';j.estimatedHours=Math.max(1,gcGarageMechanicDuration(reason==='notfixed'?6:3,mech,{label:'Reavaliação do serviço'}));j.startedAt=new Date().toISOString();j.finishAt=gcGarageAddWorkingHours(new Date(),j.estimatedHours).toISOString();j.statusMessage='O mecânico está reavaliando o veículo e verificando possível componente não identificado.';}jobs[ix]=j;writeArrayKey(GC_GARAGE_JOBS_KEY,jobs);$('#gcGarageReviewPanel').hidden=true;gcGarageRenderAll();showToast(reason==='original'?'OS reaberta: compre a peça original solicitada no Mercado de Peças.':'OS devolvida ao mecânico para diagnóstico e reavaliação.');}
function gcGarageJobsForBus(key){return gcGarageJobs().filter(j=>j.vehicleKey===key);}
function gcGarageRenderReports(){const rows=gcGarageReports().slice().reverse(),filter=$('#gcWorkshopReportVehicle')?.value||'',filtered=rows.filter(r=>!filter||r.company+'|'+r.prefix===filter),partsTotal=filtered.reduce((s,r)=>s+Number(r.partsCost||0),0),laborTotal=filtered.reduce((s,r)=>s+Number(r.laborCost||0),0);if($('#gcGarageReportStats'))$('#gcGarageReportStats').innerHTML=[['Serviços registrados',filtered.length],['Peças',money(partsTotal)],['Mão de obra',money(laborTotal)],['Total oficina',money(partsTotal+laborTotal)]].map(([a,b])=>`<div class="gc-agenda-summary-card"><span>${escapeHtml(a)}</span><strong>${escapeHtml(b)}</strong></div>`).join('');if($('#gcGarageReportsList'))$('#gcGarageReportsList').innerHTML=filtered.length?filtered.map(r=>`<article class="record-item"><div><strong>${escapeHtml(r.company)} · ${escapeHtml(r.prefix)} · ${escapeHtml(r.task)}</strong><small>${escapeHtml(r.model)} · ${escapeHtml(localDate(r.date))} · Mecânico: ${escapeHtml(r.mechanic)}<br>Peças: ${escapeHtml((r.parts||[]).map(p=>`${p.name} ×${p.quantity}`).join(', ')||'Não informado')}<br>Peças ${money(r.partsCost)} + mão de obra ${money(r.laborCost)} = <b>${money(r.totalCost)}</b></small></div></article>`).join(''):recordsEmpty('Nenhum serviço foi confirmado pelo proprietário ainda.');if($('#gcWorkshopReportStats'))$('#gcWorkshopReportStats').innerHTML= $('#gcGarageReportStats')?.innerHTML||'';if($('#gcWorkshopReportList'))$('#gcWorkshopReportList').innerHTML=$('#gcGarageReportsList')?.innerHTML||'';}
function gcGarageRenderBreakdownQueue(){const root=$('#gcGarageBreakdownQueue');if(!root)return;const ops=ownerOperations().filter(o=>o.breakdownPending&&!o.breakdownPending.resolved);if(!ops.length){root.hidden=true;root.innerHTML='';return;}root.hidden=false;root.innerHTML=`<div class="gc-inline-notice urgent"><strong>Falha mecânica em operação</strong> — escolha se vai trocar o ônibus ou enviar um mecânico.</div>`+ops.map(op=>{const candidates=gcGarageReplacementCandidates(op);return `<article class="gc-garage-job-card"><strong>${escapeHtml(op.company)} · ${escapeHtml(op.prefix)} · ${escapeHtml(op.line)}</strong><p>${escapeHtml(op.breakdownPending.label||'Falha mecânica')} · ${escapeHtml(op.breakdownPending.date||'')} · ${escapeHtml(op.breakdownPending.severity||'Atenção')}</p><div class="gc-garage-actions"><button type="button" class="gc-mini-button primary" data-garage-send-mechanic="${escapeHtml(op.id)}">Enviar mecânico</button><select class="plain-input gc-garage-replacement-select" data-garage-replacement="${escapeHtml(op.id)}"><option value="">Escolher ônibus reserva...</option>${candidates.map(v=>`<option value="${escapeHtml(encodeURIComponent(JSON.stringify({company:v.company,prefix:v.prefix,model:v.model})))}">${escapeHtml(v.company)} · ${escapeHtml(v.prefix)} · ${escapeHtml(v.model)}</option>`).join('')}</select><button type="button" class="gc-mini-button" data-garage-replace-bus="${escapeHtml(op.id)}">Trocar ônibus e retomar</button></div></article>`;}).join('');}
function gcGarageReplacementCandidates(op){const busy=new Set(ownerOperations().filter(x=>x.id!==op.id&&operationIsRunning(x)).map(x=>gcGarageProfileKey({company:x.company,prefix:x.prefix})));return gcBankVehicles().filter(v=>norm(v.company)===norm(op.company)&&gcGarageProfileKey(v)!==gcGarageProfileKey(op)&&!busy.has(gcGarageProfileKey(v))&&gcGarageOverall(gcGarageGetProfile(v))>=45);}
function gcGarageReplaceOperationBus(id){if(!assertOwner())return;const op=ownerOperations().find(x=>x.id===id),pick=$(`[data-garage-replacement="${CSS.escape(id)}"]`),candidate=gcGarageDecodeVehicleValue(pick?.value);if(!op||!candidate){showToast('Escolha um ônibus reserva disponível da mesma empresa.');return;}const v=gcBankVehicles().find(x=>gcGarageProfileKey(x)===gcGarageProfileKey(candidate));if(!v){showToast('O ônibus reserva não foi localizado na frota.');return;}if(ownerOperations().some(x=>x.id!==id&&operationIsRunning(x)&&gcGarageProfileKey(x)===gcGarageProfileKey(v))){showToast('Este ônibus já está em outra operação.');return;}const ops=ownerOperations(),ix=ops.findIndex(x=>x.id===id);ops[ix].breakdownHistory=Array.isArray(ops[ix].breakdownHistory)?ops[ix].breakdownHistory:[];ops[ix].breakdownHistory.push({...ops[ix].breakdownPending,resolution:'Troca de ônibus',replacementPrefix:v.prefix,date:new Date().toISOString()});ops[ix].busModel=v.model;ops[ix].prefix=String(v.prefix);ops[ix].breakdownPending=null;ops[ix].status='operando';ops[ix].clockAnchorAt=Date.now();ops[ix].lastEvent=`Ônibus reserva ${v.prefix} escalado após pane. Veículo anterior encaminhado para oficina.`;writeArrayKey(OPERATION_KEY,ops);const events=readArrayKey(GC_AGENDA_EVENTS_KEY);events.push({id:`breakdown-maint-${makeId()}`,date:dateTodayLocal(),type:'maintenance',title:'Diagnóstico após falha durante operação',vehicle:`${op.company} · ${op.prefix} · ${op.busModel}`,company:op.company,prefix:op.prefix,vehicleKey:gcGarageProfileKey({company:op.company,prefix:op.prefix}),priority:'Urgente',alertImportant:true,source:'breakdown'});writeArrayKey(GC_AGENDA_EVENTS_KEY,events);gcGarageRenderAll();showToast(`Operação retomada com o ônibus reserva ${v.prefix}. O veículo anterior ficou pendente de diagnóstico.`);}
function gcGarageSendBreakdownToMechanic(id){const op=ownerOperations().find(x=>x.id===id);if(!op)return;gcGarageLinkedOperationId=id;gcGaragePendingAgendaEventId='';gcGarageOpen('repairs');const v=gcBankVehicles().find(x=>gcGarageProfileKey(x)===gcGarageProfileKey(op));if(v){const option=Array.from($('#gcGarageRepairVehicle').options).find(o=>gcGarageProfileKey(gcGarageDecodeVehicleValue(o.value)||{})===gcGarageProfileKey(v));if(option)$('#gcGarageRepairVehicle').value=option.value;}const part=op.breakdownPending?.component||'engineOil',type=/brake/.test(part)?'brakes':/tires/.test(part)?'tires':/scr|arla|nox/.test(part)?'scr':/trans|clutch/.test(part)?'transmission':/coolant|waterPump|radiator/.test(part)?'cooling':'inspection';$('#gcGarageRepairType').value=type;$('#gcGarageRepairDescription').value=`Falha durante a Operação de Linha ${op.line}: ${op.breakdownPending?.label||'pane mecânica'}. Investigar causa e liberar somente após conferência do proprietário.`;gcGarageEstimateRepair();showToast('Ocorrência vinculada à oficina. Selecione a garagem e um mecânico.');}
function gcGarageOnOperationTrip(op,trip){const key=gcGarageProfileKey({company:op.company,prefix:op.prefix}),profiles=gcGarageReadProfiles(),v=gcGarageVehicleByKey(key);if(!profiles[key]){gcGarageSyncFleet();Object.assign(profiles,gcGarageReadProfiles());}const p=profiles[key];if(!p)return false;const km=Math.max(1,Number(trip.distanceKm||op.distanceKm)||20);p.currentKm=(Number(p.currentKm)||0)+km;p.odoEstimated=Boolean(p.odoEstimated);p.odoDate=dateTodayLocal();const worn={engineOil:20000,oilFilter:20000,fuelFilter:20000,airFilter:30000,coolant:60000,radiatorHoses:90000,waterPump:180000,belts:80000,injectors:300000,turbo:350000,clutch:220000,gearbox:100000,differential:120000,brakeLinings:60000,brakeDrums:180000,airCompressor:300000,airDryer:60000,airChambers:240000,steering:180000,suspension:120000,tires:80000,wheelBearings:180000,battery:100000,alternator:220000,starter:240000,lighting:260000,doors:160000,ramp:120000,airConditioning:100000,body:400000};Object.entries(worn).forEach(([id,life])=>{if(p.components[id])p.components[id].health=gcGarageClamp(Number(p.components[id].health)-km/life*100);});['doors','steering','wheelBearings','lighting','cleaning'].forEach(id=>{if(p.components[id])p.components[id].health=gcGarageClamp(Number(p.components[id].health)-km/(id==='cleaning'?2500:180000)*100);});if(p.arlaRequired){if(p.components.arlaFluid)p.components.arlaFluid.health=gcGarageClamp(Number(p.components.arlaFluid.health)-km/2800*100);if(p.components.arlaFilter)p.components.arlaFilter.health=gcGarageClamp(Number(p.components.arlaFilter.health)-km/240000*100);if(p.components.noxSensors)p.components.noxSensors.health=gcGarageClamp(Number(p.components.noxSensors.health)-km/250000*100);if(p.components.adbluePump)p.components.adbluePump.health=gcGarageClamp(Number(p.components.adbluePump.health)-km/300000*100);}profiles[key]=p;gcGarageWriteProfiles(profiles);const agendaOdo=gcAgendaReadProfiles();agendaOdo[key]={...(agendaOdo[key]||{}),key,company:op.company,prefix:op.prefix,model:op.busModel||v?.model||'',currentKm:p.currentKm,odoDate:dateTodayLocal()};gcWriteObject(GC_AGENDA_PROFILES_KEY,agendaOdo);gcGarageScheduleWearAlert(v,p);
  if(op.breakdownPending)return false;const overall=gcGarageOverall(p),critical=GC_GARAGE_ALL_COMPONENTS.filter(d=>(p.arlaRequired||!GC_SCR_COMPONENTS.some(x=>x.id===d.id))&&Number(p.components[d.id]?.health)<22).sort((a,b)=>Number(p.components[a.id].health)-Number(p.components[b.id].health))[0];let chance=.00015+Math.max(0,75-overall)*.00003+(critical?.0025:0);if(overall<30)chance+=.003;if(p.needsBaseInput)chance*=1.25;if(Math.random()<chance){const weak=critical||GC_GARAGE_COMPONENTS.filter(d=>Number(p.components[d.id]?.health)<45).sort((a,b)=>Number(p.components[a.id].health)-Number(p.components[b.id].health))[0]||GC_GARAGE_COMPONENTS[0];const ev={id:`break-${makeId()}`,component:weak.id,label:`Possível falha: ${weak.label}`,date:new Date().toLocaleString('pt-BR'),severity:overall<35?'Crítica':overall<55?'Alta':'Moderada',health:Math.round(Number(p.components[weak.id]?.health)||0)};op.breakdownPending=ev;op.status='parada técnica';op.elapsedSeconds=opElapsedSeconds(op,Date.now());op.clockAnchorAt=null;op.lastEvent=`PANE MECÂNICA: ${weak.label}. Operação parada para decisão do proprietário.`;p.components[weak.id].health=Math.min(Number(p.components[weak.id].health)||0,18);profiles[key]=p;gcGarageWriteProfiles(profiles);return true;}return false;}
function gcGarageScheduleWearAlert(v,p){if(!v)return;const defs=GC_GARAGE_ALL_COMPONENTS.filter(d=>(p.arlaRequired||!GC_SCR_COMPONENTS.some(x=>x.id===d.id))&&Number(p.components[d.id]?.health)<38);if(!defs.length)return;const rows=readArrayKey(GC_AGENDA_EVENTS_KEY);defs.slice(0,3).forEach(d=>{const id=`garage-wear-${gcGarageProfileKey(v)}-${d.id}`;if(!rows.some(x=>x.id===id)&&!gcAgendaIsDone(id))rows.push({id,date:dateTodayLocal(),type:d.id==='tires'?'tires':d.id==='engineOil'||d.id==='oilFilter'?'oil':'maintenance',title:`Conferir ${d.label.toLocaleLowerCase('pt-BR')}`,vehicle:gcAgendaVehicleLabel(v),company:v.company,prefix:v.prefix,vehicleKey:gcGarageProfileKey(v),priority:Number(p.components[d.id].health)<22?'Urgente':'Alta',alertImportant:true,description:`Desgaste estimado em ${Math.round(Number(p.components[d.id].health))}%. Agende diagnóstico na Mecânica.`,source:'garage-wear'});});writeArrayKey(GC_AGENDA_EVENTS_KEY,rows);}
function gcGarageRenderHomeAlert(){const b=$('#gcGarageHomeAlert');if(!b)return;const breakdown=ownerOperations().find(o=>o.breakdownPending&&!o.breakdownPending.resolved),ready=gcGarageJobs().filter(j=>j.status==='Aguardando conferência'),jobs=gcGarageJobs().filter(j=>j.status==='Aguardando peças'||j.status==='Em execução');if(breakdown){$('#gcGarageAlertTitle').textContent='PANE MECÂNICA — operação parada';$('#gcGarageAlertText').textContent=`${breakdown.company} · ${breakdown.prefix} · ${breakdown.line}: ${breakdown.breakdownPending.label}. Escolha enviar mecânico ou trocar o ônibus na Garagem.`;b.hidden=false;b.classList.add('urgent');return;}if(ready.length){$('#gcGarageAlertTitle').textContent=ready.length===1?'ÔNIBUS PRONTO — aguardando sua conferência':`${ready.length} ônibus aguardam conferência`;$('#gcGarageAlertText').textContent=ready.slice(0,3).map(j=>`${j.company} · ${j.prefix} · ${j.taskLabel}`).join(' · ');b.hidden=false;b.classList.remove('urgent');return;}if(jobs.length){$('#gcGarageAlertTitle').textContent='Oficina em andamento';$('#gcGarageAlertText').textContent=`${jobs.length} ordem(ns) em execução ou aguardando peças. Consulte o status na Garagem.`;b.hidden=false;b.classList.remove('urgent');return;}b.hidden=true;}
function gcGarageRenderReportsPhone(){const filter=$('#gcWorkshopReportVehicle')?.value||'',rows=gcGarageReports().slice().reverse().filter(r=>!filter||`${r.company}|${r.prefix}`===filter),sum=rows.reduce((s,r)=>s+Number(r.totalCost||0),0);if($('#gcWorkshopReportStats'))$('#gcWorkshopReportStats').innerHTML=[['Serviços',rows.length],['Gasto acumulado',money(sum)],['Peças',money(rows.reduce((s,r)=>s+Number(r.partsCost||0),0))],['Mão de obra',money(rows.reduce((s,r)=>s+Number(r.laborCost||0),0))]].map(([a,b])=>`<div class="gc-phone-kpi"><small>${escapeHtml(a)}</small><strong>${escapeHtml(b)}</strong></div>`).join('');if($('#gcWorkshopReportList'))$('#gcWorkshopReportList').innerHTML=rows.length?rows.map(r=>`<article class="gc-phone-card"><strong>${escapeHtml(r.company)} · ${escapeHtml(r.prefix)} · ${escapeHtml(r.task)}</strong><small>${escapeHtml(localDate(r.date))} · ${escapeHtml(r.mechanic)}<br>${escapeHtml((r.parts||[]).map(p=>`${p.name} ×${p.quantity}`).join(', ')||'Sem peças')}; total ${money(r.totalCost)}</small></article>`).join(''):'<div class="gc-empty-state">Nenhum serviço concluído ainda.</div>';}
function gcGarageRenderCandidates(){const root=$('#gcHireCandidates');if(!root)return;const role=$('#gcHireRole').value,employees=gcGarageEmployees(),all=gcHrCandidates().filter(c=>(role==='all'||c.role===role)&&!employees.some(e=>e.candidateId===c.id));root.innerHTML=all.slice(0,18).map(c=>`<article class="gc-phone-card"><div class="gc-phone-card-top"><strong>${escapeHtml(c.name)}</strong><span>${c.role==='mechanic'?`Mecânico · Nível ${c.level}`:'Motorista · CNH '+c.cnh}</span></div><small>${escapeHtml(c.city)} · ${c.years} anos de experiência<br>${escapeHtml(c.role==='mechanic'?c.specialty:`Curso ${c.course} · ${c.vehicleClass}`)} · pretensão ${money(c.suggestedSalary)}/mês</small><button type="button" class="gc-mini-button" data-hr-select="${escapeHtml(c.id)}">Ver perfil / contratar</button></article>`).join('')||'<div class="gc-empty-state">Não há candidatos novos nesse filtro. Todos os perfis exibidos já foram contratados ou o filtro está vazio.</div>';const team=$('#gcHireTeam');const hired=employees.filter(e=>e.status!=='Desligado');$('#gcHireTeamCount').textContent=String(hired.length);team.innerHTML=hired.length?hired.map(e=>`<article class="gc-phone-card"><strong>${escapeHtml(e.name)} · ${escapeHtml(e.role==='mechanic'?'Mecânico':'Motorista')}</strong><small>${escapeHtml(e.company)} · ${money(e.salary)}/mês · ${e.role==='mechanic'?`Nível ${e.level} · ${escapeHtml(e.specialty)}`:`CNH ${escapeHtml(e.cnh)} · ${e.years} anos`}</small><button type="button" class="gc-secondary-action" data-hr-dismiss="${escapeHtml(e.id)}">Desligar profissional</button></article>`).join(''):'<div class="gc-empty-state">Ainda não há profissionais contratados. Selecione um candidato acima.</div>';}
function gcHrCandidates(){if(gcHrCandidates.cache)return gcHrCandidates.cache;const first=['André','Bruno','Carlos','Diego','Eduardo','Felipe','Gustavo','Henrique','Igor','João','Kaique','Leandro','Marcos','Nicolas','Otávio','Paulo','Rafael','Samuel','Thiago','Vinícius','Wesley','Alex','Roberto','Fábio','Lucas','Márcio','Renato','Daniel','Jorge','Mateus'],last=['Almeida','Barbosa','Carvalho','Dias','Esteves','Ferreira','Gomes','Henriques','Lima','Mendes','Nogueira','Oliveira','Pereira','Queiroz','Ribeiro','Santos','Teixeira','Vieira','Xavier','Costa','Rocha','Martins','Azevedo','Souza'];const cities=['Três Rios/RJ','Paraíba do Sul/RJ','Petrópolis/RJ','Nova Friburgo/RJ','Vassouras/RJ','Barra do Piraí/RJ','Rio de Janeiro/RJ','Juiz de Fora/MG','Valença/RJ','Miguel Pereira/RJ'];const specs=['Motor diesel / injeção eletrônica','Freios pneumáticos / ABS / EBS','Elétrica / eletrônica embarcada','Transmissão / embreagem','Suspensão / direção / pneus','SCR / ARLA 32 / pós-tratamento','Refrigeração / ar-condicionado','Mecânica geral de ônibus'];const rows=[];for(let i=0;i<42;i++){const name=`${first[i%first.length]} ${last[(i*7+3)%last.length]}`;const level=1+(i%5),years=1+((i*3)%22),spec=specs[i%specs.length];rows.push({id:`cand-m-${i+1}`,role:'mechanic',name,city:cities[(i*3)%cities.length],years,level,specialty:spec,suggestedSalary:[2600,2950,3450,4100,4900][level-1],course:['Mecânica diesel SENAI','Mecânica de veículos pesados','Eletromecânica','Diagnóstico eletrônico diesel','Manutenção de sistemas pneumáticos'][i%5],experience:`${years} anos em oficina de ônibus, caminhões ou veículos pesados`,certification:i%3===0?'NR-10 / diagnóstico elétrico':'Qualificação técnica informada'});}
for(let i=0;i<42;i++){const name=`${first[(i*5+2)%first.length]} ${last[(i*9+1)%last.length]}`;const years=1+((i*5)%24),cnh=i%4===0?'E':'D';rows.push({id:`cand-d-${i+1}`,role:'driver',name,city:cities[(i*2+1)%cities.length],years,cnh,course:i%2===0?'Transporte coletivo de passageiros':'Direção defensiva e transporte de passageiros',vehicleClass:cnh==='E'?'Ônibus e veículos articulados (categoria E)':'Ônibus / coletivo (categoria D)',suggestedSalary:cnh==='E'?3900:3789.65,experience:`${years} anos de experiência declarada em transporte coletivo / fretamento`,level:0});}
  gcHrCandidates.cache=rows;return rows;}
function gcHireSelectCandidate(id){const c=gcHrCandidates().find(x=>x.id===id);if(!c)return;$('#gcHireCandidateId').value=id;$('#gcHireFormPanel').hidden=false;$('#gcHireSalary').value=Number(c.suggestedSalary).toFixed(2);$('#gcHireMeal').value='400';$('#gcHireHealth').value='37';$('#gcHireCandidateDetail').innerHTML=`<strong>${escapeHtml(c.name)} · ${c.role==='mechanic'?'Mecânico nível '+c.level:'Motorista CNH '+c.cnh}</strong><br>${escapeHtml(c.experience)}<br>${escapeHtml(c.role==='mechanic'?c.specialty:c.course)}<br><small>Salário sugerido para simulação: ${money(c.suggestedSalary)}. Confirme documentação, referências e aptidão antes de uma contratação real.</small>`;$('#gcHireFormPanel').scrollIntoView({behavior:'smooth',block:'nearest'});}
function gcHireSubmit(event){event.preventDefault();if(!assertOwner())return;const c=gcHrCandidates().find(x=>x.id===$('#gcHireCandidateId').value);if(!c)return;const rows=gcGarageEmployees();if(rows.some(x=>x.candidateId===c.id&&x.status!=='Desligado')){showToast('Este candidato já está contratado.');return;}const salary=Number($('#gcHireSalary').value),meal=Number($('#gcHireMeal').value),health=Number($('#gcHireHealth').value);if(!(salary>=1500)||!Number.isFinite(meal)||meal<0||!Number.isFinite(health)||health<0){showToast('Confira salário e benefícios.');return;}const e={id:`staff-${makeId()}`,candidateId:c.id,role:c.role,name:c.name,company:$('#gcHireCompany').value,city:c.city,years:c.years,level:c.level||0,specialty:c.specialty||'',cnh:c.cnh||'',course:c.course||'',vehicleClass:c.vehicleClass||'',salary,mealBenefit:meal,healthBenefit:health,shift:$('#gcHireShift').value,dateHired:dateTodayLocal(),status:'Ativo',candidateProfile:c,createdAt:new Date().toISOString()};rows.push(e);if(!writeArrayKey(GC_HR_EMPLOYEES_KEY,rows))return;$('#gcHireFormPanel').hidden=true;gcGarageRenderCandidates();gcGaragePopulateMechanics();if(typeof populateShiftDrivers==='function')populateShiftDrivers(true);if(typeof refreshNormalTripDrivers==='function')refreshNormalTripDrivers();showToast(`${e.role==='mechanic'?'Mecânico':'Motorista'} ${e.name} contratado para ${e.company}.`);}
function gcHireDismiss(id){if(!assertOwner())return;const rows=gcGarageEmployees(),ix=rows.findIndex(x=>x.id===id);if(ix<0)return;rows[ix].status='Desligado';rows[ix].dateDismissed=dateTodayLocal();writeArrayKey(GC_HR_EMPLOYEES_KEY,rows);gcGarageRenderCandidates();gcGaragePopulateMechanics();populateShiftDrivers(true);refreshNormalTripDrivers();showToast('Profissional desligado. Escalas futuras precisam de outro nome.');}
function gcDriverRosterFromEmployees(company){const base=['Pablo','Kaio','Treinamento'];const staff=gcGarageEmployees().filter(e=>e.role==='driver'&&e.status==='Ativo'&&(!company||norm(e.company)===norm(company))).map(e=>e.name);return Array.from(new Set([...base,...staff]));}
driverRoster=function(company){return gcDriverRosterFromEmployees(company);};
populateShiftDrivers=function(preserve=true){const company=$('#ovCompany')?.value||'Progresso',rows=driverRoster(company);['ovMorningDriver','ovAfternoonDriver','ovNightDriver'].forEach((id,idx)=>{const el=$('#'+id);if(!el)return;const old=preserve?el.value:'';populateSelect(el,rows.length?'Selecione motorista contratado':'Contrate motoristas no Atendimento Online',rows);if(rows.includes(old))el.value=old;else el.selectedIndex=0;});const note=$('#ovDriverCountNote');if(note)note.textContent=`${rows.length} motorista(s) cadastrados para ${company}: equipe base + profissionais contratados. Não há motoristas fictícios numerados.`;};
refreshNormalTripDrivers=function(){const select=$('#driverSelect'),company=$('#companySelect')?.value||'Progresso';if(!select)return;const prev=select.value,rows=driverRoster(company);populateSelect(select,rows.length?'Escolha o motorista':'Contrate um motorista no Atendimento Online',rows);if(rows.includes(prev))select.value=prev;};
function gcGarageRenderCandidatesAndPhone(){gcGarageRenderCandidates();gcGarageFillSelects();gcGarageRenderReportsPhone();gcGarageRenderParts();}
function gcOnlineShowTab(tab){if(!assertOwner())return;gcOnlineActiveTab=['clients','agenda','tools','hire','parts','reports'].includes(tab)?tab:'clients';['clients','agenda','tools','hire','parts','reports'].forEach(k=>{const el=$('#online'+(k==='reports'?'WorkshopReports':k[0].toUpperCase()+k.slice(1))+'View');if(el)el.hidden=gcOnlineActiveTab!==k;});$$('[data-online-tab]').forEach(b=>b.classList.toggle('active',b.dataset.onlineTab===gcOnlineActiveTab));if(tab==='agenda')gcOnlineRenderAgenda();if(tab==='tools'){gcOnlineRenderDirectory();gcOnlineRenderMessagePreview();}if(tab==='hire')gcGarageRenderCandidates();if(tab==='parts'){gcGarageFillSelects();gcGarageRenderParts();}if(tab==='reports'){gcGarageFillSelects();gcGarageRenderReportsPhone();}}
function gcGarageOpenOnlineApp(tab='hire'){if(!assertOwner())return;$('#gcGaragePanel').hidden=true;$('#onlineServicePanel').hidden=false;gcGarageRenderCandidatesAndPhone();gcOnlineShowTab(tab);$('#onlineServicePanel').scrollIntoView({behavior:'smooth',block:'start'});}
function gcGarageRenderParts(){const root=$('#gcPartsResults');if(!root)return;const q=norm($('#gcPartsSearch').value),cat=$('#gcPartsCategory').value,selectedVehicle=gcBankVehicleFromSelect('gcPartsVehicle'),jobId=$('#gcPartsJob').value,job=gcGarageJobs().find(j=>j.id===jobId),v=selectedVehicle||(job&&gcGarageVehicleByKey(job.vehicleKey)),profile=v&&gcGarageGetProfile(v),missing=(job?.requiredParts||[]).filter(x=>Number(job.partsReceived?.[x.family]||0)<Number(x.qty||1)),all=gcGaragePartsCatalog().filter(part=>(!q||norm(`${part.name} ${part.brand} ${part.reference} ${part.family} ${part.description}`).includes(q))&&(!cat||part.category===cat)&&(!v||gcGaragePartCompatible(part,v,profile))&&(!job?.requiresOriginal||part.quality==='Original / genuína'));if(job&&missing.length)all.sort((a,b)=>(missing.some(x=>x.family===b.family)?1:0)-(missing.some(x=>x.family===a.family)?1:0));const supply=readObjectKey(GC_PARTS_SUPPLY_KEY);if($('#gcPartsJobNeeds'))$('#gcPartsJobNeeds').innerHTML=job?`<strong>Peças pendentes da OS ${escapeHtml(job.id)}:</strong> ${(job.requiredParts||[]).map(x=>`${escapeHtml(x.label)} ${Number(job.partsReceived?.[x.family]||0)}/${x.qty}`).join(' · ')||'Nenhuma'}`:'Selecione uma ordem para ver a lista de peças necessárias.';const rows=all.slice(0,24);$('#gcPartsSummary').textContent=`${all.length.toLocaleString('pt-BR')} item(ns) compatíveis encontrados · catálogo total ${gcGaragePartsCatalog().length.toLocaleString('pt-BR')} SKUs. Preços de simulação, sujeitos à conferência de código e aplicação.`;root.innerHTML=rows.length?rows.map(part=>{const stock=Number(supply[part.id]??part.localStock),price=gcGaragePartPrice(part);return `<article class="gc-phone-card gc-part-card"><div class="gc-phone-card-top"><strong>${escapeHtml(part.name)}</strong><span>${escapeHtml(part.brand)}</span></div><small>${escapeHtml(part.quality)} · ${escapeHtml(part.spec)}<br>Código ${escapeHtml(part.reference)} · ${escapeHtml(part.category)}<br>${stock>0?`Estoque local: ${stock} · retirada imediata`:'Sem estoque local · entrega de fornecedor'}${part.promo?` · 🔖 promoção ${part.promoPct}%`:''}</small><div class="gc-part-price">${money(price)} ${part.promo?`<del>${money(part.price)}</del>`:''}</div><label class="gc-field"><span>Entrega</span><select data-part-delivery="${escapeHtml(part.id)}"><option value="stock" ${stock>0?'':'disabled'}>Retirada / estoque local</option><option value="24">Expressa · até 24 horas</option><option value="72">2 a 4 dias úteis</option><option value="144">5 a 8 dias úteis</option></select></label><button type="button" class="gc-primary-action" data-part-buy="${escapeHtml(part.id)}">Comprar peça</button></article>`;}).join(''):'<div class="gc-empty-state">Nenhuma peça encontrada para esse filtro. Limpe a busca ou confira marca/chassi.</div>';const jobs=gcGarageJobs().filter(j=>['Aguardando peças','Em execução','Reavaliação'].includes(j.status));$('#gcPartsJob').innerHTML='<option value="">Compra para estoque geral</option>'+jobs.map(j=>`<option value="${escapeHtml(j.id)}">${escapeHtml(j.company)} · ${escapeHtml(j.prefix)} · ${escapeHtml(j.taskLabel)} (${escapeHtml(j.status)})</option>`).join('');if($('#gcPartsJob').value!==jobId&&jobs.some(x=>x.id===jobId))$('#gcPartsJob').value=jobId;const orders=gcGaragePartsOrders().slice().reverse();$('#gcPartsOrderCount').textContent=String(orders.length);$('#gcPartsOrders').innerHTML=orders.length?orders.slice(0,20).map(o=>`<article class="gc-phone-card"><strong>${escapeHtml(o.productName)} × ${o.quantity}</strong><small>${escapeHtml(o.brand)} · ${escapeHtml(o.deliveryLabel)}<br>${o.status==='Entregue'?'Entregue':`Previsão: ${new Date(o.dueAt).toLocaleString('pt-BR')}`} · ${money(o.total)}${o.jobId?` · OS ${escapeHtml(o.jobId)}`:''}</small><span class="gc-garage-tag ${o.status==='Entregue'?'new':'pending'}">${escapeHtml(o.status)}</span></article>`).join(''):'<div class="gc-empty-state">Nenhum pedido de peças ainda.</div>';}
function gcGarageBuyPart(id){
  if(!assertOwner())return;
  const part=gcGaragePartsCatalog().find(x=>x.id===id);if(!part)return;
  const select=$(`[data-part-delivery="${CSS.escape(id)}"]`),choice=select?.value||'24',supply=readObjectKey(GC_PARTS_SUPPLY_KEY),local=Number(supply[id]??part.localStock);
  let deliveryHours=Number(choice)||24,dueAt=new Date(Date.now()+deliveryHours*3600000),deliveryLabel='Entrega expressa · até 24 horas';
  if(choice==='stock'){
    if(local<=0){showToast('Sem estoque local. Escolha uma modalidade de entrega.');return;}
    deliveryHours=0;dueAt=new Date();deliveryLabel='Retirada imediata · estoque local';
  }else if(choice==='72'){
    const days=2+(Number(part.seed||0)%3);dueAt=gcGarageAddBusinessDays(new Date(),days);deliveryHours=Math.max(1,(dueAt.getTime()-Date.now())/3600000);deliveryLabel=`Entrega estimada · ${days} dias úteis`;
  }else if(choice==='144'){
    const days=5+(Number(part.seed||0)%4);dueAt=gcGarageAddBusinessDays(new Date(),days);deliveryHours=Math.max(1,(dueAt.getTime()-Date.now())/3600000);deliveryLabel=`Entrega estimada · ${days} dias úteis`;
  }
  const jobId=$('#gcPartsJob').value,job=gcGarageJobs().find(j=>j.id===jobId),qty=1,total=gcGaragePartPrice(part),jobVehicle=job&&gcGarageVehicleByKey(job.vehicleKey),jobProfile=jobVehicle&&gcGarageGetProfile(jobVehicle);
  if(job&&!(job.requiredParts||[]).some(x=>x.family===part.family&&Number(job.partsReceived?.[x.family]||0)<Number(x.qty||1))){showToast('Esta peça não consta como pendente nesta ordem de serviço. Selecione um item solicitado pelo mecânico.');return;}
  if(job&&jobVehicle&&!gcGaragePartCompatible(part,jobVehicle,jobProfile)){showToast('Esta peça não corresponde à aplicação estimada para o chassi deste ônibus. Confira a referência correta.');return;}
  if(job?.requiresOriginal&&part.quality!=='Original / genuína'){showToast('Esta ordem exige peça original/genuína. Escolha essa qualidade no Mercado de Peças.');return;}
  if(total>cashBreakdown().balance+0.005){showToast(`Saldo insuficiente. A peça custa ${money(total)} e o Caixa tem ${money(cashBreakdown().balance)}.`);return;}
  const order={id:`parts-${makeId()}`,productId:id,family:part.family,productName:part.name,brand:part.brand,quality:part.quality,quantity:qty,unitPrice:total,total,deliveryHours,deliveryLabel,dueAt:dueAt.toISOString(),status:deliveryHours===0?'Entregue':'Aguardando entrega',jobId:job?.id||'',company:job?.company||'',prefix:job?.prefix||'',createdAt:new Date().toISOString()};
  const row={id:order.id,date:dateTodayLocal(),direction:'out',amount:total,category:'Compra de peças para oficina',description:`${part.name} · ${part.brand} · ${part.reference} · ${order.deliveryLabel}${job?` · OS ${job.id} · ${job.prefix}`:' · estoque geral'}`,payee:part.brand,source:'garagePartsPurchase',auto:true,company:job?.company||'',prefix:job?.prefix||''};row.receiptText=gcBankFormatReceipt(row,'COMPROVANTE · MERCADO DE PEÇAS');
  if(!writeArrayKey(CASH_LEDGER_KEY,[...cashLedger(),row]))return;
  if(deliveryHours===0)supply[id]=Math.max(0,local-1);gcWriteObject(GC_PARTS_SUPPLY_KEY,supply);
  const orders=gcGaragePartsOrders();orders.push(order);writeArrayKey(GC_PARTS_ORDERS_KEY,orders);
  if(job){const jobs=gcGarageJobs(),ix=jobs.findIndex(x=>x.id===job.id);if(ix>=0){jobs[ix].partsOrders=Array.isArray(jobs[ix].partsOrders)?jobs[ix].partsOrders:[];jobs[ix].partsOrders.push(order.id);if(deliveryHours===0){jobs[ix].partsReceived=jobs[ix].partsReceived||{};jobs[ix].partsReceived[part.family]=(Number(jobs[ix].partsReceived[part.family])||0)+1;}writeArrayKey(GC_GARAGE_JOBS_KEY,jobs);if(deliveryHours===0)gcGarageTryStartJob(jobs[ix]);}}
  else if(deliveryHours===0){const stock=gcGaragePartsStock();stock.push({id:makeId(),productId:id,family:part.family,qty:1,unitPrice:total,total,quality:part.quality,receivedAt:new Date().toISOString()});writeArrayKey(GC_PARTS_STOCK_KEY,stock);}
  if(job){const fresh=gcGarageJobs().find(x=>x.id===job.id),next=(fresh?.requiredParts||[]).find(x=>Number(fresh.partsReceived?.[x.family]||0)<Number(x.qty||1));if(next)$('#gcPartsSearch').value=next.family;}
  gcGarageRenderParts();gcGarageRenderHomeAlert();renderCashDashboard();showToast(`Compra registrada: ${part.name}. ${order.deliveryLabel}. Valor ${money(total)} saiu do Caixa.`);
}
function gcGarageOpenJobParts(id){if(!assertOwner())return;gcGarageOpenOnlineApp('parts');$('#gcPartsJob').value=id;const j=gcGarageJobs().find(x=>x.id===id);if(j){const first=j.requiredParts?.[0]?.family;$('#gcPartsSearch').value=first||'';gcGarageRenderParts();$('#gcPartsJob').value=id;}}
function gcGarageOpenAgendaEvent(id){if(!assertOwner())return;const ev=(typeof gcAgendaEventsForDate==='function'?gcAgendaEventsForDate(gcAgendaSelectedDate).find(x=>x.id===id):null)||gcAgendaFindEvent(id);if(!ev)return;gcGaragePendingAgendaEventId=id;gcGarageLinkedOperationId='';gcGarageOpen('repairs');const v=ev.vehicleKey?gcGarageVehicleByKey(ev.vehicleKey):null;if(v){const opts=Array.from($('#gcGarageRepairVehicle').options),opt=opts.find(o=>{const p=gcGarageDecodeVehicleValue(o.value);return p&&gcGarageProfileKey(p)===gcGarageProfileKey(v);});if(opt)$('#gcGarageRepairVehicle').value=opt.value;}const map={clean:'clean',wash:'wash',oil:'oil',tires:'tires',maintenance:'inspection',operation:'inspection',turismo:'inspection',fretamento:'inspection',escolar:'inspection'};$('#gcGarageRepairType').value=map[ev.type]||'inspection';$('#gcGarageRepairDescription').value=`Tarefa da Agenda: ${ev.title}. ${ev.description||''} Concluir serviço e conferir antes de marcar a tarefa como feita.`;gcGarageEstimateRepair();showToast('Tarefa encaminhada à Mecânica. Escolha garagem e mecânico para iniciar.');}
function gcAgendaEventMarkup(ev){const isDone=ev.completed||gcAgendaIsDone(ev.id),vehicle=ev.vehicle||((ev.company||ev.prefix)?`${ev.company||''} · ${ev.prefix||''}`:'Frota geral'),urg=ev.priority==='Urgente'||ev.alertImportant,job=gcGarageJobs().find(j=>j.agendaEventId===ev.id&&j.status!=='Concluído');return `<article class="gc-agenda-event ${isDone?'completed':''}"><div class="gc-agenda-event-top"><div class="gc-agenda-event-main"><strong>${gcAgendaIcon(ev.type,urg)} ${escapeHtml(ev.title||'Tarefa da frota')}</strong><small>${escapeHtml(vehicle)}${ev.time?` · ${escapeHtml(ev.time)}`:''}${ev.description?` · ${escapeHtml(ev.description)}`:''}</small><div class="gc-agenda-event-badges"><span class="gc-agenda-badge ${urg?'urgent':''}">${escapeHtml(ev.priority||'Normal')}</span><span class="gc-agenda-badge">${escapeHtml(({turismo:'Turismo',escolar:'Escolar',fretamento:'Fretamento',operation:'Operação de linha',clean:'Limpeza',wash:'Lavagem',oil:'Óleo / filtros',maintenance:'Manutenção',tires:'Pneus',document:'Documento / IPVA',other:'Outro'})[ev.type]||'Agenda')}</span>${isDone?'<span class="gc-agenda-badge done">Concluído</span>':''}${job?`<span class="gc-agenda-badge">OS ${escapeHtml(job.status)}</span>`:''}${ev.dueKm?`<span class="gc-agenda-badge">Marco ${numberPt(ev.dueKm,0)} km</span>`:''}</div></div>${!isDone?`<button type="button" class="secondary-action-button" data-agenda-work="${escapeHtml(ev.id)}">Concluir tarefa → Mecânica</button>`:''}</div></article>`;}
function gcGarageRenderHomeAlertWithBreakdown(){gcGarageRenderHomeAlert();}
function gcGarageInit(){if(!$('#gcGaragePanel'))return;gcGarageSyncFleet();gcGarageFillSelects();gcGaragePopulateMechanics();gcGarageRenderAll();gcGarageTick();const today=dateTodayLocal();if($('#gcGarageIntakeForm')){}setInterval(gcGarageTick,12000);setInterval(()=>{if(ownerAllowed())gcGarageRenderHomeAlert();},12000);}

// Delegação de eventos para módulos novos.
$('#gcGarageOpenButton')?.addEventListener('click',()=>gcGarageOpen('mechanics'));
$('#gcGarageCloseButton')?.addEventListener('click',gcGarageClose);
$$('[data-garage-view]').forEach(b=>b.addEventListener('click',()=>gcGarageSetView(b.dataset.garageView)));
$('#gcGarageIntakeForm')?.addEventListener('submit',gcGarageIntakeSave);
$('#gcGarageIntakeVehicle')?.addEventListener('change',gcGarageIntakeLoad);
$('#gcGarageRepairForm')?.addEventListener('submit',gcGarageCreateJob);
['gcGarageRepairType','gcGarageRepairMechanic'].forEach(id=>$('#'+id)?.addEventListener('change',gcGarageEstimateRepair));
$('#gcGaragePanel')?.addEventListener('click',event=>{
  const detail=event.target.closest('[data-garage-detail]');if(detail){gcGarageRenderDetail(detail.dataset.garageDetail);return;}
  const repair=event.target.closest('[data-garage-repair-vehicle]');if(repair){const parsed=gcGarageDecodeVehicleValue(repair.dataset.garageRepairVehicle);gcGarageSetView('repairs');if(parsed){const opt=Array.from($('#gcGarageRepairVehicle').options).find(o=>{const v=gcGarageDecodeVehicleValue(o.value);return v&&gcGarageProfileKey(v)===gcGarageProfileKey(parsed);});if(opt)$('#gcGarageRepairVehicle').value=opt.value;}gcGarageEstimateRepair();$('#gcGarageRepairForm').scrollIntoView({behavior:'smooth',block:'nearest'});return;}
  if(event.target.closest('[data-garage-close-detail]')){$('#gcGarageDetail').hidden=true;return;}
  const review=event.target.closest('[data-garage-review]');if(review){gcGarageReview(review.dataset.garageReview);return;}
  const approve=event.target.closest('[data-garage-approve]');if(approve){gcGarageConfirmJob(approve.dataset.garageApprove);return;}
  const refuse=event.target.closest('[data-garage-refuse]');if(refuse){gcGarageRefuseJob(refuse.dataset.garageRefuse);return;}
  const parts=event.target.closest('[data-garage-job-parts]');if(parts){gcGarageOpenJobParts(parts.dataset.garageJobParts);return;}
  const send=event.target.closest('[data-garage-send-mechanic]');if(send){gcGarageSendBreakdownToMechanic(send.dataset.garageSendMechanic);return;}
  const replace=event.target.closest('[data-garage-replace-bus]');if(replace){gcGarageReplaceOperationBus(replace.dataset.garageReplaceBus);return;}
});
$('#gcGarageOpenFromAlert')?.addEventListener('click',()=>gcGarageOpen(ownerOperations().some(o=>o.breakdownPending)?'repairs':'repairs'));
$('#gcGarageExportReports')?.addEventListener('click',()=>{if(!assertOwner())return;const rows=gcGarageReports(),csv=[['Data','Empresa','Prefixo','Modelo','Serviço','Mecânico','Peças','Custo peças','Mão de obra','Total'],...rows.map(r=>[r.date,r.company,r.prefix,r.model,r.task,r.mechanic,(r.parts||[]).map(x=>x.name).join(', '),r.partsCost,r.laborCost,r.totalCost])].map(row=>row.map(csvCell).join(';')).join('\n');downloadTextFile('grupo-conect-relatorio-oficina.csv',csv,'text/csv;charset=utf-8');});
$('#gcAgendaDayEvents')?.addEventListener('click',event=>{const b=event.target.closest('[data-agenda-work]');if(b)gcGarageOpenAgendaEvent(b.dataset.agendaWork);});
$('#onlineHireView')?.addEventListener('click',event=>{const b=event.target.closest('[data-hr-select]');if(b)gcHireSelectCandidate(b.dataset.hrSelect);const d=event.target.closest('[data-hr-dismiss]');if(d)gcHireDismiss(d.dataset.hrDismiss);});
$('#gcHireRole')?.addEventListener('change',gcGarageRenderCandidates);
$('#gcHireForm')?.addEventListener('submit',gcHireSubmit);
$('#onlinePartsView')?.addEventListener('input',event=>{if(event.target.id==='gcPartsSearch')gcGarageRenderParts();});
['gcPartsCategory','gcPartsVehicle','gcPartsJob'].forEach(id=>$('#'+id)?.addEventListener('change',gcGarageRenderParts));
$('#onlinePartsView')?.addEventListener('click',event=>{const b=event.target.closest('[data-part-buy]');if(b)gcGarageBuyPart(b.dataset.partBuy);});
$('#gcWorkshopReportVehicle')?.addEventListener('change',gcGarageRenderReportsPhone);

const gcGarageOriginalWriteArrayKey=writeArrayKey;
writeArrayKey=function(key,items){const ok=gcGarageOriginalWriteArrayKey(key,items);if(ok&&[OWNER_FLEET_KEY,FINANCED_BUSES_KEY,ODOMETER_KEY,BUS_DOC_KEY].includes(key)){gcGarageSyncFleet();if($('#gcGaragePanel')&&!$('#gcGaragePanel').hidden)gcGarageRenderAll();}if(ok&&key===GC_HR_EMPLOYEES_KEY){if(typeof populateShiftDrivers==='function')populateShiftDrivers(true);if(typeof refreshNormalTripDrivers==='function')refreshNormalTripDrivers();if($('#gcGaragePanel')&&!$('#gcGaragePanel').hidden)gcGaragePopulateMechanics();}return ok;};
const gcGarageOriginalOnlineRender=gcOnlineRender;
gcOnlineRender=function(){gcGarageOriginalOnlineRender();gcGarageRenderCandidatesAndPhone();};
const gcGarageOriginalAgendaRender=gcAgendaRender;
gcAgendaRender=function(){gcGarageOriginalAgendaRender();};
const gcGarageOriginalCashRenderFinal=renderCashDashboard;
renderCashDashboard=function(){gcGarageOriginalCashRenderFinal();gcGarageRenderHomeAlert();};
const gcGarageOriginalSwitchScreen=switchScreen;
switchScreen=function(screenId){gcGarageOriginalSwitchScreen(screenId);if(screenId==='homeScreen'||screenId==='ownerAreaScreen')gcGarageRenderHomeAlert();};
const gcGarageOriginalActivateOwnerArea=activateOwnerArea;
activateOwnerArea=function(){gcGarageOriginalActivateOwnerArea();if(ownerAllowed()){gcGarageSyncFleet();gcGarageRenderHomeAlert();}};
if($('#gcGarageHomeAlert'))gcGarageRenderHomeAlert();
gcGarageInit();
