notMeta
=======

A collection of plugins that support tasks that aren not exposed via the metadata API

## State/Country piclists

### Install

1. Clone this git repo
2. Run `sfdx plugins:link`

__Note__: We will be updating this to make installation more simpler with just `sfdx plugin:install` in the future.


### Chromium installation:

This plugin uses the Google Chromium headless browser to perform various tasks. It need a local Chromium installed. As a additional step of installation do the following __one time__.

```
cd <your plugin directory>
rm -rf node_modules/puppeteer/.local-chromium
node node_modules/puppeteer/install.js
```

### Validation

Once installation is complete, it's best to check if the plugin is able to navigate via Chromium. run the following command to check:

```
sfdx state_country:validate -u <your org's username> -c <your country csv file> -s <your states csv file>
```

__Note__: Sometimes this step might faile with a `timeout` error. If that occurs, please remove your org using `sfdx auth:logout` and do `sfdx auth:web:login` again and try the validation step.

### Loading Countries and States

Check the `test/data/state_country/test_countries.csv` and `test/data/state_country/test_states.csv` files for a sample of how you need to structure your CSV files. __The Country ISO Code in both files need to match in order for the load to be successful__.

To load the pikclists run the following:

`sfdx state_country:load -u <yourorg_username> -c <state CSV file location> -s <state CSV file location>`

In case you want to audit and take screenshots of the entire process (reccommended as a test run with a few records)

`sfdx state_country:load -u <yourorg_username> -c <state CSV file location> -s <state CSV file location> -a `

__Note__: The `-a` will create lots of PNG files in a `tmp` directory. It will delete them the next time you run the plugin.
