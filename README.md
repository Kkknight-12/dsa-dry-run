# DSA Dry Run Lab

An interactive canvas for working through data structures by hand. Swap array values, move pointers, build stacks and queues, connect nodes, and use undo/redo while exploring a problem.

[Source](https://github.com/Kkknight-12/dsa-dry-run) · [Local board after starting Vite](http://localhost:5173/)

A hosted demo URL and fresh board screenshot have not been verified. Setup requires Linux tooling; native macOS setup is not established.

## Two-minute walkthrough

1. Start with the supplied two-pointer scene. Drag one array value onto another to swap them; drag a pointer label to snap it to a different index.
2. Select an object to edit values, name, color or attached array in the inspector.
3. Add an array, number token, pointer, node, stack, queue or note. Use a node's **Connect** action and select another node to make a directed link.
4. Use **Mark step** to record an observation. Undo/redo applies to scene edits; the trace is a separate log.
5. Use **Save workspace** and **Restore** in the same browser and origin.

This is a manual workspace. It does not execute a supplied algorithm or grade the answer.

## Local prerequisites and setup

Use **Node.js 22.13.0 or newer**, npm and **Linux** with Bash, `flock`, GNU `timeout`, `curl` and `sha256sum`. Installation also uses Linux `/proc`, GNU-style `readlink -f` and Bash `mapfile`.

```bash
git clone https://github.com/Kkknight-12/dsa-dry-run.git
cd dsa-dry-run
npm run install:ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open [the board](http://localhost:5173/). Installation is one bounded lockfile install with concurrency and integrity checks. Wait for it to finish before other dependency commands.

On this Mac, `npm run install:ci` exited 69 with **requires Linux flock**; `npm run build` exited 69 with **requires GNU timeout**. Node 22.12.0 was also below the project's requirement. No verified Mac alternative is supplied.

## Keyboard controls

Click the canvas to focus it before using shortcuts.

| Key | Action |
| --- | --- |
| Arrow keys | Nudge an object; left/right moves a pointer or swaps a selected array cell with its neighbor |
| Shift + arrow keys | Larger nudges for positioned objects |
| Delete / Backspace | Delete selection |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z, or Ctrl/Cmd + Y | Redo |
| Enter | Add a manual checkpoint |
| Escape | Clear selection and cancel node connection |

## Saving and limits

**Save workspace** serializes scene objects to localStorage key `dsa-dry-run-lab-v1`. Storage belongs to this browser and origin; another device or port has separate storage. Restore is explicit.

Only scene objects are saved. Undo/redo history, trace, zoom, selection and the separate scratch-note textarea are omitted. Note objects placed on the board are scene objects and are saved.

Storage reads/writes are not guarded against access or quota failures. Restore catches parse/copy errors but does not validate scene schema or cross-object references. Storage hardening and interaction tests remain future work.

## Commands and checks

Run these in the supported Linux environment:

```bash
npm run lint
npm run build
npm test
npm run validate:artifact
npm run start
```

`build` runs a bounded Vinext build and artifact validation. `npm test` builds again, then checks rendered development-preview metadata through the worker. `validate:artifact` rechecks existing `dist/` output and the worker export. These checks do not exercise dragging, swaps, undo/redo or persistence. `start` serves a built application; use its printed address.

On 12 October 2026, all four shell helpers passed `bash -n`. Install/build were blocked on macOS as above. Lint, runtime interactions, artifact validation and tests were not run because the supported installation/build path was unavailable. No Linux pass is claimed.

## Source map

- [app/page.tsx](app/page.tsx): scene types, drawing, hit testing, drag/keyboard handling, history, persistence and UI, currently combined in one file.
- [app/globals.css](app/globals.css): board/inspector styling.
- [app/layout.tsx](app/layout.tsx): metadata and fonts.
- [scripts/install-ci.sh](scripts/install-ci.sh), [scripts/build-verified.sh](scripts/build-verified.sh), [scripts/sites-env.sh](scripts/sites-env.sh) and [scripts/validate-artifact.sh](scripts/validate-artifact.sh): install, environment, build and artifact helpers.
- [tests/rendered-html.test.mjs](tests/rendered-html.test.mjs): current metadata check.

Built with React, TypeScript, Canvas, Tailwind CSS and [Vinext](https://github.com/cloudflare/vinext). This draft adds no project license.

## Optional starter infrastructure

[vite.config.ts](vite.config.ts), [db/](db/), [drizzle.config.ts](drizzle.config.ts) and [examples/d1/](examples/d1/) retain optional Cloudflare D1/Drizzle infrastructure. [app/chatgpt-auth.ts](app/chatgpt-auth.ts) provides optional platform sign-in helpers. The board page saves to browser localStorage independently of this infrastructure.
