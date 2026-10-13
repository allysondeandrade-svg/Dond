// =========================================================================================
// DOND - BACKEND GOOGLE APPS SCRIPT (Google Drive + Google Sheets)
// =========================================================================================

const FOLDER_NAME = "DOND_DISPUTAS_MIDIAS";

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    setupSheetsIfMissing(sheet);

    const action = (e && e.parameter && e.parameter.action) || 'getAll';

    if (action === 'getConfigs') {
      const produtos = getListFromColumn(sheet, 'Config_Produtos', 1);
      const plataformas = getListFromColumn(sheet, 'Config_Plataformas', 1);
      return jsonResponse({ success: true, produtos, plataformas });
    }

    if (action === 'getPedidos') {
      const data = getPedidosData(sheet);
      return jsonResponse({ success: true, pedidos: data });
    }

    if (action === 'downloadZip') {
      const pedidoId = (e && e.parameter && e.parameter.id) || '';
      return handleDownloadZip(sheet, pedidoId);
    }

    if (action === 'recoverMidias') {
      const data = getPedidosData(sheet, true); // Força varredura de pastas no Drive
      return jsonResponse({ success: true, pedidos: data, message: "Varredura do Drive concluída." });
    }

    // Default getAll
    const produtos = getListFromColumn(sheet, 'Config_Produtos', 1);
    const plataformas = getListFromColumn(sheet, 'Config_Plataformas', 1);
    const pedidos = getPedidosData(sheet);

    return jsonResponse({
      success: true,
      produtos,
      plataformas,
      pedidos
    });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet();
    setupSheetsIfMissing(sheet);

    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      return jsonResponse({ success: false, error: "Nenhum dado enviado." });
    }

    const action = data.action || 'saveRegistro';

    // 1. Salvar Novo Registro na LINHA 2 (com ID sequencial "00001", fundo branco e linhas pretas)
    if (action === 'saveRegistro') {
      const result = handleSaveRegistro(sheet, data);
      return jsonResponse(result);
    }

    // 2. Editar Registro Existente (por ID)
    if (action === 'updatePedido') {
      const result = handleUpdatePedido(sheet, data);
      return jsonResponse(result);
    }

    // 3. Excluir Registro (por ID)
    if (action === 'deletePedido') {
      const result = handleDeletePedido(sheet, data.id);
      return jsonResponse(result);
    }

    // 4. Salvar Produtos (Configurações)
    if (action === 'saveProdutos') {
      setListToColumn(sheet, 'Config_Produtos', data.produtos || []);
      return jsonResponse({ success: true, message: "Produtos salvos com sucesso!" });
    }

    // 5. Salvar Plataformas (Configurações)
    if (action === 'savePlataformas') {
      setListToColumn(sheet, 'Config_Plataformas', data.plataformas || []);
      return jsonResponse({ success: true, message: "Plataformas salvas com sucesso!" });
    }

    return jsonResponse({ success: false, error: "Ação não reconhecida: " + action });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// -------------------------------------------------------------
// FUNÇÃO DE REGISTRO NA LINHA 2 (GRAVAÇÃO COMPLETA: PLANILHA + DRIVE)
// -------------------------------------------------------------
function handleSaveRegistro(ss, data) {
  const pedidosSheet = ss.getSheetByName('Pedidos');
  if (!pedidosSheet) {
    throw new Error("Aba 'Pedidos' não encontrada na planilha.");
  }

  const timestamp = new Date();
  const dateStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "dd/MM");
  
  // GERA ID SEQUENCIAL NO FORMATO "00001"
  const recordId = getNextSequentialId(pedidosSheet);
  const produtoLimpo = formatarNomeProduto(data.produto || '');

  let folderUrl = '';
  let folderId = '';
  let pedidoFolder = null;

  // Cria pasta no Drive para armazenar as fotos e vídeos
  try {
    const mainFolder = getOrCreateMainFolder();
    const folderName = `${Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm")}_${data.plataforma || 'SemPlat'}_${data.pedido || recordId || 'SemPed'}`;
    pedidoFolder = mainFolder.createFolder(folderName);
    pedidoFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    folderUrl = pedidoFolder.getUrl();
    folderId = pedidoFolder.getId();
  } catch (errFolder) {
    Logger.log('Aviso ao criar pasta no Drive: ' + errFolder.toString());
  }

  const mediaUrls = {
    etiqueta: '',
    caixa: '',
    video: '',
    avarias: [],
    folderId: folderId
  };

  // Salva mídias no Drive de forma segura e gera links diretos
  if (pedidoFolder) {
    // 1. Etiqueta
    if (data.etiqueta && data.etiqueta.base64) {
      try {
        const file = saveBase64File(pedidoFolder, '01_Etiqueta', data.etiqueta.base64, data.etiqueta.mimeType || 'image/jpeg');
        mediaUrls.etiqueta = file.getUrl();
      } catch (e) {
        Logger.log('Erro ao salvar etiqueta: ' + e.toString());
      }
    }

    // 2. Caixa
    if (data.caixa && data.caixa.base64) {
      try {
        const file = saveBase64File(pedidoFolder, '02_Caixa', data.caixa.base64, data.caixa.mimeType || 'image/jpeg');
        mediaUrls.caixa = file.getUrl();
      } catch (e) {
        Logger.log('Erro ao salvar caixa: ' + e.toString());
      }
    }

    // 3. Vídeo
    if (data.video && data.video.base64) {
      try {
        const file = saveBase64File(pedidoFolder, '03_Video_Abertura', data.video.base64, data.video.mimeType || 'video/mp4');
        mediaUrls.video = file.getUrl();
      } catch (e) {
        Logger.log('Erro ao salvar vídeo: ' + e.toString());
      }
    }

    // 4. Avarias
    if (data.avarias && Array.isArray(data.avarias)) {
      data.avarias.forEach((avaria, index) => {
        if (avaria && avaria.base64) {
          try {
            const file = saveBase64File(pedidoFolder, `04_Avaria_${index + 1}`, avaria.base64, avaria.mimeType || 'image/jpeg');
            mediaUrls.avarias.push(file.getUrl());
          } catch (e) {
            Logger.log(`Erro ao salvar avaria ${index + 1}: ` + e.toString());
          }
        }
      });
    }
  }

  // Grava as 8 colunas: as 6 visíveis + Pasta Drive + JSON de Mídias
  const newRow = [
    recordId,
    dateStr,
    data.plataforma || '',
    produtoLimpo,
    data.pedido || '',
    data.disputa ? 'SIM' : 'NÃO',
    folderUrl || '#',
    JSON.stringify(mediaUrls)
  ];

  // INSERE NA LINHA 2
  pedidosSheet.insertRowAfter(1);
  pedidosSheet.getRange(2, 1).setNumberFormat("@"); // Garante formato de texto para preservar "00001"
  const newRowRange = pedidosSheet.getRange(2, 1, 1, 8);
  newRowRange.setValues([newRow]);

  // APLICA CARACTERÍSTICAS DA LINHA 2 SOLICITADAS:
  // Fundo da célula branca, linhas/texto pretas sem negrito
  newRowRange.setBackground("#ffffff");
  newRowRange.setFontColor("#000000");
  newRowRange.setFontWeight("normal");
  newRowRange.setFontFamily("Arial");
  newRowRange.setHorizontalAlignment("left");
  newRowRange.setVerticalAlignment("middle");

  SpreadsheetApp.flush(); // Força a gravação física imediata

  return {
    success: true,
    message: "Registro e mídias salvos com sucesso!",
    id: recordId,
    folderUrl: folderUrl,
    dateStr: dateStr,
    produto: produtoLimpo,
    mediaUrls: mediaUrls
  };
}

// -------------------------------------------------------------
// GERAÇÃO DE ID SEQUENCIAL NO FORMATO "00001"
// -------------------------------------------------------------
function getNextSequentialId(pedidosSheet) {
  const lastRow = pedidosSheet.getLastRow();
  if (lastRow <= 1) return "00001";

  const ids = pedidosSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let maxNum = 0;
  for (let i = 0; i < ids.length; i++) {
    const val = String(ids[i][0] || '').trim();
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > maxNum && num < 1000000) {
      maxNum = num;
    }
  }

  // Se não encontrou IDs numéricos curtos (ex: linha antiga com reg_...)
  if (maxNum === 0) {
    maxNum = lastRow - 1;
  }

  const nextNum = maxNum + 1;
  return Utilities.formatString("%05d", nextNum);
}

// -------------------------------------------------------------
// FORMATAÇÃO DE TODAS AS LINHAS DE DADOS (LINHA 2 EM DIANTE):
// Fundo da célula branca, linhas pretas sem negrito, ID "00001"
// -------------------------------------------------------------
function formatDataRowsAndFixIds(pedidosSheet) {
  const lastRow = pedidosSheet.getLastRow();
  if (lastRow <= 1) return;

  const numCols = Math.max(8, pedidosSheet.getLastColumn());
  const dataRange = pedidosSheet.getRange(2, 1, lastRow - 1, numCols);

  // Características solicitadas a partir da linha 2:
  dataRange.setBackground("#ffffff"); // Fundo da célula branca
  dataRange.setFontColor("#000000");  // Linhas/texto pretas
  dataRange.setFontWeight("normal");  // Sem negrito
  dataRange.setFontFamily("Arial");
  dataRange.setVerticalAlignment("middle");

  // Garante que a coluna de ID seja formatada como texto
  pedidosSheet.getRange(2, 1, lastRow - 1, 1).setNumberFormat("@");

  // Normaliza IDs antigos (ex: reg_1791906742713) para o formato "00001"
  const idValues = pedidosSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let needsUpdate = false;

  let currentNum = 1;
  // Como os mais novos estão no topo (linha 2), o mais antigo fica na última linha.
  for (let i = idValues.length - 1; i >= 0; i--) {
    const val = String(idValues[i][0] || '').trim();
    if (val.startsWith('reg_') || val.length > 5 || isNaN(parseInt(val, 10))) {
      idValues[i][0] = Utilities.formatString("%05d", currentNum);
      needsUpdate = true;
    } else {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) {
        currentNum = Math.max(currentNum, parsed);
        const formatted = Utilities.formatString("%05d", parsed);
        if (val !== formatted) {
          idValues[i][0] = formatted;
          needsUpdate = true;
        }
      }
    }
    currentNum++;
  }

  if (needsUpdate) {
    pedidosSheet.getRange(2, 1, idValues.length, 1).setValues(idValues);
  }
}

// -------------------------------------------------------------
// DOWNLOAD AUTOMÁTICO DE ZIP GERADO NO SERVIDOR (GOOGLE DRIVE)
// -------------------------------------------------------------
function handleDownloadZip(ss, id) {
  const pedidosSheet = ss.getSheetByName('Pedidos');
  if (!pedidosSheet) return jsonResponse({ success: false, error: "Aba 'Pedidos' não encontrada." });
  const lastRow = pedidosSheet.getLastRow();
  if (lastRow <= 1) return jsonResponse({ success: false, error: "Nenhum pedido cadastrado." });

  const numCols = Math.max(8, pedidosSheet.getLastColumn());
  const rows = pedidosSheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  let folderUrl = '';
  let pedidoNome = "Disputa";

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      pedidoNome = `Disputa_${rows[i][2] || 'Plat'}_${rows[i][4] || rows[i][3] || rows[i][0] || 'Pedido'}`.replace(/[\/\\:*?"<>|]/g, '_');
      folderUrl = rows[i][6] || '';
      break;
    }
  }

  let folder = null;
  if (folderUrl && folderUrl !== '#') {
    const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match) {
      try {
        folder = DriveApp.getFolderById(match[1]);
      } catch (e) {}
    }
  }

  // Fallback: se não achou pela coluna 7, busca por pasta no mainFolder
  if (!folder) {
    const mainFolder = getOrCreateMainFolder();
    const folders = mainFolder.getFolders();
    while (folders.hasNext()) {
      const f = folders.next();
      if (id && f.getName().includes(id)) {
        folder = f;
        break;
      }
    }
  }

  if (!folder) {
    return jsonResponse({ success: false, error: "Pasta de mídias não encontrada no Drive." });
  }

  const files = folder.getFiles();
  const blobs = [];
  while (files.hasNext()) {
    blobs.push(files.next().getBlob());
  }

  if (blobs.length === 0) {
    return jsonResponse({ success: false, error: "Nenhum arquivo encontrado na pasta do pedido." });
  }

  const zipBlob = Utilities.zip(blobs, `${pedidoNome}.zip`);
  return jsonResponse({
    success: true,
    fileName: `${pedidoNome}.zip`,
    base64: Utilities.base64Encode(zipBlob.getBytes())
  });
}

// -------------------------------------------------------------
// ATUALIZAR PEDIDO (EDIÇÃO)
// -------------------------------------------------------------
function handleUpdatePedido(ss, data) {
  const pedidosSheet = ss.getSheetByName('Pedidos');
  const lastRow = pedidosSheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: "Nenhum pedido encontrado." };

  const ids = pedidosSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let targetRow = -1;

  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(data.id)) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow === -1) {
    return { success: false, error: "Pedido não encontrado na planilha." };
  }

  if (data.data) pedidosSheet.getRange(targetRow, 2).setValue(data.data);
  if (data.plataforma !== undefined) pedidosSheet.getRange(targetRow, 3).setValue(data.plataforma);
  if (data.produto !== undefined) pedidosSheet.getRange(targetRow, 4).setValue(formatarNomeProduto(data.produto));
  if (data.pedido !== undefined) pedidosSheet.getRange(targetRow, 5).setValue(data.pedido);
  if (data.disputa !== undefined) pedidosSheet.getRange(targetRow, 6).setValue(data.disputa ? 'SIM' : 'NÃO');

  // Mantém formatação com fundo branco e sem negrito
  const targetRange = pedidosSheet.getRange(targetRow, 1, 1, Math.max(8, pedidosSheet.getLastColumn()));
  targetRange.setBackground("#ffffff");
  targetRange.setFontColor("#000000");
  targetRange.setFontWeight("normal");

  SpreadsheetApp.flush();
  return { success: true, message: "Pedido atualizado com sucesso!" };
}

// -------------------------------------------------------------
// EXCLUIR PEDIDO
// -------------------------------------------------------------
function handleDeletePedido(ss, id) {
  const pedidosSheet = ss.getSheetByName('Pedidos');
  const lastRow = pedidosSheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: "Nenhum pedido encontrado." };

  const ids = pedidosSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let targetRow = -1;

  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      targetRow = i + 2;
      break;
    }
  }

  if (targetRow === -1) {
    return { success: false, error: "Registro não encontrado para exclusão." };
  }

  pedidosSheet.deleteRow(targetRow);
  SpreadsheetApp.flush();
  return { success: true, message: "Pedido excluído com sucesso!" };
}

// Formatar nome do produto para manter apenas o texto antes do hífen
function formatarNomeProduto(str) {
  if (!str || typeof str !== 'string') return '';
  const idx = str.indexOf('-');
  if (idx !== -1) {
    return str.substring(0, idx).trim();
  }
  return str.trim();
}

// -------------------------------------------------------------
// UTILITÁRIOS
// -------------------------------------------------------------
function saveBase64File(folder, fileName, base64Data, mimeType) {
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const decoded = Utilities.base64Decode(cleanBase64);
  const ext = getExtensionFromMime(mimeType);
  const blob = Utilities.newBlob(decoded, mimeType, `${fileName}.${ext}`);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function getExtensionFromMime(mime) {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  return 'jpg';
}

function getOrCreateMainFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

function setupSheetsIfMissing(ss) {
  let pedidosSheet = ss.getSheetByName('Pedidos');
  if (!pedidosSheet) {
    pedidosSheet = ss.insertSheet('Pedidos');
    pedidosSheet.appendRow([
      'ID', 'Data', 'Plataforma', 'Produto', 'Pedido', 'Disputa', 'Pasta Drive', 'Midias JSON'
    ]);
    pedidosSheet.getRange(1, 1, 1, 8)
      .setFontWeight("bold")
      .setBackground("#00bcd4")
      .setFontColor("#ffffff")
      .setHorizontalAlignment("center");
    pedidosSheet.setFrozenRows(1);
  } else {
    // Garante que o cabeçalho possua as colunas 7 e 8
    const lastCol = pedidosSheet.getLastColumn();
    if (lastCol < 7) {
      pedidosSheet.getRange(1, 7).setValue('Pasta Drive');
    }
    if (lastCol < 8) {
      pedidosSheet.getRange(1, 8).setValue('Midias JSON');
    }
    // Cabeçalho sempre ciano, negrito e texto branco
    pedidosSheet.getRange(1, 1, 1, Math.max(8, pedidosSheet.getLastColumn()))
      .setFontWeight("bold")
      .setBackground("#00bcd4")
      .setFontColor("#ffffff");

    // Formata todas as linhas de dados a partir da linha 2
    formatDataRowsAndFixIds(pedidosSheet);
  }

  let prodSheet = ss.getSheetByName('Config_Produtos');
  if (!prodSheet) {
    prodSheet = ss.insertSheet('Config_Produtos');
    prodSheet.appendRow(['Produtos Cadastrados']);
    prodSheet.getRange(1, 1).setFontWeight("bold").setBackground("#00bcd4").setFontColor("#ffffff");
    prodSheet.appendRow(['JBC FG 4 RISK']);
  }

  let platSheet = ss.getSheetByName('Config_Plataformas');
  if (!platSheet) {
    platSheet = ss.insertSheet('Config_Plataformas');
    platSheet.appendRow(['Plataformas Cadastradas']);
    platSheet.getRange(1, 1).setFontWeight("bold").setBackground("#00bcd4").setFontColor("#ffffff");
    platSheet.appendRow(['Shopee']);
    platSheet.appendRow(['Mercado Livre']);
    platSheet.appendRow(['Amazon']);
    platSheet.appendRow(['Shein']);
    platSheet.appendRow(['Magalu']);
    platSheet.appendRow(['TikTok Shop']);
  }
}

function getListFromColumn(ss, sheetName, colIndex) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const values = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  return values.map(r => r[0]).filter(v => v !== '' && v !== null);
}

function setListToColumn(ss, sheetName, list) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow([sheetName]);
  }
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 1).clearContent();
  }
  if (list && list.length > 0) {
    const rows = list.map(item => [item]);
    sheet.getRange(2, 1, rows.length, 1).setValues(rows);
  }
}

function getPedidosData(ss, forceDriveScan) {
  const sheet = ss.getSheetByName('Pedidos');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  // Garante formatação a partir da linha 2 e normalização de IDs
  formatDataRowsAndFixIds(sheet);

  const lastCol = Math.max(8, sheet.getLastColumn());
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const pedidos = [];

  let mainFolder = null;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;

    let dateFormatted = row[1];
    if (dateFormatted instanceof Date) {
      dateFormatted = Utilities.formatDate(dateFormatted, Session.getScriptTimeZone(), "dd/MM");
    } else if (typeof dateFormatted === 'string' && dateFormatted.includes('T')) {
      const d = new Date(dateFormatted);
      if (!isNaN(d.getTime())) {
        dateFormatted = Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM");
      }
    }

    let pastaDrive = row[6] || '';
    let midias = { etiqueta: '', caixa: '', video: '', avarias: [] };

    if (row[7]) {
      try {
        midias = typeof row[7] === 'string' ? JSON.parse(row[7]) : row[7];
      } catch (e) {}
    }

    // AUTO-RECUPERAÇÃO: se não tem pastaDrive (ex: registros feitos antes como hoje)
    if (!pastaDrive || pastaDrive === '#' || pastaDrive === '' || forceDriveScan) {
      try {
        if (!mainFolder) mainFolder = getOrCreateMainFolder();
        const pedStr = String(row[4] || '').trim();
        const folders = mainFolder.getFolders();
        while (folders.hasNext()) {
          const f = folders.next();
          const fName = f.getName();
          let matchFound = false;

          // Se tem número de pedido específico
          if (pedStr && pedStr !== 'SemPed' && fName.includes(pedStr)) {
            matchFound = true;
          } 
          // Se foi criado na mesma data
          else if (fName.includes(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"))) {
            matchFound = true;
          }

          if (matchFound) {
            pastaDrive = f.getUrl();
            const fFiles = f.getFiles();
            midias = { etiqueta: '', caixa: '', video: '', avarias: [] };
            while (fFiles.hasNext()) {
              const file = fFiles.next();
              const name = file.getName().toLowerCase();
              const url = file.getUrl();
              if (name.includes('etiqueta')) midias.etiqueta = url;
              else if (name.includes('caixa')) midias.caixa = url;
              else if (name.includes('video')) midias.video = url;
              else if (name.includes('avaria')) midias.avarias.push(url);
            }
            // Atualiza colunas 7 e 8 na planilha
            sheet.getRange(i + 2, 7).setValue(pastaDrive);
            sheet.getRange(i + 2, 8).setValue(JSON.stringify(midias));
            break;
          }
        }
      } catch (eAuto) {
        Logger.log('Erro na auto-recuperação de mídias: ' + eAuto.toString());
      }
    }

    pedidos.push({
      id: String(row[0]),
      data: String(dateFormatted),
      plataforma: row[2] || '',
      produto: formatarNomeProduto(row[3] || ''),
      pedido: row[4] || '',
      disputa: row[5] || 'NÃO',
      pastaDrive: pastaDrive || '#',
      etiqueta: midias.etiqueta || '',
      caixa: midias.caixa || '',
      video: midias.video || '',
      avarias: midias.avarias || []
    });
  }
  return pedidos;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
