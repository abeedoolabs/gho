#!/usr/bin/env node
// gho.mjs — manage Ghost posts/pages from the command line
// Usage:
//   node gho.mjs list [posts|pages] [--status draft|published|all]
//   node gho.mjs draft <slug> <title> <markdown-file>
//   node gho.mjs publish <slug>
//   node gho.mjs unpublish <slug>
//   node gho.mjs delete <slug>
//   node gho.mjs get <slug>
//   node gho.mjs update <slug> <markdown-file>
//   node gho.mjs tags

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Load config — priority: env vars > --env flag > --site in .gho > .gho default > .env

// Parse a flat env file into { key: value }
function loadFlat(filePath) {
  const vars = {};
  if (fs.existsSync(filePath)) {
    fs.readFileSync(filePath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([^#=\[]+)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim();
    });
  }
  return vars;
}

// Parse a .gho file with optional [site] sections
// Format:
//   # default site (no section header)
//   GHOST_URL=https://default-site.com
//   GHOST_ADMIN_API_KEY=id:secret
//
//   [staging]
//   GHOST_URL=https://staging.example.com
//   GHOST_ADMIN_API_KEY=id:secret
//
//   [production]
//   GHOST_URL=https://example.com
//   GHOST_ADMIN_API_KEY=id:secret
function loadGhostCli(filePath) {
  const sites = { default: {} };
  if (!fs.existsSync(filePath)) return sites;
  let current = 'default';
  fs.readFileSync(filePath, 'utf8').split('\n').forEach(line => {
    const section = line.match(/^\[([^\]]+)\]/);
    if (section) {
      current = section[1].trim();
      sites[current] = sites[current] || {};
      return;
    }
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) sites[current][m[1].trim()] = m[2].trim();
  });
  return sites;
}

// Strip flags from argv
function consumeFlag(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const val = process.argv[idx + 1];
  process.argv.splice(idx, 2);
  return val;
}

const envFile = consumeFlag('--env');
const siteName = consumeFlag('--site');

let fileVars = {};
if (envFile) {
  if (!fs.existsSync(envFile)) { console.error(`File not found: ${envFile}`); process.exit(1); }
  fileVars = loadFlat(envFile);
} else {
  const ghostCliPath = path.resolve(process.cwd(), '.gho');
  const dotEnvPath = path.resolve(process.cwd(), '.env');

  if (siteName) {
    // --site requires .gho with sections
    if (!fs.existsSync(ghostCliPath)) {
      console.error('--site requires a .gho file with [section] headers');
      process.exit(1);
    }
    const sites = loadGhostCli(ghostCliPath);
    if (!sites[siteName]) {
      console.error(`Site "${siteName}" not found in .gho`);
      console.error(`Available sites: ${Object.keys(sites).filter(s => s !== 'default' || Object.keys(sites[s]).length).join(', ')}`);
      process.exit(1);
    }
    fileVars = sites[siteName];
  } else if (fs.existsSync(ghostCliPath)) {
    const sites = loadGhostCli(ghostCliPath);
    fileVars = sites.default;
  } else if (fs.existsSync(dotEnvPath)) {
    fileVars = loadFlat(dotEnvPath);
  }
}

const GHOST_URL = process.env.GHOST_URL || fileVars.GHOST_URL;
const ADMIN_KEY = process.env.GHOST_ADMIN_API_KEY || fileVars.GHOST_ADMIN_API_KEY;
if (!GHOST_URL) {
  console.error('GHOST_URL not found. Set it via:');
  console.error('  - Environment variable: export GHOST_URL=https://...');
  console.error('  - Flag: gho --env /path/to/config list posts');
  console.error('  - Config file: .gho or .env in current directory');
  console.error('  - Multi-site: gho --site staging list posts');
  process.exit(1);
}
if (!ADMIN_KEY) {
  console.error('GHOST_ADMIN_API_KEY not found. Set it via:');
  console.error('  - Environment variable: export GHOST_ADMIN_API_KEY=id:secret');
  console.error('  - Flag: gho --env /path/to/config list posts');
  console.error('  - Config file: .gho or .env in current directory');
  console.error('  - Multi-site: gho --site staging list posts');
  process.exit(1);
}

const [id, secret] = ADMIN_KEY.split(':');

function makeToken() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
  const sig = crypto.createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function api(endpoint, opts = {}) {
  const url = `${GHOST_URL}/ghost/api/admin/${endpoint}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Ghost ${makeToken()}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers
    }
  });
  if (res.status === 204) return null;
  return res.json();
}

async function findPost(slug, status = 'all', formats = '') {
  const fmt = formats ? `&formats=${formats}` : '';
  const d = await api(`posts/?filter=slug:${slug}&status=${status}&limit=1${fmt}`);
  return d.posts?.[0] || null;
}

async function findPage(slug) {
  const d = await api(`pages/?filter=slug:${slug}&status=all&limit=1`);
  return d.pages?.[0] || null;
}

function mdToMobiledoc(markdown) {
  return JSON.stringify({
    version: '0.3.1', atoms: [], cards: [['markdown', { markdown }]], markups: [], sections: [[10, 0]]
  });
}

function htmlToMobiledoc(html) {
  return JSON.stringify({
    version: '0.3.1', atoms: [], cards: [['html', { html }]], markups: [], sections: [[10, 0]]
  });
}

// Version & help flags (check before config so they work without credentials)
const VERSION = '1.0.0';
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`gho v${VERSION}`);
  process.exit(0);
}
if (process.argv.includes('--help') || process.argv.includes('-h') || process.argv.length <= 2) {
  console.log(`gho v${VERSION} — manage Ghost posts from the command line

Commands:
  list [posts|pages] [--status draft|published|all]
  draft <slug> <title> <markdown-file>
  publish <slug>
  unpublish <slug>
  delete <slug>
  get <slug>
  update <slug> <markdown-file>
  retitle <slug> <new title>
  tags

Options:
  --site <name>   Use a named site from .gho
  --env <file>    Load config from a specific file
  --version, -v   Show version
  --help, -h      Show this help

Config (priority order):
  1. Environment variables: GHOST_URL, GHOST_ADMIN_API_KEY
  2. --env <file> flag
  3. .gho file (supports multiple sites via [sections])
  4. .env file in current directory

Multi-site .gho example:
  GHOST_URL=https://default-site.com
  GHOST_ADMIN_API_KEY=id:secret

  [staging]
  GHOST_URL=https://staging.example.com
  GHOST_ADMIN_API_KEY=id:secret`);
  process.exit(0);
}

// Commands
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'list': {
    const type = args[0] || 'posts';
    const statusFlag = args.indexOf('--status');
    const status = statusFlag > -1 ? args[statusFlag + 1] : 'all';
    const statusParam = status === 'all' ? 'status=all' : `status=${status}&filter=status:${status}`;
    const d = await api(`${type}/?${statusParam}&limit=50&order=updated_at%20desc`);
    const items = d[type] || [];
    if (!items.length) { console.log('No items found.'); break; }
    const maxTitle = Math.max(...items.map(p => p.title.length), 5);
    console.log(`${'TITLE'.padEnd(maxTitle)}  ${'STATUS'.padEnd(10)}  ${'SLUG'.padEnd(30)}  UPDATED`);
    console.log('-'.repeat(maxTitle + 55));
    items.forEach(p => {
      const date = new Date(p.updated_at).toLocaleDateString();
      console.log(`${p.title.padEnd(maxTitle)}  ${p.status.padEnd(10)}  ${p.slug.padEnd(30)}  ${date}`);
    });
    break;
  }

  case 'draft': {
    const [slug, title, file] = args;
    if (!slug || !title || !file) { console.error('Usage: draft <slug> <title> <markdown-file>'); break; }
    const src = fs.readFileSync(file, 'utf8');
    // If file starts with #, strip the title line from markdown
    const lines = src.split('\n');
    const markdown = lines[0].startsWith('# ') ? lines.slice(1).join('\n').trim() : src.trim();
    const mobiledoc = mdToMobiledoc(markdown);

    // Check if exists
    const existing = await findPost(slug);
    if (existing) {
      await api(`posts/${existing.id}/`, { method: 'DELETE' });
      console.log(`Deleted existing: ${slug}`);
    }

    const d = await api('posts/', {
      method: 'POST',
      body: JSON.stringify({ posts: [{ title, slug, status: 'draft', mobiledoc }] })
    });
    console.log(`Draft created: ${d.posts[0].url}`);
    console.log(`Preview: ${GHOST_URL}/p/${d.posts[0].uuid}/`);
    break;
  }

  case 'publish': {
    const slug = args[0];
    if (!slug) { console.error('Usage: publish <slug>'); break; }
    const post = await findPost(slug);
    if (!post) { console.error(`Post not found: ${slug}`); break; }
    const d = await api(`posts/${post.id}/`, {
      method: 'PUT',
      body: JSON.stringify({ posts: [{ status: 'published', updated_at: post.updated_at }] })
    });
    console.log(`Published: ${d.posts[0].url}`);
    break;
  }

  case 'unpublish': {
    const slug = args[0];
    if (!slug) { console.error('Usage: unpublish <slug>'); break; }
    const post = await findPost(slug);
    if (!post) { console.error(`Post not found: ${slug}`); break; }
    const d = await api(`posts/${post.id}/`, {
      method: 'PUT',
      body: JSON.stringify({ posts: [{ status: 'draft', updated_at: post.updated_at }] })
    });
    console.log(`Unpublished: ${slug} → draft`);
    break;
  }

  case 'delete': {
    const slug = args[0];
    if (!slug) { console.error('Usage: delete <slug>'); break; }
    const post = await findPost(slug);
    if (!post) { console.error(`Post not found: ${slug}`); break; }
    await api(`posts/${post.id}/`, { method: 'DELETE' });
    console.log(`Deleted: ${slug}`);
    break;
  }

  case 'get': {
    const slug = args[0];
    if (!slug) { console.error('Usage: get <slug>'); break; }
    const post = await findPost(slug);
    if (!post) { console.error(`Post not found: ${slug}`); break; }
    console.log(`Title:   ${post.title}`);
    console.log(`Slug:    ${post.slug}`);
    console.log(`Status:  ${post.status}`);
    console.log(`URL:     ${post.url}`);
    console.log(`UUID:    ${post.uuid}`);
    console.log(`Preview: ${GHOST_URL}/p/${post.uuid}/`);
    console.log(`Created: ${post.created_at}`);
    console.log(`Updated: ${post.updated_at}`);
    console.log(`Tags:    ${(post.tags || []).map(t => t.name).join(', ') || 'none'}`);
    console.log(`Excerpt: ${(post.custom_excerpt || post.excerpt || '').substring(0, 120)}...`);
    break;
  }

  case 'update': {
    const [slug, file] = args;
    if (!slug || !file) { console.error('Usage: update <slug> <markdown-file>'); break; }
    const post = await findPost(slug, 'all', 'mobiledoc,lexical');
    if (!post) { console.error(`Post not found: ${slug}`); break; }
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    const markdown = lines[0].startsWith('# ') ? lines.slice(1).join('\n').trim() : src.trim();

    if (post.lexical && !post.mobiledoc) {
      // Post was converted to lexical — must delete and recreate
      const { title, status, tags } = post;
      const tagNames = (tags || []).map(t => ({ name: t.name }));
      await api(`posts/${post.id}/`, { method: 'DELETE' });
      const mobiledoc = mdToMobiledoc(markdown);
      const d = await api('posts/', {
        method: 'POST',
        body: JSON.stringify({ posts: [{ title, slug, status, tags: tagNames, mobiledoc }] })
      });
      console.log(`Updated (recreated from lexical): ${slug}`);
    } else {
      const mobiledoc = mdToMobiledoc(markdown);
      const d = await api(`posts/${post.id}/`, {
        method: 'PUT',
        body: JSON.stringify({ posts: [{ mobiledoc, updated_at: post.updated_at }] })
      });
      console.log(`Updated: ${slug}`);
    }
    break;
  }

  case 'retitle': {
    const [slug, ...titleParts] = args;
    const newTitle = titleParts.join(' ');
    if (!slug || !newTitle) { console.error('Usage: retitle <slug> <new title>'); break; }
    const post = await findPost(slug);
    if (!post) { console.error(`Post not found: ${slug}`); break; }
    const d = await api(`posts/${post.id}/`, {
      method: 'PUT',
      body: JSON.stringify({ posts: [{ title: newTitle, updated_at: post.updated_at }] })
    });
    console.log(`Retitled: "${post.title}" → "${newTitle}"`);
    break;
  }

  case 'tags': {
    const d = await api('tags/?limit=all&order=count.posts desc&include=count.posts');
    const tags = d.tags || [];
    if (!tags.length) { console.log('No tags.'); break; }
    tags.forEach(t => console.log(`${String(t.count?.posts || 0).padStart(3)} ${t.name}`));
    break;
  }

  default:
    console.error(`Unknown command: ${cmd}`);
    console.error('Run gho --help for usage.');
}
