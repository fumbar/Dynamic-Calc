// Reads data tables straight out of the Unbound ROM.
//
// This is ground truth for what the game ships, in the sense ADR 0002 means: the
// numbers come from the cartridge, not from another calculator. It covers the data
// layer only. Damage-formula constants live in compiled Thumb code and are not
// readable this way; those still need disassembly or a live battle observation.
const fs = require('fs');
const path = require('path');

const ROM_PATH = path.join(__dirname, '..', 'roms', 'Pokemon Unbound Official.gba');
const EXPECTED_MD5 = '9cad8e771940e7f7094d13911552cef0';

function loadRom() {
  const buf = fs.readFileSync(ROM_PATH);
  const md5 = require('crypto').createHash('md5').update(buf).digest('hex');
  if (md5 !== EXPECTED_MD5) {
    throw new Error('ROM hash ' + md5 + ' is not the recorded ' + EXPECTED_MD5 +
      '; observations are only valid for the recorded build');
  }
  return buf;
}

// The Game Freak text encoding used by FireRed and its hacks.
const CHARS = {};
CHARS[0x00] = ' ';
for (let i = 0; i < 10; i++) CHARS[0xA1 + i] = String.fromCharCode(48 + i);
for (let i = 0; i < 26; i++) CHARS[0xBB + i] = String.fromCharCode(65 + i);
for (let i = 0; i < 26; i++) CHARS[0xD5 + i] = String.fromCharCode(97 + i);
CHARS[0xAD] = '.'; CHARS[0xAE] = '-'; CHARS[0xB8] = ','; CHARS[0xBA] = '/';
CHARS[0xB0] = '.'; CHARS[0xB1] = '"'; CHARS[0xB2] = '"'; CHARS[0xB3] = "'";
CHARS[0xB4] = "'"; CHARS[0xAC] = "'"; CHARS[0xF0] = ':';
CHARS[0xB5] = '♀'; CHARS[0xB6] = '♂'; CHARS[0xAF] = '*';
CHARS[0x1B] = 'e';  // e-acute, as used in Flabebe


const ENCODE = {};
for (const code of Object.keys(CHARS)) {
  const ch = CHARS[code];
  if (!(ch in ENCODE)) ENCODE[ch] = Number(code);
}

// Strict by default: an unmapped byte means this is not text, which is how the
// table scans find their own end. `lenient` keeps going and marks the byte instead.
function decode(buf, offset, maxLen, lenient) {
  let out = '';
  for (let i = 0; i < maxLen; i++) {
    const byte = buf[offset + i];
    if (byte === 0xFF) break;
    if (!(byte in CHARS)) {
      if (!lenient) return null;
      out += '<' + byte.toString(16) + '>';
      continue;
    }
    out += CHARS[byte];
  }
  return out.trim();
}

function encode(text) {
  const bytes = [];
  for (const ch of text) {
    if (!(ch in ENCODE)) return null;
    bytes.push(ENCODE[ch]);
  }
  return Buffer.from(bytes);
}

// Finds every offset at which `text` appears in the game's encoding.
function findText(buf, text) {
  const needle = encode(text);
  const hits = [];
  let at = buf.indexOf(needle, 0);
  while (at !== -1) {
    hits.push(at);
    at = buf.indexOf(needle, at + 1);
  }
  return hits;
}

function findBytes(buf, bytes) {
  const needle = Buffer.from(bytes);
  const hits = [];
  let at = buf.indexOf(needle, 0);
  while (at !== -1) {
    hits.push(at);
    at = buf.indexOf(needle, at + 1);
  }
  return hits;
}

// A GBA pointer is a little-endian word with the 0x08000000 ROM base.
function readPointer(buf, offset) {
  const word = buf.readUInt32LE(offset);
  if (word < 0x08000000 || word >= 0x0A000000) return null;
  return word - 0x08000000;
}

function findPointersTo(buf, target) {
  const word = Buffer.alloc(4);
  word.writeUInt32LE(target + 0x08000000);
  return findBytes(buf, word);
}

module.exports = { loadRom, decode, encode, findText, findBytes, readPointer,
  findPointersTo, ROM_PATH, EXPECTED_MD5 };
