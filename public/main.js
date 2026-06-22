(function() {
  'use strict';

  // --- DOM ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Авторизация
  const loginForm = $('#loginForm');
  const dashboard = $('#dashboard');
  const loginInput = $('#loginInput');
  const passwordInput = $('#passwordInput');
  const loginBtn = $('#loginBtn');
  const loginError = $('#loginError');
  const logoutBtn = $('#logoutBtn');

  // Теги и ссылки
  const tagList = $('#tagList');
  const linkList = $('#linkList');
  const currentTagTitle = $('#currentTagTitle');
  const noLinksMessage = $('#noLinksMessage');
  const addTagBtn = $('#addTagBtn');
  const addLinkBtn = $('#addLinkBtn');
  const checkAllBtn = $('#checkAllBtn');
  const exportDataBtn = $('#exportDataBtn');
  const importDataBtn = $('#importDataBtn');
  const importFile = $('#importFile');

  // Модалки
  const tagModal = $('#tagModal');
  const tagModalTitle = $('#tagModalTitle');
  const tagNameInput = $('#tagNameInput');
  const tagEmailInput = $('#tagEmailInput');
  const tagEditId = $('#tagEditId');
  const saveTagBtn = $('#saveTagBtn');

  const linkModal = $('#linkModal');
  const linkModalTitle = $('#linkModalTitle');
  const linkNameInput = $('#linkNameInput');
  const linkUrlInput = $('#linkUrlInput');
  const linkTagSelect = $('#linkTagSelect');
  const linkEditId = $('#linkEditId');
  const linkIsFile = $('#linkIsFile');
  const saveLinkBtn = $('#saveLinkBtn');

//  const qrModal = $('#qrModal');
//  const qrContainer = $('#qrcode');
const qrModal = $('#qrModal');
const qrCodeContainer = $('#qrCodeContainer');   // новый контейнер
const redirectUrlDisplay = $('#redirectUrlDisplay');
//  const redirectUrlDisplay = $('#redirectUrlDisplay');
//  const downloadQrBtn = $('#downloadQrBtn');
//  const downloadHtmlBtn = $('#downloadHtmlBtn');
const progressContainer = $('#progressContainer');
const progressBar = $('#progressBar');
const progressText = $('#progressText');

  const testResultModal = $('#testResultModal');
  const testResultContent = $('#testResultContent');

  const helpBtn = $('#helpBtn');

  // Глобальный шаблон (Jodit)
  const editTemplateBtn = $('#editTemplateBtn');
  const templateModal = $('#templateModal');
  const templateEditor = $('#templateEditor');
  const saveTemplateBtn = $('#saveTemplateBtn');

  // Редактор заглушки ссылки (Jodit)
  const stubModal = $('#stubModal');
  const stubModalTitle = $('#stubModalTitle');
  const stubEditor = $('#stubEditor');
  const saveStubBtn = $('#saveStubBtn');

  // Смена пароля (текущего пользователя)
  const changePasswordBtn = $('#changePasswordBtn');
  const passwordModal = $('#passwordModal');
  const currentPasswordInput = $('#currentPasswordInput');
  const newPasswordInput = $('#newPasswordInput');
  const newPasswordConfirmInput = $('#newPasswordConfirmInput');
  const saveCurrentPasswordBtn = $('#saveCurrentPasswordBtn');
  const passwordError = $('#passwordError');

  // Смена пароля пользователя (администратором)
  const saveUserPasswordBtn = $('#saveUserPasswordBtn');

  // Настройки
  const settingsBtn = $('#settingsBtn');
  const settingsModal = $('#settingsModal');
  const settingsBaseUrl = $('#settingsBaseUrl');
  const settingsCheckInterval = $('#settingsCheckInterval');
  const settingsNotificationInterval = $('#settingsNotificationInterval');
  const settingsSmtpHost = $('#settingsSmtpHost');
  const settingsSmtpPort = $('#settingsSmtpPort');
  const settingsSmtpSecure = $('#settingsSmtpSecure');
  const settingsSmtpUser = $('#settingsSmtpUser');
  const settingsSmtpPass = $('#settingsSmtpPass');
  const settingsSmtpFrom = $('#settingsSmtpFrom');
  const settingsSmtpIgnoreTLS = $('#settingsSmtpIgnoreTLS');
  const saveSettingsBtn = $('#saveSettingsBtn');
  const testEmailInput = $('#testEmailInput');
  const testEmailBtn = $('#testEmailBtn');
  const settingsCheckTimeout = $('#settingsCheckTimeout');

  // Новые поля настроек
  const settingsAdminEmail = $('#settingsAdminEmail');
  const settingsBackupInterval = $('#settingsBackupInterval');
  const settingsBackupRetention = $('#settingsBackupRetention');

  // Управление пользователями
  const usersBtn = $('#usersBtn');
  const usersModal = $('#usersModal');
  const usersList = $('#usersList');
  const newUserLogin = $('#newUserLogin');
  const newUserPassword = $('#newUserPassword');
  const newUserRole = $('#newUserRole');
  const addUserBtn = $('#addUserBtn');

  // Шаблоны писем
  const emailTemplatesBtn = $('#emailTemplatesBtn');
  const emailTemplatesModal = $('#emailTemplatesModal');
  const unavailableSubject = $('#unavailableSubject');
  const unavailableBody = $('#unavailableBody');
  const backupSubject = $('#backupSubject');
  const backupBody = $('#backupBody');
  const saveTemplatesBtn = $('#saveTemplatesBtn');

  // Бэкап
  const backupNowBtn = $('#backupNowBtn');

  // Jodit экземпляры
  let stubJoditInstance = null;
  let templateJoditInstance = null;
  let currentEditingLinkId = null;

  // --- Состояние ---
  let currentTagId = null;
  let currentLinkIdForQr = null;
  let tags = [];
  let links = [];

  let qrStylingInstance = null;
  // --- Применение ограничений по роли ---
  function applyRoleRestrictions(role) {
    const isAdmin = role === 'admin';
    const isUser = role === 'admin' || role === 'user';
    const isGuest = role === 'guest';

    // 1. Админские кнопки (только админ)
    document.querySelectorAll('.admin-only').forEach(el => {
      if (isAdmin) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    // 2. Кнопки для пользователей (админ + user)
    document.querySelectorAll('.user-only').forEach(el => {
      if (isUser) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    // 3. Кнопки управления (скрыть для гостя)
    const actionSelectors = [
      '#addTagBtn',          // кнопка "Добавить тег"
      '#addLinkBtn',         // кнопка "Добавить ссылку"
      '.edit-tag-btn',       // кнопка редактирования тега
      '.delete-tag-btn',     // кнопка удаления тега
      '.edit-link-btn',      // кнопка редактирования ссылки
      '.delete-link-btn',    // кнопка удаления ссылки
      '.edit-stub-btn',      // кнопка редактирования заглушки
      '.show-qr-btn',        // кнопка "QR" (опционально)
      '.check-link-btn'      // кнопка "Проверить" (опционально)
    ];
    actionSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (isGuest) {
          el.classList.add('hidden');
        } else {
          el.classList.remove('hidden');
        }
      });
    });
  }

  // --- API helpers ---
  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Ошибка ${res.status}`);
    }
    return res.json();
  }

  // --- Авторизация ---
  async function login() {
    const login = loginInput.value.trim();
    const password = passwordInput.value.trim();
    try {
      const result = await apiFetch('/api/login', {
        method: 'POST',
        body: { login, password }
      });
      if (result.success) {
        loginForm.classList.add('hidden');
        dashboard.classList.remove('hidden');
        loginError.textContent = '';
        window.userRole = result.role || 'guest';
        console.log('applyRoleRestrictions вызвана с ролью:', window.userRole);
        applyRoleRestrictions(window.userRole);
        loadData();
      } else {
        loginError.textContent = 'Неверный логин или пароль';
      }
    } catch (e) {
      loginError.textContent = 'Ошибка соединения';
    }
  }

  loginBtn.addEventListener('click', login);
  loginInput.addEventListener('keydown', e => e.key === 'Enter' && login());
  passwordInput.addEventListener('keydown', e => e.key === 'Enter' && login());

  logoutBtn.addEventListener('click', async () => {
    await apiFetch('/api/logout', { method: 'POST' });
    loginForm.classList.remove('hidden');
    dashboard.classList.add('hidden');
    loginInput.value = '';
    passwordInput.value = '';
    loginError.textContent = '';
  });

  // --- Загрузка данных ---
  async function loadData() {
    try {
      const [tagsData, linksData] = await Promise.all([
        apiFetch('/api/tags'),
        apiFetch('/api/links')
      ]);
      tags = tagsData;
      links = linksData;

      if (!currentTagId || !tags.some(t => t.id === currentTagId)) {
        currentTagId = tags.length > 0 ? tags[0].id : null;
      }

      renderAll();
    } catch (e) {
      alert('Не удалось загрузить данные: ' + e.message);
    }
  }

  // --- Рендеринг ---
  function renderTags() {
    tagList.innerHTML = '';
    if (tags.length === 0) {
      tagList.innerHTML = '<li style="border-left-color:#ccc; cursor:default;">Нет тегов</li>';
      return;
    }
    tags.forEach(tag => {
      const li = document.createElement('li');
      li.dataset.id = tag.id;
      if (tag.id === currentTagId) li.classList.add('active');

      const unavailableCount = links.filter(l => l.tagId === tag.id && !l.available).length;
      const alarmHtml = unavailableCount > 0 ? `<div class="alarm-badge-top">⚠️ Недоступно: ${unavailableCount}</div>` : '';

      li.innerHTML = `
        <span style="display:flex; flex-direction:column; align-items:flex-start;">
          ${alarmHtml}
          <div>
            <strong>${tag.name}</strong>
            <span class="tag-email">(${tag.email})</span>
          </div>
        </span>
        <div>
          <button class="btn btn-primary btn-sm edit-tag-btn" data-id="${tag.id}">✎</button>
          <button class="btn btn-danger btn-sm delete-tag-btn" data-id="${tag.id}">✕</button>
        </div>
      `;
      li.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        selectTag(tag.id);
      });
      tagList.appendChild(li);
    });
    document.querySelectorAll('.edit-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTagModal(btn.dataset.id);
      });
    });
    document.querySelectorAll('.delete-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Удалить тег и все его ссылки?')) deleteTag(id);
      });
    });
    applyRoleRestrictions(window.userRole || 'guest');
  }

  function renderLinks() {
    linkList.innerHTML = '';
    if (!currentTagId) {
      currentTagTitle.textContent = 'Выберите тег';
      noLinksMessage.style.display = 'block';
      linkList.style.display = 'none';
      return;
    }
    const tag = tags.find(t => t.id === currentTagId);
    if (!tag) {
      currentTagTitle.textContent = 'Тег не найден';
      noLinksMessage.style.display = 'block';
      linkList.style.display = 'none';
      return;
    }
    currentTagTitle.textContent = `Ссылки тега: ${tag.name}`;
    const filtered = links.filter(l => l.tagId === currentTagId);
    if (filtered.length === 0) {
      noLinksMessage.style.display = 'block';
      linkList.style.display = 'none';
      return;
    }
    noLinksMessage.style.display = 'none';
    linkList.style.display = 'block';
    filtered.forEach(link => {
      const li = document.createElement('li');
      li.dataset.id = link.id;
      const statusClass = link.available ? 'status-ok' : 'status-error';
      const statusText = link.available ? 'Доступен' : 'Недоступен';
      const lastChecked = link.lastChecked ? new Date(link.lastChecked).toLocaleString() : 'никогда';
      li.innerHTML = `
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <strong>${link.name}</strong>
            <span class="status-badge ${statusClass}">${statusText}</span>
            ${link.isFile ? '<span class="badge-file">📁</span>' : ''}
          </div>
          <div class="link-url">${link.url}</div>
          <div style="font-size:11px; color:#999;">Последняя проверка: ${lastChecked}</div>
        </div>
        <div class="link-actions">
          <button class="btn btn-primary btn-sm show-qr-btn" data-id="${link.id}">QR</button>
          <button class="btn btn-warning btn-sm check-link-btn" data-id="${link.id}">Проверить</button>
          <button class="btn btn-secondary btn-sm edit-stub-btn" data-id="${link.id}">✎ Заглушка</button>
          <button class="btn btn-primary btn-sm edit-link-btn" data-id="${link.id}">✎</button>
          <button class="btn btn-danger btn-sm delete-link-btn" data-id="${link.id}">✕</button>
        </div>
      `;
      linkList.appendChild(li);
    });
    document.querySelectorAll('.show-qr-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showQrForLink(btn.dataset.id);
      });
    });
    document.querySelectorAll('.check-link-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        checkLink(btn.dataset.id);
      });
    });
    document.querySelectorAll('.edit-stub-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openStubEditor(btn.dataset.id);
      });
    });
    document.querySelectorAll('.edit-link-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openLinkModal(btn.dataset.id);
      });
    });
    document.querySelectorAll('.delete-link-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Удалить ссылку?')) deleteLink(id);
      });
    });
    applyRoleRestrictions(window.userRole || 'guest');
  }

  function renderAll() {
    renderTags();
    renderLinks();
    populateTagSelect();
  }

  // --- Выбор тега ---
  function selectTag(tagId) {
    currentTagId = tagId;
    renderAll();
  }

  // --- Теги CRUD ---
  function openTagModal(editId = null) {
    if (editId) {
      const tag = tags.find(t => t.id === editId);
      if (!tag) return;
      tagModalTitle.textContent = 'Редактировать тег';
      tagNameInput.value = tag.name;
      tagEmailInput.value = tag.email;
      tagEditId.value = tag.id;
    } else {
      tagModalTitle.textContent = 'Добавить тег';
      tagNameInput.value = '';
      tagEmailInput.value = '';
      tagEditId.value = '';
    }
    tagModal.classList.remove('hidden');
    tagNameInput.focus();
  }

  async function saveTag() {
    const name = tagNameInput.value.trim();
    const email = tagEmailInput.value.trim();
    if (!name || !email) { alert('Заполните все поля'); return; }
    const editId = tagEditId.value;
    try {
      let result;
      if (editId) {
        result = await apiFetch(`/api/tags/${editId}`, {
          method: 'PUT',
          body: { name, email }
        });
      } else {
        result = await apiFetch('/api/tags', {
          method: 'POST',
          body: { name, email }
        });
        if (result && result.id) {
          currentTagId = result.id;
        }
      }
      closeModal('tagModal');
      await loadData();
      if (!editId && result && result.id) {
        currentTagId = result.id;
        renderAll();
      }
    } catch (e) {
      alert(e.message);
    }
  }

  async function deleteTag(tagId) {
    try {
      await apiFetch(`/api/tags/${tagId}`, { method: 'DELETE' });
      if (currentTagId === tagId) currentTagId = null;
      await loadData();
    } catch (e) {
      alert(e.message);
    }
  }

  // --- Ссылки CRUD ---
  function populateTagSelect() {
    linkTagSelect.innerHTML = '';
    tags.forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag.id;
      opt.textContent = tag.name;
      linkTagSelect.appendChild(opt);
    });
    if (currentTagId) linkTagSelect.value = currentTagId;
  }

  function openLinkModal(editId = null) {
    populateTagSelect();
    if (editId) {
      const link = links.find(l => l.id === editId);
      if (!link) return;
      linkModalTitle.textContent = 'Редактировать ссылку';
      linkNameInput.value = link.name;
      linkUrlInput.value = link.url;
      linkTagSelect.value = link.tagId;
      linkIsFile.checked = link.isFile || false;
      linkEditId.value = link.id;
    } else {
      linkModalTitle.textContent = 'Добавить ссылку';
      linkNameInput.value = '';
      linkUrlInput.value = '';
      linkTagSelect.value = currentTagId || (tags.length > 0 ? tags[0].id : '');
      linkIsFile.checked = false;
      linkEditId.value = '';
    }
    linkModal.classList.remove('hidden');
    linkNameInput.focus();
  }

  async function saveLink() {
    const name = linkNameInput.value.trim();
    const url = linkUrlInput.value.trim();
    const tagId = linkTagSelect.value;
    const isFile = linkIsFile.checked;
    if (!name || !url || !tagId) { alert('Заполните все поля'); return; }
    const editId = linkEditId.value;
    try {
      if (editId) {
        await apiFetch(`/api/links/${editId}`, {
          method: 'PUT',
          body: { name, url, tagId, isFile }
        });
        closeModal('linkModal');
        await loadData();
      } else {
        const newLink = await apiFetch('/api/links', {
          method: 'POST',
          body: { name, url, tagId, isFile }
        });
        closeModal('linkModal');
        await loadData();
        showQrForLink(newLink.id);
      }
    } catch (e) {
      alert(e.message);
    }
  }

  async function deleteLink(linkId) {
    try {
      await apiFetch(`/api/links/${linkId}`, { method: 'DELETE' });
      await loadData();
    } catch (e) {
      alert(e.message);
    }
  }

  // --- QR ---
  function showQrForLink(linkId) {
  const link = links.find(l => l.id === linkId);
  if (!link) return;
  currentLinkIdForQr = linkId;
  const baseUrl = window.location.origin;
  const redirectUrl = `${baseUrl}/redirect/${link.id}`;
  redirectUrlDisplay.textContent = redirectUrl;

  // Если экземпляр уже существует — обновляем данные
  if (qrStylingInstance) {
    qrStylingInstance.update({ data: redirectUrl });
    qrStylingInstance.append(qrCodeContainer);
    qrModal.classList.remove('hidden');
    return;
  }

  // Иначе создаём новый
  const dotsColor = document.getElementById('qrDotsColor').value;
  const bgColor = document.getElementById('qrBgColor').value;
  const dotsType = document.getElementById('qrDotsType').value;
  const transparent = document.getElementById('qrTransparentBg').checked;

  qrStylingInstance = new QRCodeStyling({
    width: 256,
    height: 256,
    type: "canvas",
    data: redirectUrl,
    dotsOptions: {
      color: dotsColor,
      type: dotsType
    },
    backgroundOptions: {
      color: transparent ? 'transparent' : bgColor
    }
  });

  qrStylingInstance.append(qrCodeContainer);
  qrModal.classList.remove('hidden');
}

// Обновление QR при изменении стилей
document.getElementById('qrTransparentBg').addEventListener('change', function() {
  document.getElementById('updateQrBtn').click();
});

document.getElementById('updateQrBtn').addEventListener('click', function() {
  if (!qrStylingInstance) return;
  const dotsColor = document.getElementById('qrDotsColor').value;
  const bgColor = document.getElementById('qrBgColor').value;
  const dotsType = document.getElementById('qrDotsType').value;
  const transparent = document.getElementById('qrTransparentBg').checked;

  qrStylingInstance.update({
    dotsOptions: { color: dotsColor, type: dotsType },
    backgroundOptions: { color: transparent ? 'transparent' : bgColor }
  });
});

// Загрузка логотипа
document.getElementById('qrLogoFile').addEventListener('change', function(e) {
  if (!qrStylingInstance) return;
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      qrStylingInstance.update({
        image: event.target.result,
        imageOptions: {
          hideBackgroundDots: true,
          imageSize: 0.25,
          margin: 4
        }
      });
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Скачивание QR
document.getElementById('downloadQrStylingBtn').addEventListener('click', function() {
  if (!qrStylingInstance) return;
  qrStylingInstance.download({
    name: `qr-${currentLinkIdForQr}`,
    extension: "png"
  });
});

  // --- Проверка ссылок ---
  async function checkLink(linkId) {
    try {
      await apiFetch(`/api/links/${linkId}/check`);
      await loadData();
    } catch (e) {
      alert(e.message);
    }
  }

  async function checkAll() {
    try {
      await apiFetch('/api/links/check-all');
      await loadData();
      alert('Проверка завершена. Статусы обновлены.');
    } catch (e) {
      alert(e.message);
    }
  }

async function checkAllWithProgress() {
  const btn = checkAllBtn;
  const originalText = btn.textContent; // содержит "🔄 Проверить все ссылки"
  const originalBg = btn.style.background;

  btn.disabled = true;
  btn.textContent = '🔄 Запуск...';
  btn.style.color = '#fff';

  try {
    const startRes = await fetch('/api/links/check-all-start', { credentials: 'include' });
    if (!startRes.ok) throw new Error('Не удалось запустить проверку');
    await startRes.json();

    let done = false;
    let progress = 0;
    let processed = 0;
    let total = 0;

    while (!done) {
      const res = await fetch('/api/links/check-all-progress', { credentials: 'include' });
      if (!res.ok) throw new Error('Ошибка получения прогресса');
      const data = await res.json();
      progress = data.progress || 0;
      processed = data.processed || 0;
      total = data.total || 0;
      done = data.done || false;

      btn.textContent = `🔄 Проверка: ${progress}% (${processed}/${total})`;
      btn.style.background = `linear-gradient(to right, #3498db ${progress}%, #dce1e8 ${progress}%)`;

      if (done) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    btn.textContent = '✅ Ok';
    setTimeout(() => {
      btn.textContent = originalText; // восстанавливаем "🔄 Проверить все ссылки"
      btn.style.background = originalBg || '';
      btn.style.color = '';
      btn.disabled = false;
      loadData();
    }, 1500);

  } catch (err) {
    console.error('Ошибка проверки:', err);
    btn.textContent = '❌ Ошибка';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = originalBg || '';
      btn.style.color = '';
      btn.disabled = false;
    }, 2000);
  }
}

  // --- Глобальный шаблон (Jodit с iframe) ---
  async function loadTemplate() {
    try {
      const result = await apiFetch('/api/default-template');
      return result.content || '';
    } catch (e) {
      alert('Не удалось загрузить шаблон: ' + e.message);
      return '';
    }
  }

  async function saveTemplate() {
    if (!templateJoditInstance) {
      alert('Редактор не инициализирован');
      return;
    }
    const content = templateJoditInstance.value;
    if (!content.trim()) {
      alert('Шаблон не может быть пустым');
      return;
    }
    try {
      await apiFetch('/api/default-template', {
        method: 'PUT',
        body: { content }
      });
      alert('Шаблон сохранён');
      closeModal('templateModal');
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  }

  editTemplateBtn.addEventListener('click', async () => {
    const content = await loadTemplate();
    templateModal.classList.remove('hidden');

    if (templateJoditInstance) {
      templateJoditInstance.destruct();
      templateJoditInstance = null;
    }

    setTimeout(() => {
      const editorElement = document.getElementById('templateEditor');
      if (!editorElement) return;

      editorElement.style.display = 'block';

      if (typeof Jodit === 'undefined') {
        alert('Jodit не загрузился. Проверьте подключение библиотеки.');
        return;
      }

      templateJoditInstance = Jodit.make('#templateEditor', {
        height: 500,
        iframe: true,
        iframeBaseUrl: window.location.origin,
        iframeCSSLinks: [],
        iframeStyle: 'body { font-family: Arial, sans-serif; padding: 10px; }',
        toolbar: true,
        buttons: [
          'source', '|',
          'bold', 'italic', 'underline', 'strikethrough', '|',
          'ul', 'ol', '|',
          'outdent', 'indent', '|',
          'font', 'fontsize', 'brush', 'paragraph', '|',
          'image', 'link', 'table', '|',
          'align', 'undo', 'redo', '|',
          'hr', 'eraser', 'fullsize'
        ],
        uploader: {
          url: '/api/upload-image',
          format: 'json',
          method: 'POST',
          prepareData: function (formData) {
            formData.append('linkId', 'global');
            return formData;
          },
          isSuccess: function (resp) {
            return resp && resp.location;
          },
          getMessage: function (resp) {
            return resp.location || 'Ошибка загрузки';
          },
          process: function (resp) {
            return {
              files: [resp.location],
              path: resp.location,
              error: resp.error || ''
            };
          },
          defaultHandlerSuccess: function (data, resp) {
            const url = data.files ? data.files[0] : resp.location;
            if (url && templateJoditInstance) {
              templateJoditInstance.selection.insertImage(url);
            }
          }
        }
      });

      if (templateJoditInstance) {
        templateJoditInstance.value = content;
      }
    }, 200);
  });

  saveTemplateBtn.addEventListener('click', saveTemplate);

  // --- Редактирование заглушки конкретной ссылки (Jodit с iframe) ---
  async function openStubEditor(linkId) {
    const link = links.find(l => l.id === linkId);
    if (!link) {
      alert('Ссылка не найдена');
      return;
    }
    currentEditingLinkId = linkId;
    stubModalTitle.textContent = `Редактирование заглушки: ${link.name}`;
    try {
      const result = await apiFetch(`/api/links/${linkId}/stub`);
      stubModal.classList.remove('hidden');

      if (stubJoditInstance) {
        stubJoditInstance.destruct();
        stubJoditInstance = null;
      }

      setTimeout(() => {
        const editorElement = document.getElementById('stubEditor');
        if (!editorElement) return;

        editorElement.style.display = 'block';

        if (typeof Jodit === 'undefined') {
          alert('Jodit не загрузился. Проверьте подключение библиотеки.');
          return;
        }

        stubJoditInstance = Jodit.make('#stubEditor', {
          height: 500,
          iframe: true,
          iframeBaseUrl: window.location.origin,
          iframeCSSLinks: [],
          iframeStyle: 'body { font-family: Arial, sans-serif; padding: 10px; }',
          toolbar: true,
          buttons: [
            'source', '|',
            'bold', 'italic', 'underline', 'strikethrough', '|',
            'ul', 'ol', '|',
            'outdent', 'indent', '|',
            'font', 'fontsize', 'brush', 'paragraph', '|',
            'image', 'link', 'table', '|',
            'align', 'undo', 'redo', '|',
            'hr', 'eraser', 'fullsize'
          ],
          uploader: {
            url: '/api/upload-image',
            format: 'json',
            method: 'POST',
            prepareData: function (formData) {
              if (currentEditingLinkId) {
                formData.append('linkId', currentEditingLinkId);
              }
              return formData;
            },
            isSuccess: function (resp) {
              return resp && resp.location;
            },
            getMessage: function (resp) {
              return resp.location || 'Ошибка загрузки';
            },
            process: function (resp) {
              return {
                files: [resp.location],
                path: resp.location,
                error: resp.error || ''
              };
            },
            defaultHandlerSuccess: function (data, resp) {
              const url = data.files ? data.files[0] : resp.location;
              if (url && stubJoditInstance) {
                stubJoditInstance.selection.insertImage(url);
              }
            }
          }
        });

        if (stubJoditInstance) {
          stubJoditInstance.value = result.content;
        }
      }, 200);
    } catch (e) {
      alert('Ошибка загрузки заглушки: ' + e.message);
    }
  }

  async function saveStub() {
    if (!currentEditingLinkId) {
      alert('Не выбрана ссылка');
      return;
    }

    let content = '';
    if (stubJoditInstance) {
      content = stubJoditInstance.value;
    } else {
      const editor = document.getElementById('stubEditor');
      content = editor ? editor.value : '';
    }

    try {
      await apiFetch(`/api/links/${currentEditingLinkId}/stub`, {
        method: 'PUT',
        body: { content }
      });
      alert('Заглушка сохранена');
      closeModal('stubModal');
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  }

  saveStubBtn.addEventListener('click', saveStub);

  // --- Смена пароля текущего пользователя (из панели) ---
  changePasswordBtn.addEventListener('click', () => {
    passwordModal.classList.remove('hidden');
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    newPasswordConfirmInput.value = '';
    passwordError.textContent = '';
  });

  saveCurrentPasswordBtn.addEventListener('click', async () => {
    const current = currentPasswordInput.value.trim();
    const newPass = newPasswordInput.value.trim();
    const confirm = newPasswordConfirmInput.value.trim();

    if (!current || !newPass || !confirm) {
      passwordError.textContent = 'Заполните все поля';
      return;
    }
    if (newPass !== confirm) {
      passwordError.textContent = 'Пароли не совпадают';
      return;
    }
    if (newPass.length < 4) {
      passwordError.textContent = 'Новый пароль должен быть не менее 4 символов';
      return;
    }

    try {
      await apiFetch('/api/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: newPass }
      });
      alert('Пароль успешно изменён');
      closeModal('passwordModal');
      passwordError.textContent = '';
    } catch (e) {
      passwordError.textContent = e.message || 'Ошибка смены пароля';
    }
  });

  // --- Настройки ---
  async function loadSettings() {
    try {
      const config = await apiFetch('/api/config');
      settingsBaseUrl.value = config.baseUrl || '';
      settingsCheckInterval.value = config.checkIntervalMinutes || 60;
      settingsCheckTimeout.value = config.checkTimeout || 15000;
      settingsNotificationInterval.value = config.notificationIntervalHours || 24;
      settingsSmtpHost.value = config.smtp?.host || '';
      settingsSmtpPort.value = config.smtp?.port || 587;
      settingsSmtpSecure.checked = config.smtp?.secure || false;
      settingsSmtpUser.value = config.smtp?.auth?.user || '';
      settingsSmtpPass.value = config.smtp?.auth?.pass || '';
      settingsSmtpFrom.value = config.smtp?.from || '';
      settingsSmtpIgnoreTLS.checked = config.smtp?.ignoreTLS || false;
      settingsAdminEmail.value = config.adminEmail || '';
      settingsBackupInterval.value = config.backupIntervalHours || 24;
      settingsBackupRetention.value = config.backupRetentionDays || 7;
    } catch (e) {
      alert('Не удалось загрузить настройки: ' + e.message);
    }
  }

  settingsBtn.addEventListener('click', async () => {
    settingsModal.classList.remove('hidden');
    await loadSettings();
  });

  saveSettingsBtn.addEventListener('click', async () => {
    const config = {
      baseUrl: settingsBaseUrl.value.trim(),
      checkIntervalMinutes: parseInt(settingsCheckInterval.value) || 60,
      checkTimeout: parseInt(settingsCheckTimeout.value) || 15000,
      notificationIntervalHours: parseInt(settingsNotificationInterval.value) || 24,
      adminEmail: settingsAdminEmail.value.trim(),
      backupIntervalHours: parseInt(settingsBackupInterval.value) || 24,
      backupRetentionDays: parseInt(settingsBackupRetention.value) || 7,
      smtp: {
        host: settingsSmtpHost.value.trim(),
        port: parseInt(settingsSmtpPort.value) || 587,
        secure: settingsSmtpSecure.checked,
        ignoreTLS: settingsSmtpIgnoreTLS.checked,
        auth: {
          user: settingsSmtpUser.value.trim(),
          pass: settingsSmtpPass.value.trim()
        },
        from: settingsSmtpFrom.value.trim()
      }
    };
    try {
      await apiFetch('/api/config', {
        method: 'PUT',
        body: config
      });
      alert('Настройки сохранены');
      closeModal('settingsModal');
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  });

  // --- Тестовое письмо ---
  testEmailBtn.addEventListener('click', async () => {
    const email = testEmailInput.value.trim();
    if (!email) {
      alert('Введите email получателя');
      return;
    }

    // 1. Сохраняем настройки
    try {
      const config = {
        baseUrl: settingsBaseUrl.value.trim(),
        checkIntervalMinutes: parseInt(settingsCheckInterval.value) || 60,
	checkTimeout: parseInt(settingsCheckTimeout.value) || 15000,
        notificationIntervalHours: parseInt(settingsNotificationInterval.value) || 24,
        adminEmail: settingsAdminEmail.value.trim(),
        backupIntervalHours: parseInt(settingsBackupInterval.value) || 24,
        backupRetentionDays: parseInt(settingsBackupRetention.value) || 7,
        smtp: {
          host: settingsSmtpHost.value.trim(),
          port: parseInt(settingsSmtpPort.value) || 587,
          secure: settingsSmtpSecure.checked,
          ignoreTLS: settingsSmtpIgnoreTLS.checked,
          auth: {
            user: settingsSmtpUser.value.trim(),
            pass: settingsSmtpPass.value.trim()
          },
          from: settingsSmtpFrom.value.trim()
        }
      };

      await apiFetch('/api/config', {
        method: 'PUT',
        body: config
      });
    } catch (e) {
      alert('Ошибка сохранения настроек: ' + e.message);
      return;
    }

    // 2. Отправляем тестовое письмо
    try {
      const result = await apiFetch('/api/test-email', {
        method: 'POST',
        body: { to: email }
      });
      if (result.success) {
        testResultContent.innerHTML = '✅ ' + result.message;
      } else {
        testResultContent.innerHTML = '❌ ' + result.message + '\n\nДетали:\n' + (result.details || 'Нет дополнительной информации');
      }
      testResultModal.classList.remove('hidden');
    } catch (e) {
      testResultContent.innerHTML = '❌ Ошибка запроса: ' + e.message;
      testResultModal.classList.remove('hidden');
    }
  });

  // --- Управление пользователями ---
  async function loadUsers() {
    try {
      const users = await apiFetch('/api/users');
      usersList.innerHTML = '';
      if (!users || users.length === 0) {
        usersList.innerHTML = '<p style="color:#999;">Нет пользователей</p>';
        return;
      }
      const roleLabels = { admin: 'Администратор', user: 'Пользователь', guest: 'Гость' };
      users.forEach(user => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #eee;';
        div.innerHTML = `
          <span><strong>${user.login}</strong> (${roleLabels[user.role] || user.role})</span>
          <div>
            <button class="btn btn-primary btn-sm edit-user-role-btn" data-login="${user.login}" data-role="${user.role}">✎</button>
            <button class="btn btn-warning btn-sm change-user-password-btn" data-login="${user.login}">🔑</button>
            ${user.login !== 'admin' ? `<button class="btn btn-danger btn-sm delete-user-btn" data-login="${user.login}">✕</button>` : ''}
          </div>
        `;
        usersList.appendChild(div);
      });

      // Обработчики для кнопок
      document.querySelectorAll('.edit-user-role-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const login = btn.dataset.login;
          const role = btn.dataset.role;
          openEditUserModal(login, role);
        });
      });

      document.querySelectorAll('.change-user-password-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const login = btn.dataset.login;
          openChangePasswordModal(login);
        });
      });

      document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const login = btn.dataset.login;
          if (!confirm(`Удалить пользователя ${login}?`)) return;
          try {
            await apiFetch(`/api/users/${login}`, { method: 'DELETE' });
            alert('Пользователь удалён');
            loadUsers();
          } catch (err) {
            alert('Ошибка удаления: ' + err.message);
          }
        });
      });
    } catch (e) {
      alert('Ошибка загрузки пользователей: ' + e.message);
    }
  }

  // --- Редактирование роли пользователя ---
  let editingUserLogin = null;

  function openEditUserModal(login, role) {
    editingUserLogin = login;
    document.getElementById('editUserLogin').value = login;
    document.getElementById('editUserRole').value = role;
    // Скрываем модалку пользователей
    document.getElementById('usersModal').classList.add('hidden');
    document.getElementById('editUserModal').classList.remove('hidden');
  }

  document.getElementById('saveUserRoleBtn').addEventListener('click', async () => {
    const login = editingUserLogin;
    const role = document.getElementById('editUserRole').value;
    if (!login) return;
    try {
      await apiFetch(`/api/users/${login}`, {
        method: 'PUT',
        body: { userRole: role }
      });
      alert('Роль обновлена');
      closeModal('editUserModal');
      loadUsers();
    } catch (e) {
      alert('Ошибка обновления: ' + e.message);
    }
  });

  // --- Смена пароля пользователя администратором ---
  let changingUserLogin = null;

  function openChangePasswordModal(login) {
    changingUserLogin = login;
    document.getElementById('changePasswordUserLogin').textContent = login;
    document.getElementById('changePasswordNew').value = '';
    document.getElementById('changePasswordConfirm').value = '';
    document.getElementById('changePasswordError').textContent = '';
    // Скрываем модалку пользователей
    document.getElementById('usersModal').classList.add('hidden');
    document.getElementById('changePasswordModal').classList.remove('hidden');
  }

  saveUserPasswordBtn.addEventListener('click', async () => {
    const login = changingUserLogin;
    const newPass = document.getElementById('changePasswordNew').value.trim();
    const confirmPass = document.getElementById('changePasswordConfirm').value.trim();
    const errorEl = document.getElementById('changePasswordError');

    if (!login) return;
    if (!newPass) {
      errorEl.textContent = 'Введите новый пароль';
      return;
    }
    if (newPass.length < 4) {
      errorEl.textContent = 'Пароль должен быть не менее 4 символов';
      return;
    }
    if (newPass !== confirmPass) {
      errorEl.textContent = 'Пароли не совпадают';
      return;
    }
    errorEl.textContent = '';

    try {
      await apiFetch(`/api/users/${login}`, {
        method: 'PUT',
        body: { password: newPass }
      });
      alert('Пароль обновлён');
      closeModal('changePasswordModal');
    } catch (e) {
      errorEl.textContent = 'Ошибка: ' + e.message;
    }
  });

  async function addUser() {
    const login = newUserLogin.value.trim();
    const password = newUserPassword.value.trim();
    const role = newUserRole.value;
    if (!login || !password) {
      alert('Введите логин и пароль');
      return;
    }
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: { login, password, userRole: role }
      });
      alert('Пользователь добавлен');
      newUserLogin.value = '';
      newUserPassword.value = '';
      loadUsers();
    } catch (e) {
      alert('Ошибка добавления: ' + e.message);
    }
  }

  async function updateUser(login, password, role) {
    try {
      await apiFetch(`/api/users/${login}`, {
        method: 'PUT',
        body: { password, userRole: role }
      });
      alert('Пользователь обновлён');
      loadUsers();
    } catch (e) {
      alert('Ошибка обновления: ' + e.message);
    }
  }

  usersBtn.addEventListener('click', async () => {
    usersModal.classList.remove('hidden');
    await loadUsers();
  });

  addUserBtn.addEventListener('click', addUser);

  // --- Шаблоны писем ---
  async function loadEmailTemplates() {
    try {
      const templates = await apiFetch('/api/email-templates');
      unavailableSubject.value = templates.unavailable?.subject || '';
      unavailableBody.value = templates.unavailable?.body || '';
      backupSubject.value = templates.backup?.subject || '';
      backupBody.value = templates.backup?.body || '';
    } catch (e) {
      alert('Ошибка загрузки шаблонов: ' + e.message);
    }
  }

  async function saveEmailTemplates() {
    const data = {
      unavailable: {
        subject: unavailableSubject.value.trim(),
        body: unavailableBody.value.trim()
      },
      backup: {
        subject: backupSubject.value.trim(),
        body: backupBody.value.trim()
      }
    };
    try {
      await apiFetch('/api/email-templates', {
        method: 'PUT',
        body: data
      });
      alert('Шаблоны сохранены');
      closeModal('emailTemplatesModal');
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  }

  emailTemplatesBtn.addEventListener('click', async () => {
    await loadEmailTemplates();
    emailTemplatesModal.classList.remove('hidden');
  });

  saveTemplatesBtn.addEventListener('click', saveEmailTemplates);

  // --- Ручной бэкап ---
  backupNowBtn.addEventListener('click', async () => {
    if (!confirm('Создать резервную копию сейчас?')) return;
    try {
      await apiFetch('/api/backup', { method: 'POST' });
      alert('Резервная копия создана и отправлена на почту');
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  });

  // --- Экспорт/Импорт ---
  function exportData() {
    const data = { tags, links };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = 'url_backup.json';
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData() {
    importFile.click();
  }

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported.tags || !imported.links) throw new Error('Неверный формат');
      alert('Импорт данных возможен только заменой файла url.json на сервере. Скопируйте содержимое и замените вручную.');
    } catch (err) {
      alert('Ошибка импорта: ' + err.message);
    }
    importFile.value = '';
  });

  // --- Модалки: закрытие ---
  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');

    if (id === 'stubModal' && stubJoditInstance) {
      stubJoditInstance.destruct();
      stubJoditInstance = null;
      const editor = document.getElementById('stubEditor');
      if (editor) editor.style.display = 'none';
    }

    if (id === 'templateModal' && templateJoditInstance) {
      templateJoditInstance.destruct();
      templateJoditInstance = null;
      const editor = document.getElementById('templateEditor');
      if (editor) editor.style.display = 'none';
    }

    if (id === 'passwordModal') {
      passwordError.textContent = '';
    }

    // Если закрываем editUserModal или changePasswordModal, показываем usersModal
    if (id === 'editUserModal' || id === 'changePasswordModal') {
      document.getElementById('usersModal').classList.remove('hidden');
    }
  }

  document.querySelectorAll('.modal-close').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.modal));
  });
  document.querySelectorAll('[data-modal]').forEach(el => {
    if (el.classList.contains('modal-close')) return;
    el.addEventListener('click', () => closeModal(el.dataset.modal));
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  // --- Кнопки ---
  addTagBtn.addEventListener('click', () => openTagModal());
  addLinkBtn.addEventListener('click', () => openLinkModal());
  saveTagBtn.addEventListener('click', saveTag);
  saveLinkBtn.addEventListener('click', saveLink);
//  downloadQrBtn.addEventListener('click', downloadQr);
//  downloadHtmlBtn.addEventListener('click', downloadHtml);
//  checkAllBtn.addEventListener('click', checkAll);
checkAllBtn.addEventListener('click', checkAllWithProgress);

  exportDataBtn.addEventListener('click', exportData);
  importDataBtn.addEventListener('click', importData);
let helpShadowRoot = null;

helpBtn.addEventListener('click', async () => {
  const helpModal = document.getElementById('helpModal');
  if (!helpModal) return;
  helpModal.style.display = 'flex';
  helpModal.classList.remove('hidden');

  const helpContent = document.getElementById('helpContent');
  if (!helpContent) return;

  // Если shadow root уже создан, ничего не делаем
  if (helpShadowRoot) return;

  try {
    const response = await fetch('/help.html');
    if (!response.ok) throw new Error('Не удалось загрузить справку');
    const html = await response.text();

    // Создаём shadow root
    helpShadowRoot = helpContent.attachShadow({ mode: 'open' });
    // Вставляем содержимое
    helpShadowRoot.innerHTML = html;

    // Инициализация аккордеона внутри shadow root
    const headers = helpShadowRoot.querySelectorAll('.accordion-header');
    headers.forEach(header => {
      header.addEventListener('click', function(e) {
        const item = this.parentElement;
        item.classList.toggle('open');
      });
    });
  } catch (e) {
    helpContent.innerHTML = `<p style="color:#e74c3c;">Ошибка загрузки справки: ${e.message}</p>`;
  }
});

  // --- Инициализация ---
  (async function init() {
    try {
      const res = await fetch('/api/check-auth', { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated) {
        loginForm.classList.add('hidden');
        dashboard.classList.remove('hidden');
        loginError.textContent = '';
        window.userRole = data.role || 'guest';
        console.log('applyRoleRestrictions вызвана с ролью:', window.userRole);
        applyRoleRestrictions(window.userRole);
        await loadData();
      } else {
        loginForm.classList.remove('hidden');
        dashboard.classList.add('hidden');
      }
    } catch (e) {
      loginForm.classList.remove('hidden');
      dashboard.classList.add('hidden');
    }
  })();

})();