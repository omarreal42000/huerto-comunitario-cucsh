import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeInstagramEmbedUrl,
  parseFichaHash,
  filterMarkersByCategory,
  searchSpecies,
  generateQrMatrix
} from './huertoLogic';

test('normalizeInstagramEmbedUrl builds canonical and embed URLs', () => {
  const post = normalizeInstagramEmbedUrl('https://www.instagram.com/p/DIXH4DzyO3G/?igsh=abc');
  assert.equal(post.cleanUrl, 'https://www.instagram.com/p/DIXH4DzyO3G/');
  assert.equal(post.embedUrl, 'https://www.instagram.com/p/DIXH4DzyO3G/embed');

  const reel = normalizeInstagramEmbedUrl('https://www.instagram.com/reel/DC7uew9psx9/');
  assert.equal(reel.cleanUrl, 'https://www.instagram.com/reel/DC7uew9psx9/');
  assert.equal(reel.embedUrl, 'https://www.instagram.com/p/DC7uew9psx9/embed');
});

test('parseFichaHash extracts species slug cleanly', () => {
  assert.equal(parseFichaHash('#ficha/maracuya'), 'maracuya');
  assert.equal(parseFichaHash('#ficha/maguey-pulquero'), 'maguey-pulquero');
  assert.equal(parseFichaHash('#mapa'), null);
  assert.equal(parseFichaHash(''), null);
});

test('filterMarkersByCategory handles compound categories', () => {
  const sample = [
    { id: '#33', category: 'Aromática / Medicinal' },
    { id: '#1', category: 'Comestible' },
    { id: '#13', category: 'Polinizadora' }
  ];
  assert.equal(filterMarkersByCategory(sample, 'Todas').length, 3);
  assert.equal(filterMarkersByCategory(sample, 'Medicinal').length, 1);
  assert.equal(filterMarkersByCategory(sample, 'Aromática').length, 1);
});

test('searchSpecies matches marker numbers, scientific names, and properties', () => {
  const species = [
    {
      id: 'maracuya',
      commonName: 'Maracuyá',
      scientificName: 'Passiflora edulis',
      properties: 'Fruto comestible rico en vitamina C e infusión relajante.',
      markers: ['#1', '#4', '#16', '#33b'],
      zoneIds: ['cuadrante-3', 'plantas-medicinales'],
      category: 'Comestible'
    },
    {
      id: 'ruda',
      commonName: 'Ruda',
      scientificName: 'Ruta graveolens',
      properties: 'Repelente natural y uso medicinal tradicional.',
      markers: ['#6', '#32'],
      zoneIds: ['cuadrante-3', 'plantas-medicinales'],
      category: 'Medicinal'
    }
  ];

  assert.equal(searchSpecies(species, '#33b', 'Todas', 'Todas')[0].id, 'maracuya');
  assert.equal(searchSpecies(species, 'Passiflora', 'Todas', 'Todas')[0].id, 'maracuya');
  assert.equal(searchSpecies(species, 'repelente', 'Todas', 'Medicinal')[0].id, 'ruda');
});

test('generateQrMatrix outputs valid square QR matrix with 7x7 finder patterns', () => {
  const m = generateQrMatrix('https://huerto-cucsh.udg.mx/#ficha/maracuya');
  const size = m.length;
  assert.ok(size >= 25 && size % 4 === 1);
  assert.equal(m[0].length, size);
  // Top-left finder corners and center
  assert.equal(m[0][0], true);
  assert.equal(m[0][6], true);
  assert.equal(m[6][0], true);
  assert.equal(m[3][3], true);
  assert.equal(m[1][1], false);
  // Top-right finder
  assert.equal(m[0][size - 1], true);
  assert.equal(m[3][size - 4], true);
  // Bottom-left finder
  assert.equal(m[size - 1][0], true);
  assert.equal(m[size - 4][3], true);
});
