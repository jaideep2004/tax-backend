/**
 * Nodemailer Installation Guide
 * 
 * 1. Install the required packages:
 *    Run in the Backend directory:
 *    npm install nodemailer dotenv
 * 
 * 2. Email Configuration:
 *    a. Create a .env file in the Backend directory if it doesn't exist
 *    b. Add the following fields (replace with your actual email credentials):
 *       
 *       EMAIL_HOST=smtp.gmail.com
 *       EMAIL_PORT=587
 *       EMAIL_SECURE=false
 *       EMAIL_USER=your-email@gmail.com
 *       EMAIL_PASS=your-app-password
 *       ADMIN_EMAIL=admin@thefinshelter.com
 * 
 * 3. If using Gmail:
 *    a. Make sure 2-step verification is enabled on your Gmail account
 *    b. Generate an "App Password" from your Google Account settings
 *    c. Use that app password in EMAIL_PASS (not your regular Gmail password)
 * 
 * 4. Restart your server after setup
 * 
 * Note: This file is just a guide, you don't need to execute it.
 */

console.log('Please follow the steps in this file to install and configure Nodemailer.');
console.log('After installation, make sure to restart your server.'); 