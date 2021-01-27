import { flags, SfdxCommand } from '@salesforce/command';
import { Messages} from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import SalesforceSetup from '../../utils/SalesforceSetup';

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
        `$ sfdx state_country:validate --targetusername myOrg@example.com --countryCsv ./test_countries.csv --stateCsv ./test_states.csv`
    ];

    public static args = [];

    protected static flagsConfig = {
        countrycsv: flags.string({ char: 'c', description: messages.getMessage('countrycsv'), required: true }),
        statecsv: flags.string({ char: 's', description: messages.getMessage('statecsv'), required: true }),
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
        let countriesAndStates = [];
        try {
            this.takeScreenshots=true;
            this.ux.startSpinner('Country and State picklist validation');
            countriesAndStates = await this.loadCountries(this.flags.countrycsv);
            countriesAndStates = await this.loadStatesAndMapToCountry(countriesAndStates, this.flags.statecsv);

            let csvFileValid:boolean=true;
            for(let i=0;i<countriesAndStates.length;i++){
                if(!countriesAndStates[i].states || countriesAndStates[i].states.length == 0 ){
                    csvFileValid=false;
                    break;
                }
            }
            if(!csvFileValid){
                this.ux.error(`Country Iso Code in State CSV File ${this.flags.statecsv} doesn't match with ${this.flags.countrycsv}`);
                return { "status": "failed" };
            }else{
                this.ux.log('CSV Files validated.')
                let setup:SalesforceSetup = new SalesforceSetup(this.ux,10);
                let page = await setup.gotoSetup(this.org.getConnection());
                await this.logMessage(`Navigating to Setup page`, page, `./tmp/1_setuphome.png`);
    
                
                page = await setup.gotoSetupOption(page,'State','/one/one.app#/setup/AddressCleanerOverview/home',null);
                await this.logMessage( `Navigating to State & Country picklist setup home`, page, `./tmp/2_state_country_home.png`);
                let pageFrames = page.mainFrame().childFrames();
                if (pageFrames.length == 1) {
                    const enabledTxt = await pageFrames[0].$x('//span[contains(text(),"have already been enabled")]');
                    if(enabledTxt && enabledTxt.length>0){
                        this.ux.log('Country and State picklist has been enabled.')
                        const configLink = await this.findByLink(pageFrames[0], 'Configure states and countries.')
                        configLink.click();
                        await page.waitForTimeout(10 * 1000);
                        await this.logMessage( `State & Country picklist setup home`, page,  `./tmp/3_state_country_config_.png`);
                        this.ux.stopSpinner('Completed validation of State/Country picklist loading.');
                        await this.ux.confirm('Check screenshots in the /tmp directory. Were Setup and State/Counry setup screenshots created?')
                        return { "status": "ok" };
                    }else{
                        this.ux.error('Country and State picklist has been not been enabled. Enable and re-run validation before loading')
                        return { "status": "failed" };
                    }
                }
                await setup.closeSession();
            }
            return { "status": "ok" };


        } catch (err) {
            console.log(err);
            return { "status": "failed" };
        }
        // Return an object to be displayed with --json
        
    }


    private async loadCountries(countryCsvFile) {
        const content = await fs.readFile(countryCsvFile);
        // Create the parser
        const records = parse(content, {
            delimiter: ',',
            columns: true
        });
        this.ux.log(`Total countries to load ${records.length}`);
        return records;

    }

    private async loadStatesAndMapToCountry(countries, stateCsvFile) {

        const content = await fs.readFile(stateCsvFile);
        const records = parse(content, {
            delimiter: ',',
            columns: true
        });
        this.ux.log(`Total states to load ${records.length}`);

        lodash.forEach(records, function (theState) {
            let country = lodash.find(countries, function (cntry) {
                return cntry.IsoCode == theState.CountryIso;
            });


            if (country) {
                if (!country.states) {
                    country.states = new Array();
                }
                country.states.push(theState);
            }
        });
        return countries;

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
