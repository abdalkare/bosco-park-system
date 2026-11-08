const express = require('express');
const mongoose = require('mongoose');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 1. الاتصال بقاعدة البيانات MongoDB ---
const rawUri = process.env.MONGO_URI || "";
const mongoURI = rawUri.trim().replace(/^["'](.+)["']$/, '$1');

mongoose.connect(mongoURI)
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات MongoDB بنجاح"))
    .catch(err => console.error("❌ خطأ اتصال قاعدة البيانات:", err));

// --- 2. نماذج البيانات (Database Schemas) ---

// نموذج المستخدمين والصلاحيات
const UserSchema = new mongoose.Schema({
    name: String,
    phone: { type: String, unique: true },
    role: { type: String, enum: ['admin', 'reception', 'guest'], default: 'guest' },
    password: String // لوحات التحكم
});
const User = mongoose.model('User', UserSchema);

// نموذج الملاعب والحجوزات
const BookingSchema = new mongoose.Schema({
    customerName: String,
    customerPhone: String,
    courtName: String,
    date: String,
    timeSlot: String,
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', BookingSchema);

// --- 3. تشغيل خدمة الواتساب بالصلاحيات ---
let qrCodeImage = '';
let isConnected = false;
let sockInstance = null;

async function startWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' })
        });
        sockInstance = sock;

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                QRCode.toDataURL(qr, (err, url) => { if (!err) qrCodeImage = url; });
            }
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) startWhatsApp();
            } else if (connection === 'open') {
                isConnected = true;
                qrCodeImage = '';
                console.log('✅ تم ربط خدمة الواتساب بنجاح!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // معالجة الرسائل الواردة بناءً على الصلاحيات
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const senderPhone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            // التحقق من صلاحية الرقم في قاعدة البيانات
            const user = await User.findOne({ phone: senderPhone });
            const role = user ? user.role : 'guest';

            if (role === 'admin' && text.startsWith('ادارة')) {
                await sock.sendMessage(msg.key.remoteJid, { text: "👑 أهلاً بك في قائمة الإدارة العليا لبوسكو بارك.\n1. تقرير اليوم\n2. تعديل أسعار الملاعب" });
            } else if (role === 'reception' && text.startsWith('استقبال')) {
                await sock.sendMessage(msg.key.remoteJid, { text: "📋 أهلاً بك في قائمة الاستقبال.\n1. تأكيد حجز\n2. الملاعب المتاحة اليوم" });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: "⚽ أهلاً بك في mجمع بوسكو بارك الرياضي!\nلحجز ملعب أو الاستفسار عن المواعيد، يرجى زيارة موقعنا أو التواصل مع الاستقبال." });
            }
        });

    } catch (err) {
        console.error("❌ خطأ في الواتساب:", err.message);
    }
}
startWhatsApp();

// --- 4. واجهات النظام والمسارات المنفصلة ---

// صفحة ربط الـ QR والموقع العام للضيوف
app.get('/', (req, res) => {
    if (!isConnected && qrCodeImage) {
        return res.send(`
            <div style="text-align:center; font-family:Tahoma; margin-top:40px;">
                <h2>📷 ربط الواتساب بالنظام</h2>
                <img src="${qrCodeImage}" style="width:300px; border:2px solid #ccc; border-radius:10px;" />
                <p>امسح الرمز من الواتساب لتشغيل النظام.</p>
            </div>
        `);
    }
    res.send(`
        <div style="text-align:center; font-family:Tahoma; margin-top:50px; background:#f8f9fa; padding:40px;">
            <h1 style="color:#28a745;">⚽ بوابة بوسكو بارك الرياضي</h1>
            <p style="font-size:18px;">مرحباً بكم في المجمع الرياضي - حجز الملاعب والخدمات الرياضية</p>
            <hr style="width:50%; margin:20px auto;" />
            <div style="margin-top:30px;">
                <a href="/reception" style="padding:12px 25px; background:#007bff; color:#fff; text-decoration:none; border-radius:5px; font-weight:bold; margin:10px;">منظومة الاستقبال 📋</a>
                <a href="/admin" style="padding:12px 25px; background:#343a40; color:#fff; text-decoration:none; border-radius:5px; font-weight:bold; margin:10px;">لوحة الإدارة العليا 🔐</a>
            </div>
        </div>
    `);
});

// منظومة الاستقبال (Reception Dashboard)
app.get('/reception', async (req, res) => {
    const bookings = await Booking.find().sort({ createdAt: -1 }).limit(10);
    let listHtml = bookings.map(b => `<li><b>${b.customerName}</b> - ${b.courtName} (${b.timeSlot}) - <span style="color:blue">${b.status}</span></li>`).join('');

    res.send(`
        <div style="font-family:Tahoma; padding:3
