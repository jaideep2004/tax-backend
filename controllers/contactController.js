const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

// Create a transporter using SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send contact email
const sendContactEmail = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !subject || !message) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Email to the admin/company
    const adminMailOptions = {
      from: `"FinShelter Website" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || 'jaisidhu2004@gmail.com',
      subject: `New Contact Form Submission: ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `,
    };

    // Email to the customer (auto-reply)
    const customerMailOptions = {
      from: `"FinShelter" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Thank you for contacting FinShelter',
      html: `
        <h2>Thank you for reaching out!</h2>
        <p>Dear ${name},</p>
        <p>We have received your message and our team will get back to you as soon as possible.</p>
        <p>Here's a copy of your message:</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong> ${message}</p>
        <p>Best Regards,</p>
        <p>The FinShelter Team</p>
      `,
    };

    // Send email to admin
    await transporter.sendMail(adminMailOptions);

    // Send auto-reply to customer
    await transporter.sendMail(customerMailOptions);

    return res.status(200).json({ message: 'Your message has been sent successfully!' });
  } catch (error) {
    console.error('Email sending error:', error);
    return res.status(500).json({ message: 'Failed to send message. Please try again later.' });
  }
};

module.exports = { sendContactEmail }; 