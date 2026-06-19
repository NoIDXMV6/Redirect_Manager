# Redirect Manager

Панель управления ссылками и QR-кодами для печатных изданий.

## Описание

Redirect Manager — это веб-приложение (Node.js + Express), которое позволяет гибко управлять редиректами и генерировать QR-коды для печатных книг. Вместо того чтобы печатать в книге прямые URL-адреса, вы печатаете ссылки на ваш сайт (например, https://ваш-сайт/redirect/{id}), а в панели управления можете в любой момент изменить конечный URL или подставить заглушку, если ресурс временно недоступен. Это избавляет от необходимости переиздавать книгу.

**Основные возможности:**

- Авторизация с хешированием пароля (bcrypt).
- Группировка ссылок по тегам (категориям) с указанием email для уведомлений.
- CRUD ссылок — добавление, редактирование, удаление.
- Генерация QR-кода для каждой ссылки (скачивание в PNG).
- Автоматическая проверка доступности URL (интервал настраивается).
- Кэширование файлов — если ссылка ведёт на файл, он скачивается и хранится локально; при недоступности оригинала отдаётся локальная копия (с поддержкой обновления по размеру/дате).
- Визуальный редактор заглушек (WYSIWYG) для страниц, показываемых при недоступности ресурса.
- Редактируемый глобальный шаблон заглушки.
- Email-уведомления при недоступности ссылок (с настраиваемым интервалом повторных уведомлений).
- Настройка SMTP через интерфейс (с тестовой отправкой).
- Экспорт/импорт данных в JSON.
- Смена пароля администратора через интерфейс.
- Favicon (иконка вкладки).

## Требования к серверу

- Node.js версии 20 или выше (рекомендуется 22 LTS).
- npm (поставляется с Node.js).
- ОС: Linux (Ubuntu/Debian) предпочтительна, но работает на любой системе с Node.js.
- Домен (или IP) для доступа к панели.
- SMTP-сервер (опционально, для email-уведомлений).
- nginx (рекомендуется для production).

## Установка

### 1. Клонирование репозитория
```bash
git clone https://github.com/NoIDXMV6/redirect_manager.git
cd redirect-manager
```
### 2. Установка зависимостей
```bash
npm install
```
### 3. Настройка конфигурации

При первом запуске сервер автоматически создаст config.json и url.json с дефолтными значениями.  
Отредактируйте config.json (обязательно укажите baseUrl):

 {
   "login": "admin",
   "passwordHash": "$2b$10$...",  // будет сгенерирован автоматически, не меняйте вручную
   "port": 3000,
   "baseUrl": "https://your-domain.com",
   "checkIntervalMinutes": 1,
   "notificationIntervalHours": 24,
   "fileDownloadTimeout": 60000,
   "smtp": {
  "host": "smtp.your-provider.com",
  "port": 587,
  "secure": false,
  "ignoreTLS": true,   // отключает проверку сертификата (для отладки)
  "auth": {
    "user": "your-email@example.com",
    "pass": "your-password"
  },
  "from": "noreply@example.com"
   }
 }

- baseUrl — обязательно укажите ваш домен (или IP) для генерации корректных ссылок редиректа и QR-кодов.
- checkIntervalMinutes — интервал автоматической проверки всех ссылок (в минутах).
- notificationIntervalHours — минимальный интервал между повторными уведомлениями для одной ссылки (в часах).
- fileDownloadTimeout — таймаут скачивания файла в миллисекундах (по умолчанию 60000).
- smtp.ignoreTLS — если true, отключает проверку SSL-сертификата (полезно для тестирования).

### 4. Запуск вручную (для проверки)
```bash
node server.js
```
Откройте браузер по адресу http://ваш-сервер:3000.  
Логин по умолчанию: admin, пароль: password.

Сразу смените пароль!

### 5. Настройка автозапуска через systemd

Создайте файл службы:
```bash
sudo nano /etc/systemd/system/redirect-manager.service
```
Содержимое:
```text
[Unit]
 Description=Redirect Manager Service
 After=network.target

[Service]
 Type=simple
 User=www-data
 Group=www-data
 WorkingDirectory=/var/www/redirect-manager
 ExecStart=/usr/bin/node /var/www/redirect-manager/server.js
 Restart=always
 RestartSec=10
 Environment=NODE_ENV=production

[Install]
 WantedBy=multi-user.target
```
Активируйте и запустите:
```bash
sudo systemctl daemon-reload
sudo systemctl enable redirect-manager
sudo systemctl start redirect-manager
```
Проверьте статус:
```bash
sudo systemctl status redirect-manager
```
### 6. Настройка nginx (реверс-прокси)
```bash
sudo nano /etc/nginx/sites-available/redirect-manager
```
Содержимое:
```text
server {
  listen 80;
  server_name your-domain.com;

 location / {
   proxy_pass http://127.0.0.1:3000;
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection 'upgrade';
   proxy_set_header Host $host;
   proxy_cache_bypass $http_upgrade;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
 }
}
```
Активируйте сайт:
```bash
sudo ln -s /etc/nginx/sites-available/redirect-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```
### 7. Настройка HTTPS (рекомендуется)

Используйте Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```
## Использование

1. Вход — используйте логин и пароль.
2. Управление тегами — создавайте, редактируйте, удаляйте теги. Для каждого тега указывается email для уведомлений.
3. Управление ссылками — добавляйте ссылки (имя, URL, тег). Для файлов отметьте чекбокс «Это файл» — система будет скачивать файл и кэшировать его локально.
4. Проверка ссылок — кнопка «Проверить» у каждой ссылки запускает проверку доступности. Кнопка «Проверить все ссылки» запускает проверку всех ссылок.
5. Статус ссылки — отображается как «Доступен» или «Недоступен». Для файлов — доступен, если локальная копия существует.
6. Генерация QR-кода — кнопка «QR» показывает QR-код, ведущий на /redirect/{id}. Можно скачать QR-код в PNG.
7. Редактирование заглушки — кнопка «Заглушка» открывает визуальный редактор HTML-страницы, которая показывается, если ссылка недоступна.
8. Редактирование глобального шаблона — задаёт внешний вид заглушки для новых ссылок.
9. Настройки — позволяют изменить Base URL, интервал проверки, интервал повторных уведомлений и SMTP-параметры. Кнопка «Отправить тестовое письмо» проверяет SMTP.
10. Смена пароля — безопасное обновление пароля администратора.

## Favicon

В папке public уже лежит favicon.svg. Вы можете заменить его на свой. Если используете ICO-файл, поместите его как favicon.ico и измените ссылку в index.html.

## Структура проекта

 .
 ├── server.js           # Основной сервер (Express)
 ├── package.json        # Зависимости и скрипты
 ├── config.json         # Настройки (логин, пароль, SMTP, интервалы)
 ├── url.json            # Данные (теги и ссылки)
 ├── default.html        # Глобальный шаблон заглушки
 ├── public/             # Статические файлы
 │   ├── index.html      # HTML-разметка панели управления
 │   ├── style.css       # Стили
 │   ├── main.js         # Клиентский JavaScript
 │   └── favicon.svg     # Иконка сайта
 ├── redirects/          # Сгенерированные редиректы и заглушки
 │   └── {имя_тега}/
 │    └── {id_ссылки}/
 │     ├── redirect.html # HTML-редирект на URL
 │     └── index.html    # HTML-заглушка (если недоступен)
 └── uploads/            # Загруженные изображения для редактора
  └── {id_ссылки или global}/

## Безопасность

- Пароль хранится в виде bcrypt-хеша в config.json.
- Все API-маршруты защищены сессией (express-session).
- Рекомендуется использовать HTTPS в production.
- Для production смените секретный ключ сессии в server.js на свой.

## Лицензия

MIT

## Контакты

Автор: NoIDXMV6 / pavel@kozhevatov.ru
