#!/usr/bin/node

const path = require(`path`);

const { fixtureFromRepository } = require(`../../lib/model.js`);
const pullRequest = require(`./pull-request.js`);

const plugins = require(`../../plugins/plugins.json`);
const testFixtures = require(`../test-fixtures.json`).map(
  fixture => [fixture.man, fixture.key]
);

pullRequest.checkEnv()
  .catch(error => {
    console.error(error);
    process.exit(0); // if the environment is not correct, just exit without failing
  })
  .then(() => pullRequest.init())
  .then(prData => pullRequest.fetchChangedComponents())
  .then(changedComponents => {
    const messagePromises = [];

    if (changedComponents.added.model ||
      changedComponents.modified.model ||
      changedComponents.renamed.model ||
      changedComponents.removed.model) {
      messagePromises.push(getModelMessagePromise());
    }
    else {
      const changedPlugins = changedComponents.added.exports.concat(changedComponents.modified.exports)
        .filter(key => plugins.data[key].exportTests.length > 0); // only plugins that have export tests
      for (const plugin of changedPlugins) {
        messagePromises.push(getPluginMessagePromise(plugin));
      }

      // only export tests that are not covered by plugin tasks (which run all tests)
      const exportTests = changedComponents.added.exportTests.concat(changedComponents.modified.exportTests) // stored as [plugin, test]
        .filter(([plugin, test]) => !changedPlugins.includes(plugin));
      for (const [plugin, test] of exportTests) {
        messagePromises.push(getExportTestMessagePromise(plugin, test));
      }
    }

    const fixtures = changedComponents.added.fixtures.concat(changedComponents.modified.fixtures, changedComponents.renamed.fixtures);
    for (const fixture of fixtures) {
      messagePromises.push(getFixtureMessagePromise(fixture));
    }

    return Promise.all(messagePromises);
  })
  .then(messages => {
    let lines = [];

    if (messages.length > 0) {
      lines.push(
        `Test the exported files of selected fixtures against the plugins' export tests.`,
        `You can run a plugin's export tests by executing:`,
        `\`$ node cli/run-export-test.js -p <plugin name> <fixtures>\``,
        ``
      );

      for (const messageLines of messages) {
        lines = lines.concat(messageLines, ``);
      }
    }

    return pullRequest.updateComment({
      filename: path.relative(path.join(__dirname, `../../`), __filename),
      name: `Export files validity`,
      lines: lines
    });
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

function getModelMessagePromise() {
  const pluginListPromises = Object.keys(plugins.data).map(
    pluginKey => getPluginListPromise(pluginKey, testFixtures)
  );

  return Promise.all(pluginListPromises)
    .then(pluginLists => {
      let modelMessageLines = [`## Model changed in this PR`];
      modelMessageLines = modelMessageLines.concat(getTestFixturesInfo(modelMessageLines));

      for (const pluginListLines of pluginLists) {
        modelMessageLines = modelMessageLines.concat(pluginListLines);
      }

      return modelMessageLines;
    });
}

function getPluginMessagePromise(pluginKey) {
  const exportTestListPromises = plugins.data[pluginKey].exportTests.map(
    testKey => getExportTestListPromise(pluginKey, testKey, testFixtures)
  );

  return Promise.all(exportTestListPromises)
    .then(exportTestLists => {
      let pluginMessageLines = [`## Plugin \`${pluginKey}\` changed in this PR`];
      pluginMessageLines = pluginMessageLines.concat(getTestFixturesInfo(pluginMessageLines));

      for (const exportTestListLines of exportTestLists) {
        pluginMessageLines = pluginMessageLines.concat(exportTestListLines);
      }

      return pluginMessageLines;
    });
}

function getExportTestMessagePromise(pluginKey, testKey) {
  const plugin = require(path.join(__dirname, `../../plugins`, pluginKey, `export.js`));
  const files = plugin.export(testFixtures.map(
    fix => fixtureFromRepository(fix[0], fix[1])
  ));

  const fileResultPromises = files.map(
    file => getFileResultPromise(pluginKey, testKey, file)
  );

  return Promise.all(fileResultPromises)
    .then(fileResults => {
      let exportTestMessageLines = [`## Export test \`${pluginKey}\`/\`${testKey}\` changed in this PR`];
      exportTestMessageLines = exportTestMessageLines.concat(getTestFixturesInfo(exportTestMessageLines));

      for (const fileResultLines of fileResults) {
        exportTestMessageLines = exportTestMessageLines.concat(fileResultLines);
      }

      return exportTestMessageLines;
    });
}

function getFixtureMessagePromise(fixture) {
  const pluginListPromises = Object.keys(plugins.data).map(
    pluginKey => getPluginListPromise(pluginKey, [fixture])
  );

  return Promise.all(pluginListPromises)
    .then(pluginLists => {
      let fixtureMessageLines = [`## Fixture \`${fixture[0]}/${fixture[1]}\` changed in this PR`];

      for (const pluginListLines of pluginLists) {
        fixtureMessageLines = fixtureMessageLines.concat(pluginListLines);
      }

      return fixtureMessageLines;
    });
}

function getTestFixturesInfo(lines) {
  return pullRequest.getTestFixturesMessage(
    testFixtures.map(fix => `${fix[0]}/${fix[1]}`)
  ).concat(`### Test results`);
}


function getPluginListPromise(pluginKey, fixtures) {
  const exportTestListPromises = plugins.data[pluginKey].exportTests.map(
    testKey => getExportTestListPromise(pluginKey, testKey, fixtures, `  `)
  );

  return Promise.all(exportTestListPromises)
    .then(exportTestLists => {
      let pluginListLines = [`- ${pluginKey}`];

      for (const exportTestListLines of exportTestLists) {
        pluginListLines = pluginListLines.concat(exportTestListLines);
      }

      return pluginListLines;
    });
}

function getExportTestListPromise(pluginKey, testKey, fixtures, indent = ``) {
  const plugin = require(path.join(__dirname, `../../plugins`, pluginKey, `export.js`));
  const files = plugin.export(fixtures.map(
    fix => fixtureFromRepository(fix[0], fix[1])
  ));

  const fileResultPromises = files.map(
    file => getFileResultPromise(pluginKey, testKey, file, `${indent}  `)
  );

  return Promise.all(fileResultPromises)
    .then(fileResults => {
      let exportTestLines = [`${indent}- ${testKey}`];

      for (const fileResultLines of fileResults) {
        exportTestLines = exportTestLines.concat(fileResultLines);
      }

      return exportTestLines;
    });
}

function getFileResultPromise(pluginKey, testKey, file, indent = ``) {
  const test = require(path.join(__dirname, `../../plugins`, pluginKey, `exportTests/${testKey}.js`));
  return test(file.content)
    .then(() => {
      return [`${indent}- :white_check_mark: ${file.name}`];
    })
    .catch(err => {
      const errors = Array.isArray(err) ? err : [err];

      const fileResultLines = [
        `${indent}- :x: ${file.name}`,
        `${indent}  <details>`,
        `${indent}  <summary>Show errors</summary>`,
        `${indent}  <ul>`
      ];

      for (const error of errors) {
        const errorText = error.replace(`\n`, ``);
        fileResultLines.push(`${indent}  <li>${errorText}</li>`);
      }

      fileResultLines.push(
        `${indent}  </ul>`,
        `${indent}  </details>`
      );

      return fileResultLines;
    });
}
