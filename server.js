const express = require('express');
const mongoose = require('mongoose');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات الـ Middleware الأساسية
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// الاتصال بقاعدة البيانات MongoDB مع تنظيف الرابط
const rawUri = process.env.MONGO_URI || "";
const mongoURI = rawUri.trim().replace(/^["'](.+)["']$/, '$1');

console.log("محاولة الاتصال بقاعدة البيانات...");
mongoose.connect(mongoURI)
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات MongoDB بنجاح"))
    .catch(err => console.error("❌ خطأ حرج في اتصال قاعدة البيانات:", err));

let qrCodeImage = '';
let isConnected = false;

// تشغيل نظام الواتساب باستخدام Baileys
async function startWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' })
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📌 New QR Code generated, view it on your web browser URL.');
                QRCode.toDataURL(qr, (err, url) => {
                    if (!err) {
                        qrCodeImage = url;
                    }
                });
            }

            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('⚠️ تم قطع اتصال الواتساب، جاري إعادة المحاولة...', shouldReconnect);
                if (shouldReconnect) {
                    startWhatsApp();
                }
            } else if (connection === 'open') {
                isConnected = true;
                qrCodeImage = ''; // مسح الرمز بمجرد الاتصال الناجح
                console.log('✅ WhatsApp connection opened and ready successfully!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error("❌ خطأ في تشغيل خدمة الواتساب:", err.message);
    }
}

startWhatsApp();

// عرض صورة الـ QR بشكل واضح جداً على رابط الموقع الأساسي
app.get('/', (req, res) => {
    if (isConnected) {
        res.send(`
            <div style="text-align:center; font-family:Tahoma; margin-top:80px;">
                <h1 style="color: green;">🟢 Bosco Park System is Connected!</h1>
                <p>تم ربط الواتساب بنجاح والنظام يعمل بكفاءة تامة 24/7.</p>
            </div>
        `);
    } else if (qrCodeImage) {
        res.send(`
            <div style="text-align:center; font-family:Tahoma; margin-top:40px;">
                <h2>📷 مسح رمز الـ QR لتوصيل الواتساب</h2>
                <p>افتح الواتساب في هاتفك -> الأجهزة المرتبطة -> ربط جهاز، وامسح الرمز أدناه:</p>
                <img src="${qrCodeImage}" alt="WhatsApp QR Code" style="width:320px;height:320px;border:2px solid #ccc;border-radius:10px;padding:10px;background:#fff;" />
                <p style="color: gray; margin-top: 15px;">قم بتحديث الصفحة (Refresh) إذا انقضت صلاحية الرمز.</p>
            </div>
        `);
    } else {
        res.send(`
            <div style="text-align:center; font-family:Tahoma; margin-top:80px;">
                <h2>⏳ جاري إعداد وتوليد الرمز، يرجى تحديث الصفحة بعد ثوانٍ قليلة...</h2>
            </div>
        `);
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});
