const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const https = require('https');

const SHEET_ID = '1vwFtV9yksLvmdrdaAXA6ZSaVb2pokZO_vrK5olVETE4';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv';
const DEFAULT_RESPONSE = 'Gracias por contactar a Dulce Paraiso! Para mas informacion llama al 681 90 19 14 o visita www.dulceparaiso.es';

let cachedResponses = [];
let lastFetch = 0;

function fetchResponses() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (now - lastFetch < 300000 && cachedResponses.length > 0) {
      return resolve(cachedResponses);
    }
    https.get(SHEET_CSV_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const rows = data.trim().split('\n').slice(1);
          cachedResponses = rows
            .map((row) => {
              const parts = row.split(',');
              const keywords = parts[0] ? parts[0].replace(/"/g, '').trim() : '';
              const response = parts.slice(1).join(',').replace(/^"|"$/g, '').trim();
              return { keywords, response };
            })
            .filter((r) => r.keywords && r.response);
          lastFetch = now;
        } catch (e) {
          console.error('Error leyendo hoja:', e.message);
        }
        resolve(cachedResponses);
      });
    }).on('error', (e) => {
      console.error('Error descargando hoja:', e.message);
      resolve(cachedResponses);
    });
  });
}

function findResponse(text, responses) {
  const lower = text.toLowerCase();
  for (const row of responses) {
    const keywords = row.keywords.toLowerCase().split(',');
    for (const kw of keywords) {
      if (kw.trim() && lower.includes(kw.trim())) {
        return row.response;
      }
    }
  }
  return DEFAULT_RESPONSE;
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  }
});

client.on('qr', (qr) => {
  console.log('\n=== ESCANEA ESTE ENLACE CON TU MOVIL ===');
  console.log('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qr));
  console.log('========================================\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Bot de Dulce Paraiso conectado y listo!');
});

client.on('message', async (msg) => {
  if (msg.from.includes('g.us')) return;
  if (msg.fromMe) return;
  const responses = await fetchResponses();
  const reply = findResponse(msg.body || '', responses);
  await msg.reply(reply);
});

client.initialize();
