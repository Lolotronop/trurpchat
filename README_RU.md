# Trurpchat

<p align="center">
  <a href="README.md">English</a> · <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <strong><a href="https://github.com/lolotronop/trurpchat/releases">скачать</a></strong>
  ·
  <strong><a href="#запуск-с-docker">запустить</a></strong>
</p>

Trurpchat — это трушный и простой чат для Windows, который просто развернуть самому

Среди опенсорсных решений я не нашел чего-то, что закрывало бы мои потребности, поэтому сел писать свое — на Tauri, Svelte и Rust для стриминга

Текущие возможности:

- Голосовой чат с камерами
- Качественная демонстрация экрана
- Горячие клавиши
- Обработка звука с gate, gain и compressor
- Текстовый чат
- Роли и права доступа
- Пользовательские темы

Планируется:

- Поддержка загрузки изображений/файлов
- Аватары

## Текущий статус

Trurpchat сейчас находится в альфа-состоянии, и разработка на какое-то время поставлена на паузу. Я лично использую его со своей группой друзей, но полировать тут еще много чего

Бэкенд можно запустить локально через Bun или через Docker. Для медиа-стриминга Trurpchat использует [OvenMediaEngine](https://ovenmedialabs.com/docs/ome), для NAT traversal в продакшене стоит настроить TURN/STUN через что-то вроде [coturn](https://github.com/coturn/coturn/wiki). Docker-пример уже включает OvenMediaEngine, но не coturn

### Запуск с Docker

Склонируйте репозиторий, затем запустите Docker compose:

```bash
git clone https://github.com/lolotronop/trurpchat.git
cd trurpchat/backend
docker compose -f docker-compose.example.yml up --build
```

Это запускает:

- бэкенд Trurpchat на порту `3000`
- OvenMediaEngine с RTMP ingest на `1935`
- OvenMediaEngine WebRTC signaling/playback на `3333`
- UDP-порты OvenMediaEngine `10000-10009`

Для всего, что выходит за рамки локального тестирования, скопируйте и настройте `backend/docker-compose.example.yml`:

- установите `OVEN_HOST` и `OME_HOST_IP` в публичный IP/DNS-адрес, по которому клиенты будут обращаться к вашему серверу
- замените `backend/ice.json.example` на вашу собственную ICE/TURN-конфигурацию
- следуйте документации OvenMediaEngine для деталей деплоя: <https://ovenmediaengine.com/docs/>
- следуйте документации coturn для настройки TURN/STUN: <https://github.com/coturn/coturn/wiki>

### Запуск только с Bun

Склонируйте репозиторий, затем установите зависимости из корня репозитория:

```bash
git clone https://github.com/lolotronop/trurpchat.git
cd trurpchat
bun install
```

Скопируйте конфиги:

```bash
cd backend
cp .env.example .env
cp ice.json.example ice.json
```

Отредактируйте `backend/.env` под ваше окружение. Как минимум убедитесь, что задан `DATABASE_URL`. Если вы используете OvenMediaEngine, настройте:

```env
OVEN_HOST=example.com
OVEN_WATCH_PORT=3333  # стандартный websocket-порт
OVEN_STREAM_PORT=1935 # стандартный порт RTMP ingest
OVEN_APP_NAME=app     # стандартное имя приложения в ovenmediaengine
OVEN_SECURE=false     # сейчас я не форсю https
ICE_CONFIG_FILE=ice.json
```

Затем запустите бэкенд:

```bash
bun run index.ts
```

При запуске только с Bun вам нужно самостоятельно предоставить OvenMediaEngine, если нужна поддержка стриминга. Смотрите документацию OvenMediaEngine по настройке: <https://ovenmedialabs.com/docs/ome>. Для надёжной работы голоса/видео вне LAN также настройте coturn и укажите ваши TURN/STUN-серверы в `ice.json`: <https://github.com/coturn/coturn/wiki>.

Пример `backend/ice.json` с пользовательским TURN-сервером на `example.com`:

```json
{
  "iceServers": [
    {
      "urls": [
        "stun:example.com:3478",
        "turn:example.com:3478?transport=udp",
        "turn:example.com:3478?transport=tcp",
      ],
      "username": "trurpchat-user",
      "credential": "replace-with-your-turn-password"
    }
  ]
}
```

Замените username и credential на значения из вашей конфигурации coturn. Если вы используете другой TURN-порт или TLS-настройку, обновите `urls` под ваш сервер.
