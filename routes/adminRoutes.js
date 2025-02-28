const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const User = require("../models/userModel");
const Service = require("../models/serviceModel");

const {
	adminLogin,
	getAllUsers,
	getAllServices,
	getDashboardData,
	createService,
	activateUser,
	deactivateUser,
	createEmployee,
	deleteUser,
	// assignServiceToEmployee,
	createUser,
	updateService,
	deleteService,
	createManager,
	assignEmployeeToManager,
	updateServiceStatusByAdmin,
	getFilterOptions,
	updateDownloadAccess,
	getAllCustomerOrders,

	handleWithdrawalRequest,
	approveWithdrawal,
	assignServiceToFlexiCustomer,
	updateCustomerInfo,
	promoteToManager,
	assignOrderToEmployee,
} = require("../controllers/adminController");

// Admin login
router.post("/login", adminLogin);

// Dashboard data
router.get("/dashboard", authMiddleware, getDashboardData);

// User and Service management routes
router.get("/users", authMiddleware, getAllUsers);
router.get("/services", authMiddleware, getAllServices);
// router.get("/services", getAllServices);
router.post("/services", authMiddleware, createService);
router.put("/user/activate/:userId", authMiddleware, activateUser);
router.put("/user/deactivate/:userId", authMiddleware, deactivateUser);
router.delete("/user/:userId", authMiddleware, deleteUser);
// Employee management
router.post("/employee", authMiddleware, createEmployee);

router.post("/createUser", authMiddleware, createUser);

router.put("/services/:serviceId", authMiddleware, updateService);

router.delete("/services/:serviceId", authMiddleware, deleteService);
router.post("/manager", authMiddleware, createManager);
router.post("/assign-employee", authMiddleware, assignEmployeeToManager);
router.post("/update-download-access", updateDownloadAccess);
// router.put("/customers/:userId", updateCustomerInfo);

// In your Express routes
router.patch("/users/:userId", async (req, res) => {
	try {
		const { userId } = req.params;
		const updates = req.body;
		const user = await User.findByIdAndUpdate(userId, updates, { new: true });
		res.json(user);
	} catch (error) {
		res.status(500).json({ message: "Error updating user" });
	}
});

router.put(
	"/update-service-status/:userId",
	authMiddleware,
	updateServiceStatusByAdmin
);
router.get("/filters", authMiddleware, getFilterOptions);

router.get("/orders", authMiddleware, getAllCustomerOrders);

router.get("/withdrawal-requests", authMiddleware, handleWithdrawalRequest);
router.post("/approve-withdrawal", authMiddleware, approveWithdrawal);

router.post("/assign-service", authMiddleware, assignServiceToFlexiCustomer);

router.post("/promote-to-manager", authMiddleware, promoteToManager);
router.post("/assign-order", authMiddleware, assignOrderToEmployee);

// router.post("/users/:userId/assign-service", async (req, res) => {
// 	const { userId } = req.params;
// 	const { serviceId } = req.body;

// 	try {
// 		const user = await User.findById(userId);
// 		if (!user) return res.status(404).json({ message: "User not found" });

// 		const service = await Service.findById(serviceId); // Assuming a Service model exists
// 		if (!service) return res.status(404).json({ message: "Service not found" });

// 		user.services.push({
// 			serviceId,
// 			name: service.name,
// 			status: "In Process",
// 			activated: true,
// 			purchasedAt: new Date(),
// 		});

// 		await user.save();
// 		res.status(200).json({ message: "Service assigned successfully" });
// 	} catch (error) {
// 		res
// 			.status(500)
// 			.json({ message: "Error assigning service", error: error.message });
// 	}
// });

router.post("/users/:userId/assign-service", async (req, res) => {
	const { userId } = req.params;
	const { serviceId } = req.body;

	try {
		const user = await User.findById(userId);
		if (!user) return res.status(404).json({ message: "User not found" });

		const service = await Service.findById(serviceId);
		if (!service) return res.status(404).json({ message: "Service not found" });

		// Generate a unique orderId
		const orderId = generateOrderId(userId);

		user.services.push({
			serviceId,
			orderId, // Add the generated orderId
			name: service.name,
			status: "In Process",
			activated: true,
			purchasedAt: new Date(),
			dueDate: service.dueDate, // Include dueDate from service
			requiredDocuments: service.requiredDocuments || [], // Include required documents
			documents: [], // Initialize empty documents array
		});

		await user.save();
		res.status(200).json({
			message: "Service assigned successfully",
			orderId, // Return the orderId for confirmation
		});
	} catch (error) {
		res.status(500).json({
			message: "Error assigning service",
			error: error.message,
		});
	}
});

// Add generateOrderId function to the file (or import it from customerController)
const generateOrderId = (userId) => {
	const timestamp = Date.now();
	const shortTimestamp = timestamp.toString().slice(-4);
	const randomDigits = Math.floor(Math.random() * 1000)
		.toString()
		.padStart(3, "0");
	return `ORDER${userId}-${shortTimestamp}${randomDigits}`;
};

module.exports = router;
