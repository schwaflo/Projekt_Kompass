/* ============================================================
   Präsentationsgenerator – Schemas
   Ein Designsystem ist ein Ordner oder ZIP mit design-system.json.
   Dieses Schema beschreibt das Manifest (schemaVersion 1.0).
   Alle Positionen sind Prozent der Folie (0–100), Schriftgrößen
   Punkt auf einer 16:9-Folie (13,333 × 7,5 Zoll).
   ============================================================ */

export const SCHEMA_VERSION = '1.0';

/* Folienmaße in Zoll (PowerPoint „Breitbild“) */
export const SLIDE = { w: 13.333, h: 7.5 };

/* Standard-Layouttypen. Über den Typ werden Folien beim Wechsel des Designsystems zugeordnet. */
export const LAYOUT_TYPEN = ['title', 'section', 'content-bullets', 'two-column', 'image-left', 'image-full', 'kpi-grid', 'timeline', 'quote', 'comparison', 'closing'];

/* Was ein Platzhalter aufnehmen kann. „items“ ist eine Reihe gleich aufgebauter Kacheln (Kennzahlen, Zeitstrahl). */
export const PLATZHALTER_TYPEN = ['text', 'bullets', 'image', 'logo', 'items', 'chart', 'table'];

/* Platzhalter, die der Renderer selbst füllt */
export const AUTO_WERTE = ['pageNumber', 'presentationTitle', 'date'];

/* Bekannte Asset-Rollen. Eigene Rollen sind erlaubt. */
export const ASSET_ROLLEN = ['logo-primary', 'logo-negative', 'logo-icon', 'hero-image', 'portrait-image', 'square-image', 'icon', 'background'];

export const PFLICHT_FARBEN = ['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'textMuted', 'success', 'warning', 'error'];
export const PFLICHT_GROESSEN = ['title', 'h1', 'h2', 'body', 'caption'];

const STR = { type: 'string' };
const TEXT = { type: 'string', minLength: 1 };
const NUM = { type: 'number' };
const PROZENT = { type: 'number', minimum: -100, maximum: 200 };
const HEX = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const ID = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' };
const LISTE = { type: 'array', items: STR };

const STIL = {
  type: 'object',
  properties: {
    font: { type: 'string', enum: ['heading', 'body'] },
    size: { type: ['string', 'number'] },
    color: STR,
    align: { type: 'string', enum: ['left', 'center', 'right'] },
    valign: { type: 'string', enum: ['top', 'middle', 'bottom'] },
    bold: { type: 'boolean' },
    italic: { type: 'boolean' },
    uppercase: { type: 'boolean' },
    bullet: { type: 'string', enum: ['dot', 'dash', 'number', 'none'] }
  }
};

const DEKO = {
  type: 'object',
  properties: {
    shape: { type: 'string', enum: ['rect', 'ellipse', 'line'] },
    x: PROZENT, y: PROZENT, w: PROZENT, h: PROZENT,
    fill: STR,
    opacity: { type: 'number', minimum: 0, maximum: 1 },
    rounded: { type: 'boolean' }
  },
  required: ['shape', 'x', 'y', 'w', 'h', 'fill']
};

const FELD = {
  type: 'object',
  properties: { id: ID, beschreibung: STR, maxChars: { type: 'integer', minimum: 1 }, anteil: { type: 'number', minimum: 1 }, style: STIL },
  required: ['id', 'maxChars']
};

const PLATZHALTER = {
  type: 'object',
  properties: {
    id: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9]*$' },
    typ: { type: 'string', enum: PLATZHALTER_TYPEN },
    beschreibung: STR,
    x: PROZENT, y: PROZENT, w: PROZENT, h: PROZENT,
    pflicht: { type: 'boolean' },
    auto: { type: 'string', enum: AUTO_WERTE },
    maxChars: { type: 'integer', minimum: 1 },
    maxItems: { type: 'integer', minimum: 1 },
    minItems: { type: 'integer', minimum: 1 },
    maxCharsPerItem: { type: 'integer', minimum: 1 },
    asset: STR,
    fit: { type: 'string', enum: ['cover', 'contain'] },
    on: STR,
    variante: { type: 'string', enum: ['karten', 'zeitstrahl', 'schlicht'] },
    felder: { type: 'array', items: FELD, minItems: 1 },
    style: STIL
  },
  required: ['id', 'typ', 'x', 'y', 'w', 'h']
};

const FLAECHE = {
  background: STR,
  deko: { type: 'array', items: DEKO },
  placeholders: { type: 'array', items: PLATZHALTER }
};

export const DS_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', enum: [SCHEMA_VERSION] },
    meta: {
      type: 'object',
      properties: { id: ID, name: TEXT, beschreibung: STR, version: STR, autor: STR, tags: LISTE },
      required: ['id', 'name', 'beschreibung', 'version', 'tags']
    },
    tokens: {
      type: 'object',
      properties: {
        colors: {
          type: 'object',
          properties: { ...Object.fromEntries(PFLICHT_FARBEN.map(k => [k, HEX])), chartPalette: { type: 'array', items: HEX, minItems: 3 } },
          required: [...PFLICHT_FARBEN, 'chartPalette'],
          additionalProperties: HEX
        },
        typography: {
          type: 'object',
          properties: {
            headingFont: TEXT, bodyFont: TEXT,
            headingFallback: { type: 'array', items: TEXT, minItems: 1 },
            bodyFallback: { type: 'array', items: TEXT, minItems: 1 },
            googleFonts: { type: 'boolean' },
            sizes: { type: 'object', properties: Object.fromEntries(PFLICHT_GROESSEN.map(k => [k, NUM])), required: PFLICHT_GROESSEN, additionalProperties: NUM },
            lineHeight: { type: 'number', minimum: 0.8, maximum: 2.5 },
            headingBold: { type: 'boolean' }
          },
          required: ['headingFont', 'bodyFont', 'headingFallback', 'bodyFallback', 'sizes', 'lineHeight']
        },
        spacing: {
          type: 'object',
          properties: { marginX: NUM, marginY: NUM, gap: NUM, grid: { type: 'object', properties: { columns: { type: 'integer', minimum: 1 }, gutter: NUM }, required: ['columns', 'gutter'] } },
          required: ['marginX', 'marginY', 'gap', 'grid']
        },
        shapes: {
          type: 'object',
          properties: { radius: { type: 'number', minimum: 0 }, lineWidth: { type: 'number', minimum: 0 }, shadow: { type: 'string', enum: ['none', 'soft', 'hard'] } },
          required: ['radius', 'lineWidth', 'shadow']
        }
      },
      required: ['colors', 'typography', 'spacing', 'shapes']
    },
    masters: { type: 'object', additionalProperties: { type: 'object', properties: FLAECHE } },
    layouts: {
      type: 'array', minItems: 1,
      items: {
        type: 'object',
        properties: { id: ID, typ: STR, name: STR, beschreibung: TEXT, master: STR, ...FLAECHE },
        required: ['id', 'beschreibung', 'placeholders']
      }
    },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: ID, file: TEXT, role: TEXT, tags: LISTE, beschreibung: STR, verwendung: LISTE, w: NUM, h: NUM },
        required: ['id', 'file', 'role']
      }
    },
    rules: {
      type: 'object',
      properties: { logoAuf: LISTE, maxBullets: { type: 'integer', minimum: 1 }, bildstil: STR, hinweise: LISTE }
    }
  },
  required: ['schemaVersion', 'meta', 'tokens', 'layouts', 'assets']
};
