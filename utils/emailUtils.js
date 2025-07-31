const nodemailer = require('nodemailer');
require('dotenv').config();

// Email transport configuration
const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email service provider
    auth: {
        user: process.env.EMAIL_USER, // Your email address
        pass: process.env.EMAIL_PASS, // Your email app-specific password
    },
});

// Function to send emails with HTML template
const sendEmail = async (to, subject, text, htmlContent = null) => {
    try {
        // Default HTML template if no custom HTML is provided
        const defaultHtmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Poppins', sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: white;
                }
                .email-container {
                    background-color: #95b8a2;
                    border-radius: 10px;
                    padding: 30px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                .email-header {
                    background-color: #1b321d;
                    color: white;
                    text-align: center;
                    padding: 15px;
                    border-top-left-radius: 10px;
                    border-top-right-radius: 10px;
                }
                .email-body {
                    background-color: white;
                    padding: 20px;
                    border-bottom-left-radius: 10px;
                    border-bottom-right-radius: 10px;
                }
                .email-footer {
                    text-align: center;
                    margin-top: 20px;
                    color: #1b321d;
                    font-size: 0.8em;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <h1>${subject}</h1>
                </div>
                <div class="email-body">
                    <p>${text.replace(/\n/g, "<br>")}</p>
                </div>
                <div class="email-footer">
                    <p>© ${new Date().getFullYear()} Finshelter. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        // Send email with either custom or default HTML template
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            text, // Plain text version
            html: htmlContent || defaultHtmlContent, // Use custom HTML or default template
        });
        console.log(`Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
        return false;
    }
}; 
 
module.exports = { sendEmail }; 