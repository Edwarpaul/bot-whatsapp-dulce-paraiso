// ============================================================
// APPS SCRIPT - Bot WhatsApp Dulce Paraiso
// Pega este codigo en Apps Script de la hoja "Bot WhatsApp"
// Luego ejecuta setupHoja() UNA sola vez para crear las pestanas
// Luego despliega como aplicacion web y copia la URL
// ============================================================

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
  return ContentService.createTextResponse(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
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
      var ofertaDate = new Date(ofertaFecha);
      var diffHours = (now - ofertaDate) / (1000 * 60 * 60);
      if (diffHours >= 24) pending.push(rows[i][0]);
    }
  }
  return ContentService.createTextResponse(JSON.stringify(pending)).setMimeType(ContentService.MimeType.JSON);
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
      sheet.getRange(i + 1, 5).setValue(Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'));
      return;
    }
  }
  var lastRow = sheet.getLastRow() + 1;
  sheet.appendRow([phone, data.state || 'nuevo', data.porciones || '', data.diseno || '',
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'), '', '']);
  var color = (lastRow % 2 === 0) ? '#e8f5e9' : '#ffffff';
  sheet.getRange(lastRow, 1, 1, 7).setBackground(color);
}

function markFollowup(ss, phone) {
  var sheet = ss.getSheetByName('Clientes');
  if (!sheet) return;
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === phone) {
      sheet.getRange(i + 1, 7).setValue(Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'));
      return;
    }
  }
}

// Ejecuta esta funcion UNA vez para crear todas las pestanas
function setupHoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Pestana 1: Mensajes Bot ---
  var msgSheet = ss.getSheetByName('Mensajes Bot');
  if (!msgSheet) msgSheet = ss.insertSheet('Mensajes Bot', 0);
  msgSheet.clearContents();
  var mensajes = [
    ['Paso', 'Mensaje (Any puede editar estos textos)'],
    ['bienvenida', 'Hola! Bienvenida a Dulce Paraiso, pasteleria casera con sabor venezolano en Malaga. Estamos encantadas de ayudarte a crear tu tarta especial!'],
    ['porciones', 'Para ayudarte mejor, cuantas personas van a disfrutar la tarta?'],
    ['diseno', 'Perfecto! Tienes algun diseno o modelo en mente? Puedes ver nuestro catalogo en www.dulceparaiso.es para inspirarte. Si no tienes idea no te preocupes, te ayudamos!'],
    ['guiar', 'Te gustaria que te guiemos paso a paso para crear la tarta perfecta para ti? Responde SI o NO.'],
    ['si_guiar', 'Genial! Any te va a atender personalmente ahora para ayudarte a disenar tu tarta ideal. Vas a quedar encantada con el resultado!'],
    ['no_guiar', 'Sin problema! Puedes ver disenos en www.dulceparaiso.es y escribirnos al 681 90 19 14 cuando lo tengas claro. Estamos aqui para lo que necesites!'],
    ['seguimiento', 'Hola! Soy Dulce Paraiso. Como te parecio nuestra propuesta? Te gustaria que hagamos tu tarta especial? Estamos aqui para ayudarte.'],
    ['respuesta_default', 'Gracias por contactar a Dulce Paraiso! Para mas informacion escribenos al 681 90 19 14 o visita www.dulceparaiso.es. Te respondemos enseguida!']
  ];
  msgSheet.getRange(1, 1, mensajes.length, 2).setValues(mensajes);
  msgSheet.getRange(1, 1, 1, 2).setBackground('#7c6ba0').setFontColor('#ffffff').setFontWeight('bold');
  msgSheet.setColumnWidth(1, 140);
  msgSheet.setColumnWidth(2, 620);
  for (var i = 2; i <= mensajes.length; i++) {
    msgSheet.getRange(i, 1, 1, 2).setBackground(i % 2 === 0 ? '#f3f0f9' : '#ffffff');
  }

  // --- Pestana 2: Clientes ---
  var clientesSheet = ss.getSheetByName('Clientes');
  if (!clientesSheet) clientesSheet = ss.insertSheet('Clientes', 1);
  clientesSheet.clearContents();
  var headers = [['Telefono', 'Estado', 'Porciones', 'Diseno solicitado', 'Ultimo contacto', 'Oferta enviada (escribe la fecha)', 'Seguimiento enviado']];
  clientesSheet.getRange(1, 1, 1, 7).setValues(headers);
  clientesSheet.getRange(1, 1, 1, 7).setBackground('#1565c0').setFontColor('#ffffff').setFontWeight('bold');
  clientesSheet.setColumnWidth(1, 150);
  clientesSheet.setColumnWidth(2, 120);
  clientesSheet.setColumnWidth(3, 110);
  clientesSheet.setColumnWidth(4, 220);
  clientesSheet.setColumnWidth(5, 170);
  clientesSheet.setColumnWidth(6, 260);
  clientesSheet.setColumnWidth(7, 180);
  clientesSheet.getRange(1, 6).setNote('Any: cuando envies una oferta a un cliente, escribe aqui la fecha (ej: 12/05/2026). El bot enviara un seguimiento automatico al dia siguiente si el cliente no responde.');

  // --- Pestana 3: Respuestas Rapidas ---
  var rrSheet = ss.getSheetByName('Respuestas Rapidas');
  if (!rrSheet) {
    var sheets = ss.getSheets();
    if (sheets.length > 2) {
      rrSheet = sheets[sheets.length - 1];
      rrSheet.setName('Respuestas Rapidas');
    } else {
      rrSheet = ss.insertSheet('Respuestas Rapidas', 2);
    }
  }
  rrSheet.clearContents();
  var respuestas = [
    ['Palabras clave', 'Respuesta'],
    ['precio,presupuesto,cuanto cuesta,cuanto vale,cuanto cobras,coste', 'Los precios varian segun el tamano y diseno. Para un presupuesto escríbenos al 681 90 19 14 o visita www.dulceparaiso.es. Te respondemos en menos de 24h!'],
    ['entrega,envio,domicilio,llevas,reparto', 'Si, hacemos entregas a domicilio en Malaga y alrededores. El coste depende de la distancia. Preguntanos sin compromiso!'],
    ['sabores,chocolate,vainilla,tres leches,red velvet', 'Hacemos todo tipo de tartas: tres leches, chocolate, vainilla, red velvet, drip cake y mucho mas. Tambien sin lactosa. Mira fotos en www.dulceparaiso.es'],
    ['tiempo,plazo,anticipacion,cuando,urgente', 'Necesitamos un minimo de 72 horas. Para bodas o eventos grandes reserva con mas tiempo. Contactanos cuanto antes!'],
    ['cumpleanos,cumple,aniversario,fiesta', 'Los cumpleanos merecen algo especial! Hacemos tartas personalizadas para cada ocasion. Cuentanos cuantas personas sois y la fecha!'],
    ['boda,matrimonio,novios', 'Felicidades! Hacemos tartas nupciales personalizadas con amor venezolano. Contactanos al 681 90 19 14 para planificar el diseno perfecto.'],
    ['pago,pagar,bizum,transferencia,efectivo', 'Aceptamos Bizum, transferencia bancaria y efectivo. Para mas info escribenos al 681 90 19 14.'],
    ['gracias,muchas gracias,perfecto,genial,chevere', 'Gracias a ti! Estamos aqui para lo que necesites. Esperamos endulzar tu dia especial con nuestras tartas venezolanas!'],
    ['instagram,facebook,redes,foto', 'Nos puedes encontrar en Instagram y Facebook como Dulce Paraiso. Tambien en www.dulceparaiso.es para ver todo el catalogo!']
  ];
  rrSheet.getRange(1, 1, respuestas.length, 2).setValues(respuestas);
  rrSheet.getRange(1, 1, 1, 2).setBackground('#2e7d32').setFontColor('#ffffff').setFontWeight('bold');
  rrSheet.setColumnWidth(1, 320);
  rrSheet.setColumnWidth(2, 520);
  for (var j = 2; j <= respuestas.length; j++) {
    rrSheet.getRange(j, 1, 1, 2).setBackground(j % 2 === 0 ? '#e8f5e9' : '#ffffff');
  }

  SpreadsheetApp.flush();
  Logger.log('Hoja configurada correctamente con 3 pestanas');
}
