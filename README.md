# Shiplink mail-webhook för Quickbutik

Det här är enklaste automatiska varianten:

Quickbutik webhook -> liten server -> Shiplink CSV via e-post

Servern bokar ingen frakt. Den skapar bara en CSV-fil som kan laddas upp i Shiplink.

## Så fungerar flödet

1. En ny order skapas i Quickbutik.
2. Quickbutik skickar ordern till serverns webhook.
3. Servern gör om ordern till Shiplinks CSV-format.
4. Servern mejlar CSV-filen till dig.
5. Du laddar upp CSV-filen i Shiplink.
6. Välj "Importera som utkast" först.

## Webhook i Quickbutik

Skapa en webhook med:

- Titel: Shiplink CSV mail
- Länkadress: `https://DIN-SERVERADRESS/quickbutik/order`
- Event: `order.new`

Om du använder hemlig nyckel kan du sätta samma värde i `WEBHOOK_SECRET`.

## Miljövariabler

Kopiera `.env.example` och fyll i SMTP-uppgifter:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`
- `MAIL_TO`

För One.com används normalt:

- `SMTP_HOST=send.one.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=din e-postadress`
- `SMTP_PASS=e-postkontots lösenord`

Skriv inte lösenordet i chatt. Lägg in det som hemlig miljövariabel på servern.

## Köra lokalt

```bash
npm install
npm start
```

För att Quickbutik ska kunna nå servern behövs en publik adress, till exempel Render, Railway, Vercel, Pipedream eller liknande.

## Enkel hosting med Render

Filen `render.yaml` är förberedd för Render.

1. Lägg upp denna mapp som ett GitHub-repo.
2. Logga in på Render.
3. Skapa en ny "Blueprint" från repot.
4. Fyll i hemliga värden:
   - `SMTP_PASS`
   - `WEBHOOK_SECRET`
5. När tjänsten är startad får du en adress, till exempel:
   `https://quickbutik-shiplink-mail.onrender.com`
6. Webhook-URL i Quickbutik blir:
   `https://quickbutik-shiplink-mail.onrender.com/quickbutik/order?secret=DIN_HEMLIGA_NYCKEL`

## Standardvärden

Avsändare är förifylld som:

- Microcement Stockholm AB
- Vikingavägen 19
- 14148 Huddinge

Standardgods:

- Paket
- 1 kg
- 30 x 30 x 10 cm

Det går att ändra via miljövariabler:

- `DEFAULT_SHIPMENT_TYPE`
- `DEFAULT_SHIPMENT_WEIGHT`
- `DEFAULT_SHIPMENT_LENGTH`
- `DEFAULT_SHIPMENT_WIDTH`
- `DEFAULT_SHIPMENT_HEIGHT`
