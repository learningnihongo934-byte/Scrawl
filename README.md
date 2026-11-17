# Scrawl

Draw your own spells and duel on one shared page. **Play: https://scrawl.rennko.tech**

Scrawl is a real-time wizard duel on an open spellbook lying on a desk, in 3D. You teach the game six runes of your own (draw each glyph three times), give each one of 11 elements and one of 24 forms, then draw them on the book mid-fight. Where you draw is where the spell happens, how big you draw sets its power, and how neatly you draw makes it stronger. Wizards stand their ground: you block, shoot spells down, shield and curse.

- **24 forms:** shots (Bolt, Scatter, Beam, Orb, Familiar), lobs (Sigil, Comet, Rain), a Totem turret, guards (Wall, Mirror, Mine, Mire, Vortex), self spells (Shield, Thorns, Mend, Haste, Cleanse, Echo) and curses (Hex, Mark, Silence, Leech).
- **11 elements**, each strong against two others with its own status: burn, chill, shock, poison, winded, dazzle, hex, shield-shatter, drain, plus heavy Earth and wall-piercing Void.
- **Fusions:** draw a rune on top of your own spell to fuse them: 55 named pairs from Plasma to Shadowsteel. A bolt drawn on your own wall launches it as a Ram.
- **Quick cast:** keys 1 to 6 or tap a rune to cast it at 70% strength without drawing.
- **Flourish:** chain casts within 1.6 s for up to ×1.4 power.
- **Modes:** a guided tutorial, three automaton opponents that draw their runes stroke by stroke, and online rooms with a 4-letter code or link.
- Best of three rounds, 90 seconds each. Ink (mana) and per-rune drying time (cooldowns).

## How it works

- Plain ES modules in `public/js`, no bundler. Three.js (vendored in `public/vendor`) renders the desk, book, low-poly wizards and spells; the page itself is a Canvas 2D texture where ink, stains and sigil circles are drawn. Sounds are synthesized with WebAudio.
- Runes are recognized from the strokes as you saw them on screen, then placed where they landed on the page.
- Rune recognition is the $P point-cloud recognizer (`recognizer.js`), so multi-stroke glyphs and any stroke order work.
- `sim.js` is the whole duel. In online rooms the host's browser runs it and sends snapshots; the guest sends casts and moves.
- `src/worker.js` is a Cloudflare Worker plus a `Room` Durable Object that only relays messages between the two players.
- Your runebook is saved in the browser (export/import as JSON).

## Build

```bash
./build.sh check    # syntax check + recognizer, bot-vs-bot and every-spell tests
./build.sh dev      # local game + rooms at http://localhost:8787
./build.sh deploy   # publish to Cloudflare Workers (scrawl.rennko.tech)
```

Made by **Virat Reddy Kaukuntla** ([@learningnihongo934-byte](https://github.com/learningnihongo934-byte))
