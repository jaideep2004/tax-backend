const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
// const roleCheck = require("../middleware/roleCheck");
const multer = require("multer");
const fs = require('fs');
const path = require('path');
const User = require("../models/userModel");
const { sendEmail } = require("../utils/emailUtils");

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
	sendOrderForL1Review,
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
router.post("/update-service-status", authMiddleware, updateServiceStatus);
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

// L1 Review routes
router.get("/pending-l1-reviews", authMiddleware, async (req, res) => {
	try {
		const employeeId = req.user._id;
		
		// Find all customers with services that have status 'pending-l1-review'
		const customers = await User.find({
			role: "customer",
			"services.status": "pending-l1-review"
		}); 
		
		// Filter services that should be reviewed by this employee
		const pendingReviews = [];
		
		for (const customer of customers) {
			for (const service of customer.services) {
				if (service.status === 'pending-l1-review' && service.employeeId) {
					// Find the employee who sent this for review
					const serviceEmployee = await User.findById(service.employeeId);
					
					// Check if the current employee is the L1 for this employee
					if (serviceEmployee && serviceEmployee.L1EmpCode === employeeId.toString()) {
						pendingReviews.push({
							orderId: service.orderId,
							serviceName: service.packageName || service.serviceId,
							customerId: customer._id,
							serviceId: service._id,
							employeeId: service.employeeId,
							employeeName: serviceEmployee.name || "Unknown",
							sentForReviewAt: service.sentForReviewAt || new Date(),
							documents: service.documents || []
						});
					}
				}
			}
		}

		res.json({ success: true, pendingReviews });
	} catch (error) {
		console.error("Error fetching pending L1 reviews:", error);
		res.status(500).json({ success: false, message: "Error fetching pending reviews" });
	}
});

router.post("/complete-l1-review", authMiddleware, async (req, res) => {
	try {
		const { orderId, decision, customerId, serviceId } = req.body;
		const l1EmployeeId = req.user._id;

		// Find the customer and service
		const customer = await User.findOne({
			_id: customerId,
			"services.orderId": orderId
		});

		if (!customer) {
			return res.status(404).json({
				success: false,
				message: "Order not found"
			});
		}

		const serviceIndex = customer.services.findIndex(s => s.orderId === orderId);
		if (serviceIndex === -1) {
			return res.status(404).json({
				success: false,
				message: "Service not found"
			});
		}

		// Get the employee who sent this for review
		const employeeId = customer.services[serviceIndex].employeeId;
		const employee = await User.findById(employeeId);
		
		// Verify this L1 employee is actually the supervisor for this employee
		if (!employee || employee.L1EmpCode !== l1EmployeeId.toString()) {
			return res.status(403).json({
				success: false,
				message: "You are not authorized to review this order"
			});
		}

		// Update the service based on decision
		if (decision === 'approved') {
			customer.services[serviceIndex].status = "completed";
			customer.services[serviceIndex].completedAt = new Date();
		} else {
			customer.services[serviceIndex].status = "in-process";
			customer.services[serviceIndex].l1ReviewNotes = "Sent back for revision";
		}

		await customer.save();

		// Send notification to the original employee
		if (employee.email) {
			try {
				await sendEmail(
					employee.email,
					`Order Review ${decision === 'approved' ? 'Approved' : 'Needs Revision'}`,
					`Hello ${employee.name},\n\nThe order #${orderId} has been ${decision === 'approved' ? 'approved' : 'sent back for revision'} by your L1.${
						decision === 'approved' ? '' : '\n\nPlease check the order and make necessary revisions.'
					}`
				);
			} catch (emailError) {
				console.error("Error sending notification email:", emailError);
				// Continue execution even if email fails
			}
		}

		res.json({
			success: true,
			message: `Order ${decision === 'approved' ? 'approved' : 'sent back for revision'} successfully`
		});

	} catch (error) {
		console.error("Error completing L1 review:", error);
		res.status(500).json({
			success: false,
			message: "Error completing review",
			error: error.message
		});
	}
});

router.post("/send-for-l1-review", authMiddleware, sendOrderForL1Review);

router.get("/profile", authMiddleware, async (req, res) => {
	try {
		const employee = await User.findById(req.user._id);
		if (!employee) {
			return res.status(404).json({
				success: false,
				message: "Employee not found"
			});
		}

		res.json({
			success: true,
			isL1Employee: Boolean(employee.isL1Employee),
			name: employee.name,
			email: employee.email
		});
	} catch (error) {
		console.error("Error fetching employee profile:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching profile"
		});
	}
});

// Add route for employee to view documents
router.get('/documents/:filename', (req, res) => {
	try {
		const filename = req.params.filename;
		// Search in common upload paths
		const possiblePaths = [
			path.join(__dirname, '../uploads', filename),
			// Add other possible paths where documents might be stored
		];
		
		// Find the first path that exists
		for (const filePath of possiblePaths) {
			if (fs.existsSync(filePath)) {
				return res.sendFile(filePath);
			}
		}
		
		// If file not found
		res.status(404).send('Document not found');
	} catch (error) {
		console.error('Error serving document:', error);
		res.status(500).send('Error serving document');
	}
});

module.exports = router;
