#!/usr/bin/env bun

/**
 * ASCII Art Renderer using Shape Vector Algorithm
 *
 * Converts images or text to ASCII art with sharp edge detection.
 *
 * Usage:
 *   bun run render.ts <image-path> [--cols N] [--rows N] [--contrast N]
 *   bun run render.ts --text "HELLO" [--font "Arial Black"] [--cols N]
 *
 * Examples:
 *   bun run render.ts photo.png
 *   bun run render.ts photo.jpg --cols 120 --rows 60
 *   bun run render.ts --text "DUPE.COM" --cols 80
 *   bun run render.ts --text "HELLO" --font "Impact" --cols 60
 */

import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'

// ============================================================================
// Character Shape Vectors
// ============================================================================

interface CharacterShape {
  character: string
  shapeVector: number[] // 6D vector [topLeft, topRight, midLeft, midRight, botLeft, botRight]
}

// Pre-computed shape vectors for ASCII characters
// Values represent ink density in each of 6 sampling regions
const CHARACTER_SHAPES: CharacterShape[] = [
  { character: ' ', shapeVector: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0] },
  { character: '.', shapeVector: [0.0, 0.0, 0.0, 0.0, 0.2, 0.0] },
  { character: "'", shapeVector: [0.3, 0.0, 0.0, 0.0, 0.0, 0.0] },
  { character: '`', shapeVector: [0.0, 0.3, 0.0, 0.0, 0.0, 0.0] },
  { character: ',', shapeVector: [0.0, 0.0, 0.0, 0.0, 0.0, 0.3] },
  { character: ':', shapeVector: [0.0, 0.0, 0.3, 0.0, 0.3, 0.0] },
  { character: ';', shapeVector: [0.0, 0.0, 0.3, 0.0, 0.2, 0.3] },
  { character: '-', shapeVector: [0.0, 0.0, 0.8, 0.8, 0.0, 0.0] },
  { character: '=', shapeVector: [0.0, 0.0, 0.8, 0.8, 0.8, 0.8] },
  { character: '+', shapeVector: [0.0, 0.4, 0.8, 0.8, 0.0, 0.4] },
  { character: '*', shapeVector: [0.3, 0.3, 0.5, 0.5, 0.3, 0.3] },
  { character: '~', shapeVector: [0.0, 0.0, 0.6, 0.6, 0.0, 0.0] },
  { character: '^', shapeVector: [0.4, 0.4, 0.0, 0.0, 0.0, 0.0] },
  { character: '"', shapeVector: [0.4, 0.4, 0.0, 0.0, 0.0, 0.0] },
  { character: '|', shapeVector: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4] },
  { character: '/', shapeVector: [0.0, 0.7, 0.4, 0.4, 0.7, 0.0] },
  { character: '\\', shapeVector: [0.7, 0.0, 0.4, 0.4, 0.0, 0.7] },
  { character: '(', shapeVector: [0.0, 0.5, 0.5, 0.0, 0.0, 0.5] },
  { character: ')', shapeVector: [0.5, 0.0, 0.0, 0.5, 0.5, 0.0] },
  { character: '[', shapeVector: [0.5, 0.5, 0.5, 0.0, 0.5, 0.5] },
  { character: ']', shapeVector: [0.5, 0.5, 0.0, 0.5, 0.5, 0.5] },
  { character: '{', shapeVector: [0.3, 0.5, 0.6, 0.0, 0.3, 0.5] },
  { character: '}', shapeVector: [0.5, 0.3, 0.0, 0.6, 0.5, 0.3] },
  { character: '<', shapeVector: [0.0, 0.5, 0.5, 0.0, 0.0, 0.5] },
  { character: '>', shapeVector: [0.5, 0.0, 0.0, 0.5, 0.5, 0.0] },
  { character: 'i', shapeVector: [0.3, 0.0, 0.5, 0.0, 0.5, 0.0] },
  { character: 'l', shapeVector: [0.5, 0.0, 0.5, 0.0, 0.5, 0.5] },
  { character: 'I', shapeVector: [0.5, 0.5, 0.4, 0.4, 0.5, 0.5] },
  { character: '!', shapeVector: [0.4, 0.0, 0.4, 0.0, 0.3, 0.0] },
  { character: 't', shapeVector: [0.5, 0.5, 0.5, 0.0, 0.3, 0.4] },
  { character: 'f', shapeVector: [0.3, 0.5, 0.5, 0.3, 0.5, 0.0] },
  { character: 'r', shapeVector: [0.0, 0.0, 0.5, 0.5, 0.5, 0.0] },
  { character: 'n', shapeVector: [0.0, 0.0, 0.6, 0.6, 0.5, 0.5] },
  { character: 'u', shapeVector: [0.0, 0.0, 0.5, 0.5, 0.5, 0.5] },
  { character: 'v', shapeVector: [0.0, 0.0, 0.5, 0.5, 0.3, 0.3] },
  { character: 'x', shapeVector: [0.0, 0.0, 0.6, 0.6, 0.6, 0.6] },
  { character: 'z', shapeVector: [0.0, 0.0, 0.6, 0.6, 0.6, 0.6] },
  { character: 'c', shapeVector: [0.0, 0.0, 0.5, 0.4, 0.5, 0.4] },
  { character: 'o', shapeVector: [0.0, 0.0, 0.5, 0.5, 0.5, 0.5] },
  { character: 'a', shapeVector: [0.0, 0.0, 0.5, 0.6, 0.5, 0.6] },
  { character: 'e', shapeVector: [0.0, 0.0, 0.6, 0.5, 0.5, 0.4] },
  { character: 's', shapeVector: [0.0, 0.0, 0.5, 0.4, 0.4, 0.5] },
  { character: 'J', shapeVector: [0.4, 0.5, 0.0, 0.5, 0.5, 0.4] },
  { character: 'L', shapeVector: [0.5, 0.0, 0.5, 0.0, 0.5, 0.5] },
  { character: 'C', shapeVector: [0.4, 0.5, 0.5, 0.0, 0.4, 0.5] },
  { character: 'U', shapeVector: [0.5, 0.5, 0.5, 0.5, 0.4, 0.4] },
  { character: 'O', shapeVector: [0.4, 0.4, 0.5, 0.5, 0.4, 0.4] },
  { character: '0', shapeVector: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
  { character: 'Q', shapeVector: [0.4, 0.4, 0.5, 0.5, 0.5, 0.6] },
  { character: 'Y', shapeVector: [0.5, 0.5, 0.3, 0.3, 0.3, 0.0] },
  { character: 'X', shapeVector: [0.6, 0.6, 0.4, 0.4, 0.6, 0.6] },
  { character: 'Z', shapeVector: [0.6, 0.6, 0.4, 0.4, 0.6, 0.6] },
  { character: 'm', shapeVector: [0.0, 0.0, 0.7, 0.7, 0.6, 0.6] },
  { character: 'w', shapeVector: [0.0, 0.0, 0.6, 0.6, 0.7, 0.7] },
  { character: 'q', shapeVector: [0.0, 0.0, 0.6, 0.6, 0.5, 0.6] },
  { character: 'p', shapeVector: [0.0, 0.0, 0.6, 0.6, 0.6, 0.5] },
  { character: 'd', shapeVector: [0.0, 0.5, 0.5, 0.5, 0.5, 0.5] },
  { character: 'b', shapeVector: [0.5, 0.0, 0.5, 0.5, 0.5, 0.5] },
  { character: 'k', shapeVector: [0.5, 0.0, 0.5, 0.5, 0.5, 0.5] },
  { character: 'h', shapeVector: [0.5, 0.0, 0.5, 0.5, 0.5, 0.5] },
  { character: 'A', shapeVector: [0.4, 0.4, 0.6, 0.6, 0.5, 0.5] },
  { character: 'V', shapeVector: [0.5, 0.5, 0.5, 0.5, 0.3, 0.3] },
  { character: 'T', shapeVector: [0.6, 0.6, 0.3, 0.3, 0.3, 0.0] },
  { character: 'N', shapeVector: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6] },
  { character: 'H', shapeVector: [0.5, 0.5, 0.6, 0.6, 0.5, 0.5] },
  { character: 'K', shapeVector: [0.5, 0.5, 0.6, 0.5, 0.5, 0.5] },
  { character: 'D', shapeVector: [0.6, 0.5, 0.6, 0.5, 0.6, 0.5] },
  { character: 'P', shapeVector: [0.6, 0.5, 0.6, 0.5, 0.5, 0.0] },
  { character: 'R', shapeVector: [0.6, 0.5, 0.6, 0.5, 0.5, 0.5] },
  { character: 'B', shapeVector: [0.6, 0.5, 0.6, 0.5, 0.6, 0.5] },
  { character: 'E', shapeVector: [0.6, 0.6, 0.6, 0.4, 0.6, 0.6] },
  { character: 'F', shapeVector: [0.6, 0.6, 0.6, 0.4, 0.5, 0.0] },
  { character: 'G', shapeVector: [0.5, 0.6, 0.5, 0.4, 0.5, 0.6] },
  { character: 'S', shapeVector: [0.5, 0.6, 0.5, 0.5, 0.6, 0.5] },
  { character: '#', shapeVector: [0.7, 0.7, 0.8, 0.8, 0.7, 0.7] },
  { character: '%', shapeVector: [0.7, 0.5, 0.5, 0.5, 0.5, 0.7] },
  { character: '&', shapeVector: [0.5, 0.5, 0.6, 0.6, 0.6, 0.7] },
  { character: 'M', shapeVector: [0.7, 0.7, 0.6, 0.6, 0.6, 0.6] },
  { character: 'W', shapeVector: [0.6, 0.6, 0.6, 0.6, 0.7, 0.7] },
  { character: '8', shapeVector: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6] },
  { character: '$', shapeVector: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6] },
  { character: '@', shapeVector: [0.8, 0.8, 0.8, 0.8, 0.8, 0.7] },
]

// ============================================================================
// Vector Math
// ============================================================================

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2
  }
  return Math.sqrt(sum)
}

// ============================================================================
// Cached Character Lookup
// ============================================================================

const BITS = 5
const RANGE = 2 ** BITS
const cache = new Map<number, string>()

function generateCacheKey(vector: number[]): number {
  let key = 0
  for (const value of vector) {
    const quantized = Math.min(RANGE - 1, Math.floor(value * RANGE))
    key = (key << BITS) | quantized
  }
  return key
}

function findBestCharacter(samplingVector: number[]): string {
  const key = generateCacheKey(samplingVector)

  if (cache.has(key)) {
    return cache.get(key)!
  }

  let bestChar = ' '
  let bestDistance = Infinity

  for (const { character, shapeVector } of CHARACTER_SHAPES) {
    const dist = euclideanDistance(samplingVector, shapeVector)
    if (dist < bestDistance) {
      bestDistance = dist
      bestChar = character
    }
  }

  cache.set(key, bestChar)
  return bestChar
}

// ============================================================================
// Image Sampling
// ============================================================================

interface ImageData {
  width: number
  height: number
  data: Uint8Array | number[]
}

function sampleCircle(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number,
): number {
  let sum = 0
  let count = 0

  const minY = Math.max(0, Math.floor(cy - radius))
  const maxY = Math.min(imageData.height - 1, Math.ceil(cy + radius))
  const minX = Math.max(0, Math.floor(cx - radius))
  const maxX = Math.min(imageData.width - 1, Math.ceil(cx + radius))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
        const idx = (y * imageData.width + x) * 4
        const r = imageData.data[idx] ?? 0
        const g = imageData.data[idx + 1] ?? 0
        const b = imageData.data[idx + 2] ?? 0
        // Relative luminance
        sum += 0.299 * r + 0.587 * g + 0.114 * b
        count++
      }
    }
  }

  return count > 0 ? sum / count / 255 : 0
}

function sampleCell(
  imageData: ImageData,
  cellX: number,
  cellY: number,
  cellWidth: number,
  cellHeight: number,
): number[] {
  const samplingVector: number[] = []

  // 6 sampling positions (2x3 grid within cell)
  const positions = [
    [0.25, 0.17],
    [0.75, 0.17], // Top
    [0.25, 0.5],
    [0.75, 0.5], // Middle
    [0.25, 0.83],
    [0.75, 0.83], // Bottom
  ]

  const radius = Math.min(cellWidth, cellHeight) * 0.15

  for (const [px, py] of positions) {
    const centerX = cellX + px * cellWidth
    const centerY = cellY + py * cellHeight
    samplingVector.push(sampleCircle(imageData, centerX, centerY, radius))
  }

  return samplingVector
}

// ============================================================================
// Contrast Enhancement
// ============================================================================

function enhanceContrast(samplingVector: number[], exponent: number): number[] {
  const maxVal = Math.max(...samplingVector)
  if (maxVal === 0) return samplingVector

  return samplingVector.map((v) => {
    const norm = v / maxVal
    return norm ** exponent * maxVal
  })
}

// ============================================================================
// Renderer
// ============================================================================

interface RenderOptions {
  cols: number
  rows: number
  contrastExponent?: number
  invert?: boolean
}

function renderToAscii(imageData: ImageData, options: RenderOptions): string {
  const { cols, rows, contrastExponent = 2, invert = false } = options
  const cellWidth = imageData.width / cols
  const cellHeight = imageData.height / rows

  const lines: string[] = []

  for (let row = 0; row < rows; row++) {
    let line = ''
    for (let col = 0; col < cols; col++) {
      const x = col * cellWidth
      const y = row * cellHeight

      let samplingVector = sampleCell(imageData, x, y, cellWidth, cellHeight)

      // Invert if needed (for light backgrounds)
      if (invert) {
        samplingVector = samplingVector.map((v) => 1 - v)
      }

      // Apply contrast enhancement
      samplingVector = enhanceContrast(samplingVector, contrastExponent)

      line += findBestCharacter(samplingVector)
    }
    lines.push(line)
  }

  return lines.join('\n')
}

// ============================================================================
// PNG Decoding (using sharp if available, fallback to raw decode)
// ============================================================================

async function loadImage(filePath: string): Promise<ImageData> {
  try {
    // Try using sharp for comprehensive format support
    const sharp = await import('sharp')
    const image = sharp.default(filePath)
    const _metadata = await image.metadata()
    const { data, info } = await image
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true })

    return {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data),
    }
  } catch {
    // Fallback: basic PNG decoder
    console.error(
      "Note: Install 'sharp' for better image format support (bun add sharp)",
    )
    throw new Error('Could not load image. Please install sharp: bun add sharp')
  }
}

// ============================================================================
// Text to Image Rendering
// ============================================================================

async function renderTextToImage(
  text: string,
  options: {
    font?: string
    fontSize?: number
    bold?: boolean
  } = {},
): Promise<ImageData> {
  const { font = 'Arial Black', fontSize = 120, bold = true } = options

  // Calculate dimensions based on text length
  // Approximate: each character is roughly 0.6x the font size in width
  const estimatedWidth = Math.ceil(text.length * fontSize * 0.7) + fontSize
  const estimatedHeight = Math.ceil(fontSize * 1.5)

  // Create SVG with the text
  const fontWeight = bold ? 'bold' : 'normal'
  const svg = `
    <svg width="${estimatedWidth}" height="${estimatedHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <text
        x="50%"
        y="50%"
        dominant-baseline="middle"
        text-anchor="middle"
        font-family="${font}, Arial Black, Impact, sans-serif"
        font-size="${fontSize}px"
        font-weight="${fontWeight}"
        fill="black"
      >${escapeXml(text)}</text>
    </svg>
  `

  try {
    const sharp = await import('sharp')

    // Convert SVG to PNG buffer, then to raw pixels
    const { data, info } = await sharp
      .default(Buffer.from(svg))
      .png()
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true })

    return {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data),
    }
  } catch (_err) {
    throw new Error(
      'Failed to render text. Make sure sharp is installed: bun add sharp',
    )
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ============================================================================
// Demo: Generate Test Pattern
// ============================================================================

function generateTestPattern(width: number, height: number): ImageData {
  const data = new Uint8Array(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      // Create a gradient sphere
      const cx = width / 2
      const cy = height / 2
      const radius = Math.min(width, height) * 0.4

      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < radius) {
        // Inside sphere - gradient based on distance and angle for 3D effect
        const normalZ = Math.sqrt(1 - (dist / radius) ** 2)
        const lightDir = { x: -0.5, y: -0.5, z: 0.7 }
        const normalX = dx / radius
        const normalY = dy / radius

        const dot =
          normalX * lightDir.x + normalY * lightDir.y + normalZ * lightDir.z
        const brightness = Math.max(0, Math.min(255, dot * 255))

        data[idx] = brightness
        data[idx + 1] = brightness
        data[idx + 2] = brightness
        data[idx + 3] = 255
      } else {
        // Outside sphere - white background
        data[idx] = 255
        data[idx + 1] = 255
        data[idx + 2] = 255
        data[idx + 3] = 255
      }
    }
  }

  return { width, height, data }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      cols: { type: 'string', short: 'c', default: '80' },
      rows: { type: 'string', short: 'r' },
      contrast: { type: 'string', default: '1.5' },
      invert: { type: 'boolean', short: 'i', default: false },
      demo: { type: 'boolean', short: 'd', default: false },
      text: { type: 'string', short: 't' },
      font: { type: 'string', short: 'f', default: 'Arial Black' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(`
ASCII Art Renderer - Shape Vector Algorithm

Usage:
  bun run render.ts <image-path> [options]
  bun run render.ts --text "YOUR TEXT" [options]
  bun run render.ts --demo [options]

Options:
  -c, --cols <n>      Output columns (default: 80)
  -r, --rows <n>      Output rows (auto-calculated for text, default 40 for images)
  --contrast <n>      Contrast exponent (default: 1.5, higher = more contrast)
  -i, --invert        Invert colors (for light images on dark terminal)
  -t, --text <str>    Render text instead of an image
  -f, --font <name>   Font for text rendering (default: "Arial Black")
  -d, --demo          Render a demo sphere
  -h, --help          Show this help

Text Examples:
  bun run render.ts --text "DUPE.COM"
  bun run render.ts --text "HELLO" --cols 60
  bun run render.ts --text "WOW" --font "Impact" --cols 40

Image Examples:
  bun run render.ts photo.png
  bun run render.ts photo.jpg --cols 120 --rows 60
  bun run render.ts --demo --cols 60 --rows 30

Available Fonts (system-dependent):
  Arial Black, Impact, Helvetica Bold, Georgia, Times New Roman,
  Courier New, Verdana, Comic Sans MS
`)
    return
  }

  const cols = parseInt(values.cols!, 10)
  const contrastExponent = parseFloat(values.contrast!)

  let imageData: ImageData
  let rows: number

  if (values.text) {
    // Render text to image
    const text = values.text
    imageData = await renderTextToImage(text, {
      font: values.font,
      fontSize: 150,
      bold: true,
    })

    // Auto-calculate rows to maintain aspect ratio for text
    // Terminal characters are roughly 2:1 height:width ratio
    const aspectRatio = imageData.height / imageData.width
    rows = values.rows
      ? parseInt(values.rows, 10)
      : Math.max(5, Math.ceil(cols * aspectRatio * 0.5))
  } else if (values.demo || positionals.length === 0) {
    // Generate demo sphere
    console.log('Rendering demo sphere...\n')
    imageData = generateTestPattern(400, 400)
    rows = values.rows ? parseInt(values.rows, 10) : 40
  } else {
    const imagePath = positionals[0]
    if (!existsSync(imagePath)) {
      console.error(`Error: File not found: ${imagePath}`)
      process.exit(1)
    }
    imageData = await loadImage(imagePath)
    rows = values.rows ? parseInt(values.rows, 10) : 40
  }

  const ascii = renderToAscii(imageData, {
    cols,
    rows,
    contrastExponent,
    invert: values.invert,
  })

  console.log(ascii)
}

main().catch(console.error)
