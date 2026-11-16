'use strict';
// Bundles the game into one self-contained HTML file (dist/cinderdeep.html) for web hosting or sharing.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => `<style>\n${fs.readFileSync(path.join(root, href), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => `<script>\n${fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/g, '<\\/script')}\n</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'cinderdeep.html');
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);

// A body-only fragment for hosts that supply their own document skeleton.
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const style = head.slice(head.indexOf('<style>'), head.indexOf('</style>') + 8);
const frag = `<title>Cinderdeep</title>\n${style}\n${body.trim()}\n`;
const out2 = path.join(root, 'dist', 'cinderdeep.fragment.html');
fs.writeFileSync(out2, frag);
console.log(`wrote ${path.relative(root, out2)} (${(frag.length / 1024).toFixed(0)} KB)`);
