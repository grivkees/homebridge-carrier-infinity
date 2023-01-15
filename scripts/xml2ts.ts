/*
 * This script converts an example xml file to a TS interface.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-console */
/* eslint-disable spellcheck/spell-checker */
const fs = require('fs');
const xml2js = require('xml2js');
const JsonToTS = require('json-to-ts');

const xmlFile = process.argv[2];
const tsFile = process.argv[3];

const xml = fs.readFileSync(xmlFile, 'utf-8');

xml2js.parseString(xml, (err, json) => {
  if (err) {
    console.error(err);
    return;
  }

  fs.writeFileSync(
    tsFile,
    '/* eslint-disable @typescript-eslint/no-unused-vars */\n/* eslint-disable spellcheck/spell-checker */\n\n',
  );

  JsonToTS(json).forEach(typeInterface => {
    if (typeInterface.includes('RootObject')){
      fs.appendFileSync(tsFile, 'export default ');
    } else {
      fs.appendFileSync(tsFile, 'export ');
    }
    fs.appendFileSync(tsFile, typeInterface);
    fs.appendFileSync(tsFile, '\n\n');
  });
});

