const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { pipeline } = require('stream/promises');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Загрузка конфига ---
let config;
const CONFIG_FILE = './config.json';

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = JSON.parse(raw);
    if (config.password) {
      const saltRounds = 10;
      config.passwordHash = bcrypt.hashSync(config.password, saltRounds);
      delete config.password;
      saveConfig();
      console.log('✅ Пароль обновлён (хеширован)');
    }
    if (!config.passwordHash) {
      const saltRounds = 10;
      const defaultPassword = 'password';
      config.passwordHash = bcrypt.hashSync(defaultPassword, saltRounds);
      config.login = config.login || 'admin';
      config.port = config.port || 3000;
      config.baseUrl = config.baseUrl || 'http://localhost:3000';
      config.checkIntervalMinutes = config.checkIntervalMinutes || 1;
      config.notificationIntervalHours = config.notificationIntervalHours || 24;
      config.fileDownloadTimeout = config.fileDownloadTimeout || 60000;
      config.smtp = config.smtp || { host: '', port: 587, secure: false, auth: { user: '', pass: '' }, from: '' };
      saveConfig();
      console.log('🔑 Создан новый конфиг с паролем по умолчанию: password');
    }
    if (config.notificationIntervalHours === undefined) config.notificationIntervalHours = 24;
    if (config.fileDownloadTimeout === undefined) config.fileDownloadTimeout = 60000;
    if (config.smtp && config.smtp.ignoreTLS === undefined) config.smtp.ignoreTLS = true;
  } catch (e) {
    console.error('❌ Ошибка загрузки config.json, создаём новый', e);
    const saltRounds = 10;
    const defaultPassword = 'password';
    config = {
      login: 'admin',
      passwordHash: bcrypt.hashSync(defaultPassword, saltRounds),
      port: 3000,
      baseUrl: 'http://localhost:3000',
      checkIntervalMinutes: 1,
      notificationIntervalHours: 24,
      fileDownloadTimeout: 60000,
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        ignoreTLS: true,
        auth: { user: '', pass: '' },
        from: 'noreply@example.com'
      }
    };
    saveConfig();
    console.log('🔑 Создан новый config.json с паролем: password');
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
      tls: {
        rejectUnauthorized: !(config.smtp?.ignoreTLS || false) // если ignoreTLS = true, отключаем проверку
      }
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
    throw e; // пробрасываем, чтобы вызывающий код знал об ошибке
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

async function checkAllLinks() {
  console.log('Запущена периодическая проверка ссылок...');
  const results = [];
  for (const link of data.links) {
    const status = await checkLinkAvailability(link);
    const wasAvailable = link.available;
    link.available = status.ok;
    link.lastChecked = new Date().toISOString();

    if (!link.isFile) {
      generateRedirectFile(link);
    }

    if (!link.available) {
      const tag = getTagById(link.tagId);
      if (tag && tag.email) {
        const shouldSend = (() => {
          if (wasAvailable) return true;
          if (link.lastNotificationSent) {
            const lastSent = new Date(link.lastNotificationSent);
            const now = new Date();
            const hoursDiff = (now - lastSent) / (1000 * 60 * 60);
            return hoursDiff >= config.notificationIntervalHours;
          }
          return true;
        })();
        if (shouldSend && status.status >= 400) {
          const subject = wasAvailable
            ? `Ссылка "${link.name}" стала недоступна (${status.status})`
            : `Ссылка "${link.name}" всё ещё недоступна (повторное уведомление)`;
          const text = `Ссылка: ${link.url}\nСтатус: ${status.status}\nОшибка: ${status.error || ''}`;
          await sendEmail(tag.email, subject, text);
          link.lastNotificationSent = new Date().toISOString();
        }
      }
    } else {
      if (!wasAvailable) {
        link.lastNotificationSent = null;
      }
    }

    results.push({ linkId: link.id, available: link.available, status: status.status });
  }
  saveData();
  return results;
}

// --- API маршруты ---

// Авторизация
app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  console.log(`Попытка входа: login=${login}`);
  if (login === config.login) {
    if (config.passwordHash && bcrypt.compareSync(password, config.passwordHash)) {
      req.session.user = { login };
      console.log('✅ Вход успешен');
      return res.json({ success: true });
    } else {
      console.log('❌ Неверный пароль');
    }
  } else {
    console.log('❌ Неверный логин');
  }
  res.status(401).json({ error: 'Неверный логин или пароль' });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// --- Смена пароля ---
app.post('/api/change-password', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Необходимо ввести текущий и новый пароль' });
  }
  if (!config.passwordHash || !bcrypt.compareSync(currentPassword, config.passwordHash)) {
    return res.status(400).json({ error: 'Неверный текущий пароль' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Новый пароль должен быть не менее 4 символов' });
  }
  const saltRounds = 10;
  config.passwordHash = bcrypt.hashSync(newPassword, saltRounds);
  if (config.password) delete config.password;
  saveConfig();
  res.json({ success: true });
});

// --- Получение и сохранение конфигурации ---
app.get('/api/config', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const safeConfig = {
    login: config.login,
    port: config.port,
    baseUrl: config.baseUrl,
    checkIntervalMinutes: config.checkIntervalMinutes,
    notificationIntervalHours: config.notificationIntervalHours,
    smtp: {
        host: config.smtp?.host || '',
        port: config.smtp?.port || 587,
        secure: config.smtp?.secure || false,
        ignoreTLS: config.smtp?.ignoreTLS || true,
        auth: {
          user: config.smtp?.auth?.user || '',
          pass: config.smtp?.auth?.pass || ''
        },
    from: config.smtp?.from || ''
        }
    };
  res.json(safeConfig);
});

app.put('/api/config', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { baseUrl, checkIntervalMinutes, notificationIntervalHours, smtp } = req.body;
  if (baseUrl !== undefined) config.baseUrl = baseUrl;
  if (checkIntervalMinutes !== undefined) config.checkIntervalMinutes = checkIntervalMinutes;
  if (notificationIntervalHours !== undefined) config.notificationIntervalHours = notificationIntervalHours;
  if (smtp !== undefined) {
    config.smtp = {
      host: smtp.host || config.smtp?.host || '',
      port: smtp.port || config.smtp?.port || 587,
      secure: smtp.secure !== undefined ? smtp.secure : (config.smtp?.secure || false),
      ignoreTLS: smtp.ignoreTLS !== undefined ? smtp.ignoreTLS : (config.smtp?.ignoreTLS || false),
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
// --- Тестовое письмо с отладочной информацией ---
app.post('/api/test-email', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Не указан получатель' });
  try {
    await sendEmail(to, 'Тестовое письмо от Redirect Manager', 'Это тестовое письмо для проверки SMTP-настроек.');
    res.json({
      success: true,
      message: 'Письмо успешно отправлено на ' + to,
      details: null
    });
  } catch (e) {
    console.error('Ошибка отправки тестового письма:', e);
    res.status(500).json({
      success: false,
      message: 'Ошибка отправки: ' + e.message,
      details: e.stack || e.toString()
    });
  }
});

// --- Теги (CRUD) ---
app.get('/api/tags', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(data.tags);
});

app.post('/api/tags', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
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

// --- Ссылки (CRUD) ---
app.get('/api/links', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const { tagId } = req.query;
  let links = data.links;
  if (tagId) links = links.filter(l => l.tagId === tagId);
  res.json(links);
});

app.post('/api/links', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
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
  saveData();

  if (!link.isFile) {
    generateRedirectFile(link);
  }

  if (!link.available) {
    const tag = getTagById(link.tagId);
    if (tag && tag.email) {
      const shouldSend = (() => {
        if (wasAvailable) return true;
        if (link.lastNotificationSent) {
          const lastSent = new Date(link.lastNotificationSent);
          const now = new Date();
          const hoursDiff = (now - lastSent) / (1000 * 60 * 60);
          return hoursDiff >= config.notificationIntervalHours;
        }
        return true;
      })();
      if (shouldSend && status.status >= 400) {
        const subject = wasAvailable
          ? `Ссылка "${link.name}" стала недоступна (${status.status})`
          : `Ссылка "${link.name}" всё ещё недоступна (повторное уведомление)`;
        const text = `Ссылка: ${link.url}\nСтатус: ${status.status}\nОшибка: ${status.error || ''}`;
        await sendEmail(tag.email, subject, text);
        link.lastNotificationSent = new Date().toISOString();
        saveData();
      }
    }
  } else {
    if (!wasAvailable) {
      link.lastNotificationSent = null;
      saveData();
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

// --- Запуск периодической проверки ---
const checkInterval = (config.checkIntervalMinutes || 60) * 60 * 1000;
setInterval(async () => {
  await checkAllLinks();
}, checkInterval);

(async function initCheck() {
  console.log('Первоначальная проверка ссылок...');
  await checkAllLinks();
})();

app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`🔑 Логин: ${config.login}, пароль: ${config.password ? config.password : 'хеширован (установлен)'}`);
