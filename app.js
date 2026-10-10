// =========================================================================================
// DOND - JAVASCRIPT FRONTEND LOGIC & INTEGRATIONS
// =========================================================================================

// ESTADO GLOBAL DO APP
const AppState = {
  activeView: 'novoRegistro', // 'novoRegistro' | 'pedidos' | 'configuracoes'
  disputa: true,
  mediaData: {
    etiqueta: null, // { base64, mimeType }
    caixa: null,    // { base64, mimeType }
    video: null,    // { base64, mimeType }
    avarias: []     // [ { base64, mimeType }, ... ]
  },
  currentCaptureStep: 'etiqueta', // 'etiqueta' -> 'caixa' -> 'video' -> 'avarias'
  produtos: ['JBC FG 4 RISK'],
  plataformas: ['Shopee', 'Mercado Livre', 'Amazon', 'Shein', 'Magalu', 'TikTok Shop'],
  pedidos: [],
  scriptUrl: localStorage.getItem('dond_script_url') || 'https://script.google.com/macros/s/AKfycbwtc60Uq64_nhGo7h7oH5TuqrGyHwGyAnlsF07YhNvKno8H-C8O0RaROCk65KmLLlh5LQ/exec',
  theme: localStorage.getItem('dond_theme') || 'cyan'
};

// =========================================================================================
// INICIALIZAÇÃO
// =========================================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavigation();
  initMediaInputs();
  initLocalStorageData();
  renderDropdowns();
  renderConfigLists();
  renderPedidosTable();

  // Carregar dados remotos do Google Sheets se houver scriptUrl
  if (AppState.scriptUrl) {
    carregarDadosDoServidor(true);
    // Sincronização automática em segundo plano a cada 20 segundos
    setInterval(() => {
      if (AppState.scriptUrl && !document.hidden) {
        carregarDadosDoServidor(false);
      }
    }, 20000);
  }
});

// =========================================================================================
// NAVEGAÇÃO ENTRE TELAS
// =========================================================================================
function initNavigation() {
  const btnNovoRegistro = document.getElementById('navNovoRegistroBtn');
  const btnPedidos = document.getElementById('navPedidosBtn');
  const btnConfig = document.getElementById('navConfigBtn');

  btnNovoRegistro.addEventListener('click', () => switchView('novoRegistro'));
  btnPedidos.addEventListener('click', () => switchView('pedidos'));
  btnConfig.addEventListener('click', () => switchView('configuracoes'));
}

function switchView(viewName) {
  AppState.activeView = viewName;
  
  // Tabs
  document.getElementById('navNovoRegistroBtn').classList.toggle('active', viewName === 'novoRegistro');
  document.getElementById('navPedidosBtn').classList.toggle('active', viewName === 'pedidos');
  document.getElementById('navConfigBtn').classList.toggle('active', viewName === 'configuracoes');

  // Panels
  document.getElementById('viewNovoRegistro').classList.toggle('active', viewName === 'novoRegistro');
  document.getElementById('viewPedidos').classList.toggle('active', viewName === 'pedidos');
  document.getElementById('viewConfiguracoes').classList.toggle('active', viewName === 'configuracoes');

  if (viewName === 'pedidos') {
    renderPedidosTable();
  }
}

// =========================================================================================
// FLUXO DE CAPTURA SEQUENCIAL E MÍDIAS
// =========================================================================================
function initMediaInputs() {
  const photoInput = document.getElementById('cameraPhotoInput');
  const videoInput = document.getElementById('cameraVideoInput');

  photoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showLoading('Processando Foto...', 'Compactando imagem...');
    try {
      const base64Data = await compressImage(file, 1280, 0.82);
      handleCapturedPhoto(base64Data, 'image/jpeg');
    } catch (err) {
      console.error(err);
      showToast('Erro ao processar imagem.', 'error');
    } finally {
      hideLoading();
      photoInput.value = '';
    }
  });

  videoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showLoading('Processando Vídeo...', 'Preparando arquivo...');
    try {
      const base64Data = await fileToBase64(file);
      handleCapturedVideo(base64Data, file.type || 'video/mp4');
    } catch (err) {
      console.error(err);
      showToast('Erro ao processar vídeo.', 'error');
    } finally {
      hideLoading();
      videoInput.value = '';
    }
  });
}

// =========================================================================================
// GRAVAÇÃO DE VÍDEO DIRETA (LIMITADA EM 1 MINUTO / 60 SEGUNDOS)
// =========================================================================================
let mediaRecorderInstance = null;
let recordedVideoChunks = [];
let videoStreamTrack = null;
let recordTimerInterval = null;
let recordSecondsLeft = 60;

function triggerCapture(step) {
  AppState.currentCaptureStep = step;

  if (step === 'video') {
    // Tenta abrir gravador embutido com timer de 1 minuto
    abrirGravadorVideo1Minuto();
  } else {
    document.getElementById('cameraPhotoInput').click();
  }
}

async function abrirGravadorVideo1Minuto() {
  const modal = document.getElementById('videoRecordModal');
  const videoEl = document.getElementById('videoLiveStream');
  const timerBadge = document.getElementById('recordTimerBadge');
  const timerText = document.getElementById('recordTimerText');
  const btnIcon = document.getElementById('btnRecordIcon');
  const btnLabel = document.getElementById('btnRecordLabel');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    videoStreamTrack = stream;
    videoEl.srcObject = stream;
    modal.style.display = 'flex';
    timerBadge.style.display = 'none';
    timerText.textContent = '01:00';
    btnLabel.textContent = 'Iniciar Gravação';
    btnIcon.className = 'fa-solid fa-circle-dot';
  } catch (err) {
    console.warn("Acesso à câmera direta indisponível, usando input nativo:", err);
    // Fallback para input de câmera nativo do celular
    document.getElementById('cameraVideoInput').click();
  }
}

function toggleRecordVideo() {
  if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
    pararGravacaoVideo();
  } else {
    iniciarGravacaoVideo();
  }
}

function iniciarGravacaoVideo() {
  if (!videoStreamTrack) return;
  recordedVideoChunks = [];

  let options = { mimeType: 'video/webm;codecs=vp8,opus' };
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    options = { mimeType: 'video/mp4' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = {};
    }
  }

  try {
    mediaRecorderInstance = new MediaRecorder(videoStreamTrack, options);
  } catch (e) {
    mediaRecorderInstance = new MediaRecorder(videoStreamTrack);
  }

  mediaRecorderInstance.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedVideoChunks.push(e.data);
    }
  };

  mediaRecorderInstance.onstop = async () => {
    clearInterval(recordTimerInterval);
    const mimeType = mediaRecorderInstance.mimeType || 'video/mp4';
    const blob = new Blob(recordedVideoChunks, { type: mimeType });
    
    showLoading('Processando Vídeo...', 'Preparando mídias...');
    try {
      const base64 = await blobToBase64(blob);
      handleCapturedVideo(base64, mimeType);
    } catch (err) {
      console.error(err);
      showToast('Erro ao processar vídeo gravado.', 'error');
    } finally {
      hideLoading();
      fecharModalGravacaoVideo();
    }
  };

  mediaRecorderInstance.start(1000);
  recordSecondsLeft = 60;

  const timerBadge = document.getElementById('recordTimerBadge');
  const timerText = document.getElementById('recordTimerText');
  const btnLabel = document.getElementById('btnRecordLabel');
  const btnIcon = document.getElementById('btnRecordIcon');

  timerBadge.style.display = 'flex';
  btnLabel.textContent = 'Parar Vídeo';
  btnIcon.className = 'fa-solid fa-stop';

  recordTimerInterval = setInterval(() => {
    recordSecondsLeft--;
    const mins = String(Math.floor(recordSecondsLeft / 60)).padStart(2, '0');
    const secs = String(recordSecondsLeft % 60).padStart(2, '0');
    timerText.textContent = `${mins}:${secs}`;

    if (recordSecondsLeft <= 0) {
      pararGravacaoVideo();
    }
  }, 1000);
}

function pararGravacaoVideo() {
  if (mediaRecorderInstance && mediaRecorderInstance.state === 'recording') {
    mediaRecorderInstance.stop();
  }
}

function fecharModalGravacaoVideo() {
  clearInterval(recordTimerInterval);
  if (videoStreamTrack) {
    videoStreamTrack.getTracks().forEach(t => t.stop());
    videoStreamTrack = null;
  }
  document.getElementById('videoRecordModal').style.display = 'none';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

function handleCapturedPhoto(base64, mimeType) {
  const step = AppState.currentCaptureStep;

  if (step === 'etiqueta') {
    AppState.mediaData.etiqueta = { base64, mimeType };
    updateEtiquetaUI(base64);
    showToast('Etiqueta capturada! Agora foto da Caixa.', 'info');
    // Avança para a próxima etapa automaticamente
    setTimeout(() => triggerCapture('caixa'), 450);

  } else if (step === 'caixa') {
    AppState.mediaData.caixa = { base64, mimeType };
    updateCaixaUI(base64);
    showToast('Caixa capturada! Agora gravação de Vídeo (1 min).', 'info');
    // Avança para a próxima etapa (vídeo)
    setTimeout(() => triggerCapture('video'), 450);

  } else if (step === 'avarias') {
    if (AppState.mediaData.avarias.length >= 10) {
      showToast('Limite máximo de 10 fotos extras atingido.', 'error');
      return;
    }
    AppState.mediaData.avarias.push({ base64, mimeType });
    updateAvariasUI();
    showToast(`Foto de avaria #${AppState.mediaData.avarias.length} adicionada!`, 'success');
  }
}

function handleCapturedVideo(base64, mimeType) {
  AppState.mediaData.video = { base64, mimeType };
  updateVideoUI(base64);
  showToast('Vídeo registrado! Adicione fotos de avarias se houver.', 'info');
}

// ATUALIZAÇÕES VISUAIS DOS CARDS DE MÍDIA
function updateEtiquetaUI(base64) {
  const img = document.getElementById('imgEtiqueta');
  const empty = document.getElementById('emptyEtiqueta');
  const badge = document.getElementById('badgeEtiqueta');

  if (base64) {
    img.src = base64;
    img.style.display = 'block';
    empty.style.display = 'none';
    badge.style.display = 'block';
  } else {
    img.src = '';
    img.style.display = 'none';
    empty.style.display = 'flex';
    badge.style.display = 'none';
  }
}

function updateCaixaUI(base64) {
  const img = document.getElementById('imgCaixa');
  const icon = document.getElementById('emptyCaixaIcon');
  const badge = document.getElementById('badgeCaixa');

  if (base64) {
    img.src = base64;
    img.style.display = 'block';
    icon.style.display = 'none';
    badge.style.display = 'flex';
  } else {
    img.src = '';
    img.style.display = 'none';
    icon.style.display = 'block';
    badge.style.display = 'none';
  }
}

function updateVideoUI(base64) {
  const video = document.getElementById('vidPreview');
  const icon = document.getElementById('emptyVideoIcon');
  const badge = document.getElementById('badgeVideo');

  if (base64) {
    video.src = base64;
    video.style.display = 'block';
    icon.style.display = 'none';
    badge.style.display = 'flex';
  } else {
    video.src = '';
    video.style.display = 'none';
    icon.style.display = 'block';
    badge.style.display = 'none';
  }
}

function updateAvariasUI() {
  const list = AppState.mediaData.avarias;
  const count = list.length;
  const countBadge = document.getElementById('avariasCount');
  const imgPreview = document.getElementById('imgAvariasPreview');
  const icon = document.getElementById('emptyAvariasIcon');
  const badgeAvarias = document.getElementById('badgeAvarias');
  const shelf = document.getElementById('avariasShelf');
  const shelfCount = document.getElementById('shelfCount');
  const shelfList = document.getElementById('shelfList');

  shelfCount.textContent = count;
  countBadge.textContent = count;

  if (count > 0) {
    countBadge.style.display = 'flex';
    imgPreview.src = list[list.length - 1].base64;
    imgPreview.style.display = 'block';
    icon.style.display = 'none';
    badgeAvarias.style.display = 'flex';
    shelf.style.display = 'block';

    shelfList.innerHTML = list.map((item, idx) => `
      <div class="shelf-item">
        <img src="${item.base64}" alt="Avaria ${idx+1}" />
        <button type="button" class="shelf-remove" onclick="removerAvaria(${idx})">&times;</button>
      </div>
    `).join('');
  } else {
    countBadge.style.display = 'none';
    imgPreview.style.display = 'none';
    icon.style.display = 'block';
    badgeAvarias.style.display = 'none';
    shelf.style.display = 'none';
    shelfList.innerHTML = '';
  }
}

function removerAvaria(index) {
  AppState.mediaData.avarias.splice(index, 1);
  updateAvariasUI();
}

// =========================================================================================
// FORMULÁRIO E SUBMISSÃO DE REGISTRO (UPLOAD EM SEGUNDO PLANO OTIMIZADO)
// =========================================================================================
function setDisputa(valor) {
  AppState.disputa = valor;
  document.getElementById('btnDisputaSim').classList.toggle('active', valor === true);
  document.getElementById('btnDisputaNao').classList.toggle('active', valor === false);
}

async function finalizarRegistro() {
  const btnFinalizar = document.getElementById('btnFinalizar');
  const produto = document.getElementById('selectProduto').value;
  const plataforma = document.getElementById('selectPlataforma').value;
  const pedido = document.getElementById('inputPedido').value.trim();

  if (!produto) {
    showToast('Por favor selecione o Produto obrigatório (*).', 'error');
    document.getElementById('selectProduto').focus();
    return;
  }

  // Desabilita botão para impedir múltiplos envios acidentais
  if (btnFinalizar) {
    btnFinalizar.disabled = true;
    btnFinalizar.style.opacity = '0.6';
  }

  // 1. Exibe a Barra de Carregamento Horizontal com Alerta de Segurança
  showLoading(
    'Salvando Registro...',
    'Gravando na planilha e no dispositivo. Aguarde...',
    15,
    'Preparando dados...'
  );

  const recordId = 'reg_' + Date.now();
  const dataAtual = new Date();
  const dataFormatada = `${String(dataAtual.getDate()).padStart(2, '0')}/${String(dataAtual.getMonth() + 1).padStart(2, '0')}`;
  const produtoLimpo = formatarNomeProduto(produto);

  // Payload completo para upload
  const payload = {
    action: 'saveRegistro',
    id: recordId,
    plataforma: plataforma,
    produto: produtoLimpo,
    pedido: pedido,
    disputa: AppState.disputa,
    etiqueta: AppState.mediaData.etiqueta,
    caixa: AppState.mediaData.caixa,
    video: AppState.mediaData.video,
    avarias: AppState.mediaData.avarias
  };

  // 2. Gravação imediata no LocalStorage com proteção total contra perda
  const novoItem = {
    id: recordId,
    data: dataFormatada,
    plataforma: plataforma || 'Shopee',
    produto: produtoLimpo,
    pedido: pedido || 'S/N',
    disputa: AppState.disputa ? 'SIM' : 'NÃO',
    pastaDrive: '#',
    etiqueta: AppState.mediaData.etiqueta ? AppState.mediaData.etiqueta.base64 : '',
    caixa: AppState.mediaData.caixa ? AppState.mediaData.caixa.base64 : '',
    video: AppState.mediaData.video ? AppState.mediaData.video.base64 : '',
    avarias: AppState.mediaData.avarias.map(a => a.base64)
  };

  AppState.pedidos.unshift(novoItem);
  localStorage.setItem('dond_pedidos', JSON.stringify(AppState.pedidos));

  updateLoadingProgress(40, 'Salvo no dispositivo com sucesso!');

  // 3. Envio seguro para o Google Apps Script & Google Sheets
  if (AppState.scriptUrl) {
    updateLoadingProgress(60, 'Enviando para o Google Sheets & Drive...');
    
    // Animação contínua da barra enquanto a rede processa
    const progressTimer = setInterval(() => {
      const currentVal = parseInt(document.getElementById('loadingProgressPercent').textContent) || 60;
      if (currentVal < 90) {
        updateLoadingProgress(currentVal + 3, 'Gravando na planilha...');
      }
    }, 350);

    try {
      const response = await fetch(AppState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      clearInterval(progressTimer);

      updateLoadingProgress(95, 'Confirmando gravação...');
      const res = await response.json();

      if (res.success) {
        const idx = AppState.pedidos.findIndex(p => p.id === payload.id);
        if (idx !== -1 && res.folderUrl) {
          AppState.pedidos[idx].pastaDrive = res.folderUrl;
          localStorage.setItem('dond_pedidos', JSON.stringify(AppState.pedidos));
        }
        updateLoadingProgress(100, 'Salvo com sucesso!');
        await new Promise(r => setTimeout(r, 450));
        showToast('Registro e anotação gravados com sucesso na planilha!', 'success');
      } else {
        throw new Error(res.error || 'Erro no servidor do Apps Script');
      }
    } catch (err) {
      clearInterval(progressTimer);
      console.warn('Aviso de conexão com o Sheets:', err);
      updateLoadingProgress(100, 'Salvo localmente!');
      await new Promise(r => setTimeout(r, 450));
      showToast('Registro garantido no aplicativo! Verifique a conexão com o Google Sheets.', 'info');
    }
  } else {
    updateLoadingProgress(100, 'Concluído!');
    await new Promise(r => setTimeout(r, 350));
    showToast('Registro salvo no histórico local.', 'success');
  }

  // Fecha loading e reabilita botão
  hideLoading();
  if (btnFinalizar) {
    btnFinalizar.disabled = false;
    btnFinalizar.style.opacity = '1';
  }

  // Limpa formulário e navega com segurança para a tabela
  resetRegistroForm();
  switchView('pedidos');
}

function resetRegistroForm() {
  document.getElementById('registroForm').reset();
  AppState.mediaData = {
    etiqueta: null,
    caixa: null,
    video: null,
    avarias: []
  };
  updateEtiquetaUI(null);
  updateCaixaUI(null);
  updateVideoUI(null);
  updateAvariasUI();
  setDisputa(true);
}

// =========================================================================================
// BARCODE / QR CODE SCANNER
// =========================================================================================
let html5QrCodeScanner = null;

function iniciarLeitorBarcode() {
  const modal = document.getElementById('barcodeScannerModal');
  modal.style.display = 'flex';

  if (!html5QrCodeScanner) {
    html5QrCodeScanner = new Html5Qrcode("reader");
  }

  const qrConfig = { fps: 10, qrbox: { width: 250, height: 150 } };

  html5QrCodeScanner.start(
    { facingMode: "environment" },
    qrConfig,
    (decodedText) => {
      // Sucesso na leitura do código de barras
      document.getElementById('inputPedido').value = decodedText;
      showToast(`Código lido: ${decodedText}`, 'success');
      fecharLeitorBarcode();
    },
    (errorMessage) => {
      // Leitura em andamento / frame sem código
    }
  ).catch(err => {
    console.warn("Erro ao iniciar leitor de código:", err);
    showToast("Permissão de câmera necessária para escanear.", "error");
  });
}

function fecharLeitorBarcode() {
  const modal = document.getElementById('barcodeScannerModal');
  modal.style.display = 'none';
  if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
    html5QrCodeScanner.stop().catch(e => console.warn(e));
  }
}

// =========================================================================================
// EDIÇÃO E EXCLUSÃO DE PEDIDOS (SINCRONIZAÇÃO EM TEMPO REAL)
// =========================================================================================
let editDisputaValor = true;

function abrirModalEdicao(index) {
  const item = AppState.pedidos[index];
  if (!item) return;

  document.getElementById('editPedidoId').value = item.id;
  document.getElementById('editData').value = formatarDataSimples(item.data);
  document.getElementById('editPedido').value = item.pedido || '';

  // Popula selects
  const selPlat = document.getElementById('editPlataforma');
  const selProd = document.getElementById('editProduto');

  selPlat.innerHTML = AppState.plataformas.map(p => `<option value="${p}" ${p === item.plataforma ? 'selected' : ''}>${p}</option>`).join('');
  selProd.innerHTML = AppState.produtos.map(p => `<option value="${p}" ${p === item.produto ? 'selected' : ''}>${p}</option>`).join('');

  editDisputaValor = (item.disputa || '').toUpperCase() === 'SIM';
  setEditDisputa(editDisputaValor);

  document.getElementById('editPedidoModal').style.display = 'flex';
}

function fecharModalEdicao() {
  document.getElementById('editPedidoModal').style.display = 'none';
}

function setEditDisputa(valor) {
  editDisputaValor = valor;
  document.getElementById('btnEditDisputaSim').classList.toggle('active', valor === true);
  document.getElementById('btnEditDisputaNao').classList.toggle('active', valor === false);
}

async function salvarEdicaoPedido() {
  const id = document.getElementById('editPedidoId').value;
  const dataVal = document.getElementById('editData').value.trim();
  const plataforma = document.getElementById('editPlataforma').value;
  const produto = document.getElementById('editProduto').value;
  const pedido = document.getElementById('editPedido').value.trim();

  const index = AppState.pedidos.findIndex(p => p.id === id);
  if (index === -1) return;

  // Atualiza estado local imediatamente
  AppState.pedidos[index].data = dataVal;
  AppState.pedidos[index].plataforma = plataforma;
  AppState.pedidos[index].produto = produto;
  AppState.pedidos[index].pedido = pedido;
  AppState.pedidos[index].disputa = editDisputaValor ? 'SIM' : 'NÃO';

  localStorage.setItem('dond_pedidos', JSON.stringify(AppState.pedidos));
  renderPedidosTable();
  fecharModalEdicao();
  showToast('Pedido atualizado no app!', 'success');

  // Sincroniza com Google Sheets
  if (AppState.scriptUrl) {
    try {
      fetch(AppState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updatePedido',
          id: id,
          data: dataVal,
          plataforma: plataforma,
          produto: produto,
          pedido: pedido,
          disputa: editDisputaValor
        })
      });
    } catch (e) {
      console.warn('Erro ao sincronizar edição:', e);
    }
  }
}

async function excluirPedido(index) {
  const item = AppState.pedidos[index];
  if (!item) return;

  if (!confirm(`Deseja realmente excluir o registro do pedido "${item.pedido || item.produto}"?`)) {
    return;
  }

  const id = item.id;
  // Remove localmente imediatamente
  AppState.pedidos.splice(index, 1);
  localStorage.setItem('dond_pedidos', JSON.stringify(AppState.pedidos));
  renderPedidosTable();
  showToast('Registro excluído!', 'info');

  // Sincroniza com Google Sheets
  if (AppState.scriptUrl) {
    try {
      fetch(AppState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deletePedido',
          id: id
        })
      });
    } catch (e) {
      console.warn('Erro ao sincronizar exclusão:', e);
    }
  }
}

function formatarNomeProduto(str) {
  if (!str || typeof str !== 'string') return '';
  const idx = str.indexOf('-');
  if (idx !== -1) {
    return str.substring(0, idx).trim();
  }
  return str.trim();
}

function formatarDataSimples(dataStr) {
  if (!dataStr) return '';
  if (typeof dataStr === 'string') {
    if (dataStr.includes('T')) {
      const d = new Date(dataStr);
      if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    }
    // Se for formato dd/mm ou dd/mm/yyyy hh:mm, extrai apenas dd/mm
    const match = dataStr.match(/^(\d{2}\/\d{2})/);
    if (match) return match[1];
  }
  return dataStr;
}

// =========================================================================================
// VIEW 2: HISTÓRICO DE PEDIDOS & TABELA
// =========================================================================================
function renderPedidosTable(pedidosParaRenderizar = null) {
  const list = pedidosParaRenderizar || AppState.pedidos;
  const tbody = document.getElementById('pedidosTableBody');
  const emptyState = document.getElementById('pedidosEmptyState');

  if (!list || list.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  tbody.innerHTML = list.map((item, idx) => {
    const isSim = (item.disputa || '').toUpperCase() === 'SIM';
    const dataFormatada = formatarDataSimples(item.data);
    const produtoFormatado = formatarNomeProduto(item.produto);
    return `
      <tr>
        <td style="white-space: nowrap; font-weight: 700;">${dataFormatada}</td>
        <td>${item.plataforma || '-'}</td>
        <td style="font-weight: 700;">${produtoFormatado || '-'}</td>
        <td><code>${item.pedido || '-'}</code></td>
        <td>
          <span class="table-badge-disputa ${isSim ? 'sim' : 'nao'}">
            ${isSim ? 'SIM' : 'NÃO'}
          </span>
        </td>
        <td>
          <div class="table-actions">
            <button class="action-icon-btn" onclick="downloadMidias(${idx})" title="Baixar ZIP (Fotos agrupadas + Vídeo)">
              <i class="fa-solid fa-download"></i>
            </button>
            <button class="action-icon-btn" onclick="abrirModalEdicao(${idx})" title="Editar Pedido">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="action-icon-btn" style="color: var(--danger);" onclick="excluirPedido(${idx})" title="Excluir Pedido">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filtrarPedidos() {
  const query = document.getElementById('pedidosSearch').value.toLowerCase().trim();
  if (!query) {
    renderPedidosTable();
    return;
  }
  const filtrados = AppState.pedidos.filter(p => 
    (p.pedido && p.pedido.toLowerCase().includes(query)) ||
    (p.produto && p.produto.toLowerCase().includes(query)) ||
    (p.plataforma && p.plataforma.toLowerCase().includes(query)) ||
    (p.data && p.data.toLowerCase().includes(query))
  );
  renderPedidosTable(filtrados);
}

// =========================================================================================
// MODAL DE VISUALIZAÇÃO DE MÍDIAS DO PEDIDO & LIGHTBOX
// =========================================================================================
let currentSelectedPedidoIndex = null;

function formatDriveMediaUrl(url) {
  if (!url) return '';
  // Se for Base64 (salvo localmente), retorna direto
  if (url.startsWith('data:')) return url;

  // Se for link do Google Drive (/file/d/ID/view ou open?id=ID ou uc?id=ID)
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    const fileId = match[1];
    // Formato de alta resolução do Google Drive Thumbnail
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
  }
  return url;
}

function abrirModalMidias(index) {
  currentSelectedPedidoIndex = index;
  const item = AppState.pedidos[index];
  if (!item) return;

  const modal = document.getElementById('mediaModal');
  const title = document.getElementById('modalTitle');
  const content = document.getElementById('modalMediaContent');
  const driveBtn = document.getElementById('btnModalDriveFolder');

  title.textContent = `Pedido: ${item.pedido || item.produto}`;
  driveBtn.href = item.pastaDrive && item.pastaDrive !== '#' ? item.pastaDrive : 'https://drive.google.com';

  let html = '';

  if (item.etiqueta) {
    const src = formatDriveMediaUrl(item.etiqueta);
    html += `
      <div class="modal-media-group">
        <label><i class="fa-solid fa-barcode"></i> Foto da Etiqueta (Toque para ampliar):</label>
        <img src="${src}" class="modal-media-img" alt="Etiqueta" onclick="abrirLightbox('${src}')" onerror="this.onerror=null; this.src='${item.etiqueta}'" />
      </div>
    `;
  }

  if (item.caixa) {
    const src = formatDriveMediaUrl(item.caixa);
    html += `
      <div class="modal-media-group">
        <label><i class="fa-solid fa-box"></i> Foto da Caixa (Toque para ampliar):</label>
        <img src="${src}" class="modal-media-img" alt="Caixa" onclick="abrirLightbox('${src}')" onerror="this.onerror=null; this.src='${item.caixa}'" />
      </div>
    `;
  }

  if (item.video) {
    html += `
      <div class="modal-media-group">
        <label><i class="fa-solid fa-video"></i> Vídeo de Abertura:</label>
        <video controls class="modal-video-box" src="${item.video}"></video>
      </div>
    `;
  }

  if (item.avarias && item.avarias.length > 0) {
    html += `
      <div class="modal-media-group">
        <label><i class="fa-solid fa-shield-halved"></i> Fotos de Avarias (${item.avarias.length}) - Toque para ampliar:</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          ${item.avarias.map(imgUrl => {
            const src = formatDriveMediaUrl(imgUrl);
            return `<img src="${src}" class="modal-media-img" alt="Avaria" onclick="abrirLightbox('${src}')" onerror="this.onerror=null; this.src='${imgUrl}'" />`;
          }).join('')}
        </div>
      </div>
    `;
  }

  if (!html) {
    html = '<p style="text-align:center; color:#94a3b8; padding: 20px;">Nenhuma foto/vídeo anexada a este registro.</p>';
  }

  content.innerHTML = html;
  modal.style.display = 'flex';
}

function fecharModalMidias() {
  document.getElementById('mediaModal').style.display = 'none';
  currentSelectedPedidoIndex = null;
}

function abrirLightbox(imgSrc) {
  const lightbox = document.getElementById('imageLightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  lightboxImg.src = imgSrc;
  lightbox.style.display = 'flex';
}

function fecharLightbox() {
  document.getElementById('imageLightbox').style.display = 'none';
}

// =========================================================================================
// MESCLAGEM DE IMAGENS E GERAÇÃO DO KIT SHOPEE (MÁXIMO 3 ARQUIVOS)
// =========================================================================================

// 1. Unir Etiqueta + Caixa lado a lado
async function mergeEtiquetaECaixa(etiquetaUrl, caixaUrl) {
  if (!etiquetaUrl && !caixaUrl) return null;
  if (!etiquetaUrl) return await fetchMediaBlob(caixaUrl);
  if (!caixaUrl) return await fetchMediaBlob(etiquetaUrl);

  const img1 = await loadImageElement(etiquetaUrl);
  const img2 = await loadImageElement(caixaUrl);

  const targetHeight = 1200;
  const w1 = Math.round((img1.width * targetHeight) / img1.height);
  const w2 = Math.round((img2.width * targetHeight) / img2.height);

  const totalWidth = w1 + w2;
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = targetHeight + 60; // 60px para cabeçalho com identificação

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Faixas e textos superiores
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Plus Jakarta Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('1. ETIQUETA DE ENVIO', w1 / 2, 40);
  ctx.fillText('2. EMBALAGEM / CAIXA', w1 + (w2 / 2), 40);

  // Desenhar imagens
  ctx.drawImage(img1, 0, 60, w1, targetHeight);
  ctx.drawImage(img2, w1, 60, w2, targetHeight);

  // Linha divisória central
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w1, 0);
  ctx.lineTo(w1, canvas.height);
  ctx.stroke();

  return await canvasToBlob(canvas);
}

// 2. Unir todas as fotos de avarias em um mosaico único
async function mergeAvariasMosaico(avariasUrls) {
  if (!avariasUrls || avariasUrls.length === 0) return null;
  if (avariasUrls.length === 1) return await fetchMediaBlob(avariasUrls[0]);

  const images = [];
  for (let url of avariasUrls) {
    try {
      const img = await loadImageElement(url);
      images.push(img);
    } catch (e) {
      console.warn('Erro ao carregar imagem de avaria para mosaico:', e);
    }
  }

  if (images.length === 0) return null;

  const count = images.length;
  let cols = 2;
  if (count === 1) cols = 1;
  else if (count >= 5) cols = 3;

  const rows = Math.ceil(count / cols);
  const cellWidth = 800;
  const cellHeight = 800;
  const headerHeight = 60;

  const canvas = document.createElement('canvas');
  canvas.width = cols * cellWidth;
  canvas.height = (rows * cellHeight) + headerHeight;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Plus Jakarta Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`PAINEL DE AVARIAS DO PRODUTO (${count} FOTOS)`, canvas.width / 2, 42);

  for (let i = 0; i < images.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = c * cellWidth;
    const y = headerHeight + (r * cellHeight);

    const img = images[i];
    // Desenha proporcionalmente centralizado
    ctx.drawImage(img, x + 10, y + 10, cellWidth - 20, cellHeight - 20);

    // Tag identificadora no canto da foto
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x + 20, y + 20, 160, 44);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Avaria #${i + 1}`, x + 35, y + 50);
  }

  return await canvasToBlob(canvas);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      // Tenta fallback com proxy drive thumbnail se necessário
      const formatted = formatDriveMediaUrl(src);
      if (formatted !== src) {
        const retryImg = new Image();
        retryImg.crossOrigin = 'anonymous';
        retryImg.onload = () => resolve(retryImg);
        retryImg.onerror = reject;
        retryImg.src = formatted;
      } else {
        reject(err);
      }
    };
    img.src = formatDriveMediaUrl(src);
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.90);
  });
}

// 3. Download exclusivo do KIT SHOPEE (Exatamente até 3 arquivos)
async function downloadKitShopee() {
  if (currentSelectedPedidoIndex === null) return;
  const item = AppState.pedidos[currentSelectedPedidoIndex];
  if (!item) return;

  const baseName = `Shopee_${(item.pedido || item.produto || 'Disputa')}`.replace(/[\/\\:*?"<>|]/g, '_');
  showLoading('Gerando Kit Shopee...', 'Mesclando fotos em exatamente 3 arquivos...');

  try {
    const zip = new JSZip();
    const folder = zip.folder(baseName);
    let filesCount = 0;

    // Arquivo 1: Etiqueta + Caixa mescladas
    if (item.etiqueta || item.caixa) {
      const mergedFoto1 = await mergeEtiquetaECaixa(item.etiqueta, item.caixa);
      if (mergedFoto1) {
        folder.file('01_Etiqueta_e_Caixa.jpg', mergedFoto1);
        filesCount++;
      }
    }

    // Arquivo 2: Vídeo de abertura
    if (item.video) {
      const videoBlob = await fetchMediaBlob(item.video);
      if (videoBlob) {
        folder.file('02_Video_Abertura.mp4', videoBlob);
        filesCount++;
      }
    }

    // Arquivo 3: Mosaico único com todas as fotos de avarias
    if (item.avarias && item.avarias.length > 0) {
      const mergedAvarias = await mergeAvariasMosaico(item.avarias);
      if (mergedAvarias) {
        folder.file('03_Mosaico_Avarias.jpg', mergedAvarias);
        filesCount++;
      }
    }

    if (filesCount > 0) {
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${baseName}_Kit3Arquivos.zip`);
      showToast('Kit Shopee de 3 arquivos gerado com sucesso!', 'success');
    } else {
      showToast('Nenhuma mídia encontrada para gerar o Kit.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao gerar Kit Shopee: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// =========================================================================================
// DOWNLOAD AUTOMÁTICO DO KIT EM 3 ARQUIVOS (ETIQUETA+CAIXA MESCLADAS, VÍDEO E MOSAICO DE AVARIAS)
// =========================================================================================
async function downloadMidias(index) {
  currentSelectedPedidoIndex = index;
  const item = AppState.pedidos[index];
  if (!item) return;

  const baseName = `Disputa_${(item.plataforma || 'Plat')}_${(item.pedido || item.produto || 'Pedido')}`.replace(/[\/\\:*?"<>|]/g, '_');
  showLoading('Gerando Arquivo ZIP...', 'Agrupando fotos e preparando Kit de 3 arquivos...', 10, 'Iniciando');

  try {
    const zip = new JSZip();
    const folder = zip.folder(baseName);
    let filesCount = 0;

    // 1. Arquivo 1: Etiqueta + Caixa mescladas lado a lado
    if (item.etiqueta || item.caixa) {
      updateLoadingProgress(35, 'Mesclando Etiqueta e Caixa...');
      const mergedFoto1 = await mergeEtiquetaECaixa(item.etiqueta, item.caixa);
      if (mergedFoto1) {
        folder.file('01_Etiqueta_e_Caixa.jpg', mergedFoto1);
        filesCount++;
      }
    }

    // 2. Arquivo 2: Vídeo de abertura
    if (item.video) {
      updateLoadingProgress(60, 'Empacotando Vídeo...');
      const videoBlob = await fetchMediaBlob(item.video);
      if (videoBlob) {
        folder.file('02_Video_Abertura.mp4', videoBlob);
        filesCount++;
      }
    }

    // 3. Arquivo 3: Mosaico único com todas as fotos de avarias
    if (item.avarias && item.avarias.length > 0) {
      updateLoadingProgress(80, 'Gerando painel de fotos de avarias...');
      const mergedAvarias = await mergeAvariasMosaico(item.avarias);
      if (mergedAvarias) {
        folder.file('03_Mosaico_Avarias.jpg', mergedAvarias);
        filesCount++;
      }
    }

    if (filesCount > 0) {
      updateLoadingProgress(95, 'Compactando arquivo .ZIP...');
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${baseName}_KitCompleto.zip`);
      updateLoadingProgress(100, 'Download pronto!');
      await new Promise(r => setTimeout(r, 400));
      showToast('Download do ZIP com fotos agrupadas concluído!', 'success');
    } else {
      showToast('Nenhuma mídia encontrada para este registro.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao compactar ZIP: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function fetchMediaBlob(url) {
  if (!url) return null;
  try {
    if (url.startsWith('data:')) {
      const parts = url.split(',');
      const mime = parts[0].match(/:(.*?);/)[1] || 'image/jpeg';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    }

    const driveDirectUrl = formatDriveMediaUrl(url);
    const response = await fetch(driveDirectUrl);
    if (!response.ok) throw new Error('Falha no download da imagem');
    return await response.blob();
  } catch (e) {
    console.warn('Não foi possível obter o blob direto:', url, e);
    return null;
  }
}

// =========================================================================================
// VIEW 3: CONFIGURAÇÕES & INTEGRAÇÃO SHEETS
// =========================================================================================
function toggleAccordion(accId) {
  const item = document.getElementById(accId);
  const isOpen = item.classList.contains('open');
  // Fecha outros se quiser ou permite múltiplos abertos
  item.classList.toggle('open', !isOpen);
}

function renderDropdowns() {
  const selectProd = document.getElementById('selectProduto');
  const selectPlat = document.getElementById('selectPlataforma');

  // Mapeia produtos formatando antes do hífen e removendo duplicatas
  const produtosLimpos = [...new Set(AppState.produtos.map(p => formatarNomeProduto(p)))];

  selectProd.innerHTML = '<option value="">Selecione o produto cadastrado...</option>' +
    produtosLimpos.map(p => `<option value="${p}">${p}</option>`).join('');

  selectPlat.innerHTML = '<option value="">Selecione a plataforma...</option>' +
    AppState.plataformas.map(p => `<option value="${p}">${p}</option>`).join('');
}

function renderConfigLists() {
  const listProd = document.getElementById('listaProdutosConfig');
  const listPlat = document.getElementById('listaPlataformasConfig');

  listProd.innerHTML = AppState.produtos.map((p, idx) => `
    <li class="tag-item">
      <span>${formatarNomeProduto(p)}</span>
      <button class="btn-remove-tag" onclick="removerProduto(${idx})"><i class="fa-solid fa-trash-can"></i></button>
    </li>
  `).join('');

  listPlat.innerHTML = AppState.plataformas.map((p, idx) => `
    <li class="tag-item">
      <span>${p}</span>
      <button class="btn-remove-tag" onclick="removerPlataforma(${idx})"><i class="fa-solid fa-trash-can"></i></button>
    </li>
  `).join('');
}

function adicionarProduto() {
  const input = document.getElementById('newProdutoInput');
  const val = formatarNomeProduto(input.value.trim());
  if (!val) return;
  if (!AppState.produtos.includes(val)) {
    AppState.produtos.push(val);
  }
  input.value = '';
  saveLocalConfigs();
  renderDropdowns();
  renderConfigLists();
  showToast(`Produto "${val}" adicionado!`, 'success');
}

function removerProduto(idx) {
  AppState.produtos.splice(idx, 1);
  saveLocalConfigs();
  renderDropdowns();
  renderConfigLists();
}

function adicionarPlataforma() {
  const input = document.getElementById('newPlataformaInput');
  const val = input.value.trim();
  if (!val) return;
  if (!AppState.plataformas.includes(val)) {
    AppState.plataformas.push(val);
  }
  input.value = '';
  saveLocalConfigs();
  renderDropdowns();
  renderConfigLists();
  showToast(`Plataforma "${val}" adicionada!`, 'success');
}

function removerPlataforma(idx) {
  AppState.plataformas.splice(idx, 1);
  saveLocalConfigs();
  renderDropdowns();
  renderConfigLists();
}

async function salvarProdutosParaServidor() {
  if (!AppState.scriptUrl) {
    showToast('Configure a URL do Google Apps Script abaixo primeiro!', 'error');
    return;
  }
  showLoading('Sincronizando...', 'Salvando lista de produtos no Google Sheets...');
  try {
    const produtosFormatados = AppState.produtos.map(p => formatarNomeProduto(p));
    const res = await fetch(AppState.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveProdutos', produtos: produtosFormatados })
    });
    const json = await res.json();
    if (json.success) showToast('Produtos sincronizados com a planilha!', 'success');
  } catch (e) {
    showToast('Erro ao sincronizar: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

async function salvarPlataformasParaServidor() {
  if (!AppState.scriptUrl) {
    showToast('Configure a URL do Google Apps Script abaixo primeiro!', 'error');
    return;
  }
  showLoading('Sincronizando...', 'Salvando lista de plataformas no Google Sheets...');
  try {
    const res = await fetch(AppState.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'savePlataformas', plataformas: AppState.plataformas })
    });
    const json = await res.json();
    if (json.success) showToast('Plataformas sincronizadas com a planilha!', 'success');
  } catch (e) {
    showToast('Erro ao sincronizar: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

function salvarScriptUrl() {
  const url = document.getElementById('scriptUrlInput').value.trim();
  AppState.scriptUrl = url;
  localStorage.setItem('dond_script_url', url);
  showToast('URL do Apps Script salva com sucesso!', 'success');
  if (url) {
    carregarDadosDoServidor(true);
  }
}

async function carregarDadosDoServidor(notificar = false) {
  if (!AppState.scriptUrl) return;
  
  const refreshIcon = document.getElementById('refreshIcon');
  if (refreshIcon) refreshIcon.classList.add('fa-spin');

  try {
    const res = await fetch(`${AppState.scriptUrl}?action=getAll`);
    const data = await res.json();

    if (data.success) {
      if (data.produtos && data.produtos.length) {
        AppState.produtos = data.produtos.map(p => formatarNomeProduto(p));
      }
      if (data.plataformas && data.plataformas.length) {
        AppState.plataformas = data.plataformas;
      }
      if (data.pedidos && Array.isArray(data.pedidos)) {
        AppState.pedidos = data.pedidos.map(p => ({
          ...p,
          produto: formatarNomeProduto(p.produto)
        }));
      }

      saveLocalConfigs();
      localStorage.setItem('dond_pedidos', JSON.stringify(AppState.pedidos));
      renderDropdowns();
      renderConfigLists();
      renderPedidosTable();
      if (notificar) {
        showToast('Sincronizado com o Google Sheets!', 'info');
      }
    }
  } catch (e) {
    console.warn('Erro ao sincronizar dados com o Google Sheets:', e);
  } finally {
    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
  }
}

// TEMAS / CORES
function initTheme() {
  const savedTheme = localStorage.getItem('dond_theme') || 'cyan';
  setAppTheme(savedTheme, null, false);
  if (document.getElementById('scriptUrlInput')) {
    document.getElementById('scriptUrlInput').value = AppState.scriptUrl;
  }
}

function setAppTheme(themeName, colorHex, notify = true) {
  document.body.className = '';
  if (themeName !== 'cyan') {
    document.body.classList.add(`theme-${themeName}`);
  }
  AppState.theme = themeName;
  localStorage.setItem('dond_theme', themeName);

  document.querySelectorAll('.theme-chip').forEach(chip => {
    chip.classList.toggle('active', chip.classList.contains(themeName));
  });

  if (notify) showToast(`Tema alterado com sucesso!`, 'success');
}

// LOCALSTORAGE
function initLocalStorageData() {
  const localProd = localStorage.getItem('dond_produtos');
  const localPlat = localStorage.getItem('dond_plataformas');
  const localPed = localStorage.getItem('dond_pedidos');

  if (localProd) AppState.produtos = JSON.parse(localProd);
  if (localPlat) AppState.plataformas = JSON.parse(localPlat);
  if (localPed) {
    AppState.pedidos = JSON.parse(localPed);
  } else {
    // Dados de exemplo inicial como na imagem do usuário
    AppState.pedidos = [
      {
        id: '1',
        data: '07/10 14:30',
        plataforma: 'Shopee',
        produto: 'JBC FG 4 RISK',
        pedido: '1911818181',
        disputa: 'SIM',
        pastaDrive: '#',
        etiqueta: '',
        caixa: '',
        video: '',
        avarias: []
      }
    ];
  }
}

function saveLocalConfigs() {
  localStorage.setItem('dond_produtos', JSON.stringify(AppState.produtos));
  localStorage.setItem('dond_plataformas', JSON.stringify(AppState.plataformas));
}

// =========================================================================================
// UTILITÁRIOS: COMPRESSÃO DE IMAGENS E BASE64
// =========================================================================================
function compressImage(file, maxWidth = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
  });
}

// LOADING & TOAST
function showLoading(title = 'Carregando...', sub = 'Por favor aguarde', percent = 0, stepText = '') {
  document.getElementById('loadingTitle').textContent = title;
  document.getElementById('loadingSubtitle').textContent = sub;
  updateLoadingProgress(percent, stepText || `${percent}%`);
  document.getElementById('loadingOverlay').style.display = 'flex';
}

function updateLoadingProgress(percent, stepText) {
  const p = Math.min(100, Math.max(0, Math.round(percent)));
  const bar = document.getElementById('loadingProgressBar');
  const percentEl = document.getElementById('loadingProgressPercent');
  const stepEl = document.getElementById('loadingProgressStep');

  if (bar) bar.style.width = `${p}%`;
  if (percentEl) percentEl.textContent = `${p}%`;
  if (stepEl && stepText) stepEl.textContent = stepText;
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
