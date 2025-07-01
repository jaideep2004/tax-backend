const Lead = require("../models/leadModel");
const Service = require("../models/serviceModel");
const User = require("../models/userModel"); // Import User model
const { sendEmail } = require("../utils/emailUtils"); // Assuming you have an email util

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

        // Check if user with the same email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "An account with this email already exists. Please login to your account to request services."
            });
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
            await sendEmail(
                process.env.ADMIN_EMAIL,
                "New Service Inquiry Lead",
                `A new lead has been received:
                
                Name: ${name}
                Email: ${email}
                Mobile: ${mobile}
                Service: ${service.name}
                Message: ${message || "N/A"}
                
                Please check the admin dashboard to process this lead.`
            );
        } catch (emailError) {
            console.error("Error sending email notification:", emailError);
            // Continue with the process even if email fails
        }

        // Send acknowledgment email to the customer
        try {
            await sendEmail(
                email,
                "Thank You for Your Inquiry - FinShelter",
                `Dear ${name},
                
                Thank you for your interest in our ${service.name} service.
                
                We have received your inquiry and our team will contact you shortly to discuss further details.
                
                If you have any immediate questions, please feel free to contact us.
                
                Best regards,
                FinShelter Team`
            );
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