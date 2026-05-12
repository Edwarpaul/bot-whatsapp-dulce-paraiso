const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const http = require('http');
const https = require('https');

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';
const PORT = process.env.PORT || 3000;

const STATES = {
  NEW: 'nuevo',
  PORCIONES: 'porciones',
  DISENO: 'diseno',
  GUIAR: 'guiar',
  HANDOFF: 'handoff',
  DONE: 'terminado'
};

const conversations = new Map();
let currentQR = null;
let isConnected = false;

let botMessages = {
  bienvenida: 'Hola! Bienvenida a Dulce Paraiso, pasteleria casera con sabor venezolano en Malaga. Estamos encantadas de ayudarte!',
  porciones: 'Para ayudarte mejor, cuantas personas van a disfrutar la tarta?',
  diseno: 'Perfecto! Tienes algun diseno o modelo en mente? Puedes ver nuestro catalogo en www.dulceparaiso.es. Si no tienes idea no te preocupes!',
  guiar: 'Te gustaria que te guiemos paso a paso para crear la tarta perfecta para ti? Responde SI o NO.',
  si_guiar: 'Genial! Any te va a atender personalmente ahora para ayudarte a disenar tu tarta ideal.',
  no_guiar: 'Sin problema! Visita www.dulceparaiso.es o escribenos al 681 90 19 14 cuando lo tengas claro.',
  seguimiento: 'Hola! Soy Dulce Paraiso. Como te parecio nuestra propuesta? Te gustaria que hagamos tu tarta especial?',
  respuesta_default: 'Gracias por contactar a Dulce Paraiso! Escribenos al 681 90 19 14 o visita www.dulceparaiso.es.'
};
let quickResponses = [];

function httpsGet(url) {
  return new Promise((resolve) => {
    const fetch = (targetUrl) => {
      https.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          fetch(res.headers.location);
          return;
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }).on('error', () => resolve(''));
    };
    fetch(url);
  });
}

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

async function loadConfig() {
  if (!APPS_SCRIPT_URL) return;
  try {
    const data = await httpsGet(APPS_SCRIPT_URL + '?action=config');
    const config = JSON.parse(data);
    if (config.messages) botMessages = { ...botMessages, ...config.messages };
    if (config.quickResponses) quickResponses = config.quickResponses;
    console.log('Config cargada: ' + quickResponses.length + ' respuestas rapidas');
  } catch(e) {
    console.log('Error cargando config:', e.message);
  }
}

function saveClient(phone, state, data) {
  if (!APPS_SCRIPT_URL) return;
  httpsPost(APPS_SCRIPT_URL, { action: 'update_client', phone, state, porciones: data.porciones || '', diseno: data.diseno || '' });
}

function markFollowupSent(phone) {
  if (!APPS_SCRIPT_URL) return;
  httpsPost(APPS_SCRIPT_URL, { action: 'mark_followup', phone });
}

async function checkFollowUps() {
  if (!APPS_SCRIPT_URL || !isConnected) return;
  try {
    const data = await httpsGet(APPS_SCRIPT_URL + '?action=followups');
    const phones = JSON.parse(data);
    for (const phone of phones) {
      const waId = phone.replace(/\D/g, '') + '@c.us';
      await client.sendMessage(waId, botMessages.seguimiento);
      markFollowupSent(phone);
      console.log('Seguimiento enviado a ' + phone);
    }
  } catch(e) {
    console.log('Error en seguimientos:', e.message);
  }
}

function findQuickResponse(text) {
  const lower = text.toLowerCase();
  for (const row of quickResponses) {
    const keywords = row.keywords.toLowerCase().split(',');
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
    res.end(`<html><body style="text-align:center;font-family:sans-serif;padding:40px;background:#f9f9f9"><h2 style="color:#7c6ba0">Escanea con WhatsApp de Dulce Paraiso</h2><img src="${img}" style="width:280px;height:280px;border:4px solid #7c6ba0;border-radius:12px"/><p style="color:#888">Se renueva automaticamente cada 20s</p><script>setTimeout(()=>location.reload(),20000)</script></body></html>`);
  } catch(e) { res.writeHead(500); res.end('Error'); }
}).listen(PORT, () => console.log('Servidor QR en puerto ' + PORT));

// Cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }
});

client.on('qr', (qr) => {
  currentQR = qr;
  console.log('QR generado - abre la URL del servicio');
});

client.on('ready', async () => {
  isConnected = true;
  currentQR = null;
  console.log('Bot conectado y listo!');
  await loadConfig();
  setInterval(checkFollowUps, 60 * 60 * 1000);
});

client.on('message', async (msg) => {
  if (msg.from.includes('g.us')) return;
  if (msg.fromMe) return;

  const phone = msg.from;
  const text = msg.body || '';
  const conv = conversations.get(phone) || { state: STATES.NEW, data: {} };

  let reply = null;

  switch (conv.state) {
    case STATES.NEW:
      reply = botMessages.bienvenida + '\n\n' + botMessages.porciones;
      conv.state = STATES.PORCIONES;
      break;

    case STATES.PORCIONES:
      conv.data.porciones = text;
      reply = botMessages.diseno;
      conv.state = STATES.DISENO;
      break;

    case STATES.DISENO:
      conv.data.diseno = text;
      reply = botMessages.guiar;
      conv.state = STATES.GUIAR;
      break;

    case STATES.GUIAR: {
      const lower = text.toLowerCase();
      const yes = lower.includes('si') || lower.includes('sí') || lower.includes('claro') || lower.includes('quiero') || lower.includes('dale') || lower.includes('yes');
      if (yes) {
        reply = botMessages.si_guiar;
        conv.state = STATES.HANDOFF;
      } else {
        reply = botMessages.no_guiar;
        conv.state = STATES.DONE;
      }
      break;
    }

    case STATES.HANDOFF:
      return; // Any esta atendiendo, bot no responde

    default: {
      reply = findQuickResponse(text) || botMessages.respuesta_default;
      break;
    }
  }

  conversations.set(phone, conv);
  saveClient(phone, conv.state, conv.data);

  if (reply) {
    await msg.reply(reply);
  }
});

client.initialize();
