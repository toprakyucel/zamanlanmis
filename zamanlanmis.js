const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

// Telegram Ayarları
const token = '7451031457:AAGsUQW_i7K6F_CuNXoD_J0JDEW-ZtT9cWk';
const targetChatId = '-1002141251250';

const bot = new TelegramBot(token, { polling: true });

async function setupBrowser() {
  try {
    console.log('🚀 Tarayıcı başlatılıyor...');
    
    // "Üzgün Surat" hatasını çözen kritik ayarlar buradadır
    const browser = await puppeteer.launch({ 
        headless: "new", // Arka planda çalış
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // <-- KRİTİK: Hafıza çökmesini (Crash) engeller
            '--disable-gpu',           // <-- Sunucuda ekran kartı yok, kapatıyoruz
            '--no-first-run',
            '--no-zygote',
            '--single-process'         // <-- Bazı durumlarda kararlılığı artırır
        ] 
    });
    
    const page = await browser.newPage();
    
    // Bot olduğumuzu gizlemek için normal bir Windows bilgisayar gibi davranıyoruz
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Ekran boyutunu baştan geniş tutalım
    await page.setViewport({ width: 1200, height: 1000 });
    
    console.log('✅ Tarayıcı başlatıldı.');
    return { browser, page };
  } catch (error) {
    console.error('❌ Tarayıcı başlatılamadı:', error);
    throw error;
  }
}

async function setPageContent(page) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>TOPRAK</title>
        <style>body { background-color: white; margin: 0; padding: 10px; }</style>
    </head>
    <body>
      <iframe src="https://sslecal2.investing.com?ecoDayBackground=%23d11b1b&defaultFont=%23000000&columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&importance=2,3&features=datepicker,timezone&countries=72,17,63,5&calType=day&timeZone=63&lang=1" 
              width="700" height="800" frameborder="0" allowtransparency="true" marginwidth="0" marginheight="0"></iframe>
      
      <div class="poweredBy" style="font-family: Arial, Helvetica, sans-serif; margin-top: 10px;">
        <span style="font-size: 11px;color: #333333;text-decoration: none;">
            <a href="default.asp">
              <img src="https://cdn.theorg.com/b79aad0a-8417-4ebd-aab4-c503c9981363_small.jpg" style="width:50px;height: 50px">
            </a>
          Real Time Economic Calendar provided by 
          <a href="AegeanLabs" rel="nofollow" target="_blank" style="font-size: 11px;color: #06529D; font-weight: bold;" class="underline_link">AegeanLabs Operation Team</a>.
        </span>
      </div>
    </body>
    </html>
  `;
  
  console.log('📄 Sayfa içeriği ayarlanıyor...');
  
  // İçeriği yükle ve ağ trafiği durana kadar bekle (iframe tam dolsun)
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  
  // Ekstra güvenlik: Iframe içindeki verilerin tam oturması için 5 saniye bekle
  console.log('⏳ Verilerin oturması bekleniyor...');
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('✅ Sayfa içeriği hazır.');
}

async function captureScreenshot(page) {
  try {
    console.log('📸 Ekran görüntüsü alınıyor...');
    
    // Iframe'in varlığını teyit et
    await page.waitForSelector('iframe', { timeout: 30000 });
    
    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log('✅ Ekran görüntüsü alındı.');
  } catch (error) {
    console.error('❌ Ekran görüntüsü alınırken hata oluştu:', error);
  }
}

async function sendScreenshotToTargetChat() {
  let browser;
  try {
    const setup = await setupBrowser();
    browser = setup.browser;
    const page = setup.page;
    
    await setPageContent(page);
    await captureScreenshot(page);

    await bot.sendPhoto(targetChatId, 'screenshot.png');
    console.log('📤 Fotoğraf Telegram’a gönderildi.');
  } catch (error) {
    console.error('❌ İŞLEM HATASI:', error);
    await bot.sendMessage(targetChatId, '⚠️ Hata oluştu: ' + error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Tarayıcı kapatıldı.');
    }
  }
}

console.log('🤖 Bot aktif. Saat 07:30 bekleniyor...');

// 🕗 HER GÜN 07:30'DA ÇALIŞACAK ZAMANLAYICI
cron.schedule('30 7 * * *', () => {
  console.log('⏰ SAAT 07:30 - Görev başlatılıyor...');
  sendScreenshotToTargetChat();
});

// ----------------------------------------------------
// DEBUG MODU: Kaydettiğin an bir kere çalışır (Test için)
// ----------------------------------------------------
console.log('🚀 TEST: Kodun çalıştığını doğrulamak için hemen bir kez çalıştırılıyor...');
sendScreenshotToTargetChat();
