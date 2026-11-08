const express = require('express');
const mongoose = require('mongoose');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();

// لتفهم البيانات القادمة من صفحة HTML مباشرة
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. الاتصال بقاعدة البيانات السحابية (MongoDB Atlas)
mongoose.connect('ضع_رابط_قاعدة_بياناتك_هنا')
    .then(() => console.log('Connected to MongoDB Atlas successfully!'))
    .catch(err => console.log('DB Error:', err));

// نموذج الحجز في قاعدة البيانات
const BookingSchema = new mongoose.Schema({
    customerName: String,
    phone: String,
    facility: String,
    date: String,
    timeSlot: String
});
const Booking = mongoose.model('Booking', BookingSchema);

// 2. إعداد واتساب (whatsapp-web.js)
const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready and connected successfully!');
});

client.initialize();

// 3. صفحة الويب البسيطة (تظهر مباشرة عند فتح الرابط)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>حجز ملاعب Bosco Park</title>
            <style>
                body { font-family: Tahoma, sans-serif; background: #f4f6f9; padding: 20px; direction: rtl; text-align: right; }
                .card { max-width: 400px; margin: 40px auto; background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                input, select, button { width: 100%; padding: 12px; margin-top: 10px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; font-size: 14px; }
                button { background: #16a34a; color: white; border: none; font-weight: bold; cursor: pointer; }
                button:hover { background: #15803d; }
                h2 { text-align: center; color: #333; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>⚽ حجز Bosco Park</h2>
                <form action="/api/bookings" method="POST">
                    <label>الاسم بالكامل:</label>
                    <input type="text" name="customerName" required placeholder="أدخل اسمك">

                    <label>رقم الهاتف (مع رمز الدولة):</label>
                    <input type="text" name="phone" required placeholder="2189xxxxxxxx">

                    <label>اختر الملعب:</label>
                    <select name="facility">
                        <option value="Pitch 1">ملعب كرة قدم 1</option>
                        <option value="Pitch 2">ملعب كرة قدم 2</option>
                    </select>

                    <label>التاريخ:</label>
                    <input type="date" name="date" required>

                    <label>التوقيت:</label>
                    <select name="timeSlot">
                        <option value="18:00 - 19:00">06:00 مساءً - 07:00 مساءً</option>
                        <option value="20:00 - 21:00">08:00 مساءً - 09:00 مساءً</option>
                    </select>

                    <button type="submit">تأكيد الحجز الآن</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// 4. استقبال الحجز من الزبون وإرسال رسالة الواتساب
app.post('/api/bookings', async (req, res) => {
    try {
        const { customerName, phone, facility, date, timeSlot } = req.body;

        // حفظ الحجز في MongoDB
        const newBooking = new Booking({ customerName, phone, facility, date, timeSlot });
        await newBooking.save();

        // إرسال رسالة الواتساب تلقائياً للزبون
        const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
        const whatsappMessage = `مرحباً ${customerName}، تم تأكيد حجزك في Bosco Park بنجاح! ⚽\nالملعب: ${facility}\nالتاريخ: ${date}\nالوقت: ${timeSlot}`;
        await client.sendMessage(chatId, whatsappMessage);

        res.send(`
            <html dir="rtl" style="font-family: Tahoma; text-align: center; padding-top: 50px;">
                <h1 style="color: #16a34a;">✅ تم الحجز بنجاح!</h1>
                <p>تم حفظ حجزك وإرسال تفاصيله إلى رقم واتساب الخاص بك فوراً.</p>
                <a href="/" style="color: #0284c7; text-decoration: none; font-weight: bold;">حجز ملعب آخر</a>
            </html>
        `);
    } catch (err) {
        console.error(err);
        res.status(500).send('❌ حدث خطأ أثناء إتمام الحجز.');
    }
});

app.listen(3000, () => {
    echo = 'Server is running on port: 3000';
    console.log(echo);
});