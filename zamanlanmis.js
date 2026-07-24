const puppeteer = require('puppeteer');
const cron = require('node-cron');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- TELEGRAM BOT DÜZELTMESİ (Constructor Hatasını Engeller) ---
const TelegramBotRaw = require('node-telegram-bot-api');
const TelegramBot = TelegramBotRaw.default || TelegramBotRaw;

// --- SİSTEM AYARLARI ---
const PORT = 3000;
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const BOT_TOKEN = '7451031457:AAGsUQW_i7K6F_CuNXoD_J0JDEW-ZtT9cWk';
const ADMIN_PASS = 'kirikkalp34';

// --- LOGLAMA SİSTEMİ (OTOMATİK KLASÖR OLUŞTURUR) ---
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}
const LOG_FILE = path.join(LOGS_DIR, 'activity_log.txt');

function secureLog(req, action) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Bilinmeyen_IP';
    const time = new Date().toLocaleString('tr-TR');
    const logLine = `[${time}] | İŞLEM: ${action} | IP: ${ip}\n`;
    fs.appendFileSync(LOG_FILE, logLine);
}

// --- VARSAYILAN YAPILANDIRMA ---
let config = {
    chatId: '-1002141251250',
    cronTime: '07:30',
    autoMessage: '', // YAZILAR KALDIRILDI
    manualMessage: '', // YAZILAR KALDIRILDI
    waitDuration: 5000,
    viewportHeight: 1200,
    isRunning: true,
    lastRun: 'Henüz çalışmadı',
    lastMessageId: null 
};

// --- AKILLI DOSYA YÖNETİMİ ---
function loadConfig() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2));
        } else {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            config = { ...config, ...JSON.parse(data) };
        }
    } catch (e) { 
        console.error('Ayarlar okunurken hata oluştu:', e.message); 
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2));
        setupCron(); 
    } catch (e) {
        console.error('Ayar kaydetme hatası:', e.message);
    }
}

loadConfig();

// --- BAŞLATMA ---
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const app = express();
app.use(express.urlencoded({ extended: true }));
let cronTask;

// --- WEB ARAYÜZÜ ---
app.get('/', (req, res) => {
    const [hour, minute] = config.cronTime.split(':');
    let nextRun = new Date();
    nextRun.setHours(parseInt(hour), parseInt(minute), 0, 0);
    if (new Date() > nextRun) nextRun.setDate(nextRun.getDate() + 1);
    const nextRunISO = nextRun.toISOString();

    res.send(`
    <!DOCTYPE html>
    <html lang="tr" data-bs-theme="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ToprakBot 61 - YÖNETİM</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            body { background-color: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
            .card { background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); }
            .btn-custom { border-radius: 6px; font-weight: 600; text-transform: uppercase; padding: 10px; transition: 0.2s all; }
            .countdown { font-size: 2.8rem; font-weight: 800; color: #38bdf8; text-shadow: 0 0 15px rgba(56,189,248,0.4); font-variant-numeric: tabular-nums; }
            .form-control, .form-select { background-color: #334155; border: 1px solid #475569; color: #f8fafc; }
            .form-control:focus { background-color: #475569; color: #fff; border-color: #38bdf8; box-shadow: 0 0 0 0.25rem rgba(56, 189, 248, 0.25); }
            h5 { color: #94a3b8; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; border-bottom: 1px solid #334155; padding-bottom: 10px; margin-bottom: 20px;}
        </style>
    </head>
    <body>
    <div class="container py-4">
        <div class="row align-items-center mb-4">
            <div class="col-md-8">
                <h2 class="mb-0 fw-bold"><i class="fa-solid fa-robot me-2 text-warning"></i>ToprakBot <span class="text-info fs-4">v61</span></h2>
                <span class="text-muted small">Güvenli Otomasyon & Rapor Merkezi (Sadece Görsel)</span>
            </div>
            <div class="col-md-4 text-md-end mt-3 mt-md-0">
                <div class="d-inline-block px-3 py-2 rounded ${config.isRunning ? 'bg-success bg-opacity-25 border border-success text-success' : 'bg-danger bg-opacity-25 border border-danger text-danger'} fw-bold">
                    <i class="fa-solid fa-circle me-2"></i>${config.isRunning ? 'ZAMANLAYICI AKTİF' : 'SİSTEM DURDURULDU'}
                </div>
            </div>
        </div>

        <div class="row g-4">
            <div class="col-lg-4">
                <div class="card mb-4">
                    <div class="card-body text-center py-4">
                        <h5><i class="fa-regular fa-clock me-2"></i>Sıradaki Görev</h5>
                        <div id="countdown" class="countdown mb-2">--:--:--</div>
                        <div class="badge bg-secondary p-2 fs-6">Planlanan Saat: ${config.cronTime}</div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-body">
                        <h5><i class="fa-solid fa-rocket me-2"></i>Hızlı İşlemler</h5>
                        <div class="d-grid gap-2">
                            <a href="/preview" target="_blank" class="btn btn-outline-info btn-custom"><i class="fa-solid fa-eye me-2"></i>Canlı Önizleme</a>
                            <a href="/send-now" class="btn btn-primary btn-custom"><i class="fa-solid fa-paper-plane me-2"></i>Şimdi Gönder</a>
                            <a href="/delete-last" class="btn btn-warning btn-custom ${!config.lastMessageId ? 'disabled' : ''}"><i class="fa-solid fa-trash-can me-2"></i>Son Mesajı Sil</a>
                            <hr class="border-secondary my-2">
                            <a href="/toggle-cron?state=on" class="btn btn-success btn-custom ${config.isRunning ? 'disabled' : ''}"><i class="fa-solid fa-play me-2"></i>Başlat</a>
                            <a href="/toggle-cron?state=off" class="btn btn-danger btn-custom ${!config.isRunning ? 'disabled' : ''}"><i class="fa-solid fa-stop me-2"></i>Durdur</a>
                        </div>
                    </div>
                </div>
                
                <div class="text-center text-muted small">
                    <i class="fa-solid fa-circle-info me-1"></i>Son İşlem: ${config.lastRun}
                </div>
            </div>

            <div class="col-lg-8">
                <div class="card h-100">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="mb-0 border-0"><i class="fa-solid fa-sliders me-2"></i>Sistem Parametreleri</h5>
                            <i class="fa-solid fa-lock text-warning" title="Güvenlik Korumalı"></i>
                        </div>
                        
                        <form id="settingsForm" action="/update" method="POST">
                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <label class="form-label text-warning small fw-bold">Tetiklenme Saati</label>
                                    <input type="time" name="cronTime" class="form-control" value="${config.cronTime}" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label text-info small fw-bold">Hedef Chat ID</label>
                                    <input type="text" name="chatId" class="form-control" value="${config.chatId}" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Sayfa Bekleme Süresi (ms)</label>
                                    <input type="number" name="waitDuration" class="form-control" value="${config.waitDuration}" min="1000">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label small fw-bold">Görsel Yüksekliği (px)</label>
                                    <input type="number" name="viewportHeight" class="form-control" value="${config.viewportHeight}" min="500">
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label small fw-bold text-muted">Otomatik Gönderim Mesajı (Boş Bırakılabilir)</label>
                                <textarea name="autoMessage" class="form-control" rows="2" placeholder="Sadece resim gitmesi için boş bırakın">${config.autoMessage}</textarea>
                            </div>

                            <div class="mb-4">
                                <label class="form-label small fw-bold text-muted">Manuel Gönderim Mesajı (Boş Bırakılabilir)</label>
                                <textarea name="manualMessage" class="form-control" rows="2" placeholder="Sadece resim gitmesi için boş bırakın">${config.manualMessage}</textarea>
                            </div>
                            
                            <div class="input-group mb-3">
                                <span class="input-group-text bg-secondary border-secondary text-white"><i class="fa-solid fa-key"></i></span>
                                <input type="password" name="password" class="form-control border-secondary" placeholder="Değişiklikleri kaydetmek için yönetici şifresini girin" required>
                                <button type="submit" class="btn btn-success px-4 fw-bold"><i class="fa-solid fa-floppy-disk me-2"></i>KAYDET</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const targetDate = new Date("${nextRunISO}").getTime();
        setInterval(function() {
            const now = new Date().getTime();
            const distance = targetDate - now;
            if (distance < 0) { document.getElementById("countdown").innerHTML = "00:00:00"; return; }
            const h = Math.floor((distance % (86400000)) / (3600000));
            const m = Math.floor((distance % (3600000)) / (60000));
            const s = Math.floor((distance % (60000)) / 1000);
            document.getElementById("countdown").innerHTML = (h<10?"0":"")+h + ":" + (m<10?"0":"")+m + ":" + (s<10?"0":"")+s;
        }, 1000);
    </script>
    </body>
    </html>
    `);
});

// --- API ROUTES ---
app.post('/update', (req, res) => {
    if (req.body.password !== ADMIN_PASS) {
        secureLog(req, 'HATALI_SIFRE'); 
        return res.send(`
            <body style="background:#0f172a; color:#ef4444; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center;">
                <h1 style="font-size:4rem; margin-bottom:10px;">🚫</h1>
                <h2>YETKİSİZ ERİŞİM DENEMESİ</h2>
                <p style="color:#94a3b8;">Girdiğiniz yönetici şifresi hatalı.</p>
                <button onclick="window.history.back()" style="background:#3b82f6; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:bold; margin-top:15px;">Geri Dön ve Tekrar Dene</button>
            </body>
        `);
    }

    secureLog(req, 'AYARLAR_GUNCELLENDI'); 
    config.cronTime = req.body.cronTime;
    config.chatId = req.body.chatId;
    config.waitDuration = parseInt(req.body.waitDuration);
    config.viewportHeight = parseInt(req.body.viewportHeight);
    config.autoMessage = req.body.autoMessage || ''; // Eğer boş gelirse string kalır
    config.manualMessage = req.body.manualMessage || '';
    saveConfig();
    res.redirect('/');
});

app.get('/delete-last', async (req, res) => {
    secureLog(req, 'MESAJ_SILME_TALEBI'); 
    if (config.lastMessageId) {
        try {
            await bot.deleteMessage(config.chatId, config.lastMessageId);
            config.lastMessageId = null;
            config.lastRun = 'Mesaj Başarıyla Silindi';
            saveConfig();
        } catch (error) {
            config.lastRun = 'Mesaj Silinemedi (' + error.message + ')';
            saveConfig(); 
        }
    }
    res.redirect('/');
});

app.get('/toggle-cron', (req, res) => {
    const isNowRunning = (req.query.state === 'on');
    secureLog(req, isNowRunning ? 'ZAMANLAYICI_BASLADI' : 'ZAMANLAYICI_DURDU'); 
    config.isRunning = isNowRunning;
    saveConfig();
    res.redirect('/');
});

app.get('/preview', async (req, res) => {
    secureLog(req, 'ONIZLEME_TALEBI'); 
    try {
        const buffer = await generateScreenshot();
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (e) { 
        res.status(500).send('<h1>Hata Oluştu</h1><p>' + e.message + '</p>'); 
    }
});

app.get('/send-now', async (req, res) => {
    secureLog(req, 'MANUEL_GONDERIM'); 
    try {
        const buffer = await generateScreenshot();
        
        // EĞER MESAJ BOŞSA SADECE FOTOĞRAF GÖNDERİLİR
        const sendOptions = config.manualMessage ? { caption: config.manualMessage } : {};
        const sentMsg = await bot.sendPhoto(config.chatId, buffer, sendOptions);
        
        config.lastMessageId = sentMsg.message_id;
        config.lastRun = 'Manuel Gönderim Başarılı: ' + new Date().toLocaleTimeString('tr-TR');
        saveConfig();
        res.redirect('/');
    } catch (e) { 
        config.lastRun = 'Manuel HATA: ' + e.message;
        saveConfig();
        res.status(500).send('<h1>Gönderim Hatası</h1><p>' + e.message + '</p><button onclick="window.history.back()">Geri</button>'); 
    }
});

// --- PUPPETEER ÇEKİRDEĞİ ---
async function generateScreenshot() {
    console.log('📸 Ekran görüntüsü süreci başladı...');
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1200,1200']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1100, height: config.viewportHeight });

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head><style>body { margin: 0; background: white; overflow: hidden; }</style></head>
            <body>
            <iframe src="https://sslecal2.investing.com?ecoDayBackground=%23d11b1b&defaultFont=%23000000&columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&importance=2,3&features=datepicker,timezone&countries=72,17,63,5&calType=day&timeZone=63&lang=1" 
                    width="100%" height="${config.viewportHeight}" frameborder="0"></iframe>
            </body>
            </html>`;

        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        console.log(`⏳ Iframe verisi için ${config.waitDuration}ms bekleniyor...`);
        await new Promise(r => setTimeout(r, config.waitDuration)); 
        return await page.screenshot({ fullPage: true });
    } finally {
        await browser.close();
    }
}

// --- ZAMANLAYICI (CRON) SİSTEMİ ---
function setupCron() {
    if(cronTask) cronTask.stop();
    if(!config.isRunning) { 
        console.log('⛔ Cron durduruldu.'); 
        return; 
    }

    const [hour, minute] = config.cronTime.split(':');
    const cronExpression = `${minute} ${hour} * * *`;
    console.log(`✅ Zamanlayıcı Aktif: Her gün saat ${config.cronTime} itibarıyla çalışacak.`);

    cronTask = cron.schedule(cronExpression, async () => {
        console.log('⏰ Otomatik görev tetiklendi.');
        try {
            const buffer = await generateScreenshot();
            
            // EĞER MESAJ BOŞSA SADECE FOTOĞRAF GÖNDERİLİR
            const sendOptions = config.autoMessage ? { caption: config.autoMessage } : {};
            const sentMsg = await bot.sendPhoto(config.chatId, buffer, sendOptions);
            
            config.lastMessageId = sentMsg.message_id; 
            config.lastRun = 'Otomatik Görev Başarılı: ' + new Date().toLocaleTimeString('tr-TR');
        } catch (err) { 
            console.error('Otomatik Görev Hatası:', err.message);
            config.lastRun = 'Otomatik HATA: ' + err.message;
        }
        saveConfig();
    });
}

// --- SİSTEMİ BAŞLAT ---
app.listen(PORT, () => {
    console.log(`🚀 SİSTEM BAŞLATILDI! Panele Git: http://localhost:${PORT}`);
});
