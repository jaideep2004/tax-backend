/**
 * Test script for Zepto Mail integration
 */
require('dotenv').config();
const { sendEmail } = require('./zeptoEmailUtils');

async function testZeptoMail() {
    console.log('Testing Zepto Mail integration...');
    
    // Check if token is configured
    if (!process.env.ZEPTO_MAIL_TOKEN) {
        console.error('Error: ZEPTO_MAIL_TOKEN is not configured in .env file');
        console.log('Please add your Zepto Mail token to the .env file:');
        console.log('ZEPTO_MAIL_TOKEN="your_zepto_mail_token_here"');
        return;
    }
    
    // Test email address (replace with your email)
    const testEmail = process.env.TEST_EMAIL || 'your-email@example.com';
    
    try {
        // Send a test email
        const result = await sendEmail(
            testEmail,
            'Test Email from Zepto Mail Integration',
            'This is a test email sent using Zepto Mail integration.\n\nIf you received this email, the integration is working correctly!',
            null
        );
        
        if (result) {
            console.log('Success! Test email sent successfully.');
            console.log(`Check your inbox at ${testEmail} for the test email.`);
        } else {
            console.error('Failed to send test email.');
        }
    } catch (error) {
        console.error('Error sending test email:', error);
    }
}

// Run the test
testZeptoMail(); 