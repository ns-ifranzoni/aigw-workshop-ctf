/**
 * Minimal RFC 4180 CSV parser.
 *
 * Challenge descriptions and hints are Markdown, so quoted fields routinely
 * contain newlines (and commas, quotes, `#`, `-` ...). Splitting the file on
 * '\n' before parsing cuts those fields in half, so the whole text is parsed in
 * one pass and records are only ended by a newline that is *outside* quotes.
 *
 * - handles "" as an escaped quote, commas and newlines inside quoted fields
 * - accepts LF, CRLF and lone CR record separators (Excel / Windows exports)
 * - normalises CRLF/CR inside quoted fields to LF
 * - strips a UTF-8 BOM
 * - skips completely empty records (blank lines, trailing newline)
 * - values are returned untrimmed; callers decide what to trim
 *
 * @param {string} text
 * @returns {string[][]} records, each an array of field strings
 */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let hasContent = false; // distinguishes an empty record from `""`

  const s = String(text ?? '').replace(/^﻿/, '');

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    // drop records that are entirely empty (blank line)
    if (hasContent || row.some(v => v !== '')) rows.push(row);
    row = [];
    hasContent = false;
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else if (ch === '\r') {
        if (s[i + 1] === '\n') i++;
        field += '\n';
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (ch === ',') {
      endField();
      hasContent = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  // last record without a trailing newline
  if (field !== '' || row.length || hasContent) endRow();
  return rows;
}

module.exports = { parseCSV };
