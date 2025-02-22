const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");

// Manager login
const managerLogin = async (req, res) => {
	const { email, password } = req.body;

	try {
		const user = await User.findOne({ email });

		if (!user || user.role !== "manager") {
			return res
				.status(400)
				.json({ message: "Invalid credentials or not a manager" });
		}

		const { passwordHash, salt } = user;
		const hashedPassword = crypto
			.createHmac("sha256", salt)
			.update(password)
			.digest("hex");

		if (hashedPassword !== passwordHash) {
			return res.status(400).json({ message: "Invalid credentials" });
		}

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
		console.error("Error during manager login:", err);
		res.status(500).json({ message: "Error logging in" });
	}
};

// Get manager dashboard data

// const getManagerDash = async (req, res) => {
// 	const managerId = req.user._id;

// 	try {
// 		// Find manager with complete details
// 		const manager = await User.findById(managerId)
// 			.select("-passwordHash -salt")
// 			.lean();

// 		if (!manager || manager.role !== "manager") {
// 			return res.status(404).json({ message: "Manager not found" });
// 		}

// 		// Get complete employee objects with their assigned customers
// 		const employees = await User.find({
// 			_id: { $in: manager.assignedEmployees },
// 			role: "employee",
// 		})
// 			.select("-passwordHash -salt")
// 			.lean();

// 		// Get all customer IDs from all employees
// 		const allCustomerIds = employees.reduce(
// 			(acc, emp) => [...acc, ...(emp.assignedCustomers || [])],
// 			[]
// 		);

// 		// Fetch all customers with complete details
// 		const customers = await User.find({
// 			_id: { $in: allCustomerIds },
// 			role: "customer",
// 		})
// 			.select("-passwordHash -salt")
// 			.lean();

// 		// Calculate metrics
// 		let metrics = {
// 			totalEmployees: employees.length,
// 			totalCustomers: customers.length,
// 			totalServices: 0,
// 			totalQueries: 0,
// 			queryDistribution: { pending: 0, responded: 0, resolved: 0 },
// 		};

// 		// Map customers to their respective employees and calculate metrics
// 		const employeesWithDetails = employees.map((employee) => {
// 			const employeeCustomers = customers.filter((customer) =>
// 				employee.assignedCustomers?.includes(customer._id)
// 			);

// 			let employeeMetrics = {
// 				queryCount: 0,
// 				serviceCount: 0,
// 				customerCount: employeeCustomers.length,
// 			};

// 			// Calculate service and query metrics for each customer
// 			employeeCustomers.forEach((customer) => {
// 				const customerServices =
// 					customer.services?.filter(
// 						(service) => service.employeeId === employee._id
// 					) || [];

// 				employeeMetrics.serviceCount += customerServices.length;
// 				metrics.totalServices += customerServices.length;

// 				customerServices.forEach((service) => {
// 					if (service.queries) {
// 						employeeMetrics.queryCount += service.queries.length;
// 						metrics.totalQueries += service.queries.length;

// 						service.queries.forEach((query) => {
// 							metrics.queryDistribution[query.status]++;
// 						});
// 					}
// 				});
// 			});

// 			return {
// 				...employee,
// 				metrics: employeeMetrics,
// 				customers: employeeCustomers,
// 			};
// 		});

// 		const dashboardData = {
// 			managerInfo: {
// 				...manager,
// 			},
// 			metrics,
// 			employees: employeesWithDetails,
// 		};

// 		res.status(200).json({
// 			success: true,
// 			data: dashboardData,
// 		});
// 	} catch (error) {
// 		console.error("Error fetching manager dashboard:", error);
// 		res.status(500).json({
// 			success: false,
// 			message: "Error fetching manager dashboard data",
// 			error: error.message,
// 		});
// 	}
// };

const getManagerDash = async (req, res) => {
    const managerId = req.user._id;
    
    try {
        const manager = await User.findById(managerId)
            .populate({
                path: 'assignedEmployees',
                select: '-passwordHash -salt',
                populate: {
                    path: 'assignedCustomers',
                    select: '-passwordHash -salt'
                }
            })
            .lean();
            
        // Calculate metrics in a single pass
        const metrics = manager.assignedEmployees.reduce((acc, employee) => {
            const customerCount = employee.assignedCustomers?.length || 0;
            return {
                totalEmployees: acc.totalEmployees + 1,
                totalCustomers: acc.totalCustomers + customerCount,
                // Add other metrics
            };
        }, {
            totalEmployees: 0,
            totalCustomers: 0,
            // Initialize other metrics
        });

        res.status(200).json({
            success: true,
            data: {
                managerInfo: {
                    ...manager,
                    assignedEmployees: undefined // Remove sensitive data
                },
                metrics,
                employees: manager.assignedEmployees
            }
        });
    } catch (error) {
        console.error("Error fetching manager dashboard:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching manager dashboard data",
            error: error.message
        });
    }
};

// Get all assigned employees with their customers
const getAssignedEmployees = async (req, res) => {
	const managerId = req.user._id;

	try {
		const manager = await User.findById(managerId).select("assignedEmployees");

		if (!manager) {
			return res.status(404).json({ message: "Manager not found" });
		}

		const employees = await User.find({
			_id: { $in: manager.assignedEmployees },
			role: "employee",
		}).select("name email isActive assignedCustomers services L1EmpCode");

		// Get all customer details for these employees
		const allCustomerIds = employees.reduce(
			(acc, emp) => [...acc, ...emp.assignedCustomers],
			[]
		);

		const customers = await User.find({
			_id: { $in: allCustomerIds },
			role: "customer",
		}).select("name email services");

		// Map customer details to each employee
		const employeesWithCustomers = employees.map((employee) => {
			const employeeCustomers = customers.filter((customer) =>
				employee.assignedCustomers.includes(customer._id)
			);

			return {
				_id: employee._id,
				name: employee.name,
				email: employee.email,
				isActive: employee.isActive,
				L1EmpCode: employee.L1EmpCode,
				customerCount: employee.assignedCustomers.length,
				customers: employeeCustomers.map((customer) => ({
					_id: customer._id,
					name: customer.name,
					email: customer.email,
					services: customer.services.filter(
						(service) => service.employeeId === employee._id
					),
				})),
			};
		});

		res.status(200).json({
			success: true,
			employees: employeesWithCustomers,
		});
	} catch (error) {
		console.error("Error fetching assigned employees:", error);
		res.status(500).json({
			message: "Error fetching assigned employees",
			error: error.message,
		});
	}
};

const updateManagerProfile = async (req, res) => {
	const { userId } = req.user;
	const updateFields = req.body;

	try {
		const user = await User.findById(userId);
		if (!user || user.role !== "manager") {
			return res
				.status(404)
				.json({ message: "Manager not found or invalid role" });
		}

		// Define all allowed fields for manager profile update
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
			message: "Manager profile updated successfully",
			user: user.toObject({
				transform: (doc, ret) => {
					// Remove sensitive fields
					delete ret.passwordHash;
					delete ret.salt;

					// Add manager-specific metrics if they exist
					if (user.metrics) {
						ret.metrics = {
							totalEmployees: user.metrics.totalEmployees || 0,
							totalCustomers: user.metrics.totalCustomers || 0,
							totalServices: user.metrics.totalServices || 0,
						};
					}

					return ret;
				},
			}),
		});
	} catch (error) {
		console.error("Error updating manager profile:", error);
		res.status(500).json({
			message: "Error updating manager profile",
			error: error.message,
		});
	}
};

module.exports = {
	managerLogin,
	getManagerDash,
	getAssignedEmployees,
	updateManagerProfile,
};
