# Deploy this app to a VPS with PM2 + Nginx Proxy Manager

This project is a Next.js app plus a separate Socket.IO server. In production, do not run `npm run dev`.

Use:
- PM2 for the two Node processes
- Nginx Proxy Manager for HTTPS and reverse proxying

## 1) Install the server dependencies

On your VPS:

```bash
sudo apt update
sudo apt install -y curl git build-essential ca-certificates

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g pm2
```

## 2) Clone the repo and install dependencies

```bash
cd /var/www
sudo git clone https://github.com/your-user/rally.git
cd /var/www/rally
sudo chown -R $USER:$USER /var/www/rally
npm ci
```

> Keep devDependencies installed because the build step uses Next.js tooling.

## 3) Prepare production environment variables

Create a production env file for the Socket.IO server:

```bash
cat > /var/www/rally/.env.production <<'EOF'
NODE_ENV=production
PORT=5501
CLIENT_ORIGIN=https://app.example.com
EOF
```

Then build the app with the public Socket URL set:

```bash
cd /var/www/rally
NEXT_PUBLIC_SERVER_URL=https://socket.example.com npm run build
```

If you do not want a dedicated socket subdomain, use the same host for both the app and the socket server and proxy them separately under the same domain.

## 4) Create PM2 config

Create `/var/www/rally/ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: "rally-web",
      cwd: "/var/www/rally",
      script: "npx",
      args: "next start -p 5500",
      env: {
        NODE_ENV: "production",
        PORT: "5500",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
    {
      name: "rally-socket",
      cwd: "/var/www/rally",
      script: "npx",
      args: "tsx server/index.ts",
      env: {
        NODE_ENV: "production",
        PORT: "5501",
        CLIENT_ORIGIN: "https://app.example.com",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
    },
  ],
};
```

Start the processes:

```bash
cd /var/www/rally
pm2 start ecosystem.config.js
pm2 save
pm2 status
```

If you want PM2 to auto-start after reboot:

```bash
pm2 startup
```

Then copy and run the generated command it prints.

## 5) Configure Nginx Proxy Manager

Add these proxy hosts in Nginx Proxy Manager.

### A) App host

- Domain: `app.example.com`
- Scheme: `http`
- Forward Hostname: `127.0.0.1`
- Forward Port: `5500`
- Enable: Websockets
- SSL: Let's Encrypt

### B) Socket host

- Domain: `socket.example.com`
- Scheme: `http`
- Forward Hostname: `127.0.0.1`
- Forward Port: `5501`
- Enable: Websockets
- SSL: Let's Encrypt

This gives you:
- `https://app.example.com` → Next.js app
- `https://socket.example.com` → Socket.IO server

## 6) Make the app use the correct backend URL

Your client code defaults to:

```ts
process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000"
```

In production, set it when building and deploying:

```bash
export NEXT_PUBLIC_SERVER_URL=https://socket.example.com
npm run build
```

Then restart the web process:

```bash
pm2 restart rally-web
```

## 7) Health / sanity checks

Check the app:

```bash
curl -I https://app.example.com
```

Check the socket server:

```bash
curl -I https://socket.example.com
```

You should also confirm the app itself is listening on port 5500 and the socket server on 5501:

```bash
ss -tulpn | grep -E '5500|5501'
```

PM2 status:

```bash
pm2 status
pm2 logs rally-web --lines 50
pm2 logs rally-socket --lines 50
```

## 8) Common gotchas

- `npm run dev` is only for local development. Do not use it in production.
- `CLIENT_ORIGIN` in the socket server must match the browser-facing app origin exactly.
- If you proxy the socket server under the same domain as the web app, make sure the socket path and CORS settings are aligned.
- If the app loads but multiplayer does not connect, verify `NEXT_PUBLIC_SERVER_URL` and the `CLIENT_ORIGIN` env values match the real deployed domains.

## 9) One-line restart workflow

```bash
cd /var/www/rally
pm2 restart all
```

## 10) Recommended production setup

For a clean production deployment, the usual pattern is:

- `https://app.example.com` → port `3000` (Next.js)
- `https://socket.example.com` → port `4000` (Socket.IO)
- PM2 manages both processes
- Nginx Proxy Manager handles TLS and proxying

This is the easiest stable setup for a game like this on a VPS.
