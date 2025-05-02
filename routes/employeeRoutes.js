const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
// const roleCheck = require("../middleware/roleCheck");
const multer = require("multer");
const fs = require('fs');
const path = require('path');

const {
	employeeLogin,
	updateServiceStatus,
	getAssignedCustomers,
	getQueriesForEmployee,
	replyToQuery,
	updateEmployeeProfile,
	getEmployeeDash,
	getAssignedLeads,
	approveLead,
	rejectLead,
	uploadLeadDocuments,
	updateServiceDelayReason,
} = require("../controllers/employeeController");

// Configure multer for file uploads
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, 'uploads/temp');
	},
	filename: function (req, file, cb) {
		cb(null, Date.now() + '-' + file.originalname);
	}
});

const upload = multer({ 
	storage, 
	limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Create the temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../uploads/temp');
if (!fs.existsSync(tempDir)) {
	fs.mkdirSync(tempDir, { recursive: true });
}

router.post("/login", employeeLogin);
router.put(
	"/update-service-status/:serviceId",
	authMiddleware,
	updateServiceStatus
);
router.get("/assigned-customers", authMiddleware, getAssignedCustomers);
router.get("/queries", authMiddleware, getQueriesForEmployee);
router.put("/queries/reply", authMiddleware, replyToQuery);

router.put("/update-employee-profile", authMiddleware, updateEmployeeProfile);
router.get("/emdashboard", authMiddleware, getEmployeeDash);

// New routes for lead management
router.get("/assigned-leads", authMiddleware, getAssignedLeads);
router.post("/approve-lead/:leadId", authMiddleware, approveLead);
router.put("/leads/:leadId/reject", authMiddleware, rejectLead);
router.post("/leads/:leadId/documents", authMiddleware, upload.array('documents', 5), uploadLeadDocuments);

router.post("/update-delay-reason", authMiddleware, updateServiceDelayReason);

module.exports = router;
