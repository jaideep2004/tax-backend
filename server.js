const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const connectDB = require("./config/db");
const adminRoutes = require("./routes/adminRoutes");
const customerRoutes = require("./routes/customerRoutes");
const messageRoutes = require("./routes/messageRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const contactRoutes = require("./routes/contactRoutes");
const https = require("https");

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

app.use("/uploads", (req, res, next) => {
	// Add specific CORS headers for file access
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
}, express.static(path.join(__dirname, "uploads")));

// Direct file access route for documents
app.get('/files/:filename', (req, res) => {
	const filename = req.params.filename;
	
	// First try to find the file in any subdirectory of uploads
	const findFileInDir = (dir, filename, found = []) => {
		const files = fs.readdirSync(dir);
		
		for (const file of files) {
			const filePath = path.join(dir, file);
			const stat = fs.statSync(filePath);
			
			if (stat.isDirectory()) {
				findFileInDir(filePath, filename, found);
			} else if (file === filename) {
				found.push(filePath);
			}
		}
		
		return found;
	};
	
	try {
		const uploadsDir = path.join(__dirname, 'uploads');
		const foundFiles = findFileInDir(uploadsDir, filename, []);
		
		if (foundFiles.length > 0) {
			return res.sendFile(foundFiles[0]);
		}
		
		// If file not found
		res.status(404).send('File not found');
	} catch (error) {
		console.error('Error serving file:', error);
		res.status(500).send('Error serving file');
	}
});

const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
	res.send("FINSHELTER backend 1 JULY!!");
});


//local
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
