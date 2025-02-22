const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const User = require("../models/userModel");

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

module.exports = router;
