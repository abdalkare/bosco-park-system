const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الـ Middleware الأساسية
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. الاتصال بقاعدة البيانات مع تنظيف الرابط من أي مسافات أو رموز زائدة
const rawUri = process.env.MONGO_URI || "";
const mongoURI = rawUri.trim().replace(/^["'](.+)["']$/, '$1');

console.log("محاولة الاتصال بقاعدة البيانات...");
mongoose.connect(mongoURI)
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات MongoDB بنجاح"))
    .catch(err => console.error("❌ خطأ حرج في اتصال قاعدة البيانات:", err));

// 2. إعداد عميل الواتساب مع مسار كروم السحابي على Render
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/opt/render/.cache/puppeteer/chrome/linux-146.0.7680.31/chrome-linux64/chrome',
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--no-first-run'
        ]
    }
});

// الأحداث الأساسية للواتساب
client.on('qr', (qr) => {
    console.log('QR CODE RECEIVED, scan it from your terminal or logs if needed.');
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready and connected!');
});

// بدء تشغيل عميل الواتساب
client.initialize();

// مسار تجريبي للتأكد من أن الموقع يعمل
app.get('/', (req, res) => {
    res.send('Bosco Park System is running successfully 24/7!');
});

// تشغيل السيرفر على المنفذ المطلوب
app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});