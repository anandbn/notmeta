import {  SfdxCommand } from '@salesforce/command';
import { Messages} from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const stdFs = require('fs');
const parse = require('csv-parse/lib/sync')
const lodash = require('lodash');

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('notMeta', 'validate_state_country');

export default class Validate extends SfdxCommand {

    public static description = messages.getMessage('commandDescription');

    public static examples = [
        `$ sfdx state_country:validate --targetusername myOrg@example.com`
    ];

    public static args = [];

    protected static flagsConfig = {
    };

    // Comment this out if your command does not require an org username
    protected static requiresUsername = true;

    // Comment this out if your command does not support a hub org username
    protected static supportsDevhubUsername = false;

    // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
    protected static requiresProject = false;

    private takeScreenshots;

    public async run(): Promise<AnyJson> {
        if (!stdFs.existsSync('./tmp')) {
            stdFs.mkdirSync('./tmp');
        } else {
            let fileNames = stdFs.readdirSync('./tmp');
            lodash.forEach(fileNames, function (fileName) {
                stdFs.unlinkSync(`./tmp/${fileName}`);
            });
        }
        const conn = this.org.getConnection();
        try {
            this.takeScreenshots=true;
            this.ux.startSpinner('Country and State picklist validation');
            let browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            let page = await browser.newPage();
            const setupHome = '/lightning/setup/SetupOneHome/home';
            let urlToGo = `${conn.instanceUrl}/secur/frontdoor.jsp?sid=${conn.accessToken}&retURL=${encodeURIComponent(setupHome)}`;
            await page.goto(urlToGo);
            await page.waitForNavigation();
            await page.waitForTimeout(10 * 1000);
            await this.logMessage(`Navigating to Setup page`, page, `./tmp/setuphome.png`);

            await page.setViewport({ width: 1200, height: 1200 });
            await page.waitForTimeout(5 * 1000);

            const quickFind = await page.$("input[class='filter-box input'][type='search']");
            await quickFind.focus();

            await quickFind.type("State");
            await page.waitForTimeout(10 * 1000);
            await this.logMessage( `Looking for State/Country picklist setup`, page, `./tmp/state_search.png`);

            const statePicklistLink = await page.$("a[href='/one/one.app#/setup/AddressCleanerOverview/home']");
            statePicklistLink.click();
            await page.waitForTimeout(10 * 1000);
            await this.logMessage( `Navigating to State & Country picklist setup home`, page, `./tmp/state_country_home.png`);
            let pageFrames = page.mainFrame().childFrames();
            if (pageFrames.length == 1) {
                const configLink = await this.findByLink(pageFrames[0], 'Configure states and countries.')
                configLink.click();
                await page.waitForTimeout(10 * 1000);
                await this.logMessage( `State & Country picklist setup home`, page,  `./tmp/state_country_config_.png`);
            }

            this.ux.stopSpinner('Completed validation of State/Country picklist loading.');
            browser.close();
            await this.ux.confirm('Check screenshots in the /tmp directory. Were Setup and State/Counry setup screenshots created?')
        } catch (err) {
            console.log(err);
        }
        // Return an object to be displayed with --json
        
        return { "status": "ok" };
    }

    
    
    // Normalizing the text
    private getText(linkText) {
        linkText = linkText.replace(/\r\n|\r/g, "\n");
        linkText = linkText.replace(/\ +/g, " ");

        // Replace &nbsp; with a space 
        var nbspPattern = new RegExp(String.fromCharCode(160), "g");
        return linkText.replace(nbspPattern, " ");
    }

    private async findByLink(page, linkString) {
        const links = await page.$x('//a')
        for (var i = 0; i < links.length; i++) {
            let valueHandle = await links[i].getProperty('innerText');
            let linkText = await valueHandle.jsonValue();
            const text = this.getText(linkText);
            if (linkString == text) {
                return links[i];
            }
        }
        return null;
    }

    private async logMessage(msg, page, fileName) {
        this.ux.setSpinnerStatus(msg);
        if (this.takeScreenshots && fileName) {
            await page.screenshot({ path: fileName, fullPage: true });
    
        }
    
    }
}
