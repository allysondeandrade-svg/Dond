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
  produtos: ['JBC FG 4 RISK', 'PRODUTO TESTE 01'],
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
    carregarDadosDoServidor();
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

function triggerCapture(step) {
  AppState.currentCaptureStep = step;

  if (step === 'video') {
    document.getElementById('cameraVideoInput').click();
  } else {
    document.getElementById('cameraPhotoInput').click();
  }
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
    showToast('Caixa capturada! Agora gravação de Vídeo.', 'info');
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
// FORMULÁRIO E SUBMISSÃO DE REGISTRO
// =========================================================================================
function setDisputa(valor) {
  AppState.disputa = valor;
  document.getElementById('btnDisputaSim').classList.toggle('active', valor === true);
  document.getElementById('btnDisputaNao').classList.toggle('active', valor === false);
}

async function finalizarRegistro() {
  const produto = document.getElementById('selectProduto').value;
  const plataforma = document.getElementById('selectPlataforma').value;
  const pedido = document.getElementById('inputPedido').value.trim();

  if (!produto) {
    showToast('Por favor selecione o Produto obrigatório (*).', 'error');
    document.getElementById('selectProduto').focus();
    return;
  }

  // Prepara payload
  const payload = {
    action: 'saveRegistro',
    plataforma: plataforma,
    produto: produto,
    pedido: pedido,
    disputa: AppState.disputa,
    etiqueta: AppState.mediaData.etiqueta,
    caixa: AppState.mediaData.caixa,
    video: AppState.mediaData.video,
    avarias: AppState.mediaData.avarias
  };

  showLoading('Enviando Registro...', 'Salvando fotos e dados no Google Drive & Sheets...');

  try {
    if (AppState.scriptUrl) {
      // Envio para o Google Apps Script
      const response = await fetch(AppState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Evita preflight CORS no Apps Script
        body: JSON.stringify(payload)
      });
      const res = await response.json();
      
      if (res.success) {
        showToast('Registro enviado com sucesso ao Sheets & Drive!', 'success');
      } else {
        throw new Error(res.error || 'Erro no script');
      }
    } else {
      // Modo Local / Demonstração
      await new Promise(r => setTimeout(r, 1200));
      showToast('Registro salvo localmente (Adicione a URL do Apps Script nas Configurações)!', 'info');
    }

    // Salva cópia local para exibição imediata na aba Pedidos
    const dataAtual = new Date();
    const dataFormatada = `${String(dataAtual.getDate()).padStart(2, '0')}/${String(dataAtual.getMonth()+1).padStart(2, '0')} ${String(dataAtual.getHours()).padStart(2, '0')}:${String(dataAtual.getMinutes()).padStart(2, '0')}`;
    
    const novoItem = {
      id: 'local_' + Date.now(),
      data: dataFormatada,
      plataforma: plataforma || 'Shopee',
      produto: produto,
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

    // Resetar Formulário
    resetRegistroForm();
    
    // Redireciona para aba Pedidos
    switchView('pedidos');

  } catch (err) {
    console.error(err);
    showToast('Falha no envio: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
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
    return `
      <tr>
        <td style="white-space: nowrap; font-weight: 700;">${dataFormatada}</td>
        <td>${item.plataforma || '-'}</td>
        <td style="font-weight: 700;">${item.produto || '-'}</td>
        <td><code>${item.pedido || '-'}</code></td>
        <td>
          <span class="table-badge-disputa ${isSim ? 'sim' : 'nao'}">
            ${isSim ? 'SIM' : 'NÃO'}
          </span>
        </td>
        <td>
          <div class="table-actions">
            <button class="action-icon-btn" onclick="abrirModalMidias(${idx})" title="Visualizar Fotos/Vídeo">
              <i class="fa-regular fa-eye"></i>
            </button>
            <button class="action-icon-btn" onclick="downloadMidias(${idx})" title="Baixar ZIP">
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
// DOWNLOAD AUTOMÁTICO DE ARQUIVO .ZIP COM TODAS AS FOTOS E VÍDEOS
// =========================================================================================
async function downloadMidias(index) {
  currentSelectedPedidoIndex = index;
  await downloadZipDoPedidoAtual();
}

async function downloadZipDoPedidoAtual() {
  if (currentSelectedPedidoIndex === null) return;
  const item = AppState.pedidos[currentSelectedPedidoIndex];
  if (!item) return;

  showLoading('Gerando Arquivo ZIP...', 'Baixando fotos e agrupando no ZIP...');

  try {
    const zip = new JSZip();
    const folderName = `Disputa_${(item.plataforma || 'Plat')}_${(item.pedido || 'Pedido')}`.replace(/[\/\\:*?"<>|]/g, '_');
    const zipFolder = zip.folder(folderName);

    const promises = [];

    // 1. Etiqueta
    if (item.etiqueta) {
      promises.push(
        fetchMediaBlob(item.etiqueta).then(blob => {
          if (blob) zipFolder.file('01_Etiqueta.jpg', blob);
        })
      );
    }

    // 2. Caixa
    if (item.caixa) {
      promises.push(
        fetchMediaBlob(item.caixa).then(blob => {
          if (blob) zipFolder.file('02_Caixa.jpg', blob);
        })
      );
    }

    // 3. Vídeo
    if (item.video) {
      promises.push(
        fetchMediaBlob(item.video).then(blob => {
          if (blob) zipFolder.file('03_Video_Abertura.mp4', blob);
        })
      );
    }

    // 4. Avarias
    if (item.avarias && item.avarias.length > 0) {
      item.avarias.forEach((avariaUrl, i) => {
        promises.push(
          fetchMediaBlob(avariaUrl).then(blob => {
            if (blob) zipFolder.file(`04_Avaria_${i + 1}.jpg`, blob);
          })
        );
      });
    }

    await Promise.all(promises);

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `${folderName}.zip`);

    showToast('Download do ZIP concluído com sucesso!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Erro ao gerar ZIP. Abrindo pasta do Google Drive...', 'error');
    if (item.pastaDrive && item.pastaDrive !== '#') {
      window.open(item.pastaDrive, '_blank');
    }
  } finally {
    hideLoading();
  }
}

async function fetchMediaBlob(url) {
  try {
    if (url.startsWith('data:')) {
      const parts = url.split(',');
      const mime = parts[0].match(/:(.*?);/)[1];
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
    return await response.blob();
  } catch (e) {
    console.warn('Não foi possível obter o blob da mídia:', url, e);
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

  selectProd.innerHTML = '<option value="">Selecione o produto cadastrado...</option>' +
    AppState.produtos.map(p => `<option value="${p}">${p}</option>`).join('');

  selectPlat.innerHTML = '<option value="">Selecione a plataforma...</option>' +
    AppState.plataformas.map(p => `<option value="${p}">${p}</option>`).join('');
}

function renderConfigLists() {
  const listProd = document.getElementById('listaProdutosConfig');
  const listPlat = document.getElementById('listaPlataformasConfig');

  listProd.innerHTML = AppState.produtos.map((p, idx) => `
    <li class="tag-item">
      <span>${p}</span>
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
  const val = input.value.trim();
  if (!val) return;
  AppState.produtos.push(val);
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
  AppState.plataformas.push(val);
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
    const res = await fetch(AppState.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveProdutos', produtos: AppState.produtos })
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
    carregarDadosDoServidor();
  }
}

async function carregarDadosDoServidor() {
  if (!AppState.scriptUrl) return;
  
  const refreshIcon = document.getElementById('refreshIcon');
  if (refreshIcon) refreshIcon.classList.add('fa-spin');

  try {
    const res = await fetch(`${AppState.scriptUrl}?action=getAll`);
    const data = await res.json();

    if (data.success) {
      if (data.produtos && data.produtos.length) AppState.produtos = data.produtos;
      if (data.plataformas && data.plataformas.length) AppState.plataformas = data.plataformas;
      if (data.pedidos && data.pedidos.length) AppState.pedidos = data.pedidos;

      saveLocalConfigs();
      localStorage.setItem('dond_pedidos', JSON.stringify(AppState.pedidos));
      renderDropdowns();
      renderConfigLists();
      renderPedidosTable();
      showToast('Dados sincronizados com o Sheets!', 'info');
    }
  } catch (e) {
    console.warn('Erro ao carregar dados do script:', e);
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
function showLoading(title = 'Carregando...', sub = 'Por favor aguarde') {
  document.getElementById('loadingTitle').textContent = title;
  document.getElementById('loadingSubtitle').textContent = sub;
  document.getElementById('loadingOverlay').style.display = 'flex';
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
