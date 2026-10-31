import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.codex-tasks/kugou-ai-segmentation');
const manifestPath = path.join(root, 'manifest.json');
const cdpPort = Number(process.env.FOLIA_CDP_PORT || 9222);

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const readJsonIfExists = async file => {
  try {
    return await readJson(file);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
};
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const findFoliaTarget = async () => {
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json`).then(response => response.json());
  const target = targets.find(item => item.type === 'page' && item.title === 'Folia');
  if (!target?.webSocketDebuggerUrl) throw new Error('Folia CDP target not found');
  return target;
};

const evaluate = async expression => {
  const target = await findFoliaTarget();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('CDP evaluation timed out'));
    }, 180_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    })));
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.result?.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text || 'CDP evaluation failed'));
        return;
      }
      resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed')));
  });
};

const requestFolia = async payload => {
  const expression = `new Promise((resolve,reject)=>{\n`
    + `const id="codex-seg-"+Date.now()+Math.random();\n`
    + `const timer=setTimeout(()=>{window.removeEventListener("message",on);reject(new Error("Folia bridge timeout"))},150000);\n`
    + `function on(event){const data=event.data;if(event.source===window&&data&&data.source==="folia-extension-bridge"&&data.type==="FOLIA_API_RESPONSE"&&data.id===id){clearTimeout(timer);window.removeEventListener("message",on);data.ok?resolve(data.data):reject(new Error(data.error||"Folia bridge error"))}}\n`
    + `window.addEventListener("message",on);\n`
    + `window.postMessage({source:"folia-web-page",type:"FOLIA_API_REQUEST",id,payload:${JSON.stringify(payload)}},"*");\n`
    + `})`;
  return await evaluate(expression);
};

const existingSegmentationKeys = async () => await evaluate(`(async()=>{\n`
  + `const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("KineticPlayerDB");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
  + `const keys=await new Promise((resolve,reject)=>{const request=db.transaction("api_cache","readonly").objectStore("api_cache").getAllKeys();request.onsuccess=()=>resolve(request.result.map(String).filter(key=>key.startsWith("lyricSeg_")));request.onerror=()=>reject(request.error)});\n`
  + `db.close();return keys;\n`
  + `})()`);

const songKeyOf = song => `online:kugou:${song.id}`;

const init = async () => {
  const playlists = await requestFolia({ provider: 'kugou', operation: 'user_playlist', params: { pagesize: 100 } });
  const lists = playlists?.data?.lists || [];
  const liked = lists.find(item => String(item.listid ?? item.list_id) === '2')
    || lists.find(item => ['我喜欢', '我喜欢的音乐'].includes(String(item.name ?? item.listname)));
  if (!liked) throw new Error('KuGou liked playlist not found');

  const listId = String(liked.global_collection_id ?? liked.listid ?? liked.list_id);
  const response = await requestFolia({
    provider: 'kugou',
    operation: 'playlist_track_all',
    params: { id: listId, global_collection_id: listId },
  });
  const rawSongs = response?.data?.songs || [];
  if (rawSongs.length < 100) throw new Error(`Liked playlist returned only ${rawSongs.length} songs`);

  // Keep the same client order as kugouProvider.getKugouPlaylistTrackSongs().
  const latest = rawSongs.slice().reverse().slice(0, 100);
  const completed = new Set(await existingSegmentationKeys());
  const songs = latest.map((song, index) => {
    const songKey = songKeyOf(song);
    return {
      rank: index + 1,
      songKey,
      id: song.id,
      hash: song.hash || song.id,
      albumId: song.albumId ?? '',
      albumAudioId: song.albumAudioId ?? '',
      name: song.name || '',
      artist: song.artist || '',
      album: song.album || '',
      durationMs: Number(song.duration || 0),
      status: completed.has(`lyricSeg_${songKey}`) ? 'done-existing' : 'pending',
      attempts: 0,
    };
  });
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    playlistCountAtStart: rawSongs.length,
    order: 'kugou-provider-client-order-newest-first',
    targetCount: songs.length,
    batchSize: 5,
    songs,
  };
  await writeJson(manifestPath, manifest);
  console.log(`Saved ${songs.length} songs to ${manifestPath}`);
};

const parseKrcLines = content => {
  const lines = [];
  for (const rawLine of String(content || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = rawLine.match(/^\[(\d+),(\d+)\](.*)/);
    if (!match) continue;
    const startMs = Number(match[1]);
    const rest = match[3];
    let fullText = '';
    const words = /\<(\d+),(\d+)(?:,\d+)?\>([^\<]*)/g;
    for (let word = words.exec(rest); word; word = words.exec(rest)) fullText += word[3];
    if (!fullText && rest.trim() && !rest.trim().startsWith('[') && !rest.trim().startsWith('<')) {
      fullText = rest.trim();
    }
    if (fullText) lines.push({ key: `${startMs}|${fullText}`, startMs, text: fullText });
  }
  return lines;
};

const fetchBatch = async batchNumber => {
  const manifest = await readJson(manifestPath);
  const start = (batchNumber - 1) * manifest.batchSize;
  const batchPath = path.join(root, 'batches', `batch-${String(batchNumber).padStart(2, '0')}-input.json`);
  const existingBatch = await readJsonIfExists(batchPath);
  const outputBySongKey = new Map((existingBatch?.songs || []).map(song => [song.songKey, song]));
  const selected = manifest.songs.slice(start, start + manifest.batchSize)
    .filter(song => song.status === 'pending' || song.status === 'fetch-failed');
  if (selected.length === 0) {
    console.log(`Batch ${batchNumber} has no songs that need lyric fetching`);
    return;
  }
  for (const song of selected) {
    song.attempts += 1;
    try {
      const search = await requestFolia({
        provider: 'kugou',
        operation: 'search_lyric',
        params: {
          hash: song.hash,
          album_audio_id: song.albumAudioId,
          duration: song.durationMs,
          keyword: `${song.artist} - ${song.name}`,
        },
      });
      const candidate = search?.candidates?.[0];
      if (!candidate) {
        song.status = 'no-lyrics';
        await writeJson(manifestPath, manifest);
        continue;
      }
      const lyric = await requestFolia({
        provider: 'kugou',
        operation: 'lyric',
        params: { id: candidate.id, accesskey: candidate.accesskey, fmt: 'krc', decode: true },
      });
      const lines = parseKrcLines(lyric?.decodeContent || lyric?.content);
      if (lines.length === 0) {
        song.status = 'no-lyrics';
        await writeJson(manifestPath, manifest);
        continue;
      }
      outputBySongKey.set(song.songKey, {
        rank: song.rank,
        songKey: song.songKey,
        name: song.name,
        artist: song.artist,
        lines,
      });
      // The immutable source payload must land before the manifest advertises lyrics-ready.
      // If the process stops between these writes, the old pending/failed status safely retries.
      const checkpoint = Array.from(outputBySongKey.values()).sort((left, right) => left.rank - right.rank);
      await writeJson(batchPath, { batchNumber, songs: checkpoint });
      song.status = 'lyrics-ready';
      song.lineCount = lines.length;
    } catch (error) {
      song.status = 'fetch-failed';
      song.lastError = error instanceof Error ? error.message : String(error);
    }
    await writeJson(manifestPath, manifest);
  }

  const output = Array.from(outputBySongKey.values()).sort((left, right) => left.rank - right.rank);
  await writeJson(batchPath, { batchNumber, songs: output });
  await writeJson(manifestPath, manifest);
  console.log(`Saved ${output.length} lyric payloads to ${batchPath}`);
};

const applyOutput = async (outputFile, { allowCompleted = false } = {}) => {
  const manifest = await readJson(manifestPath);
  const output = await readJson(path.resolve(outputFile));
  const records = [];

  for (const song of output.songs || []) {
    const manifestSong = manifest.songs.find(item => item.songKey === song.songKey);
    if (!manifestSong) throw new Error(`Song is outside the fixed manifest: ${song.songKey}`);
    if (!allowCompleted && String(manifestSong.status).startsWith('done')) {
      throw new Error(`Refusing to overwrite completed segmentation: ${song.songKey}`);
    }
    if (!allowCompleted && manifestSong.status !== 'lyrics-ready') {
      throw new Error(`Song is not ready for segmentation: ${song.songKey} (${manifestSong.status})`);
    }
    const batchNumber = Math.floor((manifestSong.rank - 1) / manifest.batchSize) + 1;
    const inputPath = path.join(root, 'batches', `batch-${String(batchNumber).padStart(2, '0')}-input.json`);
    const input = await readJson(inputPath);
    const inputSong = input.songs.find(item => item.songKey === song.songKey);
    if (!inputSong) throw new Error(`Original lyric input is missing: ${song.songKey}`);
    if (!Array.isArray(song.lines) || song.lines.length !== inputSong.lines.length) {
      throw new Error(`Incomplete segmentation: ${song.songKey} has ${song.lines?.length || 0}/${inputSong.lines.length} lines`);
    }
    const inputByKey = new Map(inputSong.lines.map(row => [row.key, row.text]));
    const seenKeys = new Set();
    const lines = {};
    for (const row of song.lines || []) {
      if (seenKeys.has(row.key)) throw new Error(`Duplicate lyric line key: ${song.songKey} ${row.key}`);
      seenKeys.add(row.key);
      if (!inputByKey.has(row.key) || inputByKey.get(row.key) !== row.text) {
        throw new Error(`Segmentation line does not match the original input: ${song.songKey} ${row.key}`);
      }
      if (!Array.isArray(row.segments) || row.segments.join('') !== row.text) {
        throw new Error(`Lossless validation failed: ${song.songKey} ${row.key}`);
      }
      lines[row.key] = row.segments;
    }
    if (seenKeys.size !== inputByKey.size) throw new Error(`Segmentation does not cover every original line: ${song.songKey}`);
    records.push({
      key: `lyricSeg_${song.songKey}`,
      data: { version: 1, songKey: song.songKey, updatedAt: Date.now(), source: 'ai', lines },
      timestamp: Date.now(),
    });
  }

  const expression = `(async()=>{\n`
    + `const records=${JSON.stringify(records)};\n`
    + `const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("KineticPlayerDB");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
    + `await new Promise((resolve,reject)=>{const tx=db.transaction("api_cache","readwrite");const store=tx.objectStore("api_cache");records.forEach(record=>store.put(record));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});\n`
    + `const verified=[];for(const record of records){const value=await new Promise((resolve,reject)=>{const request=db.transaction("api_cache","readonly").objectStore("api_cache").get(record.key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});verified.push(Boolean(value&&value.timestamp===record.timestamp&&JSON.stringify(value.data)===JSON.stringify(record.data)))}\n`
    + `db.close();return verified;\n`
    + `})()`;
  const verified = await evaluate(expression);
  if (!Array.isArray(verified) || verified.some(value => value !== true)) {
    throw new Error('IndexedDB read-back validation failed');
  }

  for (const record of records) {
    const manifestSong = manifest.songs.find(item => item.songKey === record.data.songKey);
    manifestSong.status = 'done';
    manifestSong.segmentedLineCount = Object.keys(record.data.lines).length;
    manifestSong.completedAt = new Date().toISOString();
    delete manifestSong.lastError;
  }
  await writeJson(manifestPath, manifest);
  console.log(`Applied and verified ${records.length} song records`);
};

const kugouSongKeyVariants = songKey => {
  const prefix = 'online:kugou:';
  if (!songKey.startsWith(prefix)) return [songKey];
  const mediaId = songKey.slice(prefix.length);
  return Array.from(new Set([
    `${prefix}${mediaId.toLowerCase()}`,
    `${prefix}${mediaId.toUpperCase()}`,
  ]));
};

const writeKugouCaseAliases = async () => {
  const manifest = await readJson(manifestPath);
  const mappings = manifest.songs
    .filter(song => song.status === 'done')
    .map(song => ({ canonical: song.songKey, variants: kugouSongKeyVariants(song.songKey) }));
  const expression = `(async()=>{\n`
    + `const mappings=${JSON.stringify(mappings)};\n`
    + `const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("KineticPlayerDB");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
    + `let written=0;await new Promise((resolve,reject)=>{const tx=db.transaction("api_cache","readwrite");const store=tx.objectStore("api_cache");for(const mapping of mappings){const request=store.get("lyricSeg_"+mapping.canonical);request.onsuccess=()=>{const row=request.result;if(!row)return;for(const variant of mapping.variants){if(variant===mapping.canonical)continue;store.put({key:"lyricSeg_"+variant,data:{...row.data,songKey:variant,updatedAt:Date.now()},timestamp:Date.now()});written+=1}}}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});\n`
    + `db.close();return written;\n`
    + `})()`;
  const written = await evaluate(expression);
  console.log(`Wrote ${written} KuGou case-alias records`);
};

const restoreAll = async () => {
  const manifest = await readJson(manifestPath);
  const done = manifest.songs.filter(song => song.status === 'done');
  for (const song of done) {
    const batchNumber = Math.floor((song.rank - 1) / manifest.batchSize) + 1;
    const outputPath = path.join(
      root,
      'batches',
      `batch-${String(batchNumber).padStart(2, '0')}-output-part-${String(song.rank).padStart(2, '0')}.json`,
    );
    await applyOutput(outputPath, { allowCompleted: true });
  }
  await writeKugouCaseAliases();
  await audit();
};

const audit = async () => {
  const manifest = await readJson(manifestPath);
  const deviceEntries = await evaluate(`(async()=>{\n`
    + `const db=await new Promise((resolve,reject)=>{const request=indexedDB.open("KineticPlayerDB");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
    + `const rows=await new Promise((resolve,reject)=>{const request=db.transaction("api_cache","readonly").objectStore("api_cache").getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});\n`
    + `db.close();return rows.filter(row=>String(row.key).startsWith("lyricSeg_")).map(row=>({key:String(row.key),version:row.data?.version,songKey:row.data?.songKey,source:row.data?.source,lineCount:Object.keys(row.data?.lines||{}).length,lines:row.data?.lines||{}}));\n`
    + `})()`);
  const byKey = new Map(deviceEntries.map(entry => [entry.key, entry]));
  const done = manifest.songs.filter(song => song.status === 'done');
  const noLyrics = manifest.songs.filter(song => song.status === 'no-lyrics');
  const unfinished = manifest.songs.filter(song => !['done', 'no-lyrics'].includes(song.status));
  const missing = [];
  const mismatched = [];
  const missingAliases = [];
  const mismatchedAliases = [];
  const invalidOutputs = [];
  for (const song of done) {
    const key = `lyricSeg_${song.songKey}`;
    const entry = byKey.get(key);
    if (!entry) {
      missing.push(song.rank);
      continue;
    }
    const batchNumber = Math.floor((song.rank - 1) / manifest.batchSize) + 1;
    const paddedBatch = String(batchNumber).padStart(2, '0');
    const input = await readJson(path.join(root, 'batches', `batch-${paddedBatch}-input.json`));
    const outputPart = String(song.rank).padStart(2, '0');
    const output = await readJson(path.join(root, 'batches', `batch-${paddedBatch}-output-part-${outputPart}.json`));
    const inputSong = input.songs.find(item => item.songKey === song.songKey);
    const outputSong = output.songs?.find(item => item.songKey === song.songKey);
    const expectedLines = {};
    let outputValid = Boolean(inputSong && outputSong && outputSong.lines.length === inputSong.lines.length);
    if (outputValid) {
      const inputByKey = new Map(inputSong.lines.map(row => [row.key, row.text]));
      for (const row of outputSong.lines) {
        if (!inputByKey.has(row.key) || inputByKey.get(row.key) !== row.text
          || !Array.isArray(row.segments) || row.segments.join('') !== row.text
          || Object.hasOwn(expectedLines, row.key)) {
          outputValid = false;
          break;
        }
        expectedLines[row.key] = row.segments;
      }
      if (Object.keys(expectedLines).length !== inputByKey.size) outputValid = false;
    }
    if (!outputValid) invalidOutputs.push(song.rank);

    const deviceLineKeys = Object.keys(entry.lines || {});
    const expectedLineKeys = Object.keys(expectedLines);
    const deviceContentMatches = outputValid
      && deviceLineKeys.length === expectedLineKeys.length
      && expectedLineKeys.every(lineKey => (
        Array.isArray(entry.lines[lineKey])
        && JSON.stringify(entry.lines[lineKey]) === JSON.stringify(expectedLines[lineKey])
      ));
    if (entry.songKey !== song.songKey
      || entry.version !== 1
      || entry.source !== 'ai'
      || entry.lineCount !== song.segmentedLineCount
      || entry.lineCount < 1
      || !deviceContentMatches) {
      mismatched.push(song.rank);
    }
    for (const aliasSongKey of kugouSongKeyVariants(song.songKey)) {
      if (aliasSongKey === song.songKey) continue;
      const alias = byKey.get(`lyricSeg_${aliasSongKey}`);
      if (!alias) {
        missingAliases.push(song.rank);
        continue;
      }
      const aliasLineKeys = Object.keys(alias.lines || {});
      const aliasContentMatches = outputValid
        && aliasLineKeys.length === expectedLineKeys.length
        && expectedLineKeys.every(lineKey => (
          Array.isArray(alias.lines[lineKey])
          && JSON.stringify(alias.lines[lineKey]) === JSON.stringify(expectedLines[lineKey])
        ));
      if (alias.songKey !== aliasSongKey || alias.version !== 1 || alias.source !== 'ai' || !aliasContentMatches) {
        mismatchedAliases.push(song.rank);
      }
    }
  }
  const summary = {
    target: manifest.targetCount,
    done: done.length,
    noLyrics: noLyrics.length,
    unfinished: unfinished.length,
    missing: missing.length,
    mismatched: mismatched.length,
    invalidOutputs: invalidOutputs.length,
    missingAliases: missingAliases.length,
    mismatchedAliases: mismatchedAliases.length,
    deviceSegmentationRecords: deviceEntries.length,
    noLyricsSongs: noLyrics.map(song => ({ rank: song.rank, name: song.name })),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (manifest.targetCount !== 100 || done.length + noLyrics.length !== manifest.targetCount
    || unfinished.length || missing.length || mismatched.length || invalidOutputs.length
    || missingAliases.length || mismatchedAliases.length) {
    throw new Error('Segmentation audit failed');
  }
};

const command = process.argv[2];
if (command === 'init') await init();
else if (command === 'fetch-batch') await fetchBatch(Number(process.argv[3] || 1));
else if (command === 'apply') await applyOutput(process.argv[3]);
else if (command === 'restore-all') await restoreAll();
else if (command === 'write-kugou-case-aliases') await writeKugouCaseAliases();
else if (command === 'audit') await audit();
else throw new Error('Usage: node scripts/codex-kugou-ai-segmentation.mjs <init|fetch-batch N|apply FILE|restore-all|write-kugou-case-aliases|audit>');
