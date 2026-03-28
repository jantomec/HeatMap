import path from 'node:path';

import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    color: true,
    ui: 'tdd'
  });

  mocha.addFile(path.resolve(__dirname, './heatmap.integration.test.js'));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration test(s) failed.`));
        return;
      }

      resolve();
    });
  });
}
