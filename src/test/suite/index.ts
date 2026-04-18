import * as path from 'path';
import * as Mocha from 'mocha';
import * as fs from 'fs';

export function run(): Promise<void> {
  const testsRoot = path.resolve(__dirname);
  const mocha = new Mocha({ ui: 'bdd', color: true });
  const testFile = path.join(testsRoot, 'extension.test.js');

  if (!fs.existsSync(testFile)) {
    return Promise.reject(new Error(`Test file not found: ${testFile}`));
  }

  mocha.addFile(testFile);

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
