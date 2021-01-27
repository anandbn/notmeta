import { flags, SfdxCommand } from '@salesforce/command';
import { Messages} from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import SalesforceSetup from '../../utils/SalesforceSetup';
import { ElementHandle } from 'puppeteer';

const fs = require('fs').promises;
const stdFs = require('fs');
const parse = require('csv-parse/lib/sync')
const lodash = require('lodash');

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('notMeta', 'load_state_country');

export default class Load extends SfdxCommand {

    public static description = messages.getMessage('commandDescription');

    public static examples = [
        `$ sfdx state_country --targetusername myOrg@example.com --countryCsv ./test_countries.csv --stateCsv ./test_states.csv --takeScreenshots true
  
  `
    ];

    public static args = [];

    protected static flagsConfig = {
        // flag with a value (-n, --name=VALUE)
        countrycsv: flags.string({ char: 'c', description: messages.getMessage('countrycsv'), required: true }),
        statecsv: flags.string({ char: 's', description: messages.getMessage('statecsv'), required: true }),
        screenshots: flags.boolean({ char: 'a', description: messages.getMessage('screenshots'), required: false, default: false })
    };

    // Comment this out if your command does not require an org username
    protected static requiresUsername = true;

    // Comment this out if your command does not support a hub org username
    protected static supportsDevhubUsername = false;

    // Set this to true if your command requires a project workspace; 'requiresProject' is false by default
    protected static requiresProject = false;

    private takeScreenshots;

    private setup:SalesforceSetup;

    public async run(): Promise<AnyJson> {
        // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
        this.ux.log(`Loading countries from : ${this.flags.countrycsv}`);
        this.ux.log(`Loading states from : ${this.flags.statecsv}`);
        this.ux.log(`Take Screenshots? : ${this.flags.screenshots}`);
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
            countriesAndStates = await this.loadCountries(this.flags.countrycsv);
            countriesAndStates = await this.loadStatesAndMapToCountry(countriesAndStates, this.flags.statecsv);

            let csvFileValid:boolean=true;
            for(let i=0;i<countriesAndStates.length;i++){
                if(!countriesAndStates[i].states || countriesAndStates[i].states.length == 0 ){
                    csvFileValid=false;
                    break;
                }
            }
            if(csvFileValid){
                this.takeScreenshots=this.flags.screenshots;
                this.setup = new SalesforceSetup(this.ux,10);
    
                this.ux.startSpinner('Country and State picklist load');
                let page = await this.setup.gotoSetup( this.org.getConnection());
    
                await this.logMessage(`Navigating to Setup page`, page, `./tmp/setuphome.png`);
    
                for (let j = 0; j < countriesAndStates.length; j++) {
                    page = await this.setup.stateCountryPicklistHome(page,null);
                    await this.logMessage( `Navigating to State & Country picklist setup home`, page, `./tmp/state_country_home_${countriesAndStates[j].IsoCode}.png`);
    
    
                    let pageFrames = page.mainFrame().childFrames();
                    if (pageFrames.length == 1) {
                        const enabledTxt = await pageFrames[0].$x('//span[contains(text(),"have already been enabled")]');
                        if(enabledTxt && enabledTxt.length>0){
                            const configLink = await this.setup.findByLink(pageFrames[0], 'Configure states and countries.')
                            configLink.click();
                            await page.waitForTimeout(10 * 1000);
                            await this.logMessage( `State & Country picklist setup home`, page,  `./tmp/state_country_config_${countriesAndStates[j].IsoCode}.png`);
        
                            pageFrames = page.mainFrame().childFrames();
                            let countryIsoExists = await this.doesIsoCodeExist(pageFrames[0], countriesAndStates[j].IsoCode);
                            if (!countryIsoExists) {
                                const newCountryBtn = await pageFrames[0].$("input[type='submit'][value='New Country/Territory']");
                                newCountryBtn.click();
                                page.waitForNavigation();
                                await page.waitForTimeout(10 * 1000);
                                await this.logMessage( `Adding New Country`, page, `./tmp/state_country_new_country_${countriesAndStates[j].IsoCode}.png`);
        
                                pageFrames = page.mainFrame().childFrames();
                                await this.addCountry(page, pageFrames[0], countriesAndStates[j].Name,
                                    countriesAndStates[j].IsoCode, countriesAndStates[j].IntVal);
                                pageFrames = page.mainFrame().childFrames();
                                let successMsg = await pageFrames[0].$x('//h4[contains(text(),"Success")]');
                                if (successMsg) {
                                    await this.logMessage( `Country:${countriesAndStates[j].Name}[Iso Code:${countriesAndStates[j].IsoCode}, IntVal:${countriesAndStates[j].IntVal}] successfully added !!!!`, page, null);
                                } else {
                                    await this.logMessage( `Country:${countriesAndStates[j].Name}[Iso Code:${countriesAndStates[j].IsoCode}, IntVal:${countriesAndStates[j].IntVal}] failed !!!!`, page, null);
        
                                }
                                for (let i = 0; i < countriesAndStates[j].states.length; i++) {
                                    let stateToLoad = countriesAndStates[j].states[i];
                                    await this.addState(page, pageFrames[0], stateToLoad);
                                    pageFrames = page.mainFrame().childFrames();
                                    let successMsg = await pageFrames[0].$x('//h4[contains(text(),"Success")]');
                                    if (successMsg) {
                                        await this.logMessage( `State:${stateToLoad.Name}[Iso Code:${stateToLoad.IsoCode}, IntVal${stateToLoad.IntVal}] successfully added !!!!`, page,null);
                                    } else {
                                        await this.logMessage( `State:${stateToLoad.Name}[Iso Code:${stateToLoad.isoCode}, IntVal${stateToLoad.IntVal}] load failed !!!!`, page, null);
                                    }
                                }
                            } else {
                                await this.logMessage( `Country: ${countriesAndStates[j].IsoCode} already exists. Adding states...`, page, null)
                                let editCountryLink = await this.getEditLinkForIsoCode(pageFrames[0], countriesAndStates[j].IsoCode);
                                await editCountryLink.click();
                                await page.waitForNavigation();
                                await page.waitForTimeout(5 * 1000);
                                pageFrames = page.mainFrame().childFrames();
                                await this.logMessage( `Navigating to ${countriesAndStates[j].IsoCode} setup page`, page, `./tmp/after_clicking_edit_existing_iso_${countriesAndStates[j].IsoCode}.png`);
                                for (let i = 0; i < countriesAndStates[j].states.length; i++) {
                                    let stateToLoad = countriesAndStates[j].states[i];
                                    const stateExists = await this.doesIsoCodeExist(pageFrames[0], stateToLoad.IsoCode);
                                    if (!stateExists) {
                                        await this.addState(page, pageFrames[0], stateToLoad);
                                        pageFrames = page.mainFrame().childFrames();
                                        let successMsg = await pageFrames[0].$x('//h4[contains(text(),"Success")]');
                                        if (successMsg) {
                                            await this.logMessage( `State:${stateToLoad.Name}[Iso Code:${stateToLoad.IsoCode}, IntVal${stateToLoad.IntVal}] successfully added !!!!`, page, null);
                                        } else {
                                            await this.logMessage( `State:${stateToLoad.Name}[Iso Code:${stateToLoad.isoCode}, IntVal${stateToLoad.IntVal}] load failed !!!!`, page, null);
                                        }
                                    } else {
                                        await this.logMessage( `State with IsoCode:${stateToLoad.IsoCode} already exists. Skipping.`, page,  null)
                                    }
                                }
        
                            }
                            this.ux.stopSpinner('Loaded countries and states successfully.');
                        }else{
                            this.ux.error('Country and State picklist feature needs to be enabled before loading.');
                        }
                    }
                }
                await this.setup.closeSession();
                return { "status": "ok" };
    
            }else{
                this.ux.error(`Country Iso Code in State CSV File ${this.flags.statecsv} doesn't match with ${this.flags.countrycsv}`);
                return { "status": "failed" };
            }
        } catch (err) {
            console.log(err);
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
    private async getEditLinkForIsoCode(page, isoCode) {
        const allTableCells = await page.$x('//*[contains(@class,"dataCell")]');
        let editLink = null;
        for (var i = 0; i < allTableCells.length; i++) {
            const idVal = await this.setup.getElementProperty(allTableCells[i], 'id');
            if (idVal.includes('actionCol')) {
                //This contains the anchor link for Edit
                const children = await allTableCells[i].$$(':scope > *');
                if (children) {
                    editLink = children[0];
                }

            }
            if (idVal.includes('isocodeCol')) {
                //This contains the anchor link for Edit
                const children = await allTableCells[i].$$(':scope > *');
                if (children) {
                    let cellIsoCode = await this.setup.getElementProperty(children[0], 'textContent');
                    if (cellIsoCode) {
                        if (isoCode === cellIsoCode) {
                            await this.logMessage( `Found existing ${isoCode}. Clicking Edit link.`, page, null)
                            //click the link
                            return editLink;
                        }
                    }
                }

            }



        }
    }

    private async doesIsoCodeExist(page, isoCode) {
        const isocodeCells = await page.$x('//*[contains(@id,"isocodeCol")]');
        let isoCodes = [];
        for (var i = 0; i < isocodeCells.length; i++) {
            const tagName = await page.evaluate(
                element => element.tagName,
                isocodeCells[i]
            );
            const children = await isocodeCells[i].$$(':scope > *');
            if (children && tagName === "TD") {
                let eleIsoCode = await this.setup.getElementProperty(children[0], 'textContent');
                if (eleIsoCode) {
                    isoCodes.push(eleIsoCode);
                }
            }

        }
        return isoCodes.includes(isoCode);
    }
    private async addCountry(parentPage, page, countryName, countryIso, countryIntVal) {
        const country = await this.setup.getInputById(page, 'editName');
        country.type(countryName);
        await page.waitForTimeout(3 * 1000);
        const isoCode = await this.setup.getInputById(page, 'editIsoCode');
        isoCode.type(countryIso);
        await page.waitForTimeout(3 * 1000);
        const intVal = await this.setup.getInputById(page, 'editIntVal');
        const intValId = await this.setup.getElementProperty(intVal, 'id');

        //await intVal.setProperty('value','');
        await page.evaluate((selector) => {
            const intValTextBox:ElementHandle = document.getElementById(selector);
            intValTextBox.value = '';
        }, intValId);

        await intVal.type(countryIntVal);

        await page.waitForTimeout(3 * 1000);
        const isActive = await this.setup.getInputById(page, 'editActive');
        await isActive.click();
        await page.waitForTimeout(5 * 1000);
        const isVisible = await this.setup.getInputById(page, 'editVisible');
        await isVisible.click();
        await this.logMessage( `Country values filled...`, parentPage, `./tmp/state_country_new_country_filled_${countryIso}.png`);

        const addBtn = await this.setup.getInputById(page, 'addButton');
        addBtn.click();
        await page.waitForNavigation();
        await page.waitForTimeout(5 * 1000);

        await this.logMessage( `After clicking Add button`, parentPage,`./tmp/state_country_new_country_after_save_${countryIso}.png`);
    }
    private async addState(parentPage, countryPage, stateToLoad) {
        let stateName = stateToLoad.Name,
            stateIso = stateToLoad.IsoCode,
            stateIntVal = stateToLoad.IntVal,
            countryIso = stateToLoad.CountryIso;
        const addBtn = await this.setup.getInputById(countryPage, 'buttonAddNew');
        await addBtn.click();
        await countryPage.waitForNavigation();
        await countryPage.waitForTimeout(5 * 1000);
        await this.logMessage( `After clicking Add State button`, parentPage, `./tmp/state_country_new_state_${countryIso}_${stateIso}.png`);


        let pageFrames = parentPage.mainFrame().childFrames();
        let page = pageFrames[0];
        const stateNameInp = await this.setup.getInputById(page, 'editName');
        stateNameInp.type(stateName);
        const stateIsoInp = await this.setup.getInputById(page, 'editIsoCode');
        stateIsoInp.type(stateIso);
        const stateIntValInp = await this.setup.getInputById(page, 'editIntVal');
        const intValId = await this.setup.getElementProperty(stateIntValInp, 'id');

        //await intVal.setProperty('value','');
        await page.evaluate((selector) => {
            const intValTextBox:ElementHandle = document.getElementById(selector);
            intValTextBox.value = '';
        }, intValId);

        await stateIntValInp.type(stateIntVal);

        await page.waitForTimeout(3 * 1000);
        const isActive = await this.setup.getInputById(page, 'editActive');
        isActive.click();
        await page.waitForTimeout(5 * 1000);
        const isVisible = await this.setup.getInputById(page, 'editVisible');
        isVisible.click();
        await this.logMessage('After filled new state values', parentPage, `./tmp/state_country_new_state_filled_${countryIso}_${stateIso}.png`)

        const addStateBtn = await this.setup.getInputById(page, 'addButton');
        addStateBtn.click();
        await page.waitForNavigation();
        await page.waitForTimeout(5 * 1000);

        await this.logMessage( `After clicking Add button`, parentPage,`./tmp/state_country_new_state_after_save_${countryIso}_${stateIso}.png`);

    }


    private async logMessage(msg, page, fileName) {
        this.ux.setSpinnerStatus(msg);
        if (this.takeScreenshots && fileName) {
            await page.screenshot({ path: fileName, fullPage: true });
    
        }
    
    }
}
