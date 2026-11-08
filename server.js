const express = require('express');
const mongoose = require('mongoose');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. الاتصال بقاعدة البيانات MongoDB
const rawUri = process.env.MONGO_URI || "";
const mongoURI = rawUri.trim().replace(/^["'](.+)["']$/, '$1');

mongoose.connect(mongoURI)
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات MongoDB بنجاح"))
    .catch(err => console.error("❌ خطأ اتصال قاعدة البيانات:", err));

// 2. نماذج البيانات (Database Schemas)
const UserSchema = new mongoose.Schema({
    name: String,
    phone: { type: String, unique: true },
    role: { type: String, enum: ['admin', 'reception', 'guest'], default: 'guest' },
    password: String
});
const User = mongoose.model('User', UserSchema);

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

// 3. تشغيل خدمة الواتساب
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

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const senderPhone = msg.key.remoteJid.replace('@s.whatsapp.net', '');
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            const user = await User.findOne({ phone: senderPhone });
            const role = user ? user.role : 'guest';

            if (role === 'admin' && text.startsWith('ادارة')) {
                await sock.sendMessage(msg.key.remoteJid, { text: "👑 أهلاً بك في قائمة الإدارة العليا لبوسكو بارك." });
            } else if (role === 'reception' && text.startsWith('استقبال')) {
                await sock.sendMessage(msg.key.remoteJid, { text: "📋 أهلاً بك في قائمة الاستقبال." });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: "⚽ أهلاً بك في مجمع بوسكو بارك الرياضي!" });
            }
        });

    } catch (err) {
        console.error("❌ خطأ في الواتساب:", err.message);
    }
}
startWhatsApp();

// 4. واجهات النظام والمسارات المنفصلة
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

app.get('/reception', async (req, res) => {
    const bookings = await Booking.find().sort({ createdAt: -1 }).limit(10);
    let listHtml = bookings.map(b => `<li><b>${b.customerName}</b> - ${b.courtName} (${b.timeSlot}) - <span style="color:blue">${b.status}</span></li>`).join('');

    res.send(`
        <div style="font-family:Tahoma; padding:30px; max-width:800px; margin:auto;">
            <h2 style="color:#007bff; border-bottom:2px solid #007bff; padding-bottom:10px;">📋 منظومة الاستقبال وحجوزات الملاعب</h2>
            <p>مخصص لموظفي الاستقبال لتسجيل الحجوزات المباشرة وتأكيد الحضور.</p>
            <h3>أحدث الحجوزات:</h3>
            <ul>${listHtml || 'لا توجد حجوزات مسجلة حالياً.'}</ul>
            <br/>
            <a href="/" style="color:#6c757d;">⬅ العودة للرئيسية</a>
        </div>
    `);
});

app.get('/admin', async (req, res) => {
    const usersCount = await User.countDocuments();
    const bookingsCount = await Booking.countDocuments();

    res.send(`
        <div style="font-family:Tahoma; padding:30px; max-width:800px; margin:auto; background:#fff3cd; border-radius:10px;">
            <h2 style="color:#dc3545; border-bottom:2px solid #dc3545; padding-bottom:10px;">🔐 لوحة تحكم الإدارة العليا</h2>
            <p>مخصص للمدير التنفيذي للتحكم بالصلاحيات والإحصائيات المالية.</p>
            <div style="display:flex; gap:20px; margin:20px 0;">
                <div style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ccc; flex:1;">
                    <h3>إجمالي المستخدمين</h3>
                    <p style="font-size:24px; font-weight:bold;">${usersCount}</p>
                </div>
                <div style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ccc; flex:1;">
                    <h3>إجمالي الحجوزات</h3>
                    <p style="font-size:24px; font-weight:bold;">${bookingsCount}</p>
                </div>
            </div>
            <br/>
            <a href="/" style="color:#6c757d;">⬅ العودة للرئيسية</a>
        </div>
    `);
});

app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});
