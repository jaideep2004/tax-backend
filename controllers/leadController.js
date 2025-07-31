const Lead = require("../models/leadModel");
const Service = require("../models/serviceModel");
const User = require("../models/userModel"); // Import User model
const sendZeptoMail = require("../utils/sendZeptoMail");

// Create a new lead from the service inquiry form
const createLead = async (req, res) => {
    const { name, email, mobile, serviceId, message, source = "website" } = req.body;

    try {
        // Validate required fields
        if (!name || !email || !mobile || !serviceId) {
            return res.status(400).json({ 
                success: false,  
                message: "Missing required fields" 
            });
        }

        // Check if service exists
        const service = await Service.findById(serviceId);
        if (!service) {
            return res.status(404).json({ 
                success: false, 
                message: "Service not found" 
            });
        }

        // Check if lead with the same email already exists
        const existingLead = await Lead.findOne({ email });
        if (existingLead) {
            return res.status(400).json({
                success: false,
                message: "A lead with this email already exists. Our team will contact you soon."
            });
        }

        // Only block duplicate-user leads for guests (no req.user)
        if (!req.user) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: "An account with this email already exists. Please login to your account to request services."
                });
            }
        }

        // Create new lead
        const newLead = new Lead({
            name,
            email,
            mobile,
            serviceId, 
            message,
            source,
            status: "new"
        });

        await newLead.save();

        // Send email notification to admin
        try {
            await sendZeptoMail({
                to: process.env.ADMIN_EMAIL,
                subject: "New Service Inquiry Lead",
                html: `
                    <h2>New Service Inquiry Lead</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Mobile:</strong> ${mobile}</p>
                    <p><strong>Service:</strong> ${service.name}</p>
                    <p><strong>Message:</strong> ${message || "N/A"}</p>
                    <p>Please check the admin dashboard to process this lead.</p>
                `
            });
        } catch (emailError) {
            console.error("Error sending email notification:", emailError);
            // Continue with the process even if email fails
        }

        // Send acknowledgment email to the customer
        try {
            await sendZeptoMail({
                to: email,
                subject: "Thank You for Your Inquiry - FinShelter",
                html: `
                    <h2>Thank You for Your Interest!</h2>
                    <p>Dear ${name},</p>
                    <p>Thank you for your interest in our ${service.name} service.</p>
                    <p>We have received your inquiry and our team will contact you shortly to discuss further details.</p>
                    <p>If you have any immediate questions, please feel free to contact us.</p>
                    <p>Best regards,<br>The FinShelter Team</p>
                `
            });
        } catch (emailError) {
            console.error("Error sending acknowledgment email:", emailError);
            // Continue with the process even if email fails
        }

        res.status(201).json({
            success: true,
            message: "Your inquiry has been received successfully. Our team will contact you soon.",
            lead: newLead
        });
    } catch (error) {
        console.error("Error creating lead:", error);
        res.status(500).json({ 
            success: false, 
            message: "Server error occurred while processing your request",
            error: error.message
        });
    }
};

// Get leads for the logged-in employee
const getEmployeeLeads = async (req, res) => {
    try {
        const employeeId = req.user._id;
        
        // Get all leads assigned to this employee
        const leads = await Lead.find({ assignedToEmployee: employeeId })
            .populate('serviceId', 'name category')
            .sort({ createdAt: -1 });
        
        res.status(200).json({ 
            success: true, 
            leads 
        });  
    } catch (error) {
        console.error("Error fetching employee leads:", error);
        res.status(500).json({ 
            success: false, 
            message: "Error fetching leads", 
            error: error.message 
        });
    }
};

module.exports = {
    createLead,
    getEmployeeLeads
};  