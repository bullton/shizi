const fs = require('fs');
const path = require('path');

function createStore(file, defaults) {
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const exists = fs.existsSync(file);
  let data;
  if (exists) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      console.warn('[store] 讀取數據失敗，改用預設值：' + error.message);
      data = JSON.parse(JSON.stringify(defaults || {}));
    }
  } else {
    data = JSON.parse(JSON.stringify(defaults || {}));
  }

  let writeLock = Promise.resolve();
  function save() {
    const write = async () => {
      const tmp = file + '.tmp.' + process.pid;
      await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.promises.rename(tmp, file);
    };
    const next = writeLock.then(write, write);
    writeLock = next.catch(() => {});
    return next;
  }

  return { data, save, exists };
}

module.exports = { createStore };
