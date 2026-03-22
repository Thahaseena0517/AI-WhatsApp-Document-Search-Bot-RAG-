const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    sender: String,
    chat: String,
    body: String,
    timestamp: Date,
    isPdf: Boolean,
    filePath: String
});

module.exports = mongoose.model("Message", messageSchema);