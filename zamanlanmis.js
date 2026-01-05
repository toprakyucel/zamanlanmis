const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- SABİT AYARLAR ---
const PORT = 3000;
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const BOT_TOKEN = '7451031457:AAGsUQW_i7K6F_CuNXoD_J0JDEW-ZtT9cWk';

// --- VARSAYILAN AYARLAR (İlk açılışta kullanılır) ---
let config = {
    chatId: '-1002141251250',
    cronTime: '30 7 * * *',
    autoMessage: '📅 Günaydın! İşte bugünün ekonomik takvimi.',
    manualMessage: '🚀 Yöneticiden anlık durum güncellemesi.',
    isRunning: true
};

// --- AYARLARI YÜKLE / KAYDET ---
function loadConfig() {
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const data = fs.readFileSync(SETTINGS_FILE);
            config = { ...config, ...JSON.parse(data) };
            console.log('✅ Ayarlar dosyadan yüklendi.');
        } catch (e) { console.error('Ayarlar yüklenemedi, varsayılanlar kullanılıyor.'); }
    }
}
function saveConfig() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2));
    console.log('💾 Ayarlar dosyaya kaydedildi.');
}

// Başlangıçta yükle
loadConfig();

// --- SİSTEM KURULUMU ---
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const app = express();
app.use(express.urlencoded({ extended: true })); // Form verilerini okumak için
let cronTask;

// --- WEB ARAYÜZÜ ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bot Yönetim Paneli</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background-color: #f4f6f9; padding-bottom: 50px; }
            .card { border: none; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 12px; margin-bottom: 20px; }
            .header-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 0 0 20px 20px; margin-bottom: 30px; }
            .status-badge { padding: 5px 15px; border-radius: 20px; font-size: 0.9em; font-weight: bold; }
            textarea { resize: none; }
        </style>
    </head>
    <body>
    
    <div class="header-bg text-center">
        <h2>🤖 ToprakBot Yönetim Paneli</h2>
        <span class="status-badge ${config.isRunning ? 'bg-success text-white' : 'bg-danger text-white'}">
            ${config.isRunning ? '✅ ZAMANLAYICI AKTİF (07:30)' : '⛔ ZAMANLAYICI DURDURULDU'}
        </span>
    </div>

    <div class="container">
        <div class="row">
            <div class="col-md-6">
                <div class="card p-3">
                    <h5 class="mb-3">🎮 İşlem Merkezi</h5>
                    <div class="d-grid gap-2">
                        <a href="/preview" target="_blank" class="btn btn-info text-white">👁️ Önce Önizle (Yeni Sekme)</a>
                        <a href="/send-now" class="btn btn-primary">🚀 Anlık Gönder (Telegram)</a>
                        <hr>
                        <div class="row">
                            <div class="col"><a href="/start-cron" class="btn btn-success w-100">▶️ Başlat</a></div>
                            <div class="col"><a href="/stop-cron" class="btn btn-danger w-100">⏹️ Durdur</a></div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-md-6">
                <div class="card p-3">
                    <h5 class="mb-3">⚙️ Mesaj & Ayarlar</h5>
                    <form action="/update" method="POST">
                        
                        <div class="mb-3">
                            <label class="form-label fw-bold">📅 Otomatik Mesaj (Sabah Atılan)</label>
                            <textarea name="autoMessage" class="form-control" rows="2">${config.autoMessage}</textarea>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-bold">🚀 Manuel Mesaj (Butonla Atılan)</label>
                            <textarea name="manualMessage" class="form-control" rows="2">${config.manualMessage}</textarea>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-bold">🆔 Hedef Chat ID</label>
                            <input type="text" name="chatId" class="form-control" value="${config.chatId}">
                        </div>

                        <button type="submit" class="btn btn-warning w-100 fw-bold">💾 Ayarları Kaydet</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    </body>
    </html>
    `);
});

// --- API YOLLARI ---

// AYAR GÜNCELLEME
app.post('/update', (req, res) => {
    config.autoMessage = req.body.autoMessage;
    config.manualMessage = req.body.manualMessage;
    config.chatId = req.body.chatId;
    saveConfig(); // Dosyaya yaz
    res.redirect('/');
});

// ÖNİZLEME
app.get('/preview', async (req, res) => {
    try {
        const buffer = await generateScreenshot();
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (e) { res.send('Hata: ' + e.message); }
});

// MANUEL GÖNDERME
app.get('/send-now', async (req, res) => {
    try {
        const buffer = await generateScreenshot();
        await bot.sendPhoto(config.chatId, buffer, { caption: config.manualMessage });
        res.redirect('/');
    } catch (e) { res.send('Hata: ' + e.message); }
});

// ZAMANLAYICI KONTROLLERİ
app.get('/stop-cron', (req, res) => {
    if(cronTask) cronTask.stop();
    config.isRunning = false;
    saveConfig();
    res.redirect('/');
});

app.get('/start-cron', (req, res) => {
    setupCron();
    config.isRunning = true;
    saveConfig();
    res.redirect('/');
});

// --- SCREENSHOT MOTORU ---
async function generateScreenshot() {
    console.log('📸 Ekran görüntüsü işleniyor...');
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1200,1200']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1100, height: 1200 });

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head><style>body { margin: 0; background: white; }</style></head>
            <body>
            <iframe src="https://sslecal2.investing.com?ecoDayBackground=%23d11b1b&defaultFont=%23000000&columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&importance=2,3&features=datepicker,timezone&countries=72,17,63,5&calType=day&timeZone=63&lang=1" 
                    width="100%" height="1200" frameborder="0"></iframe>
            </body>
            </html>`;

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 4000)); // Veri oturması için bekle
        return await page.screenshot({ fullPage: true });

    } finally {
        await browser.close();
    }
}

// --- CRON KURULUMU ---
function setupCron() {
    if(cronTask) cronTask.stop();
    cronTask = cron.schedule(config.cronTime, async () => {
        console.log('⏰ Otomatik görev çalıştı.');
        try {
            const buffer = await generateScreenshot();
            await bot.sendPhoto(config.chatId, buffer, { caption: config.autoMessage });
        } catch (err) { console.error('Hata:', err); }
    });
}

// --- BAŞLAT ---
app.listen(PORT, () => {
    if(config.isRunning) setupCron();
    console.log(`🤖 PANEL HAZIR: http://SUNUCU_IP_ADRESIN:${PORT}`);
});
