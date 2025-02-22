const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const Service = require("../models/serviceModel");
const Message = require("../models/messageModel");

// Utility: Hash password using SHA-256
const hashPassword = (password, salt) => {
	const hash = crypto.createHmac("sha256", salt);
	hash.update(password);
	return hash.digest("hex");
};

// Employee login
const employeeLogin = async (req, res) => {
	const { email, password } = req.body;

	try {
		const user = await User.findOne({ email });

		if (!user || user.role !== "employee") {
			return res
				.status(400)
				.json({ message: "Invalid credentials or not an employee" });
		}

		const { passwordHash, salt } = user;
		const hashedPassword = hashPassword(password, salt);

		if (hashedPassword !== passwordHash) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

		// Include additional fields in the token payload
		const token = jwt.sign(
			{
				_id: user._id,
				role: user.role,
				name: user.name,
				email: user.email,
			},
			process.env.JWT_SECRET,
			{ expiresIn: "12h" }
		);

		res.json({ token });
	} catch (err) {
		console.error("Error during employee login:", err);
		res.status(500).json({ message: "Error logging in" });
	}
};

// const getEmployeeDash = async (req, res) => {
// 	const employeeId = req.user._id; // Get employee ID from JWT token

// 	try {
// 		// Find employee and populate relevant data
// 		const employee = await User.findById(employeeId).select([
// 			"_id",
// 			"name",
// 			"email",
// 			"username",
// 			"role",
// 			"isActive",
// 			"assignedCustomers",
// 			"isProfileComplete",
// 			"L1EmpCode",
// 			"L1Name",
// 			"L2Empcode",
// 			"createdAt",
// 			"updatedAt",
// 			"downloadAccess",
// 			"serviceId",
// 			"phoneNumber",
// 		]);

// 		if (!employee || employee.role !== "employee") {
// 			return res.status(404).json({ message: "Employee not found" });
// 		}

// 		// Get assigned customers
// 		const assignedCustomers = await User.find({
// 			_id: { $in: employee.assignedCustomers },
// 			role: "customer",
// 		}).select("services");

// 		// Calculate assigned customer count
// 		const customerCount = assignedCustomers?.length;

// 		// Calculate total queries and their status distribution
// 		// Calculate total queries and status distribution
// 		let totalQueries = 0;
// 		let queryStats = { pending: 0, responded: 0, resolved: 0 };
// 		let serviceDueDates = [];

// 		assignedCustomers.forEach((customer) => {
// 			customer.services.forEach((service) => {
// 				if (service.queries) {
// 					service.queries.forEach((query) => {
// 						totalQueries++;
// 						queryStats[query.status]++;
// 					});
// 				}

// 				// Add due date for matching services
// 				if (service.dueDate) {
// 					serviceDueDates.push({
// 						customerId: customer._id,
// 						serviceId: service.serviceId,
// 						dueDate: service.dueDate,
// 					});
// 				}
// 			});
// 		});

// 		// Get active services count for assigned customers
// 		const activeServicesCount = assignedCustomers.reduce((total, customer) => {
// 			return (
// 				total + customer.services.filter((service) => service.activated).length
// 			);
// 		}, 0);

// 		// Create dashboard response object
// 		const dashboardData = {
// 			employeeInfo: {
// 				id: employee._id,
// 				name: employee.name,
// 				email: employee.email,
// 				username: employee.username,
// 				isActive: employee.isActive,
// 				isProfileComplete: employee.isProfileComplete,
// 				L1EmpCode: employee.L1EmpCode,
// 				L1Name: employee.L1Name,
// 				L2Empcode: employee.L2Empcode,
// 				joinedAt: employee.createdAt,
// 				downloadAccess: employee.downloadAccess,
// 				serviceId: employee.serviceId,
// 				phoneNumber: employee.phoneNumber,
// 			},
// 			metrics: {
// 				totalAssignedCustomers: customerCount,
// 				activeServicesCount,
// 				totalQueries,
// 				queryDistribution: queryStats,
// 				serviceDueDates,
// 			},
// 			status: {
// 				accountStatus: employee.isActive ? "Active" : "Inactive",
// 				profileStatus: employee.isProfileComplete ? "Complete" : "Incomplete",
// 			},
// 		};

// 		res.status(200).json({
// 			success: true,
// 			data: dashboardData,
// 		});
// 	} catch (error) {
// 		console.error("Error fetching employee dashboard:", error);
// 		res.status(500).json({
// 			success: false,
// 			message: "Error fetching employee dashboard data",
// 			error: error.message,
// 		});
// 	}
// };

const getEmployeeDash = async (req, res) => {
	try {
		const employeeId = req.user._id; // Assuming this comes from auth middleware

		// Fetch complete employee information with populated references
		const employeeInfo = await User.findById(employeeId)
			.populate({
				path: "assignedCustomers",
				select: "-passwordHash -salt", // Exclude sensitive information
			})
			.populate({
				path: "serviceId",
				select: "name description price", // Add relevant service fields
			})
			.populate({
				path: "L1EmpCode",
				select: "name email", // Add relevant manager fields
			})
			.populate("services")
			.populate("paymentHistory")
			.lean();

		// Fetch metrics (customize based on your requirements)
		const metrics = {
			totalCustomers: employeeInfo.assignedCustomers.length,
			activeCustomers: employeeInfo.assignedCustomers.filter((c) => c.isActive)
				.length,
			completedServices: employeeInfo.services.filter(
				(s) => s.status === "completed"
			).length,
			// Add other relevant metrics
		};

		// Fetch status information
		const status = {
			isActive: employeeInfo.isActive,
			isProfileComplete: employeeInfo.isProfileComplete,
			lastLogin: employeeInfo.lastLogin,
			// Add other status fields
		};

		res.status(200).json({
			success: true,
			data: {
				employeeInfo,
				metrics,
				status,
			},
		});
	} catch (error) {
		console.error("Employee Dashboard Error:", error);
		res.status(500).json({
			success: false,
			message: "Error fetching employee dashboard",
			error: error.message,
		});
	}
};

const getAssignedCustomers = async (req, res) => {
	const employeeId = req.user._id; // Extract employee ID from JWT

	try {
		// Find the employee's assigned customers
		const employee = await User.findById(employeeId).select(
			"assignedCustomers"
		);

		if (!employee) {
			return res.status(404).json({ message: "Employee not found" });
		}

		const assignedCustomerIds = employee.assignedCustomers;

		if (!assignedCustomerIds || assignedCustomerIds.length === 0) {
			return res
				.status(200)
				.json({ message: "No customers assigned to this employee" });
		}

		// Fetch customers with their services assigned to this employee
		const customers = await User.find({
			_id: { $in: assignedCustomerIds },
			role: "customer",
		}).select("name email services");

		// Filter services for the current employee and include orderId
		const filteredCustomers = customers
			.map((customer) => {
				const relevantServices = customer.services.filter(
					(service) => service.employeeId?.toString() === employeeId.toString()
				);

				if (relevantServices.length > 0) {
					return {
						_id: customer._id,
						name: customer.name,
						email: customer.email,
						services: relevantServices.map((service) => ({
							orderId: service.orderId, // Include orderId
							serviceId: service.serviceId,
							activated: service.activated,
							purchasedAt: service.purchasedAt,
							status: service.status,
							dueDate: service.dueDate,
						})),
					};
				}
				return null;
			})
			.filter((customer) => customer !== null); // Remove null entries

		if (filteredCustomers.length === 0) {
			return res.status(200).json({
				message:
					"No customers assigned to this employee with relevant services.",
			});
		}

		return res
			.status(200)
			.json({ success: true, customers: filteredCustomers });
	} catch (error) {
		console.error("Error fetching assigned customers:", error);
		res.status(500).json({
			message: "Error fetching assigned customers.",
			error: error.message,
		});
	}
};

const updateServiceStatus = async (req, res) => {
	const { serviceId } = req.params; // serviceId of the service to update
	const { status } = req.body;
	const { customerId } = req.body; // Add customerId from the body

	try {
		// Validate the status input
		if (!["completed", "in-process", "rejected"].includes(status)) {
			return res.status(400).json({ message: "Invalid status" });
		}

		// Find and update the service within the user's services array for a specific customer
		const customer = await User.findOneAndUpdate(
			{ _id: customerId, "services.serviceId": serviceId }, // Match by customerId and serviceId
			{ $set: { "services.$.status": status } }, // Update the status of the specific service in the array
			{ new: true }
		);

		if (!customer) {
			return res.status(404).json({ message: "Customer or service not found" });
		}

		// Return the updated service status
		const updatedService = customer.services.find(
			(service) => service.serviceId === serviceId
		);
		res.json({
			message: `Service status updated to ${status}`,
			service: updatedService,
		});
	} catch (err) {
		console.error("Error updating service status:", err);
		res.status(500).json({ message: "Error updating service status" });
	}
};

const getQueriesForEmployee = async (req, res) => {
	try {
		const employeeId = req.user._id; // Employee ID from JWT token

		// Fetch the employee's assigned customers
		const employee = await User.findById(employeeId).select(
			"assignedCustomers"
		);
		if (!employee || !employee.assignedCustomers?.length) {
			return res.status(404).json({
				message: "No assigned customers found for this employee.",
			});
		}

		// Fetch customers and their services
		const assignedCustomers = await User.find({
			_id: { $in: employee.assignedCustomers },
			role: "customer",
		}).select("services name email"); // Added name and email for context

		if (!assignedCustomers.length) {
			return res.status(404).json({
				message: "No services found for assigned customers.",
			});
		}

		// Extract queries only for services managed by the employee
		const queries = [];
		assignedCustomers.forEach((customer) => {
			if (!customer.services) return; // Skip if no services

			customer.services.forEach((service) => {
				// Check if the service has queries and is assigned to this employee
				if (
					service.queries?.length &&
					(service.employeeId === employeeId.toString() ||
						(service.employeeId &&
							service.employeeId.toString() === employeeId.toString()))
				) {
					queries.push(
						...service.queries.map((query) => ({
							...query.toObject(), // Convert to plain object
							customerId: customer._id,
							customerName: customer.name,
							customerEmail: customer.email,
							serviceId: service.serviceId,
							serviceName: service.serviceName,
							orderId: service.orderId,
						}))
					);
				}
			});
		});

		if (queries.length === 0) {
			return res.status(404).json({
				message: "No queries found for assigned services.",
			});
		}

		// Sort queries by creation date (newest first)
		queries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

		return res.status(200).json({
			success: true,
			count: queries.length,
			queries,
		});
	} catch (error) {
		console.error("Error fetching queries for employee:", error);
		res.status(500).json({
			success: false,
			message: "Server error.",
			error: error.message,
		});
	}
};

const replyToQuery = async (req, res) => {
	const { queryId, response, employeeId } = req.body;

	console.log("Received request to reply to query:", {
		queryId,
		response,
		employeeId,
	});

	try {
		const customer = await User.findOne({ "services.queries._id": queryId });
		console.log("Customer found:", customer);

		if (!customer) {
			console.error("Customer not found for query ID:", queryId);
			return res.status(404).json({ message: "Customer not found" });
		}

		const updatedCustomer = await User.updateOne(
			{ "services.queries._id": queryId },
			{
				$push: {
					"services.$.queries.$[query].replies": {
						employeeId,
						response,
						createdAt: new Date(),
					},
				},
				$set: {
					"services.$.queries.$[query].status": "responded",
				},
			},
			{
				arrayFilters: [{ "query._id": queryId }],
			}
		);

		console.log("Update operation result:", updatedCustomer);

		if (updatedCustomer.modifiedCount > 0) {
			console.log("Reply added successfully for query ID:", queryId);
			return res.json({ message: "Reply added successfully" });
		} else {
			console.error("Failed to add the reply for query ID:", queryId);
			return res.status(500).json({ message: "Failed to add reply" });
		}
	} catch (err) {
		console.error("Error replying to query:", err);
		return res.status(500).json({ message: "Server error." });
	}
};

const updateEmployeeProfile = async (req, res) => {
	const { userId } = req.user;
	const updateFields = req.body;

	try {
		const user = await User.findById(userId);
		if (!user || user.role !== "employee") {
			return res
				.status(404)
				.json({ message: "Employee not found or invalid role" });
		}

		// Define all allowed fields for employee profile update
		const allowedFields = [
			// Basic Profile

			"fullName",
			"email",
			"phoneNumber",
			"dob",
			"gender",
			"dateOfJoining",
			"designation",
			"servicesHandled",
			"L1EmpCode",
			"L1Name",
			"L2EmpCode",
			"L2Name",
			"employeeStatus",
			"reasonForLeaving",
			"currentOrgRelieveDate",

			// Tax Info
			"pan",
			"gst",
			"tan",

			// Communication Info
			"fulladdress",
			"city",
			"state",
			"country",
			"postalCode",

			// Professional Info
			"positionCode",
			"positionDescription",
			"payrollArea",
			"departmentCode",
			"departmentName",

			// Employment Info
			"previousOrganization",
			"previousOrgFromDate",
			"previousOrgToDate",
			"totalExperience",

			// Education Info
			"educationQualification",
			"university",
			"passingMonthYear",
			"certifications",
		];

		// Update allowed fields
		allowedFields.forEach((field) => {
			if (updateFields[field] !== undefined) {
				user[field] = updateFields[field];
			}
		});

		// Check if the profile is complete
		const requiredFields = [
			"fullName",
			"email",
			"phoneNumber",
			"dateOfJoining",
			"designation",
			"L1EmpCode",
			"L1Name",
			"pan",
		];

		user.isProfileComplete = requiredFields.every((field) => user[field]);

		// Validate dates if provided
		const dateFields = [
			"dob",
			"dateOfJoining",
			"currentOrgRelieveDate",
			"previousOrgFromDate",
			"previousOrgToDate",
			"passingMonthYear",
		];

		dateFields.forEach((field) => {
			if (updateFields[field]) {
				try {
					user[field] = new Date(updateFields[field]);
				} catch (error) {
					console.error(`Invalid date format for ${field}`);
				}
			}
		});

		// Handle arrays
		if (
			updateFields.servicesHandled &&
			Array.isArray(updateFields.servicesHandled)
		) {
			user.servicesHandled = updateFields.servicesHandled;
		}

		await user.save();

		// Send success response with updated user data
		res.status(200).json({
			message: "Employee profile updated successfully",
			user: user.toObject({
				transform: (doc, ret) => {
					delete ret.passwordHash;
					delete ret.salt;
					return ret;
				},
			}),
		});
	} catch (error) {
		console.error("Error updating employee profile:", error);
		res.status(500).json({
			message: "Error updating employee profile",
			error: error.message,
		});
	}
};

module.exports = {
	updateServiceStatus,
	getAssignedCustomers,
	employeeLogin,
	getQueriesForEmployee,
	replyToQuery,
	updateEmployeeProfile,
	getEmployeeDash,
};
