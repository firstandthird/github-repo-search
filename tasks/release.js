const rmfr = require('rmfr');
const path = require('path');
const n = require('ncp').ncp;
const fs = require('fs');
const util = require('util');

const ncp = util.promisify(n);
const mkdir = util.promisify(fs.mkdir);
const copyFile = util.promisify(fs.copyFile);

const BROWSERS = [
  'firefox',
  'chrome'
];

(async () => {
  const distFolder = path.resolve(__dirname, '../dist/');
  const extensionFolder = path.resolve(__dirname, '../extension');

  await rmfr(distFolder);
  await mkdir(distFolder);

  BROWSERS.map(async browser => {
    const folder = path.resolve(__dirname, `../dist/${browser}`);

    ncp(extensionFolder, folder, {
      filter: name => !name.includes('manifest_') && !name.includes('.json')
    }, async error => {
      if (error) {
        throw Error(error);
      }

      await copyFile(`${extensionFolder}/manifest_${browser}.json`, path.resolve(folder, 'manifest.json'));
    });
  });
})();
