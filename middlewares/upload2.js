// uploadMiddleware.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sanitizeFilename = require("sanitize-filename");

// Create uploads directory with proper permissions
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
}

// Enhanced storage configuration
const storage = multer.diskStorage({ 
	destination: function (req, file, cb) {
		// Get userId from authenticated user, supporting both formats
		const userId = req.user?.userId || req.user?._id;
		if (!userId) {
			return cb(new Error("User ID is required"));
		}

		// Create user-specific directory
		const userDir = path.join(uploadDir, userId.toString());
		if (!fs.existsSync(userDir)) {
			fs.mkdirSync(userDir, { recursive: true, mode: 0o755 });
		}

		// Create service-specific subdirectory
		const serviceDir = path.join(userDir, req.body.serviceId);
		if (!fs.existsSync(serviceDir)) {
			fs.mkdirSync(serviceDir, { recursive: true, mode: 0o755 });
		}

		cb(null, serviceDir);
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
		const ext = path.extname(file.originalname);
		const sanitizedBaseName = sanitizeFilename(
			path.basename(file.originalname, ext)
		);
		cb(null, `${sanitizedBaseName}-${uniqueSuffix}${ext}`);
	},
});

// Enhanced file filter with better error messages
const fileFilter = (req, file, cb) => {
	const allowedTypes = [
		"image/jpeg",
		"image/png",
		"image/gif",
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	];

	if (allowedTypes.includes(file.mimetype)) {
		cb(null, true);
	} else {
		cb(
			new Error(
				`Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, GIF, PDF, DOC, DOCX`
			)
		);
	}
};

// Configure multer with enhanced settings
const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit
		files: 5, // Maximum 5 files per upload
	},
});

// Updated upload middleware configuration
const uploadMiddleware2 = multer({
	storage: multer.diskStorage({
		destination: function (req, file, cb) {
			const uploadDir = path.join(__dirname, "../uploads");
			if (!fs.existsSync(uploadDir)) {
				fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
			}
			
			// Store files in a consistent location
			// Optionally create customer-specific folders
			const customerId = req.body.userId || 'common';
			const customerDir = path.join(uploadDir, customerId.toString());
			if (!fs.existsSync(customerDir)) {
				fs.mkdirSync(customerDir, { recursive: true, mode: 0o755 });
			}
			
			cb(null, customerDir);
		},
		filename: function (req, file, cb) {
			const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
			const sanitizedName = sanitizeFilename(
				path.basename(file.originalname, path.extname(file.originalname))
			);
			cb(
				null,
				`${sanitizedName}-${uniqueSuffix}${path.extname(file.originalname)}`
			);
		}
	}),
	fileFilter: (req, file, cb) => {
		const allowedTypes = [
			"image/jpeg",
			"image/png",
			"image/gif",
			"application/pdf",
		];
		if (allowedTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(
				new Error(
					`Invalid file type: ${file.mimetype}. Only JPEG, PNG, GIF images and PDFs are allowed.`
				)
			);
		}
	},
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit
		files: 5, // Maximum 5 files per upload
	},
}).array("files", 5);

module.exports = uploadMiddleware2;
