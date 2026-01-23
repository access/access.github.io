# BlackLampa (bl) — структура модификации

**Точка входа:** `lampa/plugins/modification.js` (только bootstrapping).

**Порядок выполнения (как раньше):** `auth` → `preload` → `autoplugin`.

## Файлы

- `lampa/plugins/bl.auth.js` — авторизация (UI перенесён без переписывания) + чтение `lampa/plugins/mod.auth.json`.
- `lampa/plugins/bl.preload.js` — одноразовый preload `localStorage` из `lampa/plugins/bl.preload.json`.
- `lampa/plugins/bl.autoplugin.js` — установка/включение/инъекция плагинов + Settings UI; читает `lampa/plugins/bl.autoplugin.json`; включает guards + network-policy.
- `lampa/plugins/bl.storage.guards.js` — `lsGet/lsSet/lsDel` + guard `plugins_blacklist` (wipe/guard/watchdog).
- `lampa/plugins/bl.policy.network.js` — блок сетевых запросов + override `CUB blacklist` (fetch/XHR/beacon/ws).
- `lampa/plugins/bl.ui.log.js` — popup-лог + mirror в `console`.
- `lampa/plugins/bl.core.js` — общие утилиты (без бизнес-логики).

## Конфиги (JSON)

- `lampa/plugins/bl.autoplugin.json` — `plugins[]` (активные) и `disabled[]` (lossless: все URL, которые были закомментированы в исходном списке).
- `lampa/plugins/bl.preload.json` — `{ meta, storage }`, где `storage` — карта ключей/значений для preload в `localStorage`.

## Бэкапы

- `lampa/plugins/modification.monolith.js.bak` — прежний монолитный entrypoint.
- `lampa/plugins/modification-preload.json.bak` — прежний preload JSON.

