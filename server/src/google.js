
import { google } from 'googleapis';
import { randomUUID, timingSafeEqual } from 'node:crypto';
export function getGoogleClients() {
  const authOptions = {
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets'
    ]
  };

  // Local development may use a private key file. Production on Cloud Run
  // should omit GOOGLE_APPLICATION_CREDENTIALS and use its assigned service
  // identity through Application Default Credentials (ADC).
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const auth = new google.auth.GoogleAuth(authOptions);

  return { sheets: google.sheets({ version: 'v4', auth }) };
}

async function ensureProductImagesColumn(sheets, spreadsheetId) {
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Products!L1'
  });
  const existingHeader = String(headerResponse.data.values?.[0]?.[0] ?? '').trim();
  if (!existingHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Products!L1',
      valueInputOption: 'RAW',
      requestBody: { values: [['images']] }
    });
  } else if (existingHeader.toLowerCase() !== 'images') {
    throw new Error('Products!L1 must be the images header for the product gallery.');
  }
}

function normalizeProductImages(primaryImage, galleryImages = []) {
  const values = [primaryImage, ...(Array.isArray(galleryImages) ? galleryImages : [])]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)].slice(0, 8);
}

function parseProductImagesCell(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function readProductsFromSheet() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured.');
  }

  const { sheets } = getGoogleClients();
  await ensureProductImagesColumn(sheets, spreadsheetId);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Products!A1:L'
  });

  const [headers = [], ...rows] = response.data.values ?? [];

  return rows
    .filter(row => row.some(value => value !== ''))
    .map(row => {
      const product = Object.fromEntries(
        headers.map((key, index) => [
          key === 'oldprice' ? 'oldPrice' : key,
          row[index] ?? ''
        ])
      );
      const images = normalizeProductImages(
        product.image,
        parseProductImagesCell(product.images)
      );
      product.image = images[0] || '';
      product.images = images;
      return product;
    });
}

export async function readUserByEmail(email) {
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not configured.');
  }

  const { sheets } = getGoogleClients();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Users!A2:J'
  });

  const rows = response.data.values ?? [];

  const userRow = rows.find(
    row =>
      String(row[2] ?? '').trim().toLowerCase() ===
      email.trim().toLowerCase()
  );

  if (!userRow) return null;

  const storedRole = String(userRow[4] ?? '')
    .trim()
    .toLowerCase();

  if (storedRole !== 'customer') {
    return null;
  }

  const passwordHash = String(userRow[3] ?? '').trim();

  if (!passwordHash) return null;

  return {
    id: String(userRow[0] ?? ''),
    name: String(userRow[1] ?? ''),
    email: String(userRow[2] ?? '').trim().toLowerCase(),
    passwordHash,
    role: 'customer',
    createdAt: String(userRow[5] ?? ''),
    sessionVersion: parseSessionVersion(userRow[9])
  };
}

export async function readAdminByEmail(email) {
  if (!process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not configured.');
  }

  const { sheets } = getGoogleClients();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Admins!A1:L'
  });

  const rows = response.data.values ?? [];
  const [headers = [], ...adminRows] = rows;
  assertSheetHeaders(headers, ADMIN_HEADERS, 'Admins');
  await ensureAdminMfaHeaders(sheets, process.env.GOOGLE_SHEET_ID, headers);

  const adminRow = adminRows.find(
    row => String(row[0] ?? '').trim().toLowerCase() === email.trim().toLowerCase()
  );

  if (!adminRow) return null;

  return {
    email: String(adminRow[0] ?? '').trim().toLowerCase(),
    passwordHash: String(adminRow[1] ?? ''),
    role: String(adminRow[2] ?? '').trim().toLowerCase(),
    active: String(adminRow[3] ?? '').trim().toLowerCase() === 'true',
    fullName: String(adminRow[4] ?? '').trim(),
    sessionVersion: parseSessionVersion(adminRow[8]),
    mfaSecretEncrypted: String(adminRow[9] ?? '').trim(),
    mfaEnabled: String(adminRow[10] ?? '').trim().toLowerCase() === 'true'
  };
}
// -------------------------
// Customer and admin management
// -------------------------

function parseSessionVersion(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('The account sessionVersion value is invalid.');
  }
  return parsed;
}

const USER_HEADERS = ['id', 'name', 'email', 'passwordHash', 'role', 'createdAt'];
const ADMIN_HEADERS = ['email', 'passwordHash', 'role', 'active', 'fullName'];

function assertSheetHeaders(actual, expected, sheetName) {
  const normalized = expected.map((_, index) => String(actual[index] ?? '').trim());
  if (normalized.some((value, index) => value !== expected[index])) {
    const error = new Error(`${sheetName} sheet headers do not match the required NOVA Market columns.`);
    error.code = `${sheetName.toUpperCase()}_HEADERS_MISMATCH`;
    throw error;
  }
}

const ADMIN_MFA_HEADERS = [
  ['I', 'sessionVersion'],
  ['J', 'mfaSecretEncrypted'],
  ['K', 'mfaEnabled'],
  ['L', 'mfaRecoveryHashes']
];

async function ensureAdminMfaHeaders(sheets, spreadsheetId, headers) {
  const writes = [];
  for (const [column, expected] of ADMIN_MFA_HEADERS) {
    const index = column.charCodeAt(0) - 65;
    const actual = String(headers[index] ?? '').trim();
    if (!actual) {
      writes.push({ range: `Admins!${column}1`, values: [[expected]] });
    } else if (actual !== expected) {
      throw new Error(`Admins sheet column ${column}1 must be named ${expected}.`);
    }
  }
  if (writes.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      valueInputOption: 'RAW',
      requestBody: { data: writes }
    });
  }
}

async function readAdminMfaRows(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Admins!A1:L'
  });
  const rows = response.data.values ?? [];
  const headers = rows[0] ?? [];
  assertSheetHeaders(headers, ADMIN_HEADERS, 'Admins');
  await ensureAdminMfaHeaders(sheets, spreadsheetId, headers);
  return rows;
}

export async function savePendingAdminMfaSecret(email, encryptedSecret) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const { sheets } = getGoogleClients();
  const rows = await readAdminMfaRows(sheets, spreadsheetId);
  const normalizedEmail = String(email).trim().toLowerCase();
  const rowIndex = rows.findIndex((row, index) => index > 0 &&
    String(row[0] ?? '').trim().toLowerCase() === normalizedEmail
  );
  if (rowIndex < 1) return { saved: false, reason: 'not_found' };
  const row = rows[rowIndex];
  if (String(row[10] ?? '').trim().toLowerCase() === 'true') {
    return { saved: false, reason: 'already_enabled' };
  }
  const sheetRow = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Admins!J${sheetRow}:K${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[encryptedSecret, 'FALSE']] }
  });
  return { saved: true };
}

export async function enableAdminMfaInSheet(email, recoveryHashes) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const { sheets } = getGoogleClients();
  const rows = await readAdminMfaRows(sheets, spreadsheetId);
  const normalizedEmail = String(email).trim().toLowerCase();
  const rowIndex = rows.findIndex((row, index) => index > 0 &&
    String(row[0] ?? '').trim().toLowerCase() === normalizedEmail
  );
  if (rowIndex < 1) return { enabled: false, reason: 'not_found' };
  const row = rows[rowIndex];
  if (!String(row[9] ?? '').trim()) throw new Error('The pending authenticator secret is missing.');
  if (String(row[10] ?? '').trim().toLowerCase() === 'true') {
    return { enabled: false, reason: 'already_enabled' };
  }
  const version = parseSessionVersion(row[8]);
  if (version >= Number.MAX_SAFE_INTEGER) throw new Error('The account session version cannot be incremented.');
  const safeHashes = Array.isArray(recoveryHashes) ? recoveryHashes.filter(value => /^[a-f0-9]{64}$/i.test(String(value))) : [];
  const sheetRow = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Admins!I${sheetRow}:L${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[version + 1, row[9], 'TRUE', JSON.stringify(safeHashes)]] }
  });
  return { enabled: true, sessionVersion: version + 1 };
}

let mfaRecoveryWriteQueue = Promise.resolve();
async function withMfaRecoveryWriteLock(work) {
  const previous = mfaRecoveryWriteQueue;
  let release;
  mfaRecoveryWriteQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}

export async function consumeAdminMfaRecoveryHash(email, suppliedHash) {
  return withMfaRecoveryWriteLock(async () => {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
    if (!/^[a-f0-9]{64}$/i.test(String(suppliedHash ?? ''))) return { consumed: false };
    const { sheets } = getGoogleClients();
    const rows = await readAdminMfaRows(sheets, spreadsheetId);
    const normalizedEmail = String(email).trim().toLowerCase();
    const rowIndex = rows.findIndex((row, index) => index > 0 &&
      String(row[0] ?? '').trim().toLowerCase() === normalizedEmail
    );
    if (rowIndex < 1) return { consumed: false };
    const row = rows[rowIndex];
    if (String(row[10] ?? '').trim().toLowerCase() !== 'true') return { consumed: false };
    let hashes = [];
    try { hashes = JSON.parse(String(row[11] ?? '[]')); } catch { hashes = []; }
    if (!Array.isArray(hashes)) hashes = [];
    const supplied = Buffer.from(String(suppliedHash), 'hex');
    const matchIndex = hashes.findIndex(value => {
      if (!/^[a-f0-9]{64}$/i.test(String(value ?? ''))) return false;
      const stored = Buffer.from(String(value), 'hex');
      return stored.length === supplied.length && timingSafeEqual(stored, supplied);
    });
    if (matchIndex < 0) return { consumed: false };
    hashes.splice(matchIndex, 1);
    const sheetRow = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Admins!L${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[JSON.stringify(hashes)]] }
    });
    return { consumed: true, remaining: hashes.length };
  });
}

export async function readCustomersFromSheet() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const { sheets } = getGoogleClients();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Users!A1:F'
  });
  const [headers = [], ...rows] = response.data.values ?? [];
  assertSheetHeaders(headers, USER_HEADERS, 'Users');

  return rows
    .filter(row => row.some(value => String(value ?? '').trim() !== ''))
    .filter(row => String(row[4] ?? '').trim().toLowerCase() === 'customer')
    .map(row => ({
      id: String(row[0] ?? ''),
      name: String(row[1] ?? ''),
      email: String(row[2] ?? '').trim().toLowerCase(),
      role: 'customer',
      createdAt: String(row[5] ?? '')
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function readAdminsFromSheet() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const { sheets } = getGoogleClients();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Admins!A1:L'
  });
  const [headers = [], ...rows] = response.data.values ?? [];
  assertSheetHeaders(headers, ADMIN_HEADERS, 'Admins');

  return rows
    .filter(row => row.some(value => String(value ?? '').trim() !== ''))
    .map(row => ({
      email: String(row[0] ?? '').trim().toLowerCase(),
      role: String(row[2] ?? '').trim().toLowerCase(),
      active: String(row[3] ?? '').trim().toLowerCase() === 'true',
      fullName: String(row[4] ?? '').trim(),
      mfaEnabled: String(row[10] ?? '').trim().toLowerCase() === 'true'
    }))
    .sort((a, b) => a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.email.localeCompare(b.email));
}

export async function createAdminInSheet({ email, passwordHash, role, fullName }) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const { sheets } = getGoogleClients();
  const normalizedEmail = email.trim().toLowerCase();

  // Read both email columns in one Sheets API round-trip.
  const duplicateCheck = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: ['Users!C2:C', 'Admins!A2:A']
  });
  const [usersRange, adminsRange] = duplicateCheck.data.valueRanges ?? [];
  const userExists = (usersRange?.values ?? []).some(row =>
    String(row[0] ?? '').trim().toLowerCase() === normalizedEmail
  );
  const adminExists = (adminsRange?.values ?? []).some(row =>
    String(row[0] ?? '').trim().toLowerCase() === normalizedEmail
  );
  if (userExists || adminExists) return { created: false, reason: 'email_exists' };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Admins!A:E',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[normalizedEmail, passwordHash, role, 'TRUE', fullName.trim()]]
    }
  });
  return {
    created: true,
    admin: { email: normalizedEmail, role, active: true, fullName: fullName.trim(), mfaEnabled: false }
  };
}

export async function deleteAdminFromSheet(email) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254) {
    return { deleted: false, reason: 'invalid_email' };
  }

  const { sheets } = getGoogleClients();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Admins!A1:I'
  });
  const rows = response.data.values ?? [];
  assertSheetHeaders(rows[0] ?? [], ADMIN_HEADERS, 'Admins');

  const rowIndex = rows.findIndex((row, index) => index > 0 &&
    String(row[0] ?? '').trim().toLowerCase() === normalizedEmail
  );
  if (rowIndex < 1) return { deleted: false, reason: 'not_found' };

  const role = String(rows[rowIndex][2] ?? '').trim().toLowerCase();
  if (role === 'owner') return { deleted: false, reason: 'owner_protected' };

  // Resolve the actual tab ID instead of assuming that the Admins tab has
  // a particular numeric sheetId. Delete only the matching data row.
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties'
  });
  const adminSheet = (metadata.data.sheets ?? []).find(
    sheet => sheet.properties?.title === 'Admins'
  );
  const sheetId = adminSheet?.properties?.sheetId;
  if (!Number.isInteger(sheetId)) {
    throw new Error('The Admins sheet tab could not be located.');
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1
          }
        }
      }]
    }
  });

  return { deleted: true, email: normalizedEmail };
}

export async function updateAdminInSheet(email, updates) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const { sheets } = getGoogleClients();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Admins!A1:L'
  });
  const rows = response.data.values ?? [];
  const headers = rows[0] ?? [];
  assertSheetHeaders(headers, ADMIN_HEADERS, 'Admins');
  await ensureAdminMfaHeaders(sheets, spreadsheetId, headers);
  const rowIndex = rows.findIndex((row, index) => index > 0 &&
    String(row[0] ?? '').trim().toLowerCase() === email.trim().toLowerCase()
  );
  if (rowIndex < 1) return { updated: false, reason: 'not_found' };

  const row = rows[rowIndex];
  const currentRole = String(row[2] ?? '').trim().toLowerCase();
  if (currentRole === 'owner') return { updated: false, reason: 'owner_protected' };
  const currentActive = String(row[3] ?? '').trim().toLowerCase() === 'true';
  const nextRole = updates.role ?? currentRole;
  const nextActive = updates.active ?? currentActive;
  if (!['admin', 'manager'].includes(nextRole)) {
    throw new Error('Managed admin roles must be admin or manager.');
  }

  const updatedRow = [row[0], row[1], nextRole, nextActive ? 'TRUE' : 'FALSE', row[4] ?? ''];
  const accessChanged = nextRole !== currentRole || nextActive !== currentActive;
  const currentVersion = parseSessionVersion(row[8]);
  if (accessChanged && currentVersion >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Administrator session version is exhausted.');
  }
  const data = [{ range: `Admins!A${rowIndex + 1}:E${rowIndex + 1}`, values: [updatedRow] }];
  if (accessChanged) {
    data.push({ range: `Admins!I${rowIndex + 1}`, values: [[currentVersion + 1]] });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    valueInputOption: 'RAW',
    requestBody: { data }
  });
  return {
    updated: true,
    admin: {
      email: String(updatedRow[0]).trim().toLowerCase(),
      role: nextRole,
      active: nextActive,
      fullName: String(updatedRow[4] ?? '').trim(),
      mfaEnabled: String(row[10] ?? '').trim().toLowerCase() === 'true'
    }
  };
}

export async function createCustomerInSheet({
  name,
  email,
  passwordHash
}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured.');
  }

  const { sheets } = getGoogleClients();

  const normalizedEmail = email.trim().toLowerCase();

  // Check whether this email already exists.
  const existingUsers = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Users!C2:C'
  });

  const emailExists = (existingUsers.data.values ?? []).some(
    row => String(row[0] ?? '').trim().toLowerCase() === normalizedEmail
  );

  if (emailExists) {
    return {
      created: false,
      reason: 'email_exists'
    };
  }

  const customerId = randomUUID();
  const createdAt = new Date().toISOString();

  // Save the customer in the Users sheet.
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Users!A:F',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        customerId,
        name.trim(),
        normalizedEmail,
        passwordHash,
        'customer',
        createdAt
      ]]
    }
  });

  return {
    created: true,
    id: customerId
  };
}
export async function createProductInSheet({
  name,
  category,
  price,
  stock,
  image = '',
  images = [],
  description = ''
}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not configured.');
  }

  const { sheets } = getGoogleClients();
  await ensureProductImagesColumn(sheets, spreadsheetId);
  const productImages = normalizeProductImages(image, images);

  const product = {
    id: randomUUID(),
    name: name.trim(),
    category: category.trim(),
    price: Number(price),
    oldPrice: Number(price),
    rating: 0,
    reviews: 0,
    image: productImages[0] || '',
    images: productImages,
    tag: '',
    description: String(description || '').trim(),
    stock: Number(stock)
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Products!A:L',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        product.id,
        product.name,
        product.category,
        product.price,
        product.oldPrice,
        product.rating,
        product.reviews,
        product.image,
        product.tag,
        product.description,
        product.stock,
        JSON.stringify(product.images)
      ]]
    }
  });

  return {
    created: true,
    product
  };
}


// Find a product's current row using its stable ID in column A.
async function findProductRow(sheets, spreadsheetId, productId) {
  await ensureProductImagesColumn(sheets, spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Products!A1:L'
  });
  const rows = response.data.values ?? [];
  const rowIndex = rows.findIndex((row, index) =>
    index > 0 && String(row[0] ?? '').trim() === String(productId).trim()
  );
  if (rowIndex === -1) return null;
  return { rowNumber: rowIndex + 1, row: rows[rowIndex] };
}

export async function updateProductInSheet(productId, updates) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  const { sheets } = getGoogleClients();
  const found = await findProductRow(sheets, spreadsheetId, productId);
  if (!found) return { updated: false, reason: 'not_found' };

  const oldRow = found.row;
  const oldImages = parseProductImagesCell(oldRow[11]);
  const imageInput = updates.image === undefined ? String(oldRow[7] || '') : String(updates.image || '');
  const galleryInput = updates.images === undefined ? oldImages : updates.images;
  const productImages = normalizeProductImages(imageInput, galleryInput);
  const product = {
    id: String(oldRow[0] ?? productId),
    name: updates.name.trim(),
    category: updates.category.trim(),
    price: Number(updates.price),
    oldPrice: Number(oldRow[4] || updates.price),
    rating: Number(oldRow[5] || 0),
    reviews: Number(oldRow[6] || 0),
    image: productImages[0] || '',
    images: productImages,
    tag: String(oldRow[8] || ''),
    description: String(updates.description || '').trim(),
    stock: Number(updates.stock)
  };

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Products!A${found.rowNumber}:L${found.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        product.id, product.name, product.category, product.price,
        product.oldPrice, product.rating, product.reviews, product.image,
        product.tag, product.description, product.stock, JSON.stringify(product.images)
      ]]
    }
  });

  return { updated: true, product };
}

export async function deleteProductFromSheet(productId) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  const { sheets } = getGoogleClients();
  const found = await findProductRow(sheets, spreadsheetId, productId);
  if (!found) return { deleted: false, reason: 'not_found' };

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties'
  });
  const productSheet = (metadata.data.sheets ?? []).find(
    sheet => sheet.properties?.title === 'Products'
  );
  if (!productSheet) throw new Error('Products sheet tab was not found.');

  // Grid indexes are zero-based; row 1 is the header and is never deleted.
  const rowIndex = found.rowNumber - 1;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: productSheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1
          }
        }
      }]
    }
  });

  return { deleted: true, id: String(productId) };
}

// -------------------------
// Customer orders & stock
// -------------------------

const ORDER_HEADERS = [
  'orderId',
  'customerId',
  'customerName',
  'customerEmail',
  'itemsJson',
  'itemCount',
  'subtotal',
  'shipping',
  'total',
  'status',
  'paymentMethod',
  'shippingAddressJson',
  'createdAt',
  'updatedAt'
];

function orderCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { userEnteredValue: { numberValue: value } };
  }
  return { userEnteredValue: { stringValue: String(value ?? '') } };
}

async function readOrdersGrid(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Orders!A1:N'
  });
  let values = response.data.values ?? [];
  const firstRow = values[0] ?? [];
  const headerIsBlank = firstRow.every(value => !String(value ?? '').trim());

  if (headerIsBlank) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Orders!A1:N1',
      valueInputOption: 'RAW',
      requestBody: { values: [ORDER_HEADERS] }
    });
    values = [ORDER_HEADERS];
  } else {
    const actualHeaders = ORDER_HEADERS.map((_, index) =>
      String(firstRow[index] ?? '').trim()
    );
    if (actualHeaders.some((value, index) => value !== ORDER_HEADERS[index])) {
      const error = new Error(
        'Orders sheet headers do not match the required NOVA Market order columns.'
      );
      error.code = 'ORDER_HEADERS_MISMATCH';
      throw error;
    }
  }

  return values;
}

function parseOrderRow(row) {
  let items = [];
  let shippingAddress = {};
  try { items = JSON.parse(String(row[4] ?? '[]')); } catch { /* Keep an empty item list. */ }
  try { shippingAddress = JSON.parse(String(row[11] ?? '{}')); } catch { /* Keep an empty address. */ }

  return {
    orderId: String(row[0] ?? ''),
    customerId: String(row[1] ?? ''),
    customerName: String(row[2] ?? ''),
    customerEmail: String(row[3] ?? ''),
    items: Array.isArray(items) ? items : [],
    itemCount: Number(row[5] ?? 0),
    subtotal: Number(row[6] ?? 0),
    shipping: Number(row[7] ?? 0),
    total: Number(row[8] ?? 0),
    status: String(row[9] ?? ''),
    paymentMethod: String(row[10] ?? ''),
    shippingAddress: shippingAddress && typeof shippingAddress === 'object' ? shippingAddress : {},
    createdAt: String(row[12] ?? ''),
    updatedAt: String(row[13] ?? '')
  };
}

export async function readOrdersFromSheet({ customerId } = {}) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  const { sheets } = getGoogleClients();
  const values = await readOrdersGrid(sheets, spreadsheetId);
  const orders = values.slice(1)
    .filter(row => String(row[0] ?? '').trim())
    .map(parseOrderRow);

  const filtered = customerId
    ? orders.filter(order => order.customerId === String(customerId))
    : orders;

  return filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Serialize order writes within this Node process so two local requests cannot
// both deduct the same stock value at the same time.
let orderWriteQueue = Promise.resolve();

async function withOrderWriteLock(work) {
  const previous = orderWriteQueue;
  let release;
  orderWriteQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

export async function createOrderInSheet({ customer, items, shippingAddress }) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  return withOrderWriteLock(async () => {
    const { sheets } = getGoogleClients();
    const [productResponse, orderValues, metadata] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Products!A1:K' }),
      readOrdersGrid(sheets, spreadsheetId),
      sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
    ]);

    const productRows = productResponse.data.values ?? [];
    const productSheet = (metadata.data.sheets ?? []).find(
      sheet => sheet.properties?.title === 'Products'
    );
    const ordersSheet = (metadata.data.sheets ?? []).find(
      sheet => sheet.properties?.title === 'Orders'
    );
    if (!productSheet || !ordersSheet) {
      throw new Error('Products or Orders sheet tab was not found.');
    }

    // Merge duplicate product IDs so a repeated item cannot bypass stock checks.
    const quantities = new Map();
    for (const item of items) {
      const id = String(item.productId);
      quantities.set(id, (quantities.get(id) ?? 0) + Number(item.quantity));
    }

    const savedItems = [];
    const stockUpdates = [];
    let subtotal = 0;
    let itemCount = 0;

    for (const [productId, quantity] of quantities.entries()) {
      const rowIndex = productRows.findIndex((row, index) =>
        index > 0 && String(row[0] ?? '').trim() === productId
      );
      if (rowIndex === -1) {
        const error = new Error('One of the products in your bag is no longer available.');
        error.code = 'PRODUCT_NOT_FOUND';
        throw error;
      }

      const row = productRows[rowIndex];
      const stockText = String(row[10] ?? '').trim();
      if (!stockText) {
        const error = new Error(`Stock has not been configured for ${row[1] || 'a product'}.`);
        error.code = 'STOCK_NOT_CONFIGURED';
        throw error;
      }

      const availableStock = Number(stockText);
      if (!Number.isInteger(availableStock) || availableStock < 0) {
        const error = new Error(`Stock information is invalid for ${row[1] || 'a product'}.`);
        error.code = 'STOCK_INVALID';
        throw error;
      }
      if (availableStock < quantity) {
        const error = new Error(`Only ${availableStock} unit(s) of ${row[1]} are currently available.`);
        error.code = 'INSUFFICIENT_STOCK';
        throw error;
      }

      const price = Number(row[3]);
      if (!Number.isFinite(price) || price <= 0) {
        const error = new Error(`Price information is invalid for ${row[1] || 'a product'}.`);
        error.code = 'PRODUCT_PRICE_INVALID';
        throw error;
      }

      const itemTotal = Math.round(price * quantity * 100) / 100;
      subtotal += itemTotal;
      itemCount += quantity;
      savedItems.push({
        productId,
        name: String(row[1] ?? ''),
        category: String(row[2] ?? ''),
        price,
        quantity,
        image: String(row[7] ?? '')
      });
      stockUpdates.push({
        rowIndex,
        newStock: availableStock - quantity
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const shipping = subtotal <= 999 ? 49 : 0;
    const total = Math.round((subtotal + shipping) * 100) / 100;
    const now = new Date().toISOString();
    const orderId = `NM-${randomUUID().slice(0, 8).toUpperCase()}`;

    const order = {
      orderId,
      customerId: String(customer.id),
      customerName: String(customer.name ?? ''),
      customerEmail: String(customer.email ?? ''),
      items: savedItems,
      itemCount,
      subtotal,
      shipping,
      total,
      status: 'Placed',
      paymentMethod: 'Cash on Delivery',
      shippingAddress,
      createdAt: now,
      updatedAt: now
    };

    const requests = stockUpdates.map(update => ({
      updateCells: {
        start: {
          sheetId: productSheet.properties.sheetId,
          rowIndex: update.rowIndex,
          columnIndex: 10
        },
        rows: [{ values: [orderCell(update.newStock)] }],
        fields: 'userEnteredValue'
      }
    }));

    // orderValues includes the header row, so its length is the next zero-based row.
    const orderRowIndex = orderValues.length;
    const orderCells = [
      order.orderId,
      order.customerId,
      order.customerName,
      order.customerEmail,
      JSON.stringify(order.items),
      order.itemCount,
      order.subtotal,
      order.shipping,
      order.total,
      order.status,
      order.paymentMethod,
      JSON.stringify(order.shippingAddress),
      order.createdAt,
      order.updatedAt
    ];

    requests.push({
      updateCells: {
        start: {
          sheetId: ordersSheet.properties.sheetId,
          rowIndex: orderRowIndex,
          columnIndex: 0
        },
        rows: [{ values: orderCells.map(orderCell) }],
        fields: 'userEnteredValue'
      }
    });

    // One spreadsheet batch writes the order row and all stock deductions together.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });

    return { created: true, order };
  });
}

export async function updateOrderStatusInSheet(orderId, status) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');

  const { sheets } = getGoogleClients();
  const values = await readOrdersGrid(sheets, spreadsheetId);
  const rowIndex = values.findIndex((row, index) =>
    index > 0 && String(row[0] ?? '').trim() === String(orderId).trim()
  );
  if (rowIndex === -1) return { updated: false };

  const updatedAt = new Date().toISOString();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    valueInputOption: 'RAW',
    requestBody: {
      data: [
        { range: `Orders!J${rowIndex + 1}:J${rowIndex + 1}`, values: [[status]] },
        { range: `Orders!N${rowIndex + 1}:N${rowIndex + 1}`, values: [[updatedAt]] }
      ]
    }
  });

  const updatedOrder = parseOrderRow(values[rowIndex]);
  updatedOrder.status = status;
  updatedOrder.updatedAt = updatedAt;
  return { updated: true, order: updatedOrder };
}


// -------------------------
// Password reset tokens
// -------------------------
// Reset metadata is stored in unused columns on the existing Users and Admins
// tabs. Only SHA-256 token hashes are stored; the raw token is emailed once.
const USER_RESET_HEADERS = ['resetTokenHash', 'resetExpiresAt', 'resetRequestedAt'];
const ADMIN_RESET_HEADERS = ['resetTokenHash', 'resetExpiresAt', 'resetRequestedAt'];
const USER_BASE_HEADERS = ['id', 'name', 'email', 'passwordHash', 'role', 'createdAt'];
const ADMIN_BASE_HEADERS = ['email', 'passwordHash', 'role', 'active', 'fullName'];

async function readResetRows(sheets, spreadsheetId, accountType) {
  const isAdmin = accountType === 'admin';
  const tab = isAdmin ? 'Admins' : 'Users';
  const range = isAdmin ? 'Admins!A1:I' : 'Users!A1:J';
  const baseHeaders = isAdmin ? ADMIN_BASE_HEADERS : USER_BASE_HEADERS;
  const resetHeaders = isAdmin ? ADMIN_RESET_HEADERS : USER_RESET_HEADERS;
  const resetStartColumn = isAdmin ? 'F' : 'G';
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values ?? [];
  const headers = rows[0] ?? [];

  const actualBase = baseHeaders.map((_, index) => String(headers[index] ?? '').trim());
  if (actualBase.some((value, index) => value !== baseHeaders[index])) {
    throw new Error(`${tab} sheet base headers do not match the required NOVA Market columns.`);
  }

  const resetActual = resetHeaders.map((_, index) =>
    String(headers[baseHeaders.length + index] ?? '').trim()
  );
  if (resetActual.every(value => !value)) {
    const endColumn = isAdmin ? 'H' : 'I';
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!${resetStartColumn}1:${endColumn}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [resetHeaders] }
    });
  } else if (resetActual.some((value, index) => value !== resetHeaders[index])) {
    throw new Error(`${tab} sheet password-reset columns do not match the required NOVA Market columns.`);
  }

  // This monotonically increasing version revokes every existing JWT after a
  // password reset. Blank legacy cells are treated as version zero.
  const sessionVersionIndex = baseHeaders.length + resetHeaders.length;
  const sessionVersionColumn = isAdmin ? 'I' : 'J';
  const sessionVersionHeader = String(headers[sessionVersionIndex] ?? '').trim();
  if (!sessionVersionHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab}!${sessionVersionColumn}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['sessionVersion']] }
    });
  } else if (sessionVersionHeader !== 'sessionVersion') {
    throw new Error(`${tab} sheet sessionVersion header is invalid.`);
  }

  return { rows, tab, isAdmin, baseHeaders, sessionVersionColumn, sessionVersionIndex };
}

function resetHashesMatch(storedHex, suppliedHex) {
  if (!/^[a-f0-9]{64}$/i.test(String(storedHex ?? '')) ||
      !/^[a-f0-9]{64}$/i.test(String(suppliedHex ?? ''))) return false;
  const stored = Buffer.from(storedHex, 'hex');
  const supplied = Buffer.from(suppliedHex, 'hex');
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

export async function savePasswordResetToken({ email, accountType, tokenHash, expiresAt, requestedAt }) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  if (!['admin', 'customer'].includes(accountType)) throw new Error('Invalid password reset account type.');

  const { sheets } = getGoogleClients();
  const { rows, tab, isAdmin } = await readResetRows(sheets, spreadsheetId, accountType);
  const normalizedEmail = String(email).trim().toLowerCase();
  const rowIndex = rows.findIndex((row, index) => index > 0 &&
    String(row[isAdmin ? 0 : 2] ?? '').trim().toLowerCase() === normalizedEmail
  );
  if (rowIndex < 1) return { saved: false, reason: 'not_found' };

  const row = rows[rowIndex];
  if (isAdmin) {
    const active = String(row[3] ?? '').trim().toLowerCase() === 'true';
    const role = String(row[2] ?? '').trim().toLowerCase();
    if (!active || !['owner', 'admin', 'manager'].includes(role)) {
      return { saved: false, reason: 'inactive' };
    }
  } else if (String(row[4] ?? '').trim().toLowerCase() !== 'customer') {
    return { saved: false, reason: 'not_found' };
  }

  const sheetRow = rowIndex + 1;
  const startColumn = isAdmin ? 'F' : 'G';
  const endColumn = isAdmin ? 'H' : 'I';
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!${startColumn}${sheetRow}:${endColumn}${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[tokenHash, expiresAt, requestedAt]] }
  });
  return { saved: true };
}

let passwordResetWriteQueue = Promise.resolve();

async function withPasswordResetWriteLock(work) {
  const previous = passwordResetWriteQueue;
  let release;
  passwordResetWriteQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

export async function consumePasswordResetToken({ email, tokenHash, newPasswordHash, nowIso }) {
  return withPasswordResetWriteLock(async () => {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const normalizedEmail = String(email).trim().toLowerCase();
  const { sheets } = getGoogleClients();

  // Account emails are unique across Users and Admins. Check Admins first to
  // match the same precedence used by the login route.
  for (const accountType of ['admin', 'customer']) {
    const { rows, tab, isAdmin, sessionVersionColumn, sessionVersionIndex } = await readResetRows(sheets, spreadsheetId, accountType);
    const emailIndex = isAdmin ? 0 : 2;
    const rowIndex = rows.findIndex((row, index) => index > 0 &&
      String(row[emailIndex] ?? '').trim().toLowerCase() === normalizedEmail
    );
    if (rowIndex < 1) continue;

    const row = rows[rowIndex];
    if (isAdmin) {
      const active = String(row[3] ?? '').trim().toLowerCase() === 'true';
      const role = String(row[2] ?? '').trim().toLowerCase();
      if (!active || !['owner', 'admin', 'manager'].includes(role)) continue;
    } else if (String(row[4] ?? '').trim().toLowerCase() !== 'customer') {
      continue;
    }

    const resetOffset = isAdmin ? 5 : 6;
    const storedHash = String(row[resetOffset] ?? '');
    const expiresAt = Date.parse(String(row[resetOffset + 1] ?? ''));
    if (!resetHashesMatch(storedHash, tokenHash) || !Number.isFinite(expiresAt) || expiresAt <= Date.parse(nowIso)) {
      return { reset: false };
    }

    const sheetRow = rowIndex + 1;
    const passwordColumn = isAdmin ? 'B' : 'D';
    const resetStartColumn = isAdmin ? 'F' : 'G';
    const resetEndColumn = isAdmin ? 'H' : 'I';
    const currentSessionVersion = Number(row[sessionVersionIndex] || 0);
    if (!Number.isSafeInteger(currentSessionVersion) || currentSessionVersion < 0 || currentSessionVersion >= Number.MAX_SAFE_INTEGER) {
      throw new Error('The account session version is invalid.');
    }
    // Password hash update, one-time token invalidation and session revocation
    // are sent in a single Sheets API batch.
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      valueInputOption: 'RAW',
      requestBody: {
        data: [
          { range: `${tab}!${passwordColumn}${sheetRow}`, values: [[newPasswordHash]] },
          { range: `${tab}!${resetStartColumn}${sheetRow}:${resetEndColumn}${sheetRow}`, values: [['', '', '']] },
          { range: `${tab}!${sessionVersionColumn}${sheetRow}`, values: [[currentSessionVersion + 1]] }
        ]
      }
    });
    return { reset: true, accountType };
  }

  return { reset: false };
  });
}

// Revoke all outstanding sessions for an account. Session versions live in
// the Users!J or Admins!I column and are checked on every protected request.
export async function revokeAccountSessionsInSheet({ email, accountType }) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  if (!['admin', 'customer'].includes(accountType)) throw new Error('Invalid account type for session revocation.');

  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254) return { revoked: false, reason: 'invalid_email' };

  const { sheets } = getGoogleClients();
  const { rows, tab, isAdmin, sessionVersionColumn, sessionVersionIndex } =
    await readResetRows(sheets, spreadsheetId, accountType);
  const emailIndex = isAdmin ? 0 : 2;
  const rowIndex = rows.findIndex((row, index) => index > 0 &&
    String(row[emailIndex] ?? '').trim().toLowerCase() === normalizedEmail
  );
  if (rowIndex < 1) return { revoked: false, reason: 'not_found' };

  const currentVersion = parseSessionVersion(rows[rowIndex][sessionVersionIndex]);
  if (currentVersion >= Number.MAX_SAFE_INTEGER) throw new Error('Account session version is exhausted.');
  const nextVersion = currentVersion + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!${sessionVersionColumn}${rowIndex + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[nextVersion]] }
  });
  return { revoked: true, sessionVersion: nextVersion };
}



// -------------------------
// Security audit trail
// -------------------------
const SECURITY_LOG_HEADERS = [
  'timestamp', 'event', 'actorEmail', 'actorRole', 'targetEmail',
  'targetRole', 'outcome', 'ipFingerprint', 'userAgent', 'summary'
];
let securityLogSetupPromise = null;

function cleanAuditValue(value, maxLength = 180) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

async function ensureSecurityLogSheet(sheets, spreadsheetId) {
  if (securityLogSetupPromise) return securityLogSetupPromise;
  securityLogSetupPromise = (async () => {
    let metadata = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)'
    });
    let exists = (metadata.data.sheets ?? []).some(
      sheet => sheet.properties?.title === 'SecurityLogs'
    );
    if (!exists) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: 'SecurityLogs' } } }] }
        });
      } catch (error) {
        // Another server instance may have created the tab at the same time.
        metadata = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'sheets.properties(sheetId,title)'
        });
        exists = (metadata.data.sheets ?? []).some(
          sheet => sheet.properties?.title === 'SecurityLogs'
        );
        if (!exists) throw error;
      }
    }

    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SecurityLogs!A1:J1'
    });
    const currentHeaders = headerResponse.data.values?.[0] ?? [];
    if (currentHeaders.length === 0 || currentHeaders.every(value => !String(value ?? '').trim())) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'SecurityLogs!A1:J1',
        valueInputOption: 'RAW',
        requestBody: { values: [SECURITY_LOG_HEADERS] }
      });
    } else if (SECURITY_LOG_HEADERS.some((header, index) => String(currentHeaders[index] ?? '').trim() !== header)) {
      throw new Error('SecurityLogs sheet headers do not match the required NOVA Market audit columns.');
    }
  })();
  try {
    await securityLogSetupPromise;
  } catch (error) {
    securityLogSetupPromise = null;
    throw error;
  }
}

export async function appendSecurityAuditLog(event) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const { sheets } = getGoogleClients();
  await ensureSecurityLogSheet(sheets, spreadsheetId);
  const values = [[
    cleanAuditValue(event.timestamp || new Date().toISOString(), 40),
    cleanAuditValue(event.event, 80),
    cleanAuditValue(event.actorEmail, 254),
    cleanAuditValue(event.actorRole, 40),
    cleanAuditValue(event.targetEmail, 254),
    cleanAuditValue(event.targetRole, 40),
    cleanAuditValue(event.outcome, 40),
    cleanAuditValue(event.ipFingerprint, 32),
    cleanAuditValue(event.userAgent, 180),
    cleanAuditValue(event.summary, 180)
  ]];
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'SecurityLogs!A:J',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
  return { written: true };
}

export async function readSecurityAuditLogs(limit = 100) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const safeLimit = Math.max(1, Math.min(250, Number.isSafeInteger(Number(limit)) ? Number(limit) : 100));
  const { sheets } = getGoogleClients();
  await ensureSecurityLogSheet(sheets, spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SecurityLogs!A1:J5000'
  });
  const [headers = [], ...rows] = response.data.values ?? [];
  if (SECURITY_LOG_HEADERS.some((header, index) => String(headers[index] ?? '').trim() !== header)) {
    throw new Error('SecurityLogs sheet headers do not match the required NOVA Market audit columns.');
  }
  return rows
    .filter(row => row.some(value => String(value ?? '').trim() !== ''))
    .slice(-safeLimit)
    .reverse()
    .map(row => Object.fromEntries(SECURITY_LOG_HEADERS.map((header, index) => [header, row[index] ?? ''])));
}


// -------------------------
// Persistent suspicious-authentication state
// -------------------------
// SecurityLogs remains the readable audit trail. SecurityAttempts stores only
// short-lived operational state: an HMAC account/network key, phase, event type
// and block expiry. No raw IP, email, password, TOTP or recovery code is stored.
const SECURITY_ATTEMPT_HEADERS = ['timestamp', 'keyHash', 'phase', 'eventType', 'blockedUntil'];
let securityAttemptSetupPromise = null;
let securityAttemptWritesSinceCompact = 0;

async function ensureSecurityAttemptSheet(sheets, spreadsheetId) {
  if (securityAttemptSetupPromise) return securityAttemptSetupPromise;
  securityAttemptSetupPromise = (async () => {
    let metadata = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)'
    });
    let exists = (metadata.data.sheets ?? []).some(
      sheet => sheet.properties?.title === 'SecurityAttempts'
    );
    if (!exists) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: 'SecurityAttempts' } } }] }
        });
      } catch (error) {
        metadata = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'sheets.properties(sheetId,title)'
        });
        exists = (metadata.data.sheets ?? []).some(
          sheet => sheet.properties?.title === 'SecurityAttempts'
        );
        if (!exists) throw error;
      }
    }
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SecurityAttempts!A1:E1'
    });
    const currentHeaders = headerResponse.data.values?.[0] ?? [];
    if (currentHeaders.length === 0 || currentHeaders.every(value => !String(value ?? '').trim())) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'SecurityAttempts!A1:E1',
        valueInputOption: 'RAW',
        requestBody: { values: [SECURITY_ATTEMPT_HEADERS] }
      });
    } else if (SECURITY_ATTEMPT_HEADERS.some((header, index) => String(currentHeaders[index] ?? '').trim() !== header)) {
      throw new Error('SecurityAttempts sheet headers do not match the required NOVA Market columns.');
    }
  })();
  try {
    await securityAttemptSetupPromise;
  } catch (error) {
    securityAttemptSetupPromise = null;
    throw error;
  }
}

async function compactSecurityAttemptsIfNeeded(sheets, spreadsheetId) {
  securityAttemptWritesSinceCompact += 1;
  if (securityAttemptWritesSinceCompact < 100) return;
  securityAttemptWritesSinceCompact = 0;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SecurityAttempts!A1:E'
  });
  const [headers = [], ...rows] = response.data.values ?? [];
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const recentRows = rows.filter(row => {
    const timestamp = Date.parse(String(row[0] || ''));
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
  if (recentRows.length === rows.length) return;

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'SecurityAttempts!A2:E'
  });
  if (recentRows.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'SecurityAttempts!A2:E',
      valueInputOption: 'RAW',
      requestBody: { values: recentRows }
    });
  }
}

export async function appendSecurityAttempt(attempt) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const { sheets } = getGoogleClients();
  await ensureSecurityAttemptSheet(sheets, spreadsheetId);
  const values = [[
    cleanAuditValue(attempt.timestamp || new Date().toISOString(), 40),
    cleanAuditValue(attempt.keyHash, 64),
    cleanAuditValue(attempt.phase, 16),
    cleanAuditValue(attempt.eventType, 16),
    cleanAuditValue(attempt.blockedUntil, 40)
  ]];
  if (!/^[a-f0-9]{64}$/i.test(values[0][1])) throw new Error('Security attempt key fingerprint is invalid.');
  if (!['password', 'mfa'].includes(values[0][2])) throw new Error('Security attempt phase is invalid.');
  if (!['failure', 'clear', 'block'].includes(values[0][3])) throw new Error('Security attempt event type is invalid.');
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'SecurityAttempts!A:E',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
  await compactSecurityAttemptsIfNeeded(sheets, spreadsheetId);
  return { written: true };
}

export async function readSecurityAttemptState({ keyHash, phase, nowIso, windowStartIso }) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  if (!/^[a-f0-9]{64}$/i.test(String(keyHash || ''))) throw new Error('Security attempt key fingerprint is invalid.');
  if (!['password', 'mfa'].includes(phase)) throw new Error('Security attempt phase is invalid.');
  const { sheets } = getGoogleClients();
  await ensureSecurityAttemptSheet(sheets, spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SecurityAttempts!A1:E'
  });
  const [headers = [], ...rows] = response.data.values ?? [];
  if (SECURITY_ATTEMPT_HEADERS.some((header, index) => String(headers[index] ?? '').trim() !== header)) {
    throw new Error('SecurityAttempts sheet headers do not match the required NOVA Market columns.');
  }

  const nowMs = Date.parse(nowIso);
  const windowStartMs = Date.parse(windowStartIso);
  let latestClearIndex = -1;
  let blockedUntilMs = 0;
  const matchingRows = rows.filter(row => String(row[1] || '') === keyHash && String(row[2] || '') === phase);
  matchingRows.forEach((row, index) => {
    if (String(row[3] || '') === 'clear') latestClearIndex = index;
    if (String(row[3] || '') === 'block') {
      const expiry = Date.parse(String(row[4] || ''));
      if (Number.isFinite(expiry) && expiry > blockedUntilMs) blockedUntilMs = expiry;
    }
  });

  let failureCount = 0;
  matchingRows.forEach((row, index) => {
    if (index <= latestClearIndex || String(row[3] || '') !== 'failure') return;
    const timestamp = Date.parse(String(row[0] || ''));
    if (Number.isFinite(timestamp) && timestamp >= windowStartMs && timestamp <= nowMs + 5_000) {
      failureCount += 1;
    }
  });
  return {
    failureCount,
    blockedUntil: blockedUntilMs > nowMs ? new Date(blockedUntilMs).toISOString() : ''
  };
}

// Owner-only monitoring feed. Expose only a short opaque reference for the
// account/network key; never return the full HMAC fingerprint to the browser.
export async function readRecentSecurityAttempts(limit = 500) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not configured.');
  const safeLimit = Math.max(1, Math.min(1000, Number.isSafeInteger(Number(limit)) ? Number(limit) : 500));
  const { sheets } = getGoogleClients();
  await ensureSecurityAttemptSheet(sheets, spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SecurityAttempts!A1:E5001'
  });
  const [headers = [], ...rows] = response.data.values ?? [];
  if (SECURITY_ATTEMPT_HEADERS.some((header, index) => String(headers[index] ?? '').trim() !== header)) {
    throw new Error('SecurityAttempts sheet headers do not match the required NOVA Market columns.');
  }
  return rows
    .filter(row => row.some(value => String(value ?? '').trim() !== ''))
    .slice(-safeLimit)
    .map(row => {
      const keyHash = String(row[1] || '');
      return {
        timestamp: String(row[0] || ''),
        keyRef: /^[a-f0-9]{64}$/i.test(keyHash) ? `…${keyHash.slice(-12)}` : 'unknown',
        phase: ['password', 'mfa'].includes(String(row[2] || '')) ? String(row[2]) : 'unknown',
        eventType: ['failure', 'clear', 'block'].includes(String(row[3] || '')) ? String(row[3]) : 'unknown',
        blockedUntil: String(row[4] || '')
      };
    });
}

