import { flags, SfdxCommand } from '@salesforce/command';
import { Messages} from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import SalesforceSetup from '../../utils/SalesforceSetup';

import { ElementHandle } from 'puppeteer';
const stdFs = require('fs');
const lodash = require('lodash');

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('notMeta', 'deliverability_email');

export default class UpdateDeliverability extends SfdxCommand {

    public static description = messages.getMessage('commandDescription');

    public static examples = [
        `$ sfdx email:updateDeliverability --targetusername myOrg@example.com`
    ];

    public static args = [];

    protected static flagsConfig = {
        // flag with a value (-n, --name=VALUE)
        bouncemgmt : flags.boolean({char : 'b',description:messages.getMessage('bouncemgmt'),required:false,default:true}),
        returnbouncetosender : flags.boolean({char : 'r',description:messages.getMessage('returnbouncetosender'),required:false,default:false}),
        enforceemailprivacy : flags.boolean({char : 'p',description:messages.getMessage('enforceemailprivacy'),required:false,default:false}),
        screenshots: flags.boolean({ char: 'a', description: messages.getMessage('screenshots'), required: false, default: false }),

    };

    // Comment this out if your command does not require an org username
    protected static requiresUsername = true;

    // Comment this out if your command does not support a hub org username
    protected static supportsDevhubUsername = false;

    // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
    protected static requiresProject = false;

    private takeScreenshots:boolean;
    public async run(): Promise<AnyJson> {
        if (!stdFs.existsSync('./tmp')) {
            stdFs.mkdirSync('./tmp');
        } else {
            let fileNames = stdFs.readdirSync('./tmp');
            lodash.forEach(fileNames, function (fileName) {
                stdFs.unlinkSync(`./tmp/${fileName}`);
            });
        }
        this.takeScreenshots=this.flags.screenshots;
        try {
            let setup:SalesforceSetup = new SalesforceSetup(this.ux,10,this.flags.screenshots);

            this.ux.startSpinner('Update email deliverability');
            let page = await setup.gotoSetup( this.org.getConnection());

            await this.logMessage(`Navigating to Setup page`, page, `./tmp/setuphome.png`);

            page = await setup.emailDeliverabilitySetup(page,null);
            await setup.logMessage('Navigating to Email Deliverability setup',page,'./tmp/email_deliverability_setup.png');

            
            let pageFrames = page.mainFrame().childFrames();
            if (pageFrames.length == 1) {
                // ### get the element for the Access level
                const setting:ElementHandle = await setup.getFormElementById(pageFrames[0],'sendEmailAccessControlSelect','select');
                await setup.logMessage('Found email select box',page,'email_select_box.png');
                //'.$('#thePage\\:theForm\\:editBlock\\:sendEmailAccessControlSection\\:sendEmailAccessControl\\:sendEmailAccessControlSelect');

                // ### Option 2 is 'All Emails'
                await setting.select('2');
                await setup.logMessage('Selecting "All Emails" option',page,'./tmp/email_all_emails.png');

                const bounceMgmt:ElementHandle = await setup.getInputById(pageFrames[0],'cbHandleBouncedEmails');
                await bounceMgmt.click();
                // ### Locate the save button
                const savebutton:ElementHandle = await setup.getInputById(pageFrames[0],'saveBtn');
                //await pageFrames[0].$('#thePage\\:theForm\\:editBlock\\:buttons\\:saveBtn');

                // ### Go and click it
                if (savebutton != null) {
                    await savebutton.click();
                    await pageFrames[0].waitForNavigation();
                    await pageFrames[0].waitForTimeout(10*1000);
                    await setup.logMessage('After clicking save button',page,'./tmp/email_after_save.png');
                    this.ux.log('Email setting Updated');
                } else  {
                    this.ux.log('Oops no save button found');
                    throw new Error('Oops no save button found');
                }

                // ### Take a screenshot as evidence TEST
                await page.screenshot({path : './tmp/TEST_deliverabilitypage.png'});

            }
            this.ux.stopSpinner('Updated email deliverability settings.');

            await setup.closeSession();
        } catch (err) {
            console.log(err);
        }
        // Return an object to be displayed with --json
        
        return { "status": "ok" };
    }


    private async logMessage(msg, page, fileName) {
        this.ux.setSpinnerStatus(msg);
        if (this.takeScreenshots && fileName) {
            await page.screenshot({ path: fileName, fullPage: true });
    
        }
    
    }
}
