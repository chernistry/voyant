# Vectara RAG Setup Guide

## 1. Настройка Vectara Account

1. Зайдите на https://console.vectara.com/
2. Создайте аккаунт или войдите
3. Создайте 3 корпуса:
   - `navan-airlines` (для авиакомпаний)
   - `navan-hotels` (для отелей) 
   - `navan-visas` (для виз)

## 2. Получение API ключей

1. В консоли Vectara перейдите в **API Keys**
2. Создайте новый API ключ с правами:
   - `query` (для поиска)
   - `index` (для загрузки документов)
3. Скопируйте:
   - API Key
   - Customer ID
   - Corpus IDs для каждого корпуса

## 3. Настройка Environment Variables

Скопируйте `.env.example` в `.env` и заполните:

```bash
cp .env.example .env
```

Обновите в `.env`:
```bash
# Vectara Configuration
VECTARA_API_KEY=vtr-xxx-your-api-key-here
VECTARA_CUSTOMER_ID=your-customer-id
VECTARA_CORPUS_AIRLINES=airlines-corpus-id
VECTARA_CORPUS_HOTELS=hotels-corpus-id
VECTARA_CORPUS_VISAS=visas-corpus-id
POLICY_RAG=on
```

## 4. Загрузка тестовых документов

Запустите скрипт загрузки:

```bash
npm run ingest-policies
```

Это загрузит тестовые документы:

### Airlines корпус:
- `united-baggage.txt` - политика багажа United Airlines
- `delta-cancellation.txt` - политика отмены Delta

### Hotels корпус:
- `marriott-cancellation.txt` - политика отмены Marriott
- `hilton-checkin.txt` - политика заселения Hilton

### Visas корпус:
- `usa-esta.txt` - требования ESTA для США
- `schengen-requirements.txt` - требования Шенген

## 5. Тестирование функционала

Запустите тестовые запросы:

```bash
npm run test-vectara
```

Или протестируйте вручную через CLI:

```bash
npm run cli
```

Примеры запросов:
- "What is United baggage allowance?"
- "Delta cancellation policy within 24 hours"
- "Marriott hotel cancellation fee"
- "Do I need visa for Europe from USA?"

## 6. Проверка через API

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is United carry-on baggage size limit?", "threadId": "test1"}'
```

## Troubleshooting

### Ошибка "vectara_disabled"
- Проверьте `VECTARA_API_KEY` в `.env`
- Убедитесь что `POLICY_RAG=on`

### Ошибка "vectara_corpus_missing"  
- Проверьте corpus IDs в `.env`
- Убедитесь что корпуса созданы в консоли

### Ошибка "host_not_allowed"
- `api.vectara.io` уже добавлен в allowlist
- Проверьте что используете правильный BASE_URL

### Пустые результаты
- Убедитесь что документы загружены (`npm run ingest-policies`)
- Проверьте в консоли Vectara что документы индексированы
- Попробуйте более простые запросы

## Структура файлов

```
data/policies/
├── airlines/
│   ├── united-baggage.txt
│   └── delta-cancellation.txt
├── hotels/
│   ├── marriott-cancellation.txt
│   └── hilton-checkin.txt
└── visas/
    ├── usa-esta.txt
    └── schengen-requirements.txt

scripts/
├── vectara-ingest.ts    # Загрузка документов
└── vectara-test.ts      # Тестирование запросов
```
