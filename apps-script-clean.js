function doGet(e) {
  var action = e.parameter.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (action === 'config') return getConfig(ss);
  if (action === 'followups') return getFollowups(ss);
  return ContentService.createTextResponse('OK');
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'update_client') updateClient(ss, data);
    if (data.action === 'mark_followup') markFollowup(ss, data.phone);
  } catch(err) {
    Logger.log(err.toString());
  }
  return ContentService.createTextResponse('OK');
}

function getConfig(ss) {
  var result = { messages: {}, quickResponses: [] };
  var msgSheet = ss.getSheetByName('Mensajes Bot');
  if (msgSheet) {
    var rows = msgSheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0]) result.messages[rows[i][0]] = rows[i][1];
    }
  }
  var rrSheet = ss.getSheetByName('Respuestas Rapidas');
  if (rrSheet) {
    var rows2 = rrSheet.getDataRange().getValues();
    for (var j = 1; j < rows2.length; j++) {
      if (rows2[j][0] && rows2[j][1]) {
        result.quickResponses.push({ keywords: rows2[j][0], response: rows2[j][1] });
      }
    }
  }
  return ContentService.createTextResponse(JSON.stringify(result));
}

function getFollowups(ss) {
  var sheet = ss.getSheetByName('Clientes');
  if (!sheet) return ContentService.createTextResponse('[]');
  var rows = sheet.getDataRange().getValues();
  var pending = [];
  var now = new Date();
  for (var i = 1; i < rows.length; i++) {
    var phone = rows[i][0];
    var ofertaFecha = rows[i][5];
    var seguimientoEnviado = rows[i][6];
    if (phone && ofertaFecha && !seguimientoEnviado) {
      var diffHours = (now - new Date(ofertaFecha)) / (1000 * 60 * 60);
      if (diffHours >= 24) pending.push(phone);
    }
  }
  return ContentService.createTextResponse(JSON.stringify(pending));
}

function updateClient(ss, data) {
  var sheet = ss.getSheetByName('Clientes');
  if (!sheet) return;
  var phone = data.phone;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === phone) {
      if (data.state) sheet.getRange(i + 1, 2).setValue(data.state);
      if (data.porciones) sheet.getRange(i + 1, 3).setValue(data.porciones);
      if (data.diseno) sheet.getRange(i + 1, 4).setValue(data.diseno);
      sheet.getRange(i + 1, 5).setValue(new Date());
      return;
    }
  }
  sheet.appendRow([phone, data.state || 'nuevo', data.porciones || '', data.diseno || '', new Date(), '', '']);
}

function markFollowup(ss, phone) {
  var sheet = ss.getSheetByName('Clientes');
  if (!sheet) return;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === phone) {
      sheet.getRange(i + 1, 7).setValue(new Date());
      return;
    }
  }
}
