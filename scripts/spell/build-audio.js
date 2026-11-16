#!/usr/bin/env node
'use strict';

/*
 * 英文拆拆拆 · 發音音頻包生成
 *
 * 用 Edge 神經語音為 words.json 內的單詞與音節生成固定 MP3，
 * 令 Mac / iPad / 手機聽到同一把清晰聲音，不再依賴裝置的系統語音。
 *
 * 依賴：edge-tts（pip install edge-tts）
 * 執行：
 *   EDGE_TTS_BIN=/path/to/edge-tts node scripts/spell/build-audio.js
 *
 * 可選環境變數：
 *   SPELL_VOICE=en-US-AvaNeural
 *   SPELL_RATE=-10%
 *   SPELL_CONCURRENCY=4
 *   SPELL_AUDIO_FORCE=1    重新生成已存在的音檔
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const WORDS_FILE = path.join(ROOT, 'tools', 'spell', 'words.json');
const AUDIO_DIR = path.join(ROOT, 'tools', 'spell', 'audio');
const MANIFEST_FILE = path.join(AUDIO_DIR, 'manifest.json');

const VOICE = process.env.SPELL_VOICE || 'en-US-AvaNeural';
const RATE = process.env.SPELL_RATE || '-10%';
const EDGE_TTS = process.env.EDGE_TTS_BIN || 'edge-tts';
const CONCURRENCY = Math.max(1, Number(process.env.SPELL_CONCURRENCY) || 4);
const FORCE = process.env.SPELL_AUDIO_FORCE === '1';

const SYLLABLE_HINTS = {
  a: 'ah',
  e: 'eh',
  i: 'ih',
  o: 'ah',
  u: 'uh',
  y: 'ee'
};

function clipName(kind, text) {
  const hash = crypto.createHash('sha1').update(VOICE + '|' + RATE + '|' + text).digest('hex');
  return path.posix.join(kind, hash.slice(0, 12) + '.mp3');
}

function audioText(kind, text) {
  if (kind === 'syllables' && SYLLABLE_HINTS[text.toLowerCase()]) {
    return SYLLABLE_HINTS[text.toLowerCase()];
  }
  return text;
}

function runEdge(text, target) {
  return new Promise((resolve, reject) => {
    const args = [
      '--voice', VOICE,
      '--rate=' + RATE,
      '--text', audioText(target.kind, text),
      '--write-media', target.tmp,
      '--no-progress'
    ];
    const child = spawn(EDGE_TTS, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('timeout'));
    }, 45000);
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error((stderr || 'edge-tts exited ' + code).trim()));
    });
  });
}

async function generateOne(kind, text) {
  const rel = clipName(kind, text);
  const file = path.join(AUDIO_DIR, rel);
  const tmp = file + '.part';
  if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 1000) {
    return rel;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    fs.rmSync(tmp, { force: true });
    try {
      await runEdge(text, { kind, tmp });
      if (!fs.existsSync(tmp) || fs.statSync(tmp).size <= 1000) {
        throw new Error('empty audio');
      }
      fs.renameSync(tmp, file);
      return rel;
    } catch (error) {
      if (attempt === 4) throw new Error(text + ': ' + error.message);
      await new Promise(r => setTimeout(r, attempt * 800));
    }
  }
  throw new Error(text + ': failed');
}

async function pool(items, worker) {
  let index = 0;
  let done = 0;
  const total = items.length;
  const started = Date.now();
  async function next() {
    while (index < total) {
      const item = items[index];
      index += 1;
      await worker(item);
      done += 1;
      if (done % 50 === 0 || done === total) {
        const seconds = Math.round((Date.now() - started) / 1000);
        console.log('  ' + done + '/' + total + '（' + seconds + 's）');
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
}

async function main() {
  const data = JSON.parse(fs.readFileSync(WORDS_FILE, 'utf8'));
  const words = [...new Set(data.words.map(w => w.word.toLowerCase()))].sort();
  const syllableSet = new Set();
  for (const word of data.words) {
    for (const syllable of word.syllables) syllableSet.add(syllable.toLowerCase());
  }
  const syllables = [...syllableSet].sort();

  console.log('語音：' + VOICE + '，語速 ' + RATE);
  console.log('單詞 ' + words.length + ' 個，音節 ' + syllables.length + ' 個');

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const manifest = { voice: VOICE, rate: RATE, generatedAt: new Date().toISOString(), words: {}, syllables: {} };

  console.log('\n[1/2] 單詞發音');
  await pool(words, async word => {
    manifest.words[word] = await generateOne('words', word);
  });

  console.log('\n[2/2] 音節發音');
  await pool(syllables, async syllable => {
    manifest.syllables[syllable] = await generateOne('syllables', syllable);
  });

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
  console.log('\n完成：' + words.length + ' 個單詞、' + syllables.length + ' 個音節');
  console.log('清單：' + path.relative(ROOT, MANIFEST_FILE));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
