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

  const qrContainer = $('#qrcode');
  const redirectUrlDisplay = $('#redirectUrlDisplay');
  const downloadQrBtn = $('#downloadQrBtn');
  const downloadHtmlBtn = $('#downloadHtmlBtn');

  const testResultModal = $('#testResultModal');
  const testResultContent = $('#testResultContent');

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

  // Смена пароля
  const changePasswordBtn = $('#changePasswordBtn');
  const passwordModal = $('#passwordModal');
  const currentPasswordInput = $('#currentPasswordInput');
  const newPasswordInput = $('#newPasswordInput');
  const newPasswordConfirmInput = $('#newPasswordConfirmInput');
  const savePasswordBtn = $('#savePasswordBtn');
  const passwordError = $('#passwordError');

  // Настройки (добавлены новые поля)
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

  // Jodit экземпляры
  let stubJoditInstance = null;
  let templateJoditInstance = null;
  let currentEditingLinkId = null;

  // --- Состояние ---
  let currentTagId = null;
  let currentLinkIdForQr = null;
  let tags = [];
  let links = [];

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
      li.innerHTML = `
        <span><strong>${tag.name}</strong> <span class="tag-email">(${tag.email})</span></span>
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

    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: redirectUrl,
      width: 256,
      height: 256,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    qrModal.classList.remove('hidden');
  }

  function downloadQr() {
    const canvas = qrContainer.querySelector('canvas');
    if (!canvas) { alert('QR-код не сгенерирован'); return; }
    const a = document.createElement('a');
    a.download = `qr-${currentLinkIdForQr}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function downloadHtml() {
    const link = links.find(l => l.id === currentLinkIdForQr);
    if (!link) return;
    const redirectUrl = `${window.location.origin}/redirect/${link.id}`;
    const a = document.createElement('a');
    a.href = redirectUrl;
    a.download = `redirect-${link.name}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

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

  // --- Смена пароля ---
  changePasswordBtn.addEventListener('click', () => {
    passwordModal.classList.remove('hidden');
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    newPasswordConfirmInput.value = '';
    passwordError.textContent = '';
  });

  savePasswordBtn.addEventListener('click', async () => {
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
      settingsNotificationInterval.value = config.notificationIntervalHours || 24;
      settingsSmtpHost.value = config.smtp?.host || '';
      settingsSmtpPort.value = config.smtp?.port || 587;
      settingsSmtpSecure.checked = config.smtp?.secure || false;
      settingsSmtpUser.value = config.smtp?.auth?.user || '';
      settingsSmtpPass.value = config.smtp?.auth?.pass || '';
      settingsSmtpFrom.value = config.smtp?.from || '';
      settingsSmtpIgnoreTLS.checked = config.smtp?.ignoreTLS || false;
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
      notificationIntervalHours: parseInt(settingsNotificationInterval.value) || 24,
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

  // 1. Сначала сохраняем настройки (как при нажатии "Сохранить")
  try {
    const config = {
      baseUrl: settingsBaseUrl.value.trim(),
      checkIntervalMinutes: parseInt(settingsCheckInterval.value) || 60,
      notificationIntervalHours: parseInt(settingsNotificationInterval.value) || 24,
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
    // Настройки сохранены
  } catch (e) {
    alert('Ошибка сохранения настроек: ' + e.message);
    return; // не отправляем письмо, если не сохранилось
  }

  // 2. Теперь отправляем тестовое письмо с новыми настройками
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
  downloadQrBtn.addEventListener('click', downloadQr);
  downloadHtmlBtn.addEventListener('click', downloadHtml);
  checkAllBtn.addEventListener('click', checkAll);
  exportDataBtn.addEventListener('click', exportData);
  importDataBtn.addEventListener('click', importData);

  // --- Инициализация ---
  (async function init() {
    try {
      const res = await fetch('/api/check-auth', { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated) {
        loginForm.classList.add('hidden');
        dashboard.classList.remove('hidden');
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

})();r
