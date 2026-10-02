// SIDJIL — قناة استقبال المواد عبر Telegram
// لا يُخزَّن رمز البوت في الشيفرة. يضبط عبر wrangler secret.

import { nextArk, rebuildSearchBlob, audit, TYPE_DIRS } from './db.js';
import { r2KeyFor, safeName } from './r2files.js';

const MAX_TELEGRAM_FILE = 20 * 1024 * 1024;
const API_BASE = 'https://api.telegram.org/bot';
const TYPE_LABELS = {
  document: 'وثيقة', book: 'كتاب', manuscript: 'مخطوط', image: 'صورة',
  map: 'خريطة', press: 'صحافة', correspondence: 'مراسلات', excerpt: 'مقتطف',
  journal: 'مجلة', article: 'مقال',
};
const TYPE_BUTTONS = Object.entries(TYPE_LABELS);
const ALLOWED_EXTS = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif']);

function jsonHeaders() {
  return { 'content-type': 'application/json; charset=utf-8' };
}

function text(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function userInfo(message) {
  const from = message.from || {};
  return {
    id: String(from.id || ''),
    username: text(from.username, 120) || null,
    firstName: text(from.first_name, 120) || null,
    chatId: String(message.chat?.id || from.id || ''),
  };
}

function safeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a || ''));
  const bb = new TextEncoder().encode(String(b || ''));
  let diff = aa.length ^ bb.length;
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (aa[i] || 0) ^ (bb[i] || 0);
  return diff === 0;
}

function adminIds(env) {
  return new Set(String(env.TELEGRAM_ADMIN_USER_IDS || '').split(',').map((x) => x.trim()).filter(Boolean));
}

function isAdmin(env, fromId, chatId) {
  const ids = adminIds(env);
  const chat = String(env.TELEGRAM_ADMIN_CHAT_ID || '');
  return ids.has(String(fromId)) && (!chat || chat === String(chatId));
}

async function telegramCall(env, method, body = {}) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('لم يُضبط TELEGRAM_BOT_TOKEN');
  const res = await fetch(`${API_BASE}${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.description || `Telegram API ${method} failed`);
  return data.result;
}

async function sendMessage(env, chatId, message, options = {}) {
  return telegramCall(env, 'sendMessage', {
    chat_id: chatId,
    text: message,
    parse_mode: options.parse_mode || undefined,
    reply_markup: options.reply_markup || undefined,
    disable_web_page_preview: true,
  });
}

function keyboard(rows) {
  return { inline_keyboard: rows };
}

function typeKeyboard() {
  const rows = [];
  for (let i = 0; i < TYPE_BUTTONS.length; i += 2) {
    rows.push(TYPE_BUTTONS.slice(i, i + 2).map(([value, label]) => ({ text: label, callback_data: `sidjil:type:${value}` })));
  }
  return keyboard(rows);
}

async function setSession(db, info, state, payload = {}) {
  await db.prepare(
    `INSERT INTO telegram_sessions (chat_id, user_id, state, payload_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET user_id=excluded.user_id, state=excluded.state,
       payload_json=excluded.payload_json, updated_at=datetime('now')`
  ).bind(info.chatId, info.id, state, JSON.stringify(payload)).run();
}

async function getSession(db, chatId) {
  const row = await db.prepare('SELECT * FROM telegram_sessions WHERE chat_id = ?').bind(String(chatId)).first();
  if (!row) return { state: 'idle', payload: {} };
  try { return { state: row.state, payload: JSON.parse(row.payload_json || '{}') }; }
  catch { return { state: row.state, payload: {} }; }
}

async function clearSession(db, chatId) {
  await db.prepare('DELETE FROM telegram_sessions WHERE chat_id = ?').bind(String(chatId)).run();
}

async function rememberUpdate(db, update, info) {
  if (update.update_id === undefined) return true;
  const res = await db.prepare(
    'INSERT OR IGNORE INTO telegram_updates (update_id, chat_id, user_id) VALUES (?, ?, ?)'
  ).bind(update.update_id, info.chatId, info.id).run();
  return Number(res.meta?.changes || 0) > 0;
}

function mediaFromMessage(message) {
  if (message.document) {
    return {
      fileId: message.document.file_id,
      uniqueId: message.document.file_unique_id || null,
      filename: message.document.file_name || 'document.pdf',
      mime: message.document.mime_type || null,
      size: Number(message.document.file_size || 0) || null,
    };
  }
  if (Array.isArray(message.photo) && message.photo.length) {
    const p = message.photo[message.photo.length - 1];
    return {
      fileId: p.file_id,
      uniqueId: p.file_unique_id || null,
      filename: `telegram-${p.file_unique_id || Date.now()}.jpg`,
      mime: 'image/jpeg',
      size: Number(p.file_size || 0) || null,
    };
  }
  return null;
}

function validateMedia(media) {
  if (!media?.fileId) return 'لم أجد ملفًا في الرسالة.';
  if (media.size && media.size > MAX_TELEGRAM_FILE) return 'حجم الملف يتجاوز 20 ميغابايت، وهو الحد الذي يسمح به تنزيل Telegram للبوتات.';
  const name = safeName(media.filename);
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return 'صيغة الملف غير مدعومة. أرسل PDF أو DOC/DOCX أو JPG/PNG/WebP/TIFF.';
  return null;
}

async function promptStart(env, info) {
  await sendMessage(env, info.chatId,
    'مرحبًا بك في قناة استقبال سِجِل.\n\nأرسل /submit لإيداع ملخص أو كتاب أو صورة أو وثيقة للمراجعة، ثم اتبع الخطوات.');
}

async function startSubmission(env, info) {
  await setSession(env.DB, info, 'type', {});
  await sendMessage(env, info.chatId, 'اختر نوع المادة:', { reply_markup: typeKeyboard() });
}

async function continueAfterPlace(env, info, payload) {
  await setSession(env.DB, info, 'source', payload);
  await sendMessage(env, info.chatId, 'اذكر مصدر المادة أو صاحبها. إن لم تعرفه اكتب: غير معروف');
}

async function placeKeyboard(db) {
  const rows = await db.prepare(
    'SELECT id, name_ar, region FROM places ORDER BY CASE WHEN kind = \'city\' THEN 0 ELSE 1 END, name_ar LIMIT 30'
  ).all();
  const buttons = (rows.results || []).map((p) => ({
    text: p.region ? `${p.name_ar} — ${p.region}` : p.name_ar,
    callback_data: `sidjil:place:${p.id}`,
  }));
  const out = [];
  for (let i = 0; i < buttons.length; i += 2) out.push(buttons.slice(i, i + 2));
  out.push([{ text: 'لا يوجد مكان محدد', callback_data: 'sidjil:place:none' }]);
  return keyboard(out);
}

async function handleText(env, info, message, session) {
  const value = text(message.text, 4000);
  if (!value) return;
  if (value === '/start') { await clearSession(env.DB, info.chatId); return promptStart(env, info); }
  if (value === '/submit' || value === 'إيداع مادة') return startSubmission(env, info);
  if (value === '/cancel') { await clearSession(env.DB, info.chatId); return sendMessage(env, info.chatId, 'أُلغي الإيداع. يمكنك البدء من جديد عبر /submit.'); }
  if (value === '/done') {
    if (session.state !== 'media') return sendMessage(env, info.chatId, 'لا توجد مادة قيد التجهيز. أرسل /submit للبدء.');
    return finalizeSubmission(env, info, session.payload);
  }

  if (session.state === 'type') {
    const type = Object.keys(TYPE_LABELS).find((k) => k === value) || Object.entries(TYPE_LABELS).find(([, v]) => v === value)?.[0];
    if (!type) return sendMessage(env, info.chatId, 'اختر نوعًا من الأزرار أو أرسل /cancel.', { reply_markup: typeKeyboard() });
    const payload = { ...session.payload, type };
    await setSession(env.DB, info, 'title', payload);
    return sendMessage(env, info.chatId, 'اكتب عنوان المادة بالعربية.');
  }
  if (session.state === 'title') {
    const payload = { ...session.payload, title_ar: value.slice(0, 300) };
    await setSession(env.DB, info, 'description', payload);
    return sendMessage(env, info.chatId, 'اكتب ملخصًا واضحًا أو وصفًا للمادة.');
  }
  if (session.state === 'description') {
    const payload = { ...session.payload, description: value.slice(0, 6000) };
    await setSession(env.DB, info, 'date', payload);
    return sendMessage(env, info, 'اذكر السنة أو التاريخ (مثال: 1951 أو 6 ديسمبر 1951). إن لم تعرف اكتب: غير معروف');
  }
  if (session.state === 'date') {
    const yearMatch = value.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
    const payload = { ...session.payload, date_text: value === 'غير معروف' ? null : value, year: yearMatch ? Number(yearMatch[1]) : null };
    await setSession(env.DB, info, 'place', payload);
    return sendMessage(env, info.chatId, 'اختر المكان المرتبط بالمادة:', { reply_markup: await placeKeyboard(env.DB) });
  }
  if (session.state === 'source') {
    const payload = { ...session.payload, source_attribution: value === 'غير معروف' ? null : value.slice(0, 500) };
    await setSession(env.DB, info, 'rights', payload);
    return sendMessage(env, info.chatId, 'ما وضع حقوق النشر؟ اكتب: ملكية عامة، بإذن، أو غير معروف');
  }
  if (session.state === 'rights') {
    const payload = { ...session.payload, rights: value.slice(0, 500), rights_status: value === 'غير معروف' ? 'unknown' : 'reported' };
    await setSession(env.DB, info, 'media', { ...payload, files: [] });
    return sendMessage(env, info.chatId, 'أرسل الآن ملفًا أو صورة واحدة أو عدة ملفات. بعد الانتهاء أرسل /done.\nالحد الأقصى لكل ملف 20MB.');
  }
  if (session.state === 'media') return sendMessage(env, info.chatId, 'أرسل ملفًا أو صورة، ثم /done عند الانتهاء.');
  return promptStart(env, info);
}

async function handleMedia(env, info, message, session) {
  if (session.state !== 'media') {
    await sendMessage(env, info.chatId, 'ابدأ أولًا عبر /submit ثم أرسل الملف بعد إدخال بيانات المادة.');
    return;
  }
  const media = mediaFromMessage(message);
  const invalid = validateMedia(media);
  if (invalid) return sendMessage(env, info.chatId, invalid);
  if ((session.payload.files || []).some((f) => f.fileId === media.fileId)) {
    return sendMessage(env, info.chatId, 'هذا الملف مضاف بالفعل. أرسل ملفًا آخر أو /done.');
  }
  const payload = { ...session.payload, files: [...(session.payload.files || []), media] };
  await setSession(env.DB, info, 'media', payload);
  await sendMessage(env, info.chatId, `تمت إضافة الملف (${payload.files.length}). أرسل ملفًا آخر أو /done.`);
}

async function finalizeSubmission(env, info, payload) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (!files.length) return sendMessage(env, info.chatId, 'أرسل ملفًا واحدًا على الأقل قبل /done.');
  const type = TYPE_LABELS[payload.type] ? payload.type : 'document';
  const ark = await nextArk(env.DB, type);
  const sub = await env.DB.prepare(
    `INSERT INTO telegram_submissions (chat_id, user_id, username, first_name, status, expected_files, caption)
     VALUES (?, ?, ?, ?, 'processing', ?, ?)`
  ).bind(info.chatId, info.id, info.username, info.firstName, files.length, payload.description || null).run();
  const submissionId = sub.meta.last_row_id;
  const material = await env.DB.prepare(
    `INSERT INTO materials
      (ark, type, title_ar, description, language, year, date_text, date_confidence,
       place_id, place_confidence, rights, full_text, publish_status, created_via,
       telegram_submission_id, source_attribution, rights_status)
     VALUES (?, ?, ?, ?, 'ar', ?, ?, 'unknown', ?, ?, ?, ?, 'draft', 'telegram', ?, ?, ?)`
  ).bind(
    ark, type, text(payload.title_ar, 300), text(payload.description, 6000), payload.year || null,
    payload.date_text || null, payload.place_id || null, payload.place_id ? 'reported' : 'unknown',
    text(payload.rights, 500) || null, text(payload.description, 6000), submissionId,
    text(payload.source_attribution, 500) || null, payload.rights_status || 'unknown'
  ).run();
  const materialId = material.meta.last_row_id;
  await env.DB.prepare('UPDATE telegram_submissions SET material_id = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(materialId, submissionId).run();
  await env.DB.prepare('INSERT OR IGNORE INTO material_places (material_id, place_id, relation) SELECT ?, place_id, \'reported\' FROM materials WHERE id = ? AND place_id IS NOT NULL').bind(materialId, materialId).run();
  await rebuildSearchBlob(env.DB, materialId);
  for (const file of files) {
    await env.DB.prepare(
      `INSERT INTO telegram_submission_files (submission_id, telegram_file_id, telegram_unique_id, filename, mime, size)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(submissionId, file.fileId, file.uniqueId, safeName(file.filename), file.mime, file.size).run();
  }
  await setSession(env.DB, info, 'idle', {});
  await audit(env.DB, { action: 'telegram.submission.create', target: ark, detail: `submission=${submissionId}; files=${files.length}` });
  await sendMessage(env, info.chatId, `تم استلام المادة ${ark}. سيجري رفع الملفات ثم تُرسل إلى الإدارة للمراجعة. ستصلك النتيجة هنا.`);
  // Queue processing is preferred; local fallback keeps development usable.
  for (const file of files) {
    const row = await env.DB.prepare('SELECT id FROM telegram_submission_files WHERE submission_id = ? AND telegram_file_id = ?').bind(submissionId, file.fileId).first();
    const message = { submissionFileId: row.id };
    if (env.TELEGRAM_QUEUE?.send) await env.TELEGRAM_QUEUE.send(message);
    else await processTelegramFile(env, message);
  }
}

async function handleCallback(env, update) {
  const query = update.callback_query;
  const message = query.message;
  const data = String(query.data || '');
  const fromId = query.from?.id;
  await telegramCall(env, 'answerCallbackQuery', { callback_query_id: query.id }).catch(() => {});
  if (!message || !data.startsWith('sidjil:')) return;
  const info = {
    id: String(fromId || ''),
    username: text(query.from?.username, 120) || null,
    firstName: text(query.from?.first_name, 120) || null,
    chatId: String(message.chat?.id || ''),
  };
  if (data.startsWith('sidjil:type:')) {
    const type = data.slice('sidjil:type:'.length);
    if (!TYPE_LABELS[type]) return;
    const session = await getSession(env.DB, info.chatId);
    if (session.state !== 'type') return;
    await setSession(env.DB, info, 'title', { ...session.payload, type });
    return sendMessage(env, info.chatId, 'اكتب عنوان المادة بالعربية.');
  }
  if (data.startsWith('sidjil:place:')) {
    const id = data.slice('sidjil:place:'.length);
    const session = await getSession(env.DB, info.chatId);
    if (session.state !== 'place') return;
    const placeId = id === 'none' ? null : Number(id);
    if (placeId !== null && !Number.isInteger(placeId)) return;
    const payload = { ...session.payload, place_id: placeId };
    await continueAfterPlace(env, info, payload);
    return sendMessage(env, info.chatId, 'تم حفظ المكان.');
  }
  if (!isAdmin(env, fromId, message.chat?.id)) return;
  const m = data.match(/^sidjil:(approve|reject|changes):(\d+)$/);
  if (!m) return;
  return reviewSubmission(env, info, Number(m[2]), m[1], null, message.message_id);
}

async function handleAdminNote(env, info, message) {
  if (!isAdmin(env, info.id, info.chatId)) return false;
  const m = text(message.text).match(/^\/note\s+(\d+)\s+([\s\S]{2,2000})$/i);
  if (!m) return false;
  await reviewSubmission(env, info, Number(m[1]), 'changes', m[2], null);
  return true;
}

async function reviewSubmission(env, info, submissionId, decision, note, messageId) {
  if (!isAdmin(env, info.id, info.chatId)) return;
  const sub = await env.DB.prepare(
    `SELECT s.*, m.ark, m.title_ar FROM telegram_submissions s
     LEFT JOIN materials m ON m.id = s.material_id WHERE s.id = ?`
  ).bind(submissionId).first();
  if (!sub || !sub.material_id) return sendMessage(env, info.chatId, 'الإرسال غير موجود أو لم تكتمل ملفاته.');
  if (!['in_review', 'changes_requested'].includes(sub.status)) {
    return sendMessage(env, info.chatId, 'هذه المادة ليست في قائمة المراجعة.');
  }
  if (decision === 'approve') {
    await env.DB.prepare("UPDATE materials SET publish_status='published', review_note=NULL, updated_at=datetime('now') WHERE id=?").bind(sub.material_id).run();
    await env.DB.prepare("UPDATE telegram_submissions SET status='published', reviewed_by=?, review_note=NULL, updated_at=datetime('now') WHERE id=?").bind(info.id, submissionId).run();
    await rebuildSearchBlob(env.DB, sub.material_id);
    await audit(env.DB, { action: 'telegram.review.approve', target: sub.ark, detail: `submission=${submissionId}; reviewer=${info.id}` });
    if (messageId) await telegramCall(env, 'editMessageReplyMarkup', { chat_id: info.chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await sendMessage(env, sub.chat_id, `تم اعتماد ونشر المادة ${sub.ark}: ${sub.title_ar}`);
    return sendMessage(env, info.chatId, `تم نشر ${sub.ark}.`);
  }
  const finalNote = text(note || (decision === 'reject' ? 'يرجى مراجعة المادة والتواصل مع الإدارة قبل إعادة الإرسال.' : 'يرجى إجراء التعديلات المطلوبة ثم إعادة الإرسال.'), 2000);
  await env.DB.prepare("UPDATE materials SET publish_status='draft', review_note=?, updated_at=datetime('now') WHERE id=?").bind(finalNote, sub.material_id).run();
  await env.DB.prepare("UPDATE telegram_submissions SET status=?, reviewed_by=?, review_note=?, updated_at=datetime('now') WHERE id=?").bind(decision === 'reject' ? 'rejected' : 'changes_requested', info.id, finalNote, submissionId).run();
  await audit(env.DB, { action: `telegram.review.${decision}`, target: sub.ark, detail: finalNote.slice(0, 200) });
  await sendMessage(env, sub.chat_id, `تحتاج المادة ${sub.ark} إلى مراجعة. ملاحظة الإدارة:\n${finalNote}`);
  return sendMessage(env, info.chatId, `تم تسجيل القرار على ${sub.ark}.`);
}

async function sendReview(env, submissionId) {
  const adminChat = String(env.TELEGRAM_ADMIN_CHAT_ID || '');
  if (!adminChat) throw new Error('لم يُضبط TELEGRAM_ADMIN_CHAT_ID');
  const sub = await env.DB.prepare(
    `SELECT s.*, m.ark, m.title_ar, m.type, m.description, m.year, m.date_text, m.source_attribution, m.rights
     FROM telegram_submissions s JOIN materials m ON m.id=s.material_id WHERE s.id=?`
  ).bind(submissionId).first();
  if (!sub) throw new Error('إرسال Telegram غير موجود');
  const files = await env.DB.prepare(
    'SELECT * FROM telegram_submission_files WHERE submission_id = ? ORDER BY id'
  ).bind(submissionId).all();
  for (const f of files.results || []) {
    if (f.mime?.startsWith('image/')) await telegramCall(env, 'sendPhoto', { chat_id: adminChat, photo: f.telegram_file_id, caption: `${sub.ark} — ${f.filename}` });
    else await telegramCall(env, 'sendDocument', { chat_id: adminChat, document: f.telegram_file_id, caption: `${sub.ark} — ${f.filename}` });
  }
  const details = `إرسال جديد للمراجعة\n\n${sub.ark}\nالعنوان: ${sub.title_ar}\nالنوع: ${TYPE_LABELS[sub.type] || sub.type}\nالسنة: ${sub.year || sub.date_text || 'غير معروف'}\nالمصدر: ${sub.source_attribution || 'غير معروف'}\nالحقوق: ${sub.rights || 'غير معروف'}\n\n${text(sub.description, 1800)}`;
  const msg = await sendMessage(env, adminChat, details, { reply_markup: keyboard([
    [{ text: 'اعتماد ونشر', callback_data: `sidjil:approve:${submissionId}` }],
    [{ text: 'طلب تعديل', callback_data: `sidjil:changes:${submissionId}` }, { text: 'رفض', callback_data: `sidjil:reject:${submissionId}` }],
  ]) });
  await env.DB.prepare("UPDATE telegram_submissions SET review_message_id=?, status='in_review', updated_at=datetime('now') WHERE id=?").bind(String(msg.message_id), submissionId).run();
}

async function storeTelegramFile(env, submissionFileId) {
  const row = await env.DB.prepare(
    `SELECT sf.*, s.material_id, m.ark, m.type FROM telegram_submission_files sf
     JOIN telegram_submissions s ON s.id=sf.submission_id JOIN materials m ON m.id=s.material_id
     WHERE sf.id=?`
  ).bind(submissionFileId).first();
  if (!row || row.status === 'stored') return;
  try {
    const file = await telegramCall(env, 'getFile', { file_id: row.telegram_file_id });
    const res = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!res.ok) throw new Error('تعذّر تنزيل ملف Telegram');
    const size = Number(row.size || res.headers.get('content-length') || 0);
    if (size > MAX_TELEGRAM_FILE) throw new Error('حجم الملف يتجاوز 20 ميغابايت');
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_TELEGRAM_FILE) throw new Error('حجم الملف يتجاوز 20 ميغابايت');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const filename = safeName(row.filename || file.file_path?.split('/').pop() || 'telegram-file');
    const key = r2KeyFor({ ark: row.ark, type: row.type, kind: 'original', filename, sha8: sha256.slice(0, 8) });
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: row.mime || 'application/octet-stream' } });
    const inserted = await env.DB.prepare(
      `INSERT INTO files (material_id, kind, filename, mime, size, sha256, r2_key)
       VALUES (?, 'original', ?, ?, ?, ?, ?)`
    ).bind(row.material_id, filename, row.mime || 'application/octet-stream', bytes.byteLength, sha256, key).run();
    await env.DB.prepare("UPDATE telegram_submission_files SET status='stored', file_id=?, updated_at=datetime('now') WHERE id=?").bind(inserted.meta.last_row_id, submissionFileId).run();
    const sub = await env.DB.prepare('SELECT id, expected_files, uploaded_files, status, review_message_id FROM telegram_submissions WHERE id=?').bind(row.submission_id).first();
    await env.DB.prepare("UPDATE telegram_submissions SET uploaded_files=(SELECT COUNT(*) FROM telegram_submission_files WHERE submission_id=? AND status='stored'), updated_at=datetime('now') WHERE id=?").bind(row.submission_id, row.submission_id).run();
    const fresh = await env.DB.prepare('SELECT * FROM telegram_submissions WHERE id=?').bind(row.submission_id).first();
    if (fresh && fresh.uploaded_files >= fresh.expected_files && fresh.status === 'processing' && !fresh.review_message_id) {
      const claimed = await env.DB.prepare("UPDATE telegram_submissions SET status='in_review', updated_at=datetime('now') WHERE id=? AND status='processing' AND review_message_id IS NULL").bind(row.submission_id).run();
      if (Number(claimed.meta?.changes || 0) > 0) await sendReview(env, row.submission_id);
    }
  } catch (e) {
    await env.DB.prepare("UPDATE telegram_submission_files SET status='failed', error_message=?, updated_at=datetime('now') WHERE id=?").bind(text(e.message, 500), submissionFileId).run();
    await env.DB.prepare("UPDATE telegram_submissions SET status='failed', error_message=?, updated_at=datetime('now') WHERE id=?").bind(text(e.message, 500), row.submission_id).run();
    throw e;
  }
}

export async function processTelegramFile(env, message) {
  return storeTelegramFile(env, Number(message.submissionFileId));
}

export async function handleTelegramWebhook(request, env, ctx) {
  const url = new URL(request.url);
  const configuredPath = String(env.TELEGRAM_WEBHOOK_PATH || '');
  const expectedPath = `/api/v1/telegram/webhook/${configuredPath}`;
  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!configuredPath || url.pathname !== expectedPath || !safeEqual(supplied, env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response('Not found', { status: 404 });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const update = await request.json().catch(() => null);
  if (!update) return new Response('Bad request', { status: 400, headers: jsonHeaders() });
  const message = update.message || update.callback_query?.message;
  const info = message ? userInfo(message) : { chatId: '', id: '' };
  if (!info.chatId) return new Response('ok');
  try {
    if (!(await rememberUpdate(env.DB, update, info))) return new Response('ok');
    const work = (async () => {
      if (update.callback_query) return handleCallback(env, update);
      const session = await getSession(env.DB, info.chatId);
      if (await handleAdminNote(env, info, message)) return;
      if (message.document || message.photo) return handleMedia(env, info, message, session);
      return handleText(env, info, message, session);
    })();
    ctx.waitUntil(work.catch((e) => console.error('telegram webhook processing failed', e.message)));
    return new Response('ok');
  } catch (e) {
    console.error('telegram webhook failed', e.message);
    return new Response('ok');
  }
}

export async function handleTelegramQueue(batch, env, ctx) {
  for (const message of batch.messages) {
    try {
      await processTelegramFile(env, message.body);
      message.ack();
    } catch (e) {
      console.error('telegram queue message failed', e.message);
      message.retry();
    }
  }
}

export { telegramCall };
