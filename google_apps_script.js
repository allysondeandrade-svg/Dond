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

    // 1. Salvar Novo Registro na LINHA 2 (Abaixo do cabeçalho)
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
// FUNÇÃO DE REGISTRO NA LINHA 2 (EMPURRANDO DEMAIS PARA BAIXO)
// -------------------------------------------------------------
function handleSaveRegistro(ss, data) {
  const pedidosSheet = ss.getSheetByName('Pedidos');
  if (!pedidosSheet) {
    throw new Error("Aba 'Pedidos' não encontrada na planilha.");
  }

  const timestamp = new Date();
  const dateStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "dd/MM");
  const recordId = data.id || Utilities.getUuid();
  const produtoLimpo = formatarNomeProduto(data.produto || '');

  let folderUrl = '';
  let folderId = '';

  // Tenta criar pasta no Drive para armazenar as mídias com segurança
  let pedidoFolder = null;
  try {
    const mainFolder = getOrCreateMainFolder();
    const folderName = `${Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm")}_${data.plataforma || 'SemPlat'}_${data.pedido || 'SemPed'}`;
    pedidoFolder = mainFolder.createFolder(folderName);
    pedidoFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    folderUrl = pedidoFolder.getUrl();
    folderId = pedidoFolder.getId();
  } catch (errFolder) {
    Logger.log('Aviso ao criar pasta no Drive: ' + errFolder.toString());
  }

  // Salva mídias no Drive de forma rápida e protegida
  if (pedidoFolder) {
    // 1. Etiqueta
    if (data.etiqueta && data.etiqueta.base64) {
      try {
        saveBase64File(pedidoFolder, '01_Etiqueta', data.etiqueta.base64, data.etiqueta.mimeType || 'image/jpeg');
      } catch (e) {
        Logger.log('Erro ao salvar etiqueta: ' + e.toString());
      }
    }

    // 2. Caixa
    if (data.caixa && data.caixa.base64) {
      try {
        saveBase64File(pedidoFolder, '02_Caixa', data.caixa.base64, data.caixa.mimeType || 'image/jpeg');
      } catch (e) {
        Logger.log('Erro ao salvar caixa: ' + e.toString());
      }
    }

    // 3. Vídeo
    if (data.video && data.video.base64) {
      try {
        saveBase64File(pedidoFolder, '03_Video_Abertura', data.video.base64, data.video.mimeType || 'video/mp4');
      } catch (e) {
        Logger.log('Erro ao salvar vídeo: ' + e.toString());
      }
    }

    // 4. Avarias
    if (data.avarias && Array.isArray(data.avarias)) {
      data.avarias.forEach((avaria, index) => {
        if (avaria && avaria.base64) {
          try {
            saveBase64File(pedidoFolder, `04_Avaria_${index + 1}`, avaria.base64, avaria.mimeType || 'image/jpeg');
          } catch (e) {
            Logger.log(`Erro ao salvar avaria ${index + 1}: ` + e.toString());
          }
        }
      });
    }
  }

  // APENAS AS 6 COLUNAS ESSENCIAIS (com produto limpo antes do hífen)
  const newRow = [
    recordId,
    dateStr,
    data.plataforma || '',
    produtoLimpo,
    data.pedido || '',
    data.disputa ? 'SIM' : 'NÃO'
  ];

  // INSERE NA LINHA 2 (Garante gravação imediata na planilha com 6 colunas)
  pedidosSheet.insertRowAfter(1);
  pedidosSheet.getRange(2, 1, 1, 6).setValues([newRow]);
  SpreadsheetApp.flush(); // Força a gravação física imediata dos dados

  return {
    success: true,
    message: "Registro salvo com sucesso na planilha com 6 colunas!",
    id: recordId,
    folderUrl: folderUrl,
    dateStr: dateStr,
    produto: produtoLimpo
  };
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
      'ID', 'Data', 'Plataforma', 'Produto', 'Pedido', 'Disputa'
    ]);
    pedidosSheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#00bcd4").setFontColor("#ffffff");
    pedidosSheet.setFrozenRows(1);
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

function getPedidosData(ss) {
  const sheet = ss.getSheetByName('Pedidos');
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const pedidos = [];

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

    pedidos.push({
      id: String(row[0]),
      data: String(dateFormatted),
      plataforma: row[2] || '',
      produto: formatarNomeProduto(row[3] || ''),
      pedido: row[4] || '',
      disputa: row[5] || 'NÃO'
    });
  }
  return pedidos;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
