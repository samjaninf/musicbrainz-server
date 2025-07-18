#!./bin/sucrase-node
/*
 * This file is part of MusicBrainz, the open internet music database.
 * Copyright (C) 2017 MetaBrainz Foundation
 * Licensed under the GPL version 2, or (at your option) any later version:
 * http://www.gnu.org/licenses/gpl-2.0.txt
 */

import childProcess from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

import httpProxy from 'http-proxy';
import JSON5 from 'json5';
import webdriver from 'selenium-webdriver';
import getBrowsingContextInstance from 'selenium-webdriver/bidi/browsingContext.js';
import {
  CaptureScreenshotParameters,
  Origin,
} from 'selenium-webdriver/bidi/captureScreenshotParameters.js';
import logInspector from 'selenium-webdriver/bidi/logInspector.js';
import chrome from 'selenium-webdriver/chrome.js';
import firefox from 'selenium-webdriver/firefox.js';
import {Key} from 'selenium-webdriver/lib/input.js';
import until from 'selenium-webdriver/lib/until.js';
import webdriverProxy from 'selenium-webdriver/proxy.js';
import test from 'tape';
import TestCls from 'tape/lib/test.js';
import yargs from 'yargs';

import * as DBDefs from '../root/static/scripts/common/DBDefs.mjs';
import {compareStrings}
  from '../root/static/scripts/common/utility/compare.mjs';
import deepEqual from '../root/static/scripts/common/utility/deepEqual.js';
import escapeRegExp
  from '../root/static/scripts/common/utility/escapeRegExp.mjs';
import writeCoverage from '../root/utility/writeCoverage.mjs';

/*
 * We can't run all of the Selenium tests concurrently
 * because all tests share a database and Chrome driver
 * so disabling no-await-in-loop for this file instead
 */
/* eslint-disable no-await-in-loop */

const argv = yargs
  .option('b', {
    alias: 'browser',
    default: 'chrome',
    describe: 'browser to use (chrome, firefox)',
    type: 'string',
  })
  .option('c', {
    alias: 'coverage',
    default: true,
    describe: 'dump coverage data to .nyc_output/',
    type: 'boolean',
  })
  .option('h', {
    alias: 'headless',
    default: true,
    describe: 'run Chrome in headless mode',
    type: 'boolean',
  })
  .option('p', {
    alias: 'browser-binary-path',
    default: '',
    describe: 'path to the browser binary, in case it cannot be auto-detected',
    type: 'string',
  })
  .option('r', {
    alias: 'run-partition',
    default: false,
    describe: 'run a partition of the tests, specified as a fraction; ' +
              'e.g., 2/4 will divide the tests into four deterministic ' +
              'partitions and run the second one',
    type: 'strings',
  })
  .option('s', {
    alias: 'stay-open',
    default: false,
    describe: 'stay logged in and keep the browser open after tests complete',
    type: 'boolean',
  })
  .usage('Usage: $0 [-hs] [file...]')
  .help('help')
  .argv;

function compareEditDataValues(actualValue, expectedValue) {
  if (expectedValue === '$$__IGNORE__$$') {
    return true;
  }
  /*
   * Handle cases where Perl's JSON module serializes numbers in the
   * edit data as strings (something we can't fix easily).
   */
  if (
    (typeof actualValue === 'string' ||
      typeof actualValue === 'number') &&
    (typeof expectedValue === 'string' ||
      typeof expectedValue === 'number')
  ) {
    return String(actualValue) === String(expectedValue);
  }
  // Tells `deepEqual` to perform its default comparison.
  return null;
}

TestCls.prototype.deepEqual2 = function (a, b, msg, extra) {
  this._assert(deepEqual(a, b, compareEditDataValues), {
    actual: a,
    expected: b,
    extra,
    message: msg ?? 'should be equivalent',
    operator: 'deepEqual2',
  });
};

async function _retryTest(isOk) {
  for (let i = 0; i < 3; i++) {
    if (await isOk()) {
      break;
    } else {
      await driver.sleep(3000);
    }
  }
}

TestCls.prototype.equalWithRetry = async function (a, b, comment) {
  let aValue;
  await _retryTest(async () => {
    aValue = await a();
    return Object.is(aValue, b);
  });
  this.equal(aValue, b, comment);
};

TestCls.prototype.okWithRetry = async function (isOk) {
  let ok;
  await _retryTest(async () => {
    ok = await isOk();
    return ok;
  });
  this.ok(ok);
};

function wrapChildProcessMethod(methodName) {
  return (...args) => {
    return new Promise(function (resolve, reject) {
      let exitCode = null;
      let result = null;

      function done() {
        result.code = exitCode;
        if (result.error) {
          reject(result);
        } else {
          resolve(result);
        }
      }

      const child = childProcess[methodName](
        ...args,
        function (error, stdout, stderr) {
          result = {error, stderr, stdout};
          if (exitCode !== null) {
            done();
          }
        },
      );

      child.on('exit', function (code) {
        exitCode = code;
        if (result !== null) {
          done();
        }
      });
    });
  };
}

const exec = wrapChildProcessMethod('exec');
const execFile = wrapChildProcessMethod('execFile');

const proxy = httpProxy.createProxyServer({});
let pendingReqs = [];
let reqsCount = 0;

proxy.on('proxyReq', function (req) {
  pendingReqs.push(req);
  reqsCount++;
});

/*
 * We want to log the responses of failed search requests, particularly
 * to /ws/js, as plackup may not log enough or any information about the
 * internal failure.
 */
proxy.on('proxyRes', function (proxyRes, req) {
  const webServerPath = (new URL(req.url)).pathname;
  if (
    /^\/ws\/js\//.test(webServerPath) &&
    proxyRes.statusCode >= 400
  ) {
    const body = [];
    proxyRes.on('data', function (chunk) {
      body.push(chunk);
    });
    proxyRes.on('end', function () {
      console.error(
        `# Got ${proxyRes.statusCode} from ${webServerPath}:\n` +
        '# \tResponse body:\n' +
        `# \t\t${Buffer.concat(body).toString()}\n` +
        '# \tResponse headers:\n' +
        `# \t\t${JSON.stringify(proxyRes.rawHeaders)}`,
      );
    });
  }
});

const customProxyServer = http.createServer(function (req, res) {
  const host = req.headers.host;
  if (
    /*
     * This is hit due to the .caa-warning/.eaa-warning toggle.
     * We don't have any tests that care about that warning, and the IA
     * seems to block requests from GitHub Actions runners, so it causes
     * pointless timeouts.
     */
    host === 's3.us.archive.org'
  ) {
    res.writeHead(503);
    res.end('');
    return;
  }
  if (host === DBDefs.WEB_SERVER) {
    req.headers['mb-set-database'] = 'SELENIUM';
    req.rawHeaders['mb-set-database'] = 'SELENIUM';
  }
  proxy.web(req, res, {target: 'http://' + host}, function (e) {
    console.error(e);
  });
});

const driver = (x => {
  let options;

  switch (argv.browser) {
    case 'chrome':
      x.forBrowser('chrome');
      options = new chrome.Options();
      options.addArguments(
        'disable-dev-shm-usage',
        'no-sandbox',
        'proxy-server=http://localhost:5051',
      );
      options.setUserPreferences({
        'credentials_enable_service': false,
        'profile.password_manager_enabled': false,
        'profile.password_manager_leak_detection': false,
      });
      if (argv.browserBinaryPath) {
        options.setChromeBinaryPath(argv.browserBinaryPath);
      }
      x.setChromeOptions(options);
      break;

    case 'firefox':
      x.forBrowser('firefox');
      options = new firefox.Options();
      options.setPreference('dom.disable_beforeunload', true);
      options.setPreference('network.proxy.allow_hijacking_localhost', true);
      if (argv.browserBinaryPath) {
        options.setBinary(argv.browserBinaryPath);
      }
      x.setFirefoxOptions(options);
      break;

    default:
      throw new Error('Unsupported browser: ' + argv.browser);
  }

  x.setProxy(webdriverProxy.manual({http: 'localhost:5051'}));

  if (argv.headless) {
    options.addArguments('--headless');
  }

  // Needed to take a screenshot in case of failure.
  options.enableBidi();

  return x.build();
})(new webdriver.Builder());

function quit() {
  proxy.close();
  customProxyServer.close();
  return driver.quit().catch(console.error);
}

const SCREENSHOTS_DIR = path.resolve(
  DBDefs.MB_SERVER_ROOT,
  't/selenium/.screenshots',
);

async function takeScreenshot(fname) {
  try {
    const browsingContext = await getBrowsingContextInstance(driver, {
      browsingContextId: await driver.getWindowHandle(),
    });
    const captureParams = new CaptureScreenshotParameters();
    captureParams.origin(Origin.DOCUMENT);
    const fpath = path.join(SCREENSHOTS_DIR, `${fname}.png`);
    fs.mkdirSync(path.dirname(fpath), {recursive: true});
    fs.writeFileSync(
      fpath,
      await browsingContext.captureScreenshot(captureParams),
      'base64',
    );
    return fpath;
  } catch (err) {
    console.error('Failed to take a screenshot:');
    console.error(err);
  }
  return null;
}

async function unhandledRejection(err) {
  console.error(err);

  await takeScreenshot('failure');

  if (!argv.stayOpen) {
    await quit();
    process.exit(1);
  }
}

process.on('unhandledRejection', unhandledRejection);

function makeLocator(locatorStr) {
  const splitAt = locatorStr.indexOf('=');
  let using = locatorStr.slice(0, splitAt);
  const value = locatorStr.slice(splitAt + 1);

  if (using === 'link') {
    using = 'linkText';
  }

  return webdriver.By[using](value);
}

function findElement(locatorStr) {
  return driver.wait(
    until.elementLocated(makeLocator(locatorStr)),
    30000, // 30 seconds
  );
}

async function getElementText(locatorStr) {
  // The Selenium IDE converts tabs and newlines to normal spaces.
  return (await findElement(locatorStr).getText()).replace(/\s/g, ' ').trim();
}

async function setChecked(element, wantChecked) {
  const checked = await element.isSelected();

  if (checked !== wantChecked) {
    await element.click();
  }
}

async function selectOption(select, optionLocator) {
  await select.click();

  const splitAt = optionLocator.indexOf('=');
  const prefix = optionLocator.slice(0, splitAt);
  let value = optionLocator.slice(splitAt + 1);
  let option;

  switch (prefix) {
    case 'label':
      if (value.startsWith('regexp:')) {
        value = new RegExp(value.slice(7));
      } else {
        value = new RegExp('^\\s*' + escapeRegExp(value) + '\\s*$');
      }
      option = await select.findElement(async function () {
        const options =
          await select.findElements(webdriver.By.tagName('option'));
        for (const option of options) {
          if (value.test(await option.getText())) {
            return option;
          }
        }
        return null;
      });
      break;

    default:
      throw 'Unsupported select prefix: ' + prefix;
  }

  if (!option) {
    throw 'Option not found: ' + optionLocator;
  }

  return option.click();
}

/* eslint-disable no-template-curly-in-string */
const KEY_CODES = {
  '${KEY_BKSP}': Key.BACK_SPACE,
  '${KEY_DOWN}': Key.ARROW_DOWN,
  '${KEY_END}': Key.END,
  '${KEY_ENTER}': Key.ENTER,
  '${KEY_ESC}': Key.ESCAPE,
  '${KEY_HOME}': Key.HOME,
  '${KEY_SHIFT}': Key.SHIFT,
  '${KEY_TAB}': Key.TAB,
  '${KEY_UP}': Key.ARROW_UP,
  '${MBS_ROOT}': DBDefs.MB_SERVER_ROOT.replace(/\/$/, ''),
};
/* eslint-enable no-template-curly-in-string */

function getDocumentLocation() {
  return driver.executeScript('return document.location;');
}

function getPageErrors() {
  return driver.executeScript('return ((window.MB || {}).js_errors || [])');
}

let coverageObjectIndex = 0;
function writeSeleniumCoverage(coverageString) {
  return writeCoverage(`selenium-${coverageObjectIndex++}`, coverageString);
}

async function writePreviousSeleniumCoverage() {
  /*
   * `previousCoverage` means for the previous window.
   *
   * We only want to write the __coverage__ object to disk before the page
   * is about to change, for the obvious reason that it's not complete until
   * then, but also because retrieving the large (> 1MB) __coverage__ object
   * from the driver is slow, so we only want to do that when absolutely
   * necessary.
   */
  const previousCoverage = await driver.executeScript(
    `if (!window.__seen__) {
       window.__seen__ = true;
       window.addEventListener('beforeunload', function () {
         sessionStorage.setItem(
           '__previous_coverage__',
           JSON.stringify(window.__coverage__),
         );
       });
       return sessionStorage.getItem('__previous_coverage__');
     }
     return null;`,
  );
  if (previousCoverage) {
    await writeSeleniumCoverage(previousCoverage);
  }
}

function timePrefix(str) {
  return `[${(new Date()).toISOString().slice(-13)}] ${str}`;
}

async function checkSirQueues(t) {
  let failedCount = 0;
  let retryCount = 0;
  let indexCount = 0;
  let deleteCount = 0;
  let prevIndexCount = 0;
  let prevDeleteCount = 0;
  let prevRetryCount = 0;
  let lastProgressTimestamp = Date.now();

  while (
    // Continue if the queues have decreased at all in the past 30s.
    (Date.now() - lastProgressTimestamp) < 30000
  ) {
    prevIndexCount = indexCount;
    prevDeleteCount = deleteCount;
    prevRetryCount = retryCount;

    const rabbitmqCommand =
      process.env.RABBITMQCTL_COMMAND || 'sudo -n rabbitmqctl';
    const result = await exec(
      `${rabbitmqCommand} list_queues -p '/sir-test' -q --formatter=json`,
    );
    const sirQueues = JSON.parse(result.stdout);
    const messageCounts = sirQueues.reduce((map, queue) => {
      map.set(queue.name, queue.messages);
      return map;
    }, new Map());

    failedCount = messageCounts.get('search.failed') || 0;
    retryCount = messageCounts.get('search.retry') || 0;
    indexCount = messageCounts.get('search.index') || 0;
    deleteCount = messageCounts.get('search.delete') || 0;

    if (failedCount) {
      throw new Error(
        'non-empty sir queues: ' +
        `search.failed (${failedCount})`,
      );
    }

    if (indexCount || deleteCount || retryCount) {
      if (
        (indexCount - prevIndexCount) < 0 ||
        (deleteCount - prevDeleteCount) < 0 ||
        (retryCount - prevRetryCount) < 0
      ) {
        lastProgressTimestamp = Date.now();
      }
      t.comment(timePrefix(
        'waiting for non-empty sir queues: ' +
        `search.index (${indexCount}), ` +
        `search.delete (${deleteCount}), ` +
        `search.retry (${retryCount})`,
      ));
      await driver.sleep(3000);
    } else {
      return;
    }
  }

  throw new Error(
    'non-empty sir queues: ' +
    `search.index (${indexCount}), search.delete (${deleteCount})`,
  );
}

async function getSeleniumDbTupStats() {
  const result = await execFile(
    path.resolve(DBDefs.MB_SERVER_ROOT, 'script/get_selenium_tup_stats.sh'),
  );
  return JSON.parse(result.stdout);
}

async function handleCommandAndWait(
  stest,
  {command, index, target, value},
  t,
) {
  const newCommand = command.replace(/AndWait$/, '');

  const html = await findElement('css=html');
  await handleCommand(stest, {command: newCommand, index, target, value}, t);
  return driver.wait(until.stalenessOf(html), 30000);
}

async function handleCommand(stest, {command, index, target, value}, t) {
  if (/AndWait$/.test(command)) {
    return handleCommandAndWait(stest, {command, index, target, value}, t);
  }

  /*
   * This is performed before running the command (rather than after) because
   * the page can become stale by executing the command (via navigation),
   * which seems to trigger some exceptions when taking a screenshot.
   */
  const screenshotPath = await takeScreenshot(
    `${stest.name.replace(/\.json5$/, '')}_${index}_${command}`,
  );
  if (screenshotPath != null) {
    (stest.screenshots ??= []).push(screenshotPath);
  }

  // Wait for all pending network requests before running the next command.
  await driver.wait(function () {
    pendingReqs = pendingReqs.filter(
      req => !(req.destroyed || req.writableEnded),
    );
    return pendingReqs.length === 0;
  });

  t.comment(timePrefix(
    command +
    ' target=' + JSON.stringify(target) +
    ' value=' + JSON.stringify(value),
  ));

  if (
    typeof value === 'string' &&
    value.startsWith('$$_EVAL_$$')
  ) {
    const valueScript = value.slice(10);
    // eslint-disable-next-line require-atomic-updates
    value = await driver.executeScript(`return (${valueScript})`);
  }

  let element;
  switch (command) {
    case 'assertArtworkJson': {
      const artworkJson = JSON.parse(await driver.executeAsyncScript(`
        var callback = arguments[arguments.length - 1];
        fetch('http://localhost:8081/${target}')
          .then(x => x.text().then(callback));
      `));
      t.deepEqual2(artworkJson, value);
      break;
    }
    case 'assertAttribute': {
      const splitAt = target.indexOf('@');
      const locator = target.slice(0, splitAt);
      const attribute = target.slice(splitAt + 1);
      element = await findElement(locator);

      await t.equalWithRetry(
        () => element.getAttribute(attribute),
        value,
      );
      break;
    }
    case 'assertElementPresent':
      await t.okWithRetry(async () => {
        const elements = await driver.findElements(makeLocator(target));
        return elements.length > 0;
      });
      break;

    case 'assertEval':
      await t.equalWithRetry(
        () => driver.executeScript(`return String(${target})`),
        value,
      );
      break;

    case 'assertEditData': {
      const actualEditData = JSON.parse(await driver.executeAsyncScript(`
        var callback = arguments[arguments.length - 1];
        fetch('/edit/${target}/data', {
          credentials: 'same-origin',
          method: 'GET',
          headers: new Headers({'Accept': 'application/json'}),
        }).then(x => x.text().then(callback));
      `));
      t.deepEqual2(actualEditData, value);
      break;
    }
    case 'assertLocationMatches':
      await t.okWithRetry(async () => {
        return new RegExp(target).test(await driver.getCurrentUrl());
      });
      break;

    case 'assertText':
      await t.equalWithRetry(
        () => getElementText(target),
        value.trim(),
      );
      break;

    case 'assertTextMatches':
      await t.okWithRetry(async () => {
        return new RegExp(value).test(await getElementText(target));
      });
      break;

    case 'assertTitle':
      await t.equalWithRetry(
        () => driver.getTitle(),
        target,
      );
      break;

    case 'assertValue':
      await t.equalWithRetry(
        () => findElement(target).getAttribute('value'),
        value,
      );
      break;

    case 'check':
      await setChecked(findElement(target), true);
      break;

    case 'click':
      element = await findElement(target);
      await driver.executeScript('arguments[0].scrollIntoView()', element);
      await element.click();
      break;

    case 'fireEvent':
      await driver.executeScript(
        `arguments[0].dispatchEvent(new Event('${value}'))`,
        await findElement(target),
      );
      break;

    case 'focus':
      await driver.executeScript(
        'arguments[0].focus()',
        await findElement(target),
      );
      break;

    case 'assertBeforeUnloadAlertWasShown': {
      /*
       * Per the WebDriver standard [1], "User prompts that are spawned from
       * beforeunload event handlers, are dismissed implicitly upon
       * navigation or close window, regardless of the defined user prompt
       * handler." This used to not be the case in Chrome, and alerts had to
       * be dismissed manually. They later fixed this behavior [2], but it's
       * still useful for us to test whether an alert was triggered, which is
       * done by setting a flag in `sessionStorage`.
       *
       * [1] https://www.w3.org/TR/webdriver1/#user-prompts
       * [2] https://chromium.googlesource.com/chromium/src/+/b14c93608871784e41d6d40f1c5952cf24aa39db
       */
      await t.equalWithRetry(
        () => driver.executeScript(
          'return sessionStorage.getItem("didShowBeforeUnloadAlert");',
        ),
        'true',
        'beforeunload alert was shown',
      );
      break;
    }

    case 'mouseOver': {
      const element = await findElement(target);
      await driver.executeScript('arguments[0].scrollIntoView()', element);
      await driver.actions()
        .move({origin: element})
        .perform();
      break;
    }

    case 'open':
      await driver.get('http://' + DBDefs.WEB_SERVER + target);
      break;

    case 'pause':
      await driver.sleep(target);
      break;

    case 'runScript':
      await driver.executeScript(target);
      break;

    case 'select':
      await selectOption(await findElement(target), value);
      break;

    case 'sendKeys':
      value = value.split(/(\$\{[A-Z_]+\})/)
        .filter(x => x)
        .map(x => KEY_CODES[x] || x);
      element = await findElement(target);
      await element.sendKeys(...value);
      break;

    case 'type':
      element = await findElement(target);
      /*
       * XXX *Both* of the next two lines are needed to clear the input
       * in some cases. (Just one or the other won't suffice.) It's not
       * known what module is at fault, but this combination is
       * confirmed to misbehave:
       *
       * Chrome 70.0.3538.110
       * ChromeDriver 2.44.609545
       * chrome-remote-interface 0.27.0
       * selenium-webdriver 3.6.0
       */
      await element.clear();
      await driver.executeScript(
        'window.MB.setInputValueForReact(arguments[0], "")',
        element,
      );
      await element.sendKeys(value);
      break;

    case 'uncheck':
      await setChecked(findElement(target), false);
      break;

    case 'waitUntilUrlIs':
      await driver.wait(until.urlIs(
        'http://' + DBDefs.WEB_SERVER + target,
      ), 30000);
      break;

    default:
      throw 'Unsupported command: ' + command;
  }

  return null;
}

/* eslint-disable sort-keys */
const seleniumTests = [
  {name: 'Create_Account.json5'},
  {name: 'MBS-2604.json5', login: true},
  {name: 'MBS-5387.json5', login: true},
  {name: 'MBS-7456.json5', login: true},
  {name: 'MBS-7646.json5'},
  {name: 'MBS-8952.json5', login: true},
  {name: 'MBS-9396.json5', login: true},
  {name: 'MBS-9548.json5'},
  {name: 'MBS-9669.json5'},
  {name: 'MBS-9941.json5', login: true},
  {name: 'MBS-10188.json5', login: true, sql: 'mbs-10188.sql'},
  {name: 'MBS-10510.json5', login: true, sql: 'mbs-10510.sql'},
  {name: 'MBS-11529.json5', login: true},
  {name: 'MBS-11730.json5', login: true},
  {name: 'MBS-11735.json5', login: true},
  {name: 'MBS-12641.json5', login: true},
  {name: 'MBS-12859.json5', login: true},
  {name: 'MBS-12874.json5', login: true},
  {name: 'MBS-12885.json5', login: true},
  {name: 'MBS-12904.json5', login: true},
  {
    name: 'MBS-12911.json5',
    login: true,
    sql: 'vision_creation_newsun.sql',
  },
  {name: 'MBS-12921.json5', login: true},
  {name: 'MBS-12922.json5', login: true},
  {
    name: 'MBS-13015.json5',
    login: true,
    sql: 'mbs-13015.sql',
  },
  {name: 'MBS-13392.json5', login: true},
  {name: 'MBS-13604.json5', login: true},
  {name: 'MBS-13615.json5', login: true},
  {name: 'MBS-13993.json5', login: true},
  {name: 'Artist_Credit_Editor.json5', login: true},
  {name: 'Autocomplete2.json5'},
  {name: 'External_Links_Editor.json5', login: true},
  {name: 'Work_Editor.json5', login: true},
  {name: 'Redirect_Merged_Entities.json5', login: true},
  {name: 'admin/Edit_Banner.json5', login: true},
  {name: 'Relationship_Seeding.json5', login: true},
  {name: 'release-editor/The_Downward_Spiral.json5', login: true},
  {
    name: 'release-editor/Duplicate_Selection.json5',
    login: true,
    sql: 'whatever_it_takes.sql',
  },
  {
    name: 'release-editor/Seeding.json5',
    login: true,
    sql: 'vision_creation_newsun.sql',
  },
  {name: 'release-editor/MBS-4555.json5', login: false},
  {name: 'release-editor/MBS-9479.json5', login: true},
  {name: 'release-editor/MBS-10221.json5', login: true},
  {name: 'release-editor/MBS-10359.json5', login: true},
  {name: 'release-editor/MBS-11015.json5', login: true},
  {name: 'release-editor/MBS-11114.json5', login: true},
  {name: 'release-editor/MBS-11156.json5', login: true},
  {
    login: false,
    name: 'release-editor/MBS-12077.json5',
    sql: 'vision_creation_newsun.sql',
  },
  {name: 'release-editor/MBS-13207.json5', login: true},
  {name: 'release-editor/MBS-13273.json5', login: true},
  {name: 'release-editor/MBS-13579.json5', login: true},
  {name: 'release-editor/MBS-13692.json5', login: true},
  {name: 'release-editor/MBS-13715.json5', login: true},
  {
    name: 'Check_Duplicates.json5',
    login: true,
    sql: 'duplicate_checker.sql',
  },
  {name: 'CD_Lookup.json5', login: true},
  {name: 'CD_Stub_Search.json5', sql: 'cdstub_raw.sql'},
  {name: 'FilterForm.json5', sql: 'filtering.sql'},
  {
    name: 'Release_Relationship_Editor.json5',
    login: true,
    sql: 'vision_creation_newsun.sql',
  },
  {
    name: 'Series_Relationship_Editor.json5',
    login: true,
  },
  {
    name: 'Artist_Edit_Form.json5',
    login: true,
  },
  {
    name: 'Event_Edit_Form.json5',
    login: true,
  },
  {
    name: 'Genre_Edit_Form.json5',
    login: true,
  },
  {
    name: 'Recording_Edit_Form.json5',
    login: true,
  },
  {
    name: 'Release_Group_Edit_Form.json5',
    login: true,
  },
  {
    name: 'Vote_And_Note_Submission.json5',
    login: true,
    sql: 'vote_and_note_selenium.sql',
  },
];

if (!DBDefs.DISABLE_IMAGE_EDITING) {
  seleniumTests.push(
    {name: 'CAA.json5', login: true},
    {name: 'EAA.json5', login: true},
  );
}

/* eslint-enable sort-keys */

function setTestPath(test) {
  test.path = path.resolve(DBDefs.MB_SERVER_ROOT, 't/selenium', test.name);
}

function loadTestDocument(test) {
  test.document = JSON5.parse(fs.readFileSync(test.path));
}

async function runCommands(stest, commands, t) {
  await driver.manage().window().maximize();

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const reqsCountBeforeCommand = reqsCount;
    const locationBeforeCommand = await getDocumentLocation();

    await handleCommand(stest, {...command, index: i}, t);

    const locationAfterCommand = await getDocumentLocation();

    /*
     * Wait for sir queues to empty before proceeding. rabbitmqctl
     * list_queues is extremely slow (taking more than 500 ms to run on my
     * local machine), so we try to avoid this for commands that don't have
     * side-effects, like assertions. If no new requests have been made, we
     * also consider the command to be side-effect free.
     */
    if (
      process.env.SIR_DIR &&
      !/^assert/.test(command.command) &&
      reqsCount > reqsCountBeforeCommand
    ) {
      await checkSirQueues(t);
    }

    /*
     * Reset the `didShowBeforeUnloadAlert` flag used by the command
     * `assertBeforeUnloadAlertWasShown`. We only want the flag reset
     * when the location changes, but only after the
     * `assertBeforeUnloadAlertWasShown` command (which should immediately
     * follow the one changing the location) runs too.
     */
    if (
      locationAfterCommand.href !== locationBeforeCommand.href &&
      locationAfterCommand.protocol !== 'data:'
    ) {
      command.locationChanged = true;
    }

    const prevCommand = i > 0 ? commands[i - 1] : null;
    if (prevCommand?.locationChanged) {
      await driver.executeScript(
        'sessionStorage.setItem("didShowBeforeUnloadAlert", false);',
      );
    }

    if (argv.coverage) {
      await writePreviousSeleniumCoverage();
    }

    // Die if there are any JS errors on the page since the previous command
    const errors = await getPageErrors();

    if (errors.length) {
      throw new Error(
        'Errors were found on the page ' +
        'since executing the previous command:\n' +
        errors.join('\n\n'),
      );
    }

    // The CATALYST_DEBUG views interfere with our tests. Remove them.
    await driver.executeScript(`
      node = document.getElementById('plDebug');
      if (node) node.remove();
    `);
  }
}

(async function runTests() {
  const TEST_TIMEOUT = 480000; // 8 minutes

  async function cleanSeleniumDb(t, extraSql) {
    const startTime = new Date();
    await execFile(
      path.resolve(DBDefs.MB_SERVER_ROOT, 'script/reset_selenium_env.sh'),
      extraSql
        ? [path.resolve(DBDefs.MB_SERVER_ROOT, 't/sql', extraSql)]
        : [],
    );
    const finishTime = new Date();
    const elapsedTime = (finishTime - startTime) / 1000;
    t.comment(timePrefix(
      `cleanSeleniumDb(): took ${elapsedTime} seconds`,
    ));
  }

  seleniumTests.forEach(setTestPath);
  const loginPlan = {name: 'Log_In.json5'};
  const logoutPlan = {name: 'Log_Out.json5'};
  setTestPath(loginPlan);
  setTestPath(logoutPlan);

  const testsPathsToRun = argv._.map(x => path.resolve(x));
  let testsToRun = testsPathsToRun.length
    ? seleniumTests.filter(x => testsPathsToRun.includes(x.path))
    : seleniumTests;

  const partitionConfig = argv.runPartition;
  if (partitionConfig) {
    if (testsPathsToRun.length) {
      console.error('Cannot specify a list of tests in addition to run-partition');
      quit();
      process.exit(1);
    }
    const match = partitionConfig.match(/^([0-9]+)\/([0-9]+)$/);
    const partitionToRun = match ? parseInt(match[1], 10) : -1;
    const numPartitions = match ? parseInt(match[2], 10) : -1;
    if (
      numPartitions < 2 ||
      numPartitions > seleniumTests.length ||
      partitionToRun < 1 ||
      partitionToRun > numPartitions
    ) {
      console.error('Invalid value for run-partition: ' + partitionConfig);
      quit();
      process.exit(1);
    }
    seleniumTests.forEach(loadTestDocument);
    /*
     * Sort by number of commands (steps) in each test, then by name.
     * The first criterion is needed for the greedy number partitioning
     * algorithm to work more optimally. The second criterion is to ensure
     * a deterministic result.
     */
    seleniumTests.sort((a, b) => (
      (b.document.commands.length - a.document.commands.length) ||
      compareStrings(a.name, b.name)
    ));
    const partitions = Array.from({length: numPartitions}, () => ({
      tests: [],
      totalCommands: 0,
    }));
    for (const test of seleniumTests) {
      let smallestPartition = partitions[0];
      for (let i = 1; i < numPartitions; i++) {
        if (partitions[i].totalCommands < smallestPartition.totalCommands) {
          smallestPartition = partitions[i];
        }
      }
      smallestPartition.tests.push(test);
      smallestPartition.totalCommands += test.document.commands.length;
    }
    testsToRun = partitions[partitionToRun - 1].tests;
  } else {
    testsToRun.forEach(loadTestDocument);
  }

  loadTestDocument(loginPlan);
  loadTestDocument(logoutPlan);

  customProxyServer.listen(5051);

  let shouldCleanSeleniumDb = true;

  await testsToRun.reduce(function (accum, stest, index) {
    const {commands, title} = stest.document;

    let plan = 0;
    for (let i = 0; i < commands.length; i++) {
      const row = commands[i];
      if (/^assert/.test(row.command)) {
        plan++;
      }
    }

    const isLastTest = index === testsToRun.length - 1;
    let didTestFail = false;

    const testOptions = {objectPrintDepth: 10, timeout: TEST_TIMEOUT};

    return new Promise(function (resolve) {
      test(title, testOptions, function (t) {
        t.plan(plan);

        t.on('fail', () => {
          didTestFail = true;
        });

        t.on('end', () => {
          // Remove screenshots if the test was succesful.
          if (stest.screenshots?.length && !didTestFail) {
            for (const screenshotPath of stest.screenshots) {
              fs.unlinkSync(screenshotPath);
            }
          }
        });

        const timeout = setTimeout(resolve, TEST_TIMEOUT);

        accum.then(async function () {
          const hasExtraSql = typeof stest.sql === 'string';

          if (hasExtraSql || shouldCleanSeleniumDb) {
            await cleanSeleniumDb(t, stest.sql);
          }

          const startTime = new Date();

          let didDatabaseChange = hasExtraSql;
          const startTupStats = didDatabaseChange
            ? null
            : (await getSeleniumDbTupStats());

          const inspector = await logInspector(driver);
          await inspector.onConsoleEntry(function (log) {
            t.comment(`[${log.type}] [${log.level}] ${log.text}`);
          });

          try {
            if (stest.login) {
              await runCommands(loginPlan, loginPlan.document.commands, t);
            }

            await runCommands(stest, commands, t);

            if (!(isLastTest && argv.stayOpen)) {
              if (stest.login) {
                await runCommands(
                  logoutPlan,
                  logoutPlan.document.commands,
                  t,
                );
              }
            }
          } catch (error) {
            t.fail(
              'caught exception: ' +
              (error && error.stack ? error.stack : error.toString()),
            );
            throw error;
          } finally {
            await inspector.close();

            const finishTime = new Date();
            const elapsedTime = (finishTime - startTime) / 1000;
            t.comment(timePrefix(
              `${title}: took ${elapsedTime} seconds`,
            ));

            if (!didDatabaseChange) {
              const finishTupStats = await getSeleniumDbTupStats();
              didDatabaseChange = (
                finishTupStats.tup_inserted > startTupStats.tup_inserted ||
                finishTupStats.tup_updated > startTupStats.tup_updated ||
                finishTupStats.tup_deleted > startTupStats.tup_deleted
              );
            }

            /*
             * Tests always run serially, one after another.
             * The require-atomic-updates violation appears to be a false-
             * positive from eslint.
             */
            // eslint-disable-next-line require-atomic-updates
            shouldCleanSeleniumDb = didDatabaseChange;
          }

          t.end();
          clearTimeout(timeout);
          resolve();
        });
      });
    });
  }, Promise.resolve());

  if (argv.coverage) {
    const remainingCoverage = await driver.executeScript(
      'return JSON.stringify(window.__coverage__)',
    );
    if (remainingCoverage) {
      writeSeleniumCoverage(remainingCoverage);
    }
  }

  if (!argv.stayOpen) {
    await quit();
  }
}());
