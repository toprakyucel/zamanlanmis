const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const express = require('express');
const bodyParser = require('body-parser');

// --- BAŞLANGIÇ AYARLARI ---
let config = {
    token: '7451031457:AAGsUQW_i7K6F_CuNXoD_J0JDEW-ZtT9cWk',
    chatId: '-1002141251250',
    cronTime: '30 7 * * *', // Her sabah 07:30
    iframeUrl: 'https://sslecal2.investing.com?ecoDayBackground=%23d11b1b&defaultFont=%23000000&columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&importance=2,3&features=datepicker,timezone&countries=72,17,63,5&calType=day&timeZone=63&lang=1'
};

// Durum değişkenleri
let cronTask = null;
let isRunning = true; // Varsayılan olarak zamanlayıcı açık başlar

// Bot ve Sunucu Kurulumu
const bot = new TelegramBot(config.token, { polling: false }); // Polling kapalı, sadece mesaj atacağız
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// --- WEB ARAYÜZÜ (HTML PANEL) ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🤖 Toprak Bot Panel</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background-color: #f8f9fa; padding-top: 50px; }
            .card { box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
            .status-box { padding: 10px; border-radius: 5px; font-weight: bold; text-align: center; margin-bottom: 20px;}
            .running { background-color: #d4edda; color: #155724; }
            .stopped { background-color: #f8d7da; color: #721c24; }
        </style>
    </head>
    <body>
    <div class="container">
        <div class="row justify-content-center">
            <div class="col-md-8">
                <div class="card">
                    <div class="card-header bg-dark text-white">
                        <h4>🤖 Bot Kontrol Merkezi</h4>
                    </div>
                    <div class="card-body">
                        
                        <div class="status-box ${isRunning ? 'running' : 'stopped'}">
                            DURUM: ${isRunning ? '✅ ZAMANLAYICI AKTİF (Her Sabah 07:30)' : '⛔ ZAMANLAYICI DURDURULDU'}
                        </div>

                        <hr>

                        <div class="d-grid gap-2">
                            <a href="/trigger" class="btn btn-primary btn-lg">📸 ANLIK GÖNDER (Manuel)</a>
                            
                            <div class="row">
                                <div class="col">
                                    <a href="/start" class="btn btn-success w-100 ${isRunning ? 'disabled' : ''}">▶️ Zamanlayıcıyı Başlat</a>
                                </div>
                                <div class="col">
                                    <a href="/stop" class="btn btn-danger w-100 ${!isRunning ? 'disabled' : ''}">⏹️ Zamanlayıcıyı Durdur</a>
                                </div>
                            </div>
                        </div>

                        <hr>

                        <h5>⚙️ Parametre Güncelleme</h5>
                        <form action="/update" method="POST">
                            <div class="mb-3">
                                <label class="form-label">Telegram Chat ID</label>
                                <input type="text" name="chatId" class="form-control" value="${config.chatId}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Investing URL</label>
                                <textarea name="iframeUrl" class="form-control" rows="3">${config.iframeUrl}</textarea>
                            </div>
                            <button type="submit" class="btn btn-warning w-100">💾 Ayarları Kaydet</button>
                        </form>

                    </div>
                    <div class="card-footer text-muted text-center">
                        ToprakBot v2.0 - Node.js Control Panel
                    </div>
                </div>
            </div>
        </div>
    </div>
    </body>
    </html>
    `);
});

// --- API YOLLARI ---

// 1. Manuel Tetikleme
app.get('/trigger', async (req, res) => {
    console.log('⚡ Web panelden anlık tetikleme geldi.');
    sendScreenshotToTargetChat(true); // true = manuel tetiklendiğini bildir
    res.redirect('/');
});

// 2. Zamanlayıcıyı Başlat
app.get('/start', (req, res) => {
    if (!isRunning) {
        startCron();
        isRunning = true;
        console.log('▶️ Zamanlayıcı panelden başlatıldı.');
    }
    res.redirect('/');
});

// 3. Zamanlayıcıyı Durdur
app.get('/stop', (req, res) => {
    if (cronTask) {
        cronTask.stop();
        isRunning = false;
        console.log('⏹️ Zamanlayıcı panelden durduruldu.');
    }
    res.redirect('/');
});

// 4. Ayarları Güncelle
app.post('/update', (req, res) => {
    config.chatId = req.body.chatId;
    config.iframeUrl = req.body.iframeUrl;
    console.log('💾 Ayarlar güncellendi:', config);
    res.redirect('/');
});

// --- PUPPETEER FONKSİYONLARI ---

async function setupBrowser() {
    console.log('🚀 Tarayıcı başlatılıyor...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080' // Full HD Tarayıcı
        ] 
    });
    const page = await browser.newPage();
    
    // User Agent: Normal Chrome gibi görün
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Viewport: Tam sayfa kalitesi için 1920x1080
    await page.setViewport({ width: 1920, height: 1080 });
    
    return { browser, page };
}

async function setPageContent(page) {
  // Tam ekran olması için CSS ayarları güncellendi (width: 100%, height: 100vh)
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>TOPRAK</title>
        <style>
            body { margin: 0; padding: 0; overflow: hidden; background: white; }
            iframe { width: 100vw; height: 100vh; border: none; }
            .footer-credit { 
                position: absolute; bottom: 10px; right: 10px; 
                background: rgba(255,255,255,0.9); padding: 5px; border-radius: 5px;
                font-family: Arial, sans-serif; font-size: 11px; z-index: 999;
            }
        </style>
    </head>
    <body>
      <iframe src="${config.iframeUrl}" allowtransparency="true"></iframe>
      
      <div class="footer-credit">
         Real Time Economic Calendar provided by <b>AegeanLabs Operation Team</b>.
      </div>
    </body>
    </html>
  `;
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  // Verilerin oturması için bekle
  await new Promise(r => setTimeout(r, 4000));
}

async function sendScreenshotToTargetChat(isManual = false) {
  let browser;
  try {
    const setup = await setupBrowser();
    browser = setup.browser;
    const page = setup.page;
    
    await setPageContent(page);
    
    console.log('📸 Ekran görüntüsü alınıyor...');
    await page.screenshot({ path: 'screenshot.png', fullPage: true });

    let caption = '📅 Günlük Ekonomi Takvimi';
    if(isManual) caption += ' (Manuel Tetikleme)';

    await bot.sendPhoto(config.chatId, 'screenshot.png', { caption: caption });
    console.log('📤 Fotoğraf gönderildi.');

  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    if (browser) await browser.close();
  }
}

// --- ZAMANLAYICI YÖNETİMİ ---
function startCron() {
    // Mevcut varsa durdur, üst üste binmesin
    if (cronTask) cronTask.stop();

    // Cron ayarı (07:30)
    cronTask = cron.schedule(config.cronTime, () => {
        console.log('⏰ Otomatik zamanlayıcı çalıştı.');
        sendScreenshotToTargetChat();
    });
}

// --- SUNUCUYU AYAĞA KALDIR ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`------------------------------------------------`);
    console.log(`🤖 KONTROL PANELİ AKTİF: http://SUNUCU_IP_ADRESIN:${PORT}`);
    console.log(`------------------------------------------------`);
    
    // Başlangıçta zamanlayıcıyı kur
    startCron();
    
    // Test amaçlı ilk açılışta bir kez bilgi ver
    console.log('Sistem hazır. Panelden veya saatinde çalışmayı bekliyor.');
});
