const mongoose = require("mongoose");

mongoose.connect("mongodb://127.0.0.1:27017/whatsappBot");

const db = mongoose.connection;

db.on("error", (err) => {
    console.log("MongoDB connection error:", err);
});

db.once("open", () => {
    console.log("MongoDB connected successfully");
});