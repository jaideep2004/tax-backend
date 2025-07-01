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
		// Create common uploads directory if user ID is not available
		if (!req.user || !req.user.userId) {
			const commonDir = path.join(uploadDir, 'common');
			if (!fs.existsSync(commonDir)) {
				fs.mkdirSync(commonDir, { recursive: true, mode: 0o755 });
			}
			return cb(null, commonDir);
		}
		
		// Create user-specific directory
		const userDir = path.join(uploadDir, req.user.userId.toString());
		if (!fs.existsSync(userDir)) {
			fs.mkdirSync(userDir, { recursive: true, mode: 0o755 });
		}
		cb(null, userDir);
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
};

const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	// limits: {
	// 	fileSize: 10 * 1024 * 1024, // 10MB limit
	// 	files: 5, // Maximum 5 files per upload
	// },
}).array("files", 5);

// Enhanced error handling middleware
const uploadMiddleware = (req, res, next) => {
	upload(req, res, function (err) {
		if (err instanceof multer.MulterError) {
			// if (err.code === "LIMIT_FILE_SIZE") {
			// 	return res.status(400).json({
			// 		message: "File size too large. Maximum size is 10MB",
			// 	});
			// }
			// if (err.code === "LIMIT_FILE_COUNT") {
			// 	return res.status(400).json({
			// 		message: "Too many files. Maximum is 5 files per upload",
			// 	});
			// }
			return res.status(400).json({
				message: `Upload error: ${err.message}`,
			});
		} else if (err) {
			return res.status(400).json({
				message: err.message || "Unknown upload error occurred",
			}); 
		}
		next();
	});
};

module.exports = uploadMiddleware;
