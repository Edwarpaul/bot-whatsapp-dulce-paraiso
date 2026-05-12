const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const http = require('http');
const https = require('https');

const SHEET_ID = '1vwFtV9yksLvmdrdaAXA6ZSaVb2pokZO_vrK5olVETE4';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv';
const DEFAULT_RESPONSE = 'Gracias por contactar a Dulce Paraiso! Para mas informacion llama al 681 90 19 14 o visita www.dulceparaiso.es';
const PORT = process.env.PORT || 3000;

let currentQR = null;
let isConnected = false;
let cachedResponses = [];
let lastFetch = 0;

// Servidor HTTP que muestra el QR como imagen
http.createServer(async (req, res) => {
  if (isConnected) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Bot conectado y funcionando!</h2>');
    return;
  }
  if (!currentQR) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Generando QR, recarga en 5 segundos...</h2><script>setTimeout(()=>location.reload(),5000)</script>');
    return;
  }
  try {
    const qrImage = await QRCode.toDataURL(currentQR);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="text-align:center;font-family:sans-serif;padding:40px">
        <h2>Escanea con WhatsApp de Dulce Paraiso</h2>
        <img src="${qrImage}" style="width:300px;height:300px"/>
        <p>El QR se renueva automaticamente</p>
        <script>setTimeout(()=>location.reload(),20000)</script>
      </body></html>
    `);
  } catch (e) {
    res.writeHead(500);
    res.end('Error generando QR');
  }
}).listen(PORT, () => {
  console.log('Servidor QR iniciado en puerto ' + PORT);
});

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
  currentQR = qr;
  console.log('Nuevo QR generado - abre la URL del servicio para escanearlo');
});

client.on('ready', () => {
  isConnected = true;
  currentQR = null;
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
