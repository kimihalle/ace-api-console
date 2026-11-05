const DATABASE_NAME = 'ace-image-studio';
const STORE_NAME = 'records';
const DATABASE_VERSION = 2;
export const IMAGE_STUDIO_HISTORY_LIMIT = 30;

export function imageStudioRecordsForUser(records, userId) {
  const accountId = String(userId || '');
  if (!accountId) return [];
  return records
    .filter((record) => record.userId === accountId)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, IMAGE_STUDIO_HISTORY_LIMIT);
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('图片记录保存失败'));
    transaction.onerror = () => reject(transaction.error || new Error('图片记录保存失败'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('读取图片记录失败'));
  });
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('此浏览器不支持本地图片记录'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: ['userId', 'id'] });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开图片记录'));
  });
}

export async function listImageStudioRecords(userId) {
  const accountId = String(userId || '');
  if (!accountId) return [];

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const complete = transactionResult(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).index('userId').getAll(accountId));
    await complete;
    return imageStudioRecordsForUser(records, accountId);
  } finally {
    database.close();
  }
}

export async function saveImageStudioRecord(userId, record) {
  const accountId = String(userId || '');
  if (!accountId) throw new Error('无法识别当前账户，图片尚未保存');
  if (!record?.id || !Array.isArray(record.sources) || record.sources.length === 0) {
    throw new Error('生成结果不完整，图片尚未保存');
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const complete = transactionResult(transaction);
    const store = transaction.objectStore(STORE_NAME);
    store.put({
      userId: accountId,
      id: String(record.id),
      model: String(record.model || ''),
      prompt: String(record.prompt || ''),
      createdAt: Number(record.createdAt) || Date.now(),
      sources: record.sources.filter((source) => typeof source === 'string' && /^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/i.test(source)),
    });

    const records = await requestResult(store.index('userId').getAll(accountId));
    records.sort((left, right) => right.createdAt - left.createdAt);
    for (const oldRecord of records.slice(IMAGE_STUDIO_HISTORY_LIMIT)) {
      store.delete([accountId, oldRecord.id]);
    }
    await complete;
  } finally {
    database.close();
  }
}
