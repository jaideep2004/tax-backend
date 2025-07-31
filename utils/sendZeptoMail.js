const nodemailer = require('nodemailer');
require('dotenv').config();

const transport = nodemailer.createTransport({
    host: "smtp.zeptomail.in",
    port: 587,
    auth: {
        user: "emailapikey",
        pass: process.env.ZEPTO_MAIL_TOKEN
    }
});

/**
 * Send email using ZeptoMail SMTP
 * @param {Object} param0 
 * @param {string} param0.to - Recipient email address
 * @param {string} param0.subject - Email subject
 * @param {string} param0.html - Email HTML content
 * @param {string} [param0.from] - Sender email address (optional)
 * @returns {Promise<Object>} - Result from nodemailer
 */
async function sendZeptoMail({ to, subject, html, from }) {
    const mailOptions = {
        from: from || '"Finshelter" <noreply@thefinshelter.com>',
        to,
        subject,
        html
    };

    try {
        const info = await transport.sendMail(mailOptions);
        return info;
    } catch (error) {
        throw error;
    }
}

module.exports = sendZeptoMail;
