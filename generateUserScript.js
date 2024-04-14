const fs = require('fs');
const manifest = require('./dist/manifest.json');
const npmPackage = require('./package.json');

const injector = fs.readFileSync('./dist/js/manifoldClientInjector.js', { encoding: 'utf-8' });

const content = `// ==UserScript==
// @name         Manifold Client - Bonk.io
// @version      ${npmPackage.version}
// @author       SneezingCactus
// @namespace    https://github.com/SneezingCactus
// @description  ${manifest.description}
// @homepage     ${manifest.homepage_url}
// @match        https://*.bonk.io/gameframe-release.html
// @run-at       document-start
// @grant        none
// ==/UserScript==
/*
  Required:
  https://greasyfork.org/en/scripts/433861-code-injector-bonk-io
*/

${injector}`;

fs.writeFileSync(`./web-ext-artifacts/manifold-client-${npmPackage.version}.user.js`, content);
