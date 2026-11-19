export interface MarkerEntry {
  id: string;
  label: string;
  speciesId: string;
  speciesName: string;
  zoneIds: string[];
  category: string;
}

export function normalizeInstagramEmbedUrl(rawUrl: string): {
  cleanUrl: string;
  embedUrl: string;
} {
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (!match) {
    return {
      cleanUrl: trimmed || 'https://www.instagram.com/huerto_comunitario_cucsh/',
      embedUrl: trimmed.includes('/embed') ? trimmed : ''
    };
  }
  const type = match[1].toLowerCase();
  const code = match[2];
  return {
    cleanUrl: `https://www.instagram.com/${type}/${code}/`,
    embedUrl: `https://www.instagram.com/p/${code}/embed`
  };
}

export function parseFichaHash(hash: string): string | null {
  if (!hash) return null;
  const cleaned = hash.replace(/^#/, '').trim();
  const match = cleaned.match(/^ficha\/([a-z0-9-]+)$/i);
  return match ? match[1].toLowerCase() : null;
}

export function filterMarkersByCategory<T extends { category: string }>(
  markers: T[],
  category: string
): T[] {
  if (!category || category === 'Todas') return markers;
  return markers.filter((m) =>
    m.category.toLowerCase().includes(category.toLowerCase())
  );
}

export function searchSpecies<
  T extends {
    id: string;
    commonName: string;
    scientificName: string;
    properties: string;
    markers: string[];
    zoneIds: string[];
    category: string;
  }
>(
  speciesList: T[],
  query: string,
  zoneFilter: string,
  categoryFilter: string
): T[] {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  return speciesList.filter((sp) => {
    const matchesZone =
      !zoneFilter || zoneFilter === 'Todas' || sp.zoneIds.includes(zoneFilter);
    const matchesCategory =
      !categoryFilter ||
      categoryFilter === 'Todas' ||
      sp.category.toLowerCase().includes(categoryFilter.toLowerCase());
    if (!matchesZone || !matchesCategory) return false;
    if (!q) return true;
    return (
      sp.commonName.toLowerCase().includes(q) ||
      sp.scientificName.toLowerCase().includes(q) ||
      sp.properties.toLowerCase().includes(q) ||
      sp.markers.some((m) => m.toLowerCase().replace(/^#/, '') === q || m.toLowerCase().includes(q))
    );
  });
}

// Pure QR Code Matrix Generator (Versions 1..6, Byte mode, ECC Level L)
// Generates a valid scannable square boolean matrix (true = dark module)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen);
  const res = [...data, ...new Array(ecLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

interface QrVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecCodewords: number;
  align: number[];
}

const QR_VERSIONS_L: QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecCodewords: 7, align: [] },
  { version: 2, size: 25, dataCodewords: 34, ecCodewords: 10, align: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecCodewords: 15, align: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecCodewords: 20, align: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecCodewords: 26, align: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecCodewords: 18, align: [6, 34] }
];

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const spec =
    QR_VERSIONS_L.find((v) => bytes.length + 2 <= v.dataCodewords) ||
    QR_VERSIONS_L[QR_VERSIONS_L.length - 1];
  const maxBytes = spec.dataCodewords - 2;
  const payload = bytes.slice(0, maxBytes);

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);
  const totalDataBits = spec.dataCodewords * 8;
  pushBits(0, Math.min(4, totalDataBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const pads = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataBits) {
    pushBits(pads[padIdx % 2], 8);
    padIdx++;
  }

  const dataWords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let w = 0;
    for (let j = 0; j < 8; j++) w = (w << 1) | bits[i + j];
    dataWords.push(w);
  }

  let finalWords: number[] = [];
  if (spec.version < 6) {
    const ec = rsRemainder(dataWords, spec.ecCodewords);
    finalWords = [...dataWords, ...ec];
  } else {
    // Version 6-L uses 2 blocks of 68 data + 18 ec each
    const b1 = dataWords.slice(0, 68);
    const b2 = dataWords.slice(68, 136);
    const ec1 = rsRemainder(b1, 18);
    const ec2 = rsRemainder(b2, 18);
    for (let i = 0; i < 68; i++) finalWords.push(b1[i], b2[i]);
    for (let i = 0; i < 18; i++) finalWords.push(ec1[i], ec2[i]);
  }

  const n = spec.size;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
  const reserved: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));

  const setModule = (r: number, c: number, val: number, isRes = true) => {
    if (r < 0 || r >= n || c < 0 || c >= n) return;
    matrix[r][c] = val;
    if (isRes) reserved[r][c] = true;
  };

  const placeFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const isBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setModule(r, c, inOuter && (isBorder || isCore) ? 1 : 0, true);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, n - 7);
  placeFinder(n - 7, 0);

  // Alignment patterns
  if (spec.align.length >= 2) {
    for (const r of spec.align) {
      for (const c of spec.align) {
        if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const onEdge = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, onEdge || isCenter ? 1 : 0, true);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0 ? 1 : 0, true);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0 ? 1 : 0, true);
  }

  // Dark module & reserve format info areas
  setModule(n - 8, 8, 1, true);
  for (let i = 0; i < 9; i++) {
    if (!reserved[8][i]) setModule(8, i, 0, true);
    if (!reserved[i][8]) setModule(i, 8, 0, true);
  }
  for (let i = n - 8; i < n; i++) {
    if (!reserved[8][i]) setModule(8, i, 0, true);
    if (!reserved[i][8]) setModule(i, 8, 0, true);
  }

  // Data placement (zig-zag) with mask 0: (r + c) % 2 === 0
  const allBits: number[] = [];
  for (const w of finalWords) {
    for (let i = 7; i >= 0; i--) allBits.push((w >> i) & 1);
  }
  let bitIdx = 0;
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!reserved[r][c]) {
          const raw = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          const masked = (r + c) % 2 === 0 ? raw ^ 1 : raw;
          matrix[r][c] = masked;
        }
      }
    }
    up = !up;
  }

  // Format info for ECC Level L (01) + Mask 0 (000) -> 0b01000 -> BCH + mask 0x5412 = 0x77c4 (111011111000100)
  const formatBits = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> (14 - i)) & 1;
    // Top-left horizontal & vertical
    if (i < 6) setModule(8, i, bit, true);
    else if (i === 6) setModule(8, 7, bit, true);
    else if (i === 7) setModule(8, 8, bit, true);
    else if (i === 8) setModule(7, 8, bit, true);
    else setModule(14 - i, 8, bit, true);

    // Bottom-left vertical & top-right horizontal
    if (i < 7) setModule(n - 1 - i, 8, bit, true);
    else setModule(8, n - 15 + i, bit, true);
  }

  return matrix.map((row) => row.map((cell) => cell === 1));
}
