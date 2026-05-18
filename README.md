# @abeedoo/gho

Minimal CLI for managing Ghost CMS posts, pages, and tags. Zero dependencies.

**[npm](https://www.npmjs.com/package/@abeedoo/gho)** · **[GitHub](https://github.com/abeedoolabs/ghost-cli)**

## Install

```bash
npm install -g @abeedoo/gho
```

Or use with npx:

```bash
npx @abeedoo/gho list posts
```

## Setup

Get your Admin API key from Ghost Admin → Settings → Integrations → Add custom integration.

Configure credentials using any of these methods (checked in priority order):

### 1. Environment variables

```bash
export GHOST_URL=https://your-ghost-site.com
export GHOST_ADMIN_API_KEY=your-id:your-secret
```

### 2. --env flag

```bash
gho --env /path/to/config list posts
```

### 3. `.ghost-cli` file (recommended)

Create a `.ghost-cli` file in your project root:

```
GHOST_URL=https://your-ghost-site.com
GHOST_ADMIN_API_KEY=your-id:your-secret
```

Add `.ghost-cli` to your `.gitignore` — it contains secrets.

### 4. `.env` file

Falls back to `.env` if no `.ghost-cli` file is found:

```env
GHOST_URL=https://your-ghost-site.com
GHOST_ADMIN_API_KEY=your-id:your-secret
```

### Multi-site config

Your `.ghost-cli` file can contain multiple sites using `[section]` headers:

```
# Default site (used when no --site flag)
GHOST_URL=https://myblog.com
GHOST_ADMIN_API_KEY=id:secret

[staging]
GHOST_URL=https://staging.myblog.com
GHOST_ADMIN_API_KEY=id:secret

[client-blog]
GHOST_URL=https://client.example.com
GHOST_ADMIN_API_KEY=id:secret
```

Use with the `--site` flag:

```bash
gho --site staging list posts
gho --site client-blog publish my-post
gho list posts                          # uses default
```

## Commands

### List content

```bash
gho list posts                    # all posts
gho list posts --status draft     # drafts only
gho list posts --status published # published only
gho list pages                    # all pages
```

### Create a draft

```bash
gho draft my-post-slug "My Post Title" content.md
```

Creates a draft post from a markdown file. If the file starts with `# Title`, the first line is stripped (the title comes from the argument). If a post with that slug already exists, it's replaced.

### Publish / Unpublish

```bash
gho publish my-post-slug
gho unpublish my-post-slug
```

### Get post details

```bash
gho get my-post-slug
```

Shows title, status, URL, preview link, tags, and excerpt.

### Update content

```bash
gho update my-post-slug updated-content.md
```

Replaces the post content from a markdown file. Preserves title, tags, and status.

### Delete

```bash
gho delete my-post-slug
```

### List tags

```bash
gho tags
```

Shows all tags with post counts, sorted by usage.

## How It Works

Uses Ghost's Admin API with JWT authentication. The CLI constructs JWTs from your Admin API key using Node's built-in `crypto` module — no external dependencies.

Posts are created using Ghost's mobiledoc format with a markdown card, which means your markdown is rendered by Ghost's markdown engine (including code blocks, links, images, etc.).

## License

MIT — [Clifford Meece](https://cliffordmeece.com)
