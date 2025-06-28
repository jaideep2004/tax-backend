/**
 * Migration Script: Nodemailer to Zepto Mail
 * 
 * This script helps you migrate from Nodemailer to Zepto Mail by:
 * 1. Identifying all files that import emailUtils.js
 * 2. Updating those imports to use zeptoEmailUtils.js instead
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Root directory to search in
const rootDir = path.join(__dirname, '..');

// Find all files that import emailUtils.js
console.log('Searching for files that import emailUtils.js...');
const grepCommand = `grep -r "require.*emailUtils" ${rootDir} --include="*.js"`;

try {
    const grepOutput = execSync(grepCommand, { encoding: 'utf8' });
    const filesToUpdate = grepOutput
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
            const [filePath] = line.split(':');
            return filePath;
        });

    console.log(`Found ${filesToUpdate.length} files to update:`);
    console.log(filesToUpdate.join('\n'));

    // Update each file
    filesToUpdate.forEach(filePath => {
        try {
            let fileContent = fs.readFileSync(filePath, 'utf8');
            
            // Replace emailUtils with zeptoEmailUtils
            fileContent = fileContent.replace(
                /require\(['"]\.\.\/utils\/emailUtils['"]\)/g,
                'require(\'../utils/zeptoEmailUtils\')'
            );
            fileContent = fileContent.replace(
                /require\(['"]\.\/utils\/emailUtils['"]\)/g,
                'require(\'./utils/zeptoEmailUtils\')'
            );
            fileContent = fileContent.replace(
                /require\(['"]\.\/emailUtils['"]\)/g,
                'require(\'./zeptoEmailUtils\')'
            );
            
            // Write the updated content back to the file
            fs.writeFileSync(filePath, fileContent);
            console.log(`Updated: ${filePath}`);
        } catch (err) {
            console.error(`Error updating ${filePath}:`, err);
        }
    });

    console.log('\nMigration complete!');
    console.log('\nNext steps:');
    console.log('1. Add your Zepto Mail token to the .env file:');
    console.log('   ZEPTO_MAIL_TOKEN="your_zepto_mail_token_here"');
    console.log('2. Test sending emails with the new implementation');
    console.log('3. Once everything is working, you can remove the old emailUtils.js file');

} catch (error) {
    console.error('Error searching for files:', error);
} 