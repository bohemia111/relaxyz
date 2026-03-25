
// simplified server: no longer signs nostr events
// acts only as optional future API

import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
