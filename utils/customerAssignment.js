require("dotenv").config();
const User = require("../models/userModel");
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
	service: "gmail", // Use your email service provider
	auth: {
		user: process.env.EMAIL_USER, // Your email address
		pass: process.env.EMAIL_PASS, // Your email app-specific password
	},
});

const sendEmail = async (to, subject, text) => {
	try {
		await transporter.sendMail({
			from: process.env.EMAIL_USER,
			to,
			subject,
			text,
		});
		console.log(`Email sent to ${to}`);
	} catch (error) {
		console.error(`Failed to send email to ${to}:`, error);
	}
};

// Utility function to handle customer-employee assignments
const handleCustomerEmployeeAssignment = async (
	customer,
	serviceId,
	employee = null
) => {
	try {
		// If no employee provided, try to find one for this service
		if (!employee) {
			employee = await User.findOne({ role: "employee", serviceId });
		}

		if (!employee) {
			return { success: false, message: "No employee available" };
		}

		// Find the service in customer's services array
		const serviceIndex = customer.services.findIndex(
			(service) => service.serviceId.toString() === serviceId.toString()
		);

		if (serviceIndex === -1) {
			return { success: false, message: "Service not found for customer" };
		}

		// Update customer's service with employee
		customer.services[serviceIndex].employeeId = employee._id;
		await customer.save();

		// Get the full customer object to store
		const customerToStore = {
			_id: customer._id,
			name: customer.name,
			email: customer.email,
			mobile: customer.mobile,
			username: customer.username,
			role: customer.role,
			isActive: customer.isActive,
			isProfileComplete: customer.isProfileComplete,
			services: customer.services.map((service) => ({
				orderId: service.orderId,
				serviceId: service.serviceId,
				activated: service.activated,
				purchasedAt: service.purchasedAt,
				status: service.status,
				dueDate: service.dueDate,
				documents: service.documents,
				queries: service.queries,
				feedback: service.feedback,
				employeeId: service.employeeId,
			})),
			paymentHistory: customer.paymentHistory,
		};

		// Check if customer already exists in employee's assigned customers
		const existingCustomerIndex = employee.assignedCustomers.findIndex(
			(assigned) => assigned._id.toString() === customer._id.toString()
		);

		if (existingCustomerIndex === -1) {
			// Add new customer object to employee's assigned customers
			employee.assignedCustomers.push(customerToStore);
		} else {
			// Update existing customer object
			employee.assignedCustomers[existingCustomerIndex] = customerToStore;
		}

		await employee.save();

		// Send notification emails
		await Promise.all([
			sendEmail(
				customer.email,
				"Employee Assigned",
				`Hello ${customer.name},\n\nAn employee has been assigned to assist you with your service.\n\nEmployee Name: ${employee.name}\nEmployee Email: ${employee.email}`
			),
			sendEmail(
				employee.email,
				"New Customer Assigned",
				`A new customer has been assigned to you.\n\nCustomer Name: ${customer.name}\nCustomer Email: ${customer.email}`
			),
		]);

		return { success: true, employee };
	} catch (error) {
		console.error("Error in handleCustomerEmployeeAssignment:", error);
		return { success: false, message: error.message };
	}
};

// Function to reassign unassigned customers for a service
const assignUnassignedCustomers = async (serviceId, employee) => {
	try {
		const unassignedCustomers = await User.find({
			role: "customer",
			services: {
				$elemMatch: {
					serviceId: serviceId,
					employeeId: { $exists: false },
				},
			},
		});

		const assignments = [];
		for (const customer of unassignedCustomers) {
			const result = await handleCustomerEmployeeAssignment(
				customer,
				serviceId,
				employee
			);
			assignments.push({
				customer: {
					_id: customer._id,
					name: customer.name,
					email: customer.email,
					services: customer.services,
				},
				success: result.success,
				message: result.success ? "Assigned successfully" : result.message,
			});
		}

		return assignments;
	} catch (error) {
		console.error("Error in assignUnassignedCustomers:", error);
		throw error;
	}
};

module.exports = {
	handleCustomerEmployeeAssignment,
	assignUnassignedCustomers,
};
