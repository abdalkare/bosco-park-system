const express = require('express');
const mongoose = require('mongoose');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// الاتصال بقاعدة البيانات
const rawUri = process.env.MONGO_URI || "";
const mongoURI = rawUri.trim().replace(/^["'](.+)["']$/, '$1');

mongoose.connect(mongoURI)
    .then(() => console.log("✅ تم الاتصال بقاعدة البيانات MongoDB بنجاح"))
    .catch(err => console.error("❌ خطأ اتصال قاعدة البيانات:", err));

// النماذج
const UserSchema = new mongoose.Schema({
    name: String,
    phone: { type: String, unique: true },
    role: { type: String, enum: ['admin', 'reception', 'guest'], default: 'guest' }
});
const User = mongoose.model('User', UserSchema);

const BookingSchema = new mongoose.Schema({
    customerName: String,
    customerPhone: String,
    courtName: String,
    date: String,
    timeSlot: String,
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'confirmed' },
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', BookingSchema);

// تشغيل الواتساب
let qrCodeImage = '';
let isConnected = false;

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
            if (qr) QRCode.toDataURL(qr, (err, url) => { if (!err) qrCodeImage = url; });
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

            if (role === 'admin' && text.includes('ادارة')) {
                await sock.sendMessage(msg.key.remoteJid, { text: "👑 أهلاً بك في لوحة تحكم بوسكو بارك." });
            } else {
                await sock.sendMessage(msg.key.remoteJid, { text: "⚽ أهلاً بك في مجمع بوسكو بارك الرياضي!" });
            }
        });
    } catch (err) {
        console.error("❌ خطأ في الواتساب:", err.message);
    }
}
startWhatsApp();

// التصميم العام للواجهات
const layout = (title, content) => `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Bosco Park</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
        body { background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 20px; }
        .container { background: #1e293b; width: 100%; max-width: 900px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); padding: 40px; border: 1px solid #334155; }
        h1, h2 { color: #38bdf8; margin-bottom: 15px; font-weight: 700; }
        p { color: #94a3b8; margin-bottom: 25px; line-height: 1.6; }
        .btn { display: inline-block; padding: 12px 24px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; transition: all 0.3s ease; border: none; cursor: pointer; }
        .btn:hover { background: #0369a1; transform: translateY(-2px); }
        .btn-admin { background: #e11d48; }
        .btn-admin:hover { background: #be123c; }
        .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155; text-align: center; }
        .card h3 { color: #94a3b8; font-size: 14px; margin-bottom: 10px; }
        .card .number { font-size: 28px; font-weight: 700; color: #38bdf8; }
        input, select { width: 100%; padding: 12px; margin-bottom: 15px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #fff; font-size: 14px; }
        input:focus, select:focus { outline: none; border-color: #38bdf8; }
        ul { list-style: none; }
        li { background: #0f172a; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
        .nav-links { display: flex; gap: 15px; margin-top: 25px; }
        .back-link { display: inline-block; margin-top: 20px; color: #94a3b8; text-decoration: none; font-size: 14px; }
        .back-link:hover { color: #38bdf8; }
    </style>
</head>
<body>
    <div class="container">
        ${content}
    </div>
</body>
</html>
`;

// الرئيسية
app.get('/', (req, res) => {
    if (!isConnected && qrCodeImage) {
        return res.send(layout("ربط النظام", `
            <div style="text-align: center;">
                <h2>ربط واتساب مجمع بوسكو بارك</h2>
                <p>امسح رمز الاستجابة السريعة (QR Code) أدناه لتفعيل النظام الآلي فوراً.</p>
                <img src="${qrCodeImage}" style="width: 260px; height: 260px; border-radius: 12px; padding: 10px; background: #fff; margin-bottom: 20px;" />
            </div>
        `));
    }

    res.send(layout("بوابة بوسكو بارك", `
        <h1>⚽ مجمع بوسكو بارك الرياضي</h1>
        <p>النظام الذكي المتكامل لإدارة الملاعب والعمليات اليومية بسلاسة واحترافية عالية.</p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 25px 0;">
        <div class="nav-links">
            <a href="/reception" class="btn">لوحة تحكم التشغيل والاستقبال 📋</a>
            <a href="/admin" class="btn btn-admin">إدارة المنشأة والصلاحيات 🔐</a>
        </div>
    `));
});

// الاستقبال
app.get('/reception', async (req, res) => {
    const bookings = await Booking.find().sort({ createdAt: -1 }).limit(10);
    const listHtml = bookings.length ? bookings.map(b => `
        <li>
            <div>
                <strong style="color: #f8fafc; font-size: 16px;">${b.customerName}</strong> 
                <span style="color: #94a3b8; font-size: 13px;">(${b.customerPhone})</span><br>
                <span style="color: #38bdf8; font-size: 14px;">🏟️ ${b.courtName}</span> | 
                <span style="color: #cbd5e1; font-size: 14px;">📅 ${b.date} (${b.timeSlot})</span>
            </div>
            <span style="background: #0284c7; color: #fff; padding: 5px 12px; border-radius: 20px; font-size: 12px;">مؤكد</span>
        </li>
    `).join('') : '<p style="text-align: center; color: #64748b;">لا توجد حجوزات مسجلة حتى الآن.</p>';

    res.send(layout("إدارة الاستقبال", `
        <h2>📋 لوحة تحكم التشغيل والاستقبال</h2>
        <p>إدارة الحجوزات اليومية ومتابعة الملاعب المتاحة.</p>
        
        <form action="/api/bookings" method="POST" style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 25px;">
            <h3 style="color: #38bdf8; font-size: 16px; margin-bottom: 15px;">➕ تسجيل حجز جديد</h3>
            <input type="text" name="customerName" placeholder="اسم العميل" required />
            <input type="text" name="customerPhone" placeholder="رقم الهاتف (مثال: 2189xxxxxxx)" required />
            <select name="courtName">
                <option value="ملعب كرة القدم A">ملعب كرة القدم A</option>
                <option value="ملعب كرة القدم B">ملعب كرة القدم B</option>
                <option value="ملعب الباديل الرئيسي">ملعب الباديل الرئيسي</option>
            </select>
            <input type="date" name="date" required />
            <input type="text" name="timeSlot" placeholder="التوقيت (مثال: 06:00 مساءً - 07:00 مساءً)" required />
            <button type="submit" class="btn" style="width: 100%;">اعتماد وحفظ الحجز ⚽</button>
        </form>

        <h3 style="font-size: 18px; margin-bottom: 15px;">آخر الحجوزات المسجلة:</h3>
        <ul>${listHtml}</ul>
        <a href="/" class="back-link">← العودة للرئيسية</a>
    `));
});

app.post('/api/bookings', async (req, res) => {
    try {
        const { customerName, customerPhone, courtName, date, timeSlot } = req.body;
        await Booking.create({ customerName, customerPhone, courtName, date, timeSlot });
        res.redirect('/reception');
    } catch (err) {
        res.send("خطأ في معالجة الحجز: " + err.message);
    }
});

// الإدارة
app.get('/admin', async (req, res) => {
    const usersCount = await User.countDocuments();
    const bookingsCount = await Booking.countDocuments();
    const users = await User.find();
    
    const usersList = users.length ? users.map(u => `
        <li>
            <span><b>${u.name}</b> (${u.phone})</span>
            <span style="color: #e11d48; font-weight: 600;">${u.role === 'admin' ? 'مدير منشأة' : 'مشرف تشغيل'}</span>
        </li>
    `).join('') : '<p style="text-align: center; color: #64748b;">لا توجد صلاحيات مضافة حالياً.</p>';

    res.send(layout("إدارة المنشأة", `
        <h2>🔐 إدارة المنشأة والصلاحيات</h2>
        <p>التحكم في الفريق التشغيلي ومراقبة مؤشرات الأداء.</p>
        
        <div class="card-grid">
            <div class="card">
                <h3>إجمالي الطاقم الإداري</h3>
                <div class="number">${usersCount}</div>
            </div>
            <div class="card">
                <h3>إجمالي الحجوزات المسجلة</h3>
                <div class="number">${bookingsCount}</div>
            </div>
        </div>

        <form action="/api/users" method="POST" style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 25px;">
            <h3 style="color: #e11d48; font-size: 16px; margin-bottom: 15px;">➕ منح صلاحية جديدة لمستخدم</h3>
            <input type="text" name="name" placeholder="اسم المسؤول / الموظف" required />
            <input type="text" name="phone" placeholder="رقم الهاتف (واتساب)" required />
            <select name="role">
                <option value="reception">مشرف تشغيل واستقبال (Reception)</option>
                <option value="admin">مدير منشأة رئيسي (Admin)</option>
            </select>
            <button type="submit" class="btn btn-admin" style="width: 100%;">حفظ واعتماد الصلاحية 🔑</button>
        </form>

        <h3 style="font-size: 18px; margin-bottom: 15px;">قائمة أصحاب الصلاحيات:</h3>
        <ul>${usersList}</ul>
        <a href="/" class="back-link">← العودة للرئيسية</a>
    `));
});

app.post('/api/users', async (req, res) => {
    try {
        const { name, phone, role } = req.body;
        await User.findOneAndUpdate({ phone }, { name, phone, role }, { upsert: true });
        res.redirect('/admin');
    } catch (err) {
        res.send("خطأ في حفظ بيانات المستخدم: " + err.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
});
