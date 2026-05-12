// ============================================================
// APPS SCRIPT - Bot WhatsApp Dulce Paraiso
// Pega este codigo en Apps Script de la hoja "Bot WhatsApp"
// Luego ejecuta setupHoja() UNA sola vez para crear las pestanas
// Luego despliega como aplicacion web y copia la URL
// ============================================================

var CALENDAR_ID = '72352a803f5dc31abdd59e82fac9f35c09b3abfab00987870ea44c476cf2937b@group.calendar.google.com';

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
    Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'), '', '', '', '', '']);
  var color = (lastRow % 2 === 0) ? '#e8f5e9' : '#ffffff';
  sheet.getRange(lastRow, 1, 1, 10).setBackground(color);
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

// Ejecuta esta funcion UNA vez para instalar el trigger cada 5 minutos
function instalarTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var t = 0; t < triggers.length; t++) {
    if (triggers[t].getHandlerFunction() === 'checkVentas') {
      ScriptApp.deleteTrigger(triggers[t]);
    }
    if (triggers[t].getHandlerFunction() === 'onEditCalendar') {
      ScriptApp.deleteTrigger(triggers[t]);
    }
  }
  ScriptApp.newTrigger('checkVentas')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('Trigger instalado: revisara ventas cada 5 minutos');
}

// Revisa cada 5 minutos si hay ventas nuevas para agendar en Calendar
function checkVentas() {
  var ss = SpreadsheetApp.openById(SpreadsheetApp.getActive() ? SpreadsheetApp.getActive().getId() : null);
  if (!ss) {
    var files = DriveApp.getFilesByName('Bot WhatsApp - Dulce Paraiso');
    if (!files.hasNext()) return;
    ss = SpreadsheetApp.open(files.next());
  }
  var sheet = ss.getSheetByName('Clientes');
  if (!sheet) return;

  var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendar) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  for (var i = 2; i <= lastRow; i++) {
    var estadoVenta = sheet.getRange(i, 8).getValue().toString().trim().toLowerCase();
    var fechaEntrega = sheet.getRange(i, 9).getValue();
    var eventoCreado = sheet.getRange(i, 10).getValue();

    if (estadoVenta !== 'vendida') continue;
    if (!fechaEntrega) continue;
    if (eventoCreado) continue;

    var phone = sheet.getRange(i, 1).getValue();
    var porciones = sheet.getRange(i, 3).getValue();
    var diseno = sheet.getRange(i, 4).getValue();

    try {
      var fecha = new Date(fechaEntrega);
      var titulo = 'Entregar tarta - ' + phone;
      if (porciones) titulo += ' - ' + porciones + ' porciones';
      var descripcion = 'Telefono: ' + phone;
      if (porciones) descripcion += '\nPorciones: ' + porciones;
      if (diseno) descripcion += '\nDiseno: ' + diseno;

      calendar.createAllDayEvent(titulo, fecha, { description: descripcion });
      sheet.getRange(i, 10).setValue(Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'));
      Logger.log('Evento creado para ' + phone);
    } catch(err) {
      Logger.log('Error: ' + err.toString());
    }
  }
}

// Ejecuta esta funcion para probar que Calendar funciona correctamente
function testCalendar() {
  var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendar) {
    Logger.log('ERROR: Calendario no encontrado con ID: ' + CALENDAR_ID);
    return;
  }
  var fecha = new Date();
  fecha.setDate(fecha.getDate() + 30);
  calendar.createAllDayEvent('TEST - Entregar tarta prueba', fecha, { description: 'Evento de prueba - puedes borrarlo' });
  Logger.log('EXITO: Evento de prueba creado en calendario Dulce Paraiso');
}

// Funcion legacy - ya no se usa, sustituida por checkVentas
function onEditCalendar(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== 'Clientes') return;

  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row < 2) return;

  // Solo reacciona si se edita columna H (estado venta) o columna I (fecha entrega)
  if (col !== 8 && col !== 9) return;

  var estadoVenta = sheet.getRange(row, 8).getValue().toString().trim().toLowerCase();
  var fechaEntrega = sheet.getRange(row, 9).getValue();
  var eventoCreado = sheet.getRange(row, 10).getValue();

  // Si ya se creo el evento, no crear otro
  if (eventoCreado) return;

  // Solo crear evento si esta "vendida" Y tiene fecha de entrega
  if (estadoVenta !== 'vendida') return;
  if (!fechaEntrega) return;

  var phone = sheet.getRange(row, 1).getValue();
  var porciones = sheet.getRange(row, 3).getValue();
  var diseno = sheet.getRange(row, 4).getValue();

  try {
    var calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!calendar) {
      Logger.log('Calendario no encontrado: ' + CALENDAR_ID);
      return;
    }

    var fecha = new Date(fechaEntrega);
    var titulo = 'Entregar tarta - ' + phone;
    if (porciones) titulo += ' - ' + porciones + ' porciones';
    var descripcion = 'Telefono: ' + phone;
    if (porciones) descripcion += '\nPorciones: ' + porciones;
    if (diseno) descripcion += '\nDiseno: ' + diseno;

    calendar.createAllDayEvent(titulo, fecha, { description: descripcion });

    sheet.getRange(row, 10).setValue(Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm'));
    Logger.log('Evento creado en calendar para ' + phone);
  } catch(err) {
    Logger.log('Error creando evento: ' + err.toString());
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
    ['bienvenida', 'Hola! Bienvenida a Dulce Paraiso, pasteleria artesanal hecha con amor y recetas caseras en Malaga. Estamos encantadas de ayudarte a crear tu tarta especial!'],
    ['ocasion', 'Que ocasion vamos a celebrar? Por ejemplo: cumpleanos, boda, bautizo, comunion, aniversario...'],
    ['porciones', 'Para cuantas personas necesitas la tarta?'],
    ['diseno', 'Tienes algun diseno o modelo en mente? Si tienes una foto de referencia puedes enviarmela ahora mismo! Si no tienes idea, no te preocupes, te ayudamos a elegir.'],
    ['lactosa', 'La tarta necesita ser sin lactosa o tienes alguna alergia o intolerancia alimentaria que debamos tener en cuenta?'],
    ['guiar', 'Perfecto! Con toda esta informacion, te gustaria que te guiemos para crear la tarta perfecta para ti? Responde SI o NO.'],
    ['si_guiar', 'Genial! Any te va a atender personalmente ahora para disenar tu tarta ideal. En breve te escribe!'],
    ['no_guiar', 'Sin problema! Puedes ver disenos en www.dulceparaiso.es. Si tienes preguntas o cambias de idea aqui estamos!'],
    ['seguimiento', 'Hola! Te escribimos desde Dulce Paraiso. Pudiste ver la propuesta que te enviamos para tu tarta? Nos encantaria hacerla realidad para ti. Cualquier duda aqui estamos!'],
    ['respuesta_default', 'Estamos aqui para ayudarte! Cuentanos que necesitas o visita www.dulceparaiso.es para ver nuestro catalogo de tartas.']
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
  var headers = [['Telefono', 'Estado', 'Porciones', 'Diseno solicitado', 'Ultimo contacto', 'Oferta enviada (escribe la fecha)', 'Seguimiento enviado', 'Estado venta', 'Fecha de entrega', 'Evento en Calendar']];
  clientesSheet.getRange(1, 1, 1, 10).setValues(headers);
  clientesSheet.getRange(1, 1, 1, 10).setBackground('#1565c0').setFontColor('#ffffff').setFontWeight('bold');
  clientesSheet.setColumnWidth(1, 150);
  clientesSheet.setColumnWidth(2, 120);
  clientesSheet.setColumnWidth(3, 110);
  clientesSheet.setColumnWidth(4, 220);
  clientesSheet.setColumnWidth(5, 170);
  clientesSheet.setColumnWidth(6, 200);
  clientesSheet.setColumnWidth(7, 180);
  clientesSheet.setColumnWidth(8, 130);
  clientesSheet.setColumnWidth(9, 160);
  clientesSheet.setColumnWidth(10, 170);
  clientesSheet.getRange(1, 6).setNote('Any: cuando envies una oferta, escribe aqui la fecha (ej: 12/05/2026). El bot enviara seguimiento automatico al dia siguiente.');
  clientesSheet.getRange(1, 8).setNote('Any: escribe "Vendida" cuando la clienta confirme el pedido.');
  clientesSheet.getRange(1, 9).setNote('Any: escribe la fecha de entrega (ej: 20/06/2026). Al marcar Vendida + fecha, se crea el evento en Google Calendar automaticamente.');

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
    ['precio,presupuesto,cuanto cuesta,cuanto vale,cuanto cobras,coste', 'Los precios varian segun el tamano y diseno. Cuentanos cuantas personas sois y la ocasion para darte un presupuesto personalizado!'],
    ['entrega,envio,domicilio,llevas,reparto', 'Si, hacemos entregas a domicilio en Malaga y alrededores. El coste depende de la distancia. Preguntanos sin compromiso!'],
    ['sabores,chocolate,vainilla,tres leches,red velvet', 'Hacemos todo tipo de tartas: tres leches, chocolate, vainilla, red velvet, drip cake y mucho mas. Tambien sin lactosa. Mira fotos en www.dulceparaiso.es'],
    ['tiempo,plazo,anticipacion,cuando,urgente', 'Necesitamos un minimo de 72 horas. Para bodas o eventos grandes reserva con mas tiempo. Contactanos cuanto antes!'],
    ['cumpleanos,cumple,aniversario,fiesta', 'Los cumpleanos merecen algo especial! Hacemos tartas personalizadas para cada ocasion. Cuentanos cuantas personas sois y la fecha!'],
    ['boda,matrimonio,novios', 'Felicidades! Hacemos tartas nupciales totalmente personalizadas. Cuentanos tu vision y lo hacemos realidad!'],
    ['pago,pagar,bizum,transferencia,efectivo', 'Aceptamos Bizum, transferencia bancaria y efectivo.'],
    ['gracias,muchas gracias,perfecto,genial,chevere', 'Gracias a ti! Estamos aqui para lo que necesites. Esperamos endulzar tu dia especial!'],
    ['instagram,facebook,redes,foto', 'Puedes ver nuestras tartas en Instagram y en www.dulceparaiso.es. Hay muchos disenos y seguro encuentras inspiracion!']
  ];
  rrSheet.getRange(1, 1, respuestas.length, 2).setValues(respuestas);
  rrSheet.getRange(1, 1, 1, 2).setBackground('#2e7d32').setFontColor('#ffffff').setFontWeight('bold');
  rrSheet.setColumnWidth(1, 320);
  rrSheet.setColumnWidth(2, 520);
  for (var j = 2; j <= respuestas.length; j++) {
    rrSheet.getRange(j, 1, 1, 2).setBackground(j % 2 === 0 ? '#e8f5e9' : '#ffffff');
  }

  SpreadsheetApp.flush();
  Logger.log('Hoja configurada correctamente con 3 pestanas y Calendar integrado');
}
