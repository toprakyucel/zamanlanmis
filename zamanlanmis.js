const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- SİSTEM AYARLARI ---
const PORT = 3000;
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const BOT_TOKEN = '7451031457:AAGsUQW_i7K6F_CuNXoD_J0JDEW-ZtT9cWk';
const ADMIN_PASS = 'kirikkalp34'; // 🔐 YÖNETİCİ ŞİFRESİ

// --- LOGLAMA (GİZLİ SİSTEM) ---
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR);
}
const LOG_FILE = path.join(LOGS_DIR, 'activity_log.txt');

function secureLog(req, action) {
    const user = req.query.user || req.body.user || 'Bilinmeyen_Kullanici';
    const lat = req.query.lat || req.body.lat || 'Bilinmeyen_Lat';
    const lon = req.query.lon || req.body.lon || 'Bilinmeyen_Lon';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const time = new Date().toLocaleString('tr-TR');
    
    const logLine = `[${time}] | KULLANICI: ${user} | İŞLEM: ${action} | KONUM: ${lat}, ${lon} | IP: ${ip}\n`;
    fs.appendFileSync(LOG_FILE, logLine);
}

// --- VARSAYILAN YAPILANDIRMA ---
let config = {
    chatId: '-1002141251250',
    cronTime: '07:30',
    autoMessage: '📅 Günaydın! Piyasalar açılmadan önce günün ekonomik takvimi karşınızda.',
    manualMessage: '🚀 Yönetim paneli üzerinden anlık durum güncellemesi.',
    waitDuration: 5000,
    viewportHeight: 1200,
    isRunning: true,
    lastRun: 'Henüz çalışmadı',
    lastMessageId: null 
};

// --- AYAR YÖNETİMİ ---
function loadConfig() {
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const data = fs.readFileSync(SETTINGS_FILE);
            config = { ...config, ...JSON.parse(data) };
            console.log('✅ Ayarlar yüklendi.');
        } catch (e) { console.error('Ayarlar okunamadı.'); }
    }
}

function saveConfig() {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2));
    setupCron(); 
}

loadConfig();

// --- BAŞLATMA ---
const bot = new TelegramBot(BOT_TOKEN, { polling: false });
const app = express();
app.use(express.urlencoded({ extended: true }));
let cronTask;

// --- WEB ARAYÜZÜ (DASHBOARD) ---
app.get('/', (req, res) => {
    const [hour, minute] = config.cronTime.split(':');
    let nextRun = new Date();
    nextRun.setHours(hour, minute, 0, 0);
    if (new Date() > nextRun) nextRun.setDate(nextRun.getDate() + 1);
    const nextRunISO = nextRun.toISOString();

    const funnyQuestions = [
        "Uşağum, Hamsi ağaca tırmanırsa ne olur?",
        "Temel Fadime'ye ne demiş?",
        "Trabzon'da 'sağa dönülmez' levhasını görünce ne yaparsın?",
        "Çay bardağındaki kaşık sesi neyi ifade eder?",
        "Laz müteahhit inşaata nerden başlar?",
        "Oflu hoca cumada cemaate ne diye seslenmiş?"
    ];

    res.send(`
    <!DOCTYPE html>
    <html lang="tr" data-bs-theme="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ToprakBot 61 - Admin</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            body { background-color: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', sans-serif; overflow: hidden; }
            .card { background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); }
            .btn-custom { border-radius: 8px; font-weight: 600; text-transform: uppercase; padding: 12px; }
            .countdown { font-size: 3rem; font-weight: 800; color: #38bdf8; text-shadow: 0 0 20px rgba(56,189,248,0.5); }
            .form-control, .form-select { background-color: #334155; border: 1px solid #475569; color: #fff; }
            .form-control:focus { background-color: #475569; color: #fff; border-color: #38bdf8; }
            h5 { color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 15px; font-weight: 700; }
            
            /* GİZLİ AJAN EKRANI CSS */
            #agent-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.95); z-index: 9999;
                display: flex; flex-direction: column; justify-content: center; align-items: center;
                backdrop-filter: blur(10px);
            }
            .cyber-box {
                background: #000; border: 1px solid #0f0; box-shadow: 0 0 20px #0f0;
                padding: 40px; border-radius: 10px; text-align: center; color: #0f0; font-family: monospace;
            }
            .cyber-input { background: transparent; border: none; border-bottom: 2px solid #0f0; color: #0f0; padding: 10px; width: 100%; text-align: center; font-size: 1.2rem; outline: none; margin-bottom: 20px; }
            .cyber-btn { background: #0f0; color: #000; border: none; padding: 10px 20px; font-weight: bold; cursor: pointer; text-transform: uppercase; font-family: monospace; transition: 0.3s; }
            .cyber-btn:hover { background: #fff; box-shadow: 0 0 15px #fff; }
        </style>
    </head>
    <body>

    <!-- GİZLİ AJAN GİRİŞ EKRANI -->
    <div id="agent-overlay">
        <div class="cyber-box">
            <h2><i class="fa-solid fa-satellite-dish"></i> GÜVENLİK PROTOKOLÜ </h2>
            <p>Sisteme erişmek için kimlik ve konum doğrulaması zorunludur.</p>
            <input type="text" id="agentUsername" class="cyber-input" placeholder="@TelegramKullaniciAdi" required>
            <button class="cyber-btn" onclick="authorizeAgent()">ERİŞİM TALEP ET</button>
            <p id="auth-status" class="mt-3 text-warning"></p>
        </div>
    </div>

    <!-- ANA PANEL (BAŞLANGIÇTA GİZLİ, SONRA AÇILACAK) -->
    <div class="container py-5" id="main-content" style="opacity: 0; pointer-events: none; transition: 1s;">
        <div class="d-flex justify-content-between align-items-center mb-5">
            <div>
                <h2 class="mb-0 fw-bold"><i class="fa-solid fa-user-secret me-2 text-warning"></i>ToprakBot <span class="text-info">v61</span></h2>
                <small class="text-muted">Güvenli Otomasyon Sistemi</small>
            </div>
            <div class="${config.isRunning ? 'text-success' : 'text-danger'} fw-bold border border-secondary px-3 py-2 rounded bg-dark">
                <i class="fa-solid fa-circle me-2"></i>${config.isRunning ? 'SİSTEM AKTİF' : 'DURDURULDU'}
            </div>
        </div>

        <div class="row g-4">
            <div class="col-lg-5">
                <div class="card mb-4">
                    <div class="card-body text-center py-4">
                        <h5><i class="fa-regular fa-clock me-2"></i>Kalkışa Kalan Süre</h5>
                        <div id="countdown" class="countdown">--:--:--</div>
                        <div class="mt-2 text-info">Hedef Saat: <strong>${config.cronTime}</strong></div>
                    </div>
                </div>

                <div class="card mb-4">
                    <div class="card-body">
                        <h5><i class="fa-solid fa-rocket me-2"></i>Komuta Merkezi</h5>
                        <div class="d-grid gap-3">
                            <a href="/preview" target="_blank" class="btn btn-outline-info btn-custom dynamic-link"><i class="fa-solid fa-eye me-2"></i>Önizleme Yap</a>
                            <a href="/send-now" class="btn btn-primary btn-custom dynamic-link"><i class="fa-solid fa-paper-plane me-2"></i>Telegram'a Gönder</a>
                            
                            <a href="/delete-last" class="btn btn-warning btn-custom dynamic-link ${!config.lastMessageId ? 'disabled' : ''}">
                                <i class="fa-solid fa-trash-can me-2"></i>Son Mesajı Geri Çek
                            </a>

                            <div class="row g-2">
                                <div class="col"><a href="/toggle-cron?state=on" class="btn btn-success w-100 py-2 dynamic-link ${config.isRunning ? 'disabled' : ''}"><i class="fa-solid fa-play"></i> Başlat</a></div>
                                <div class="col"><a href="/toggle-cron?state=off" class="btn btn-danger w-100 py-2 dynamic-link ${!config.isRunning ? 'disabled' : ''}"><i class="fa-solid fa-stop"></i> Durdur</a></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body text-center">
                        <small class="text-muted"><i class="fa-solid fa-server me-2"></i>Son İşlem: <span class="text-white">${config.lastRun}</span></small>
                    </div>
                </div>
            </div>

            <div class="col-lg-7">
                <div class="card h-100">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between">
                            <h5><i class="fa-solid fa-gears me-2"></i>Sistem Parametreleri</h5>
                            <i class="fa-solid fa-lock text-warning" title="Şifre Korumalı"></i>
                        </div>
                        
                        <form id="settingsForm" action="/update" method="POST">
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label text-warning">⏰ Tetiklenme Saati</label>
                                    <input type="time" name="cronTime" class="form-control" value="${config.cronTime}" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label text-info">🆔 Chat ID</label>
                                    <input type="text" name="chatId" class="form-control" value="${config.chatId}">
                                </div>
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">⏳ Bekleme (ms)</label>
                                    <input type="number" name="waitDuration" class="form-control" value="${config.waitDuration}">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">📏 Yükseklik (px)</label>
                                    <input type="number" name="viewportHeight" class="form-control" value="${config.viewportHeight}">
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">📅 Otomatik Mesaj</label>
                                <textarea name="autoMessage" class="form-control" rows="2">${config.autoMessage}</textarea>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">🚀 Manuel Mesaj</label>
                                <textarea name="manualMessage" class="form-control" rows="2">${config.manualMessage}</textarea>
                            </div>

                            <hr class="border-secondary my-4">
                            
                            <button type="button" onclick="openSecurityModal()" class="btn btn-success w-100 btn-custom">
                                <i class="fa-solid fa-floppy-disk me-2"></i>DEĞİŞİKLİKLERİ KAYDET
                            </button>

                            <!-- LOG İÇİN GİZLİ İNPUTLAR (JS İLE DOLDURULACAK) -->
                            <input type="hidden" name="user" id="hiddenUser">
                            <input type="hidden" name="lat" id="hiddenLat">
                            <input type="hidden" name="lon" id="hiddenLon">
                            <input type="hidden" name="password" id="hiddenPasswordInput">
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- GÜVENLİK MODALI -->
    <div class="modal fade" id="securityModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content bg-dark border-secondary text-white">
                <div class="modal-header border-secondary">
                    <h5 class="modal-title text-warning"><i class="fa-solid fa-shield-halved me-2"></i>Güvenlik Kontrolü</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                    <div class="mb-3">
                        <i class="fa-solid fa-circle-question fa-3x text-info mb-3"></i>
                        <p class="fs-5 fw-bold" id="funnyQuestionText">...</p>
                    </div>
                    <div class="form-floating mb-3">
                        <input type="password" class="form-control bg-secondary text-white border-0" id="modalPassword" placeholder="Şifre">
                        <label class="text-white">Yönetici Şifresi</label>
                    </div>
                </div>
                <div class="modal-footer border-secondary">
                    <button type="button" class="btn btn-primary w-100" onclick="submitForm()">Doğrula ve Kaydet</button>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        // --- LOGLAMA / AJAN SİSTEMİ JS ---
        let agentData = { user: '', lat: '', lon: '' };

        function authorizeAgent() {
            const username = document.getElementById('agentUsername').value.trim();
            const statusText = document.getElementById('auth-status');

            if (!username.startsWith('@') || username.length < 3) {
                statusText.innerText = "HATA: Lütfen geçerli bir @kullaniciadi girin.";
                return;
            }

            statusText.innerText = "LOKASYON BİLGİSİ ARANIYOR... Tarayıcıdan izin verin.";

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        agentData.user = username;
                        agentData.lat = position.coords.latitude;
                        agentData.lon = position.coords.longitude;
                        
                        // Gizli inputları doldur (Post işlemi için)
                        document.getElementById('hiddenUser').value = agentData.user;
                        document.getElementById('hiddenLat').value = agentData.lat;
                        document.getElementById('hiddenLon').value = agentData.lon;

                        // Linkleri loglanabilir hale getir (Get işlemi için)
                        document.querySelectorAll('.dynamic-link').forEach(link => {
                            if(link.href) {
                                const char = link.href.includes('?') ? '&' : '?';
                                link.href += \`\${char}user=\${encodeURIComponent(agentData.user)}&lat=\${agentData.lat}&lon=\${agentData.lon}\`;
                            }
                        });

                        // Ekranı aç
                        document.getElementById('agent-overlay').style.display = 'none';
                        document.body.style.overflow = 'auto';
                        const mainContent = document.getElementById('main-content');
                        mainContent.style.opacity = '1';
                        mainContent.style.pointerEvents = 'auto';
                    },
                    (error) => {
                        statusText.innerText = "ERİŞİM REDDEDİLDİ: Konum izni vermeden giriş yapılamaz!";
                    }
                );
            } else {
                statusText.innerText = "Tarayıcınız konum servisini desteklemiyor.";
            }
        }

        // --- SAYAÇ JS ---
        const targetDate = new Date("${nextRunISO}").getTime();
        setInterval(function() {
            const now = new Date().getTime();
            const distance = targetDate - now;
            if (distance < 0) { document.getElementById("countdown").innerHTML = "00:00:00"; return; }
            const h = Math.floor((distance % (86400000)) / (3600000));
            const m = Math.floor((distance % (3600000)) / (60000));
            const s = Math.floor((distance % (60000)) / 1000);
            document.getElementById("countdown").innerHTML = 
                (h<10?"0":"")+h + ":" + (m<10?"0":"")+m + ":" + (s<10?"0":"")+s;
        }, 1000);

        // --- GÜVENLİK MODALI JS ---
        const questions = ${JSON.stringify(funnyQuestions)};
        const modal = new bootstrap.Modal(document.getElementById('securityModal'));

        function openSecurityModal() {
            const randomQ = questions[Math.floor(Math.random() * questions.length)];
            document.getElementById('funnyQuestionText').innerText = randomQ;
            document.getElementById('modalPassword').value = ''; 
            modal.show();
        }

        function submitForm() {
            const pass = document.getElementById('modalPassword').value;
            if(!pass) { alert("Ula şifre girmedun!"); return; }
            
            document.getElementById('hiddenPasswordInput').value = pass;
            document.getElementById('settingsForm').submit();
        }
    </script>
    </body>
    </html>
    `);
});

// --- API YOLLARI ---

app.post('/update', (req, res) => {
    // ŞİFRE KONTROLÜ
    if (req.body.password !== ADMIN_PASS) {
        secureLog(req, 'HATALI_SIFRE_DENEMESI'); // 📝 Logla!
        return res.send(`
            <body style="background:#121212; color:red; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center;">
                <div>
                    <h1>🚫 ŞİFRE YANLIŞ!</h1>
                    <h3>Uyyy uşağum, sen admin değilsun galiba?</h3>
                    <p>Geri dön ve tekrar dene daa.</p>
                    <button onclick="window.history.back()" style="padding:10px 20px; cursor:pointer;">Geri Dön</button>
                </div>
            </body>
        `);
    }

    secureLog(req, 'AYARLARI_KAYDETTI'); // 📝 Logla!
    config.cronTime = req.body.cronTime;
    config.chatId = req.body.chatId;
    config.waitDuration = parseInt(req.body.waitDuration);
    config.viewportHeight = parseInt(req.body.viewportHeight);
    config.autoMessage = req.body.autoMessage;
    config.manualMessage = req.body.manualMessage;
    saveConfig();
    res.redirect('/');
});

app.get('/delete-last', async (req, res) => {
    secureLog(req, 'SON_MESAJI_SILMEYI_DENEDI'); // 📝 Logla!
    if (config.lastMessageId) {
        try {
            console.log(`🗑️ Mesaj siliniyor: ${config.lastMessageId}`);
            await bot.deleteMessage(config.chatId, config.lastMessageId);
            config.lastMessageId = null;
            config.lastRun += ' (Mesaj Silindi)';
            saveConfig();
            secureLog(req, 'SON_MESAJI_BASARIYLA_SILDI'); // 📝 Logla!
        } catch (error) {
            console.error('Silme hatası:', error.message);
            config.lastRun += ' (Silinemedi)';
            saveConfig(); 
        }
    }
    res.redirect('/');
});

app.get('/toggle-cron', (req, res) => {
    const isNowRunning = (req.query.state === 'on');
    secureLog(req, isNowRunning ? 'ZAMANLAYICI_BASLATILDI' : 'ZAMANLAYICI_DURDURULDU'); // 📝 Logla!
    config.isRunning = isNowRunning;
    saveConfig();
    res.redirect('/');
});

app.get('/preview', async (req, res) => {
    secureLog(req, 'ONIZLEME_YAPTI'); // 📝 Logla!
    try {
        const buffer = await generateScreenshot();
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (e) { res.send('Hata: ' + e.message); }
});

app.get('/send-now', async (req, res) => {
    secureLog(req, 'MANUEL_TELEGRAM_GONDERIMI_BASLATTI'); // 📝 Logla!
    try {
        config.lastRun = 'Manuel: ' + new Date().toLocaleString('tr-TR');
        const buffer = await generateScreenshot();
        
        const sentMsg = await bot.sendPhoto(config.chatId, buffer, { caption: config.manualMessage });
        config.lastMessageId = sentMsg.message_id;
        
        config.lastRun += ' (BAŞARILI)';
        saveConfig();
        secureLog(req, 'MANUEL_TELEGRAM_GONDERIMI_BASARILI'); // 📝 Logla!
        res.redirect('/');
    } catch (e) { 
        config.lastRun += ' (HATA: ' + e.message + ')';
        saveConfig();
        res.send('Hata: ' + e.message); 
    }
});

// --- CORE LOGIC ---
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

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        console.log(`⏳ Veri için ${config.waitDuration}ms bekleniyor...`);
        await new Promise(r => setTimeout(r, config.waitDuration)); 
        return await page.screenshot({ fullPage: true });

    } finally {
        await browser.close();
    }
}

// --- CRON ---
function setupCron() {
    if(cronTask) cronTask.stop();
    if(!config.isRunning) { console.log('⛔ Cron durduruldu.'); return; }

    const [hour, minute] = config.cronTime.split(':');
    const cronExpression = `${minute} ${hour} * * *`;
    console.log(`✅ Zamanlayıcı kuruldu: ${config.cronTime}`);

    cronTask = cron.schedule(cronExpression, async () => {
        console.log('⏰ Otomatik görev tetiklendi.');
        config.lastRun = 'Otomatik: ' + new Date().toLocaleString('tr-TR');
        try {
            const buffer = await generateScreenshot();
            const sentMsg = await bot.sendPhoto(config.chatId, buffer, { caption: config.autoMessage });
            config.lastMessageId = sentMsg.message_id; 
            config.lastRun += ' (BAŞARILI)';
        } catch (err) { 
            console.error('Hata:', err);
            config.lastRun += ' (HATA)';
        }
        saveConfig();
    });
}

// --- START ---
app.listen(PORT, () => {
    setupCron();
    console.log(`🚀 SİSTEM BAŞLATILDI: http://localhost:${PORT}`);
});
