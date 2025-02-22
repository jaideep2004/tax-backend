const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const {
	employeeLogin,
	updateServiceStatus,
	getAssignedCustomers,
	getQueriesForEmployee,
	replyToQuery,
	updateEmployeeProfile,
	getEmployeeDash,
} = require("../controllers/employeeController");

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

module.exports = router;
