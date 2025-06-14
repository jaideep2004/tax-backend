const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const adminRoutes = require("./routes/adminRoutes");
const customerRoutes = require("./routes/customerRoutes");
const messageRoutes = require("./routes/messageRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const contactRoutes = require("./routes/contactRoutes");
const cors = require("cors");
const path = require("path");
const https = require("https");
const fs = require("fs");

dotenv.config();
connectDB();

const app = express();
app.use(cors());

app.use(express.json()); // Middleware to parse JSON
app.use("/api/admin", adminRoutes); // Admin routes
app.use("/api/customers", customerRoutes); // Customer routes
app.use("/api/messages", messageRoutes); // Message routes
app.use("/api/employees", employeeRoutes); // Employee routes
app.use("/api/contact", contactRoutes); // Contact form routes

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
	res.send("FINSHELTER backend 13 JUN!!");
});

// app.listen(PORT, () => {
// 	console.log(`Server running on port ${PORT}`);
// });

const options = {
	key: fs.readFileSync(path.join(__dirname, "certs/privkey.pem")),
	cert: fs.readFileSync(path.join(__dirname, "certs/fullchain.pem")),
};  

https.createServer(options, app).listen(PORT, () => {
	console.log(`Server running on port ${PORT} (HTTPS)`);
});
