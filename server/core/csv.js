function parseCsv(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  const clean = rows.filter(cells => cells.some(cell => String(cell).trim() !== ''));
  if (!clean.length) return [];
  const headers = clean.shift().map(header => header.trim());
  return clean.map(cells => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = cells[index] === undefined ? '' : String(cells[index]).trim();
    });
    return item;
  });
}

function parseImportText(text) {
  const source = String(text || '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    if (parsed && (Array.isArray(parsed.questions) || Array.isArray(parsed.idiom_dictionary))) return parsed;
  } catch (error) {
    // Not JSON: fall through to CSV.
  }
  return parseCsv(source);
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

module.exports = { parseCsv, parseImportText, csvCell };
