// =========================================================================================
// DOND - BACKEND GOOGLE APPS SCRIPT (Google Drive + Google Sheets)
// =========================================================================================
// Este script recebe os registros, fotos e vídeos do app Dond, cria pastas no Google Drive
// e armazena os dados em abas do Google Sheets.
// =========================================================================================

const FOLDER_NAME = "DOND_DISPUTAS_MIDIAS"; // Nome da pasta principal criada no seu Google Drive

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

    // 1. Salvar Novo Registro com Fotos e Vídeo
    if (action === 'saveRegistro') {
      const result = handleSaveRegistro(sheet, data);
      return jsonResponse(result);
    }

    // 2. Salvar Produtos (Configurações)
    if (action === 'saveProdutos') {
      setListToColumn(sheet, 'Config_Produtos', data.produtos || []);
      return jsonResponse({ success: true, message: "Produtos salvos com sucesso!" });
    }

    // 3. Salvar Plataformas (Configurações)
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
// FUNÇÃO DE REGISTRO E UPLOAD PARA O DRIVE
// -------------------------------------------------------------
function handleSaveRegistro(ss, data) {
  const pedidosSheet = ss.getSheetByName('Pedidos');
  const mainFolder = getOrCreateMainFolder();

  const timestamp = new Date();
  const dateStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  const folderName = `${Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm")}_${data.plataforma || 'SemPlat'}_${data.pedido || 'SemPed'}`;
  
  // Cria subpasta para este pedido no Drive
  const pedidoFolder = mainFolder.createFolder(folderName);
  pedidoFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const mediaUrls = {
    etiqueta: '',
    caixa: '',
    video: '',
    avarias: []
  };

  // Salvar Foto da Etiqueta
  if (data.etiqueta && data.etiqueta.base64) {
    const file = saveBase64File(pedidoFolder, '01_Etiqueta', data.etiqueta.base64, data.etiqueta.mimeType || 'image/jpeg');
    mediaUrls.etiqueta = file.getUrl();
  }

  // Salvar Foto da Caixa
  if (data.caixa && data.caixa.base64) {
    const file = saveBase64File(pedidoFolder, '02_Caixa', data.caixa.base64, data.caixa.mimeType || 'image/jpeg');
    mediaUrls.caixa = file.getUrl();
  }

  // Salvar Vídeo
  if (data.video && data.video.base64) {
    const file = saveBase64File(pedidoFolder, '03_Video_Abertura', data.video.base64, data.video.mimeType || 'video/mp4');
    mediaUrls.video = file.getUrl();
  }

  // Salvar Fotos Extras (Avarias - até 10)
  if (data.avarias && Array.isArray(data.avarias)) {
    data.avarias.forEach((avaria, index) => {
      if (avaria && avaria.base64) {
        const file = saveBase64File(pedidoFolder, `04_Avaria_${index + 1}`, avaria.base64, avaria.mimeType || 'image/jpeg');
        mediaUrls.avarias.push(file.getUrl());
      }
    });
  }

  const folderUrl = pedidoFolder.getUrl();
  const avariasJson = JSON.stringify(mediaUrls.avarias);

  // Adiciona linha na planilha Pedidos
  // Colunas: [ID, Data, Plataforma, Produto, Pedido, Disputa, Pasta Drive, Etiqueta, Caixa, Vídeo, Avarias (JSON)]
  const newRow = [
    Utilities.getUuid(),
    dateStr,
    data.plataforma || '',
    data.produto || '',
    data.pedido || '',
    data.disputa ? 'SIM' : 'NÃO',
    folderUrl,
    mediaUrls.etiqueta,
    mediaUrls.caixa,
    mediaUrls.video,
    avariasJson
  ];

  pedidosSheet.appendRow(newRow);

  return {
    success: true,
    message: "Registro e mídias salvos com sucesso!",
    folderUrl: folderUrl,
    dateStr: dateStr
  };
}

// -------------------------------------------------------------
// UTILITÁRIOS
// -------------------------------------------------------------
function saveBase64File(folder, fileName, base64Data, mimeType) {
  // Remove prefixo data:...;base64, se houver
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const decoded = Utilities.base64Decode(cleanBase64);
  const ext = getExtensionFromMime(mimeType);
  const blob = Utilities.newBlob(decoded, mimeType, `${fileName}.${ext}`);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function getExtensionFromMime(mime) {
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
  // Aba Pedidos
  let pedidosSheet = ss.getSheetByName('Pedidos');
  if (!pedidosSheet) {
    pedidosSheet = ss.insertSheet('Pedidos');
    pedidosSheet.appendRow([
      'ID', 'Data', 'Plataforma', 'Produto', 'Pedido', 'Disputa', 
      'Pasta Drive', 'Foto Etiqueta', 'Foto Caixa', 'Vídeo', 'Fotos Avarias'
    ]);
    pedidosSheet.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#00bcd4").setFontColor("#ffffff");
    pedidosSheet.setFrozenRows(1);
  }

  // Aba Config_Produtos
  let prodSheet = ss.getSheetByName('Config_Produtos');
  if (!prodSheet) {
    prodSheet = ss.insertSheet('Config_Produtos');
    prodSheet.appendRow(['Produtos Cadastrados']);
    prodSheet.getRange(1, 1).setFontWeight("bold").setBackground("#00bcd4").setFontColor("#ffffff");
    prodSheet.appendRow(['JBC FG 4 RISK']);
    prodSheet.appendRow(['PRODUTO TESTE 01']);
  }

  // Aba Config_Plataformas
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
  // Limpa registros anteriores a partir da linha 2
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 1).clearContent();
  }
  if (list && list.length > 0) {
    const rows = list.map(item => [item]);
    sheet.getRange(2, 1, rows.length, 1).setValues(rows);
  }
}

function getPedidosData(ss) {
  const sheet = ss.getSheetByName('Pedidos');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  // Ordena do mais recente ao mais antigo (ordem invertida das linhas)
  const pedidos = [];
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    let avariasList = [];
    try {
      if (row[10]) {
        avariasList = JSON.parse(row[10]);
      }
    } catch (e) {
      avariasList = [];
    }

    pedidos.push({
      id: row[0],
      data: row[1],
      plataforma: row[2],
      produto: row[3],
      pedido: row[4],
      disputa: row[5],
      pastaDrive: row[6],
      etiqueta: row[7],
      caixa: row[8],
      video: row[9],
      avarias: avariasList
    });
  }
  return pedidos;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
