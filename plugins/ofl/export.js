const manufacturers = require(`../../fixtures/manufacturers.json`);

module.exports.name = `Open Fixture Library JSON`;
module.exports.version = require(`../../schemas/fixture.json`).version;

module.exports.export = function exportOFL(fixtures, options) {
  const usedManufacturers = new Set();

  // JSON file for each fixture
  const files = fixtures.map(fixture => {
    usedManufacturers.add(fixture.manufacturer.key);


    const jsonData = JSON.parse(JSON.stringify(fixture.jsonObject));
    jsonData.$schema = `https://raw.githubusercontent.com/FloEdelmann/open-fixture-library/schema-${module.exports.version}/schemas/fixture.json`;

    return {
      name: `${fixture.manufacturer.key}/${fixture.key}.json`,
      content: JSON.stringify(jsonData, null, 2),
      mimetype: `application/ofl-fixture`
    };
  });

  // manufacturers.json file
  const usedManufacturerData = {
    $schema: `https://raw.githubusercontent.com/FloEdelmann/open-fixture-library/schema-${module.exports.version}/schemas/manufacturers.json`
  };
  for (const man of Object.keys(manufacturers).sort()) {
    if (usedManufacturers.has(man)) {
      usedManufacturerData[man] = manufacturers[man];
    }
  }
  files.push({
    name: `manufacturers.json`,
    content: JSON.stringify(usedManufacturerData, null, 2),
    mimetype: `application/ofl-manufacturers`
  });

  return files;
};
