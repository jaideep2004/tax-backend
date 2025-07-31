const sendZeptoMail = require('./utils/sendZeptoMail');

sendZeptoMail({
    to: 'superadmin@thefinshelter.com',
    subject: 'Test Email',
    html: 'Test email sent successfully.'
})
.then(info => console.log('Successfully sent:', info))
.catch(err => console.error('Error sending email:', err));
