# Scrawl

Draw your own spells and duel on one shared page. **Play: https://scrawl.rennko.tech**

Scrawl is a real-time wizard duel drawn in ink on parchment. You teach the game six runes of your own (draw each glyph three times), give each one an element and a form, then draw them anywhere on the page mid-fight. Where you draw is where the spell happens, how big you draw sets its power, and how neatly you draw makes it stronger.

- **Forms:** Bolt (flies straight from where you drew it), Wall (stands where you drew it, as tall as your drawing), Shield, Sigil (anywhere on the page, ignites a moment later), Orb (hunts the enemy).
- **Elements:** Fire > Life > Earth > Storm > Frost > Fire, plus Void, which slips through walls.
- **Fusions:** draw a rune on top of your own wall, sigil or orb to fuse them (Plasma, Glacier, Eclipse…). A bolt drawn on your own wall launches it as a Ram.
- **Flourish:** chain casts within 1.6 s for up to ×1.4 power.
- **Modes:** online rooms with a 4-letter code or link, and three automaton opponents that draw their runes stroke by stroke.
- Best of three rounds, 90 seconds each. Ink (mana) and per-rune drying time (cooldowns).

## How it works

- Plain ES modules in `public/js`, no bundler. Canvas 2D for everything; the parchment, wizards and effects are drawn in code. Sounds are synthesized with WebAudio.
- Rune recognition is the $P point-cloud recognizer (`recognizer.js`), so multi-stroke glyphs and any stroke order work.
- `sim.js` is the whole duel. In online rooms the host's browser runs it and sends snapshots; the guest sends casts and moves.
- `src/worker.js` is a Cloudflare Worker plus a `Room` Durable Object that only relays messages between the two players.
- Your runebook is saved in the browser (export/import as JSON).

## Build

```bash
./build.sh check    # syntax check + headless recognizer and bot-vs-bot tests
./build.sh dev      # local game + rooms at http://localhost:8787
./build.sh deploy   # publish to Cloudflare Workers (scrawl.rennko.tech)
```

Made by **Virat Reddy Kaukuntla** ([@learningnihongo934-byte](https://github.com/learningnihongo934-byte))
