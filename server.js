import express from 'express';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '2mb' }));

const csvHeader = [
  'consigner_type',
  'consigner_name',
  'consigner_address1',
  'consigner_address2',
  'consigner_postcode',
  'consigner_city',
  'consigner_country_code',
  'consigner_zone_code',
  'consigner_contact',
  'consigner_phone',
  'consignee_type',
  'consignee_name',
  'consignee_address1',
  'consignee_address2',
  'consignee_postcode',
  'consignee_city',
  'consignee_country_code',
  'consignee_zone_code',
  'consignee_contact',
  'consignee_phone',
  'notification_value',
  'shipment_1_type',
  'shipment_1_quantity',
  'shipment_1_weight',
  'shipment_1_weight_class',
  'shipment_1_length',
  'shipment_1_width',
  'shipment_1_height',
  'shipment_1_length_class',
  'email_shipping_docs',
  'reference',
  'receiver_notification_email'
];

function clean(value) {
  return String(value ?? '')
    .replace(/;/g, ',')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function first(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '') ?? '';
}

function nested(source, paths) {
  for (const keyPath of paths) {
    const value = keyPath.split('.').reduce((current, key) => current?.[key], source);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function findOrder(payload) {
  return payload.order || payload.data || payload.resource || payload;
}

function buildCsv(payload) {
  const order = findOrder(payload);
  const customer = order.customer || order.billing_address || order.billing || {};
  const shipping = order.shipping_address || order.delivery_address || order.shipping || order.delivery || customer;

  const reference = first(
    order.reference,
    order.order_number,
    order.number,
    order.id,
    payload.id
  );

  const company = first(
    nested(shipping, ['company', 'company_name', 'organization']),
    nested(customer, ['company', 'company_name', 'organization'])
  );

  const fullName = first(
    nested(shipping, ['name', 'full_name']),
    [shipping.first_name, shipping.last_name].filter(Boolean).join(' '),
    nested(customer, ['name', 'full_name']),
    [customer.first_name, customer.last_name].filter(Boolean).join(' '),
    order.customer_name,
    order.name
  );

  const consigneeType = company ? 'company' : 'individual';
  const consigneeName = company || fullName;
  const contact = fullName || company;
  const email = first(
    nested(shipping, ['email']),
    nested(customer, ['email']),
    order.email,
    order.customer_email
  );
  const phone = first(
    nested(shipping, ['phone', 'telephone', 'mobile']),
    nested(customer, ['phone', 'telephone', 'mobile']),
    order.phone,
    order.customer_phone
  );

  const row = [
    process.env.CONSIGNER_TYPE || 'company',
    process.env.CONSIGNER_NAME || 'Microcement Stockholm AB',
    process.env.CONSIGNER_ADDRESS1 || 'Vikingavägen 19',
    process.env.CONSIGNER_ADDRESS2 || '',
    process.env.CONSIGNER_POSTCODE || '14148',
    process.env.CONSIGNER_CITY || 'Huddinge',
    process.env.CONSIGNER_COUNTRY_CODE || 'SE',
    '',
    process.env.CONSIGNER_CONTACT || 'Daniel Örberg',
    process.env.CONSIGNER_PHONE || '0708243456',
    consigneeType,
    consigneeName,
    first(nested(shipping, ['address1', 'address', 'street']), nested(customer, ['address1', 'address', 'street'])),
    first(nested(shipping, ['address2', 'care_of']), nested(customer, ['address2', 'care_of'])),
    first(nested(shipping, ['postcode', 'postal_code', 'zip']), nested(customer, ['postcode', 'postal_code', 'zip'])),
    first(nested(shipping, ['city']), nested(customer, ['city'])),
    first(nested(shipping, ['country_code', 'countryCode']), nested(customer, ['country_code', 'countryCode']), 'SE'),
    '',
    contact,
    phone,
    phone || email,
    process.env.DEFAULT_SHIPMENT_TYPE || 'parcel',
    process.env.DEFAULT_SHIPMENT_QUANTITY || '1',
    process.env.DEFAULT_SHIPMENT_WEIGHT || '1',
    'kg',
    process.env.DEFAULT_SHIPMENT_LENGTH || '30',
    process.env.DEFAULT_SHIPMENT_WIDTH || '30',
    process.env.DEFAULT_SHIPMENT_HEIGHT || '10',
    'cm',
    process.env.EMAIL_SHIPPING_DOCS || process.env.MAIL_TO || '',
    `Quickbutik order ${reference}`,
    email
  ];

  return csvHeader.join(';') + '\n' + row.map(clean).join(';') + '\n';
}

function assertSecret(req) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return;

  const provided = req.get('x-webhook-secret') || req.query.secret;
  if (provided !== secret) {
    const error = new Error('Wrong webhook secret');
    error.status = 401;
    throw error;
  }
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

app.get('/', (req, res) => {
  res.send('Shiplink mail webhook is running.');
});

app.post('/quickbutik/order', async (req, res, next) => {
  try {
    assertSecret(req);

    const csv = buildCsv(req.body);
    const order = findOrder(req.body);
    const reference = clean(first(order.reference, order.order_number, order.number, order.id, req.body.id, crypto.randomUUID()));
    const filename = `shiplink-${reference || Date.now()}.csv`.replace(/[^a-z0-9_.-]+/gi, '-');

    await fs.mkdir('outbox', { recursive: true });
    await fs.writeFile(path.join('outbox', filename), '\ufeff' + csv, 'utf8');

    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_TO,
      subject: `Shiplink CSV - Quickbutik order ${reference}`,
      text: [
        'En ny Quickbutik-order har tagits emot.',
        '',
        'CSV-filen ligger bifogad och kan laddas upp i Shiplink:',
        'Systemintegration -> CSV Import -> Ladda upp CSV-fil',
        '',
        'Välj helst "Importera som utkast" först.'
      ].join('\n'),
      attachments: [
        {
          filename,
          content: '\ufeff' + csv,
          contentType: 'text/csv; charset=utf-8'
        }
      ]
    });

    res.json({ ok: true, filename });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ ok: false, error: error.message });
});

app.listen(port, () => {
  console.log(`Shiplink mail webhook listening on port ${port}`);
});
