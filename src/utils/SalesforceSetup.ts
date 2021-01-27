import { UX } from "@salesforce/command";
import { Connection } from "@salesforce/core";

const puppeteer = require('puppeteer');
import { ElementHandle } from 'puppeteer';

export default class SalesforceSetup {
    private ux:UX;
    private navigationDelay:number;
    private browser:any;
    private takeScreenshots:boolean;

    constructor(sfdxUx:UX,navDelay:number,screenshots:boolean=false){
        this.ux=sfdxUx;
        this.navigationDelay=navDelay;
        this.takeScreenshots=screenshots;
    }


    public async gotoSetup(conn:Connection):Promise<any>{
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        let page = await this.browser.newPage();
        const setupHome = '/lightning/setup/SetupOneHome/home';
        let urlToGo = `${conn.instanceUrl}/secur/frontdoor.jsp?sid=${conn.accessToken}&retURL=${encodeURIComponent(setupHome)}`;
        await page.goto(urlToGo);
        await page.waitForNavigation();
        await page.waitForTimeout(this.navigationDelay * 1000);
        await page.setViewport({ width: 1200, height: 1200 });

        return page;
    }

    public async gotoSetupOption(page:any,optionText:String,optionUrl:String,navDelay:number):Promise<any>{
        const quickFind = await page.$("input[class='filter-box input'][type='search']");
        let quickFindId = await this.getElementProperty(quickFind,'id');
        
        //Erase any text in the search box
        await page.evaluate((selector) => {
            const searchTextBox:ElementHandle = document.getElementById(selector);
            searchTextBox.value = '';
        }, quickFindId);

        await quickFind.focus();
        await quickFind.type(optionText);
        await page.waitForTimeout(this.navigationDelay * 1000);

        await this.logMessage('After quick find search',page,'./tmp/setup_quick_find_search.png');
        const optionLink = await page.$(`a[href='${optionUrl}']`);
        if(optionLink){
            await optionLink.click();
            await page.waitForTimeout(navDelay | this.navigationDelay * 1000);
            return page;
        }
        return page;
    }

    public stateCountryPicklistHome(page:any,navDelay:number):Promise<any>{
        return this.gotoSetupOption(page,'State','/one/one.app#/setup/AddressCleanerOverview/home',navDelay);
    }

    public emailDeliverabilitySetup(page:any,navDelay:number):Promise<any>{
        return this.gotoSetupOption(page,'Deliverability','/one/one.app#/setup/OrgEmailSettings/home',navDelay);
    }


    public async getInputById(page, idValue) {
        return this.getFormElementById(page,idValue,'input');
    }


    public async getFormElementById(page, idValue,elType) {
        const inputFields = await page.$x(`//${elType}`);
        for (var i = 0; i < inputFields.length; i++) {
            let inpId = await this.getElementProperty(inputFields[i], 'id');
            if (inpId && inpId.includes(idValue)) {
                return inputFields[i];
            }
        }
        return null;
    }

    public async getElementProperty(element, property) {
        let valueHandle = await element.getProperty(property);
        let jsonVal = await valueHandle.jsonValue();
        return this.getText(jsonVal);
    }

    // Normalizing the text
    private getText(linkText) {
        linkText = linkText.replace(/\r\n|\r/g, "\n");
        linkText = linkText.replace(/\ +/g, " ");

        // Replace &nbsp; with a space 
        var nbspPattern = new RegExp(String.fromCharCode(160), "g");
        return linkText.replace(nbspPattern, " ");
    }

    public async findByLink(page, linkString) {
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

    public async closeSession(){
        this.browser.close();
    }


    public async logMessage(msg, page, fileName) {
        this.ux.setSpinnerStatus(msg);
        if (this.takeScreenshots && fileName) {
            await page.screenshot({ path: fileName, fullPage: true });
    
        }
    
    }
}