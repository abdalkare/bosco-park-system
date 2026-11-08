const express = require('express');
const mongoose = require('mongoose');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الـ Middleware الأساسية
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. الاتصال بقاعدة البيانات MongoDB مع تنظيف الرابط
const rawUri = process.env.MONGO_URI || "";
const mongoURI = rawUri.trim().replace(/^["'](.+)["']$/, '$1');

console.log("محاولة الاتصال بقاعدة البيانات...");
mongoose.connect(mongoURI)
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات MongoDB بنجاح"))
    .catch(err => console.error("❌ خطأ حرج في اتصال قاعدة البيانات:", err));

// 2. تشغيل نظام الواتساب باستخدام Baileys (بدون كروم وبأداء فائق)
async function startWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' }) // كتم السجلات الزائدة للحفاظ على نظافة الـ Logs
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📌 QR Code Received! Scan it from your Render Logs:');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('⚠️ تم قطع اتصال الواتساب، جاري إعادة المحاولة...', shouldReconnect);
                if (shouldReconnect) {
                    startWhatsApp();
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp connection opened and ready successfully!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error("❌ خطأ في تشغيل خدمة الواتساب:", err.message);
    }
}

// بدء تشغيل الواتساب
startWhatsApp();

// مسار تجريبي للتأكد من أن الموقع يعمل
app.get('/', (req, res) => {
    res.send('Bosco Park System (Baileys Engine) is running successfully 24/7!');
});

// تشغيل السيرفر على المنفذ المطلوب
app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});
