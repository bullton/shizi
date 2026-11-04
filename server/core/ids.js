let idSeq = 0;

function generateId(existingIds) {
  const used = existingIds || new Set();
  let id;
  do {
    idSeq = (idSeq + 1) % 1000;
    id = Date.now() * 1000 + idSeq;
  } while (used.has(id));
  return id;
}

module.exports = { generateId };
