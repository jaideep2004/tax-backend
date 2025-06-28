const { SendMailClient } = require("zeptomail");
require('dotenv').config();

// Initialize Zepto Mail client
const url = "api.zeptomail.com/";
const token = process.env.ZEPTO_MAIL_TOKEN; // You'll need to add this to your .env file

const client = new SendMailClient({ url, token });

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
                    <p>© ${new Date().getFullYear()} TaxHarbor. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        // Prepare the email data
        const emailData = {
            from: {
                address: process.env.EMAIL_USER || "noreply@yourdomain.com",
                name: "TaxHarbor"
            },
            to: [
                {
                    email_address: {
                        address: to,
                        name: to.split('@')[0] // Use part before @ as name
                    }
                }
            ],
            subject: subject,
            textbody: text,
            htmlbody: htmlContent || defaultHtmlContent,
            track_opens: true,
            track_clicks: true
        };

        // Send email using Zepto Mail
        const response = await client.sendMail(emailData);
        console.log(`Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
        return false;
    }
};

module.exports = { sendEmail }; 