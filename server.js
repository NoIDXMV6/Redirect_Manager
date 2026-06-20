const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const multer = require('multer');
const bcrypt = require('bcrypt');
const archiver = require('archiver');
const { pipeline } = require('stream/promises');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Роли пользователей ---
const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
};

// --- Загрузка конфига ---
let config;
const CONFIG_FILE = './config.json';

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = JSON.parse(raw);
    
    // Перенос старого пароля в новую структуру
    if (config.passwordHash && !config.users) {
      config.users = {
        admin: {
          passwordHash: config.passwordHash,
          role: 'admin'
        }
      };
      delete config.passwordHash;
    }
    
    // Если нет пользователей, создаём админа
    if (!config.users || Object.keys(config.users).length === 0) {
      const saltRounds = 10;
      const defaultPassword = 'password';
      config.users = {
        admin: {
          passwordHash: bcrypt.hashSync(defaultPassword, saltRounds),
          role: 'admin'
        }
      };
      console.log('🔑 Создан пользователь admin с паролем: password');
    }
    
    // Добавляем недостающие поля
    if (!config.adminEmail) config.adminEmail = 'admin@example.com';
    if (!config.backupIntervalHours) config.backupIntervalHours = 24;
    if (!config.backupRetentionDays) config.backupRetentionDays = 7;
    if (!config.baseUrl) config.baseUrl = 'http://localhost:3000';
    if (!config.checkIntervalMinutes) config.checkIntervalMinutes = 1;
    if (!config.notificationIntervalHours) config.notificationIntervalHours = 24;
    if (!config.fileDownloadTimeout) config.fileDownloadTimeout = 60000;
    if (!config.port) config.port = 3000;
    if (!config.smtp) {
      config.smtp = {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        ignoreTLS: true,
        auth: { user: '', pass: '' },
        from: 'noreply@example.com'
      };
    }
    if (!config.emailTemplates) {
      config.emailTemplates = {
        unavailable: {
          subject: '⚠️ Недоступны ссылки в теге {{tag.name}}',
          body: '<h2>Уважаемый пользователь!</h2><p>Обнаружены недоступные ссылки в теге <strong>{{tag.name}}</strong>:</p><ul>{{#each links}}<li><strong>{{this.name}}</strong> — <a href="{{this.url}}">{{this.url}}</a> (статус: {{this.status}})</li>{{/each}}</ul><p>Пожалуйста, проверьте доступность ресурсов.</p>'
        },
        backup: {
          subject: '📦 Резервная копия Redirect Manager за {{date}}',
          body: '<h2>Резервная копия</h2><p>Создана резервная копия конфигурации и данных за <strong>{{date}}</strong>.</p><p>Файлы приложены к письму.</p>'
        }
      };
    }
    saveConfig();
  } catch (e) {
    console.error('❌ Ошибка загрузки config.json, создаём новый', e);
    const saltRounds = 10;
    const defaultPassword = 'password';
    config = {
      users: {
        admin: {
          passwordHash: bcrypt.hashSync(defaultPassword, saltRounds),
          role: 'admin'
        }
      },
      port: 3000,
      baseUrl: 'http://localhost:3000',
      checkIntervalMinutes: 1,
      notificationIntervalHours: 24,
      fileDownloadTimeout: 60000,
      adminEmail: 'admin@example.com',
      backupIntervalHours: 24,
      backupRetentionDays: 7,
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        ignoreTLS: true,
        auth: { user: '', pass: '' },
        from: 'noreply@example.com'
      },
      emailTemplates: {
        unavailable: {
          subject: '⚠️ Недоступны ссылки в теге {{tag.name}}',
          body: '<h2>Уважаемый пользователь!</h2><p>Обнаружены недоступные ссылки в теге <strong>{{tag.name}}</strong>:</p><ul>{{#each links}}<li><strong>{{this.name}}</strong> — <a href="{{this.url}}">{{this.url}}</a> (статус: {{this.status}})</li>{{/each}}</ul><p>Пожалуйста, проверьте доступность ресурсов.</p>'
        },
        backup: {
          subject: '📦 Резервная копия Redirect Manager за {{date}}',
          body: '<h2>Резервная копия</h2><p>Создана резервная копия конфигурации и данных за <strong>{{date}}</strong>.</p><p>Файлы приложены к письму.</p>'
        }
      }
    };
    saveConfig();
    console.log('🔑 Создан новый config.json с пользователем admin (пароль: password)');
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

loadConfig();

// --- Загрузка данных (url.json) ---
let data;
const DATA_FILE = './url.json';

function loadData() {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    data.links.forEach(link => {
      if (link.available === undefined) link.available = true;
      if (!link.lastChecked) link.lastChecked = new Date().toISOString();
      if (link.isFile === undefined) link.isFile = false;
      if (!link.lastNotificationSent) link.lastNotificationSent = null;
    });
  } catch (e) {
    console.error('⚠️ Ошибка загрузки url.json, создаём начальные данные');
    data = { tags: [], links: [] };
    saveData();
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
loadData();

// --- Настройка Express ---
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: 'secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    if (typeof body === 'string' && !res.getHeader('Content-Type')) {
      if (req.path.endsWith('.html') || req.path.endsWith('.css') || req.path.endsWith('.js')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      } else if (req.path.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
    }
    return originalSend.call(this, body);
  };
  next();
});

app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// --- Папки ---
const REDIRECT_DIR = './redirects';
const UPLOAD_DIR = './uploads';
if (!fs.existsSync(REDIRECT_DIR)) fs.mkdirSync(REDIRECT_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// --- Multer для загрузки изображений ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const linkId = req.body.linkId || 'global';
    const uploadPath = path.join(UPLOAD_DIR, linkId);
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, basename + '-' + unique + ext);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// --- Функции для работы с пользователями ---
function getUserRole(login) {
  if (!login || !config.users) return USER_ROLES.GUEST;
  const user = config.users[login];
  return user ? user.role : USER_ROLES.GUEST;
}

function checkUserPassword(login, password) {
  if (!login || !config.users || !config.users[login]) return false;
  const user = config.users[login];
  return user.passwordHash && bcrypt.compareSync(password, user.passwordHash);
}

function getAllUsers() {
  if (!config.users) return {};
  return Object.keys(config.users).map(login => ({
    login: login,
    role: config.users[login].role
  }));
}

function saveUser(login, password, role) {
  const saltRounds = 10;
  const passwordHash = bcrypt.hashSync(password, saltRounds);
  if (!config.users) config.users = {};
  config.users[login] = { passwordHash, role };
  saveConfig();
}

function deleteUser(login) {
  if (login === 'admin') {
    throw new Error('Нельзя удалить администратора');
  }
  if (config.users && config.users[login]) {
    delete config.users[login];
    saveConfig();
  }
}

// --- Вспомогательные функции ---
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function getTagById(id) {
  return data.tags.find(t => t.id === id);
}

function getLinkById(id) {
  return data.links.find(l => l.id === id);
}

function transliterate(text) {
  const map = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
  };
  return text.split('').map(ch => map[ch] || ch).join('');
}

function sanitizeName(name) {
  let result = transliterate(name);
  result = result.replace(/[^a-zA-Z0-9_\-]/g, '_');
  result = result.replace(/_+/g, '_');
  result = result.replace(/^_+|_+$/g, '');
  if (!result) result = 'unnamed';
  return result;
}

// --- Работа с шаблоном заглушки ---
const DEFAULT_TEMPLATE_PATH = './default.html';

function getDefaultTemplate() {
  try {
    if (fs.existsSync(DEFAULT_TEMPLATE_PATH)) {
      const content = fs.readFileSync(DEFAULT_TEMPLATE_PATH, 'utf8');
      if (content.trim()) return content;
    }
    const defaultContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Ресурс временно недоступен</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f8f9fa; text-align: center; padding: 50px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #e74c3c; }
    p { font-size: 18px; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Запрашиваемый Вами ресурс временно не доступен</h1>
    <p>Служба поддержки уже решает проблему. Пожалуйста, попробуйте позже.</p>
    <p>Ссылка: {{link.url}}</p>
  </div>
</body>
</html>`;
    fs.writeFileSync(DEFAULT_TEMPLATE_PATH, defaultContent, 'utf8');
    return defaultContent;
  } catch (e) {
    console.error('Ошибка чтения/записи шаблона:', e);
    return '<h1>Ресурс временно недоступен</h1><p>Свяжитесь с администратором.</p>';
  }
}

function saveDefaultTemplate(content) {
  fs.writeFileSync(DEFAULT_TEMPLATE_PATH, content, 'utf8');
}

// --- Генерация файлов для ссылки ---
function getLinkFolder(link) {
  const tag = getTagById(link.tagId);
  if (!tag) throw new Error('Тег не найден');
  const folderName = sanitizeName(tag.name);
  const linkFolder = path.join(REDIRECT_DIR, folderName, link.id);
  if (!fs.existsSync(linkFolder)) {
    fs.mkdirSync(linkFolder, { recursive: true });
  }
  return linkFolder;
}

function generateRedirectFile(link) {
  const folder = getLinkFolder(link);
  const filePath = path.join(folder, 'redirect.html');
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=${link.url}">
  <title>Редирект на ${link.name}</title>
  <script>
    window.location.href = "${link.url}";
  <\/script>
</head>
<body>
  <p>Если вы не перенаправлены автоматически, <a href="${link.url}">нажмите здесь</a>.</p>
</body>
</html>`;
  fs.writeFileSync(filePath, html, 'utf8');
  return filePath;
}

function generateStubFile(link, templateContent = null) {
  const folder = getLinkFolder(link);
  const filePath = path.join(folder, 'index.html');
  let template = templateContent || getDefaultTemplate();
  template = template.replace(/\{\{link\.name\}\}/g, link.name);
  template = template.replace(/\{\{link\.url\}\}/g, link.url);
  fs.writeFileSync(filePath, template, 'utf8');
  return filePath;
}

function getStubContent(link) {
  const folder = getLinkFolder(link);
  const filePath = path.join(folder, 'index.html');
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  } else {
    return generateStubFile(link);
  }
}

function saveStubContent(link, content) {
  const folder = getLinkFolder(link);
  const filePath = path.join(folder, 'index.html');
  fs.writeFileSync(filePath, content, 'utf8');
}

function deleteLinkFolder(link) {
  const folder = getLinkFolder(link);
  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

// --- Функции для работы с файлами ---
async function downloadFile(link, metadata) {
  const folder = getLinkFolder(link);
  const originalFileName = path.basename(new URL(link.url).pathname) || 'file';
  const filePath = path.join(folder, originalFileName);
  const metadataPath = path.join(folder, 'metadata.json');

  const headers = {};
  if (metadata && metadata.lastModified) {
    headers['If-Modified-Since'] = metadata.lastModified;
  }
  if (metadata && metadata.etag) {
    headers['If-None-Match'] = metadata.etag;
  }

  try {
    const timeoutMs = config.fileDownloadTimeout || 60000;
    const response = await fetch(link.url, {
      method: 'GET',
      headers: headers,
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (response.status === 304) {
      console.log(`Файл ${link.name} не изменился (304)`);
      return { status: 'not_modified' };
    }

    if (!response.ok) {
      console.log(`Ошибка скачивания ${link.name}: ${response.status}`);
      return { status: 'error', statusCode: response.status };
    }

    const contentLength = response.headers.get('content-length');
    const lastModified = response.headers.get('last-modified');
    const etag = response.headers.get('etag');

    const fileStream = fs.createWriteStream(filePath);
    await pipeline(response.body, fileStream);

    const newMetadata = {
      originalFileName: originalFileName,
      size: contentLength ? parseInt(contentLength) : (fs.statSync(filePath).size),
      lastModified: lastModified || new Date().toUTCString(),
      etag: etag || null,
      downloadedAt: new Date().toISOString()
    };
    fs.writeFileSync(metadataPath, JSON.stringify(newMetadata, null, 2));
    console.log(`Файл ${link.name} скачан успешно`);
    return { status: 'downloaded', metadata: newMetadata };
  } catch (err) {
    console.error('Ошибка скачивания файла:', err);
    return { status: 'error', error: err.message };
  }
}

// --- Отправка email ---
async function sendEmail(to, subject, text) {
  if (!config.smtp || !config.smtp.auth || !config.smtp.auth.user) {
    console.log(`[EMAIL] To: ${to}, Subject: ${subject}, Text: ${text}`);
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      ...config.smtp,
      tls: { rejectUnauthorized: !config.smtp.ignoreTLS }
    });
    await transporter.sendMail({
      from: config.smtp.from || 'noreply@example.com',
      to,
      subject,
      text
    });
    console.log(`✅ Email отправлен на ${to}`);
  } catch (e) {
    console.error('❌ Ошибка отправки email:', e);
    throw e;
  }
}

async function sendEmailWithAttachment(to, subject, body, attachmentPath, filename) {
  if (!config.smtp || !config.smtp.auth || !config.smtp.auth.user) {
    console.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      ...config.smtp,
      tls: { rejectUnauthorized: !config.smtp.ignoreTLS }
    });
    await transporter.sendMail({
      from: config.smtp.from || 'noreply@example.com',
      to,
      subject,
      html: body,
      attachments: [{
        filename: filename,
        path: attachmentPath
      }]
    });
    console.log(`✅ Бэкап отправлен на ${to}`);
  } catch (e) {
    console.error('Ошибка отправки бэкапа:', e);
  }
}

// --- Отправка группового уведомления о недоступных ссылках ---
async function sendUnavailableNotification(tag, unavailableLinks) {
  if (!tag || !tag.email) return;
  
  const template = config.emailTemplates.unavailable;
  const subject = template.subject.replace('{{tag.name}}', tag.name);
  
  let linksHtml = '';
  for (const link of unavailableLinks) {
    const status = link.lastStatus || 'неизвестно';
    linksHtml += `<li><strong>${link.name}</strong> — <a href="${link.url}">${link.url}</a> (статус: ${status})</li>`;
  }
  
  let body = template.body.replace('{{#each links}}', '').replace('{{/each}}', '');
  body = body.replace('{{#each links}}', linksHtml);
  
  const recipients = [tag.email];
  if (config.adminEmail && config.adminEmail !== tag.email) {
    recipients.push(config.adminEmail);
  }
  
  for (const recipient of recipients) {
    try {
      await sendEmail(recipient, subject, body);
    } catch (e) {
      console.error(`Ошибка отправки уведомления на ${recipient}:`, e);
    }
  }
}

// --- Резервное копирование ---
async function createBackup() {
  const backupDir = './backups';
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(backupDir, date);
  
  try {
    fs.mkdirSync(backupPath, { recursive: true });
    
    fs.copyFileSync(CONFIG_FILE, path.join(backupPath, 'config.json'));
    fs.copyFileSync(DATA_FILE, path.join(backupPath, 'url.json'));
    if (fs.existsSync(DEFAULT_TEMPLATE_PATH)) {
      fs.copyFileSync(DEFAULT_TEMPLATE_PATH, path.join(backupPath, 'default.html'));
    }
    
    console.log(`✅ Создан бэкап: ${backupPath}`);
    
    if (config.adminEmail && config.smtp && config.smtp.auth && config.smtp.auth.user) {
      await sendBackupEmail(backupPath);
    }
    
    await cleanupOldBackups();
  } catch (e) {
    console.error('Ошибка создания бэкапа:', e);
  }
}

async function sendBackupEmail(backupPath) {
  try {
    const template = config.emailTemplates.backup;
    const date = new Date().toLocaleString('ru-RU');
    const subject = template.subject.replace('{{date}}', date);
    const body = template.body.replace('{{date}}', date);
    
    const zipPath = backupPath + '.zip';
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        try {
          await sendEmailWithAttachment(
            config.adminEmail,
            subject,
            body,
            zipPath,
            `backup-${date}.zip`
          );
          fs.unlinkSync(zipPath);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(backupPath, false);
      archive.finalize();
    });
  } catch (e) {
    console.error('Ошибка отправки бэкапа по почте:', e);
  }
}

async function cleanupOldBackups() {
  const backupDir = './backups';
  if (!fs.existsSync(backupDir)) return;
  
  const files = fs.readdirSync(backupDir);
  const now = Date.now();
  const retentionMs = config.backupRetentionDays * 24 * 60 * 60 * 1000;
  
  for (const file of files) {
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtimeMs;
    
    if (age > retentionMs) {
      fs.rmSync(filePath, { recursive: true, force: true });
      console.log(`🗑️ Удалён старый бэкап: ${file}`);
    }
  }
}

// --- Проверка доступности ---
async function checkLinkAvailability(link) {
  if (link.isFile) {
    const folder = getLinkFolder(link);
    const metadataPath = path.join(folder, 'metadata.json');
    let metadata = null;
    if (fs.existsSync(metadataPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } catch (e) {}
    }
    const result = await downloadFile(link, metadata);
    if (result.status === 'downloaded' || result.status === 'not_modified') {
      link.available = true;
    } else {
      const folder = getLinkFolder(link);
      const originalFileName = path.basename(new URL(link.url).pathname) || 'file';
      const filePath = path.join(folder, originalFileName);
      if (fs.existsSync(filePath)) {
        link.available = true;
      } else {
        link.available = false;
      }
    }
    link.lastChecked = new Date().toISOString();
    return { ok: link.available, status: result.statusCode || (link.available ? 200 : 404) };
  } else {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(link.url, {
        method: 'HEAD',
        signal: controller.signal
      });
      clearTimeout(timeout);
      return { ok: response.ok, status: response.status };
    } catch (err) {
      return { ok: false, status: 0, error: err.message };
    }
  }
}

// --- Проверка всех ссылок ---
async function checkAllLinks() {
  console.log('Запущена периодическая проверка ссылок...');
  const results = [];
  const tagUnavailable = {};
  
  for (const link of data.links) {
    const status = await checkLinkAvailability(link);
    const wasAvailable = link.available;
    link.available = status.ok;
    link.lastChecked = new Date().toISOString();
    link.lastStatus = status.status || 'unknown';

    if (!link.isFile) {
      generateRedirectFile(link);
    }

    if (!link.available && status.status >= 400) {
      if (!tagUnavailable[link.tagId]) {
        tagUnavailable[link.tagId] = [];
      }
      tagUnavailable[link.tagId].push(link);
    }

    results.push({ linkId: link.id, available: link.available, status: status.status });
  }

  for (const [tagId, links] of Object.entries(tagUnavailable)) {
    const tag = getTagById(tagId);
    if (tag && tag.email) {
      await sendUnavailableNotification(tag, links);
    }
  }

  saveData();
  return results;
}

// --- API маршруты ---

// Авторизация
app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  console.log(`Попытка входа: login=${login}`);
  
  if (!login || !password) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  
  if (checkUserPassword(login, password)) {
    const role = getUserRole(login);
    req.session.user = { login, role };
    console.log(`✅ Вход успешен: ${login} (${role})`);
    return res.json({ success: true, role });
  }
  
  console.log(`❌ Неверный логин или пароль: ${login}`);
  res.status(401).json({ error: 'Неверный логин или пароль' });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({
      authenticated: true,
      login: req.session.user.login,
      role: req.session.user.role || getUserRole(req.session.user.login)
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// --- Смена пароля (только для текущего пользователя) ---
app.post('/api/change-password', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { currentPassword, newPassword } = req.body;
  const login = req.session.user.login;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Необходимо ввести текущий и новый пароль' });
  }
  if (!config.users || !config.users[login]) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }
  if (!bcrypt.compareSync(currentPassword, config.users[login].passwordHash)) {
    return res.status(400).json({ error: 'Неверный текущий пароль' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Новый пароль должен быть не менее 4 символов' });
  }
  
  const saltRounds = 10;
  config.users[login].passwordHash = bcrypt.hashSync(newPassword, saltRounds);
  saveConfig();
  res.json({ success: true });
});

// --- Управление пользователями (только админ) ---
app.get('/api/users', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  res.json(getAllUsers());
});

app.post('/api/users', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  
  const { login, password, userRole } = req.body;
  if (!login || !password || !userRole) {
    return res.status(400).json({ error: 'Необходимо указать логин, пароль и роль' });
  }
  if (login.length < 3) {
    return res.status(400).json({ error: 'Логин должен быть не менее 3 символов' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
  }
  if (!Object.values(USER_ROLES).includes(userRole)) {
    return res.status(400).json({ error: 'Некорректная роль' });
  }
  if (config.users && config.users[login]) {
    return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
  }
  
  saveUser(login, password, userRole);
  res.json({ success: true, login, role: userRole });
});

app.put('/api/users/:login', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  
  const { login } = req.params;
  const { password, userRole } = req.body;
  
  if (!config.users || !config.users[login]) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  if (login === 'admin' && userRole && userRole !== 'admin') {
    return res.status(400).json({ error: 'Нельзя изменить роль администратора' });
  }
  
  if (password) {
    if (password.length < 4) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
    }
    const saltRounds = 10;
    config.users[login].passwordHash = bcrypt.hashSync(password, saltRounds);
  }
  if (userRole) {
    if (!Object.values(USER_ROLES).includes(userRole)) {
      return res.status(400).json({ error: 'Некорректная роль' });
    }
    config.users[login].role = userRole;
  }
  saveConfig();
  res.json({ success: true });
});

app.delete('/api/users/:login', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  
  const { login } = req.params;
  if (login === 'admin') {
    return res.status(400).json({ error: 'Нельзя удалить администратора' });
  }
  if (!config.users || !config.users[login]) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  delete config.users[login];
  saveConfig();
  res.json({ success: true });
});

// --- Теги (CRUD) с проверкой ролей ---
app.get('/api/tags', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(data.tags);
});

app.post('/api/tags', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role === USER_ROLES.GUEST) {
    return res.status(403).json({ error: 'Доступ запрещён. Недостаточно прав' });
  }
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Необходимо имя и email' });
  if (data.tags.some(t => t.name === name)) {
    return res.status(400).json({ error: 'Тег с таким именем уже существует' });
  }
  const newTag = { id: generateId(), name, email };
  data.tags.push(newTag);
  saveData();
  res.json(newTag);
});

app.put('/api/tags/:id', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role === USER_ROLES.GUEST) {
    return res.status(403).json({ error: 'Доступ запрещён. Недостаточно прав' });
  }
  const { id } = req.params;
  const { name, email } = req.body;
  const tag = getTagById(id);
  if (!tag) return res.status(404).json({ error: 'Тег не найден' });
  if (data.tags.some(t => t.name === name && t.id !== id)) {
    return res.status(400).json({ error: 'Тег с таким именем уже существует' });
  }
  const oldName = tag.name;
  tag.name = name;
  tag.email = email;
  saveData();
  const oldFolder = path.join(REDIRECT_DIR, sanitizeName(oldName));
  const newFolder = path.join(REDIRECT_DIR, sanitizeName(name));
  if (fs.existsSync(oldFolder) && oldFolder !== newFolder) {
    fs.renameSync(oldFolder, newFolder);
  }
  res.json(tag);
});

app.delete('/api/tags/:id', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  const { id } = req.params;
  const tag = getTagById(id);
  if (!tag) return res.status(404).json({ error: 'Тег не найден' });
  const linksToDelete = data.links.filter(l => l.tagId === id);
  for (const link of linksToDelete) deleteLinkFolder(link);
  data.links = data.links.filter(l => l.tagId !== id);
  data.tags = data.tags.filter(t => t.id !== id);
  saveData();
  const folder = path.join(REDIRECT_DIR, sanitizeName(tag.name));
  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
  res.json({ success: true });
});

// --- Ссылки (CRUD) с проверкой ролей ---
app.get('/api/links', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { tagId } = req.query;
  let links = data.links;
  if (tagId) links = links.filter(l => l.tagId === tagId);
  res.json(links);
});

app.post('/api/links', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role === USER_ROLES.GUEST) {
    return res.status(403).json({ error: 'Доступ запрещён. Недостаточно прав' });
  }
  const { name, url, tagId, isFile } = req.body;
  if (!name || !url || !tagId) return res.status(400).json({ error: 'Необходимо имя, URL и тег' });
  const tag = getTagById(tagId);
  if (!tag) return res.status(400).json({ error: 'Тег не найден' });
  if (data.links.some(l => l.name === name && l.tagId === tagId)) {
    return res.status(400).json({ error: 'Ссылка с таким именем уже существует в этом теге' });
  }
  const newLink = {
    id: generateId(),
    name,
    url,
    tagId,
    isFile: isFile || false,
    available: true,
    lastChecked: new Date().toISOString(),
    lastNotificationSent: null
  };
  data.links.push(newLink);
  saveData();
  try {
    if (!newLink.isFile) {
      generateRedirectFile(newLink);
    }
    generateStubFile(newLink);
    if (newLink.isFile) {
      setImmediate(async () => {
        const status = await checkLinkAvailability(newLink);
        newLink.available = status.ok;
        newLink.lastChecked = new Date().toISOString();
        saveData();
        console.log(`Фоновая проверка для ${newLink.name}: доступен=${status.ok}`);
      });
    }
  } catch (e) {
    data.links = data.links.filter(l => l.id !== newLink.id);
    saveData();
    return res.status(500).json({ error: 'Не удалось создать файлы' });
  }
  res.json(newLink);
});

app.put('/api/links/:id', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role === USER_ROLES.GUEST) {
    return res.status(403).json({ error: 'Доступ запрещён. Недостаточно прав' });
  }
  const { id } = req.params;
  const { name, url, tagId, isFile } = req.body;
  const link = getLinkById(id);
  if (!link) return res.status(404).json({ error: 'Ссылка не найдена' });
  if (data.links.some(l => l.name === name && l.tagId === tagId && l.id !== id)) {
    return res.status(400).json({ error: 'Ссылка с таким именем уже существует в этом теге' });
  }
  const oldTagId = link.tagId;
  const oldName = link.name;
  link.name = name;
  link.url = url;
  link.tagId = tagId;
  link.isFile = isFile || false;
  link.available = true;
  link.lastChecked = new Date().toISOString();
  link.lastNotificationSent = null;
  saveData();
  if (oldTagId !== tagId || oldName !== name) {
    const oldTag = getTagById(oldTagId);
    if (oldTag) {
      const oldFolder = path.join(REDIRECT_DIR, sanitizeName(oldTag.name), link.id);
      if (fs.existsSync(oldFolder)) {
        const newTag = getTagById(tagId);
        if (newTag) {
          const newFolder = path.join(REDIRECT_DIR, sanitizeName(newTag.name), link.id);
          if (!fs.existsSync(path.dirname(newFolder))) {
            fs.mkdirSync(path.dirname(newFolder), { recursive: true });
          }
          fs.renameSync(oldFolder, newFolder);
        }
      }
    }
  }
  if (!link.isFile) {
    generateRedirectFile(link);
  }
  generateStubFile(link);
  res.json(link);
});

app.delete('/api/links/:id', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role === USER_ROLES.GUEST) {
    return res.status(403).json({ error: 'Доступ запрещён. Недостаточно прав' });
  }
  const { id } = req.params;
  const link = getLinkById(id);
  if (!link) return res.status(404).json({ error: 'Ссылка не найдена' });
  deleteLinkFolder(link);
  data.links = data.links.filter(l => l.id !== id);
  saveData();
  res.json({ success: true });
});

// --- Проверка ссылок ---
app.get('/api/links/:id/check', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  const link = getLinkById(id);
  if (!link) return res.status(404).json({ error: 'Ссылка не найдена' });
  const status = await checkLinkAvailability(link);
  const wasAvailable = link.available;
  link.available = status.ok;
  link.lastChecked = new Date().toISOString();
  link.lastStatus = status.status || 'unknown';
  saveData();

  if (!link.isFile) {
    generateRedirectFile(link);
  }

  if (!link.available) {
    const tag = getTagById(link.tagId);
    if (tag && tag.email) {
      await sendUnavailableNotification(tag, [link]);
    }
  }

  res.json({ ...status, linkId: id, available: link.available });
});

app.get('/api/links/check-all', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const results = await checkAllLinks();
  res.json(results);
});

// --- Заглушка (получение и сохранение) ---
app.get('/api/links/:id/stub', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  const link = getLinkById(id);
  if (!link) return res.status(404).json({ error: 'Ссылка не найдена' });
  try {
    const content = getStubContent(link);
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка чтения заглушки' });
  }
});

app.put('/api/links/:id/stub', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role === USER_ROLES.GUEST) {
    return res.status(403).json({ error: 'Доступ запрещён. Недостаточно прав' });
  }
  const { id } = req.params;
  const { content } = req.body;
  const link = getLinkById(id);
  if (!link) return res.status(404).json({ error: 'Ссылка не найдена' });
  try {
    saveStubContent(link, content);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сохранения заглушки' });
  }
});

// --- Глобальный шаблон ---
app.get('/api/default-template', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const content = getDefaultTemplate();
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка чтения шаблона' });
  }
});

app.put('/api/default-template', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  const { content } = req.body;
  if (content === undefined) {
    return res.status(400).json({ error: 'Не передан контент' });
  }
  try {
    saveDefaultTemplate(content);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сохранения шаблона' });
  }
});

// --- Email-шаблоны ---
app.get('/api/email-templates', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  res.json(config.emailTemplates);
});

app.put('/api/email-templates', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  const { unavailable, backup } = req.body;
  if (unavailable) {
    if (unavailable.subject) config.emailTemplates.unavailable.subject = unavailable.subject;
    if (unavailable.body) config.emailTemplates.unavailable.body = unavailable.body;
  }
  if (backup) {
    if (backup.subject) config.emailTemplates.backup.subject = backup.subject;
    if (backup.body) config.emailTemplates.backup.body = backup.body;
  }
  saveConfig();
  res.json({ success: true });
});

// --- Ручной бэкап ---
app.post('/api/backup', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  try {
    await createBackup();
    res.json({ success: true, message: 'Бэкап создан' });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка создания бэкапа: ' + e.message });
  }
});

// --- Получение и сохранение конфигурации ---
app.get('/api/config', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  const safeConfig = {
    baseUrl: config.baseUrl,
    checkIntervalMinutes: config.checkIntervalMinutes,
    notificationIntervalHours: config.notificationIntervalHours,
    adminEmail: config.adminEmail,
    backupIntervalHours: config.backupIntervalHours,
    backupRetentionDays: config.backupRetentionDays,
    smtp: config.smtp || { host: '', port: 587, secure: false, ignoreTLS: true, auth: { user: '', pass: '' }, from: '' }
  };
  res.json(safeConfig);
});

app.put('/api/config', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  const { baseUrl, checkIntervalMinutes, notificationIntervalHours, adminEmail, backupIntervalHours, backupRetentionDays, smtp } = req.body;
  if (baseUrl !== undefined) config.baseUrl = baseUrl;
  if (checkIntervalMinutes !== undefined) config.checkIntervalMinutes = checkIntervalMinutes;
  if (notificationIntervalHours !== undefined) config.notificationIntervalHours = notificationIntervalHours;
  if (adminEmail !== undefined) config.adminEmail = adminEmail;
  if (backupIntervalHours !== undefined) config.backupIntervalHours = backupIntervalHours;
  if (backupRetentionDays !== undefined) config.backupRetentionDays = backupRetentionDays;
  if (smtp !== undefined) {
    config.smtp = {
      host: smtp.host || config.smtp?.host || '',
      port: smtp.port || config.smtp?.port || 587,
      secure: smtp.secure !== undefined ? smtp.secure : (config.smtp?.secure || false),
      ignoreTLS: smtp.ignoreTLS !== undefined ? smtp.ignoreTLS : (config.smtp?.ignoreTLS || true),
      auth: {
        user: smtp.auth?.user || config.smtp?.auth?.user || '',
        pass: smtp.auth?.pass || config.smtp?.auth?.pass || ''
      },
      from: smtp.from || config.smtp?.from || ''
    };
  }
  saveConfig();
  res.json({ success: true });
});

// --- Тестовое письмо ---
app.post('/api/test-email', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const role = getUserRole(req.session.user.login);
  if (role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ error: 'Доступ запрещён. Только администратор' });
  }
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Не указан получатель' });
  try {
    await sendEmail(to, 'Тестовое письмо от Redirect Manager', 'Это тестовое письмо для проверки SMTP-настроек.');
    res.json({ success: true, message: 'Письмо успешно отправлено на ' + to });
  } catch (e) {
    console.error('Ошибка отправки тестового письма:', e);
    res.status(500).json({ success: false, message: 'Ошибка отправки: ' + e.message, details: e.stack || e.toString() });
  }
});

// --- Загрузка изображений ---
app.post('/api/upload-image', upload.single('file'), (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не передан' });
  }
  const linkId = req.body.linkId || 'global';
  const fileUrl = `/uploads/${linkId}/${req.file.filename}`;
  res.json({ location: fileUrl });
});

app.use('/uploads', express.static(UPLOAD_DIR));

// --- Редирект ---
app.get('/redirect/:linkId', (req, res) => {
  const { linkId } = req.params;
  const link = getLinkById(linkId);
  if (!link) {
    return res.status(404).send('Ссылка не найдена');
  }

  if (link.isFile) {
    const folder = getLinkFolder(link);
    const originalFileName = path.basename(new URL(link.url).pathname) || 'file';
    const filePath = path.join(folder, originalFileName);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      res.setHeader('Content-Length', stat.size);
      const ext = path.extname(originalFileName).toLowerCase();
      const mimeTypes = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.txt': 'text/plain',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${originalFileName}"`);
      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
      return;
    }
  }

  const folder = getLinkFolder(link);
  let filePath;
  if (link.available) {
    filePath = path.join(folder, 'redirect.html');
  } else {
    filePath = path.join(folder, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    if (link.available) {
      generateRedirectFile(link);
    } else {
      generateStubFile(link);
    }
  }
  if (!fs.existsSync(filePath)) {
    return res.status(500).send('Ошибка генерации файла');
  }
  res.sendFile(path.resolve(filePath));
});

// --- Запуск периодической проверки и бэкапа ---
const checkInterval = (config.checkIntervalMinutes || 60) * 60 * 1000;
setInterval(async () => {
  await checkAllLinks();
}, checkInterval);

const backupInterval = (config.backupIntervalHours || 24) * 60 * 60 * 1000;
setInterval(async () => {
  console.log('📦 Запуск автоматического бэкапа...');
  await createBackup();
}, backupInterval);

(async function initCheck() {
  console.log('Первоначальная проверка ссылок...');
  await checkAllLinks();
})();

setTimeout(async () => {
  console.log('📦 Создание начального бэкапа...');
  await createBackup();
}, 5000);

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔑 Пользователи: ${Object.keys(config.users).join(', ')}`);
});