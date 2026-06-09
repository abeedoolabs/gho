---
name: gho
description: Manage Ghost CMS blog posts from the command line. Draft, publish, update, delete, list posts and pages, manage tags.
when_to_use: When the user wants to create, publish, update, list, or delete Ghost blog posts or pages. Also when they mention drafts, blog content, or Ghost CMS operations.
allowed-tools: Bash(gho *)
arguments: [action]
---

# gho — Ghost CMS CLI

Manage Ghost blog posts, pages, and tags using the `gho` CLI.

## Prerequisites

- `npm install -g @abeedoo/gho`
- A `.gho` config file in the project root (or `.env`) with `GHOST_URL` and `GHOST_ADMIN_API_KEY`

## Commands

### List content
```bash
gho list posts                      # all posts
gho list posts --status draft       # drafts only
gho list posts --status published   # published only
gho list pages                      # all pages
```

### Create a draft from markdown
```bash
gho draft <slug> "<title>" <markdown-file>
```
If the markdown file starts with `# Title`, the first line is stripped. If a post with that slug exists, it is replaced.

### Publish / Unpublish
```bash
gho publish <slug>
gho unpublish <slug>
```

### Get post details
```bash
gho get <slug>
```

### Update post content
```bash
gho update <slug> <markdown-file>
```
Detects lexical-format posts and recreates them automatically.

### Change title
```bash
gho retitle <slug> <new title>
```

### Delete
```bash
gho delete <slug>
```
Always confirm with the user before deleting.

### List tags
```bash
gho tags
```

## Workflow

The typical workflow for creating and publishing a blog post:

1. Write markdown in `drafts/<slug>.md`
2. `gho draft <slug> "<title>" drafts/<slug>.md` — creates a draft on Ghost
3. User reviews the preview link
4. `gho publish <slug>` — when the user says "publish"

For updates: edit the markdown file, then `gho update <slug> drafts/<slug>.md`.

## Multi-site

Use `--site <name>` to target a specific Ghost instance configured in `.gho`:

```bash
gho --site staging list posts
gho --site client publish my-post
```

## Important

- Default to creating **drafts**, not published posts
- Only publish when the user explicitly says "publish"
- Always confirm before deleting
- The `update` command handles both mobiledoc and lexical format posts
