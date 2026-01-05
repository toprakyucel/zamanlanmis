const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const cron = require('node-cron');

// Telegram bot token
const token = '7451031457:AAGsUQW_i7K6F_CuNXoD_J0JDEW-ZtT9cWk';
const targetChatId = '-1002141251250'; // Hedeflenen chat ID  

// Botu oluştur
const bot = new TelegramBot(token, { polling: true });

async function setupBrowser() {
  try {
    console.log('🚀 Tarayıcı başlatılıyor...');
    // SUNUCU AYARI: Ubuntu terminalde arayüz olmadığı için headless "new" olmalı
    // ve sandbox kapatılmalı.
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Viewport'u biraz geniş tutalım ki iframe sığsın
    await page.setViewport({ width: 1000, height: 1200 });
    
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
      <iframe src="https://sslecal2.investing.com?ecoDayBackground=%23d11b1b&defaultFont=%23000000&columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&importance=2,3&features=datepicker,timezone&countries=72,17,63,5&calType=day&timeZone=63&lang=1" width="700" height="800" frameborder="0" allowtransparency="true" marginwidth="0" marginheight="0"></iframe>
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
  
  // İçeriği yükle ve ağ trafiği durana kadar bekle (iframe yüklensin diye)
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  
  // Ekstra güvenlik: Iframe içindeki verilerin tam oturması için 3 saniye bekle
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('✅ Sayfa içeriği ayarlandı.');
}

async function captureScreenshot(page) {
  try {
    console.log('📸 Ekran görüntüsü alınıyor...');
    
    // Iframe selector'ını bekle
    await page.waitForSelector('iframe', { timeout: 30000 });
    
    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log('✅ Ekran görüntüsü alındı ve kaydedildi.');
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
    console.log('📤 Ekran görüntüsü hedeflenen chat ID\'sine gönderildi.');
  } catch (error) {
    console.error('❌ Hata oluştu:', error);
    await bot.sendMessage(targetChatId, '⚠️ Ekran görüntüsü alınırken bir hata oluştu: ' + error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Tarayıcı kapatıldı.');
    }
  }
}

console.log('🤖 Bot çalışıyor ve zamanlayıcı kuruldu...');

// 🕗 07:30'da otomatik olarak çalışması için cron ayarı
// Format: Saniye(opsiyonel) Dakika Saat Gün Ay HaftanınGünü
cron.schedule('30 7 * * *', () => {
  console.log('⏰ 07:30 - Otomatik ekran görüntüsü alma başlatılıyor...');
  sendScreenshotToTargetChat();
});

// ----------------------------------------------------
// DEBUG MODU: Kodu ilk çalıştırdığında hemen test et
// ----------------------------------------------------
console.log('🚀 DEBUG: Sistem kontrolü için hemen bir kez çalıştırılıyor...');
sendScreenshotToTargetChat();