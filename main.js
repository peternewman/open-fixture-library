#!/usr/bin/node

const fs = require(`fs`);
const path = require(`path`);
const url = require(`url`);
const express = require(`express`);
const compression = require(`compression`);
const sassMiddleware = require(`node-sass-middleware`);
const browserify = require(`browserify-middleware`);
const minifyHTML = require(`html-minifier`).minify;
const bodyParser = require(`body-parser`);

const redirectToHttps = require(`./views/middleware/redirect-to-https.js`);

const plugins = require(`./plugins/plugins.json`);
const { fixtureFromRepository } = require(`./lib/model.js`);

require(`./lib/load-env-file.js`);

const app = express();

// setup port
app.set(`port`, (process.env.PORT || 5000));
app.listen(app.get(`port`), () => {
  console.log(`Node app is running on port`, app.get(`port`));
});

// redirect to HTTPS site version if environment forces HTTPS
app.use(redirectToHttps);

// enable compression
app.use(compression({
  threshold: `500B`
}));

// compile SASS
app.use(sassMiddleware({
  src: path.join(__dirname, `views`, `stylesheets`),
  dest: path.join(__dirname, `static`),
  outputStyle: process.env.NODE_ENV === `production` ? `compressed` : `extended`,
  response: false // let express.static below handle Cache-Control before sending
}));

// client scripts
browserify.settings.production(`cache`, `1 hour`);
app.use(`/js`, browserify(path.join(__dirname, `views`, `scripts`)));

// static files that need no processing -> let the users' browser cache them
const secondsInOneYear = 60 * 60 * 24 * 365;
app.use(express.static(path.join(__dirname, `static`), {
  setHeaders: (res, filename, stat) => {
    if (process.env.NODE_ENV === `production`) {
      if (path.extname(filename) === `.css`) {
        res.append(`Cache-Control`, `public, max-age=3600`); // cache for one hour
      }
      else {
        res.append(`Cache-Control`, `public, max-age=${secondsInOneYear}, immutable`); // cache indefinitely
      }
    }
  }
}));

// views is directory for all template files
app.set(`views`, path.join(__dirname, `views`));

// custom renderer
app.engine(`js`, (filePath, options, callback) => {
  const renderer = require(filePath);
  const html = renderer(options);

  if (process.env.NODE_ENV === `production`) {
    callback(null, minifyHTML(html, {
      collapseWhitespace: true,
      conservativeCollapse: true,

      // to help gzip compression
      sortAttributes: true,
      sortClassName: true
    }));
    return;
  }
  callback(null, html);
});
app.set(`view engine`, `js`);


// message objects to show to the user
const messages = [];

// the interesting data
let manufacturers = null;
let register = null;

// read in the JSON files to fill those data structures
fs.readFile(path.join(__dirname, `fixtures`, `manufacturers.json`), `utf8`, (error, data) => {
  if (error) {
    addFileReadError(`There was an error reading in the manufacturer data.`, error);
    return;
  }

  manufacturers = JSON.parse(data);
});
fs.readFile(path.join(__dirname, `fixtures`, `register.json`), `utf8`, (error, data) => {
  if (error) {
    addFileReadError(`There was an error reading in the register.`, error);
    return;
  }

  register = JSON.parse(data);
});


app.get(`/`, (request, response) => {
  response.render(`pages/index`, getOptions(request));
});

app.get(`/about`, (request, response) => {
  response.render(`pages/about`, getOptions(request));
});

app.get(`/categories`, (request, response) => {
  response.render(`pages/categories`, getOptions(request));
});

app.get(`/manufacturers`, (request, response) => {
  response.render(`pages/manufacturers`, getOptions(request));
});

app.get(`/fixture-editor`, (request, response) => {
  response.render(`pages/fixture_editor`, getOptions(request));
});

app.get(`/search`, (request, response) => {
  response.render(`pages/search`, getOptions(request));
});

app.get(`/rdm`, (request, response) => {
  const manufacturerId = request.query.manufacturerId;
  const modelId = request.query.modelId;
  const personalityIndex = request.query.personalityIndex;

  if (manufacturerId === undefined || manufacturerId === ``) {
    response.render(`pages/rdm-lookup`, getOptions(request));
    return;
  }

  if (manufacturerId in register.rdm) {
    const manufacturer = register.rdm[manufacturerId];

    if (modelId === undefined || modelId === ``) {
      response.redirect(301, `/${manufacturer.key}`);
      return;
    }

    if (modelId in register.rdm[manufacturerId].models) {
      const locationHash = (personalityIndex === undefined || personalityIndex === ``) ? `` : `#rdm-personality-${personalityIndex}`;
      response.redirect(301, `/${manufacturer.key}/${manufacturer.models[modelId]}${locationHash}`);
      return;
    }
  }

  response.status(404).render(`pages/rdm-not-found`, getOptions(request, {
    manufacturerId: manufacturerId,
    modelId: modelId
  }));
});

app.get(`/sitemap.xml`, (request, response) => {
  response.type(`application/xml`).render(`pages/sitemap`, getOptions(request));
});

// support json encoded bodies
app.use(bodyParser.json());

app.post(`/ajax/add-fixtures`, (request, response) => {
  require(`./lib/add-fixtures.js`)(request, response);
});

// if no other route applies
app.use((request, response, next) => {
  // first char is always a slash, last char has to be tested
  const sanitizedUrl = request.originalUrl.slice(1, (request.originalUrl.slice(-1) === `/`) ? -1 : request.originalUrl.length);
  const segments = sanitizedUrl.split(`/`);

  if (segments.length === 1) {
    // manufacturer page
    if (segments[0] in manufacturers) {
      response.render(`pages/single_manufacturer`, getOptions(request, {
        man: segments[0]
      }));
      return;
    }

    // download all
    const [download, pluginName] = segments[0].split(`.`);
    if (download === `download` && plugins.exportPlugins.includes(pluginName)) {
      const fixtures = Object.keys(register.filesystem).map(fixture => {
        const [man, key] = fixture.split(`/`);
        return fixtureFromRepository(man, key);
      });
      const plugin = require(path.join(__dirname, `plugins/${pluginName}/export.js`));
      const outfiles = plugin.export(fixtures, {
        baseDir: __dirname
      });

      downloadFiles(response, outfiles, pluginName);
      return;
    }
  }

  if (segments.length === 2 && segments[0] in manufacturers) {
    const man = segments[0];
    const fix = segments[1];

    // fixture page
    if (register.manufacturers[man].includes(fix)) {
      response.render(`pages/single_fixture`, getOptions(request, {
        man: man,
        fix: fix
      }));
      return;
    }

    // fixture export
    const [key, pluginName] = fix.split(`.`);
    if (register.manufacturers[man].includes(key) && plugins.exportPlugins.includes(pluginName)) {
      const plugin = require(path.join(__dirname, `plugins/${pluginName}/export.js`));
      const outfiles = plugin.export([fixtureFromRepository(man, key)], {
        baseDir: __dirname
      });

      downloadFiles(response, outfiles, pluginName);
      return;
    }
  }

  // category page
  if (segments.length === 2 && segments[0] === `categories` && decodeURIComponent(segments[1]) in register.categories) {
    response.render(`pages/single_category`, getOptions(request, {
      category: decodeURIComponent(segments[1])
    }));
    return;
  }

  console.log(`page ${request.originalUrl} [${segments}] not found`);

  response.status(404).render(`pages/404`, getOptions(request));
});

function downloadFiles(response, files, zipname) {
  if (files.length === 1) {
    response
      .status(201)
      .attachment(files[0].name)
      .type(files[0].mimetype)
      .send(Buffer.from(files[0].content));
    return;
  }

  // else zip all together
  const Zip = require(`node-zip`);
  const archive = new Zip();
  for (const file of files) {
    archive.file(file.name, file.content);
  }
  const data = archive.generate({
    base64: false,
    compression: `DEFLATE`
  });

  response
    .status(201)
    .attachment(`ofl_export_${zipname}.zip`)
    .type(`application/zip`)
    .send(Buffer.from(data, `binary`));
}

function getMessages() {
  if (messages.length > 0) {
    return messages;
  }

  if (manufacturers === null || register === null) {
    return [{
      type: `info`,
      text: `We are still reading the data. Please reload the page in a few moments.`
    }];
  }

  return [];
}

function addFileReadError(text, error) {
  console.error(text, error.toString());
  messages.push({
    type: `error`,
    text: `${text}<br /><code>${error.toString()}</code>`
  });
}

/**
 * Generates the options to be given to render modules.
 * @param {!Request} request The HTTP request object provided by express.
 * @param {?object} [additionalOptions={}] Special properties for the options object (like information which fixture this is).
 * @returns {!object} Object with options to pass to render modules.
 */
function getOptions(request, additionalOptions = {}) {
  return Object.assign({
    baseDir: __dirname,
    url: url.resolve(`${request.protocol}://${request.get(`host`)}`, request.originalUrl).replace(/\/$/, ``), // regex to remove trailing slash
    query: request.query,
    app: app,
    manufacturers: manufacturers,
    register: register,
    messages: getMessages(),
    structuredDataItems: []
  }, additionalOptions);
}
