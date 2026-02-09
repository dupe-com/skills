---
name: ascii-renderer
description: Generate ASCII art from images or text using shape vector rendering. Creates sharp-edged ASCII art banners, converts photos to terminal art, and renders text with customizable fonts.
---

# ASCII Art Renderer

Convert images or text to ASCII art using the **shape vector algorithm** - a technique that produces sharp edges instead of blurry pixelated results.

Based on [Alex Harri's ASCII rendering research](https://alexharri.com/blog/ascii-rendering).

## When to Use This Skill

Activate this skill when:
- User wants to create ASCII text banners (e.g., "make ASCII art saying HELLO")
- Converting images to ASCII art for terminals or READMEs
- Generating retro/terminal aesthetic text
- Building CLI tool splash screens or headers

## When NOT to Use This Skill

Skip this skill when:
- User needs simple block letters (figlet/toilet may be simpler)
- Color ASCII art is required (this produces monochrome output)
- User wants emoji or unicode art (this uses standard ASCII characters)

## Quick Start

### Text to ASCII

```bash
# Basic text banner
bun run scripts/render.ts --text "DUPE.COM"

# Filled letters (inverted)
bun run scripts/render.ts --text "HELLO" --invert --cols 80

# Custom font and size
bun run scripts/render.ts --text "WOW" --font "Impact" --cols 60 --rows 12
```

### Image to ASCII

```bash
# Convert image
bun run scripts/render.ts photo.png --cols 80 --rows 40

# Demo sphere (no image needed)
bun run scripts/render.ts --demo
```

## Command Reference

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--text` | `-t` | - | Text to render as ASCII art |
| `--cols` | `-c` | 80 | Output width in characters |
| `--rows` | `-r` | auto | Output height (auto-calculated for text) |
| `--invert` | `-i` | false | Invert colors (filled vs outlined) |
| `--font` | `-f` | Arial Black | Font for text rendering |
| `--contrast` | - | 1.5 | Contrast enhancement (higher = sharper) |
| `--demo` | `-d` | false | Render demo sphere |
| `--help` | `-h` | - | Show help |

## Examples

### Text Banner (Outlined)

```bash
bun run scripts/render.ts --text "DUPE" --cols 60
```

```
@@@@@TTTTTTTT@@@@TTT@@@@TTT@@FTTTTTTT#@@FTTTTTTTT%@@@@@
@@@@@        `#@@   #@@@   #@i  ,w:   %@i  ,;;;;;]@@@@@
@@@@@   ]@@i  `@@   #@@@   #@i  `@@i  ]@i  J@@@@@@@@@@@
@@@@@   ]@@D   @@   #@@@   #@i  `T^   W@i        @@@@@@
@@@@@   ]@@P   @@   #@@@   #@i  ,cssw#@@i  ,=====@@@@@@
@@@@@   J#P'  s@@.  J#@t  ,@@i  `@@@@@@@i  `@@@###@@@@@
@@@@@        ,@@@W.      ,W@@i  `@@@@@@@i        ]@@@@@
@@@@@=======#@@@@@@==www=@@@@#===@@@@@@@#========#@@@@@
```

### Text Banner (Filled/Inverted)

```bash
bun run scripts/render.ts --text "DUPE" --cols 60 --invert
```

```
     =======w:   a===   a===  a======ww  ,=========:
     @@@P#@@@w  &@@@   J@@@  ]@@@PP#@@# `@@@@PPPPP'
     @@@i  `@@@i &@@D   J@@@  ]@@@,,W@@@ ,@@@lwwwwc
     @@@i   @@@i &@@D   ]@@@  ]@@@@@@@P' `@@@@PPPPP
     @@@l,;w@@@' ]@@@c.,W@@@  ]@@@       ,@@@l.,.,..
     @@@@@@@@P'   T@@@@@@@P'  ]@@@       `@@@@@@@@@i
```

## How It Works: Shape Vectors

Traditional ASCII converters map pixel brightness → single character. This creates blurry results.

**Shape vectors** capture character *geometry* using 6 sampling regions per cell:

```
┌─────────────┐
│  ●₀    ●₁   │   ← Top samples
│  ●₂    ●₃   │   ← Middle samples
│  ●₄    ●₅   │   ← Bottom samples
└─────────────┘
```

Each ASCII character has a unique 6D "shape signature". The algorithm finds the best-matching character for each image cell based on geometric similarity, not just brightness.

This produces sharp edges that follow the actual boundaries in the image.

## Requirements

- **Runtime:** Bun (or Node.js with modifications)
- **Dependencies:** `sharp` for image processing

```bash
bun add sharp
```

## Available Fonts

Font availability depends on your system. Common options:
- Arial Black (default, bold and clean)
- Impact (condensed, strong)
- Helvetica Bold
- Georgia
- Times New Roman
- Courier New

## Further Reading

- [Original blog post](https://alexharri.com/blog/ascii-rendering) - Deep dive into the algorithm
- Shape vector math and K-d tree optimization details in the source code
