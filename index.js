const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // add your API key

require("./db");
const Message = require("./models/message");

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("Bot is ready!");
});

client.on("message_create", async message => {

    try {

        if (!message || !message.from) return;

        // ---------- SAFE CONTACT ----------
        let contactName = "Unknown Sender";

        try {
            const contact = await message.getContact();
            contactName = contact.pushname || contact.number || "Unknown Sender";
        } catch (err) {
            console.log("Contact read error");
        }

        // ---------- SAFE CHAT ----------
        let chatName = "Unknown Chat";

        try {
            const chat = await message.getChat();
            chatName = chat.name || "Private Chat";
        } catch (err) {
            console.log("Chat read error");
        }

        // ---------- PDF DOWNLOAD ----------
        let pdfPath = null;
        let isPdf = false;

        if (message.hasMedia) {

            const media = await message.downloadMedia();

            if (media && media.mimetype === "application/pdf") {

                const fileName = Date.now() + ".pdf";
                pdfPath = "./downloads/pdfs/" + fileName;

                fs.writeFileSync(
                    pdfPath,
                    media.data,
                    { encoding: "base64" }
                );

                isPdf = true;

                console.log("PDF saved:", fileName);
            }
        }

        // ---------- SAVE MESSAGE ----------
        const msgData = new Message({
            sender: contactName,
            chat: chatName,
            body: message.body || "",
            timestamp: new Date(),
            isPdf: isPdf,
            filePath: pdfPath
        });

        await msgData.save();

        console.log("Message saved:", message.body);

        // ---------- SEARCH ALL MESSAGES ----------
        if ((message.body || "").toLowerCase().startsWith("bot find ")) {

            const keyword = message.body.replace(/bot find/i, "").trim();

            const results = await Message.find({
                body: { $regex: keyword, $options: "i" }
            }).limit(5);

            if (results.length === 0) {
                message.reply("No messages found.");
                return;
            }

            let reply = "Found messages:\n\n";

            results.forEach(r => {

                const date = new Date(r.timestamp).toLocaleString();

                reply += `👤 ${r.sender}
💬 ${r.body}
📍 Chat: ${r.chat}
🕒 ${date}

`;
            });

            message.reply(reply);
        }

        // ---------- SEARCH ONLY MY MESSAGES ----------
        if ((message.body || "").toLowerCase().startsWith("bot my")) {

            const keyword = message.body.replace(/bot my/i, "").trim();

            const results = await Message.find({
                sender: contactName,
                body: { $regex: keyword, $options: "i" }
            }).limit(5);

            if (results.length === 0) {
                message.reply("No messages found from you.");
                return;
            }

            let reply = "Your messages:\n\n";

            results.forEach(r => {

                const date = new Date(r.timestamp).toLocaleString();

                reply += `💬 ${r.body}
📍 Chat: ${r.chat}
🕒 ${date}

`;
            });

            message.reply(reply);
        }

        // ---------- FIND PDF ----------
        if ((message.body || "").toLowerCase().startsWith("bot find pdf")) {

            const keyword = message.body.replace(/bot find pdf/i, "").trim();

            let pdf = await Message.findOne({
                isPdf: true,
                body: { $regex: keyword, $options: "i" }
            });

            if (!pdf) {
                pdf = await Message.findOne({ isPdf: true }).sort({ timestamp: -1 });
            }

            if (!pdf) {
                message.reply("No PDF found.");
                return;
            }

            const media = MessageMedia.fromFilePath(pdf.filePath);

            message.reply(media, undefined, {
                caption: `📄 PDF found from ${pdf.sender}`
            });
        }

        // ---------- AI SEARCH INSIDE PDF ----------
        if ((message.body || "").toLowerCase().startsWith("bot ai pdf")) {

            const question = message.body.replace(/bot ai pdf/i, "").trim();

            let pdf = await Message.findOne({
                isPdf: true,
                body: { $regex: question, $options: "i" }
            });

            if (!pdf) {
                pdf = await Message.findOne({ isPdf: true }).sort({ timestamp: -1 });
            }

            if (!pdf) {
                message.reply("No PDF found in database.");
                return;
            }

            const dataBuffer = fs.readFileSync(pdf.filePath);

            const pdfData = await pdfParse(dataBuffer);

            const text = pdfData.text.slice(0, 12000);

            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash"
            });

            const prompt = `
The following text is from a PDF:

${text}

Answer this question based on the PDF:
${question}
`;

            const result = await model.generateContent(prompt);
            const response = result.response.text();

            message.reply(response);
        }

        // ---------- AI MESSAGE ANALYSIS ----------
        if ((message.body || "").toLowerCase().startsWith("bot ai")) {

            const question = message.body.replace(/bot ai/i, "").trim();

            const messages = await Message.find()
                .sort({ timestamp: -1 })
                .limit(30);

            let context = "";

            messages.forEach(m => {
                context += `${m.sender}: ${m.body}\n`;
            });

            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash"
            });

            const prompt = `
These are WhatsApp messages:

${context}

Answer this question based on the messages:
${question}
`;

            const result = await model.generateContent(prompt);
            const response = result.response.text();

            message.reply(response);
        }

    } catch (err) {
        console.error("Error processing message:", err);
    }

});

client.initialize();



