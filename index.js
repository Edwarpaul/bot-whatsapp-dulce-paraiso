const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const http = require('http');
const https = require('https');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';
const PORT = process.env.PORT || 3000;

const STATES = {
  NEW: 'nuevo',
  OCASION: 'ocasion',
  PORCIONES: 'porciones',
  DISENO: 'diseno',
  LACTOSA: 'lactosa',
  GUIAR: 'guiar',
  HANDOFF: 'handoff',
  DONE: 'terminado'
};

const conversations = new Map();
const botReplying = new Set();
const processedMessages = new Set();
let currentQR = null;
let isConnected = false;

const MSG = {
  bienvenida: 'Hola! Bienvenida a Dulce Paraiso, pasteleria artesanal hecha con amor y recetas caseras en Malaga. Estamos encantadas de ayudarte a crear tu tarta especial!',
  ocasion: 'Que ocasion vamos a celebrar? Por ejemplo: cumpleanos, boda, bautizo, comunion, aniversario...',
  porciones: 'Para cuantas personas necesitas la tarta?',
  diseno: 'Tienes algun diseno o modelo en mente? Si tienes una foto de referencia puedes enviarmela ahora mismo! Si no tienes idea, no te preocupes, te ayudamos a elegir.',
  lactosa: 'La tarta necesita ser sin lactosa o tienes alguna alergia o intolerancia alimentaria que debamos tener en cuenta?',
  guiar: 'Perfecto! Con toda esta informacion, te gustaria que te guiemos para crear la tarta perfecta para ti? Responde SI o NO.',
  si_guiar: 'Genial! Any te va a atender personalmente ahora para disenar tu tarta ideal. En breve te escribe!',
  no_guiar: 'Sin problema! Puedes ver disenos en www.dulceparaiso.es. Si tienes preguntas o cambias de idea aqui estamos!',
  seguimiento: 'Hola! Te escribimos desde Dulce Paraiso. Pudiste ver la propuesta que te enviamos para tu tarta? Nos encantaria hacerla realidad para ti. Cualquier duda aqui estamos!',
  respuesta_default: 'Estamos aqui para ayudarte! Cuentanos que necesitas o visita www.dulceparaiso.es para ver nuestro catalogo de tartas.'
};

const QUICK = [
  { keywords: 'precio,presupuesto,cuanto cuesta,cuanto vale,cuanto cobras,coste', response: 'Los precios varian segun el tamano y diseno. Cuentanos cuantas personas sois y la ocasion para darte un presupuesto personalizado!' },
  { keywords: 'entrega,envio,domicilio,llevas,reparto,traes', response: 'Si, hacemos entregas a domicilio en Malaga y alrededores. El coste depende de la distancia. Preguntanos sin compromiso!' },
  { keywords: 'sabores,chocolate,vainilla,tres leches,red velvet,opciones,tipos,catalogo', response: 'Hacemos todo tipo de tartas: tres leches, chocolate, vainilla, red velvet, drip cake, naked cake y mucho mas. Tambien sin lactosa. Mira fotos en www.dulceparaiso.es' },
  { keywords: 'tiempo,plazo,anticipacion,cuanto tiempo,urgente,rapido', response: 'Necesitamos un minimo de 72 horas. Para bodas o eventos grandes reserva con mas tiempo. Contactanos cuanto antes!' },
  { keywords: 'cumpleanos,cumple,aniversario,fiesta,anos', response: 'Los cumpleanos merecen algo especial! Hacemos tartas personalizadas para cada ocasion. Cuentanos cuantas personas sois y la fecha!' },
  { keywords: 'boda,matrimonio,novios,nupcial,casamiento', response: 'Felicidades! Hacemos tartas nupciales totalmente personalizadas. Cuentanos tu vision y lo hacemos realidad!' },
  { keywords: 'pago,pagar,bizum,transferencia,efectivo,tarjeta', response: 'Aceptamos Bizum, transferencia bancaria y efectivo.' },
  { keywords: 'sin gluten,celiaca,celiaco,gluten', response: 'Por ahora no hacemos tartas sin gluten, pero si sin lactosa. Para cualquier alergia especifica cuentanoslo y buscamos una solucion!' },
  { keywords: 'sin lactosa,lactosa,intolerancia', response: 'Si, hacemos tartas sin lactosa sin problema. Solo indicanoslo al hacer el pedido!' },
  { keywords: 'diseno,personalizada,foto,imagen,nombre,dedicatoria,referencia', response: 'Si, hacemos tartas totalmente personalizadas. Puedes enviarnos una foto de referencia y lo adaptamos a tu gusto!' },
  { keywords: 'ninos,infantil,bebe,baby shower,pequeno', response: 'Hacemos tartas infantiles super originales y personalizadas. Cuentanos la edad y el tema favorito del pequeno!' },
  { keywords: 'bautizo,comunion,primera comunion', response: 'Hacemos tartas preciosas para bautizos y comuniones. Cuentanos cuantos invitados y el estilo que buscas!' },
  { keywords: 'donde,ubicacion,direccion,malaga', response: 'Estamos en Malaga y hacemos entregas en toda la provincia. Todo se elabora en casa con ingredientes frescos!' },
  { keywords: 'instagram,facebook,redes,foto,ver tartas', response: 'Puedes ver nuestras tartas en Instagram y en www.dulceparaiso.es. Hay muchos disenos y seguro encuentras inspiracion!' },
  { keywords: 'gracias,muchas gracias,perfecto,genial,chevere,vale,ok', response: 'Gracias a ti! Estamos aqui para lo que necesites. Esperamos endulzar tu dia especial!' }
];

function httpsPost(url, payload) {
  try {
    const urlObj = new URL(url);
    const body = JSON.stringify(payload);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, (res) => { res.resume(); });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch(e) {}
}

function httpsGet(url) {
  return new Promise((resolve) => {
    const fetch = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { fetch(res.headers.location); return; }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }).on('error', () => resolve(''));
    };
    fetch(url);
  });
}

function saveClient(phone, state, data) {
  if (!APPS_SCRIPT_URL) return;
  httpsPost(APPS_SCRIPT_URL, { action: 'update_client', phone, state, porciones: data.porciones || '', diseno: data.diseno || '' });
}

function markFollowupSent(phone) {
  if (!APPS_SCRIPT_URL) return;
  httpsPost(APPS_SCRIPT_URL, { action: 'mark_followup', phone });
}

async function loadStates() {
  if (!APPS_SCRIPT_URL) return;
  try {
    const data = await httpsGet(APPS_SCRIPT_URL + '?action=get_states');
    const states = JSON.parse(data);
    let restored = 0;
    for (const [phone, state] of Object.entries(states)) {
      if (!conversations.has(phone)) {
        conversations.set(phone, { state, data: {} });
        restored++;
      }
    }
    console.log('Estados restaurados: ' + restored + ' conversaciones cargadas desde Sheets');
  } catch(e) {
    console.log('Error cargando estados:', e.message);
  }
}

async function checkFollowUps() {
  if (!APPS_SCRIPT_URL || !isConnected) return;
  try {
    const data = await httpsGet(APPS_SCRIPT_URL + '?action=followups');
    const phones = JSON.parse(data);
    for (const phone of phones) {
      const waId = phone.replace(/\D/g, '') + '@c.us';
      await client.sendMessage(waId, MSG.seguimiento);
      markFollowupSent(phone);
      console.log('Seguimiento enviado a ' + phone);
    }
  } catch(e) {
    console.log('Error seguimientos:', e.message);
  }
}

function findQuickResponse(text) {
  const lower = text.toLowerCase();
  for (const row of QUICK) {
    const keywords = row.keywords.split(',');
    for (const kw of keywords) {
      if (kw.trim() && lower.includes(kw.trim())) return row.response;
    }
  }
  return null;
}

// Servidor QR
http.createServer(async (req, res) => {
  if (isConnected) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2 style="font-family:sans-serif;text-align:center;padding:40px;color:#7c6ba0">Bot Dulce Paraiso conectado y funcionando!</h2>');
    return;
  }
  if (!currentQR) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2 style="font-family:sans-serif;text-align:center;padding:40px">Generando QR...</h2><script>setTimeout(()=>location.reload(),5000)</script>');
    return;
  }
  try {
    const img = await QRCode.toDataURL(currentQR);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body style="text-align:center;font-family:sans-serif;padding:40px;background:#f9f9f9"><h2 style="color:#7c6ba0">Escanea con WhatsApp de Dulce Paraiso</h2><img src="${img}" style="width:280px;height:280px;border:4px solid #7c6ba0;border-radius:12px"/><p style="color:#888">Se renueva cada 20s</p><script>setTimeout(()=>location.reload(),20000)</script></body></html>`);
  } catch(e) { res.writeHead(500); res.end('Error'); }
}).listen(PORT, () => console.log('Servidor QR en puerto ' + PORT));

const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: { type: 'none' },
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--disable-extensions', '--disable-default-apps', '--memory-pressure-off', '--max_old_space_size=512']
  }
});

client.on('qr', (qr) => { currentQR = qr; });
client.on('ready', () => {
  isConnected = true;
  currentQR = null;
  console.log('Bot conectado y listo!');
  loadStates();
  setInterval(checkFollowUps, 60 * 60 * 1000);
});
client.on('disconnected', (reason) => {
  console.log('Bot desconectado:', reason);
  isConnected = false;
  setTimeout(() => client.initialize(), 5000);
});

client.on('message_create', async (msg) => {
  if (!msg.fromMe) return;
  if (msg.to.includes('g.us')) return;
  if (msg.to === 'status@broadcast') return;
  const phone = msg.to;
  // Ignorar respuestas automaticas del bot
  if (botReplying.has(phone)) return;
  const conv = conversations.get(phone) || { state: STATES.NEW, data: {} };
  if (conv.state !== STATES.HANDOFF) {
    conv.state = STATES.HANDOFF;
    conversations.set(phone, conv);
    saveClient(phone, conv.state, conv.data);
    console.log('HANDOFF activado para ' + phone + ' (Any escribio)');
  }
});

client.on('message', async (msg) => {
  if (msg.from.includes('g.us')) return;
  if (msg.from === 'status@broadcast') return;
  if (msg.fromMe) return;

  const msgId = msg.id._serialized;
  if (processedMessages.has(msgId)) return;
  processedMessages.add(msgId);
  setTimeout(() => processedMessages.delete(msgId), 60000);

  const phone = msg.from;
  const text = (msg.body || '').trim();
  const isMedia = ['image', 'video', 'document', 'sticker'].includes(msg.type);
  const conv = conversations.get(phone) || { state: STATES.NEW, data: {} };

  // Si Any esta atendiendo, el bot no responde bajo ninguna circunstancia
  if (conv.state === STATES.HANDOFF) return;

  let reply = null;

  switch (conv.state) {
    case STATES.NEW:
      reply = MSG.bienvenida + '\n\n' + MSG.ocasion;
      conv.state = STATES.OCASION;
      break;

    case STATES.OCASION:
      conv.data.ocasion = text;
      reply = MSG.porciones;
      conv.state = STATES.PORCIONES;
      break;

    case STATES.PORCIONES:
      conv.data.porciones = text;
      reply = MSG.diseno;
      conv.state = STATES.DISENO;
      break;

    case STATES.DISENO:
      if (isMedia) {
        conv.data.diseno = '[foto de referencia enviada]';
        reply = 'Gracias por la foto! La tendremos en cuenta. ' + MSG.lactosa;
      } else {
        conv.data.diseno = text;
        reply = MSG.lactosa;
      }
      conv.state = STATES.LACTOSA;
      break;

    case STATES.LACTOSA:
      conv.data.lactosa = text;
      reply = MSG.guiar;
      conv.state = STATES.GUIAR;
      break;

    case STATES.GUIAR: {
      const lower = text.toLowerCase();
      const yes = lower.includes('si') || lower.includes('sí') || lower.includes('claro') || lower.includes('quiero') || lower.includes('dale') || lower.includes('yes') || lower.includes('bueno');
      if (yes) {
        reply = MSG.si_guiar;
        conv.state = STATES.HANDOFF;
      } else {
        reply = MSG.no_guiar;
        conv.state = STATES.HANDOFF;
      }
      break;
    }

    default:
      reply = findQuickResponse(text) || MSG.respuesta_default;
      break;
  }

  conversations.set(phone, conv);
  saveClient(phone, conv.state, conv.data);

  if (reply) {
    botReplying.add(phone);
    setTimeout(() => botReplying.delete(phone), 5000);
    try {
      await client.sendMessage(phone, reply);
    } catch(e) {
      console.log('Error al responder:', e.message);
    }
  }
});

client.initialize();
